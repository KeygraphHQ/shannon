// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Error type definitions
 */

/**
 * Specific error codes for reliable classification.
 *
 * ErrorCode provides precision within the coarse 7-category PentestErrorType.
 * Used by classifyErrorForTemporal for code-based classification (preferred)
 * with string matching as fallback for external errors.
 */
export enum ErrorCode {
  // Config errors (PentestErrorType: 'config')
  CONFIG_NOT_FOUND = 'CONFIG_NOT_FOUND',
  CONFIG_VALIDATION_FAILED = 'CONFIG_VALIDATION_FAILED',
  CONFIG_PARSE_ERROR = 'CONFIG_PARSE_ERROR',

  // Agent execution errors (PentestErrorType: 'validation')
  AGENT_EXECUTION_FAILED = 'AGENT_EXECUTION_FAILED',
  OUTPUT_VALIDATION_FAILED = 'OUTPUT_VALIDATION_FAILED',

  // Git errors (PentestErrorType: 'filesystem')
  GIT_CHECKPOINT_FAILED = 'GIT_CHECKPOINT_FAILED',
  GIT_ROLLBACK_FAILED = 'GIT_ROLLBACK_FAILED',

  // Prompt errors (PentestErrorType: 'prompt')
  PROMPT_LOAD_FAILED = 'PROMPT_LOAD_FAILED',

  // Validation errors (PentestErrorType: 'validation')
  DELIVERABLE_NOT_FOUND = 'DELIVERABLE_NOT_FOUND',

  // Preflight validation errors
  REPO_NOT_FOUND = 'REPO_NOT_FOUND',
  TARGET_UNREACHABLE = 'TARGET_UNREACHABLE',
  AUTH_FAILED = 'AUTH_FAILED',
  AUTH_LOGIN_FAILED = 'AUTH_LOGIN_FAILED',
}

export type PentestErrorType = 'config' | 'network' | 'prompt' | 'filesystem' | 'validation' | 'unknown';

/** Stable, sanitized provider failure passed across model execution boundaries. */
export const PROVIDER_FAILURE_CATEGORIES = Object.freeze([
  'rate_limit',
  'overloaded',
  'transport',
  'context_limit',
  'quota',
  'authentication',
  'configuration',
  'unknown',
] as const);

export type ProviderFailureCategory = (typeof PROVIDER_FAILURE_CATEGORIES)[number];

export function isProviderFailureCategory(value: unknown): value is ProviderFailureCategory {
  return typeof value === 'string' && PROVIDER_FAILURE_CATEGORIES.includes(value as ProviderFailureCategory);
}

export interface ProviderFailure {
  // The exhaustive set of shapes a model-provider failure can take at this boundary: bad
  // credentials, bad provider/model configuration, or everything else the agent run raised.
  readonly type: 'AuthenticationError' | 'ConfigurationError' | 'AgentExecutionError';
  readonly category: ProviderFailureCategory;
  readonly retryable: boolean;
  readonly message: string;
}

export interface PentestErrorContext {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  context: string;
  error: {
    name: string;
    message: string;
    type: PentestErrorType;
    retryable: boolean;
    stack?: string;
  };
}

export interface ToolErrorResult {
  tool: string;
  output: string;
  status: 'error';
  duration: number;
  success: false;
  error: Error;
}

export interface PromptErrorResult {
  success: false;
  error: Error;
}
