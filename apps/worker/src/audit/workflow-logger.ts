// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow Logger
 *
 * Provides a unified, human-readable log file per workflow.
 * Optimized for `tail -f` viewing during concurrent workflow execution.
 */

import fs from 'node:fs/promises';
import { formatDuration, formatTimestamp } from '../utils/formatting.js';
import { LogStream } from './log-stream.js';
import { generateWorkflowLogPath, type SessionMetadata } from './utils.js';

export interface AgentLogDetails {
  attemptNumber?: number;
  duration_ms?: number;
  cost_usd?: number;
  success?: boolean;
  error?: string;
}

export interface AgentMetricsSummary {
  durationMs: number;
  costUsd: number | null;
}

/** Mirror of the derived partial-reason view; the safe message is already resolved. */
export interface WorkflowSummaryPartialReason {
  readonly code: string;
  readonly message: string;
  readonly vulnerabilityClass?: string;
  readonly stage?: string;
}

export interface WorkflowSummary {
  status: 'completed' | 'failed' | 'cancelled' | 'partial';
  totalDurationMs: number;
  totalCostUsd: number;
  /** Agents that actually ran. Mutually exclusive from `skippedAgents`. */
  completedAgents: string[];
  /** Expected agents that never ran because their class had nothing to exploit. */
  skippedAgents?: readonly string[];
  agentMetrics: Record<string, AgentMetricsSummary>;
  /** Ordered durable degradation reasons; present and non-empty exactly for partial runs. */
  partialReasons?: readonly WorkflowSummaryPartialReason[];
  /** False when operational (Capella/reconciliation) spend is known to be incomplete. */
  usageAccountingComplete?: boolean;
  /** Reader-facing name of the stage a failed agentic-SAST run stopped at. */
  agenticSastFailedStage?: string;
  /** Sanitized failure sentence from a failed agentic-SAST run; safe for operator output. */
  agenticSastFailureMessage?: string;
  /** Bounded machine code from a failed agentic-SAST run, when one was preserved. */
  agenticSastErrorCode?: string;
  error?: string;
}

/**
 * WorkflowLogger - Manages the unified workflow log file
 */
export class WorkflowLogger {
  private readonly sessionMetadata: SessionMetadata;
  private readonly logStream: LogStream;
  private workflowId: string | undefined;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    const logPath = generateWorkflowLogPath(sessionMetadata);
    this.logStream = new LogStream(logPath);
  }

  /**
   * Initialize the log stream (creates file and writes header)
   */
  async initialize(workflowId?: string): Promise<void> {
    if (workflowId) {
      this.workflowId = workflowId;
    }

    if (this.logStream.isOpen) {
      return;
    }

    await this.logStream.open();

    // Write header only if file is new (empty)
    const stats = await fs.stat(this.logStream.path).catch(() => null);
    if (!stats || stats.size === 0) {
      await this.writeHeader();
    }
  }

  /**
   * Write header to log file
   */
  private async writeHeader(): Promise<void> {
    const lines = [
      `================================================================================`,
      `Shannon Pentest - Scan Log`,
      `================================================================================`,
      `Workflow ID: ${this.workflowId ?? this.sessionMetadata.id}`,
      `Target URL:  ${this.sessionMetadata.webUrl}`,
      `Started:     ${formatTimestamp()}`,
    ];

    lines.push(`================================================================================`, ``);

    return this.logStream.write(lines.join('\n'));
  }

  /**
   * Write resume header to log file when workflow is resumed
   */
  async logResumeHeader(resumeInfo: {
    previousWorkflowId: string;
    newWorkflowId: string;
    checkpointHash: string;
    completedAgents: string[];
  }): Promise<void> {
    await this.ensureInitialized();

    const header = [
      ``,
      `================================================================================`,
      `RESUMED`,
      `================================================================================`,
      `Previous Workflow ID: ${resumeInfo.previousWorkflowId}`,
      `New Workflow ID:      ${resumeInfo.newWorkflowId}`,
      `Resumed At:           ${formatTimestamp()}`,
      `Checkpoint:           ${resumeInfo.checkpointHash}`,
      `Completed:            ${resumeInfo.completedAgents.length} agents (${resumeInfo.completedAgents.join(', ')})`,
      `================================================================================`,
      ``,
    ].join('\n');

    return this.logStream.write(header);
  }

  /**
   * Format timestamp for log line (UTC, human readable)
   */
  private formatLogTime(): string {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, 19);
  }

  /**
   * Log a phase transition event
   */
  async logPhase(phase: string, event: 'start' | 'complete'): Promise<void> {
    await this.ensureInitialized();

    const action = event === 'start' ? 'Starting' : 'Completed';
    const line = `[${this.formatLogTime()}] [PHASE] ${action}: ${phase}\n`;

    // Add blank line before phase start for readability
    if (event === 'start') {
      await this.logStream.write('\n');
    }

    await this.logStream.write(line);
  }

  /**
   * Log an agent event
   */
  async logAgent(agentName: string, event: 'start' | 'end', details?: AgentLogDetails): Promise<void> {
    await this.ensureInitialized();

    let message: string;

    if (event === 'start') {
      const attempt = details?.attemptNumber ?? 1;
      message = `${agentName}: Starting (attempt ${attempt})`;
    } else {
      const parts: string[] = [`${agentName}:`];

      if (details?.success === false) {
        parts.push('Failed');
        if (details?.error) {
          parts.push(`- ${details.error}`);
        }
      } else {
        parts.push('Completed');
      }

      if (details?.duration_ms !== undefined) {
        parts.push(`(${formatDuration(details.duration_ms)}`);
        if (details?.cost_usd !== undefined) {
          parts.push(`$${details.cost_usd.toFixed(2)})`);
        } else {
          parts.push(')');
        }
      }

      message = parts.join(' ');
    }

    const line = `[${this.formatLogTime()}] [AGENT] ${message}\n`;
    await this.logStream.write(line);
  }

  /**
   * Log a general event
   */
  async logEvent(eventType: string, message: string): Promise<void> {
    await this.ensureInitialized();

    const line = `[${this.formatLogTime()}] [${eventType.toUpperCase()}] ${message}\n`;
    await this.logStream.write(line);
  }

  /**
   * Log an error
   */
  async logError(error: Error, context?: string): Promise<void> {
    await this.ensureInitialized();

    const contextStr = context ? ` (${context})` : '';
    const line = `[${this.formatLogTime()}] [ERROR] ${error.message}${contextStr}\n`;
    await this.logStream.write(line);
  }

  /**
   * Truncate string to max length with ellipsis
   */
  private truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return `${str.slice(0, maxLen - 3)}...`;
  }

  /**
   * Format tool parameters for human-readable display
   */
  private formatToolParams(toolName: string, params: unknown): string {
    if (!params || typeof params !== 'object') {
      return '';
    }

    const p = params as Record<string, unknown>;

    // Tool-specific formatting for common tools
    switch (toolName) {
      case 'Bash':
        if (p.command) {
          return this.truncate(String(p.command).replace(/\n/g, ' '), 100);
        }
        break;
      case 'Read':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Write':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Edit':
        if (p.file_path) {
          return String(p.file_path);
        }
        break;
      case 'Glob':
        if (p.pattern) {
          return String(p.pattern);
        }
        break;
      case 'Grep':
        if (p.pattern) {
          const path = p.path ? ` in ${p.path}` : '';
          return `"${this.truncate(String(p.pattern), 50)}"${path}`;
        }
        break;
      case 'WebFetch':
        if (p.url) {
          return String(p.url);
        }
        break;
    }

    // Default: show first string-valued param truncated
    for (const [key, val] of Object.entries(p)) {
      if (typeof val === 'string' && val.length > 0) {
        return `${key}=${this.truncate(val, 60)}`;
      }
    }

    return '';
  }

  /**
   * Log tool start event
   */
  async logToolStart(agentName: string, toolName: string, parameters: unknown): Promise<void> {
    await this.ensureInitialized();

    const params = this.formatToolParams(toolName, parameters);
    const paramStr = params ? `: ${params}` : '';
    const line = `[${this.formatLogTime()}] [${agentName}] [TOOL] ${toolName}${paramStr}\n`;
    await this.logStream.write(line);
  }

  /**
   * Log LLM response
   */
  async logLlmResponse(agentName: string, turn: number, content: string): Promise<void> {
    await this.ensureInitialized();

    // Show full content, replacing newlines with escaped version for single-line output
    const escaped = content.replace(/\n/g, '\\n');
    const line = `[${this.formatLogTime()}] [${agentName}] [LLM] Turn ${turn}: ${escaped}\n`;
    await this.logStream.write(line);
  }

  /**
   * Format a pipe-delimited error string into indented multi-line display.
   *
   * Input:  "phase context|ErrorType|message|Hint: ..."
   * Output: "Error:       phase context\n             ErrorType\n             ..."
   */
  private formatErrorBlock(errorString: string): string {
    const label = 'Error:       ';
    const indent = ' '.repeat(label.length);

    // Segments are delimited by '|'; a segment's own embedded newlines (e.g. a multi-line
    // validation message) become their own lines so each aligns under the label.
    const lines = errorString
      .split(/[|\n]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0);

    return `${lines.map((line, i) => (i === 0 ? `${label}${line}` : `${indent}${line}`)).join('\n')}\n`;
  }

  /**
   * Log workflow completion with full summary
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();

    // Each terminal status prints its own header so partial and cancelled runs are never
    // mislabelled as full successes or failures. The CLI log tailer stops on exactly these
    // headings (COMPLETION_PATTERN in apps/cli/src/commands/logs.ts); adding one here without
    // adding it there strands `shannon logs` on a finished scan.
    const STATUS_HEADERS: Record<WorkflowSummary['status'], string> = {
      completed: 'COMPLETED',
      partial: 'PARTIAL',
      cancelled: 'CANCELLED',
      failed: 'FAILED',
    };
    const status = STATUS_HEADERS[summary.status];

    // completedAgents and skippedAgents are mutually exclusive: an agent that was skipped
    // because its class had nothing to exploit is tracked only in skippedAgents.
    const skippedAgents = summary.skippedAgents ?? [];
    const ranCount = summary.completedAgents.length;

    const lines: string[] = [
      '',
      '================================================================================',
      `Scan ${status}`,
      '────────────────────────────────────────',
      `Workflow ID: ${this.workflowId ?? this.sessionMetadata.id}`,
      `Status:      ${summary.status}`,
      `Duration:    ${formatDuration(summary.totalDurationMs)}`,
      `Total Cost:  $${summary.totalCostUsd.toFixed(4)}`,
      `Agents:      ${ranCount} ran, ${skippedAgents.length} skipped`,
    ];
    if (summary.usageAccountingComplete === false) {
      lines.push('Cost Note:   Cost is incomplete — some background work is not included in this total.');
    }

    if (summary.error) {
      lines.push(this.formatErrorBlock(summary.error).trimEnd());
    }

    if (summary.partialReasons !== undefined && summary.partialReasons.length > 0) {
      lines.push('');
      lines.push('Why this scan is partial:');
      for (const reason of summary.partialReasons) {
        lines.push(`  - ${reason.message}`);
      }
      // The reason above says what degraded; these three name the agentic-SAST failure
      // behind it, under the same labels the terminal and worker output use.
      if (summary.agenticSastFailedStage !== undefined) {
        lines.push(`  Agentic SAST stopped at: ${summary.agenticSastFailedStage}`);
      }
      if (summary.agenticSastFailureMessage !== undefined) {
        lines.push(`  What happened: ${summary.agenticSastFailureMessage}`);
      }
      if (summary.agenticSastErrorCode !== undefined) {
        lines.push(`  Reference code (for a bug report): ${summary.agenticSastErrorCode}`);
      }
    }

    if (summary.completedAgents.length > 0 || skippedAgents.length > 0) {
      lines.push('');
      lines.push('Agent Breakdown:');

      for (const agentName of summary.completedAgents) {
        const metrics = summary.agentMetrics[agentName];
        if (metrics) {
          const duration = formatDuration(metrics.durationMs);
          const cost = metrics.costUsd !== null ? `$${metrics.costUsd.toFixed(4)}` : 'N/A';
          lines.push(`  - ${agentName} (${duration}, ${cost})`);
        } else {
          lines.push(`  - ${agentName}`);
        }
      }
      for (const agentName of skippedAgents) {
        lines.push(`  - ${agentName} (skipped — nothing to exploit)`);
      }
    }
    for (const agentName of skippedAgents) {
      lines.push(`  - ${agentName} (skipped — nothing to exploit)`);
    }

    lines.push('================================================================================');

    // Single atomic write to prevent interleaved/duplicate output in log tailers
    await this.logStream.write(`${lines.join('\n')}\n`);
  }

  /**
   * Ensure initialized (helper for lazy initialization)
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.logStream.isOpen) {
      await this.initialize();
    }
  }

  /**
   * Close the log stream
   */
  async close(): Promise<void> {
    return this.logStream.close();
  }
}
