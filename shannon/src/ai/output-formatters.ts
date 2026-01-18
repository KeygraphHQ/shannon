// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Pure functions for formatting console output

import chalk from 'chalk';
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
  description: string,
  colorFn: typeof chalk.cyan = chalk.cyan
): string[] {
  if (!cleanedContent.trim()) {
    return [];
  }

  const lines: string[] = [];

  if (context.isParallelExecution) {
    // Compact output for parallel agents with prefixes
    const prefix = getAgentPrefix(description);
    lines.push(colorFn(`${prefix} ${cleanedContent}`));
  } else {
    // Full turn output for sequential agents
    lines.push(colorFn(`\n    Turn ${turnCount} (${description}):`));
    lines.push(colorFn(`    ${cleanedContent}`));
  }

  return lines;
}

export function formatResultOutput(data: ResultData, showFullResult: boolean): string[] {
  const lines: string[] = [];

  lines.push(chalk.magenta(`\n    COMPLETED:`));
  lines.push(
    chalk.gray(
      `    Duration: ${(data.duration_ms / 1000).toFixed(1)}s, Cost: $${data.cost.toFixed(4)}`
    )
  );

  if (data.subtype === 'error_max_turns') {
    lines.push(chalk.red(`    Stopped: Hit maximum turns limit`));
  } else if (data.subtype === 'error_during_execution') {
    lines.push(chalk.red(`    Stopped: Execution error`));
  }

  if (data.permissionDenials > 0) {
    lines.push(chalk.yellow(`    ${data.permissionDenials} permission denials`));
  }

  if (showFullResult && data.result && typeof data.result === 'string') {
    if (data.result.length > 1000) {
      lines.push(chalk.magenta(`    ${data.result.slice(0, 1000)}... [${data.result.length} total chars]`));
    } else {
      lines.push(chalk.magenta(`    ${data.result}`));
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
    lines.push(chalk.red(`${prefix} Failed (${formatDuration(duration)})`));
  } else if (context.useCleanOutput) {
    lines.push(chalk.red(`${context.agentType} failed (${formatDuration(duration)})`));
  } else {
    lines.push(chalk.red(`  Claude Code failed: ${description} (${formatDuration(duration)})`));
  }

  lines.push(chalk.red(`    Error Type: ${error.constructor.name}`));
  lines.push(chalk.red(`    Message: ${error.message}`));
  lines.push(chalk.gray(`    Agent: ${description}`));
  lines.push(chalk.gray(`    Working Directory: ${sourceDir}`));
  lines.push(chalk.gray(`    Retryable: ${isRetryable ? 'Yes' : 'No'}`));

  if (error.code) {
    lines.push(chalk.gray(`    Error Code: ${error.code}`));
  }
  if (error.status) {
    lines.push(chalk.gray(`    HTTP Status: ${error.status}`));
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
    return chalk.green(`${prefix} Complete (${turnCount} turns, ${formatDuration(duration)})`);
  }

  if (context.useCleanOutput) {
    return chalk.green(
      `${context.agentType.charAt(0).toUpperCase() + context.agentType.slice(1)} complete! (${turnCount} turns, ${formatDuration(duration)})`
    );
  }

  return chalk.green(
    `  Claude Code completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`
  );
}

export function formatToolUseOutput(
  toolName: string,
  input: Record<string, unknown> | undefined
): string[] {
  const lines: string[] = [];

  lines.push(chalk.yellow(`\n    Using Tool: ${toolName}`));
  if (input && Object.keys(input).length > 0) {
    lines.push(chalk.gray(`    Input: ${JSON.stringify(input, null, 2)}`));
  }

  return lines;
}

export function formatToolResultOutput(displayContent: string): string[] {
  const lines: string[] = [];

  lines.push(chalk.green(`    Tool Result:`));
  if (displayContent) {
    lines.push(chalk.gray(`    ${displayContent}`));
  }

  return lines;
}
