// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Audit Session - Main Facade
 *
 * Coordinates logger, metrics tracker, and concurrency control for comprehensive
 * crash-safe audit logging.
 */

import { PentestError } from '../services/error-handling.js';
import { ErrorCode } from '../types/errors.js';
import type { AgentEndResult } from '../types/index.js';
import type { AgentMetrics } from '../types/metrics.js';
import {
  type DurableScanState,
  type MiscellaneousOutcome,
  type PartialReason,
  type ReportProgress,
  type ReportSarifDisposition,
  RunStateError,
  type StoredPdfProvenance,
} from '../types/run-state.js';
import { SessionMutex } from '../utils/concurrency.js';
import { fileExists } from '../utils/file-io.js';
import {
  MetricsTracker,
  type TerminalWorkflowMetricsInput,
  type TerminalWorkflowMetricTotals,
} from './metrics-tracker.js';
import type { LoggableAgentName, WorkflowPhase } from './safe-fields.js';
import {
  generateSessionJsonPath,
  generateWorkflowLogPath,
  initializeAuditStructure,
  type SessionMetadata,
} from './utils.js';
import { type AgentLogDetails, WorkflowLogger, type WorkflowSummary } from './workflow-logger.js';

// Global mutex instance
const sessionMutex = new SessionMutex();

/**
 * AuditSession - Main audit system facade
 *
 * Construct a fresh instance per agent execution rather than sharing one across concurrent
 * agents. `WorkflowLogger.close()` (called after every logged unit of work) releases every
 * per-agent lease the instance currently holds, not just the caller's; a shared instance would
 * let one agent's completion sever another agent's still-open log file mid-write.
 */
export class AuditSession {
  readonly sessionMetadata: SessionMetadata;
  private sessionId: string;
  private metricsTracker: MetricsTracker;
  private workflowLogger: WorkflowLogger;
  private initialized: boolean = false;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.sessionId = sessionMetadata.id;

    // Validate required fields
    if (!this.sessionId) {
      throw new PentestError(
        'sessionMetadata.id is required',
        'config',
        false,
        { field: 'sessionMetadata.id' },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }
    if (!this.sessionMetadata.webUrl) {
      throw new PentestError(
        'sessionMetadata.webUrl is required',
        'config',
        false,
        { field: 'sessionMetadata.webUrl' },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      );
    }

    // Components
    this.metricsTracker = new MetricsTracker(sessionMetadata);
    this.workflowLogger = new WorkflowLogger(sessionMetadata);
  }

  /**
   * Initialize audit session (creates directories, session.json)
   * Idempotent and race-safe
   *
   * @param workflowId - Optional workflow ID for tracking original or resume workflows
   */
  async initialize(workflowId?: string): Promise<void> {
    if (this.initialized) {
      return; // Already initialized
    }

    // Create directory structure
    await initializeAuditStructure(this.sessionMetadata);

    // Initialize metrics tracker (loads or creates session.json)
    await this.metricsTracker.initialize(workflowId);

    if (workflowId !== undefined) {
      this.workflowLogger.setWorkflowId(workflowId);
    }

    this.initialized = true;
  }

  /**
   * Ensure initialized (helper for lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Start agent execution
   */
  async startAgent(agentName: LoggableAgentName, attemptNumber: number = 1): Promise<void> {
    await this.ensureInitialized();
    this.metricsTracker.startAgent(agentName, attemptNumber);
    await this.workflowLogger.logAgent(agentName, 'start', { attemptNumber });
  }

  /** Absolute path to this scan's human-readable log, for path-based trace writers. */
  get workflowLogPath(): string {
    return generateWorkflowLogPath(this.sessionMetadata);
  }

  /** Record an agent attempt's closed-vocabulary error to the workflow log. */
  async logAgentError(
    agentName: LoggableAgentName,
    code: ErrorCode,
    category: string,
    attempt: number,
    durationMs: number,
    turns: number,
  ): Promise<void> {
    await this.workflowLogger.logAgentError(agentName, code, category, attempt, durationMs, turns);
  }

  /**
   * Release an agent's open per-agent log lease without recording an end. A backstop for an
   * abnormal abort where {@link endAgent} never ran; idempotent, so a normal end makes it a no-op.
   */
  async releaseAgentLog(agentName: LoggableAgentName): Promise<void> {
    await this.workflowLogger.releaseAgentLog(agentName);
  }

  /**
   * End agent execution (mutex-protected)
   */
  async endAgent(agentName: LoggableAgentName, result: AgentEndResult): Promise<void> {
    await this.finishAgentLogs(agentName, result);

    // 3. Acquire mutex before touching session.json
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      // 4. Reload-then-write inside mutex to prevent lost updates during parallel phases
      await this.metricsTracker.reload();
      await this.metricsTracker.endAgent(agentName, result);
    } finally {
      unlock();
    }
  }

  /** Record a successful report-model attempt as a nonterminal durable draft. */
  async endReportDraft(result: AgentEndResult): Promise<ReportProgress> {
    await this.finishAgentLogs('report', result);

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.recordReportDraft(result);
    } finally {
      unlock();
    }
  }

  /** Write the agent's end line and close this instance's logger before touching session.json. */
  private async finishAgentLogs(agentName: LoggableAgentName, result: AgentEndResult): Promise<void> {
    const agentLogDetails: AgentLogDetails = {
      attemptNumber: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      ...(result.errorCode !== undefined && { errorCode: result.errorCode }),
    };
    await this.workflowLogger.logAgent(agentName, 'end', agentLogDetails);
    await this.workflowLogger.close();
  }

  /**
   * Initialize fresh durable state or validate a resume record without reconstructing it.
   *
   * This is the first activity of every run, so it is also where a fresh workspace's
   * session.json is created. It therefore takes the workflow id explicitly: initializing
   * without one would persist a session with no `originalWorkflowId`, and later calls load
   * the existing file rather than rewriting identity, leaving the scan unresolvable.
   */
  async initializeDurableScanState(
    workflowId: string,
    exploit: boolean,
    context: 'fresh' | 'resume',
  ): Promise<DurableScanState> {
    if (context === 'resume' && !(await fileExists(generateSessionJsonPath(this.sessionMetadata)))) {
      throw new RunStateError('IncompatibleWorkspaceError', 'session-json-missing-on-resume');
    }
    await this.initialize(workflowId);
    await this.workflowLogger.initialize(workflowId);
    await this.workflowLogger.close();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.initializeDurableScanState(exploit, context);
    } finally {
      unlock();
    }
  }

  /** Return a validated snapshot of durable execution state. */
  async getDurableScanState(): Promise<DurableScanState> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return this.metricsTracker.getDurableScanState();
    } finally {
      unlock();
    }
  }

  /** Persist a `miscellaneous` branch outcome under the session lock. */
  async updateMiscellaneousOutcome(outcome: MiscellaneousOutcome): Promise<DurableScanState> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.updateMiscellaneousOutcome(outcome);
    } finally {
      unlock();
    }
  }

  /** Persist the ordered renumber-failure set and durable partial reasons before assembly. */
  async initializeReportProgress(
    failedClasses: readonly import('../types/reconciliation.js').ReconciliationClass[],
    partialReasons: readonly PartialReason[],
  ): Promise<ReportProgress> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.initializeReportProgress(failedClasses, partialReasons);
    } finally {
      unlock();
    }
  }

  /** Persist the post-compaction canonical report checkpoint without terminal success. */
  async recordCanonicalReportCheckpoint(
    checkpoint: string,
    appendReasons: readonly PartialReason[] = [],
  ): Promise<ReportProgress> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.recordCanonicalReportCheckpoint(checkpoint, appendReasons);
    } finally {
      unlock();
    }
  }

  /** Atomically mark report finalized and successful after external proof validation. */
  async finalizeReportProgress(
    finalCheckpoint: string,
    manifestSha256: string,
    terminal: {
      readonly sarifDisposition: ReportSarifDisposition;
      readonly pdfProvenance: StoredPdfProvenance | null;
      readonly partialReasons: readonly PartialReason[];
    },
  ): Promise<ReportProgress> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.finalizeReportProgress(finalCheckpoint, manifestSha256, terminal);
    } finally {
      unlock();
    }
  }

  /** Return an invalid model draft to pending without erasing its billable attempt. */
  async rollbackReportDraft(): Promise<ReportProgress> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.rollbackReportDraft();
    } finally {
      unlock();
    }
  }

  /** Read persisted report metrics for model-skip resume. */
  async getReportMetrics(): Promise<AgentMetrics> {
    await this.ensureInitialized();
    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return this.metricsTracker.getReportMetrics();
    } finally {
      unlock();
    }
  }

  /**
   * Update session status
   */
  async updateSessionStatus(status: 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'partial'): Promise<void> {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      await this.metricsTracker.updateSessionStatus(status);
    } finally {
      unlock();
    }
  }

  /** Persist the terminal workflow projection under its retry-stable workflow id. */
  async recordTerminalWorkflowMetrics(
    workflowId: string,
    input: TerminalWorkflowMetricsInput,
  ): Promise<TerminalWorkflowMetricTotals> {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      return await this.metricsTracker.recordTerminalWorkflowMetrics(workflowId, input);
    } finally {
      unlock();
    }
  }

  /**
   * Get current metrics (read-only)
   */
  async getMetrics(): Promise<unknown> {
    await this.ensureInitialized();
    return this.metricsTracker.getMetrics();
  }

  /**
   * Log phase start to unified workflow log
   */
  async logPhaseStart(phase: WorkflowPhase): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.workflowLogger.logPhase(phase, 'start');
    } finally {
      await this.workflowLogger.close();
    }
  }

  /**
   * Log phase completion to unified workflow log
   */
  async logPhaseComplete(phase: WorkflowPhase): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.workflowLogger.logPhase(phase, 'complete');
    } finally {
      await this.workflowLogger.close();
    }
  }

  /**
   * Log workflow completion to unified workflow log
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.workflowLogger.logWorkflowComplete(summary);
    } finally {
      await this.workflowLogger.close();
    }
  }

  /**
   * Add a resume attempt to the session
   * Call this when a workflow is resuming from an existing workspace
   *
   * @param workflowId - The new workflow ID for this resume attempt
   * @param terminatedWorkflows - IDs of workflows that were terminated
   * @param checkpointHash - Git checkpoint hash that was restored
   */
  async addResumeAttempt(workflowId: string, terminatedWorkflows: string[], checkpointHash?: string): Promise<void> {
    await this.ensureInitialized();

    const unlock = await sessionMutex.lock(this.sessionId);
    try {
      await this.metricsTracker.reload();
      await this.metricsTracker.addResumeAttempt(workflowId, terminatedWorkflows, checkpointHash);
    } finally {
      unlock();
    }
  }

  /** Write and flush the new execution boundary before publishing its durable resume record. */
  async logResumeBoundary(workflowId: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.workflowLogger.logResumeBoundary(workflowId);
    } finally {
      await this.workflowLogger.close();
    }
  }

  /** Add checkpoint details beneath the already-durable resume boundary. */
  async logResumeDetails(resumeInfo: {
    previousWorkflowId: string;
    newWorkflowId: string;
    checkpointHash: string;
    completedAgents: string[];
  }): Promise<void> {
    await this.ensureInitialized();
    try {
      await this.workflowLogger.logResumeDetails(resumeInfo);
    } finally {
      await this.workflowLogger.close();
    }
  }
}
