// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { fs, path } from 'zx';
import type {
  PentestErrorType,
  PentestErrorContext,
  LogEntry,
  ToolErrorResult,
  PromptErrorResult,
} from './types/errors.js';

// Temporal error classification for ApplicationFailure wrapping
export interface TemporalErrorClassification {
  type: string;
  retryable: boolean;
}

// Custom error class for pentest operations
export class PentestError extends Error {
  name = 'PentestError' as const;
  type: PentestErrorType;
  retryable: boolean;
  context: PentestErrorContext;
  timestamp: string;

  constructor(
    message: string,
    type: PentestErrorType,
    retryable: boolean = false,
    context: PentestErrorContext = {}
  ) {
    super(message);
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

// Centralized error logging function
export async function logError(
  error: Error & { type?: PentestErrorType; retryable?: boolean; context?: PentestErrorContext },
  contextMsg: string,
  sourceDir: string | null = null
): Promise<LogEntry> {
  const timestamp = new Date().toISOString();
  const logEntry: LogEntry = {
    timestamp,
    context: contextMsg,
    error: {
      name: error.name || error.constructor.name,
      message: error.message,
      type: error.type || 'unknown',
      retryable: error.retryable || false,
    },
  };
  // Only add stack if it exists
  if (error.stack) {
    logEntry.error.stack = error.stack;
  }

  // Console logging with color
  const prefix = error.retryable ? '⚠️' : '❌';
  const color = error.retryable ? chalk.yellow : chalk.red;
  console.log(color(`${prefix} ${contextMsg}:`));
  console.log(color(`   ${error.message}`));

  if (error.context && Object.keys(error.context).length > 0) {
    console.log(chalk.gray(`   Context: ${JSON.stringify(error.context)}`));
  }

  // File logging (if source directory available)
  if (sourceDir) {
    try {
      const logPath = path.join(sourceDir, 'error.log');
      await fs.appendFile(logPath, JSON.stringify(logEntry) + '\n');
    } catch (logErr) {
      const errMsg = logErr instanceof Error ? logErr.message : String(logErr);
      console.log(chalk.gray(`   (Failed to write error log: ${errMsg})`));
    }
  }

  return logEntry;
}

// Handle tool execution errors
export function handleToolError(
  toolName: string,
  error: Error & { code?: string }
): ToolErrorResult {
  const isRetryable =
    error.code === 'ECONNRESET' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ENOTFOUND';

  return {
    tool: toolName,
    output: `Error: ${error.message}`,
    status: 'error',
    duration: 0,
    success: false,
    error: new PentestError(
      `${toolName} execution failed: ${error.message}`,
      'tool',
      isRetryable,
      { toolName, originalError: error.message, errorCode: error.code }
    ),
  };
}

// Handle prompt loading errors
export function handlePromptError(
  promptName: string,
  error: Error
): PromptErrorResult {
  return {
    success: false,
    error: new PentestError(
      `Failed to load prompt '${promptName}': ${error.message}`,
      'prompt',
      false,
      { promptName, originalError: error.message }
    ),
  };
}

// Patterns that indicate retryable errors
const RETRYABLE_PATTERNS = [
  // Network and connection errors
  'network',
  'connection',
  'timeout',
  'econnreset',
  'enotfound',
  'econnrefused',
  // Rate limiting
  'rate limit',
  '429',
  'too many requests',
  // Server errors
  'server error',
  '5xx',
  'internal server error',
  'service unavailable',
  'bad gateway',
  // Claude API errors
  'mcp server',
  'model unavailable',
  'service temporarily unavailable',
  'api error',
  'terminated',
  // Max turns
  'max turns',
  'maximum turns',
];

// Patterns that indicate non-retryable errors (checked before default)
const NON_RETRYABLE_PATTERNS = [
  'authentication',
  'invalid prompt',
  'out of memory',
  'permission denied',
  'session limit reached',
  'invalid api key',
];

// Conservative retry classification - unknown errors don't retry (fail-safe default)
export function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Check for explicit non-retryable patterns first
  if (NON_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern))) {
    return false;
  }

  // Check for retryable patterns
  return RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

// Rate limit errors get longer base delay (30s) vs standard exponential backoff (2s)
export function getRetryDelay(error: Error, attempt: number): number {
  const message = error.message.toLowerCase();

  // Rate limiting gets longer delays
  if (message.includes('rate limit') || message.includes('429')) {
    return Math.min(30000 + attempt * 10000, 120000); // 30s, 40s, 50s, max 2min
  }

  // Exponential backoff with jitter for other retryable errors
  const baseDelay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
  const jitter = Math.random() * 1000; // 0-1s random
  return Math.min(baseDelay + jitter, 30000); // Max 30s
}

/**
 * Classifies errors for Temporal workflow retry behavior.
 * Returns error type and whether Temporal should retry.
 *
 * Used by activities to wrap errors in ApplicationFailure:
 * - Retryable errors: Temporal retries with configured backoff
 * - Non-retryable errors: Temporal fails immediately
 */
export function classifyErrorForTemporal(error: unknown): TemporalErrorClassification {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

  // === BILLING ERRORS (Retryable with long backoff) ===
  // Anthropic returns billing as 400 invalid_request_error
  // Human can add credits OR wait for spending cap to reset (5-30 min backoff)
  if (
    message.includes('billing_error') ||
    message.includes('credit balance is too low') ||
    message.includes('insufficient credits') ||
    message.includes('usage is blocked due to insufficient credits') ||
    message.includes('please visit plans & billing') ||
    message.includes('please visit plans and billing') ||
    message.includes('usage limit reached') ||
    message.includes('quota exceeded') ||
    message.includes('daily rate limit') ||
    message.includes('limit will reset') ||
    // Claude Code spending cap patterns (returns short message instead of error)
    message.includes('spending cap') ||
    message.includes('spending limit') ||
    message.includes('cap reached') ||
    message.includes('budget exceeded') ||
    message.includes('billing limit reached')
  ) {
    return { type: 'BillingError', retryable: true };
  }

  // === PERMANENT ERRORS (Non-retryable) ===

  // Authentication (401) - bad API key won't fix itself
  if (
    message.includes('authentication') ||
    message.includes('api key') ||
    message.includes('401') ||
    message.includes('authentication_error')
  ) {
    return { type: 'AuthenticationError', retryable: false };
  }

  // Permission (403) - access won't be granted
  if (
    message.includes('permission') ||
    message.includes('forbidden') ||
    message.includes('403')
  ) {
    return { type: 'PermissionError', retryable: false };
  }

  // === OUTPUT VALIDATION ERRORS (Retryable) ===
  // Agent didn't produce expected deliverables - retry may succeed
  // IMPORTANT: Must come BEFORE generic 'validation' check below
  if (
    message.includes('failed output validation') ||
    message.includes('output validation failed')
  ) {
    return { type: 'OutputValidationError', retryable: true };
  }

  // Invalid Request (400) - malformed request is permanent
  // Note: Checked AFTER billing and AFTER output validation
  if (
    message.includes('invalid_request_error') ||
    message.includes('malformed') ||
    message.includes('validation')
  ) {
    return { type: 'InvalidRequestError', retryable: false };
  }

  // Request Too Large (413) - won't fit no matter how many retries
  if (
    message.includes('request_too_large') ||
    message.includes('too large') ||
    message.includes('413')
  ) {
    return { type: 'RequestTooLargeError', retryable: false };
  }

  // Configuration errors - missing files need manual fix
  if (
    message.includes('enoent') ||
    message.includes('no such file') ||
    message.includes('cli not installed')
  ) {
    return { type: 'ConfigurationError', retryable: false };
  }

  // Execution limits - max turns/budget reached
  if (
    message.includes('max turns') ||
    message.includes('budget') ||
    message.includes('execution limit') ||
    message.includes('error_max_turns') ||
    message.includes('error_max_budget')
  ) {
    return { type: 'ExecutionLimitError', retryable: false };
  }

  // Invalid target URL - bad URL format won't fix itself
  if (
    message.includes('invalid url') ||
    message.includes('invalid target') ||
    message.includes('malformed url') ||
    message.includes('invalid uri')
  ) {
    return { type: 'InvalidTargetError', retryable: false };
  }

  // === TRANSIENT ERRORS (Retryable) ===
  // Rate limits (429), server errors (5xx), network issues
  // Let Temporal retry with configured backoff
  return { type: 'TransientError', retryable: true };
}
