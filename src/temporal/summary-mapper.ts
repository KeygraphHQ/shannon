// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Maps PipelineState to WorkflowSummary for audit logging.
 * Pure function with no side effects.
 */

import type { PipelineState } from './shared.js';
import type { WorkflowSummary } from '../audit/workflow-logger.js';

/**
 * Maps PipelineState to WorkflowSummary.
 *
 * This function is deterministic (no Date.now() or I/O) so it can be
 * safely imported into Temporal workflows. The caller must ensure
 * state.summary is set before calling (via computeSummary).
 */
export function toWorkflowSummary(
  state: PipelineState,
  status: 'completed' | 'failed'
): WorkflowSummary {
  // state.summary must be computed before calling this mapper
  const summary = state.summary;
  if (!summary) {
    throw new Error('toWorkflowSummary: state.summary must be set before calling');
  }

  return {
    status,
    totalDurationMs: summary.totalDurationMs,
    totalCostUsd: summary.totalCostUsd,
    completedAgents: state.completedAgents,
    agentMetrics: Object.fromEntries(
      Object.entries(state.agentMetrics).map(([name, m]) => [
        name,
        { durationMs: m.durationMs, costUsd: m.costUsd },
      ])
    ),
    ...(state.error && { error: state.error }),
  };
}
