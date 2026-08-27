/**
 * Pure derivation of a scan's per-agent and per-phase state from its Temporal snapshot.
 *
 * This is the single source of truth for "what state is each agent in" — both the
 * human progress tree (render.ts) and the machine-readable snapshot (status-json.ts)
 * consume it, so the two views can never disagree about whether an agent is running,
 * skipped, or still pending. No glyphs, no color, no formatting live here.
 */

import type { RunningAgent } from '../temporal-client.js';
import {
  agentClass,
  type OperationalStageState,
  operationFamilyKey,
  type PipelineState,
  pipelineForState,
} from './pipeline.js';
import type { RenderInput } from './render.js';
import { safeFailureDetail, safeOperationKey, safeOperationLabel } from './safe-fields.js';

export type RunState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** One agent's resolved state plus the raw metrics/timing a consumer needs to present it. Null metrics
 *  mean the value doesn't apply to the current state (e.g. duration only for completed agents). */
export interface DerivedAgent {
  readonly name: string;
  readonly label: string;
  readonly state: RunState;
  readonly durationMs: number | null;
  readonly runningElapsedMs: number | null;
  readonly attempt: number | null;
  /** The step a running operation row is currently on, merged in from its child activity. */
  readonly detail?: string;
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
 * Resolve one agent's state. "Ran" is signalled by a metrics entry: a
 * conditionally-skipped agent (e.g. an exploit agent when there is nothing to
 * exploit) records no metrics, and the workflow tracks it in skippedAgents rather
 * than completedAgents. `resolved` is true once we've moved past this agent's phase
 * (the scan is terminal, or a later phase is already active), at which point a
 * metric-less, non-running agent is skipped rather than still pending.
 */
function agentState(name: string, state: PipelineState | null, running: Set<string>, resolved: boolean): RunState {
  if (running.has(name)) return 'running';
  if (isFailedAgent(name, state)) return 'failed';
  if (state?.agentMetrics[name]) return 'completed';
  return resolved ? 'skipped' : 'pending';
}

/**
 * Only `failed`'s presence is used here, never its `.error` text: that string is the
 * worker's raw error for the failed class, not vetted for display, so it is reduced to
 * a boolean before reaching safeFailureDetail's fixed sentence.
 */
function agentError(name: string, state: PipelineState | null, byAgent: Map<string, RunningAgent>): string | undefined {
  const failed = state?.failedPipelines.find((f) => f.vulnType === agentClass(name));
  const hasFailure =
    failed !== undefined || byAgent.get(name)?.lastFailure !== undefined || state?.failedAgent === name;
  return safeFailureDetail(hasFailure);
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
  const pipeline = pipelineForState(input.state);
  const runningSet = new Set(input.running.filter((runner) => runner.kind === 'agent').map((runner) => runner.agent));
  const terminal = isTerminal(input.temporalStatus);

  let frontier = -1;
  pipeline.forEach((phase, idx) => {
    if (phase.agents.some((a) => isAgentActive(a.name, input.state, runningSet))) frontier = idx;
  });

  const states = new Map<string, RunState>();
  for (const [phaseIdx, phase] of pipeline.entries()) {
    const resolved = terminal || phaseIdx < frontier;
    for (const agent of phase.agents) {
      states.set(agent.name, agentState(agent.name, input.state, runningSet, resolved));
    }
  }
  return states;
}

/** Which operation families have a running parent stage, and the step to show on it. */
interface OperationFamilyView {
  /** Families whose parent stage row already represents their child activities. */
  readonly runningFamilies: ReadonlySet<string>;
  /** Family to current step, present only where the child activities agree on one. */
  readonly stepByFamily: ReadonlyMap<string, string>;
}

/**
 * Resolve the parent stage rows that own their family's child activities. A family only
 * resolves to a step when its running children agree: several classes reconcile at once and
 * their pending activities carry no class, so a family caught mid-stride shows its parent
 * rows without a step rather than attributing one to the wrong class.
 */
function operationFamilyView(
  running: readonly RunningAgent[],
  persistedOperations: readonly OperationalStageState[],
): OperationFamilyView {
  const runningFamilies = new Set(
    persistedOperations
      .filter((operation) => operation.status === 'running')
      .map((operation) => operationFamilyKey(operation.key)),
  );

  const labelsByFamily = new Map<string, Set<string>>();
  for (const runner of running) {
    if (runner.kind !== 'operation' || runner.parentKey === undefined) continue;
    if (!runningFamilies.has(runner.parentKey)) continue;
    const labels = labelsByFamily.get(runner.parentKey) ?? new Set<string>();
    labels.add(runner.label);
    labelsByFamily.set(runner.parentKey, labels);
  }

  const stepByFamily = new Map<string, string>();
  for (const [family, labels] of labelsByFamily) {
    const [onlyLabel] = labels;
    if (labels.size === 1 && onlyLabel !== undefined) stepByFamily.set(family, lowercaseFirst(onlyLabel));
  }
  return { runningFamilies, stepByFamily };
}

/** Progress labels are written to start a row; as a detail they continue a sentence. */
function lowercaseFirst(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/**
 * Full structured view of the pipeline: every agent's state plus the raw
 * metrics/timing needed to present it, and each phase's collapsed state.
 */
export function derivePipeline(input: RenderInput, now: number): DerivedPhase[] {
  const states = deriveAgentStates(input);
  const byAgent = new Map(input.running.map((r) => [r.agent, r]));
  const pipeline = pipelineForState(input.state);

  const agentPhases = pipeline.map((phase) => {
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

  // Operational rows merge two sources: stages the worker has persisted (durable truth,
  // including terminal outcomes) and pending activities whose stage record has not landed
  // yet. Persisted keys win, so a stage is never listed twice while the two views overlap.
  const persistedOperations = Object.values(input.state?.operationalStages ?? {});
  const persistedKeys = new Set(persistedOperations.map((operation) => operation.key));
  const { runningFamilies, stepByFamily } = operationFamilyView(input.running, persistedOperations);
  const unpersistedRunning = input.running
    .filter((runner) => runner.kind === 'operation' && !persistedKeys.has(runner.agent))
    // A child activity whose family already has a running parent stage is that stage's current
    // step, not separate work: the parent row below represents it, with the step as its detail
    // where the family's children agree on one. Without such a parent it keeps its own row.
    .filter((runner) => runner.parentKey === undefined || !runningFamilies.has(runner.parentKey))
    .map((runner) => ({
      key: runner.agent,
      label: runner.label,
      status: 'running' as const,
      ...(runner.startedAt !== undefined && { startedAt: runner.startedAt }),
      ...(runner.lastFailure !== undefined && { error: safeFailureDetail(true) }),
    }));
  const operationalAgents: DerivedAgent[] = [...persistedOperations, ...unpersistedRunning].map((operation) => {
    const runner = byAgent.get(operation.key);
    const operationState = operation.status as RunState;
    const persistedDurationMs = 'durationMs' in operation ? (operation.durationMs ?? null) : null;
    const detail = operationState === 'running' ? stepByFamily.get(operationFamilyKey(operation.key)) : undefined;
    return {
      name: safeOperationKey(operation.key),
      label: safeOperationLabel(operation.label),
      state: operationState,
      durationMs: operationState === 'completed' ? persistedDurationMs : null,
      runningElapsedMs:
        operationState === 'running' && operation.startedAt !== undefined ? now - operation.startedAt : null,
      attempt: operationState === 'running' ? (runner?.attempt ?? null) : null,
      ...(detail !== undefined && { detail }),
      ...(operation.error !== undefined && { error: safeFailureDetail(true) }),
    };
  });

  // The synthetic phase appears only when there is operational work to show, so a scan
  // with no recorded operational stages keeps the plain agent tree.
  if (operationalAgents.length === 0) return agentPhases;
  return [
    ...agentPhases,
    {
      key: 'operational-work',
      label: 'Background work',
      parallel: true,
      state: phaseGlyphState(operationalAgents.map((operation) => operation.state)),
      agents: operationalAgents,
    },
  ];
}

export { agentError };
