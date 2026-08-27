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
import { formatTimestamp } from '../utils/formatting.js';
import { AgentLogger } from './logger.js';
import { MetricsTracker } from './metrics-tracker.js';
import { generateSessionJsonPath, initializeAuditStructure, type SessionMetadata } from './utils.js';
import { type AgentLogDetails, WorkflowLogger, type WorkflowSummary } from './workflow-logger.js';

// Global mutex instance
const sessionMutex = new SessionMutex();

/**
 * AuditSession - Main audit system facade
 */
export class AuditSession {
  readonly sessionMetadata: SessionMetadata;
  private sessionId: string;
  private metricsTracker: MetricsTracker;
  private workflowLogger: WorkflowLogger;
  private currentLogger: AgentLogger | null = null;
  private currentAgentName: string | null = null;
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

    // Initialize workflow logger with actual Temporal workflow ID
    await this.workflowLogger.initialize(workflowId);

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
  async startAgent(agentName: string, promptContent: string, attemptNumber: number = 1): Promise<void> {
    await this.ensureInitialized();

    // 1. Save prompt snapshot (only on first attempt)
    if (attemptNumber === 1) {
      await AgentLogger.savePrompt(this.sessionMetadata, agentName, promptContent);
    }

    // 2. Create and initialize the per-agent logger
    this.currentAgentName = agentName;
    this.currentLogger = new AgentLogger(this.sessionMetadata, agentName, attemptNumber);
    await this.currentLogger.initialize();

    // 3. Start metrics timer
    this.metricsTracker.startAgent(agentName, attemptNumber);

    // 4. Log start event to both agent log and workflow log
    await this.currentLogger.logEvent('agent_start', {
      agentName,
      attemptNumber,
      timestamp: formatTimestamp(),
    });

    await this.workflowLogger.logAgent(agentName, 'start', { attemptNumber });
  }

  /**
   * Log event during agent execution
   */
  async logEvent(eventType: string, eventData: unknown): Promise<void> {
    if (!this.currentLogger) {
      throw new PentestError(
        'No active logger. Call startAgent() first.',
        'validation',
        false,
        {},
        ErrorCode.AGENT_EXECUTION_FAILED,
      );
    }

    // Log to agent-specific log file (JSON format)
    await this.currentLogger.logEvent(eventType, eventData);

    // Also log to unified workflow log (human-readable format)
    const data = eventData as Record<string, unknown>;
    const agentName = this.currentAgentName || 'unknown';
    switch (eventType) {
      case 'tool_start':
        await this.workflowLogger.logToolStart(agentName, String(data.toolName || ''), data.parameters);
        break;
      case 'llm_response':
        await this.workflowLogger.logLlmResponse(agentName, Number(data.turn || 0), String(data.content || ''));
        break;
      // tool_end and error events are intentionally not logged to workflow log
      // to reduce noise - the agent completion message captures the outcome
    }
  }

  /**
   * Write a human-readable note to the unified workflow log (e.g. a model
   * refusal fallback). Independent of agent event logging.
   */
  async logWorkflowNote(category: string, message: string): Promise<void> {
    await this.workflowLogger.logEvent(category, message);
  }

  /**
   * End agent execution (mutex-protected)
   */
  async endAgent(agentName: string, result: AgentEndResult): Promise<void> {
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

  private async finishAgentLogs(agentName: string, result: AgentEndResult): Promise<void> {
    // 1. Finalize agent log and close the stream
    if (this.currentLogger) {
      await this.currentLogger.logEvent('agent_end', {
        agentName,
        success: result.success,
        duration_ms: result.duration_ms,
        cost_usd: result.cost_usd,
        timestamp: formatTimestamp(),
      });

      await this.currentLogger.close();
      this.currentLogger = null;
    }

    // 2. Log completion to the unified workflow log
    this.currentAgentName = null;

    const agentLogDetails: AgentLogDetails = {
      attemptNumber: result.attemptNumber,
      duration_ms: result.duration_ms,
      cost_usd: result.cost_usd,
      success: result.success,
      ...(result.error !== undefined && { error: result.error }),
    };
    await this.workflowLogger.logAgent(agentName, 'end', agentLogDetails);
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
  async logPhaseStart(phase: string): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logPhase(phase, 'start');
  }

  /**
   * Log phase completion to unified workflow log
   */
  async logPhaseComplete(phase: string): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logPhase(phase, 'complete');
  }

  /**
   * Log workflow completion to unified workflow log
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logWorkflowComplete(summary);
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

  /**
   * Log resume header to workflow.log
   * Call this when a workflow is resuming to add a visual separator
   */
  async logResumeHeader(resumeInfo: {
    previousWorkflowId: string;
    newWorkflowId: string;
    checkpointHash: string;
    completedAgents: string[];
  }): Promise<void> {
    await this.ensureInitialized();
    await this.workflowLogger.logResumeHeader(resumeInfo);
  }
}
