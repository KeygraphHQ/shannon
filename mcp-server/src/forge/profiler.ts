// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Profiler (Modules 1-2)
 *
 * Tracks every skill execution: duration, tokens, success rate.
 *
 * Two interception strategies:
 * 1. profileTool() — wraps MCP tool handlers with timing + logging
 * 2. logAgentPhaseExecution() — called at agent completion to record phase metrics
 *
 * All data is written to forge.db via the ForgeDatabase layer.
 */

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { getForgeDb } from './db.js';
import type {
  ExecutionLogEntry,
  SkillType,
  AgentPhaseMetadata,
  ToolMetadata,
} from './types.js';
import type { ToolResult } from '../types/tool-responses.js';

// ---------------------------------------------------------------------------
// Session tracking (set per-workflow)
// ---------------------------------------------------------------------------

let _currentSessionId = 'default';
let _currentAgentName = 'unknown';

export function setForgeSessionId(sessionId: string): void {
  _currentSessionId = sessionId;
}

export function setForgeAgentName(agentName: string): void {
  _currentAgentName = agentName;
}

export function getForgeSessionId(): string {
  return _currentSessionId;
}

// ---------------------------------------------------------------------------
// MCP Tool profiling wrapper
// ---------------------------------------------------------------------------

/**
 * Wraps an MCP tool handler with profiling instrumentation.
 * Records execution time, success/failure, and optional metadata.
 *
 * @example
 * ```ts
 * const profiledHandler = profileTool(originalHandler, 'generate_totp');
 * ```
 */
export function profileTool<T>(
  toolFn: (args: T) => Promise<ToolResult>,
  skillId: string
): (args: T) => Promise<ToolResult> {
  return async (args: T): Promise<ToolResult> => {
    const startedAt = new Date().toISOString();
    const startMs = performance.now();
    let success = true;
    let errorType: string | null = null;
    let errorMessage: string | null = null;
    let result: ToolResult;

    try {
      result = await toolFn(args);
      if (result.isError) {
        success = false;
        errorType = 'ToolError';
        // Extract error message from result content
        const text = result.content[0]?.text;
        if (text) {
          try {
            const parsed = JSON.parse(text);
            errorMessage = parsed.message ?? text.slice(0, 200);
            errorType = parsed.errorType ?? 'ToolError';
          } catch {
            errorMessage = text.slice(0, 200);
          }
        }
      }
    } catch (err) {
      success = false;
      errorType = err instanceof Error ? err.constructor.name : 'UnknownError';
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      const durationMs = Math.round(performance.now() - startMs);
      const finishedAt = new Date().toISOString();

      // Compute input/output size as a proxy for tokens
      const inputJson = JSON.stringify(args);
      const outputJson = result! ? (result.content[0]?.text ?? '') : '';

      const metadata: ToolMetadata = {
        caller_agent: _currentAgentName,
        input_size_bytes: Buffer.byteLength(inputJson, 'utf-8'),
        output_size_bytes: Buffer.byteLength(outputJson, 'utf-8'),
        validation_performed: outputJson.includes('"validated"'),
      };

      const entry: Omit<ExecutionLogEntry, 'id'> = {
        session_id: _currentSessionId,
        skill_type: 'mcp_tool',
        skill_id: skillId,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_ms: durationMs,
        tokens_in: estimateTokens(inputJson),
        tokens_out: estimateTokens(outputJson),
        cost_usd: null, // MCP tools don't have direct LLM cost
        success,
        error_type: errorType,
        error_message: errorMessage,
        version_id: 'original',
        metadata: JSON.stringify(metadata),
      };

      try {
        getForgeDb().insertExecution(entry);
      } catch {
        // Profiling should never break the tool — fail silently
      }
    }

    return result!;
  };
}

// ---------------------------------------------------------------------------
// Agent phase profiling
// ---------------------------------------------------------------------------

export interface AgentPhaseInput {
  agentName: string;
  phase: string;
  targetUrl: string;
  repoPath: string;
  promptName: string;
  promptContent: string;
  configContent?: string;
  durationMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  numTurns: number;
  success: boolean;
  errorType?: string;
  errorMessage?: string;
  toolsCalled: string[];
  deliverablesProduced: string[];
  vulnsFound: number;
  exploitsAttempted: number;
  exploitsSucceeded: number;
}

/**
 * Record an agent phase execution in forge.db.
 * Called at agent completion from the activity layer.
 */
export function logAgentPhaseExecution(input: AgentPhaseInput): void {
  const metadata: AgentPhaseMetadata = {
    agent_name: input.agentName,
    phase: input.phase,
    target_url: input.targetUrl,
    repo_path: input.repoPath,
    prompt_name: input.promptName,
    prompt_hash: hashContent(input.promptContent),
    turn_count: input.numTurns,
    tools_called: input.toolsCalled,
    deliverables_produced: input.deliverablesProduced,
    vulns_found: input.vulnsFound,
    exploits_attempted: input.exploitsAttempted,
    exploits_succeeded: input.exploitsSucceeded,
    config_hash: input.configContent ? hashContent(input.configContent) : '',
  };

  const now = new Date().toISOString();
  const entry: Omit<ExecutionLogEntry, 'id'> = {
    session_id: _currentSessionId,
    skill_type: 'agent_phase',
    skill_id: input.agentName,
    started_at: new Date(Date.now() - input.durationMs).toISOString(),
    finished_at: now,
    duration_ms: input.durationMs,
    tokens_in: input.tokensIn,
    tokens_out: input.tokensOut,
    cost_usd: input.costUsd,
    success: input.success,
    error_type: input.errorType ?? null,
    error_message: input.errorMessage ?? null,
    version_id: 'original',
    metadata: JSON.stringify(metadata),
  };

  try {
    getForgeDb().insertExecution(entry);
  } catch {
    // Profiling should never break the workflow — fail silently
  }
}

// ---------------------------------------------------------------------------
// Tool-use tracking within an agent run
// ---------------------------------------------------------------------------

/** Accumulates tool calls during an agent run for metadata */
export class ToolCallTracker {
  private toolCalls: string[] = [];
  private toolTimings: Map<string, number> = new Map();
  private _lastToolStart: number = 0;
  private _lastToolName: string = '';

  onToolStart(toolName: string): void {
    this.toolCalls.push(toolName);
    this._lastToolName = toolName;
    this._lastToolStart = performance.now();
  }

  onToolEnd(): { toolName: string; durationMs: number } {
    const durationMs = Math.round(performance.now() - this._lastToolStart);
    const toolName = this._lastToolName;

    // Accumulate per-tool total time
    const existing = this.toolTimings.get(toolName) ?? 0;
    this.toolTimings.set(toolName, existing + durationMs);

    return { toolName, durationMs };
  }

  getToolsCalled(): string[] {
    return [...new Set(this.toolCalls)];
  }

  getToolTimings(): Record<string, number> {
    return Object.fromEntries(this.toolTimings);
  }

  reset(): void {
    this.toolCalls = [];
    this.toolTimings.clear();
    this._lastToolStart = 0;
    this._lastToolName = '';
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** SHA-256 hash of content for version tracking */
export function hashContent(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

/**
 * Rough token estimate: ~4 chars per token for English text.
 * This is a heuristic; actual tokenization is model-specific.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
