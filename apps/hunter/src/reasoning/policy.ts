/**
 * Deterministic policy gate.
 *
 * The only function allowed to turn a reasoning provider's *proposal* into
 * something that actually executes. An `ActionProposal` — from Claude or
 * the heuristic provider — is accepted only if it matches, field for
 * field, a real entry already in the current action queue (built straight
 * from the real world model by `reasoning/actions.ts:buildActionQueue`).
 * This is the hallucination guard: a model could otherwise invent a
 * plausible-looking target that was never actually discovered, or a
 * hypothesis id that does not exist, and this is what stops that from ever
 * reaching a tool. Budget checks happen here too, before scope/tool
 * execution is even attempted.
 */

import type { ActionProposal, HuntAction, HuntBudget } from '../types.js';

export interface PolicyContext {
  readonly candidateActions: readonly HuntAction[];
  readonly actionsSoFar: number;
  readonly shannonExecutionsSoFar: number;
  readonly elapsedMs: number;
  readonly budget: HuntBudget;
}

export interface PolicyDecision {
  readonly allowed: boolean;
  readonly reason: string;
  readonly action: HuntAction | undefined;
}

export function evaluateProposal(proposal: ActionProposal | undefined, ctx: PolicyContext): PolicyDecision {
  if (ctx.actionsSoFar >= ctx.budget.maxActions) {
    return {
      allowed: false,
      reason: `action budget exhausted (${ctx.actionsSoFar}/${ctx.budget.maxActions})`,
      action: undefined,
    };
  }
  if (ctx.elapsedMs >= ctx.budget.maxRuntimeMs) {
    return {
      allowed: false,
      reason: `runtime budget exhausted (${ctx.elapsedMs}ms >= ${ctx.budget.maxRuntimeMs}ms)`,
      action: undefined,
    };
  }
  if (!proposal) {
    return { allowed: false, reason: 'no action was proposed', action: undefined };
  }

  const matched = ctx.candidateActions.find(
    (a) => a.kind === proposal.kind && a.targetRef === proposal.targetRef && a.hypothesisId === proposal.hypothesisId,
  );
  if (!matched) {
    return {
      allowed: false,
      reason: `proposed action (${proposal.kind} on "${proposal.targetRef}" for hypothesis "${proposal.hypothesisId}") does not match any real queued action — rejected as a hallucination guard`,
      action: undefined,
    };
  }

  if (matched.kind === 'shannon' && ctx.shannonExecutionsSoFar >= ctx.budget.maxShannonExecutions) {
    return {
      allowed: false,
      reason: `Shannon execution budget exhausted (${ctx.shannonExecutionsSoFar}/${ctx.budget.maxShannonExecutions})`,
      action: undefined,
    };
  }

  return { allowed: true, reason: 'matches a real queued action and is within budget', action: matched };
}

export const DEFAULT_BUDGET: HuntBudget = {
  maxRounds: 20,
  maxActions: 50,
  maxRuntimeMs: 30 * 60 * 1000,
  maxShannonExecutions: 3,
  perToolMinIntervalMs: 1000,
};

/**
 * Real `perToolMinIntervalMs` enforcement, per tool name.
 *
 * This is the one place allowed to delay tool execution for rate limiting —
 * `pipeline/tool-bridge.ts` calls `waitForTurn` immediately before every
 * adapter `run()`, and nothing in the reasoning layer (heuristic or Claude)
 * can see or bypass it: a proposal only ever selects *which* action runs,
 * never *when*. Per-tool state is serialized through a promise chain, so
 * concurrent callers for the *same* tool queue up and wait their turn
 * (concurrency-safe), while different tools never block each other. `clock`
 * and `sleep` are injectable so tests can assert real enforcement — the
 * correct wait is actually computed and actually awaited — without a test
 * suite spending wall-clock time on it.
 */
export interface ToolRateLimiterOptions {
  readonly clock?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface RateLimitWaitResult {
  readonly tool: string;
  readonly waitedMs: number;
  readonly minIntervalMs: number;
}

export class ToolRateLimiter {
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly lastRunAt = new Map<string, number>();
  private readonly queues = new Map<string, Promise<void>>();

  constructor(options: ToolRateLimiterOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /**
   * Blocks the caller until at least `minIntervalMs` has elapsed since this
   * tool's last turn (0 the first time), then reserves this turn's start
   * time before resolving so a second concurrent caller queued behind it
   * waits from *this* turn, not the original one. Never called from a
   * reasoning provider — only from the deterministic execution path.
   */
  async waitForTurn(tool: string, minIntervalMs: number): Promise<RateLimitWaitResult> {
    const previous = this.queues.get(tool) ?? Promise.resolve();
    let waitedMs = 0;
    const turn = previous.then(async () => {
      const now = this.clock();
      const last = this.lastRunAt.get(tool);
      const elapsed = last === undefined ? Number.POSITIVE_INFINITY : now - last;
      waitedMs = Math.max(0, Math.min(minIntervalMs, minIntervalMs - elapsed));
      if (waitedMs > 0) {
        await this.sleep(waitedMs);
      }
      this.lastRunAt.set(tool, this.clock());
    });
    this.queues.set(tool, turn);
    await turn;
    return { tool, waitedMs, minIntervalMs };
  }
}
