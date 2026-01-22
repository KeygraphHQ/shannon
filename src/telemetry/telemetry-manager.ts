// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Telemetry Manager - PostHog integration with safety guarantees.
 *
 * CRITICAL: All public methods are wrapped in try-catch to ensure
 * telemetry NEVER interferes with workflow execution. Failures are
 * silently swallowed - telemetry is optional, not critical.
 *
 * Features:
 * - Safe initialization (never throws)
 * - Auto-redaction of sensitive data before sending
 * - Fire-and-forget tracking (non-blocking)
 * - Graceful shutdown with timeout (never blocks)
 */

import { PostHog } from 'posthog-node';
import crypto from 'crypto';
import { loadTelemetryConfig, type TelemetryConfig } from './telemetry-config.js';
import { TelemetryEvent, type BaseTelemetryProperties } from './telemetry-events.js';

// Shutdown timeout - don't block workflow completion
const SHUTDOWN_TIMEOUT_MS = 2000;

// Sensitive keys to redact from properties (case-insensitive matching)
const SENSITIVE_KEYS = [
  'weburl',
  'repopath',
  'configpath',
  'outputpath',
  'targeturl',
  'url',
  'path',
  'error',
  'message',
  'stack',
  'findings',
  'vulnerabilities',
  'credentials',
  'password',
  'secret',
  'token',
  'apikey',
  'key',
];

/**
 * Generate anonymous distinct ID as a UUID.
 */
function generateDistinctId(): string {
  return crypto.randomUUID();
}

/**
 * Hash a URL's hostname using SHA-256.
 * Returns a hex string hash of just the hostname portion.
 * Returns undefined if URL is invalid.
 */
export function hashTargetUrl(url: string): string | undefined {
  try {
    const hostname = new URL(url).hostname;
    return crypto.createHash('sha256').update(hostname).digest('hex');
  } catch {
    return undefined;
  }
}

/**
 * Check if a key name contains sensitive information.
 */
function isSensitiveKey(key: string): boolean {
  const keyLower = key.toLowerCase();
  return SENSITIVE_KEYS.some((sensitive) => keyLower.includes(sensitive));
}

/**
 * Redact sensitive values from properties object.
 * Returns a new object with sensitive keys removed.
 */
function redactSensitiveData(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(properties)) {
    // Skip sensitive keys entirely
    if (isSensitiveKey(key)) {
      continue;
    }

    // Recursively redact nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      redacted[key] = redactSensitiveData(value as Record<string, unknown>);
    } else if (typeof value === 'string') {
      // Skip string values that look like paths or URLs
      if (
        value.startsWith('/') ||
        value.startsWith('http') ||
        value.includes('://')
      ) {
        continue;
      }
      redacted[key] = value;
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

class TelemetryManager {
  private client: PostHog | null = null;
  private config: TelemetryConfig;
  private distinctId: string;
  private initialized = false;

  constructor() {
    this.config = loadTelemetryConfig();
    this.distinctId = generateDistinctId();
  }


  /**
   * Set the distinct ID for all subsequent events.
   * Call this with workflowId to ensure consistent ID across client/worker.
   */
  setDistinctId(id: string): void {
    this.distinctId = id;
  }

  /**
   * Initialize PostHog client.
   * Safe: never throws, logs warning on failure.
   */
  initialize(): void {
    try {
      if (this.initialized) {
        return;
      }

      this.initialized = true;

      if (!this.config.enabled) {
        return;
      }

      // Don't initialize if API key isn't configured
      if (this.config.apiKey.includes('REPLACE_WITH')) {
        this.config.enabled = false;
        return;
      }

      this.client = new PostHog(this.config.apiKey, {
        host: this.config.host,
        disableGeoip: true,
        flushAt: 10,
        flushInterval: 5000,
      });
    } catch {
      // Initialization failure is silent - telemetry is optional
      this.initialized = true;
      this.config.enabled = false;
    }
  }

  /**
   * Track an event with properties.
   * Safe: never throws, silently fails on error.
   *
   * @param event - Event name from TelemetryEvent enum
   * @param properties - Event properties (sensitive data auto-redacted)
   */
  track(event: TelemetryEvent, properties: Record<string, unknown> = {}): void {
    try {
      if (!this.config.enabled || !this.client) {
        return;
      }

      // Build base properties
      const baseProps: BaseTelemetryProperties & Record<string, unknown> = {
        os_platform: process.platform,
        node_version: process.version,
        $lib: 'shannon',
      };

      // Redact sensitive data and merge with base props
      const safeProps = {
        ...baseProps,
        ...redactSensitiveData(properties),
      };

      // Fire and forget - don't await
      this.client.capture({
        distinctId: this.distinctId,
        event,
        properties: safeProps,
      });
    } catch {
      // Tracking failure is silent - never interfere with workflow
    }
  }

  /**
   * Shutdown PostHog client gracefully.
   * Safe: never throws, uses timeout to prevent blocking.
   *
   * @returns Promise that resolves when shutdown completes (or times out)
   */
  async shutdown(): Promise<void> {
    try {
      if (!this.client) {
        return;
      }

      // Race shutdown against timeout to never block workflow
      await Promise.race([
        this.client.shutdown(),
        new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
      ]);
    } catch {
      // Shutdown failure is silent
    } finally {
      this.client = null;
    }
  }

  /**
   * Check if telemetry is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled && this.client !== null;
  }
}

// Singleton instance - import this in other modules
export const telemetry = new TelemetryManager();
