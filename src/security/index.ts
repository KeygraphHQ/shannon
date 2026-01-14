// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Shannon Security Module
 * Production-grade security utilities for the AI security testing framework
 */

export {
  validateUrl,
  validateWebhookUrl,
  validateSlackWebhookUrl,
  validateJiraUrl,
  resolveAndValidateHost,
  type UrlValidationResult,
  type UrlValidationOptions,
} from './url-validator.js';

export {
  validateApiKey,
  validateWebhookSecret,
  validateSlackBotToken,
  validateJiraApiToken,
  generateSecureApiKey,
  generateWebhookSecret,
  type SecretValidationResult,
  type SecretValidationOptions,
} from './secrets-validator.js';

export {
  RateLimiter,
  createApiRateLimiter,
  createScanRateLimiter,
  createWebhookRateLimiter,
  type RateLimitConfig,
} from './rate-limiter.js';

export { createSecureFetch, type SecureFetchOptions } from './secure-fetch.js';
