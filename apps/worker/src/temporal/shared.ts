import { defineQuery, defineSignal } from '@temporalio/workflow';

export type { AgentMetrics } from '../types/metrics.js';

import type {
  AgenticSastReduction,
  CapellaFailurePoint,
  CapellaRecoveredFailure,
  CapellaStage,
  SarifRef,
} from '../ai/sast/types.js';
import type { VulnClass } from '../types/config.js';
import type { ErrorCode } from '../types/errors.js';
import type { AgentMetrics } from '../types/metrics.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import type {
  MiscellaneousOutcome,
  PartialReasonView,
  ReportProgress,
  ReportSarifDisposition,
  StoredPdfProvenance,
} from '../types/run-state.js';

/**
 * The serializable slice of Capella's configuration passed across the Temporal workflow
 * boundary into the child workflow input. Everything the workflow needs from the parsed
 * config or the model spec must be flattened into plain data here; the workflow sandbox
 * cannot carry functions or class instances across that boundary.
 */
export interface AgenticSastInput {
  readonly codePathAvoids: readonly string[];
  readonly codePathFocus: readonly string[];
  readonly modelSpec: string;
  readonly capellaFormatVersion: string;
  readonly promptSetVersion: string;
}

/**
 * The agentic SAST lifecycle as seen from the pentest workflow: not configured, running as a
 * child workflow, or one of two terminal outcomes. This is what the live `getProgress` query
 * and the terminal `PipelineState` both report, so a caller never needs to inspect the Capella
 * child workflow's own result type directly.
 */
export type AgenticSastState =
  | { readonly status: 'disabled' }
  | { readonly status: 'running'; readonly startedAt: number }
  | {
      readonly status: 'succeeded';
      readonly findingCount: number;
      readonly sarifSha256: string;
      readonly coverage: 'complete' | 'reduced';
      readonly warnings: readonly string[];
      readonly durationMs: number;
      readonly reductions?: readonly AgenticSastReduction[];
      readonly recoveredFailure?: CapellaRecoveredFailure;
    }
  | {
      readonly status: 'failed';
      readonly failedStage: CapellaFailurePoint;
      /** Reader-facing name of `failedStage`, projected once so no surface renders the slug. */
      readonly failedStageLabel: string;
      readonly error: string;
      /** Bounded machine code preserved from the failing Capella activity, when one crossed the child. */
      readonly errorCode?: string;
      readonly completedStages: readonly CapellaStage[];
      readonly warnings: readonly string[];
      readonly durationMs: number;
    };

export type OperationalStageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface OperationalStageState {
  readonly key: string;
  readonly label: string;
  readonly status: OperationalStageStatus;
  readonly startedAt?: number;
  readonly durationMs?: number;
  readonly error?: string;
}

export interface OperationalMetrics extends AgentMetrics {
  readonly usageComplete?: boolean;
}

/** A degradation the scan recorded and continued past, kept for the terminal summary log rather than for control flow. */
export interface NonFatalFailure {
  readonly phase: string;
  readonly error: string;
}

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  pipelineTestingMode?: boolean;
  workflowId?: string; // Used for audit correlation
  sessionId?: string; // Workspace directory name (distinct from workflowId for named workspaces)
  resumeFromWorkspace?: string; // Workspace name to resume from
  terminatedWorkflows?: string[]; // Workflows terminated during resume

  // Config fields — serializable, flow through to ActivityInput → getOrCreateContainer()
  configYAML?: string; // Raw YAML string (parsed in activity, not workflow — workflow sandbox can't use Node.js)
  deliverablesSubdir?: string; // Override deliverables path (default: '.shannon/deliverables')
  auditDir?: string; // Override audit log directory (default: './workspaces')
  promptDir?: string; // Override prompt template directory
  agenticSast?: AgenticSastInput;
  sastSarif?: SarifRef;
  customerOutputPath?: string; // Stable mounted path for final customer copies only
  checkpointsEnabled?: boolean; // Enable checkpoint activities (default: false)
  exploit?: boolean; // false skips the exploitation phase
}

/** What `loadResumeState` reconstructs from a prior workspace: independently verified, never assumed from session.json alone. */
export interface ResumeState {
  workspaceName: string;
  originalUrl: string;
  completedAgents: string[];
  checkpointHash: string;
  originalWorkflowId: string;
  expectedAgents: string[];
  participatingClasses: ReconciliationClass[];
  exploit: boolean;
  reportProgress?: ReportProgress;
  miscellaneousOutcome?: MiscellaneousOutcome;
}

/** The narrow view of the durable scan-state record the workflow needs to keep its own queryable state in sync. */
export interface DurableStateSummary {
  readonly exploit: boolean;
  readonly expectedAgents: readonly string[];
  readonly participatingClasses: readonly ReconciliationClass[];
  readonly reportStage: ReportProgress['stage'] | 'uninitialized';
  readonly miscellaneousOutcome?: MiscellaneousOutcome;
}

/** Common result shape for the deterministic report-processing activities (renumber, compaction). */
export interface ReconciliationActivityResult {
  readonly vulnerabilityClass?: ReconciliationClass;
  readonly skipped: boolean;
  readonly changedPathCount: number;
  readonly checkpoint?: string;
  readonly alreadyCommitted?: boolean;
}

export interface FinalizeReportActivityResult {
  readonly checkpoint: string;
  readonly manifestSha256: string;
  readonly changedPathCount: number;
  readonly alreadyCommitted: boolean;
  /** Adopted-or-produced SARIF disposition from the committed finalization manifest. */
  readonly sarifDisposition: ReportSarifDisposition;
  readonly pdfGenerated: boolean;
  /** Verified provenance for the current PDF bytes, or null when no trustworthy PDF exists. */
  readonly pdfProvenance: StoredPdfProvenance | null;
  readonly warningCount: number;
}

export interface AssembleReportActivityResult {
  /** Classes whose findings could not be included in the assembled report inputs. */
  readonly failedClasses: readonly ReconciliationClass[];
}

export interface SurfaceReportActivityResult {
  readonly surfaced: readonly string[];
  readonly removedStale: readonly string[];
  readonly warningCount: number;
}

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number; // Wall-clock time (end - start)
  totalTurns: number;
  /** Total resolved agents: those that ran plus those that were skipped. */
  agentCount: number;
  /** False when operational (Capella/reconciliation) spend is known to be incomplete. */
  usageAccountingComplete: boolean;
}

/**
 * The workflow's whole queryable and terminal state. The CLI cannot import this package, so
 * `apps/cli/src/scan/pipeline.ts` mirrors this shape (along with AgentMetrics and the
 * activity-name-to-agent map) by hand; a field added, renamed, or removed here needs the same
 * change there, or the CLI's status rendering silently falls out of sync with a running scan.
 */
export interface PipelineState {
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';
  currentPhase: string | null;
  currentAgent: string | null;
  /** Agents that actually ran. Mutually exclusive from `skippedAgents`. */
  completedAgents: string[];
  /** Expected agents that never ran because their class had nothing to exploit. */
  skippedAgents: string[];
  expectedAgents: string[];
  participatingClasses: ReconciliationClass[];
  // Vuln classes whose pipeline failed while at least one other succeeded. Drives the
  // partial terminal status so a crashed class isn't reported as if it fully passed.
  failedPipelines: { vulnType: VulnClass; error: string }[];
  failedReconciliations: { vulnerabilityClass: ReconciliationClass; error: string }[];
  failedAgent: string | null;
  error: string | null;
  errorCode?: ErrorCode;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  operationalMetrics: Record<string, OperationalMetrics>;
  operationalStages: Record<string, OperationalStageState>;
  agenticSast: AgenticSastState;
  nonFatalFailures: NonFatalFailure[];
  /** Ordered durable degradation reasons with derived safe messages; empty for a full success. */
  partialReasons: PartialReasonView[];
  reportProgress?: ReportProgress;
  summary: PipelineSummary | null;
}

// Extended state returned by getProgress query (includes computed fields)
export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
}

// Result from a single vuln→exploit pipeline
export interface VulnExploitPipelineResult {
  vulnType: VulnClass;
  vulnMetrics: AgentMetrics | null;
  exploitMetrics: AgentMetrics | null;
  exploitDecision: {
    shouldExploit: boolean;
    vulnerabilityCount: number;
  } | null;
  error: string | null;
}

export const getProgress = defineQuery<PipelineProgress>('getProgress');

/**
 * One Capella stage transition, reported by the SAST child workflow to its parent.
 *
 * Capella runs as a child workflow, so its activities never appear in the parent's
 * pending activities and the CLI cannot observe them. This signal is how per-stage
 * progress reaches the parent's durable `operationalStages`, which is what both the
 * live `getProgress` query and the terminal result render from.
 */
export interface CapellaStageProgress {
  readonly stage: CapellaStage;
  readonly status: 'running' | 'completed' | 'failed';
  readonly startedAt: number;
  readonly durationMs?: number;
}

export const capellaStageProgress = defineSignal<[CapellaStageProgress]>('capellaStageProgress');
