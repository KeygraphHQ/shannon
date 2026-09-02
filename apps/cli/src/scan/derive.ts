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
  AGENTIC_SAST_STAGE_ORDER,
  agentClass,
  isModelBackedOperation,
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
  /** Reconciliation time for this agent's class, rendered as a trailing `+ duration`.
   *  Reconciliation is model work that produces this agent's inputs, so it is shown
   *  attached to the agent it feeds rather than as free-floating background work. */
  readonly attachedMs?: number;
  /** This class's findings could not be grouped, so each one became its own task. */
  readonly ungrouped?: boolean;
  readonly error?: string;
}

/** How a phase line summarizes itself: its own wall time, or a k/N tally over its children. */
export type PhaseMetaKind = 'duration' | 'count';

export interface DerivedPhase {
  readonly key: string;
  readonly label: string;
  /** Whether the phase renders its agents as sub-rows. Independent of {@link meta}:
   *  Agentic SAST lists its stages under a duration, exploitation lists its classes under a tally. */
  readonly children: boolean;
  readonly meta: PhaseMetaKind;
  readonly state: RunState;
  /** The phase's own span, when the worker records one for the phase rather than for a single
   *  agent inside it (Agentic SAST). The phase line presents this exactly like an agent row. */
  readonly summary?: DerivedAgent;
  /** Rendered after the phase's summary, e.g. to mark work that overlaps other phases. */
  readonly note?: string;
  readonly agents: readonly DerivedAgent[];
}

/** Terminal = anything other than an open, running execution. */
export function isTerminal(status: string): boolean {
  return status !== 'RUNNING' && status !== 'UNSPECIFIED';
}

/**
 * Whether the class-level failure recorded for this agent's class applies to this agent.
 *
 * A class failure is recorded against the class as a whole, so it matches both of that class's
 * agents. A reconciliation failure, though, happens only after the analysis agent has already
 * succeeded, so it belongs to the exploitation lane: attributing it to the analysis row as well
 * would report an agent that completed as failed.
 */
function classFailureApplies(name: string, state: PipelineState | null): boolean {
  if (!state) return false;
  const vulnClass = agentClass(name);
  if (!state.failedPipelines.some((f) => f.vulnType === vulnClass)) return false;
  const reconciliationFailed = (state.failedReconciliations ?? []).some((r) => r.vulnerabilityClass === vulnClass);
  const isAnalysisAgent = name.endsWith('-vuln');
  return !(reconciliationFailed && isAnalysisAgent);
}

function isFailedAgent(name: string, state: PipelineState | null): boolean {
  return !!state && (state.failedAgent === name || classFailureApplies(name, state));
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
 * Only the presence of a class failure is used here, never its `.error` text: that string is
 * the worker's raw error for the failed class, not vetted for display, so it is reduced to
 * a boolean before reaching safeFailureDetail's fixed sentence.
 */
function agentError(name: string, state: PipelineState | null, byAgent: Map<string, RunningAgent>): string | undefined {
  const hasFailure =
    classFailureApplies(name, state) || byAgent.get(name)?.lastFailure !== undefined || state?.failedAgent === name;
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
      children: phase.parallel,
      meta: phase.parallel ? ('count' as const) : ('duration' as const),
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

  // Operational rows are not peers of the agents. Each one is either model work that
  // belongs to an agent (reconciliation), model work that belongs to the SAST engine
  // (its stages), or bookkeeping that only earns a row when it is stuck or broken.
  return assemblePhases(agentPhases, operationalAgents);
}

/** Reconciliation wall time per vulnerability class, plus the classes whose grouping degraded. */
interface ReconciliationView {
  readonly durationByClass: ReadonlyMap<string, number>;
  readonly ungroupedClasses: ReadonlySet<string>;
}

function reconciliationView(operations: readonly DerivedAgent[]): ReconciliationView {
  const durationByClass = new Map<string, number>();
  const ungroupedClasses = new Set<string>();
  for (const operation of operations) {
    if (operationFamilyKey(operation.name) !== 'reconciliation') continue;
    const [, vulnerabilityClass] = operation.name.split(':');
    if (vulnerabilityClass === undefined) continue;
    if (operation.name.endsWith(':fallback')) {
      ungroupedClasses.add(vulnerabilityClass);
      continue;
    }
    if (operation.durationMs !== null) durationByClass.set(vulnerabilityClass, operation.durationMs);
  }
  return { durationByClass, ungroupedClasses };
}

/** Attach each class's reconciliation time to the agent row it feeds. */
function withReconciliation(phase: DerivedPhase, view: ReconciliationView): DerivedPhase {
  const agents = phase.agents.map((agent): DerivedAgent => {
    const vulnerabilityClass = agentClass(agent.name);
    const attachedMs = view.durationByClass.get(vulnerabilityClass);
    const ungrouped = view.ungroupedClasses.has(vulnerabilityClass);
    return {
      ...agent,
      ...(attachedMs !== undefined && { attachedMs }),
      ...(ungrouped && { ungrouped }),
    };
  });
  return { ...phase, agents };
}

/**
 * Build the Agentic SAST phase from the aggregate span the parent workflow records and the
 * per-stage rows the SAST child signals up. Scans that predate stage signalling have the
 * aggregate but no stages, and render as a bare phase line rather than an error.
 */
function agenticSastPhase(operations: readonly DerivedAgent[]): DerivedPhase | undefined {
  const aggregate = operations.find((operation) => operation.name === 'agentic-sast');
  if (aggregate === undefined) return undefined;

  const byStage = new Map<string, DerivedAgent>();
  for (const operation of operations) {
    const [family, stage] = operation.name.split(':');
    if (family !== 'agentic-sast' || stage === undefined) continue;
    // The worker's label is the scan log's Title Case form. These rows sit beside the
    // lowercase class rows below them, so they read in the same register here.
    byStage.set(stage, { ...operation, label: lowercaseFirst(operation.label) });
  }
  // Run order, not insertion order: a resumed or replayed run can persist stages out of order.
  const stages = AGENTIC_SAST_STAGE_ORDER.map((stage) => byStage.get(stage)).filter(
    (stage): stage is DerivedAgent => stage !== undefined,
  );

  return {
    key: 'agentic-sast',
    label: 'Agentic SAST',
    children: stages.length > 0,
    meta: 'duration',
    state: aggregate.state,
    summary: aggregate,
    // It shares wall time with the pentest phases below it, so the times do not add up
    // in sequence. Saying so is cheaper than a layout that pretends to be two columns.
    note: 'concurrent',
    agents: stages,
  };
}

/**
 * Bookkeeping rows worth showing. A deterministic stage that has completed says nothing —
 * it can only ever read 0s — but one that is still running, or that failed, is exactly what
 * an operator needs to see, so those keep a row under the phase they belong to.
 */
function troubledReportSteps(operations: readonly DerivedAgent[]): readonly DerivedAgent[] {
  return operations.filter((operation) => {
    if (isModelBackedOperation(operation.name)) return false;
    if (operationFamilyKey(operation.name) !== 'report') return false;
    return operation.state === 'running' || operation.state === 'failed';
  });
}

/**
 * Fold operational rows into the agent phases. Nothing here becomes a bucket of its own:
 * every surviving row is either a SAST stage, time attached to an agent, or a report step
 * that is currently in trouble.
 */
function assemblePhases(agentPhases: readonly DerivedPhase[], operations: readonly DerivedAgent[]): DerivedPhase[] {
  const view = reconciliationView(operations);
  // Reconciliation produces the exploitation queue, so its time belongs on the exploitation
  // row it feeds. With exploitation off there is no such row, and it falls back to the
  // analysis row for the same class so the time is never silently dropped.
  const attachTo = agentPhases.some((phase) => phase.key === 'exploitation')
    ? 'exploitation'
    : 'vulnerability-analysis';
  const reportSteps = troubledReportSteps(operations);

  const phases = agentPhases.map((phase) => {
    if (phase.key === attachTo) return withReconciliation(phase, view);
    if (phase.key === 'reporting' && reportSteps.length > 0) {
      // The report agent stays on the phase line it already titles; the steps in trouble
      // become its children, so nothing is listed twice.
      const summary = phase.agents[0];
      return {
        ...phase,
        children: true,
        ...(summary !== undefined && { summary }),
        state: phaseGlyphState([...phase.agents, ...reportSteps].map((row) => row.state)),
        agents: reportSteps,
      };
    }
    return phase;
  });

  const sast = agenticSastPhase(operations);
  if (sast === undefined) return phases;

  // Agentic SAST starts with the scan and runs alongside the pentest, so it reads after
  // the login check rather than appended past Reporting where it never ran.
  const afterAuth = phases.findIndex((phase) => phase.key === 'auth-validation') + 1;
  return [...phases.slice(0, afterAuth), sast, ...phases.slice(afterAuth)];
}

export { agentError };
