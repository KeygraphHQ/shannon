// Copyright (C) 2025 Keygraph, Inc.
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
 * ErrorCode provides precision within the coarse 8-category PentestErrorType.
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

  // Billing errors (PentestErrorType: 'billing')
  API_RATE_LIMITED = 'API_RATE_LIMITED',
  SPENDING_CAP_REACHED = 'SPENDING_CAP_REACHED',
  INSUFFICIENT_CREDITS = 'INSUFFICIENT_CREDITS',

  // Git errors (PentestErrorType: 'filesystem')
  GIT_CHECKPOINT_FAILED = 'GIT_CHECKPOINT_FAILED',
  GIT_ROLLBACK_FAILED = 'GIT_ROLLBACK_FAILED',

  // Prompt errors (PentestErrorType: 'prompt')
  PROMPT_LOAD_FAILED = 'PROMPT_LOAD_FAILED',

  // Validation errors (PentestErrorType: 'validation')
  DELIVERABLE_NOT_FOUND = 'DELIVERABLE_NOT_FOUND',
}

export type PentestErrorType =
  | 'config'
  | 'network'
  | 'tool'
  | 'prompt'
  | 'filesystem'
  | 'validation'
  | 'billing'
  | 'unknown';

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
