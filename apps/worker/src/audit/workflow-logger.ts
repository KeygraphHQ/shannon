// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Closed-field, human-readable scan logging. */

import { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { isCapellaSafeFailureMessage, isCapellaTerminalStageLabel } from '../ai/sast/capella/safe-failures.js';
import type { CapellaStage } from '../ai/sast/types.js';
import type { ErrorCode } from '../types/errors.js';
import { isPartialReason, type PartialReasonView, projectPartialReasons } from '../types/run-state.js';
import { formatDuration, formatTimestamp } from '../utils/formatting.js';
import {
  agentLogPath,
  agentsDir,
  projectActor,
  safeAgentFileSlug,
  safeIdentityLabel,
  type TraceActor,
} from './actor-projection.js';
import { LogStream, warnAgentLoggingFailure, warnLoggingFailure } from './log-stream.js';
import {
  isLoggableAgentName,
  isWorkflowPhase,
  type LoggableAgentName,
  safeErrorFromCode,
  safeTargetUrl,
  safeWorkflowIdentifier,
  type WorkflowPhase,
} from './safe-fields.js';
import type { ToolInvocation, ToolOutcome } from './trace.js';
import { generateWorkflowLogPath, type SessionMetadata } from './utils.js';

export type { TraceActor } from './actor-projection.js';

export interface AgentLogDetails {
  readonly attemptNumber?: number;
  readonly duration_ms?: number;
  readonly cost_usd?: number;
  readonly success?: boolean;
  readonly errorCode?: ErrorCode;
}

export interface AgentMetricsSummary {
  readonly durationMs: number;
  readonly costUsd: number | null;
}

export interface WorkflowSummary {
  readonly status: 'completed' | 'failed' | 'cancelled' | 'partial';
  readonly totalDurationMs: number;
  readonly totalCostUsd: number;
  readonly completedAgents: readonly string[];
  readonly skippedAgents?: readonly string[];
  readonly agentMetrics: Readonly<Record<string, AgentMetricsSummary>>;
  readonly partialReasons?: readonly PartialReasonView[];
  readonly usageAccountingComplete?: boolean;
  readonly agenticSastFailedStage?: string;
  readonly agenticSastFailureMessage?: string;
  readonly agenticSastErrorCode?: string;
  readonly errorCode?: ErrorCode;
}

export type ChildTaskFailureCode = 'CANCELLED' | 'CHILD_TASK_FAILED';

const AGENTIC_SAST_STAGE_LABELS: Readonly<Record<CapellaStage, string>> = {
  architecture: 'Architecture',
  'threat-model': 'Threat model',
  plan: 'Planning',
  research: 'Audit wave',
  dedupe: 'Deduplication',
  review: 'Review',
  critic: 'Critic',
  confirm: 'Confirmation',
  calibrate: 'Calibration',
  export: 'Export',
};

function isSafeCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000;
}

/**
 * Render a partial reason's message only after rebuilding it as a fresh, narrowly-shaped
 * candidate and revalidating it with {@link isPartialReason}. The view arrives already
 * projected, but re-checking here means a future field added to the view can never reach the
 * log through this path until it is deliberately admitted into the narrowed candidate shape.
 */
function safeReasonMessage(reason: PartialReasonView): string | undefined {
  if (reason.code === 'agentic_sast_reduced') return 'Agentic SAST completed with reduced coverage.';
  let candidate: unknown = { code: reason.code };
  if (reason.vulnerabilityClass !== undefined) {
    candidate = { code: reason.code, vulnerabilityClass: reason.vulnerabilityClass };
  } else if (reason.stage !== undefined && reason.code === 'agentic_sast_failed') {
    candidate = { code: reason.code, stage: reason.stage };
  }
  if (!isPartialReason(candidate)) return undefined;
  return projectPartialReasons([candidate])[0]?.message;
}

function safeAgenticSastCode(code: string | undefined): string | undefined {
  if (code !== undefined && /^[A-Z][A-Z0-9_]{0,63}$/u.test(code)) return code;
  return undefined;
}

function safeAgenticSastStageLabel(label: string | undefined): string | undefined {
  return label !== undefined && isCapellaTerminalStageLabel(label) ? label : undefined;
}

/** Keep normal PI names readable and losslessly quote any unexpected name. */
function formatToolName(tool: string): string {
  return /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(tool) ? tool : JSON.stringify(tool);
}

/** One self-describing first line per per-agent file, appended once when its lease opens. */
const AGENT_LOG_HEADER_PREFIX = '=== Shannon agent log: ';

function agentLogHeader(slug: string): string {
  return `${AGENT_LOG_HEADER_PREFIX}${slug} ===`;
}

/** Manages the one human-readable log for a scan workspace, plus its per-agent projection files. */
export class WorkflowLogger {
  private readonly logPath: string;
  private readonly sessionMetadata: SessionMetadata;
  private logStream: LogStream | null = null;
  private initializePromise: Promise<void> | null = null;
  private workflowId: string | undefined;
  // A pipeline agent's file lease, held from its start line to its end line so the agent's own
  // trace and lifecycle lines ride the reference count instead of reopening the file each write.
  private readonly agentLeases = new Map<string, LogStream>();

  private static traceTimestamp(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Append one line to the combined log. A failure here is swallowed and only warned about once
   * process-wide: the scan itself must keep running even if the log file becomes unwritable, so
   * this never throws back into agent or workflow logic.
   */
  private static async writeLine(workflowLogPath: string, line: string, flush: boolean): Promise<void> {
    let stream: LogStream | undefined;
    try {
      stream = await LogStream.acquire(workflowLogPath);
      await stream.write(`${line}\n`, flush);
    } catch {
      warnLoggingFailure();
    } finally {
      await stream?.release().catch(warnLoggingFailure);
    }
  }

  // Per-tool trace lines are high-frequency; a per-line fsync would dominate their cost.
  // They rely on the OS write buffer (visible to the tailing CLI) rather than durable flush,
  // while the low-frequency structural lines still fsync.
  private static writeTraceLine(workflowLogPath: string, line: string): Promise<void> {
    return WorkflowLogger.writeLine(workflowLogPath, line, false);
  }

  /**
   * Fan a formatted line out to an actor's per-agent projection file. Best-effort and isolated: a
   * failure here warns separately and never disturbs the canonical combined log. When a lifecycle
   * owner holds a lease on the file, this acquire/release rides its reference count and the stream
   * stays open; with no owner it opens per line, which is correct, just slower.
   */
  private static async fanOutLine(workflowLogPath: string, slug: string, line: string, flush: boolean): Promise<void> {
    let stream: LogStream | undefined;
    try {
      stream = await LogStream.acquire(agentLogPath(workflowLogPath, slug));
      await stream.write(`${line}\n`, flush);
    } catch {
      warnAgentLoggingFailure();
    } finally {
      await stream?.release().catch(warnAgentLoggingFailure);
    }
  }

  /**
   * Write one trace line to the combined log first, then fan it out to the actor's per-agent file.
   * A structurally unsafe actor drops the line from both, preserving the pre-existing fail-closed
   * behavior; an unnameable owning file skips the fan-out alone.
   */
  private static async writeProjectedTraceLine(
    workflowLogPath: string,
    actor: TraceActor,
    render: (prefix: string) => string,
  ): Promise<void> {
    const { combinedPrefix, agentFileSlug: slug } = projectActor(actor);
    if (combinedPrefix === undefined) return;
    const line = render(combinedPrefix);
    await WorkflowLogger.writeTraceLine(workflowLogPath, line);
    if (slug !== undefined) await WorkflowLogger.fanOutLine(workflowLogPath, slug, line, false);
  }

  /**
   * A flushed Capella stage lifecycle line: to the combined log first, then to the stage's own
   * per-agent file. The stage id is a closed field, so its slug is always safe.
   */
  private static async writeStageStructuralLine(
    workflowLogPath: string,
    stage: CapellaStage,
    line: string,
  ): Promise<void> {
    await WorkflowLogger.writeLine(workflowLogPath, line, true);
    const slug = safeAgentFileSlug(`agentic-sast-${stage}`);
    if (slug !== undefined) await WorkflowLogger.fanOutLine(workflowLogPath, slug, line, true);
  }

  /**
   * Acquire a per-agent file's lease and ensure its header is present. `appendIfAbsent` makes the
   * header idempotent, so reopening the same file across a Temporal retry or a resumed run never
   * duplicates it. Returns `null` on any failure rather than throwing, since an agent whose own
   * file cannot be opened must still be able to run and log to the combined file.
   */
  private static async openAgentLease(workflowLogPath: string, slug: string): Promise<LogStream | null> {
    try {
      const stream = await LogStream.acquire(agentLogPath(workflowLogPath, slug));
      const header = agentLogHeader(slug);
      await stream.appendIfAbsent(`${header}\n`, { marker: header, scope: 'whole-file', match: 'exact-line' });
      return stream;
    } catch {
      warnAgentLoggingFailure();
      return null;
    }
  }

  /**
   * Open and hold a Capella stage's per-agent file lease for the life of the stage activity. The
   * caller passes the handle back to {@link closeStageAgentLog} in its `finally`; while held, the
   * stage's concurrent session trace lines keep the file open through the shared reference count.
   */
  static openStageAgentLog(workflowLogPath: string, stage: CapellaStage): Promise<LogStream | null> {
    const slug = safeAgentFileSlug(`agentic-sast-${stage}`);
    if (slug === undefined) return Promise.resolve(null);
    return WorkflowLogger.openAgentLease(workflowLogPath, slug);
  }

  /** Release a stage's per-agent file lease. Best-effort: a failure never fails the stage. */
  static async closeStageAgentLog(lease: LogStream | null): Promise<void> {
    if (lease === null) return;
    await lease.release().catch(warnAgentLoggingFailure);
  }

  /** `[agent] read: {"path":"/src/routes"}` — one complete invocation per line. */
  static async logToolCall(workflowLogPath: string, actor: TraceActor, invocation: ToolInvocation): Promise<void> {
    const tool = formatToolName(invocation.tool);
    await WorkflowLogger.writeProjectedTraceLine(
      workflowLogPath,
      actor,
      (prefix) => `[${WorkflowLogger.traceTimestamp()}] [${prefix}] ${tool}: ${invocation.argumentsJson}`,
    );
  }

  /** The conditional second line: a failure, a slow success, or a collector's safe count. */
  static async logToolOutcome(workflowLogPath: string, actor: TraceActor, outcome: ToolOutcome): Promise<void> {
    const tool = formatToolName(outcome.tool);
    let suffix: string;
    if (outcome.kind === 'failed') {
      suffix = `${tool} failed (${formatDuration(Math.max(0, outcome.durationMs))})`;
    } else if (outcome.kind === 'slow') {
      suffix = `${tool} slow (${formatDuration(Math.max(0, outcome.durationMs))})`;
    } else {
      if (!isSafeCount(outcome.count)) return;
      suffix = `${tool}: submitted ${outcome.count} findings`;
    }
    await WorkflowLogger.writeProjectedTraceLine(
      workflowLogPath,
      actor,
      (prefix) => `[${WorkflowLogger.traceTimestamp()}] [${prefix}] ${suffix}`,
    );
  }

  /** `[parent] task: started subagent "entry point mapper"` — the single delegation line. */
  static async logDelegationStart(workflowLogPath: string, parent: LoggableAgentName, child: string): Promise<void> {
    if (!isLoggableAgentName(parent)) return;
    const identity = safeIdentityLabel(child);
    if (identity === undefined) return;
    await WorkflowLogger.writeProjectedTraceLine(
      workflowLogPath,
      { kind: 'agent', agent: parent },
      (prefix) => `[${WorkflowLogger.traceTimestamp()}] [${prefix}] task: started subagent "${identity}"`,
    );
  }

  /** `[actor] completed (1m 14s, 11 turns, 30 operations)` — a subagent or SAST session's terminal line. */
  static async logSessionComplete(
    workflowLogPath: string,
    actor: TraceActor,
    durationMs: number,
    turns: number,
    operations: number,
  ): Promise<void> {
    const safeTurns = isSafeCount(turns) ? turns : 0;
    const safeOperations = isSafeCount(operations) ? operations : 0;
    const duration = formatDuration(Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0);
    await WorkflowLogger.writeProjectedTraceLine(
      workflowLogPath,
      actor,
      (prefix) =>
        `[${WorkflowLogger.traceTimestamp()}] [${prefix}] completed (${duration}, ${safeTurns} turns, ${safeOperations} operations)`,
    );
  }

  /** `[actor] failed (2.1s, CHILD_TASK_FAILED)` — a subagent session's terminal failure line. */
  static async logSessionFailure(
    workflowLogPath: string,
    actor: TraceActor,
    code: ChildTaskFailureCode,
    durationMs: number,
  ): Promise<void> {
    const safeCode: ChildTaskFailureCode = code === 'CANCELLED' ? 'CANCELLED' : 'CHILD_TASK_FAILED';
    const status = safeCode === 'CANCELLED' ? 'cancelled' : 'failed';
    const duration = formatDuration(Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0);
    await WorkflowLogger.writeProjectedTraceLine(
      workflowLogPath,
      actor,
      (prefix) => `[${WorkflowLogger.traceTimestamp()}] [${prefix}] ${status} (${duration}, ${safeCode})`,
    );
  }

  /** A Capella stage's flushed structural start line: to the combined log and its own per-agent file. */
  static async logAgenticSastStart(
    workflowLogPath: string,
    stage: CapellaStage,
    attempt: number,
    maximumAttempts: number,
  ): Promise<void> {
    const safeAttempt = isSafeCount(attempt) ? attempt : 1;
    const safeMaximum = isSafeCount(maximumAttempts) ? maximumAttempts : safeAttempt;
    await WorkflowLogger.writeStageStructuralLine(
      workflowLogPath,
      stage,
      `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [AGENTIC-SAST] ${AGENTIC_SAST_STAGE_LABELS[stage]}: Starting (attempt ${safeAttempt} of ${safeMaximum})`,
    );
  }

  /** A Capella stage's flushed structural completion line, including reuse and dispatch counts when known. */
  static async logAgenticSastComplete(
    workflowLogPath: string,
    stage: CapellaStage,
    durationMs: number,
    reused: boolean,
    counts?: { readonly dispatchedCount: number; readonly resumedCount: number },
  ): Promise<void> {
    const details: string[] = [];
    if (counts !== undefined && isSafeCount(counts.dispatchedCount) && isSafeCount(counts.resumedCount)) {
      details.push(`${counts.dispatchedCount} dispatched`, `${counts.resumedCount} resumed`);
    }
    details.push(formatDuration(Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0));
    if (reused) details.push('reused');
    await WorkflowLogger.writeStageStructuralLine(
      workflowLogPath,
      stage,
      `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [AGENTIC-SAST] ${AGENTIC_SAST_STAGE_LABELS[stage]}: Completed (${details.join(', ')})`,
    );
  }

  /** A Capella stage's flushed structural failure line, noting whether Temporal will retry the attempt. */
  static async logAgenticSastFailure(
    workflowLogPath: string,
    stage: CapellaStage,
    attempt: number,
    maximumAttempts: number,
    code: string,
    retrying: boolean,
  ): Promise<void> {
    const safeAttempt = isSafeCount(attempt) ? attempt : 1;
    const safeMaximum = isSafeCount(maximumAttempts) ? maximumAttempts : safeAttempt;
    const safeCode = safeAgenticSastCode(code) ?? 'ACTIVITY_FAILURE';
    const outcome = retrying ? 'Failed, retrying' : 'Failed';
    await WorkflowLogger.writeStageStructuralLine(
      workflowLogPath,
      stage,
      `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [AGENTIC-SAST] ${AGENTIC_SAST_STAGE_LABELS[stage]}: ${outcome} (attempt ${safeAttempt} of ${safeMaximum}, ${safeCode})`,
    );
  }

  /** A Capella stage's flushed structural cancellation line. */
  static async logAgenticSastCancelled(
    workflowLogPath: string,
    stage: CapellaStage,
    attempt: number,
    maximumAttempts: number,
  ): Promise<void> {
    const safeAttempt = isSafeCount(attempt) ? attempt : 1;
    const safeMaximum = isSafeCount(maximumAttempts) ? maximumAttempts : safeAttempt;
    await WorkflowLogger.writeStageStructuralLine(
      workflowLogPath,
      stage,
      `[${new Date().toISOString().replace('T', ' ').slice(0, 19)}] [AGENTIC-SAST] ${AGENTIC_SAST_STAGE_LABELS[stage]}: Cancelled (attempt ${safeAttempt} of ${safeMaximum}, CANCELLED)`,
    );
  }

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    this.logPath = generateWorkflowLogPath(sessionMetadata);
  }

  setWorkflowId(workflowId: string): void {
    this.workflowId = safeWorkflowIdentifier(workflowId);
  }

  /**
   * Open the combined-log stream and write its header, memoizing the in-flight promise so
   * concurrent first calls on this instance share one open attempt instead of racing to open
   * the file and write the header twice.
   */
  async initialize(workflowId?: string): Promise<void> {
    if (workflowId !== undefined) this.setWorkflowId(workflowId);
    if (this.logStream !== null) return;
    if (this.initializePromise === null) {
      this.initializePromise = this.openAndWriteHeader();
    }
    await this.initializePromise;
  }

  private async openAndWriteHeader(): Promise<void> {
    try {
      this.logStream = await LogStream.acquire(this.logPath);
      const workflowId = safeWorkflowIdentifier(this.workflowId ?? this.sessionMetadata.id);
      const header = [
        '================================================================================',
        'Shannon Pentest - Scan Log',
        '================================================================================',
        `Workflow ID: ${workflowId}`,
        `Target URL:  ${safeTargetUrl(this.sessionMetadata.webUrl)}`,
        `Started:     ${formatTimestamp()}`,
        '================================================================================',
        '',
      ].join('\n');
      await this.logStream.appendIfAbsent(header, {
        marker: 'Shannon Pentest - Scan Log',
        scope: 'whole-file',
        match: 'exact-line',
      });
    } catch {
      this.logStream = null;
      warnLoggingFailure();
    }
  }

  private formatLogTime(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Run a structural write against the combined-log stream, opening it first if needed. If the
   * stream never opened, or `operation` throws, this resolves quietly after warning once: a
   * logging fault must never surface as a thrown error to the phase, agent, or resume logic
   * calling in.
   */
  private async withStream(operation: (stream: LogStream) => Promise<unknown>): Promise<void> {
    await this.initialize();
    if (this.logStream === null) return;
    try {
      await operation(this.logStream);
    } catch {
      warnLoggingFailure();
    }
  }

  /**
   * Append one idempotent structural marker to every existing per-agent file. Used for the resume
   * boundary and the terminal marker, which each file needs so a `--agent` tail can tell a resume
   * from a fresh run and can self-terminate. Best-effort: any file that fails is skipped.
   */
  private async fanOutMarkerToAgents(markerLine: string): Promise<void> {
    const directory = agentsDir(this.logPath);
    let entries: string[];
    try {
      entries = await fsPromises.readdir(directory);
    } catch {
      // No agents directory yet — nothing has been projected, so there is nothing to mark.
      return;
    }
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.log'))
        .map(async (entry) => {
          let stream: LogStream | undefined;
          try {
            stream = await LogStream.acquire(path.join(directory, entry));
            await stream.appendIfAbsent(`${markerLine}\n`, {
              marker: markerLine,
              scope: 'whole-file',
              match: 'exact-line',
              flush: true,
            });
          } catch {
            warnAgentLoggingFailure();
          } finally {
            await stream?.release().catch(warnAgentLoggingFailure);
          }
        }),
    );
  }

  async logResumeBoundary(newWorkflowIdValue: string): Promise<void> {
    const newWorkflowId = safeWorkflowIdentifier(newWorkflowIdValue);
    const marker = `New Workflow ID:      ${newWorkflowId}`;
    const header = [
      '',
      '================================================================================',
      'RESUMED',
      '================================================================================',
      marker,
      `Resumed At:           ${formatTimestamp()}`,
      '================================================================================',
      '',
    ].join('\n');
    await this.withStream((stream) =>
      stream.appendIfAbsent(header, { marker, scope: 'whole-file', match: 'exact-line', flush: true }),
    );
    // A per-resume-distinct, per-file-idempotent boundary; a bare timestamp could not tell a
    // Temporal retry from a new execution.
    await this.fanOutMarkerToAgents(`--- RESUMED (${newWorkflowId}) ---`);
  }

  /** Append the resume checkpoint and completed-agent count beneath an already-written resume boundary. */
  async logResumeDetails(resumeInfo: {
    readonly previousWorkflowId: string;
    readonly newWorkflowId: string;
    readonly checkpointHash: string;
    readonly completedAgents: readonly string[];
  }): Promise<void> {
    const previousWorkflowId = safeWorkflowIdentifier(resumeInfo.previousWorkflowId);
    const newWorkflowId = safeWorkflowIdentifier(resumeInfo.newWorkflowId);
    const checkpointHash = /^[a-f0-9]{7,64}$/u.test(resumeInfo.checkpointHash) ? resumeInfo.checkpointHash : 'unknown';
    const completedAgents = resumeInfo.completedAgents.filter(isLoggableAgentName);
    const marker = `Resume checkpoint (${newWorkflowId}): ${checkpointHash}`;
    const details = [
      `Previous Workflow ID: ${previousWorkflowId}`,
      marker,
      `Completed:            ${completedAgents.length} agents (${completedAgents.join(', ')})`,
    ].join('\n');
    await this.withStream((stream) =>
      stream.appendIfAbsent(`${details}\n`, { marker, scope: 'whole-file', match: 'exact-line', flush: true }),
    );
  }

  async logPhase(phase: WorkflowPhase, event: 'start' | 'complete'): Promise<void> {
    if (!isWorkflowPhase(phase)) return;
    const action = event === 'start' ? 'Starting' : 'Completed';
    const suffix = `[PHASE] ${action}: ${phase}`;
    const line = `${event === 'start' ? '\n' : ''}[${this.formatLogTime()}] ${suffix}\n`;
    await this.withStream((stream) =>
      stream.appendIfAbsent(line, { marker: suffix, scope: 'current-execution', match: 'line-suffix' }),
    );
  }

  private async ensureAgentLease(agentName: LoggableAgentName): Promise<void> {
    const slug = safeAgentFileSlug(agentName);
    if (slug === undefined || this.agentLeases.has(slug)) return;
    const lease = await WorkflowLogger.openAgentLease(this.logPath, slug);
    if (lease !== null) this.agentLeases.set(slug, lease);
  }

  private async releaseAgentLease(agentName: LoggableAgentName): Promise<void> {
    const slug = safeAgentFileSlug(agentName);
    if (slug === undefined) return;
    const lease = this.agentLeases.get(slug);
    if (lease === undefined) return;
    this.agentLeases.delete(slug);
    await lease.release().catch(warnAgentLoggingFailure);
  }

  /**
   * Release a pipeline agent's held per-agent file lease if one is open. Idempotent and
   * best-effort: a backstop for an abnormal abort where the agent's end line never ran, so the
   * file handle never outlives the activity. A normal end has already released it, making this a
   * no-op.
   */
  async releaseAgentLog(agentName: LoggableAgentName): Promise<void> {
    if (!isLoggableAgentName(agentName)) return;
    await this.releaseAgentLease(agentName);
  }

  /**
   * Write a pipeline agent's start or end line to the combined log and its per-agent file. The
   * per-agent lease opens on `start`, before the header line, and is released on `end`, after the
   * closing line, so the file stays open for the agent's own duration rather than reopening per
   * trace line.
   */
  async logAgent(agentName: LoggableAgentName, event: 'start' | 'end', details: AgentLogDetails = {}): Promise<void> {
    if (!isLoggableAgentName(agentName)) return;
    let message: string;
    if (event === 'start') {
      const attempt = isSafeCount(details.attemptNumber ?? 1) ? (details.attemptNumber ?? 1) : 1;
      message = `${agentName}: Starting (attempt ${attempt})`;
    } else {
      const status = details.success === false ? 'Failed' : 'Completed';
      const code = details.success === false && details.errorCode !== undefined ? ` (${details.errorCode})` : '';
      const outcomeDetails: string[] = [];
      if (details.duration_ms !== undefined) outcomeDetails.push(formatDuration(Math.max(0, details.duration_ms)));
      if (details.cost_usd !== undefined && Number.isFinite(details.cost_usd)) {
        outcomeDetails.push(`$${Math.max(0, details.cost_usd).toFixed(4)}`);
      }
      const suffix = outcomeDetails.length === 0 ? '' : ` (${outcomeDetails.join(', ')})`;
      message = `${agentName}: ${status}${code}${suffix}`;
    }
    // Open the lease before the start line so the file's header lands first and the agent's
    // trace lines through the run ride an already-open handle.
    if (event === 'start') await this.ensureAgentLease(agentName);
    const line = `[${this.formatLogTime()}] [AGENT] ${message}`;
    await this.withStream((stream) => stream.write(`${line}\n`));
    const slug = safeAgentFileSlug(agentName);
    if (slug !== undefined) await WorkflowLogger.fanOutLine(this.logPath, slug, line, false);
    // Release after the end line so the closing line still rides the lease.
    if (event === 'end') await this.releaseAgentLease(agentName);
  }

  /** A one-line, closed-vocabulary error record for an agent attempt, written to both the combined and per-agent logs. */
  async logAgentError(
    agentName: LoggableAgentName,
    code: ErrorCode,
    category: string,
    attempt: number,
    durationMs: number,
    turns: number,
  ): Promise<void> {
    if (!isLoggableAgentName(agentName)) return;
    const safe = safeErrorFromCode(code);
    const safeAttempt = isSafeCount(attempt) ? attempt : 0;
    const safeTurns = isSafeCount(turns) ? turns : 0;
    const safeDuration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const safeCategory = /^(?:config|network|prompt|filesystem|validation|unknown)$/u.test(category)
      ? category
      : 'unknown';
    const line = `[${this.formatLogTime()}] [${agentName}] [ERROR] ${safe.code} (${safeCategory}, attempt ${safeAttempt}, ${formatDuration(safeDuration)}, ${safeTurns} turns)`;
    await this.withStream((stream) => stream.write(`${line}\n`));
    const slug = safeAgentFileSlug(agentName);
    if (slug !== undefined) await WorkflowLogger.fanOutLine(this.logPath, slug, line, false);
  }

  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    const statusHeaders: Record<WorkflowSummary['status'], string> = {
      completed: 'COMPLETED',
      partial: 'PARTIAL',
      cancelled: 'CANCELLED',
      failed: 'FAILED',
    };
    const status = statusHeaders[summary.status];
    const completedAgents = summary.completedAgents.filter(isLoggableAgentName);
    const skippedAgents = (summary.skippedAgents ?? []).filter(isLoggableAgentName);
    const lines = [
      '',
      '================================================================================',
      `Scan ${status}`,
      '────────────────────────────────────────',
      `Workflow ID: ${safeWorkflowIdentifier(this.workflowId ?? this.sessionMetadata.id)}`,
      `Status:      ${summary.status}`,
      `Duration:    ${formatDuration(Math.max(0, summary.totalDurationMs))}`,
      `Total Cost:  $${Math.max(0, summary.totalCostUsd).toFixed(4)}`,
      `Agents:      ${completedAgents.length} ran, ${skippedAgents.length} skipped`,
    ];
    if (summary.usageAccountingComplete === false) {
      lines.push('Cost Note:   Cost is incomplete — some background work is not included in this total.');
    }
    if (summary.errorCode !== undefined) {
      const safeError = safeErrorFromCode(summary.errorCode);
      lines.push(`Error:       ${safeError.message}`);
      lines.push(`             ${safeError.code}`);
    }

    const partialMessages = (summary.partialReasons ?? [])
      .map(safeReasonMessage)
      .filter((message): message is string => message !== undefined);
    if (partialMessages.length > 0) {
      lines.push('', 'Why this scan is partial:');
      for (const message of partialMessages) lines.push(`  - ${message}`);
    }

    const failedStage = safeAgenticSastStageLabel(summary.agenticSastFailedStage);
    const failureMessage = summary.agenticSastFailureMessage;
    if (failedStage !== undefined && failureMessage !== undefined && isCapellaSafeFailureMessage(failureMessage)) {
      lines.push('', `Agentic SAST stopped at: ${failedStage}`);
      lines.push(`What happened: ${failureMessage}`);
      const failureCode = safeAgenticSastCode(summary.agenticSastErrorCode);
      if (failureCode !== undefined) lines.push(`Reference code (for a bug report): ${failureCode}`);
    }

    if (completedAgents.length > 0 || skippedAgents.length > 0) {
      lines.push('', 'Agent Breakdown:');
      for (const agentName of completedAgents) {
        const metrics = summary.agentMetrics[agentName];
        if (metrics === undefined) {
          lines.push(`  - ${agentName}`);
          continue;
        }
        const cost = metrics.costUsd === null ? 'N/A' : `$${Math.max(0, metrics.costUsd).toFixed(4)}`;
        lines.push(`  - ${agentName} (${formatDuration(Math.max(0, metrics.durationMs))}, ${cost})`);
      }
      for (const agentName of skippedAgents) lines.push(`  - ${agentName} (skipped — nothing to exploit)`);
    }
    lines.push('================================================================================');

    const marker = `Scan ${status}`;
    await this.withStream((stream) =>
      stream.appendIfAbsent(`${lines.join('\n')}\n`, {
        marker,
        scope: 'current-execution',
        match: 'exact-line',
        flush: true,
      }),
    );
    // The same bare heading the combined log carries, so a `--agent` tail terminates on the file
    // alone when Temporal's status is no longer available (e.g. past its retention window).
    await this.fanOutMarkerToAgents(marker);
  }

  /**
   * Release every lease this instance currently holds, then release the combined-log stream
   * itself. This tears down all of this instance's open per-agent leases unconditionally, not
   * just one caller's, so an instance must never be shared between agents running concurrently:
   * one agent's `close()` would sever another's still-open lease. Callers close after each
   * logical unit of work (an agent's end, a phase boundary) for exactly this reason, and each
   * concurrent agent is given its own `WorkflowLogger`/`AuditSession` instance rather than a
   * shared one.
   */
  async close(): Promise<void> {
    for (const [slug, lease] of this.agentLeases) {
      this.agentLeases.delete(slug);
      await lease.release().catch(warnAgentLoggingFailure);
    }
    await this.initializePromise;
    if (this.logStream === null) {
      this.initializePromise = null;
      return;
    }
    await this.logStream.release().catch(warnLoggingFailure);
    this.logStream = null;
    this.initializePromise = null;
  }
}
