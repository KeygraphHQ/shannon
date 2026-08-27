// Copyright (C) 2025 Keygraph, Inc.
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
    total_cost_usd: number;
    phases: Record<string, PhaseMetrics>;
    agents: Record<string, AgentAuditMetrics>;
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
        total_cost_usd: 0,
        phases: {}, // Phase-level aggregations
        agents: {}, // Agent-level metrics
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
      const adopted: ReportProgress = {
        ...current,
        partial_reasons: appendPartialReasons(current.partial_reasons, terminal.partialReasons),
        ...(terminal.pdfProvenance !== null ? { pdf_provenance: terminal.pdfProvenance } : {}),
      };
      if (terminal.pdfProvenance === null && 'pdf_provenance' in adopted) {
        const { pdf_provenance: _removed, ...withoutProvenance } = adopted;
        return await this.persistFinalizedReport(data, durableState, withoutProvenance as ReportProgress);
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

    // Calculate total duration and cost
    const totalDuration = successfulAgents.reduce((sum, [, data]) => sum + data.final_duration_ms, 0);

    const totalCost = successfulAgents.reduce((sum, [, data]) => sum + data.total_cost_usd, 0);

    this.data.metrics.total_duration_ms = totalDuration;
    this.data.metrics.total_cost_usd = totalCost;

    // Calculate phase-level metrics
    this.data.metrics.phases = this.calculatePhaseMetrics(successfulAgents);
  }

  /**
   * Calculate phase-level metrics
   */
  private calculatePhaseMetrics(successfulAgents: Array<[string, AgentAuditMetrics]>): Record<string, PhaseMetrics> {
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
    // biome-ignore lint/style/noNonNullAssertion: called from recalculateAggregations which guards this.data
    const totalDuration = this.data!.metrics.total_duration_ms;

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
