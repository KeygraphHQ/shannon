/**
 * Action -> tool-input bridge, and the gated real-execution path it feeds.
 *
 * `HuntAction` only ever carries a coarse `ActionKind` (passive-recon,
 * active-recon, js-intelligence, behavioral-diff) and a bare `targetRef`
 * string — it has no idea whether the tool that ends up running is
 * subfinder or amass, httpx or naabu, each of which wants a differently
 * shaped, strongly-typed input (`ToolAdapter<TInput>` in `tools/registry.ts`
 * is generic precisely because these inputs are heterogeneous).
 * `buildInputFromAction` is the one place that translates a generic action
 * into one specific adapter's exact input, by name, never through untyped
 * string concatenation into a shell command — every adapter in
 * `recon/cli-adapters.ts` already runs via `execFile` with a structured
 * argument array, so this bridge only ever has to produce a plain object,
 * never a command line.
 *
 * `executeActionViaRegistry` is the full gate chain `pipeline/adaptive-loop.ts`
 * calls when live recon is explicitly enabled (`AdaptiveHuntInput.liveRecon`
 * — see that module): scope -> authorization -> policy (risk) ->
 * buildInputFromAction -> tool capability -> rate limit -> `adapter.run()`.
 * Every outcome is reported as one `ExecutionStatus` (types.ts) so a caller
 * can never mistake a blocked/unavailable/mocked action for a genuine
 * execution.
 */

import { ToolRateLimiter } from '../reasoning/policy.js';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import { classifyDiscoveryScope } from '../recon/scope-tagging.js';
import { DEFAULT_PREFERRED_TOOL_NAMES } from '../tools/default-registry.js';
import type { ToolAdapter, ToolRegistry } from '../tools/registry.js';
import {
  type ExecutionStatus,
  err,
  type HuntAction,
  type HuntBudget,
  type Observation,
  ok,
  type ProgramScope,
  type RawDiscovery,
  type Result,
  type ScopeStatus,
} from '../types.js';

export interface BuildInputContext {
  readonly engagementId: string;
  /** Required to select FfufAdapter — omitted, ffuf is never chosen. */
  readonly wordlistPath?: string;
  readonly nucleiSeverity?: string;
  /** Required to select AmassAdapter — modern Amass writes to a directory, not stdout (see cli-adapters.ts). */
  readonly amassOutputDir?: string;
  /** Required to select BehavioralTestAdapter, keyed by the action's targetRef. */
  readonly behavioralAuthStatesByAsset?: ReadonlyMap<string, AuthStateHeaders>;
}

function hostFromTargetRef(targetRef: string): string {
  try {
    return new URL(targetRef).hostname;
  } catch {
    return targetRef;
  }
}

function urlFromTargetRef(targetRef: string): string {
  try {
    return new URL(targetRef).toString();
  } catch {
    return `https://${targetRef}`;
  }
}

const DOMAIN_ONLY_TOOLS = new Set(['subfinder', 'chaos', 'gau', 'waybackurls', 'certificate-transparency']);

/**
 * Builds the exact typed input one named adapter needs from a generic
 * `HuntAction`. Pure and synchronous — it never checks tool availability or
 * scope (that is `executeActionViaRegistry`'s job) — so every supported
 * shape can be tested directly against a bare action, with no process
 * spawned and no network touched.
 */
export function buildInputFromAction(
  toolName: string,
  action: HuntAction,
  ctx: BuildInputContext,
): Result<unknown, string> {
  if (DOMAIN_ONLY_TOOLS.has(toolName)) {
    return ok({ domain: hostFromTargetRef(action.targetRef) });
  }

  switch (toolName) {
    case 'amass': {
      if (!ctx.amassOutputDir) return err('amass requires an output directory (BuildInputContext.amassOutputDir)');
      return ok({ domain: hostFromTargetRef(action.targetRef), outputDir: ctx.amassOutputDir });
    }
    case 'httpx':
    case 'katana':
      return ok({ url: urlFromTargetRef(action.targetRef) });
    case 'naabu':
      return ok({ host: hostFromTargetRef(action.targetRef) });
    case 'ffuf': {
      if (!ctx.wordlistPath) return err('ffuf requires a wordlist path (BuildInputContext.wordlistPath)');
      // ffuf substitutes the wordlist into the literal "FUZZ" keyword in the URL — it errors outright without one.
      const base = urlFromTargetRef(action.targetRef).replace(/\/$/, '');
      return ok({ url: `${base}/FUZZ`, wordlistPath: ctx.wordlistPath });
    }
    case 'nuclei':
      return ok({
        url: urlFromTargetRef(action.targetRef),
        engagementId: ctx.engagementId,
        ...(ctx.nucleiSeverity !== undefined ? { severity: ctx.nucleiSeverity } : {}),
      });
    case 'js-collector':
      return ok({
        pageUrl: urlFromTargetRef(action.targetRef),
        assetRef: action.targetRef,
        engagementId: ctx.engagementId,
      });
    case 'behavioral-test': {
      const headersByState = ctx.behavioralAuthStatesByAsset?.get(action.targetRef);
      if (!headersByState) {
        return err(
          `behavioral-test requires configured auth-state headers for "${action.targetRef}" (BuildInputContext.behavioralAuthStatesByAsset)`,
        );
      }
      return ok({
        endpointUrl: urlFromTargetRef(action.targetRef),
        assetRef: action.targetRef,
        engagementId: ctx.engagementId,
        headersByState,
      });
    }
    default:
      return err(`no input-building rule registered for tool "${toolName}"`);
  }
}

export interface LiveReconOptions extends BuildInputContext {
  readonly registry: ToolRegistry;
  readonly rateLimiter?: ToolRateLimiter;
  /** Overrides `DEFAULT_PREFERRED_TOOL_NAMES` per action kind — an entry here replaces only that kind's default list, never the whole table, so overriding one kind never starves every other kind of its default adapter. */
  readonly preferredToolNames?: Readonly<Record<string, readonly string[]>>;
  /** Defense in depth alongside each adapter's own `risk` rating; every shipped adapter is 'none'/'low'/'medium', so this only ever matters for a caller-registered custom adapter. */
  readonly allowHighRisk?: boolean;
}

export interface LiveReconExecutionResult {
  readonly status: ExecutionStatus;
  readonly toolName: string | undefined;
  readonly summary: string;
  readonly discoveries: readonly RawDiscovery[];
  readonly observations: readonly Observation[];
  readonly scopeDecision: ScopeStatus;
  readonly waitedMs: number | undefined;
}

function blocked(status: ExecutionStatus, summary: string, scopeDecision: ScopeStatus): LiveReconExecutionResult {
  return {
    status,
    toolName: undefined,
    summary,
    discoveries: [],
    observations: [],
    scopeDecision,
    waitedMs: undefined,
  };
}

/**
 * The full real-execution gate chain for one non-Shannon action: scope ->
 * authorization -> policy (risk) -> [for each preferred adapter, in order]
 * buildInputFromAction -> capability -> rate limit -> `run()`. The first
 * adapter that both builds valid input and reports itself capable is the
 * one that runs; if none do, the result is `UNAVAILABLE` and every
 * candidate's rejection reason is folded into `summary`.
 *
 * Never called for a `shannon` action — that action kind keeps its own
 * dedicated, separately-confirmed path in `pipeline/adaptive-loop.ts`.
 */
export async function executeActionViaRegistry(
  action: HuntAction,
  program: ProgramScope,
  budget: HuntBudget,
  options: LiveReconOptions,
): Promise<LiveReconExecutionResult> {
  const scopeDecision = classifyDiscoveryScope(program, 'asset', action.targetRef);
  if (scopeDecision === 'out-of-scope') {
    return blocked('BLOCKED_BY_SCOPE', `"${action.targetRef}" is out of scope; live execution refused`, scopeDecision);
  }

  if (!program.authorizationConfirmed) {
    return blocked(
      'BLOCKED_BY_POLICY',
      'program authorization is not confirmed; live execution refused',
      scopeDecision,
    );
  }

  // Per-kind override, not wholesale replacement: a caller overriding one action kind's preference
  // (e.g. to pin "active-recon" to a single fast tool in a test) must not silently lose the defaults
  // for every other kind it did not mention.
  const preferred = options.preferredToolNames?.[action.kind] ?? DEFAULT_PREFERRED_TOOL_NAMES[action.kind] ?? [];
  if (preferred.length === 0) {
    return blocked('UNAVAILABLE', `no adapter is registered for action kind "${action.kind}"`, scopeDecision);
  }

  const rateLimiter = options.rateLimiter ?? new ToolRateLimiter();
  const rejections: string[] = [];

  for (const name of preferred) {
    const adapter = options.registry.get(name);
    if (!adapter) continue;

    if (adapter.risk === 'high' && !options.allowHighRisk) {
      rejections.push(`${name}: risk "high" is not allowed without allowHighRisk`);
      continue;
    }

    const inputResult = buildInputFromAction(name, action, options);
    if (!inputResult.ok) {
      rejections.push(`${name}: ${inputResult.error}`);
      continue;
    }

    const capability = await adapter.capability();
    if (!capability.available) {
      rejections.push(`${name}: ${capability.reason}`);
      continue;
    }

    const wait = await rateLimiter.waitForTurn(name, budget.perToolMinIntervalMs);
    const erased = adapter as unknown as ToolAdapter<unknown>;
    try {
      const result = await erased.run(inputResult.value);
      const hasResults = result.discoveries.length > 0 || result.observations.length > 0;
      return {
        status: result.ok ? (hasResults ? 'EXECUTED_WITH_RESULTS' : 'EXECUTED_NO_RESULTS') : 'FAILED',
        toolName: name,
        summary: result.summary,
        discoveries: result.discoveries,
        observations: result.observations,
        scopeDecision,
        waitedMs: wait.waitedMs,
      };
    } catch (error) {
      return {
        status: 'FAILED',
        toolName: name,
        summary: `${name} threw: ${(error as Error).message}`,
        discoveries: [],
        observations: [],
        scopeDecision,
        waitedMs: wait.waitedMs,
      };
    }
  }

  return blocked(
    'UNAVAILABLE',
    rejections.length > 0
      ? `no capable adapter for "${action.kind}" on "${action.targetRef}": ${rejections.join('; ')}`
      : `no adapter for "${action.kind}" is registered in the supplied registry`,
    scopeDecision,
  );
}
