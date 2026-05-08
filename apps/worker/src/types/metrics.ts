// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent metrics types used across services and activities.
 * Centralized here to avoid temporal/shared.ts import boundary violations.
 */

/**
 * Aggregated tool usage statistics for an agent execution.
 * Duplicated from kiro-cli-executor.ts to avoid pulling Node.js modules
 * into the Temporal workflow sandbox (workflows can only import deterministic code).
 */
export interface ToolUsageSummaryMetrics {
  readonly totalInvocations: number;
  readonly toolCounts: Record<string, number>;
  readonly failures: number;
  readonly totalDurationMs: number;
}

/** A single tool invocation record (workflow-safe mirror of ToolUsageEntry). */
export interface ToolInvocationRecord {
  readonly tool: string;
  readonly timestamp: number;
  readonly success?: boolean | undefined;
  readonly durationMs?: number | undefined;
}

/** Detailed tool usage including per-invocation records. */
export interface DetailedToolUsageMetrics extends ToolUsageSummaryMetrics {
  readonly invocations: readonly ToolInvocationRecord[];
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
  toolUsage?: ToolUsageSummaryMetrics | undefined;
  toolInvocations?: readonly ToolInvocationRecord[] | undefined;
}
