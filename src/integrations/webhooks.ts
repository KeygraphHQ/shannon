// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Secure Webhook Integration
 * Features: HMAC signing, SSRF protection, retries, timeouts
 */

import crypto from 'node:crypto';
import type { WebhookConfig } from '../types/config.js';
import { createSecureFetch, validateWebhookUrl, createWebhookRateLimiter } from '../security/index.js';

// Rate limiter for webhook calls
const webhookRateLimiter = createWebhookRateLimiter();

// Secure fetch with SSRF protection
const secureFetch = createSecureFetch({
  timeoutMs: 30_000,
  maxRetries: 3,
  retryDelayMs: 1000,
  validateUrl: true,
  urlValidationOptions: {
    allowPrivateIPs: false,
    allowLocalhost: false,
    requireHttps: true,
  },
  onRetry: (attempt, error) => {
    console.warn(`⚠️  Webhook retry ${attempt}: ${error.message}`);
  },
});

/**
 * Sign payload with HMAC-SHA256
 */
const signPayload = (payload: string, secret: string): string => {
  return `sha256=${crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
};

/**
 * Generate unique event ID for deduplication
 */
const generateEventId = (): string => {
  return `shannon_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
};

export interface WebhookResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  duration?: number;
  eventId: string;
}

/**
 * Send webhook event with security features
 */
export const sendWebhookEvent = async (
  webhook: WebhookConfig,
  event: string,
  data: Record<string, unknown>
): Promise<WebhookResult> => {
  const eventId = generateEventId();
  const startTime = Date.now();

  // Check if event is subscribed
  if (webhook.events && webhook.events.length > 0 && !webhook.events.includes(event)) {
    return { success: true, eventId, duration: 0 }; // Skipped, not an error
  }

  // Rate limiting
  const rateLimit = webhookRateLimiter.isAllowed(webhook.url);
  if (!rateLimit.allowed) {
    console.warn(`⚠️  Webhook rate limited for ${webhook.url}`);
    return {
      success: false,
      error: `Rate limited, retry after ${Math.ceil(rateLimit.resetMs / 1000)}s`,
      eventId,
      duration: Date.now() - startTime,
    };
  }

  // Validate URL for SSRF
  const urlValidation = await validateWebhookUrl(webhook.url);
  if (!urlValidation.valid) {
    return {
      success: false,
      error: `URL validation failed: ${urlValidation.error}`,
      eventId,
      duration: Date.now() - startTime,
    };
  }

  // Build payload
  const payload = JSON.stringify({
    event,
    event_id: eventId,
    data,
    sent_at: new Date().toISOString(),
    version: '1.0',
  });

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'Shannon-Security/1.0',
    'X-Shannon-Event': event,
    'X-Shannon-Event-ID': eventId,
    'X-Shannon-Delivery': eventId,
  };

  // Add signature if secret is provided
  if (webhook.secret) {
    headers['X-Shannon-Signature'] = signPayload(payload, webhook.secret);
    headers['X-Shannon-Signature-256'] = signPayload(payload, webhook.secret);
  } else {
    console.warn(`⚠️  Webhook ${webhook.url} has no signing secret - payload is unsigned`);
  }

  try {
    const response = await secureFetch(webhook.url, {
      method: 'POST',
      headers,
      body: payload,
    });

    const duration = Date.now() - startTime;

    if (!response.ok) {
      const body = await response.text().catch(() => 'Unable to read response body');
      return {
        success: false,
        statusCode: response.status,
        error: `HTTP ${response.status}: ${body.slice(0, 200)}`,
        eventId,
        duration,
      };
    }

    return {
      success: true,
      statusCode: response.status,
      eventId,
      duration,
    };
  } catch (error) {
    const err = error as Error;
    return {
      success: false,
      error: err.message,
      eventId,
      duration: Date.now() - startTime,
    };
  }
};

/**
 * Send event to multiple webhooks in parallel with results
 */
export const sendWebhookEventToAll = async (
  webhooks: WebhookConfig[],
  event: string,
  data: Record<string, unknown>
): Promise<Map<string, WebhookResult>> => {
  const results = new Map<string, WebhookResult>();

  if (!webhooks || webhooks.length === 0) {
    return results;
  }

  const promises = webhooks.map(async (webhook) => {
    const result = await sendWebhookEvent(webhook, event, data);
    results.set(webhook.url, result);
  });

  await Promise.allSettled(promises);
  return results;
};

/**
 * Verify webhook signature (for receiving webhooks)
 */
export const verifyWebhookSignature = (
  payload: string,
  signature: string,
  secret: string
): boolean => {
  if (!signature || !secret) {
    return false;
  }

  const expected = signPayload(payload, secret);

  // Constant-time comparison
  if (signature.length !== expected.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < signature.length; i++) {
    result |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }

  return result === 0;
};
