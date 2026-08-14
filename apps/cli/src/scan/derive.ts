/**
 * Pure derivation of a scan's per-agent and per-phase state from its Temporal snapshot.
 *
 * This is the single source of truth for "what state is each agent in" — both the
 * human progress tree (render.ts) and the machine-readable snapshot (status-json.ts)
 * consume it, so the two views can never disagree about whether an agent is running,
 * skipped, or still pending. No glyphs, no color, no formatting live here.
 */

import type { RunningAgent } from '../temporal-client.js';
import { agentClass, PIPELINE, type PipelineState } from './pipeline.js';
import type { RenderInput } from './render.js';

export type RunState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** One agent's resolved state plus the raw metrics/timing a consumer needs to present it. Null metrics
 *  mean the value doesn't apply to the current state (e.g. duration/cost only for completed agents). */
export interface DerivedAgent {
  readonly name: string;
  readonly label: string;
  readonly state: RunState;
  readonly durationMs: number | null;
  readonly costUsd: number | null;
  readonly runningElapsedMs: number | null;
  readonly attempt: number | null;
  readonly error?: string;
}

export interface DerivedPhase {
  readonly key: string;
  readonly label: string;
  readonly parallel: boolean;
  readonly state: RunState;
  readonly agents: readonly DerivedAgent[];
}

/** Terminal = anything other than an open, running execution. */
export function isTerminal(status: string): boolean {
  return status !== 'RUNNING' && status !== 'UNSPECIFIED';
}

function isFailedAgent(name: string, state: PipelineState | null): boolean {
  return !!state && (state.failedAgent === name || state.failedPipelines.some((f) => f.vulnType === agentClass(name)));
}

/** An agent has entered play once it is running, has metrics, or has failed. */
function isAgentActive(name: string, state: PipelineState | null, running: Set<string>): boolean {
  return running.has(name) || !!state?.agentMetrics[name] || isFailedAgent(name, state);
}

/**
 * Resolve one agent's state. "Ran" is signalled by a metrics entry, not by
 * completedAgents — the workflow lists conditionally-skipped agents (e.g. exploit
 * agents when there is nothing to exploit) as completed but records no metrics for
 * them. `resolved` is true once we've moved past this agent's phase (the scan is
 * terminal, or a later phase is already active), at which point a metric-less,
 * non-running agent is skipped rather than still pending.
 */
function agentState(name: string, state: PipelineState | null, running: Set<string>, resolved: boolean): RunState {
  if (running.has(name)) return 'running';
  if (isFailedAgent(name, state)) return 'failed';
  if (state?.agentMetrics[name]) return 'completed';
  return resolved ? 'skipped' : 'pending';
}

function agentError(name: string, state: PipelineState | null, byAgent: Map<string, RunningAgent>): string | undefined {
  const failed = state?.failedPipelines.find((f) => f.vulnType === agentClass(name));
  return (
    failed?.error ??
    byAgent.get(name)?.lastFailure ??
    (state?.failedAgent === name ? (state.error ?? undefined) : undefined)
  );
}

/** Scan wall-clock elapsed ms: recorded duration for a closed scan, live elapsed for a running one. */
export function scanElapsedMs(input: RenderInput, now: number): number | undefined {
  if (isTerminal(input.temporalStatus)) {
    if (input.state?.summary) return input.state.summary.totalDurationMs;
    if (input.endedAt !== undefined && input.startedAt !== undefined) return input.endedAt - input.startedAt;
    return undefined;
  }
  return input.startedAt !== undefined ? now - input.startedAt : undefined;
}

/** Total cost in USD: the summary when present, otherwise the sum of per-agent costs. */
export function totalCostUsd(state: PipelineState | null): number | undefined {
  if (state?.summary) return state.summary.totalCostUsd;
  if (!state) return undefined;
  const values = Object.values(state.agentMetrics).map((m) => m.costUsd ?? 0);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
}

/** Collapse a phase's agent states into a single state for the phase line. */
export function phaseGlyphState(states: readonly RunState[]): RunState {
  if (states.some((s) => s === 'running')) return 'running';
  if (states.some((s) => s === 'failed')) return 'failed';
  if (states.every((s) => s === 'skipped')) return 'skipped';
  if (states.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  if (states.some((s) => s === 'completed')) return 'running';
  return 'pending';
}

/**
 * Compute each agent's RunState. This is the drift-prone part shared by every view.
 *
 * The pipeline is sequential across phases: the last phase with any active agent is the
 * frontier. Earlier phases with nothing active were skipped (e.g. exploitation when no
 * class had anything to exploit), not still pending.
 */
export function deriveAgentStates(input: RenderInput): Map<string, RunState> {
  const runningSet = new Set(input.running.map((r) => r.agent));
  const terminal = isTerminal(input.temporalStatus);

  let frontier = -1;
  PIPELINE.forEach((phase, idx) => {
    if (phase.agents.some((a) => isAgentActive(a.name, input.state, runningSet))) frontier = idx;
  });

  const states = new Map<string, RunState>();
  for (const [phaseIdx, phase] of PIPELINE.entries()) {
    const resolved = terminal || phaseIdx < frontier;
    for (const agent of phase.agents) {
      states.set(agent.name, agentState(agent.name, input.state, runningSet, resolved));
    }
  }
  return states;
}

/**
 * Full structured view of the pipeline: every agent's state plus the raw
 * metrics/timing needed to present it, and each phase's collapsed state.
 */
export function derivePipeline(input: RenderInput, now: number): DerivedPhase[] {
  const states = deriveAgentStates(input);
  const byAgent = new Map(input.running.map((r) => [r.agent, r]));

  return PIPELINE.map((phase) => {
    const agents = phase.agents.map((a): DerivedAgent => {
      const state = states.get(a.name) ?? 'pending';
      const metrics = input.state?.agentMetrics[a.name];
      const runner = byAgent.get(a.name);
      const error = agentError(a.name, input.state, byAgent);
      return {
        name: a.name,
        label: a.label,
        state,
        durationMs: state === 'completed' && metrics ? metrics.durationMs : null,
        costUsd: state === 'completed' ? (metrics?.costUsd ?? null) : null,
        runningElapsedMs: state === 'running' && runner?.startedAt !== undefined ? now - runner.startedAt : null,
        attempt: state === 'running' && runner ? runner.attempt : null,
        ...(error !== undefined && { error }),
      };
    });

    return {
      key: phase.key,
      label: phase.label,
      parallel: phase.parallel,
      state: phaseGlyphState(agents.map((ag) => ag.state)),
      agents,
    };
  });
}

export { agentError };
