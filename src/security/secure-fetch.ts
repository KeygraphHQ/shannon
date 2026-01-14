// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Secure fetch wrapper with timeout, retries, and SSRF protection
 */

import { validateUrl, type UrlValidationOptions } from './url-validator.js';

export interface SecureFetchOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  validateUrl?: boolean;
  urlValidationOptions?: UrlValidationOptions;
  headers?: Record<string, string>;
  onRetry?: (attempt: number, error: Error) => void;
}

const DEFAULT_OPTIONS: SecureFetchOptions = {
  timeoutMs: 30_000, // 30 seconds
  maxRetries: 3,
  retryDelayMs: 1000,
  validateUrl: true,
};

/**
 * Fetch with timeout using AbortController
 */
const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
};

/**
 * Sleep utility for retry delays
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if an error is retryable
 */
const isRetryableError = (error: unknown): boolean => {
  if (error instanceof Error) {
    // Network errors
    if (error.message.includes('fetch failed')) return true;
    if (error.message.includes('ECONNRESET')) return true;
    if (error.message.includes('ETIMEDOUT')) return true;
    if (error.message.includes('ECONNREFUSED')) return true;
    if (error.name === 'AbortError') return true;
  }
  return false;
};

/**
 * Check if a response status is retryable
 */
const isRetryableStatus = (status: number): boolean => {
  return status === 429 || status === 502 || status === 503 || status === 504;
};

/**
 * Create a secure fetch function with validation and retries
 */
export const createSecureFetch = (options: SecureFetchOptions = {}) => {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  return async (
    url: string,
    init: RequestInit = {}
  ): Promise<Response> => {
    // Validate URL if enabled
    if (opts.validateUrl) {
      const validation = await validateUrl(url, opts.urlValidationOptions);
      if (!validation.valid) {
        throw new Error(`URL validation failed: ${validation.error}`);
      }
      // Log warnings
      for (const warning of validation.warnings) {
        console.warn(`⚠️  URL warning: ${warning}`);
      }
    }

    // Merge headers
    const headers = {
      ...opts.headers,
      ...(init.headers as Record<string, string> || {}),
    };

    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= opts.maxRetries!; attempt++) {
      try {
        const response = await fetchWithTimeout(
          url,
          { ...init, headers },
          opts.timeoutMs!
        );

        // Check for retryable status
        if (isRetryableStatus(response.status) && attempt < opts.maxRetries!) {
          const retryAfter = response.headers.get('Retry-After');
          const delayMs = retryAfter
            ? parseInt(retryAfter, 10) * 1000
            : opts.retryDelayMs! * attempt;

          opts.onRetry?.(attempt, new Error(`HTTP ${response.status}`));
          await sleep(delayMs);
          continue;
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (isRetryableError(error) && attempt < opts.maxRetries!) {
          opts.onRetry?.(attempt, lastError);
          await sleep(opts.retryDelayMs! * attempt);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Max retries exceeded');
  };
};

/**
 * Pre-configured secure fetch for external integrations (Slack, Jira, webhooks)
 */
export const integrationFetch = createSecureFetch({
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1000,
  validateUrl: true,
  urlValidationOptions: {
    allowPrivateIPs: false,
    allowLocalhost: false,
    requireHttps: true,
  },
});

/**
 * Pre-configured secure fetch for internal/localhost calls (API server)
 */
export const internalFetch = createSecureFetch({
  timeoutMs: 60_000,
  maxRetries: 1,
  validateUrl: false,
});
