/**
 * ReasoningProvider abstraction.
 *
 * A provider only ever *proposes* — it never touches the world model, a
 * tool, or the network on the controller's behalf. `pipeline/adaptive-loop.ts`
 * runs every proposal through `reasoning/policy.ts:evaluateProposal` before
 * anything executes: the proposal must match a real, currently-queued
 * action built from the real world model (never an arbitrary or
 * hallucinated target/hypothesis id) and must fit the configured budget.
 *
 * Two real implementations exist: `HeuristicReasoningProvider` (a
 * deterministic wrapper around `reasoning/hypothesis.ts`/`reasoning/actions.ts` —
 * this is the always-available fallback, not a stub) and
 * `ClaudeReasoningProvider` (a real Anthropic Messages API call, used only
 * when `ANTHROPIC_API_KEY` is configured). `reasoning/router.ts` decides
 * which runs, and falls back to the heuristic provider if the model-backed
 * one errors or returns something that fails schema validation.
 */

import type { ActionProposal, HypothesisProposal, Observation, ReasoningSource, WorldModelSnapshot } from '../types.js';

export interface ReasoningProvider {
  readonly source: ReasoningSource;
  /** Proposes the single next-best action given the current world-model snapshot, or undefined if nothing is worth investigating. */
  selectNextBestAction(snapshot: WorldModelSnapshot): Promise<ActionProposal | undefined>;
  /** Proposes hypotheses from a batch of new observations. */
  generateHypotheses(
    observations: readonly Observation[],
    engagementId: string,
  ): Promise<readonly HypothesisProposal[]>;
}
