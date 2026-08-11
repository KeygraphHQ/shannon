// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type AssistantMessage, isRetryableAssistantError } from '@earendil-works/pi-ai';
import { ErrorCode, type PentestErrorContext, type PentestErrorType, type PromptErrorResult } from '../types/errors.js';

export class PentestError extends Error {
  override name = 'PentestError' as const;
  type: PentestErrorType;
  retryable: boolean;
  context: PentestErrorContext;
  timestamp: string;
  /** Optional specific error code for reliable classification */
  code?: ErrorCode;

  constructor(
    message: string,
    type: PentestErrorType,
    retryable: boolean = false,
    context: PentestErrorContext = {},
    code?: ErrorCode,
  ) {
    super(message);
    this.type = type;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export function handlePromptError(promptName: string, error: Error): PromptErrorResult {
  return {
    success: false,
    error: new PentestError(`Failed to load prompt '${promptName}': ${error.message}`, 'prompt', false, {
      promptName,
      originalError: error.message,
    }),
  };
}

/**
 * Whether a failed agent attempt is worth retrying.
 *
 * A PentestError already carries a verdict — for provider turns that verdict
 * comes from pi — so it is taken as given. Anything else is raw text, judged by
 * pi's classifier: transient for load, throttling, and transport failures,
 * terminal for quota, billing, and auth. Unrecognised errors are not retried, so
 * a permanent fault fails fast.
 */
export function isRetryableFailure(error: Error): boolean {
  if (error instanceof PentestError) return error.retryable;

  return isRetryableAssistantError({
    role: 'assistant',
    stopReason: 'error',
    errorMessage: error.message,
  } as AssistantMessage);
}

/**
 * Classifies errors by ErrorCode for reliable, code-based classification.
 * Used when error is a PentestError with a specific ErrorCode.
 */
function classifyByErrorCode(code: ErrorCode, retryableFromError: boolean): { type: string; retryable: boolean } {
  switch (code) {
    // Config errors - non-retryable (need manual fix)
    case ErrorCode.CONFIG_NOT_FOUND:
    case ErrorCode.CONFIG_VALIDATION_FAILED:
    case ErrorCode.CONFIG_PARSE_ERROR:
      return { type: 'ConfigurationError', retryable: false };

    // Prompt errors - non-retryable (need manual fix)
    case ErrorCode.PROMPT_LOAD_FAILED:
      return { type: 'ConfigurationError', retryable: false };

    case ErrorCode.GIT_CHECKPOINT_FAILED:
      return { type: 'GitError', retryable: retryableFromError };

    // Rollback errors leave the workspace state untrusted.
    case ErrorCode.GIT_ROLLBACK_FAILED:
      return { type: 'GitError', retryable: false };

    // Validation errors - retryable (agent may succeed on retry)
    case ErrorCode.OUTPUT_VALIDATION_FAILED:
    case ErrorCode.DELIVERABLE_NOT_FOUND:
      return { type: 'OutputValidationError', retryable: true };

    // Agent execution - use the retryable flag from the error
    case ErrorCode.AGENT_EXECUTION_FAILED:
      return { type: 'AgentExecutionError', retryable: retryableFromError };

    // Preflight validation errors
    case ErrorCode.REPO_NOT_FOUND:
      return { type: 'ConfigurationError', retryable: false };

    case ErrorCode.AUTH_FAILED:
      return { type: 'AuthenticationError', retryable: false };

    case ErrorCode.AUTH_LOGIN_FAILED:
      return { type: 'AuthLoginFailedError', retryable: false };

    case ErrorCode.TARGET_UNREACHABLE:
      return { type: 'InvalidTargetError', retryable: false };

    default:
      return { type: 'UnknownError', retryable: retryableFromError };
  }
}

/**
 * Classifies errors for Temporal workflow retry behavior.
 * Returns error type and whether Temporal should retry.
 *
 * Used by activities to wrap errors in ApplicationFailure:
 * - Retryable errors: Temporal retries with configured backoff
 * - Non-retryable errors: Temporal fails immediately
 *
 * Classification priority:
 * 1. A PentestError carrying an ErrorCode is classified by that code.
 * 2. Anything else falls through to isRetryableFailure.
 */
export function classifyErrorForTemporal(error: unknown): { type: string; retryable: boolean } {
  // === CODE-BASED CLASSIFICATION (Preferred for internal errors) ===
  if (error instanceof PentestError && error.code !== undefined) {
    return classifyByErrorCode(error.code, error.retryable);
  }

  // === FALLBACK ===
  // Everything else is a raw throw: a library error, or a PentestError carrying no
  // code. isRetryableFailure decides — pi's classifier for provider text, the
  // error's own verdict when it has one, and no retry for anything unrecognised.
  const err = error instanceof Error ? error : new Error(String(error));
  const retryable = isRetryableFailure(err);
  return { type: retryable ? 'TransientError' : 'PermanentError', retryable };
}
