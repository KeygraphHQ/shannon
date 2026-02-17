// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Audit system type definitions
 */

/**
 * Cross-cutting session metadata used by services, temporal, and audit.
 */
export interface SessionMetadata {
  id: string;
  webUrl: string;
  repoPath?: string;
  outputPath?: string;
  [key: string]: unknown;
}

/**
 * Result data passed to audit system when an agent execution ends.
 * Used by both AuditSession and MetricsTracker.
 */
export interface AgentEndResult {
  attemptNumber: number;
  duration_ms: number;
  cost_usd: number;
  success: boolean;
  model?: string | undefined;
  error?: string | undefined;
  checkpoint?: string | undefined;
  isFinalAttempt?: boolean | undefined;
}
