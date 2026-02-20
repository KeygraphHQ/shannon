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

import fs from 'fs/promises';
import { generateWorkflowLogPath, type SessionMetadata } from './utils.js';
import { formatDuration, formatTimestamp } from '../utils/formatting.js';
import { LogStream } from './log-stream.js';

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

export interface WorkflowSummary {
  status: 'completed' | 'failed';
  totalDurationMs: number;
  totalCostUsd: number;
  completedAgents: string[];
  agentMetrics: Record<string, AgentMetricsSummary>;
  error?: string;
}

/**
 * WorkflowLogger - Manages the unified workflow log file
 */
export class WorkflowLogger {
  private readonly sessionMetadata: SessionMetadata;
  private readonly logStream: LogStream;

  constructor(sessionMetadata: SessionMetadata) {
    this.sessionMetadata = sessionMetadata;
    const logPath = generateWorkflowLogPath(sessionMetadata);
    this.logStream = new LogStream(logPath);
  }

  /**
   * Initialize the log stream (creates file and writes header)
   */
  async initialize(): Promise<void> {
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
    const header = [
      `================================================================================`,
      `Shannon Pentest - Workflow Log`,
      `================================================================================`,
      `Workflow ID: ${this.sessionMetadata.id}`,
      `Target URL:  ${this.sessionMetadata.webUrl}`,
      `Started:     ${formatTimestamp()}`,
      `================================================================================`,
      ``,
    ].join('\n');

    return this.logStream.write(header);
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
   * Format timestamp for log line (local time, human readable)
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
  async logAgent(
    agentName: string,
    event: 'start' | 'end',
    details?: AgentLogDetails
  ): Promise<void> {
    await this.ensureInitialized();

    let message: string;

    if (event === 'start') {
      const attempt = details?.attemptNumber ?? 1;
      message = `${agentName}: Starting (attempt ${attempt})`;
    } else {
      const parts: string[] = [agentName + ':'];

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
    return str.slice(0, maxLen - 3) + '...';
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
      case 'mcp__playwright__browser_navigate':
        if (p.url) {
          return String(p.url);
        }
        break;
      case 'mcp__playwright__browser_click':
        if (p.selector) {
          return this.truncate(String(p.selector), 60);
        }
        break;
      case 'mcp__playwright__browser_type':
        if (p.selector) {
          const text = p.text ? `: "${this.truncate(String(p.text), 30)}"` : '';
          return `${this.truncate(String(p.selector), 40)}${text}`;
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
    const segments = errorString.split('|');
    const label = 'Error:       ';
    const indent = ' '.repeat(label.length);

    const lines = segments.map((segment, i) =>
      i === 0 ? `${label}${segment.trim()}` : `${indent}${segment.trim()}`
    );

    return lines.join('\n') + '\n';
  }

  /**
   * Log workflow completion with full summary
   */
  async logWorkflowComplete(summary: WorkflowSummary): Promise<void> {
    await this.ensureInitialized();

    const status = summary.status === 'completed' ? 'COMPLETED' : 'FAILED';

    await this.logStream.write('\n');
    await this.logStream.write(`================================================================================\n`);
    await this.logStream.write(`Workflow ${status}\n`);
    await this.logStream.write(`────────────────────────────────────────\n`);
    await this.logStream.write(`Workflow ID: ${this.sessionMetadata.id}\n`);
    await this.logStream.write(`Status:      ${summary.status}\n`);
    await this.logStream.write(`Duration:    ${formatDuration(summary.totalDurationMs)}\n`);
    await this.logStream.write(`Total Cost:  $${summary.totalCostUsd.toFixed(4)}\n`);
    await this.logStream.write(`Agents:      ${summary.completedAgents.length} completed\n`);

    if (summary.error) {
      await this.logStream.write(this.formatErrorBlock(summary.error));
    }

    await this.logStream.write(`\n`);
    await this.logStream.write(`Agent Breakdown:\n`);

    for (const agentName of summary.completedAgents) {
      const metrics = summary.agentMetrics[agentName];
      if (metrics) {
        const duration = formatDuration(metrics.durationMs);
        const cost = metrics.costUsd !== null ? `$${metrics.costUsd.toFixed(4)}` : 'N/A';
        await this.logStream.write(`  - ${agentName} (${duration}, ${cost})\n`);
      } else {
        await this.logStream.write(`  - ${agentName}\n`);
      }
    }

    await this.logStream.write(`================================================================================\n`);
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
