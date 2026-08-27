// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Metrics Tracker
 *
 * Manages session.json with comprehensive timing, cost, and validation metrics.
 * Tracks attempt-level data for complete forensic trail.
 */

import { PentestError } from '../services/error-handling.js';
import { AGENT_PHASE_MAP, type PhaseName } from '../session-manager.js';
import { ErrorCode } from '../types/errors.js';
import type { AgentEndResult, AgentName } from '../types/index.js';
import type { AgentMetrics } from '../types/metrics.js';
import {
  appendPartialReasons,
  createInitialDurableScanState,
  type DurableScanState,
  isDurableScanState,
  isOrderedPartialReasonSet,
  type MiscellaneousOutcome,
  type PartialReason,
  type ReportProgress,
  type ReportSarifDisposition,
  RunStateError,
  recordMiscellaneousOutcome,
  type StoredPdfProvenance,
} from '../types/run-state.js';
import { atomicWrite, fileExists, readJson } from '../utils/file-io.js';
import { calculatePercentage, formatTimestamp } from '../utils/formatting.js';
import { mergeIntervalsDurationMs, type OperationalStageTiming } from './operational-summary.js';
import { safeErrorFromCode } from './safe-fields.js';
import { generateSessionJsonPath, type SessionMetadata } from './utils.js';

interface AttemptData {
  attempt_number: number;
  duration_ms: number;
  cost_usd: number;
  input_tokens?: number | undefined;
  output_tokens?: number | undefined;
  cache_read_tokens?: number | undefined;
  cache_write_tokens?: number | undefined;
  turns?: number | undefined;
  success: boolean;
  timestamp: string;
  model?: string | undefined;
  error?: string | undefined;
  error_code?: ErrorCode | undefined;
}

interface AgentAuditMetrics {
  status: 'in-progress' | 'success' | 'failed';
  attempts: AttemptData[];
  final_duration_ms: number;
  total_cost_usd: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_read_tokens: number;
  total_cache_write_tokens: number;
  model?: string | undefined;
  checkpoint?: string | undefined;
}

interface PhaseMetrics {
  duration_ms: number;
  duration_percentage: number;
  cost_usd: number;
  agent_count: number;
}

interface OperationalAuditMetrics {
  duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  turns: number;
  usage_complete: boolean;
}

/** One operational stage's wall-clock span, as persisted per run. */
interface StageSpan {
  started_at_ms: number;
  duration_ms: number;
}

/**
 * The stage families `total_operational_duration_ms` and the `background` phase are defined over:
 * agentic SAST and finding reconciliation. Report steps and the miscellaneous lane are pipeline
 * work, not operational spend, so their spans are excluded and those two fields keep the meaning
 * they document.
 */
const OPERATIONAL_STAGE_FAMILIES: readonly string[] = ['agentic-sast', 'reconciliation'];

function isOperationalStageKey(stageKey: string): boolean {
  return OPERATIONAL_STAGE_FAMILIES.some((family) => stageKey === family || stageKey.startsWith(`${family}:`));
}

interface TerminalRunMetrics {
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  started_at: string;
  ended_at: string;
  wall_duration_ms: number;
  usage_accounting_complete: boolean;
  /** Usage-accounting warnings for this run; always an array, empty when the ledger reconciled. */
  usage_accounting_warnings: string[];
}

/** One workflow's usage for a single operational metric key (an agentic-SAST stage, a reconciliation class). */
export interface WorkflowOperationalMetric {
  readonly durationMs: number;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly cacheReadTokens: number | null;
  readonly cacheWriteTokens: number | null;
  readonly costUsd: number | null;
  readonly numTurns: number | null;
  readonly usageComplete?: boolean;
}

/** The terminal projection recorded for one workflow execution, keyed by its retry-stable workflow id. */
export interface TerminalWorkflowMetricsInput {
  readonly status: TerminalRunMetrics['status'];
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly usageAccountingComplete: boolean;
  readonly usageAccountingWarnings: readonly string[];
  readonly operationalMetrics: Readonly<Record<string, WorkflowOperationalMetric>>;
  /**
   * Real wall-clock spans for this run's operational stages. Priced metrics carry no faithful
   * duration — a reconciliation stage's `StageMetrics` records cost and tokens only — so this is
   * the sole source of operational timing.
   */
  readonly operationalStages: Readonly<Record<string, OperationalStageTiming>>;
}

/** Workspace-wide totals recomputed across every recorded run, returned after a terminal metrics write. */
export interface TerminalWorkflowMetricTotals {
  readonly totalDurationMs: number;
  readonly totalCostUsd: number;
  readonly totalTurns: number;
  readonly runCount: number;
  readonly usageAccountingComplete: boolean;
}

/** One recorded resume of a workspace, with the prior workflows it terminated and the checkpoint it restored. */
export interface ResumeAttempt {
  workflowId: string;
  timestamp: string;
  terminatedPrevious?: string;
  resumedFromCheckpoint?: string;
}

interface SessionData {
  session: {
    id: string;
    webUrl: string;
    repoPath?: string;
    status: 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'partial';
    createdAt: string;
    completedAt?: string;
    originalWorkflowId?: string; // First workflow that created this workspace
    resumeAttempts?: ResumeAttempt[]; // Track all resume attempts
  };
  metrics: {
    total_duration_ms: number;
    total_agent_duration_ms?: number;
    /** Wall time attributed to operational (non-agent) work — agentic SAST and reconciliation. */
    total_operational_duration_ms?: number;
    total_cost_usd: number;
    total_turns?: number;
    usage_accounting_complete?: boolean;
    phases: Record<string, PhaseMetrics>;
    agents: Record<string, AgentAuditMetrics>;
    operational?: Record<string, Record<string, OperationalAuditMetrics>>;
    /** Operational stage spans per run, keyed by workflow id then stage key. */
    stages?: Record<string, Record<string, StageSpan>>;
    runs?: Record<string, TerminalRunMetrics>;
  };
  durableScanState?: DurableScanState;
}

interface ActiveTimer {
  startTime: number;
  attemptNumber: number;
}

/**
 * MetricsTracker - Manages metrics for a session
 */
export class MetricsTracker {
  private sessionMetadata: SessionMetadata;
  private sessionJsonPath: string;
  private data: SessionData | null = null;
  private activeTimers: Map<string, ActiveTimer> = new Map();

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionJsonPath = generateSessionJsonPath(sessionMetadata);
  }

  /**
   * Initialize session.json (idempotent)
   *
   * @param workflowId - Optional workflow ID to set as originalWorkflowId for new sessions
   */
  async initialize(workflowId?: string): Promise<void> {
    // Check if session.json already exists
    const exists = await fileExists(this.sessionJsonPath);

    if (exists) {
      // Load existing data
      this.data = await readJson<SessionData>(this.sessionJsonPath);
    } else {
      // Create new session.json
      this.data = this.createInitialData(workflowId);
      await this.save();
    }
  }

  /**
   * Create initial session.json structure
   *
   * @param workflowId - Optional workflow ID to set as originalWorkflowId
   */
  private createInitialData(workflowId?: string): SessionData {
    const sessionData: SessionData = {
      session: {
        id: this.sessionMetadata.id,
        webUrl: this.sessionMetadata.webUrl,
        status: 'in-progress',
        createdAt: (this.sessionMetadata as { createdAt?: string }).createdAt || formatTimestamp(),
        resumeAttempts: [],
      },
      metrics: {
        total_duration_ms: 0,
        total_agent_duration_ms: 0,
        total_operational_duration_ms: 0,
        total_cost_usd: 0,
        total_turns: 0,
        usage_accounting_complete: true,
        phases: {}, // Phase-level aggregations
        agents: {}, // Agent-level metrics
        operational: {},
        stages: {},
        runs: {},
      },
    };

    // Set originalWorkflowId if provided (for new workspaces)
    if (workflowId) {
      sessionData.session.originalWorkflowId = workflowId;
    }

    // Only add repoPath if it exists
    if (this.sessionMetadata.repoPath) {
      sessionData.session.repoPath = this.sessionMetadata.repoPath;
    }
    return sessionData;
  }

  /**
   * Start tracking an agent execution
   */
  startAgent(agentName: string, attemptNumber: number): void {
    this.activeTimers.set(agentName, {
      startTime: Date.now(),
      attemptNumber,
    });
  }

  /**
   * End agent execution and update metrics
   */
  async endAgent(agentName: string, result: AgentEndResult): Promise<void> {
    if (!this.data) {
      throw new PentestError(
        'MetricsTracker not initialized',
        'validation',
        false,
        {},
        ErrorCode.AGENT_EXECUTION_FAILED,
      );
    }

    // The report agent never reaches success through this ordinary path. Its model attempt is
    // recorded as a nonterminal draft, and only verified finalization promotes it to success,
    // so a success here would let an unfinalized report look complete.
    if (agentName === 'report' && result.success) {
      throw new RunStateError('DurableStateConflictError', 'report-success-requires-terminal-promotion');
    }

    const agent = this.appendAttempt(agentName, result);

    // 5. Update agent status based on outcome
    if (result.success) {
      agent.status = 'success';
      agent.final_duration_ms = result.duration_ms;

      // 6. Attach model and checkpoint metadata on success
      if (result.model) {
        agent.model = result.model;
      }

      if (result.checkpoint) {
        agent.checkpoint = result.checkpoint;
      }

      if (agentName === 'miscellaneous-exploit') {
        const durableState = this.requireDurableScanState();
        this.data.durableScanState = recordMiscellaneousOutcome(durableState, 'completed');
      }
    } else {
      // A non-final failed attempt stays in-progress (Temporal will retry); only the
      // terminal attempt (or an unqualified failure) marks the agent failed.
      agent.status = result.isFinalAttempt === false ? 'in-progress' : 'failed';
    }

    // 7. Clear active timer
    this.activeTimers.delete(agentName);

    // 8. Recalculate phase and session-level aggregations
    this.recalculateAggregations();

    // 9. Persist to session.json
    await this.save();
  }

  /** Initialize or validate the schema-1 state without reconstructing a missing resume record. */
  async initializeDurableScanState(exploit: boolean, context: 'fresh' | 'resume'): Promise<DurableScanState> {
    const data = this.requireData();
    const existing = data.durableScanState;
    if (existing !== undefined) {
      if (!isDurableScanState(existing)) {
        throw new RunStateError('CorruptedSessionError', 'durable-state-malformed');
      }
      if (existing.exploit !== exploit) {
        throw new RunStateError('IncompatibleWorkspaceError', 'exploit-mode-changed');
      }
      return structuredClone(existing);
    }

    if (context === 'resume') {
      throw new RunStateError('IncompatibleWorkspaceError', 'durable-state-missing-on-resume');
    }
    const hasRecordedWork =
      Object.keys(data.metrics.agents).length > 0 || (data.session.resumeAttempts?.length ?? 0) > 0;
    if (hasRecordedWork) {
      throw new RunStateError('CorruptedSessionError', 'durable-state-missing-after-work');
    }

    const initialized = createInitialDurableScanState(exploit);
    data.durableScanState = initialized;
    await this.save();
    return structuredClone(initialized);
  }

  /** Return validated durable state. */
  getDurableScanState(): DurableScanState {
    return structuredClone(this.requireDurableScanState());
  }

  /** Persist the internal `miscellaneous` result and append its agent only for actionable exploitation. */
  async updateMiscellaneousOutcome(outcome: MiscellaneousOutcome): Promise<DurableScanState> {
    const data = this.requireData();
    const next = recordMiscellaneousOutcome(this.requireDurableScanState(), outcome);
    if (!isDurableScanState(next)) {
      throw new RunStateError('DurableStateConflictError', 'miscellaneous-outcome-produced-invalid-state');
    }
    data.durableScanState = next;
    await this.save();
    return structuredClone(next);
  }

  /** Persist the complete failed-class set and durable partial reasons before report assembly. */
  async initializeReportProgress(
    failedClasses: readonly import('../types/reconciliation.js').ReconciliationClass[],
    partialReasons: readonly PartialReason[],
  ): Promise<ReportProgress> {
    const data = this.requireData();
    const durableState = this.requireDurableScanState();
    if (!isOrderedPartialReasonSet(partialReasons)) {
      throw new RunStateError('DurableStateConflictError', 'report-pending-reasons-invalid');
    }
    if (durableState.report !== undefined) {
      if (!this.arraysEqual(durableState.report.renumber_failed_classes, failedClasses)) {
        throw new RunStateError('DurableStateConflictError', 'report-failed-class-set-changed');
      }
      // A lost-acknowledgement re-drive adopts the same set; a resume may append newly
      // observed reasons, but never removes a durable one. Append preserves every existing
      // member, so an unchanged length means nothing new was observed.
      const merged = appendPartialReasons(durableState.report.partial_reasons, partialReasons);
      if (merged.length === durableState.report.partial_reasons.length) {
        return structuredClone(durableState.report);
      }
      const report: ReportProgress = { ...durableState.report, partial_reasons: merged };
      const next = { ...durableState, report };
      if (!isDurableScanState(next)) {
        throw new RunStateError('DurableStateConflictError', 'report-pending-reasons-conflict');
      }
      data.durableScanState = next;
      await this.save();
      return structuredClone(report);
    }

    const report: ReportProgress = {
      stage: 'pending',
      renumber_failed_classes: [...failedClasses],
      partial_reasons: appendPartialReasons([], partialReasons),
    };
    const next = { ...durableState, report };
    if (!isDurableScanState(next)) {
      throw new RunStateError('DurableStateConflictError', 'report-pending-invalid');
    }
    data.durableScanState = next;
    await this.save();
    return structuredClone(report);
  }

  /** Record billable report-model metrics and a real Git checkpoint without terminal success. */
  async recordReportDraft(result: AgentEndResult): Promise<ReportProgress> {
    const data = this.requireData();
    const checkpoint = result.checkpoint;
    if (!result.success || checkpoint === undefined) {
      throw new RunStateError('DurableStateConflictError', 'report-draft-requires-success-checkpoint');
    }
    const durableState = this.requireDurableScanState();
    const current = durableState.report;
    if (current === undefined || current.stage === 'finalized') {
      throw new RunStateError('DurableStateConflictError', 'report-draft-invalid-source-stage');
    }
    if (current.stage === 'draft') {
      if (current.model_checkpoint !== checkpoint) {
        throw new RunStateError('DurableStateConflictError', 'report-model-checkpoint-conflict');
      }
      return structuredClone(current);
    }

    const agent = this.appendAttempt('report', result);
    agent.status = 'in-progress';
    agent.final_duration_ms = result.duration_ms;
    agent.checkpoint = checkpoint;
    if (result.model !== undefined) {
      agent.model = result.model;
    } else {
      delete agent.model;
    }

    const report: ReportProgress = {
      stage: 'draft',
      renumber_failed_classes: [...current.renumber_failed_classes],
      partial_reasons: [...current.partial_reasons],
      model_checkpoint: checkpoint,
    };
    const next = { ...durableState, report };
    if (!isDurableScanState(next)) {
      throw new RunStateError('DurableStateConflictError', 'report-draft-invalid');
    }
    data.durableScanState = next;
    this.activeTimers.delete('report');
    this.recalculateAggregations();
    await this.save();
    return structuredClone(report);
  }

  /** Record the post-compaction canonical checkpoint while keeping report nonterminal. */
  async recordCanonicalReportCheckpoint(
    checkpoint: string,
    appendReasons: readonly PartialReason[] = [],
  ): Promise<ReportProgress> {
    const data = this.requireData();
    const durableState = this.requireDurableScanState();
    const current = durableState.report;
    if (current?.stage === 'finalized') {
      if (current.canonical_checkpoint !== checkpoint) {
        throw new RunStateError('DurableStateConflictError', 'report-canonical-checkpoint-conflict');
      }
      return structuredClone(current);
    }
    if (current?.stage !== 'draft') {
      throw new RunStateError('DurableStateConflictError', 'report-canonical-invalid-source-stage');
    }
    const mergedReasons = appendPartialReasons(current.partial_reasons, appendReasons);
    if (current.canonical_checkpoint !== undefined) {
      if (current.canonical_checkpoint !== checkpoint) {
        throw new RunStateError('DurableStateConflictError', 'report-canonical-checkpoint-conflict');
      }
      if (mergedReasons.length === current.partial_reasons.length) {
        return structuredClone(current);
      }
    }

    const report: ReportProgress = {
      ...current,
      partial_reasons: mergedReasons,
      canonical_checkpoint: checkpoint,
    };
    const next = { ...durableState, report };
    if (!isDurableScanState(next)) {
      throw new RunStateError('DurableStateConflictError', 'report-canonical-invalid');
    }
    data.durableScanState = next;
    await this.save();
    return structuredClone(report);
  }

  /**
   * Promote a verified finalization commit to the only terminal report state.
   *
   * `final_checkpoint` and the manifest digest are strict match-or-conflict fields. The SARIF
   * disposition and its `report_sarif_failed` reason are derived from the committed manifest,
   * partial reasons stay append-only, and the PDF provenance is replaceable after finalization.
   */
  async finalizeReportProgress(
    finalCheckpoint: string,
    manifestSha256: string,
    terminal: {
      readonly sarifDisposition: ReportSarifDisposition;
      readonly pdfProvenance: StoredPdfProvenance | null;
      readonly partialReasons: readonly PartialReason[];
    },
  ): Promise<ReportProgress> {
    const data = this.requireData();
    const durableState = this.requireDurableScanState();
    const current = durableState.report;
    if (current?.stage === 'finalized') {
      if (current.final_checkpoint !== finalCheckpoint || current.finalization_manifest_sha256 !== manifestSha256) {
        throw new RunStateError('DurableStateConflictError', 'report-final-checkpoint-conflict');
      }
      if (current.sarif_disposition !== terminal.sarifDisposition) {
        throw new RunStateError('DurableStateConflictError', 'report-final-disposition-conflict');
      }
      const { pdf_provenance: _priorProvenance, ...currentWithoutProvenance } = current;
      let adopted: ReportProgress = {
        ...currentWithoutProvenance,
        partial_reasons: appendPartialReasons(current.partial_reasons, terminal.partialReasons),
      };
      if (terminal.pdfProvenance !== null) {
        adopted = { ...adopted, pdf_provenance: terminal.pdfProvenance };
      }
      return await this.persistFinalizedReport(data, durableState, adopted);
    }
    if (current?.stage !== 'draft' || current.canonical_checkpoint === undefined) {
      throw new RunStateError('DurableStateConflictError', 'report-final-invalid-source-stage');
    }

    const sarifReasons: readonly PartialReason[] =
      terminal.sarifDisposition === 'render_failed' ? [{ code: 'report_sarif_failed' }] : [];
    const report: ReportProgress = {
      stage: 'finalized',
      renumber_failed_classes: [...current.renumber_failed_classes],
      partial_reasons: appendPartialReasons(current.partial_reasons, [...terminal.partialReasons, ...sarifReasons]),
      model_checkpoint: current.model_checkpoint,
      canonical_checkpoint: current.canonical_checkpoint,
      final_checkpoint: finalCheckpoint,
      finalization_manifest_sha256: manifestSha256,
      sarif_disposition: terminal.sarifDisposition,
      ...(terminal.pdfProvenance !== null && { pdf_provenance: terminal.pdfProvenance }),
    };

    const agent = data.metrics.agents.report;
    if (agent === undefined || agent.attempts.length === 0) {
      throw new RunStateError('DurableStateConflictError', 'report-final-without-model-metrics');
    }
    const persisted = await this.persistFinalizedReport(data, durableState, report, () => {
      agent.status = 'success';
      agent.checkpoint = finalCheckpoint;
      const latestAttempt = agent.attempts.at(-1);
      agent.final_duration_ms = latestAttempt?.duration_ms ?? agent.final_duration_ms;
      this.recalculateAggregations();
    });
    return persisted;
  }

  private async persistFinalizedReport(
    data: SessionData,
    durableState: DurableScanState,
    report: ReportProgress,
    beforeSave?: () => void,
  ): Promise<ReportProgress> {
    const next = { ...durableState, report };
    if (!isDurableScanState(next)) {
      throw new RunStateError('DurableStateConflictError', 'report-final-invalid');
    }
    beforeSave?.();
    data.durableScanState = next;
    await this.save();
    return structuredClone(report);
  }

  /** Roll back only report state after a coherent draft shape fails checkpoint validation. */
  async rollbackReportDraft(): Promise<ReportProgress> {
    const data = this.requireData();
    const durableState = this.requireDurableScanState();
    const current = durableState.report;
    if (current?.stage !== 'draft') {
      throw new RunStateError('DurableStateConflictError', 'report-draft-rollback-invalid-source-stage');
    }
    const report: ReportProgress = {
      stage: 'pending',
      renumber_failed_classes: [...current.renumber_failed_classes],
      partial_reasons: [...current.partial_reasons],
    };
    const agent = data.metrics.agents.report;
    if (agent !== undefined) {
      agent.status = 'in-progress';
      delete agent.checkpoint;
      delete agent.model;
    }
    data.durableScanState = { ...durableState, report };
    this.recalculateAggregations();
    await this.save();
    return structuredClone(report);
  }

  /** Return persisted report metrics for a coherent draft/finalized model-skip path. */
  getReportMetrics(): AgentMetrics {
    const durableState = this.requireDurableScanState();
    if (durableState.report?.stage !== 'draft' && durableState.report?.stage !== 'finalized') {
      throw new RunStateError('DurableStateConflictError', 'report-metrics-before-draft');
    }
    const agent = this.requireData().metrics.agents.report;
    if (agent === undefined || agent.attempts.length === 0) {
      throw new RunStateError('CorruptedSessionError', 'report-draft-metrics-missing');
    }
    const latest = agent.attempts.at(-1);
    return {
      durationMs: agent.final_duration_ms,
      inputTokens: agent.total_input_tokens,
      outputTokens: agent.total_output_tokens,
      cacheReadTokens: agent.total_cache_read_tokens,
      cacheWriteTokens: agent.total_cache_write_tokens,
      costUsd: agent.total_cost_usd,
      numTurns: agent.attempts.reduce((sum, attempt) => sum + (attempt.turns ?? 0), 0),
      ...(latest?.model !== undefined && { model: latest.model }),
      ...(agent.checkpoint !== undefined && { checkpoint: agent.checkpoint }),
      skipped: true,
    };
  }

  /**
   * Update session status
   */
  async updateSessionStatus(status: 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'partial'): Promise<void> {
    if (!this.data) return;

    this.data.session.status = status;

    if (status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'partial') {
      this.data.session.completedAt = formatTimestamp();
    }

    await this.save();
  }

  /** Upsert one workflow's terminal wall time and operational usage, then recompute workspace totals. */
  async recordTerminalWorkflowMetrics(
    workflowId: string,
    input: TerminalWorkflowMetricsInput,
  ): Promise<TerminalWorkflowMetricTotals> {
    const data = this.requireData();
    if (
      !Number.isSafeInteger(input.startedAtMs) ||
      !Number.isSafeInteger(input.endedAtMs) ||
      input.startedAtMs < 0 ||
      input.endedAtMs < input.startedAtMs
    ) {
      throw new RunStateError('DurableStateConflictError', 'terminal-metric-time-invalid');
    }

    data.metrics.operational ??= {};
    const operational = data.metrics.operational;
    operational[workflowId] = Object.fromEntries(
      Object.entries(input.operationalMetrics).map(([key, metric]) => [
        key,
        {
          duration_ms: metric.durationMs,
          input_tokens: metric.inputTokens ?? 0,
          output_tokens: metric.outputTokens ?? 0,
          cache_read_tokens: metric.cacheReadTokens ?? 0,
          cache_write_tokens: metric.cacheWriteTokens ?? 0,
          cost_usd: metric.costUsd ?? 0,
          turns: metric.numTurns ?? 0,
          usage_complete: metric.usageComplete !== false,
        },
      ]),
    );

    data.metrics.stages ??= {};
    data.metrics.stages[workflowId] = this.collectOperationalSpans(input.operationalStages);

    data.metrics.runs ??= {};
    const runs = data.metrics.runs;
    runs[workflowId] = {
      status: input.status,
      started_at: new Date(input.startedAtMs).toISOString(),
      ended_at: new Date(input.endedAtMs).toISOString(),
      wall_duration_ms: input.endedAtMs - input.startedAtMs,
      usage_accounting_complete: input.usageAccountingComplete,
      usage_accounting_warnings: [...input.usageAccountingWarnings],
    };

    data.session.status = input.status;
    data.session.completedAt = runs[workflowId].ended_at;
    this.recalculateAggregations();
    await this.save();

    return {
      totalDurationMs: data.metrics.total_duration_ms,
      totalCostUsd: data.metrics.total_cost_usd,
      totalTurns: data.metrics.total_turns ?? 0,
      runCount: Object.keys(runs).length,
      usageAccountingComplete: data.metrics.usage_accounting_complete ?? false,
    };
  }

  /**
   * Add a resume attempt to the session
   *
   * @param workflowId - The new workflow ID for this resume attempt
   * @param terminatedWorkflows - IDs of workflows that were terminated
   * @param checkpointHash - Git checkpoint hash that was restored
   */
  async addResumeAttempt(workflowId: string, terminatedWorkflows: string[], checkpointHash?: string): Promise<void> {
    if (!this.data) {
      throw new PentestError(
        'MetricsTracker not initialized',
        'validation',
        false,
        {},
        ErrorCode.AGENT_EXECUTION_FAILED,
      );
    }

    // Ensure originalWorkflowId is set (backfill if missing from old sessions)
    if (!this.data.session.originalWorkflowId) {
      this.data.session.originalWorkflowId = this.data.session.id;
    }

    // Ensure resumeAttempts array exists
    if (!this.data.session.resumeAttempts) {
      this.data.session.resumeAttempts = [];
    }

    // A lost-acknowledgement re-drive of the same resume adopts the earlier record instead
    // of appending a duplicate row for the same workflow id.
    if (this.data.session.resumeAttempts.some((attempt) => attempt.workflowId === workflowId)) {
      return;
    }

    // Add new resume attempt
    const resumeAttempt: ResumeAttempt = {
      workflowId,
      timestamp: formatTimestamp(),
    };

    if (terminatedWorkflows.length > 0) {
      resumeAttempt.terminatedPrevious = terminatedWorkflows.join(',');
    }

    if (checkpointHash) {
      resumeAttempt.resumedFromCheckpoint = checkpointHash;
    }

    this.data.session.resumeAttempts.push(resumeAttempt);

    await this.save();
  }

  /**
   * Recalculate aggregations (total duration, total cost, phases)
   */
  private recalculateAggregations(): void {
    if (!this.data) return;

    const agents = this.data.metrics.agents;

    // Only count successful agents
    const successfulAgents = Object.entries(agents).filter(([, data]) => data.status === 'success');

    const totalAgentDuration = successfulAgents.reduce((sum, [, data]) => sum + data.final_duration_ms, 0);
    const operational = Object.values(this.data.metrics.operational ?? {}).flatMap((metrics) => Object.values(metrics));
    const runs = Object.values(this.data.metrics.runs ?? {});

    this.data.metrics.total_agent_duration_ms = totalAgentDuration;
    this.data.metrics.total_operational_duration_ms = this.operationalWallClockMs(this.data);
    this.data.metrics.total_duration_ms = runs.reduce((sum, run) => sum + run.wall_duration_ms, 0);
    this.data.metrics.total_cost_usd =
      Object.values(agents).reduce((sum, agent) => sum + agent.total_cost_usd, 0) +
      operational.reduce((sum, metric) => sum + metric.cost_usd, 0);
    this.data.metrics.total_turns =
      Object.values(agents).reduce(
        (sum, agent) => sum + agent.attempts.reduce((attemptSum, attempt) => attemptSum + (attempt.turns ?? 0), 0),
        0,
      ) + operational.reduce((sum, metric) => sum + metric.turns, 0);
    this.data.metrics.usage_accounting_complete =
      runs.every((run) => run.usage_accounting_complete) && operational.every((metric) => metric.usage_complete);

    // Calculate phase-level metrics
    this.data.metrics.phases = this.calculatePhaseMetrics(successfulAgents, operational);
  }

  /**
   * Keep the operational stage spans this run can place on a timeline. A stage that never ran, or
   * that was still running, has no complete span and is dropped rather than guessed at; a present
   * but nonsensical value is corruption and fails closed.
   */
  private collectOperationalSpans(
    operationalStages: Readonly<Record<string, OperationalStageTiming>>,
  ): Record<string, StageSpan> {
    const spans: Record<string, StageSpan> = {};
    for (const [stageKey, timing] of Object.entries(operationalStages)) {
      if (!isOperationalStageKey(stageKey)) continue;
      if (timing.startedAt === undefined || timing.durationMs === undefined) continue;
      const spanIsWellFormed =
        Number.isSafeInteger(timing.startedAt) &&
        Number.isSafeInteger(timing.durationMs) &&
        timing.startedAt >= 0 &&
        timing.durationMs >= 0;
      if (!spanIsWellFormed) {
        throw new RunStateError('DurableStateConflictError', 'terminal-stage-span-invalid');
      }
      spans[stageKey] = { started_at_ms: timing.startedAt, duration_ms: timing.durationMs };
    }
    return spans;
  }

  /**
   * Wall time the workspace actually spent on operational work. Reconciliation stages carry no
   * duration in their priced metrics, so the timing comes from the stage spans, merged so classes
   * that overlapped count once instead of once each. A run recorded before spans were persisted has
   * none, so it falls back to summing its priced durations — the same fallback
   * `summarizeOperationalMetrics` applies to a metrics-only view. The two sets never intersect, so
   * no run is counted twice.
   */
  private operationalWallClockMs(data: SessionData): number {
    const spansByRun = data.metrics.stages ?? {};
    const spans = Object.values(spansByRun).flatMap((stages) =>
      Object.values(stages).map((span) => ({ startedAt: span.started_at_ms, durationMs: span.duration_ms })),
    );
    const spanlessRunDuration = Object.entries(data.metrics.operational ?? {})
      .filter(([workflowId]) => spansByRun[workflowId] === undefined)
      .reduce(
        (sum, [, metrics]) => sum + Object.values(metrics).reduce((inner, metric) => inner + metric.duration_ms, 0),
        0,
      );
    return mergeIntervalsDurationMs(spans) + spanlessRunDuration;
  }

  /**
   * Calculate phase-level metrics
   */
  private calculatePhaseMetrics(
    successfulAgents: Array<[string, AgentAuditMetrics]>,
    operational: OperationalAuditMetrics[],
  ): Record<string, PhaseMetrics> {
    const phases: Record<PhaseName, AgentAuditMetrics[]> = {
      'pre-recon': [],
      recon: [],
      'vulnerability-analysis': [],
      exploitation: [],
      reporting: [],
    };

    // Group agents by phase using imported AGENT_PHASE_MAP
    for (const [agentName, agentData] of successfulAgents) {
      const phase = AGENT_PHASE_MAP[agentName as AgentName];
      if (phase) {
        phases[phase].push(agentData);
      }
    }

    // Calculate metrics per phase
    const phaseMetrics: Record<string, PhaseMetrics> = {};
    // Percentages share one basis — agent plus operational duration — so the synthetic background
    // phase below is comparable to the agent phases rather than measured against a different total.
    // (`this.data` is guaranteed by the recalculateAggregations caller; optional chaining keeps it lint-clean.)
    const operationalDuration = this.data?.metrics.total_operational_duration_ms ?? 0;
    const totalDuration = (this.data?.metrics.total_agent_duration_ms ?? 0) + operationalDuration;

    for (const [phaseName, agentList] of Object.entries(phases)) {
      if (agentList.length === 0) continue;

      const phaseDuration = agentList.reduce((sum, agent) => sum + agent.final_duration_ms, 0);
      const phaseCost = agentList.reduce((sum, agent) => sum + agent.total_cost_usd, 0);

      phaseMetrics[phaseName] = {
        duration_ms: phaseDuration,
        duration_percentage: calculatePercentage(phaseDuration, totalDuration),
        cost_usd: phaseCost,
        agent_count: agentList.length,
      };
    }

    // Operational work (agentic SAST, reconciliation) runs concurrently with the agent phases and is
    // otherwise absent from this breakdown; surface it as one `background` phase. `agent_count` here
    // is the number of operational metric entries, not agents.
    if (operational.length > 0) {
      const backgroundCost = operational.reduce((sum, metric) => sum + metric.cost_usd, 0);
      phaseMetrics.background = {
        duration_ms: operationalDuration,
        duration_percentage: calculatePercentage(operationalDuration, totalDuration),
        cost_usd: backgroundCost,
        agent_count: operational.length,
      };
    }

    return phaseMetrics;
  }

  /**
   * Get current metrics
   */
  getMetrics(): SessionData {
    return JSON.parse(JSON.stringify(this.data)) as SessionData;
  }

  /**
   * Save metrics to session.json (atomic write)
   */
  private async save(): Promise<void> {
    if (!this.data) return;
    await atomicWrite(this.sessionJsonPath, this.data);
  }

  /**
   * Reload metrics from disk
   */
  async reload(): Promise<void> {
    this.data = await readJson<SessionData>(this.sessionJsonPath);
  }

  private requireData(): SessionData {
    if (this.data === null) {
      throw new RunStateError('CorruptedSessionError', 'metrics-tracker-not-initialized');
    }
    return this.data;
  }

  private requireDurableScanState(): DurableScanState {
    const durableState = this.requireData().durableScanState;
    if (durableState === undefined) {
      throw new RunStateError('CorruptedSessionError', 'durable-state-missing');
    }
    if (!isDurableScanState(durableState)) {
      throw new RunStateError('CorruptedSessionError', 'durable-state-malformed');
    }
    return durableState;
  }

  /**
   * Append one attempt and recompute the agent's cumulative totals from the full attempt list,
   * rather than incrementing them. A reload-then-write cycle can replay this on the same agent
   * more than once across a retry, and recomputing from the stored attempts keeps the totals
   * correct regardless of how many times that happens.
   */
  private appendAttempt(agentName: string, result: AgentEndResult): AgentAuditMetrics {
    const data = this.requireData();
    const existingAgent = data.metrics.agents[agentName];
    const agent = existingAgent ?? {
      status: 'in-progress' as const,
      attempts: [],
      final_duration_ms: 0,
      total_cost_usd: 0,
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_cache_read_tokens: 0,
      total_cache_write_tokens: 0,
    };
    data.metrics.agents[agentName] = agent;

    const safeError = result.errorCode === undefined ? undefined : safeErrorFromCode(result.errorCode);
    const attempt: AttemptData = {
      attempt_number: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      timestamp: formatTimestamp(),
      ...(result.input_tokens !== undefined && { input_tokens: result.input_tokens }),
      ...(result.output_tokens !== undefined && { output_tokens: result.output_tokens }),
      ...(result.cache_read_tokens !== undefined && { cache_read_tokens: result.cache_read_tokens }),
      ...(result.cache_write_tokens !== undefined && { cache_write_tokens: result.cache_write_tokens }),
      ...(result.turns !== undefined && { turns: result.turns }),
      ...(result.model !== undefined && { model: result.model }),
      ...(safeError !== undefined && { error: safeError.message, error_code: safeError.code }),
    };
    agent.attempts.push(attempt);
    agent.total_cost_usd = agent.attempts.reduce((sum, entry) => sum + entry.cost_usd, 0);
    agent.total_input_tokens = agent.attempts.reduce((sum, entry) => sum + (entry.input_tokens ?? 0), 0);
    agent.total_output_tokens = agent.attempts.reduce((sum, entry) => sum + (entry.output_tokens ?? 0), 0);
    agent.total_cache_read_tokens = agent.attempts.reduce((sum, entry) => sum + (entry.cache_read_tokens ?? 0), 0);
    agent.total_cache_write_tokens = agent.attempts.reduce((sum, entry) => sum + (entry.cache_write_tokens ?? 0), 0);
    return agent;
  }

  private arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }
}
