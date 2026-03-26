// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { AGENTS } from '../session-manager.js';
import { extractAgentType, formatDuration } from '../utils/formatting.js';
import type { ExecutionContext, ResultData } from './types.js';

interface ToolCallInput {
  url?: string;
  element?: string;
  key?: string;
  fields?: unknown[];
  text?: string;
  action?: string;
  description?: string;
  command?: string;
  todos?: Array<{
    status: string;
    content: string;
  }>;
  [key: string]: unknown;
}

interface ToolCall {
  name: string;
  input?: ToolCallInput;
}

/**
 * Get agent prefix for parallel execution
 */
export function getAgentPrefix(description: string): string {
  // Map agent names to their prefixes
  const agentPrefixes: Record<string, string> = {
    'injection-vuln': '[Injection]',
    'xss-vuln': '[XSS]',
    'auth-vuln': '[Auth]',
    'authz-vuln': '[Authz]',
    'ssrf-vuln': '[SSRF]',
    'injection-exploit': '[Injection]',
    'xss-exploit': '[XSS]',
    'auth-exploit': '[Auth]',
    'authz-exploit': '[Authz]',
    'ssrf-exploit': '[SSRF]',
  };

  // First try to match by agent name directly
  for (const [agentName, prefix] of Object.entries(agentPrefixes)) {
    const agent = AGENTS[agentName as keyof typeof AGENTS];
    if (agent && description.includes(agent.displayName)) {
      return prefix;
    }
  }

  // Fallback to partial matches for backwards compatibility
  if (description.includes('injection')) return '[Injection]';
  if (description.includes('xss')) return '[XSS]';
  if (description.includes('authz')) return '[Authz]'; // Check authz before auth
  if (description.includes('auth')) return '[Auth]';
  if (description.includes('ssrf')) return '[SSRF]';

  return '[Agent]';
}

/**
 * Extract domain from URL for display
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || url.slice(0, 30);
  } catch {
    return url.slice(0, 30);
  }
}

/**
 * Format playwright-cli commands into clean progress indicators
 */
function formatBrowserAction(command: string): string | null {
  // Extract subcommand after optional session flag (e.g., "playwright-cli -s=session1 navigate https://example.com")
  const match = command.match(/playwright-cli\s+(?:-s=\S+\s+)?(\S+)(?:\s+(.*))?/);
  if (!match) return null;

  const subcommand = match[1];
  const args = match[2] || '';

  switch (subcommand) {
    case 'open':
    case 'goto': {
      const domain = args.trim() ? extractDomain(args.trim()) : '';
      return domain ? `🌐 Navigating to ${domain}` : '🌐 Opening browser';
    }
    case 'go-back':
      return '⬅️ Going back';
    case 'go-forward':
      return '➡️ Going forward';
    case 'reload':
      return '🔄 Reloading page';
    case 'click':
    case 'dblclick':
      return `🖱️ Clicking ${(args || 'element').slice(0, 25)}`;
    case 'hover':
      return `👆 Hovering over ${(args || 'element').slice(0, 20)}`;
    case 'type':
      return `⌨️ Typing ${(args || 'text').slice(0, 20)}`;
    case 'press':
    case 'keydown':
    case 'keyup':
      return `⌨️ Pressing ${args || 'key'}`;
    case 'fill':
      return `📝 Filling ${(args || 'field').slice(0, 25)}`;
    case 'select':
      return '📋 Selecting dropdown option';
    case 'check':
    case 'uncheck':
      return `☑️ ${subcommand === 'check' ? 'Checking' : 'Unchecking'} ${(args || 'element').slice(0, 20)}`;
    case 'upload':
      return '📁 Uploading file';
    case 'drag':
      return '🖱️ Dragging element';
    case 'snapshot':
      return '📸 Taking page snapshot';
    case 'screenshot':
      return '📸 Taking screenshot';
    case 'eval':
    case 'run-code':
      return '🔍 Running JavaScript analysis';
    case 'console':
      return '📜 Checking console logs';
    case 'network':
      return '🌐 Analyzing network traffic';
    case 'tab-list':
    case 'tab-new':
    case 'tab-close':
    case 'tab-select':
      return `🗂️ ${subcommand.replace('tab-', '')} browser tab`;
    case 'dialog-accept':
      return '💬 Accepting dialog';
    case 'dialog-dismiss':
      return '💬 Dismissing dialog';
    case 'pdf':
      return '📄 Saving page as PDF';
    case 'resize':
      return `🖥️ Resizing browser ${args || ''}`.trim();
    default:
      return `🌐 Browser: ${subcommand}`;
  }
}

/**
 * Summarize TodoWrite updates into clean progress indicators
 */
function summarizeTodoUpdate(input: ToolCallInput | undefined): string | null {
  if (!input?.todos || !Array.isArray(input.todos)) {
    return null;
  }

  const todos = input.todos;
  const completed = todos.filter((t) => t.status === 'completed');
  const inProgress = todos.filter((t) => t.status === 'in_progress');

  // Show recently completed tasks
  const recent = completed.at(-1);
  if (recent) {
    return `✅ ${recent.content}`;
  }

  // Show current in-progress task
  const current = inProgress.at(0);
  if (current) {
    return `🔄 ${current.content}`;
  }

  return null;
}

/**
 * Filter out JSON tool calls from content, with special handling for Task calls
 */
export function filterJsonToolCalls(content: string | null | undefined): string {
  if (!content || typeof content !== 'string') {
    return content || '';
  }

  const lines = content.split('\n');
  const processedLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (trimmed === '') {
      continue;
    }

    // Check if this is a JSON tool call
    if (trimmed.startsWith('{"type":"tool_use"')) {
      try {
        const toolCall = JSON.parse(trimmed) as ToolCall;

        // Special handling for Task tool calls
        if (toolCall.name === 'Task') {
          const description = toolCall.input?.description || 'analysis agent';
          processedLines.push(`🚀 Launching ${description}`);
          continue;
        }

        // Special handling for TodoWrite tool calls
        if (toolCall.name === 'TodoWrite') {
          const summary = summarizeTodoUpdate(toolCall.input);
          if (summary) {
            processedLines.push(summary);
          }
          continue;
        }

        // Special handling for browser tool calls (playwright-cli via Bash)
        if (toolCall.name === 'Bash') {
          const command = toolCall.input?.command || '';
          if (command.includes('playwright-cli')) {
            const browserAction = formatBrowserAction(command);
            if (browserAction) {
              processedLines.push(browserAction);
            }
          }
        }
      } catch {
        // If JSON parsing fails, treat as regular text
        processedLines.push(line);
      }
    } else {
      // Keep non-JSON lines (assistant text)
      processedLines.push(line);
    }
  }

  return processedLines.join('\n');
}

export function detectExecutionContext(description: string): ExecutionContext {
  const isParallelExecution = description.includes('vuln agent') || description.includes('exploit agent');

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
  isRetryable: boolean,
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
  duration: number,
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

export function formatToolUseOutput(toolName: string, input: Record<string, unknown> | undefined): string[] {
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
