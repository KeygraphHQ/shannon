// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Maps PipelineState to WorkflowSummary for audit logging.
 * Pure function with no side effects.
 */

import type { WorkflowSummary } from '../audit/workflow-logger.js';
import type { PipelineState } from './shared.js';

/**
 * Maps PipelineState to WorkflowSummary.
 *
 * This function is deterministic (no Date.now() or I/O) so it can be
 * safely imported into Temporal workflows. The caller must ensure
 * state.summary is set before calling (via computeSummary).
 */
export function toWorkflowSummary(
  state: PipelineState,
  status: 'completed' | 'failed' | 'cancelled' | 'partial',
): WorkflowSummary {
  // state.summary must be computed before calling this mapper
  const summary = state.summary;
  if (!summary) {
    throw new Error('toWorkflowSummary: state.summary must be set before calling');
  }

  // The failure detail is one of the child workflow's fixed safe sentences, so it carries no
  // provider, prompt, repository, or path content and travels with the stable code.
  const agenticSastFailure = state.agenticSast.status === 'failed' ? state.agenticSast : undefined;
  const agenticSastErrorCode = agenticSastFailure?.errorCode;
  const agenticSastFailureMessage = agenticSastFailure?.error;
  const agenticSastFailedStage = agenticSastFailure?.failedStageLabel;
  // Both terminal Capella variants carry a warnings array; a disabled or still-running run has none.
  const agenticSast = state.agenticSast;
  const usageAccountingWarnings =
    agenticSast.status === 'succeeded' || agenticSast.status === 'failed' ? agenticSast.warnings : [];
  // Carry the terminal disposition so a successful (or reduced-coverage) run is visible in the summary,
  // not only a failed one. Coverage is meaningful only on success.
  const agenticSastCoverage = agenticSast.status === 'succeeded' ? agenticSast.coverage : undefined;
  const endedAtMs = state.startTime + summary.totalDurationMs;
  return {
    status,
    startedAtMs: state.startTime,
    endedAtMs,
    totalDurationMs: summary.totalDurationMs,
    totalCostUsd: summary.totalCostUsd,
    completedAgents: state.completedAgents,
    skippedAgents: state.skippedAgents,
    agentMetrics: Object.fromEntries(
      Object.entries(state.agentMetrics).map(([name, metrics]) => [
        name,
        { durationMs: metrics.durationMs, costUsd: metrics.costUsd },
      ]),
    ),
    operationalMetrics: Object.fromEntries(
      Object.entries(state.operationalMetrics).map(([name, metrics]) => [
        name,
        { ...metrics, usageComplete: metrics.usageComplete !== false },
      ]),
    ),
    // The stage wall-clocks the summary reads to report each group's real elapsed time; the priced
    // metrics carry cost but no faithful duration (reconciliation stages record 0).
    operationalStages: Object.fromEntries(
      Object.entries(state.operationalStages).map(([key, stage]) => [
        key,
        {
          ...(stage.startedAt !== undefined && { startedAt: stage.startedAt }),
          ...(stage.durationMs !== undefined && { durationMs: stage.durationMs }),
        },
      ]),
    ),
    partialReasons: state.partialReasons,
    usageAccountingComplete: summary.usageAccountingComplete,
    usageAccountingWarnings: [...usageAccountingWarnings],
    agenticSastStatus: agenticSast.status,
    ...(agenticSastCoverage !== undefined && { agenticSastCoverage }),
    ...(agenticSastFailedStage !== undefined && { agenticSastFailedStage }),
    ...(agenticSastFailureMessage !== undefined && { agenticSastFailureMessage }),
    ...(agenticSastErrorCode !== undefined && { agenticSastErrorCode }),
    ...(state.errorCode !== undefined && { errorCode: state.errorCode }),
  };
}
