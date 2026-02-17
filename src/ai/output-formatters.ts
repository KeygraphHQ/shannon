// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Pure functions for formatting console output

import { extractAgentType, formatDuration } from '../utils/formatting.js';
import { getAgentPrefix } from '../utils/output-formatter.js';
import type { ExecutionContext, ResultData } from './types.js';

export function detectExecutionContext(description: string): ExecutionContext {
  const isParallelExecution =
    description.includes('vuln agent') || description.includes('exploit agent');

  const useCleanOutput =
    description.includes('Pre-recon agent') ||
    description.includes('Recon agent') ||
    description.includes('Executive Summary and Report Cleanup') ||
    description.includes('vuln agent') ||
    description.includes('exploit agent');

  const agentType = extractAgentType(description);

  const agentKey = description.toLowerCase().replace(/\s+/g, '-');

  return { isParallelExecution, useCleanOutput, agentType, agentKey };
}

export function formatAssistantOutput(
  cleanedContent: string,
  context: ExecutionContext,
  turnCount: number,
  description: string
): string[] {
  if (!cleanedContent.trim()) {
    return [];
  }

  const lines: string[] = [];

  if (context.isParallelExecution) {
    // Compact output for parallel agents with prefixes
    const prefix = getAgentPrefix(description);
    lines.push(`${prefix} ${cleanedContent}`);
  } else {
    // Full turn output for sequential agents
    lines.push(`\n    Turn ${turnCount} (${description}):`);
    lines.push(`    ${cleanedContent}`);
  }

  return lines;
}

export function formatResultOutput(data: ResultData, showFullResult: boolean): string[] {
  const lines: string[] = [];

  lines.push(`\n    COMPLETED:`);
  lines.push(`    Duration: ${(data.duration_ms / 1000).toFixed(1)}s, Cost: $${data.cost.toFixed(4)}`);

  if (data.subtype === 'error_max_turns') {
    lines.push(`    Stopped: Hit maximum turns limit`);
  } else if (data.subtype === 'error_during_execution') {
    lines.push(`    Stopped: Execution error`);
  }

  if (data.permissionDenials > 0) {
    lines.push(`    ${data.permissionDenials} permission denials`);
  }

  if (showFullResult && data.result && typeof data.result === 'string') {
    if (data.result.length > 1000) {
      lines.push(`    ${data.result.slice(0, 1000)}... [${data.result.length} total chars]`);
    } else {
      lines.push(`    ${data.result}`);
    }
  }

  return lines;
}

export function formatErrorOutput(
  error: Error & { code?: string; status?: number },
  context: ExecutionContext,
  description: string,
  duration: number,
  sourceDir: string,
  isRetryable: boolean
): string[] {
  const lines: string[] = [];

  if (context.isParallelExecution) {
    const prefix = getAgentPrefix(description);
    lines.push(`${prefix} Failed (${formatDuration(duration)})`);
  } else if (context.useCleanOutput) {
    lines.push(`${context.agentType} failed (${formatDuration(duration)})`);
  } else {
    lines.push(`  Claude Code failed: ${description} (${formatDuration(duration)})`);
  }

  lines.push(`    Error Type: ${error.constructor.name}`);
  lines.push(`    Message: ${error.message}`);
  lines.push(`    Agent: ${description}`);
  lines.push(`    Working Directory: ${sourceDir}`);
  lines.push(`    Retryable: ${isRetryable ? 'Yes' : 'No'}`);

  if (error.code) {
    lines.push(`    Error Code: ${error.code}`);
  }
  if (error.status) {
    lines.push(`    HTTP Status: ${error.status}`);
  }

  return lines;
}

export function formatCompletionMessage(
  context: ExecutionContext,
  description: string,
  turnCount: number,
  duration: number
): string {
  if (context.isParallelExecution) {
    const prefix = getAgentPrefix(description);
    return `${prefix} Complete (${turnCount} turns, ${formatDuration(duration)})`;
  }

  if (context.useCleanOutput) {
    return `${context.agentType.charAt(0).toUpperCase() + context.agentType.slice(1)} complete! (${turnCount} turns, ${formatDuration(duration)})`;
  }

  return `  Claude Code completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`;
}

export function formatToolUseOutput(
  toolName: string,
  input: Record<string, unknown> | undefined
): string[] {
  const lines: string[] = [];

  lines.push(`\n    Using Tool: ${toolName}`);
  if (input && Object.keys(input).length > 0) {
    lines.push(`    Input: ${JSON.stringify(input, null, 2)}`);
  }

  return lines;
}

export function formatToolResultOutput(displayContent: string): string[] {
  const lines: string[] = [];

  lines.push(`    Tool Result:`);
  if (displayContent) {
    lines.push(`    ${displayContent}`);
  }

  return lines;
}
