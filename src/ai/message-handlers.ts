// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Pure functions for processing SDK message types

import { PentestError } from '../error-handling.js';
import { filterJsonToolCalls } from '../utils/output-formatter.js';
import { formatTimestamp } from '../utils/formatting.js';
import chalk from 'chalk';
import { getActualModelName } from './router-utils.js';
import {
  formatAssistantOutput,
  formatResultOutput,
  formatToolUseOutput,
  formatToolResultOutput,
} from './output-formatters.js';
import { costResults } from '../utils/metrics.js';
import type { AuditLogger } from './audit-logger.js';
import type { ProgressManager } from './progress-manager.js';
import type {
  AssistantMessage,
  ResultMessage,
  ToolUseMessage,
  ToolResultMessage,
  AssistantResult,
  ResultData,
  ToolUseData,
  ToolResultData,
  ApiErrorDetection,
  ContentBlock,
  SystemInitMessage,
  ExecutionContext,
} from './types.js';
import type { ChalkInstance } from 'chalk';

// Handles both array and string content formats from SDK
export function extractMessageContent(message: AssistantMessage): string {
  const messageContent = message.message;

  if (Array.isArray(messageContent.content)) {
    return messageContent.content
      .map((c: ContentBlock) => c.text || JSON.stringify(c))
      .join('\n');
  }

  return String(messageContent.content);
}

export function detectApiError(content: string): ApiErrorDetection {
  if (!content || typeof content !== 'string') {
    return { detected: false };
  }

  const lowerContent = content.toLowerCase();

  // === BILLING/SPENDING CAP ERRORS (Retryable with long backoff) ===
  // When Claude Code hits its spending cap, it returns a short message like
  // "Spending cap reached resets 8am" instead of throwing an error.
  // These should retry with 5-30 min backoff so workflows can recover when cap resets.
  const BILLING_PATTERNS = [
    'spending cap',
    'spending limit',
    'cap reached',
    'budget exceeded',
    'usage limit',
  ];

  const isBillingError = BILLING_PATTERNS.some((pattern) =>
    lowerContent.includes(pattern)
  );

  if (isBillingError) {
    return {
      detected: true,
      shouldThrow: new PentestError(
        `Billing limit reached: ${content.slice(0, 100)}`,
        'billing',
        true // RETRYABLE - Temporal will use 5-30 min backoff
      ),
    };
  }

  // === SESSION LIMIT (Non-retryable) ===
  // Different from spending cap - usually means something is fundamentally wrong
  if (lowerContent.includes('session limit reached')) {
    return {
      detected: true,
      shouldThrow: new PentestError('Session limit reached', 'billing', false),
    };
  }

  // Non-fatal API errors - detected but continue
  if (lowerContent.includes('api error') || lowerContent.includes('terminated')) {
    return { detected: true };
  }

  return { detected: false };
}

export function handleAssistantMessage(
  message: AssistantMessage,
  turnCount: number
): AssistantResult {
  const content = extractMessageContent(message);
  const cleanedContent = filterJsonToolCalls(content);
  const errorDetection = detectApiError(content);

  const result: AssistantResult = {
    content,
    cleanedContent,
    apiErrorDetected: errorDetection.detected,
    logData: {
      turn: turnCount,
      content,
      timestamp: formatTimestamp(),
    },
  };

  // Only add shouldThrow if it exists (exactOptionalPropertyTypes compliance)
  if (errorDetection.shouldThrow) {
    result.shouldThrow = errorDetection.shouldThrow;
  }

  return result;
}

// Final message of a query with cost/duration info
export function handleResultMessage(message: ResultMessage): ResultData {
  const result: ResultData = {
    result: message.result || null,
    cost: message.total_cost_usd || 0,
    duration_ms: message.duration_ms || 0,
    permissionDenials: message.permission_denials?.length || 0,
  };

  // Only add subtype if it exists (exactOptionalPropertyTypes compliance)
  if (message.subtype) {
    result.subtype = message.subtype;
  }

  return result;
}

export function handleToolUseMessage(message: ToolUseMessage): ToolUseData {
  return {
    toolName: message.name,
    parameters: message.input || {},
    timestamp: formatTimestamp(),
  };
}

// Truncates long results for display (500 char limit), preserves full content for logging
export function handleToolResultMessage(message: ToolResultMessage): ToolResultData {
  const content = message.content;
  const contentStr =
    typeof content === 'string' ? content : JSON.stringify(content, null, 2);

  const displayContent =
    contentStr.length > 500
      ? `${contentStr.slice(0, 500)}...\n[Result truncated - ${contentStr.length} total chars]`
      : contentStr;

  return {
    content,
    displayContent,
    timestamp: formatTimestamp(),
  };
}

// Output helper for console logging
function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

// Message dispatch result types
export type MessageDispatchAction =
  | { type: 'continue'; apiErrorDetected?: boolean | undefined; model?: string | undefined }
  | { type: 'complete'; result: string | null; cost: number }
  | { type: 'throw'; error: Error };

export interface MessageDispatchDeps {
  execContext: ExecutionContext;
  description: string;
  colorFn: ChalkInstance;
  progress: ProgressManager;
  auditLogger: AuditLogger;
}

// Dispatches SDK messages to appropriate handlers and formatters
export async function dispatchMessage(
  message: { type: string; subtype?: string },
  turnCount: number,
  deps: MessageDispatchDeps
): Promise<MessageDispatchAction> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;

  switch (message.type) {
    case 'assistant': {
      const assistantResult = handleAssistantMessage(message as AssistantMessage, turnCount);

      if (assistantResult.shouldThrow) {
        return { type: 'throw', error: assistantResult.shouldThrow };
      }

      if (assistantResult.cleanedContent.trim()) {
        progress.stop();
        outputLines(formatAssistantOutput(
          assistantResult.cleanedContent,
          execContext,
          turnCount,
          description,
          colorFn
        ));
        progress.start();
      }

      await auditLogger.logLlmResponse(turnCount, assistantResult.content);

      if (assistantResult.apiErrorDetected) {
        console.log(chalk.red(`    API Error detected in assistant response`));
        return { type: 'continue', apiErrorDetected: true };
      }

      return { type: 'continue' };
    }

    case 'system': {
      if (message.subtype === 'init') {
        const initMsg = message as SystemInitMessage;
        const actualModel = getActualModelName(initMsg.model);
        if (!execContext.useCleanOutput) {
          console.log(chalk.blue(`    Model: ${actualModel}, Permission: ${initMsg.permissionMode}`));
          if (initMsg.mcp_servers && initMsg.mcp_servers.length > 0) {
            const mcpStatus = initMsg.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ');
            console.log(chalk.blue(`    MCP: ${mcpStatus}`));
          }
        }
        // Return actual model for tracking in audit logs
        return { type: 'continue', model: actualModel };
      }
      return { type: 'continue' };
    }

    case 'user':
      return { type: 'continue' };

    case 'tool_use': {
      const toolData = handleToolUseMessage(message as unknown as ToolUseMessage);
      outputLines(formatToolUseOutput(toolData.toolName, toolData.parameters));
      await auditLogger.logToolStart(toolData.toolName, toolData.parameters);
      return { type: 'continue' };
    }

    case 'tool_result': {
      const toolResultData = handleToolResultMessage(message as unknown as ToolResultMessage);
      outputLines(formatToolResultOutput(toolResultData.displayContent));
      await auditLogger.logToolEnd(toolResultData.content);
      return { type: 'continue' };
    }

    case 'result': {
      const resultData = handleResultMessage(message as ResultMessage);
      outputLines(formatResultOutput(resultData, !execContext.useCleanOutput));
      costResults.agents[execContext.agentKey] = resultData.cost;
      costResults.total += resultData.cost;
      return { type: 'complete', result: resultData.result, cost: resultData.cost };
    }

    default:
      console.log(chalk.gray(`    ${message.type}: ${JSON.stringify(message, null, 2)}`));
      return { type: 'continue' };
  }
}
