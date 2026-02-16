// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type {
  PentestErrorType,
  PentestErrorContext,
  PromptErrorResult,
} from './types/errors.js';

// Custom error class for pentest operations
export class PentestError extends Error {
  override name = 'PentestError' as const;
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

// Handle tool execution errors
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

/**
 * Classifies errors for Temporal workflow retry behavior.
 * Returns error type and whether Temporal should retry.
 *
 * Used by activities to wrap errors in ApplicationFailure:
 * - Retryable errors: Temporal retries with configured backoff
 * - Non-retryable errors: Temporal fails immediately
 */
export function classifyErrorForTemporal(error: unknown): { type: string; retryable: boolean } {
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
