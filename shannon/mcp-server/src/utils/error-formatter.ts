// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Error Formatting Utilities
 *
 * Helper functions for creating structured error responses.
 */

import type { ErrorResponse } from '../types/tool-responses.js';

/**
 * Create a validation error response
 */
export function createValidationError(
  message: string,
  retryable: boolean = true,
  context?: Record<string, unknown>
): ErrorResponse {
  return {
    status: 'error',
    message,
    errorType: 'ValidationError',
    retryable,
    ...(context !== undefined && { context }),
  };
}

/**
 * Create a crypto error response
 */
export function createCryptoError(
  message: string,
  retryable: boolean = false,
  context?: Record<string, unknown>
): ErrorResponse {
  return {
    status: 'error',
    message,
    errorType: 'CryptoError',
    retryable,
    ...(context !== undefined && { context }),
  };
}

/**
 * Create a generic error response
 */
export function createGenericError(
  error: unknown,
  retryable: boolean = false,
  context?: Record<string, unknown>
): ErrorResponse {
  const message = error instanceof Error ? error.message : String(error);
  const errorType = error instanceof Error ? error.constructor.name : 'UnknownError';

  return {
    status: 'error',
    message,
    errorType,
    retryable,
    ...(context !== undefined && { context }),
  };
}
