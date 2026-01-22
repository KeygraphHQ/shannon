// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Telemetry configuration with opt-out support.
 *
 * Telemetry is enabled by default. Users can disable via:
 * - DO_NOT_TRACK=1 (standard convention: https://consoledonottrack.com/)
 * - SHANNON_TELEMETRY=off|false|0
 */

export interface TelemetryConfig {
  enabled: boolean;
  apiKey: string;
  host: string;
}

// PostHog project configuration
// This is a write-only key - safe to publish, users cannot read analytics
const POSTHOG_API_KEY = 'phc_9EF2G6mm83rfLef5WmVLiNSyGQ4x0p8NzTRKiEAgvD4';
const POSTHOG_HOST = 'https://us.i.posthog.com';

/**
 * Check if telemetry is enabled based on environment variables.
 */
function isTelemetryEnabled(): boolean {
  // Standard opt-out: DO_NOT_TRACK
  const doNotTrack = process.env.DO_NOT_TRACK;
  if (doNotTrack === '1' || doNotTrack?.toLowerCase() === 'true') {
    return false;
  }

  // Shannon-specific opt-out
  const shannonTelemetry = process.env.SHANNON_TELEMETRY?.toLowerCase();
  if (
    shannonTelemetry === 'off' ||
    shannonTelemetry === 'false' ||
    shannonTelemetry === '0'
  ) {
    return false;
  }

  return true;
}

/**
 * Load telemetry configuration from environment.
 * Never throws - returns disabled config on any error.
 */
export function loadTelemetryConfig(): TelemetryConfig {
  try {
    return {
      enabled: isTelemetryEnabled(),
      apiKey: POSTHOG_API_KEY,
      host: POSTHOG_HOST,
    };
  } catch {
    // Config loading should never fail - return disabled
    return {
      enabled: false,
      apiKey: POSTHOG_API_KEY,
      host: POSTHOG_HOST,
    };
  }
}
