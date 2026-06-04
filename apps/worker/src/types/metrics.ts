// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent metrics types used across services and activities.
 * Centralized here to avoid temporal/shared.ts import boundary violations.
 */

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
  // True when the checkpoint provider skipped the agent (resume path).
  // Callers that perform post-agent work on collected state should short-circuit
  // when this is set, since no fresh state was produced this run.
  skipped?: boolean;
}
