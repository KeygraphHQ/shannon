// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { describe, it, expect } from 'vitest';
import {
  validateApiKey,
  validateWebhookSecret,
  validateSlackBotToken,
  validateJiraApiToken,
  generateSecureApiKey,
  generateWebhookSecret,
} from '../secrets-validator.js';

describe('Secrets Validator', () => {
  describe('validateApiKey', () => {
    it('should reject empty API keys', () => {
      const result = validateApiKey('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });

    it('should reject short API keys', () => {
      const result = validateApiKey('abc123', { minLength: 16 });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 16 characters');
    });

    it('should reject placeholder values', () => {
      // All placeholders must be >= 16 characters (default minLength)
      // or tested with a lower minLength to trigger placeholder detection
      const placeholders = [
        'change-me-please',
        'your-api-key-here',
        'placeholder-value',
        'example-key-value',
        '<insert-key-here>',
      ];

      for (const placeholder of placeholders) {
        const result = validateApiKey(placeholder);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('placeholder');
      }

      // Short placeholders fail length check first
      const shortPlaceholders = ['xxx', 'test123', 'password'];
      for (const placeholder of shortPlaceholders) {
        const result = validateApiKey(placeholder);
        expect(result.valid).toBe(false);
        // Either fails length or placeholder check
        expect(result.error).toBeDefined();
      }
    });

    it('should accept strong API keys', () => {
      const strongKey = generateSecureApiKey(32);
      const result = validateApiKey(strongKey, { minLength: 32 });
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('strong');
    });

    it('should warn about weak entropy', () => {
      const result = validateApiKey('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', { minLength: 16 });
      expect(result.valid).toBe(true);
      expect(result.strength).toBe('weak');
      expect(result.warnings.some(w => w.includes('entropy'))).toBe(true);
    });

    it('should warn about letter-only keys', () => {
      const result = validateApiKey('abcdefghijklmnopqrstuvwxyzabcdef', { minLength: 16 });
      expect(result.warnings.some(w => w.includes('only letters'))).toBe(true);
    });

    it('should allow placeholders when explicitly enabled', () => {
      const result = validateApiKey('test-key', { allowPlaceholders: true, minLength: 8 });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateWebhookSecret', () => {
    it('should require minimum 32 characters', () => {
      const result = validateWebhookSecret('short-secret');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('32 characters');
    });

    it('should accept strong secrets', () => {
      const secret = generateWebhookSecret();
      const result = validateWebhookSecret(secret);
      expect(result.valid).toBe(true);
    });
  });

  describe('validateSlackBotToken', () => {
    it('should require xoxb- prefix', () => {
      const result = validateSlackBotToken('not-a-slack-token');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('xoxb-');
    });

    it('should reject placeholder bot tokens', () => {
      const result = validateSlackBotToken('xoxb-your-token-here');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('placeholder');
    });

    it('should accept valid-looking bot tokens', () => {
      const result = validateSlackBotToken('xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateJiraApiToken', () => {
    it('should require minimum 24 characters', () => {
      const result = validateJiraApiToken('short');
      expect(result.valid).toBe(false);
    });

    it('should reject placeholder tokens', () => {
      const result = validateJiraApiToken('your-jira-api-token-here-placeholder');
      expect(result.valid).toBe(false);
    });

    it('should accept strong API tokens', () => {
      const result = validateJiraApiToken('ATATT3xFfGF0E8dWxXKPqN9hK1M2N3O4P5Q6R7S8T9U0');
      expect(result.valid).toBe(true);
    });
  });

  describe('generateSecureApiKey', () => {
    it('should generate keys of specified length', () => {
      const key = generateSecureApiKey(32);
      // Base64url encoding will be longer than raw bytes
      expect(key.length).toBeGreaterThanOrEqual(32);
    });

    it('should generate unique keys', () => {
      const keys = new Set(Array.from({ length: 100 }, () => generateSecureApiKey(32)));
      expect(keys.size).toBe(100);
    });

    it('should generate URL-safe keys', () => {
      const key = generateSecureApiKey(32);
      expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('generateWebhookSecret', () => {
    it('should generate hex-encoded secrets', () => {
      const secret = generateWebhookSecret();
      expect(secret).toMatch(/^[a-f0-9]+$/);
      expect(secret.length).toBe(64); // 32 bytes = 64 hex chars
    });

    it('should generate unique secrets', () => {
      const secrets = new Set(Array.from({ length: 100 }, () => generateWebhookSecret()));
      expect(secrets.size).toBe(100);
    });
  });
});
