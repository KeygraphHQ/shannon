// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Pure functions for formatting console output

import { extractAgentType, formatDuration } from '../utils/formatting.js';
import { AGENTS } from '../session-manager.js';
import type { ExecutionContext, ResultData } from './types.js';

// --- Types for tool call filtering ---

interface ToolCallInput {
  url?: string;
  element?: string;
  key?: string;
  fields?: unknown[];
  text?: string;
  action?: string;
  description?: string;
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

// --- Agent prefix logic ---

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

// --- Tool call filtering ---

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
  if (completed.length > 0) {
    const recent = completed[completed.length - 1]!;
    return `✅ ${recent.content}`;
  }

  // Show current in-progress task
  if (inProgress.length > 0) {
    const current = inProgress[0]!;
    return `🔄 ${current.content}`;
  }

  return null;
}

/**
 * Format browser tool calls into clean progress indicators
 */
function formatBrowserAction(toolCall: ToolCall): string {
  const toolName = toolCall.name;
  const input = toolCall.input || {};

  // Core Browser Operations
  if (toolName === 'mcp__playwright__browser_navigate') {
    const url = input.url || '';
    const domain = extractDomain(url);
    return `🌐 Navigating to ${domain}`;
  }

  if (toolName === 'mcp__playwright__browser_navigate_back') {
    return `⬅️ Going back`;
  }

  // Page Interaction
  if (toolName === 'mcp__playwright__browser_click') {
    const element = input.element || 'element';
    return `🖱️ Clicking ${element.slice(0, 25)}`;
  }

  if (toolName === 'mcp__playwright__browser_hover') {
    const element = input.element || 'element';
    return `👆 Hovering over ${element.slice(0, 20)}`;
  }

  if (toolName === 'mcp__playwright__browser_type') {
    const element = input.element || 'field';
    return `⌨️ Typing in ${element.slice(0, 20)}`;
  }

  if (toolName === 'mcp__playwright__browser_press_key') {
    const key = input.key || 'key';
    return `⌨️ Pressing ${key}`;
  }

  // Form Handling
  if (toolName === 'mcp__playwright__browser_fill_form') {
    const fieldCount = input.fields?.length || 0;
    return `📝 Filling ${fieldCount} form fields`;
  }

  if (toolName === 'mcp__playwright__browser_select_option') {
    return `📋 Selecting dropdown option`;
  }

  if (toolName === 'mcp__playwright__browser_file_upload') {
    return `📁 Uploading file`;
  }

  // Page Analysis
  if (toolName === 'mcp__playwright__browser_snapshot') {
    return `📸 Taking page snapshot`;
  }

  if (toolName === 'mcp__playwright__browser_take_screenshot') {
    return `📸 Taking screenshot`;
  }

  if (toolName === 'mcp__playwright__browser_evaluate') {
    return `🔍 Running JavaScript analysis`;
  }

  // Waiting & Monitoring
  if (toolName === 'mcp__playwright__browser_wait_for') {
    if (input.text) {
      return `⏳ Waiting for "${input.text.slice(0, 20)}"`;
    }
    return `⏳ Waiting for page response`;
  }

  if (toolName === 'mcp__playwright__browser_console_messages') {
    return `📜 Checking console logs`;
  }

  if (toolName === 'mcp__playwright__browser_network_requests') {
    return `🌐 Analyzing network traffic`;
  }

  // Tab Management
  if (toolName === 'mcp__playwright__browser_tabs') {
    const action = input.action || 'managing';
    return `🗂️ ${action} browser tab`;
  }

  // Dialog Handling
  if (toolName === 'mcp__playwright__browser_handle_dialog') {
    return `💬 Handling browser dialog`;
  }

  // Fallback for any missed tools
  const actionType = toolName.split('_').pop();
  return `🌐 Browser: ${actionType}`;
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

        // Special handling for browser tool calls
        if (toolCall.name.startsWith('mcp__playwright__browser_')) {
          const browserAction = formatBrowserAction(toolCall);
          if (browserAction) {
            processedLines.push(browserAction);
          }
          continue;
        }

        // Hide all other tool calls (Read, Write, Grep, etc.)
        continue;
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

// --- Console output formatting ---

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
