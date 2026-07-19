// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent metrics types used across services and activities.
 * Centralized here to avoid temporal/shared.ts import boundary violations.
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';

/**
 * Pi-normalized usage for one execution scope. `inputTokens` excludes cache
 * reads/writes, which are reported separately by Pi. `reasoningTokens` is a
 * subset of `outputTokens` and must never be added to it when computing totals.
 */
export interface AgentUsageMetrics {
  inputTokens: number;
  outputTokens: number;
  /** Null when the provider does not expose a reasoning-token breakdown. */
  reasoningTokens: number | null;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  numTurns: number;
  costUsd: number;
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
  reasoningEffort?: ThinkingLevel | undefined;
  childModel?: string | undefined;
  childReasoningEffort?: ThinkingLevel | undefined;
  /** Direct coordinator usage; totals above equal parentUsage + childUsage. */
  parentUsage?: AgentUsageMetrics | undefined;
  /** Aggregate of all in-process `task` sub-agent sessions. */
  childUsage?: AgentUsageMetrics | undefined;
  // True when the checkpoint provider skipped the agent (resume path).
  // Callers that perform post-agent work on collected state should short-circuit
  // when this is set, since no fresh state was produced this run.
  skipped?: boolean;
}
