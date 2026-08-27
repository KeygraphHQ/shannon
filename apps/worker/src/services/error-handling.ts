// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type AssistantMessage, isContextOverflow, isRetryableAssistantError } from '@earendil-works/pi-ai';
import {
  ErrorCode,
  type PentestErrorContext,
  type PentestErrorType,
  type PromptErrorResult,
  type ProviderFailure,
  type ProviderFailureCategory,
} from '../types/errors.js';

// The provider boundary answers two independent questions and never lets one decide the other:
//
//   - Retryability: no Shannon-owned parser decides this. A typed PentestError keeps its own
//     verdict, context overflow is terminal, a genuinely-thrown SDK error with structured
//     status/headers mirrors pi's request-layer policy, and every other (flattened) failure
//     defers to pi's own isRetryableAssistantError helper.
//   - Category: an observational label emitted only from reliable positive evidence — a preserved
//     category, a typed PentestError, the context-overflow check, or structured status. It is
//     never guessed from free text and never derived from the retry boolean.
//
// The matched provider text is always discarded and replaced with the fixed
// PROVIDER_FAILURE_MESSAGES entry, so raw provider responses never reach durable state or output.

// Node system error codes for transient transport faults. These are structured fields on a
// genuinely-thrown error, not provider prose, so reading them is not the text-parsing the boundary
// avoids. pi's flattened-message helper recognizes the prose forms ("connection refused", "fetch
// failed") but not these raw codes, so a thrown ECONNRESET would otherwise fail closed as terminal.
const NODE_TRANSPORT_ERROR_CODES: ReadonlySet<string> = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'EPIPE',
  'EAI_AGAIN',
  'ENOTFOUND',
]);

const PROVIDER_FAILURE_MESSAGES: Readonly<Record<ProviderFailureCategory, string>> = {
  rate_limit: 'The provider rate-limited the model request.',
  overloaded: 'The provider was temporarily overloaded.',
  transport: 'The provider request failed because of a transient transport error.',
  context_limit: 'The model request exceeded the provider context limit.',
  quota: 'The provider quota is exhausted.',
  authentication: 'Provider authentication failed. Verify the configured credential.',
  configuration: 'Provider configuration is invalid. Verify the selected provider, model, and endpoint.',
  unknown: 'The provider rejected the model request with a non-retryable error.',
} as const;

export class PentestError extends Error {
  override name = 'PentestError' as const;
  type: PentestErrorType;
  retryable: boolean;
  context: PentestErrorContext;
  timestamp: string;
  /** Optional specific error code for reliable classification */
  code?: ErrorCode;
  /** Sanitized provider category, preserved across boundaries so it is not reclassified and degraded. */
  providerCategory?: ProviderFailureCategory;

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
 * Uniform across every caller: the same retry rule decides preflight, ordinary agents,
 * task formation, SAST enrichment, and Capella. No provider text is parsed here.
 */
export function isRetryableFailure(error: unknown): boolean {
  return isProviderRetryable(error);
}

function providerFailure(
  category: ProviderFailureCategory,
  retryable: boolean,
  type: ProviderFailure['type'],
): ProviderFailure {
  return { type, category, retryable, message: PROVIDER_FAILURE_MESSAGES[category] };
}

function providerFailureText(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'errorMessage' in error &&
    typeof error.errorMessage === 'string'
  ) {
    return error.errorMessage;
  }
  return error instanceof Error ? error.message : String(error);
}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function parseProviderStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 599) return value;
  if (typeof value === 'string' && /^[1-5]\d{2}$/u.test(value.trim())) return Number(value.trim());
  return undefined;
}

/** Read only conventional bounded status fields; never stringify provider objects for classification. */
function structuredProviderStatus(error: unknown): number | undefined {
  const record = objectRecord(error);
  if (!record) return undefined;
  const response = objectRecord(record.response);
  const metadata = objectRecord(record.$metadata);
  const candidates = [
    record.status,
    record.statusCode,
    record.status_code,
    response?.status,
    response?.statusCode,
    metadata?.httpStatusCode,
  ];
  for (const candidate of candidates) {
    const status = parseProviderStatus(candidate);
    if (status !== undefined) return status;
  }
  return undefined;
}

/**
 * An explicit x-should-retry verdict from a genuinely-thrown SDK error's headers, matching the
 * header pi honors in its own request-layer retry loop. Only present on real thrown errors.
 */
function structuredRetryHeader(error: unknown): boolean | undefined {
  const record = objectRecord(error);
  if (!record) return undefined;
  const headers = record.headers;
  let raw: unknown;
  if (headers != null && typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (name: string) => unknown }).get('x-should-retry');
  } else {
    raw = objectRecord(headers)?.['x-should-retry'];
  }
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim().toLowerCase();
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

/**
 * Shape a failure into the AssistantMessage pi's helpers expect. A real assistant message is
 * passed through unchanged so pi can still detect silent overflow from its usage; anything else
 * is wrapped as an errored turn carrying only its already-derived text.
 */
function asAssistantMessage(error: unknown, text: string): AssistantMessage {
  const record = objectRecord(error);
  if (record && 'stopReason' in record && typeof record.errorMessage === 'string') {
    return error as AssistantMessage;
  }
  return { role: 'assistant', stopReason: 'error', errorMessage: text } as AssistantMessage;
}

function isProviderOverflow(error: unknown, text: string, contextWindow?: number): boolean {
  return isContextOverflow(asAssistantMessage(error, text), contextWindow);
}

/** Structured HTTP status → observational category. Mirrors pi's request-layer status semantics. */
function categoryForProviderStatus(status: number): ProviderFailureCategory | undefined {
  if (status === 401 || status === 403) return 'authentication';
  if (status === 413) return 'context_limit';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status === 409) return 'transport';
  if (status >= 500) return 'overloaded';
  return undefined;
}

/** Whether a structured status should retry, mirroring pi's request-layer policy. */
function isRetryableProviderStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

/** A transient transport fault identified by a Node system error code on the error or its cause. */
function structuredTransportCode(error: unknown): boolean {
  const record = objectRecord(error);
  if (!record) return false;
  if (typeof record.code === 'string' && NODE_TRANSPORT_ERROR_CODES.has(record.code)) return true;
  const causeCode = objectRecord(record.cause)?.code;
  return typeof causeCode === 'string' && NODE_TRANSPORT_ERROR_CODES.has(causeCode);
}

/**
 * Retryability of a failed attempt, computed independently of the category. Typed errors keep
 * their verdict; context overflow is terminal; structured status/headers mirror pi's request
 * layer; every flattened failure defers to pi's own helper. Nothing else parses provider text.
 */
export function isProviderRetryable(error: unknown, contextWindow?: number): boolean {
  if (error instanceof PentestError) {
    if (error.code !== undefined) return classifyByErrorCode(error.code, error.retryable).retryable;
    return error.retryable;
  }
  const text = providerFailureText(error);
  if (isProviderOverflow(error, text, contextWindow)) return false;
  const header = structuredRetryHeader(error);
  if (header !== undefined) return header;
  const status = structuredProviderStatus(error);
  if (status !== undefined) return isRetryableProviderStatus(status);
  if (structuredTransportCode(error)) return true;
  return isRetryableAssistantError(asAssistantMessage(error, text));
}

/** Error type of a provider failure. Only a typed PentestError may be auth/config; raw messages never are. */
function providerType(error: unknown): ProviderFailure['type'] {
  if (error instanceof PentestError && error.code !== undefined) {
    const classified = classifyByErrorCode(error.code, error.retryable);
    if (classified.type === 'AuthenticationError') return 'AuthenticationError';
    if (classified.type === 'ConfigurationError') return 'ConfigurationError';
  }
  return 'AgentExecutionError';
}

/**
 * Observational category, computed independently of retryability. Positive evidence only: a
 * preserved category, a typed PentestError, the context-overflow check, or structured status.
 * A flattened failure with no such evidence is honestly `unknown`, never a guess.
 */
export function providerCategory(error: unknown, contextWindow?: number): ProviderFailureCategory {
  if (error instanceof PentestError) {
    if (error.providerCategory !== undefined) return error.providerCategory;
    if (error.code !== undefined) {
      const classified = classifyByErrorCode(error.code, error.retryable);
      if (classified.type === 'AuthenticationError') return 'authentication';
      if (classified.type === 'ConfigurationError') return 'configuration';
    }
    return 'unknown';
  }
  const text = providerFailureText(error);
  if (isProviderOverflow(error, text, contextWindow)) return 'context_limit';
  const status = structuredProviderStatus(error);
  if (status !== undefined) {
    const category = categoryForProviderStatus(status);
    if (category !== undefined) return category;
  }
  if (structuredTransportCode(error)) return 'transport';
  return 'unknown';
}

/** Classify a provider failure without carrying provider response text across the boundary. */
export function classifyProviderFailure(error: unknown, contextWindow?: number): ProviderFailure {
  return providerFailure(
    providerCategory(error, contextWindow),
    isProviderRetryable(error, contextWindow),
    providerType(error),
  );
}

/**
 * Bounded machine code for a classified provider failure. It is derived only from the
 * classification, so nothing the provider wrote can reach a stored or logged message.
 */
export function providerFailureCode(failure: ProviderFailure): string {
  return failure.category;
}

/** The one sentence a rejected model request produces, carrying only its bounded code. */
export function providerFailureSentence(failure: ProviderFailure): string {
  return `The model provider rejected the request (${providerFailureCode(failure)}).`;
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
 * 2. Anything else goes through the bounded provider classifier. The original value is passed
 *    through unchanged so an AssistantMessage keeps the fields the classifier reads.
 */
export function classifyErrorForTemporal(error: unknown): { type: string; retryable: boolean } {
  // === CODE-BASED CLASSIFICATION (Preferred for internal errors) ===
  if (error instanceof PentestError && error.code !== undefined) {
    return classifyByErrorCode(error.code, error.retryable);
  }

  // === FALLBACK ===
  // Credential and configuration failures must surface under their own names and never retry:
  // retrying them as transient would burn the whole retry budget on a failure the operator has
  // to fix. Everything else becomes a Transient/Permanent marker from the retry verdict.
  const failure = classifyProviderFailure(error);
  if (failure.type === 'AuthenticationError' || failure.type === 'ConfigurationError') {
    return { type: failure.type, retryable: failure.retryable };
  }
  return { type: failure.retryable ? 'TransientError' : 'PermanentError', retryable: failure.retryable };
}
