// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Human-readable console formatting for the agent executor.
 *
 * Driven by the pi harness event stream: `turn_end` (assistant text) and
 * `tool_execution_start` (structured tool calls). Unlike the previous harness —
 * where tool calls were tool_use JSON embedded in assistant text and had to be
 * parsed out — pi delivers tool name + args as discrete events, so formatting is
 * a direct mapping.
 */

import { AGENTS } from '../session-manager.js';
import { extractAgentType, formatDuration } from '../utils/formatting.js';
import type { ExecutionContext } from './types.js';

interface ToolCallInput {
  url?: string;
  command?: string;
  description?: string;
  path?: string;
  todos?: Array<{ status: string; content: string }>;
  [key: string]: unknown;
}

/** Agent prefix used to attribute output when parallel agents interleave on one stream. */
export function getAgentPrefix(description: string): string {
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

  for (const [agentName, prefix] of Object.entries(agentPrefixes)) {
    const agent = AGENTS[agentName as keyof typeof AGENTS];
    if (agent && description.includes(agent.displayName)) {
      return prefix;
    }
  }

  if (description.includes('injection')) return '[Injection]';
  if (description.includes('xss')) return '[XSS]';
  if (description.includes('authz')) return '[Authz]'; // Check authz before auth
  if (description.includes('auth')) return '[Auth]';
  if (description.includes('ssrf')) return '[SSRF]';

  return '[Agent]';
}

/** Extract domain from URL for display. */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname || url.slice(0, 30);
  } catch {
    return url.slice(0, 30);
  }
}

/** Format a playwright-cli command (run via the bash tool) into a clean progress indicator. */
function formatBrowserAction(command: string): string | null {
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

/** Summarize a todo_write update into a clean progress indicator. */
function summarizeTodoUpdate(input: ToolCallInput | undefined): string | null {
  if (!input?.todos || !Array.isArray(input.todos)) {
    return null;
  }

  const todos = input.todos;
  const recent = todos.filter((t) => t.status === 'completed').at(-1);
  if (recent) {
    return `✅ ${recent.content}`;
  }

  const current = todos.filter((t) => t.status === 'in_progress').at(0);
  if (current) {
    return `🔄 ${current.content}`;
  }

  return null;
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

/** Format assistant turn text (from a pi `turn_end` event). */
export function formatAssistantOutput(
  text: string,
  context: ExecutionContext,
  turnCount: number,
  description: string,
): string[] {
  if (!text.trim()) {
    return [];
  }

  if (context.isParallelExecution) {
    // Compact, attributed output for interleaved parallel agents.
    return [`${getAgentPrefix(description)} ${text}`];
  }
  // Full turn output for sequential agents.
  return [`\n    Turn ${turnCount} (${description}):`, `    ${text}`];
}

/**
 * Format a pi `tool_execution_start` event into a clean one-line progress indicator.
 *
 * Maps the common tool surfaces — `task` (sub-agent delegation), `todo_write`
 * (plan updates), `bash` (incl. playwright-cli browser actions), read-only file
 * tools, and the structured collector/submit tools — to friendly lines. Returns
 * `[]` when there's nothing worth surfacing (e.g. a todo update with no active item).
 */
export function formatToolCall(
  toolName: string,
  args: Record<string, unknown> | undefined,
  context: ExecutionContext,
  description: string,
): string[] {
  const input = (args ?? {}) as ToolCallInput;
  let line: string | null;

  if (toolName === 'task') {
    line = `🚀 Launching ${input.description ?? 'sub-agent'}`;
  } else if (toolName === 'todo_write') {
    line = summarizeTodoUpdate(input);
  } else if (toolName === 'bash') {
    const command = typeof input.command === 'string' ? input.command : '';
    line = command.includes('playwright-cli') ? formatBrowserAction(command) : `💻 ${command.slice(0, 60)}`;
  } else if (toolName === 'read' || toolName === 'grep' || toolName === 'find' || toolName === 'ls') {
    const path = typeof input.path === 'string' ? ` ${input.path.slice(0, 60)}` : '';
    line = `📖 ${toolName}${path}`;
  } else if (toolName.startsWith('set_') || toolName.startsWith('add_') || toolName.startsWith('submit_')) {
    line = `📊 ${toolName.replace(/_/g, ' ')}`;
  } else {
    line = `🔧 ${toolName}`;
  }

  if (!line) return [];

  if (context.isParallelExecution) {
    return [`${getAgentPrefix(description)} ${line}`];
  }
  return [`    ${line}`];
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
    lines.push(`${getAgentPrefix(description)} Failed (${formatDuration(duration)})`);
  } else if (context.useCleanOutput) {
    lines.push(`${context.agentType} failed (${formatDuration(duration)})`);
  } else {
    lines.push(`  pi agent failed: ${description} (${formatDuration(duration)})`);
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
    return `${getAgentPrefix(description)} Complete (${turnCount} turns, ${formatDuration(duration)})`;
  }

  if (context.useCleanOutput) {
    return `${context.agentType.charAt(0).toUpperCase() + context.agentType.slice(1)} complete! (${turnCount} turns, ${formatDuration(duration)})`;
  }

  return `  pi agent completed: ${description} (${turnCount} turns) in ${formatDuration(duration)}`;
}
