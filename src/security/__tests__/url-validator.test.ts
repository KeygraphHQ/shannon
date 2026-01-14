// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateWebhookUrl,
  validateSlackWebhookUrl,
  validateJiraUrl,
  resolveAndValidateHost,
} from '../url-validator.js';

describe('URL Validator', () => {
  describe('validateUrl', () => {
    it('should accept valid HTTPS URLs', async () => {
      const result = await validateUrl('https://example.com/path');
      expect(result.valid).toBe(true);
    });

    it('should reject file:// URLs (SSRF)', async () => {
      const result = await validateUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked URL scheme');
    });

    it('should reject javascript: URLs', async () => {
      const result = await validateUrl('javascript:alert(1)');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked URL scheme');
    });

    it('should reject data: URLs', async () => {
      const result = await validateUrl('data:text/html,<script>alert(1)</script>');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Blocked URL scheme');
    });

    it('should reject HTTP when HTTPS required', async () => {
      const result = await validateUrl('http://example.com', { requireHttps: true });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS is required');
    });

    it('should allow HTTP when HTTPS not required', async () => {
      const result = await validateUrl('http://example.com', { requireHttps: false });
      expect(result.valid).toBe(true);
    });

    it('should reject localhost by default', async () => {
      const result = await validateUrl('https://localhost/api', { allowLocalhost: false });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('internal hostname');
    });

    it('should allow localhost when explicitly enabled', async () => {
      const result = await validateUrl('http://localhost/api', {
        allowLocalhost: true,
        allowPrivateIPs: true, // localhost resolves to 127.0.0.1 which is private
        requireHttps: false,   // Allow HTTP for localhost
      });
      expect(result.valid).toBe(true);
    });

    it('should reject private IP addresses', async () => {
      const privateIPs = [
        'https://127.0.0.1/api',
        'https://10.0.0.1/api',
        'https://192.168.1.1/api',
        'https://172.16.0.1/api',
      ];

      for (const url of privateIPs) {
        const result = await validateUrl(url, { allowPrivateIPs: false });
        expect(result.valid).toBe(false);
      }
    });

    it('should reject AWS metadata endpoint (SSRF)', async () => {
      // With requireHttps: false to test the actual metadata blocking
      const result = await validateUrl('http://169.254.169.254/latest/meta-data/', {
        requireHttps: false,
      });
      expect(result.valid).toBe(false);
      expect(result.error).toContain('metadata');
    });

    it('should reject GCP metadata endpoint (SSRF)', async () => {
      const result = await validateUrl('http://metadata.google.internal/');
      expect(result.valid).toBe(false);
    });

    it('should warn about embedded credentials', async () => {
      const result = await validateUrl('https://user:pass@example.com');
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain('URL contains embedded credentials - this is a security risk');
    });

    it('should reject malformed URLs', async () => {
      const result = await validateUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL format');
    });

    it('should reject invalid port numbers', async () => {
      const result = await validateUrl('https://example.com:99999/');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateWebhookUrl', () => {
    it('should require HTTPS for webhooks', async () => {
      const result = await validateWebhookUrl('http://webhook.example.com/');
      expect(result.valid).toBe(false);
    });

    it('should accept valid webhook URLs', async () => {
      const result = await validateWebhookUrl('https://webhook.example.com/hook');
      expect(result.valid).toBe(true);
    });

    it('should reject internal URLs for webhooks', async () => {
      const result = await validateWebhookUrl('https://localhost:3000/hook');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateSlackWebhookUrl', () => {
    it('should accept valid Slack webhook URLs', async () => {
      const result = await validateSlackWebhookUrl('https://hooks.slack.com/services/T00/B00/XXX');
      expect(result.valid).toBe(true);
    });

    it('should reject non-Slack webhook URLs', async () => {
      const result = await validateSlackWebhookUrl('https://not-slack.com/webhook');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('hooks.slack.com');
    });

    it('should reject HTTP Slack URLs', async () => {
      const result = await validateSlackWebhookUrl('http://hooks.slack.com/services/T00/B00/XXX');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateJiraUrl', () => {
    it('should accept valid Atlassian URLs', async () => {
      const result = await validateJiraUrl('https://company.atlassian.net');
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBe(0);
    });

    it('should warn about self-hosted Jira', async () => {
      const result = await validateJiraUrl('https://jira.company.com');
      expect(result.valid).toBe(true);
      expect(result.warnings.some(w => w.includes('self-hosted'))).toBe(true);
    });

    it('should reject HTTP Jira URLs', async () => {
      const result = await validateJiraUrl('http://company.atlassian.net');
      expect(result.valid).toBe(false);
    });
  });

  describe('resolveAndValidateHost', () => {
    it('should validate IP addresses directly', async () => {
      const result = await resolveAndValidateHost('93.184.216.34', { allowPrivateIPs: false });
      expect(result.valid).toBe(true);
    });

    it('should reject private IP addresses', async () => {
      const result = await resolveAndValidateHost('192.168.1.1', { allowPrivateIPs: false });
      expect(result.valid).toBe(false);
    });

    it('should reject cloud metadata IPs', async () => {
      const result = await resolveAndValidateHost('169.254.169.254');
      expect(result.valid).toBe(false);
    });
  });
});
