// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Production-grade secrets validation
 * Prevents weak/default credentials from being used
 */

import crypto from 'node:crypto';

// Common weak API keys/passwords that should be rejected
const WEAK_SECRETS = new Set([
  'change-me',
  'change-me-please',
  'changeme',
  'password',
  'password123',
  'secret',
  'admin',
  'admin123',
  'test',
  'test123',
  'default',
  'example',
  'your-api-key',
  'your-secret-key',
  'xxx',
  'yyy',
  'zzz',
  'abc123',
  '123456',
  '12345678',
  'api-key',
  'api_key',
  'apikey',
  'token',
  'placeholder',
  'replace-me',
  'todo',
  'fixme',
  'sample',
  'demo',
]);

// Patterns that indicate placeholder/example values
const PLACEHOLDER_PATTERNS = [
  /^your[-_]?/i,
  /[-_]?here$/i,
  /^xxx+$/i,
  /^placeholder/i,
  /^example/i,
  /^sample/i,
  /^demo/i,
  /^test[-_]?/i,
  /^dummy/i,
  /change[-_]?me/i,
  /replace[-_]?me/i,
  /^insert[-_]?/i,
  /^enter[-_]?/i,
  /^put[-_]?/i,
  /<.*>/i, // Looks like <placeholder>
];

export interface SecretValidationResult {
  valid: boolean;
  error?: string;
  warnings: string[];
  strength: 'weak' | 'moderate' | 'strong';
}

export interface SecretValidationOptions {
  minLength?: number;
  requireMixedCase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  rejectCommonPasswords?: boolean;
  allowPlaceholders?: boolean;
}

const DEFAULT_OPTIONS: SecretValidationOptions = {
  minLength: 16,
  requireMixedCase: false,
  requireNumbers: true,
  requireSpecialChars: false,
  rejectCommonPasswords: true,
  allowPlaceholders: false,
};

/**
 * Calculate entropy of a string
 */
const calculateEntropy = (str: string): number => {
  const charCounts = new Map<string, number>();
  for (const char of str) {
    charCounts.set(char, (charCounts.get(char) || 0) + 1);
  }

  let entropy = 0;
  for (const count of charCounts.values()) {
    const probability = count / str.length;
    entropy -= probability * Math.log2(probability);
  }

  return entropy * str.length;
};

/**
 * Check if a secret looks like a placeholder
 */
const isPlaceholder = (secret: string): boolean => {
  const lower = secret.toLowerCase();
  if (WEAK_SECRETS.has(lower)) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(secret));
};

/**
 * Validate an API key or secret
 */
export const validateApiKey = (
  apiKey: string,
  options: SecretValidationOptions = {}
): SecretValidationResult => {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const warnings: string[] = [];

  // Check for empty/whitespace
  if (!apiKey || apiKey.trim().length === 0) {
    return { valid: false, error: 'API key cannot be empty', warnings, strength: 'weak' };
  }

  const trimmed = apiKey.trim();

  // Check minimum length
  if (opts.minLength && trimmed.length < opts.minLength) {
    return {
      valid: false,
      error: `API key must be at least ${opts.minLength} characters (got ${trimmed.length})`,
      warnings,
      strength: 'weak',
    };
  }

  // Check for placeholders
  if (!opts.allowPlaceholders && isPlaceholder(trimmed)) {
    return {
      valid: false,
      error: 'API key appears to be a placeholder/example value - please use a real secret',
      warnings,
      strength: 'weak',
    };
  }

  // Check mixed case
  if (opts.requireMixedCase) {
    const hasUpper = /[A-Z]/.test(trimmed);
    const hasLower = /[a-z]/.test(trimmed);
    if (!hasUpper || !hasLower) {
      warnings.push('API key should contain both uppercase and lowercase letters');
    }
  }

  // Check numbers
  if (opts.requireNumbers && !/\d/.test(trimmed)) {
    warnings.push('API key should contain at least one number');
  }

  // Check special characters
  if (opts.requireSpecialChars && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(trimmed)) {
    warnings.push('API key should contain special characters');
  }

  // Calculate entropy
  const entropy = calculateEntropy(trimmed);
  let strength: 'weak' | 'moderate' | 'strong';

  if (entropy < 30) {
    strength = 'weak';
    warnings.push('API key has low entropy - consider using a more random value');
  } else if (entropy < 60) {
    strength = 'moderate';
  } else {
    strength = 'strong';
  }

  // Warn if it looks like it was hand-typed
  if (/^[a-zA-Z]+$/.test(trimmed)) {
    warnings.push('API key contains only letters - consider using a cryptographically random value');
  }

  return { valid: true, warnings, strength };
};

/**
 * Validate a webhook signing secret
 */
export const validateWebhookSecret = (
  secret: string,
  options: Partial<SecretValidationOptions> = {}
): SecretValidationResult => {
  return validateApiKey(secret, {
    minLength: 32,
    requireNumbers: true,
    ...options,
  });
};

/**
 * Generate a secure random API key
 */
export const generateSecureApiKey = (length: number = 32): string => {
  return crypto.randomBytes(length).toString('base64url');
};

/**
 * Generate a secure webhook secret
 */
export const generateWebhookSecret = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Validate a Slack bot token format
 */
export const validateSlackBotToken = (token: string): SecretValidationResult => {
  const warnings: string[] = [];

  if (!token || token.trim().length === 0) {
    return { valid: false, error: 'Slack bot token cannot be empty', warnings, strength: 'weak' };
  }

  // Slack bot tokens start with xoxb-
  if (!token.startsWith('xoxb-')) {
    return {
      valid: false,
      error: 'Slack bot token must start with "xoxb-"',
      warnings,
      strength: 'weak',
    };
  }

  // Check for placeholder
  if (isPlaceholder(token.slice(5))) {
    return {
      valid: false,
      error: 'Slack bot token appears to be a placeholder - please use a real token',
      warnings,
      strength: 'weak',
    };
  }

  // Valid format
  return { valid: true, warnings, strength: 'strong' };
};

/**
 * Validate a Jira API token
 */
export const validateJiraApiToken = (token: string): SecretValidationResult => {
  return validateApiKey(token, {
    minLength: 24,
    rejectCommonPasswords: true,
    allowPlaceholders: false,
  });
};
