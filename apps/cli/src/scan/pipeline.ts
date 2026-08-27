/**
 * Static description of the Shannon scan pipeline, plus the worker types the CLI
 * reads back from Temporal.
 *
 * The CLI cannot import from the worker package, so this mirrors it. Keep in sync with:
 *   - apps/worker/src/types/agents.ts        (agent names / ordering)
 *   - apps/worker/src/session-manager.ts     (phase membership)
 *   - apps/worker/src/temporal/activities.ts (the run*Agent activity names → `activityType`)
 *   - apps/worker/src/temporal/shared.ts     (PipelineState / PipelineSummary)
 *   - apps/worker/src/types/metrics.ts       (AgentMetrics)
 *   - apps/worker/src/types/run-state.ts     (PartialReasonView)
 */

export interface AgentSpec {
  /** Canonical agent name as it appears in PipelineState.completedAgents / agentMetrics. */
  readonly name: string;
  /** Short label for the progress tree. */
  readonly label: string;
  /** Temporal activity type name — how a running agent shows up in pendingActivities. */
  readonly activityType: string;
}

export interface PhaseSpec {
  readonly key: string;
  readonly label: string;
  readonly parallel: boolean;
  readonly agents: readonly AgentSpec[];
}

export interface ActivityProgressSpec {
  readonly key: string;
  readonly label: string;
  readonly kind: 'agent' | 'operation';
  /**
   * Operation rows whose work is already represented by a persisted parent stage. The parent
   * owns the row; this activity supplies the step shown as its detail. Parent stage keys are
   * the family key itself or the family key followed by ':' and a class or stage suffix.
   */
  readonly parentKey?: string;
}

/** The pipeline phases in execution order, each with its agents. */
export const PIPELINE: readonly PhaseSpec[] = [
  {
    // Preflight login check. Only authenticated scans record metrics here; a non-auth scan
    // records none, so it renders as skipped — like Exploitation when nothing is exploitable.
    key: 'auth-validation',
    label: 'Authentication',
    parallel: false,
    agents: [{ name: 'validate-authentication', label: 'auth', activityType: 'runAuthenticationValidation' }],
  },
  {
    key: 'pre-recon',
    label: 'Pre-Recon',
    parallel: false,
    agents: [{ name: 'pre-recon', label: 'pre-recon', activityType: 'runPreReconAgent' }],
  },
  {
    key: 'recon',
    label: 'Recon',
    parallel: false,
    agents: [{ name: 'recon', label: 'recon', activityType: 'runReconAgent' }],
  },
  {
    key: 'vulnerability-analysis',
    label: 'Vulnerability Analysis',
    parallel: true,
    agents: [
      { name: 'injection-vuln', label: 'injection', activityType: 'runInjectionVulnAgent' },
      { name: 'xss-vuln', label: 'xss', activityType: 'runXssVulnAgent' },
      { name: 'auth-vuln', label: 'auth', activityType: 'runAuthVulnAgent' },
      { name: 'ssrf-vuln', label: 'ssrf', activityType: 'runSsrfVulnAgent' },
      { name: 'authz-vuln', label: 'authz', activityType: 'runAuthzVulnAgent' },
    ],
  },
  {
    key: 'exploitation',
    label: 'Exploitation',
    parallel: true,
    agents: [
      { name: 'injection-exploit', label: 'injection', activityType: 'runInjectionExploitAgent' },
      { name: 'xss-exploit', label: 'xss', activityType: 'runXssExploitAgent' },
      { name: 'auth-exploit', label: 'auth', activityType: 'runAuthExploitAgent' },
      { name: 'ssrf-exploit', label: 'ssrf', activityType: 'runSsrfExploitAgent' },
      { name: 'authz-exploit', label: 'authz', activityType: 'runAuthzExploitAgent' },
    ],
  },
  {
    key: 'reporting',
    label: 'Reporting',
    parallel: false,
    agents: [{ name: 'report', label: 'report', activityType: 'runReportAgent' }],
  },
];

const MISCELLANEOUS_EXPLOIT_AGENT: AgentSpec = {
  name: 'miscellaneous-exploit',
  label: 'miscellaneous',
  activityType: 'runMiscellaneousExploitAgent',
};

/**
 * Shape the static PIPELINE to one scan's durable truth. expectedAgents, persisted by the
 * worker at scan start, names every exploit agent the scan can ever run: exploit rows it
 * excludes are dropped, 'miscellaneous-exploit' is appended only once the miscellaneous pipeline has
 * admitted findings, and a phase left with no agents disappears entirely. Without state
 * (the scan has not initialized durable state yet) the full static pipeline is the best
 * available guess.
 */
export function pipelineForState(state: PipelineState | null): readonly PhaseSpec[] {
  if (state?.expectedAgents === undefined) return PIPELINE;
  const expected = new Set(state.expectedAgents);
  return PIPELINE.map((phase) => {
    if (phase.key !== 'exploitation') return phase;
    const agents = phase.agents.filter((agent) => expected.has(agent.name));
    if (expected.has(MISCELLANEOUS_EXPLOIT_AGENT.name)) agents.push(MISCELLANEOUS_EXPLOIT_AGENT);
    return { ...phase, agents };
  }).filter((phase) => phase.agents.length > 0);
}

const AGENT_ACTIVITY_PROGRESS: Readonly<Record<string, ActivityProgressSpec>> = Object.fromEntries(
  [...PIPELINE.flatMap((phase) => phase.agents), MISCELLANEOUS_EXPLOIT_AGENT].map((agent) => [
    agent.activityType,
    { key: agent.name, label: agent.label, kind: 'agent' },
  ]),
);

/** Families whose per-class or per-stage work is already carried by one persisted stage row. */
const RECONCILIATION_PARENT_KEY = 'reconciliation';
const AGENTIC_SAST_PARENT_KEY = 'agentic-sast';

// Every production activity that is not an agent run must have a row here. describeScan
// throws on an unmapped activity type, so adding a worker activity without updating this
// table breaks `shannon status` loudly instead of hiding the new work. The authoritative
// name lists live in apps/worker/src/temporal/worker.ts,
// apps/worker/src/temporal/reconcile-activity-types.ts, and
// apps/worker/src/ai/sast/capella/temporal/activity-types.ts.
const OPERATION_ACTIVITY_PROGRESS: Readonly<Record<string, ActivityProgressSpec>> = {
  runPreflightValidation: { key: 'preflight', label: 'Preflight validation', kind: 'operation' },
  syncPlaywrightStealthConfig: { key: 'preflight', label: 'Browser setup', kind: 'operation' },
  initDeliverableGit: { key: 'scan-initialization', label: 'Initialize deliverables', kind: 'operation' },
  syncCodePathDenyRules: { key: 'scan-initialization', label: 'Apply source rules', kind: 'operation' },
  initializeDurableScanState: { key: 'durable-state', label: 'Saving scan state', kind: 'operation' },
  persistMiscellaneousOutcome: {
    key: 'miscellaneous-pipeline',
    label: 'Including miscellaneous findings',
    kind: 'operation',
  },
  initializeReportProgress: { key: 'report:initialize', label: 'Initialize report state', kind: 'operation' },
  renumberClassFindings: { key: 'report:renumber', label: 'Renumber findings', kind: 'operation' },
  assembleReportActivity: { key: 'report:assemble', label: 'Assemble report inputs', kind: 'operation' },
  compactReportFindings: { key: 'report:compact', label: 'Compact report findings', kind: 'operation' },
  persistCanonicalReportProgress: { key: 'report:checkpoint', label: 'Saving report progress', kind: 'operation' },
  finalizeReportOutputs: { key: 'report:finalize', label: 'Finalize report outputs', kind: 'operation' },
  persistFinalizedReportProgress: { key: 'report:terminal', label: 'Saving final report state', kind: 'operation' },
  surfaceReportOutputs: { key: 'report:surface', label: 'Surface customer report', kind: 'operation' },
  checkExploitationQueue: { key: 'queue-check', label: 'Check exploitation queue', kind: 'operation' },
  loadResumeState: { key: 'resume-validation', label: 'Validate resume state', kind: 'operation' },
  restoreGitCheckpoint: { key: 'resume-restore', label: 'Restore checkpoint', kind: 'operation' },
  registerResumeAttempt: { key: 'resume-registration', label: 'Register resume', kind: 'operation' },
  recordResumeAttempt: { key: 'resume-registration', label: 'Record resume', kind: 'operation' },
  logPhaseTransition: { key: 'audit-log', label: 'Update audit log', kind: 'operation' },
  logWorkflowComplete: { key: 'audit-log', label: 'Finalize audit log', kind: 'operation' },
  saveCheckpoint: { key: 'checkpoint', label: 'Save checkpoint', kind: 'operation' },
  seedEmptyProducerQueue: {
    key: 'miscellaneous-pipeline',
    label: 'Preparing miscellaneous findings',
    kind: 'operation',
  },
  prepareClassReconciliation: {
    key: 'reconciliation',
    label: 'Preparing findings',
    kind: 'operation',
    parentKey: RECONCILIATION_PARENT_KEY,
  },
  enrichClassSastObservations: {
    key: 'reconciliation',
    label: 'Adding code context',
    kind: 'operation',
    parentKey: RECONCILIATION_PARENT_KEY,
  },
  formClassExploitTasks: {
    key: 'reconciliation',
    label: 'Grouping into test cases',
    kind: 'operation',
    parentKey: RECONCILIATION_PARENT_KEY,
  },
  materializeClassExploitTasks: {
    key: 'reconciliation',
    label: 'Writing test cases',
    kind: 'operation',
    parentKey: RECONCILIATION_PARENT_KEY,
  },
  publishClassReconciliationOss: {
    key: 'reconciliation',
    label: 'Saving results',
    kind: 'operation',
    parentKey: RECONCILIATION_PARENT_KEY,
  },
  capellaArchitecture: {
    key: 'agentic-sast:architecture',
    label: 'Mapping architecture',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaThreatModel: {
    key: 'agentic-sast:threat-model',
    label: 'Modelling threats',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaPlan: {
    key: 'agentic-sast:plan',
    label: 'Planning the review',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaResearch: {
    key: 'agentic-sast:research',
    label: 'Researching code',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaDedupe: {
    key: 'agentic-sast:dedupe',
    label: 'Merging duplicates',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaReview: {
    key: 'agentic-sast:review',
    label: 'Reviewing findings',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaCritic: {
    key: 'agentic-sast:critic',
    label: 'Critiquing findings',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaConfirm: {
    key: 'agentic-sast:confirm',
    label: 'Confirming findings',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaCalibrate: {
    key: 'agentic-sast:calibrate',
    label: 'Calibrating risk',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
  capellaExport: {
    key: 'agentic-sast:export',
    label: 'Exporting findings',
    kind: 'operation',
    parentKey: AGENTIC_SAST_PARENT_KEY,
  },
};

/** Complete production activity mirror. Unknown names are errors, never hidden progress. */
export const ACTIVITY_TO_PROGRESS: Readonly<Record<string, ActivityProgressSpec>> = Object.freeze({
  ...AGENT_ACTIVITY_PROGRESS,
  ...OPERATION_ACTIVITY_PROGRESS,
});

/** Agent-only projection of ACTIVITY_TO_PROGRESS: activity type name to canonical agent name. */
export const ACTIVITY_TO_AGENT: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(ACTIVITY_TO_PROGRESS)
    .filter(([, progress]) => progress.kind === 'agent')
    .map(([activityType, progress]) => [activityType, progress.key]),
);

/** The vuln/exploit class of an agent (e.g. "authz-vuln" → "authz"), for failedPipelines matching. */
export function agentClass(name: string): string {
  return name.replace(/-(vuln|exploit)$/, '');
}

// === Worker types read back from Temporal (mirror of shared.ts / metrics.ts) ===

export interface AgentMetrics {
  readonly durationMs: number;
  readonly costUsd: number | null;
  readonly numTurns: number | null;
  readonly model?: string;
  readonly skipped?: boolean;
}

export interface OperationalStageState {
  readonly key: string;
  readonly label: string;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  readonly startedAt?: number;
  readonly durationMs?: number;
  readonly error?: string;
}

/** Family key a persisted operational stage belongs to, e.g. `reconciliation:xss` to `reconciliation`. */
export function operationFamilyKey(stageKey: string): string {
  const separator = stageKey.indexOf(':');
  return separator === -1 ? stageKey : stageKey.slice(0, separator);
}

export interface PipelineSummary {
  readonly totalCostUsd: number;
  readonly totalDurationMs: number; // Wall-clock (end - start)
  readonly totalTurns: number;
  readonly agentCount: number;
  /** False when operational (Capella/reconciliation) spend is known to be incomplete. */
  readonly usageAccountingComplete?: boolean;
}

/** One durable degradation reason with its derived safe message (mirror of PartialReasonView). */
export interface PartialReasonView {
  readonly code: string;
  readonly vulnerabilityClass?: string;
  readonly stage?: string;
  readonly message: string;
}

export type PipelineStatus = 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';

export interface PipelineState {
  readonly status: PipelineStatus;
  readonly currentPhase: string | null;
  readonly currentAgent: string | null;
  readonly completedAgents: string[];
  readonly expectedAgents?: string[];
  readonly participatingClasses?: string[];
  readonly failedPipelines: { vulnType: string; error: string }[];
  readonly failedReconciliations?: { vulnerabilityClass: string; error: string }[];
  readonly failedAgent: string | null;
  readonly error: string | null;
  readonly startTime: number;
  readonly agentMetrics: Record<string, AgentMetrics>;
  readonly operationalMetrics?: Record<string, AgentMetrics>;
  readonly operationalStages?: Record<string, OperationalStageState>;
  /** `error` is the worker's sanitized failure sentence, safe to print verbatim. */
  readonly agenticSast?: {
    readonly status: string;
    readonly durationMs?: number;
    /** Reader-facing name of the failed stage, already projected by the worker. */
    readonly failedStageLabel?: string;
    readonly error?: string;
    readonly errorCode?: string;
  };
  readonly nonFatalFailures?: { readonly phase: string; readonly error: string }[];
  /** Ordered durable degradation reasons with safe messages; empty or absent for full success. */
  readonly partialReasons?: readonly PartialReasonView[];
  readonly summary: PipelineSummary | null;
}
