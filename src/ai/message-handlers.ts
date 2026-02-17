// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Pure functions for processing SDK message types

import { PentestError } from '../error-handling.js';
import { ErrorCode } from '../types/errors.js';
import { matchesBillingTextPattern } from '../utils/billing-detection.js';
import { filterJsonToolCalls } from '../utils/output-formatter.js';
import { formatTimestamp } from '../utils/formatting.js';
import { getActualModelName } from './router-utils.js';
import type { ActivityLogger } from '../temporal/activity-logger.js';
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
  SDKAssistantMessageError,
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

// Handles both array and string content formats from SDK
function extractMessageContent(message: AssistantMessage): string {
  const messageContent = message.message;

  if (Array.isArray(messageContent.content)) {
    return messageContent.content
      .map((c: ContentBlock) => c.text || JSON.stringify(c))
      .join('\n');
  }

  return String(messageContent.content);
}

// Extracts only text content (no tool_use JSON) to avoid false positives in error detection
function extractTextOnlyContent(message: AssistantMessage): string {
  const messageContent = message.message;

  if (Array.isArray(messageContent.content)) {
    return messageContent.content
      .filter((c: ContentBlock) => c.type === 'text' || c.text)
      .map((c: ContentBlock) => c.text || '')
      .join('\n');
  }

  return String(messageContent.content);
}

function detectApiError(content: string): ApiErrorDetection {
  if (!content || typeof content !== 'string') {
    return { detected: false };
  }

  const lowerContent = content.toLowerCase();

  // === BILLING/SPENDING CAP ERRORS (Retryable with long backoff) ===
  // When Claude Code hits its spending cap, it returns a short message like
  // "Spending cap reached resets 8am" instead of throwing an error.
  // These should retry with 5-30 min backoff so workflows can recover when cap resets.
  if (matchesBillingTextPattern(content)) {
    return {
      detected: true,
      shouldThrow: new PentestError(
        `Billing limit reached: ${content.slice(0, 100)}`,
        'billing',
        true, // RETRYABLE - Temporal will use 5-30 min backoff
        {},
        ErrorCode.SPENDING_CAP_REACHED
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

// Maps SDK structured error types to our error handling.
function handleStructuredError(
  errorType: SDKAssistantMessageError,
  content: string
): ApiErrorDetection {
  switch (errorType) {
    case 'billing_error':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Billing error (structured): ${content.slice(0, 100)}`,
          'billing',
          true, // Retryable with backoff
          {},
          ErrorCode.INSUFFICIENT_CREDITS
        ),
      };
    case 'rate_limit':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Rate limit hit (structured): ${content.slice(0, 100)}`,
          'network',
          true, // Retryable with backoff
          {},
          ErrorCode.API_RATE_LIMITED
        ),
      };
    case 'authentication_failed':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Authentication failed: ${content.slice(0, 100)}`,
          'config',
          false // Not retryable - needs API key fix
        ),
      };
    case 'server_error':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Server error (structured): ${content.slice(0, 100)}`,
          'network',
          true // Retryable
        ),
      };
    case 'invalid_request':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Invalid request: ${content.slice(0, 100)}`,
          'config',
          false // Not retryable - needs code fix
        ),
      };
    case 'max_output_tokens':
      return {
        detected: true,
        shouldThrow: new PentestError(
          `Max output tokens reached: ${content.slice(0, 100)}`,
          'billing',
          true // Retryable - may succeed with different content
        ),
      };
    case 'unknown':
    default:
      return { detected: true };
  }
}

function handleAssistantMessage(
  message: AssistantMessage,
  turnCount: number
): AssistantResult {
  const content = extractMessageContent(message);
  const cleanedContent = filterJsonToolCalls(content);

  // Prefer structured error field from SDK, fall back to text-sniffing
  // Use text-only content for error detection to avoid false positives
  // from tool_use JSON (e.g. security reports containing "usage limit")
  let errorDetection: ApiErrorDetection;
  if (message.error) {
    errorDetection = handleStructuredError(message.error, content);
  } else {
    const textOnlyContent = extractTextOnlyContent(message);
    errorDetection = detectApiError(textOnlyContent);
  }

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
function handleResultMessage(message: ResultMessage): ResultData {
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

  // Capture stop_reason for diagnostics (helps debug early stops, budget exceeded, etc.)
  if (message.stop_reason !== undefined) {
    result.stop_reason = message.stop_reason;
    if (message.stop_reason && message.stop_reason !== 'end_turn') {
      console.log(`    Stop reason: ${message.stop_reason}`);
    }
  }

  return result;
}

function handleToolUseMessage(message: ToolUseMessage): ToolUseData {
  return {
    toolName: message.name,
    parameters: message.input || {},
    timestamp: formatTimestamp(),
  };
}

// Truncates long results for display (500 char limit), preserves full content for logging
function handleToolResultMessage(message: ToolResultMessage): ToolResultData {
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
  progress: ProgressManager;
  auditLogger: AuditLogger;
  logger: ActivityLogger;
}

// Dispatches SDK messages to appropriate handlers and formatters
export async function dispatchMessage(
  message: { type: string; subtype?: string },
  turnCount: number,
  deps: MessageDispatchDeps
): Promise<MessageDispatchAction> {
  const { execContext, description, progress, auditLogger, logger } = deps;

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
          description
        ));
        progress.start();
      }

      await auditLogger.logLlmResponse(turnCount, assistantResult.content);

      if (assistantResult.apiErrorDetected) {
        logger.warn('API Error detected in assistant response');
        return { type: 'continue', apiErrorDetected: true };
      }

      return { type: 'continue' };
    }

    case 'system': {
      if (message.subtype === 'init') {
        const initMsg = message as SystemInitMessage;
        const actualModel = getActualModelName(initMsg.model);
        if (!execContext.useCleanOutput) {
          logger.info(`Model: ${actualModel}, Permission: ${initMsg.permissionMode}`);
          if (initMsg.mcp_servers && initMsg.mcp_servers.length > 0) {
            const mcpStatus = initMsg.mcp_servers.map(s => `${s.name}(${s.status})`).join(', ');
            logger.info(`MCP: ${mcpStatus}`);
          }
        }
        // Return actual model for tracking in audit logs
        return { type: 'continue', model: actualModel };
      }
      return { type: 'continue' };
    }

    case 'user':
    case 'tool_progress':
    case 'tool_use_summary':
    case 'auth_status':
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
      logger.info(`Unhandled message type: ${message.type}`);
      return { type: 'continue' };
  }
}
