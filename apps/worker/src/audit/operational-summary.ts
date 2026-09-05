// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Rolls a scan's non-agent (operational) spend up into the small, ordered set of labelled groups
 * the completion summary and live status view show. Pure and self-contained (no I/O) so it can be
 * unit-tested directly. Cost comes from the priced metrics; duration comes from the stage spans'
 * real wall-clock, which is why concurrent reconciliation classes read as their union, not a sum.
 */

/** The buckets operational (non-agent) spend is grouped into for the completion summary. */
export type OperationalGroupKey = 'agentic-sast' | 'reconciliation' | 'other';

export interface OperationalGroupTotal {
  readonly key: OperationalGroupKey;
  readonly label: string;
  readonly durationMs: number;
  /** Null only when every metric in the group has an unknown cost, matching the agent breakdown's N/A. */
  readonly costUsd: number | null;
}

/**
 * The wall-clock span of one operational stage. Sourced from `operationalStages` (not the priced
 * metrics), it is how the summary reports a group's real elapsed time — reconciliation classes run
 * concurrently, so their true duration is the union of these spans, not a sum.
 */
export interface OperationalStageTiming {
  readonly startedAt?: number;
  readonly durationMs?: number;
}

const OPERATIONAL_GROUP_LABELS: Readonly<Record<OperationalGroupKey, string>> = {
  'agentic-sast': 'Agentic SAST',
  reconciliation: 'Finding reconciliation',
  other: 'Background task',
};

// Stable render order; a group only appears when it has at least one metric.
const OPERATIONAL_GROUP_ORDER: readonly OperationalGroupKey[] = ['agentic-sast', 'reconciliation', 'other'];

/** Classify an operational metric key by its generated prefix; anything unexpected folds into `other`. */
function operationalGroupKey(metricKey: string): OperationalGroupKey {
  if (metricKey.startsWith('agentic-sast:')) return 'agentic-sast';
  if (metricKey.startsWith('reconciliation:')) return 'reconciliation';
  return 'other';
}

/**
 * Classify an operational *stage* key. Stage keys differ from metric keys: the agentic-SAST stage
 * is the bare `agentic-sast` (its metric is `agentic-sast:export`), and reconciliation stages are
 * `reconciliation:<class>`. So match the bare family name as well as its colon-prefixed children.
 */
function operationalStageGroupKey(stageKey: string): OperationalGroupKey {
  if (stageKey === 'agentic-sast' || stageKey.startsWith('agentic-sast:')) return 'agentic-sast';
  if (stageKey === 'reconciliation' || stageKey.startsWith('reconciliation:')) return 'reconciliation';
  return 'other';
}

/**
 * Total wall-clock covered by a set of `[startedAt, startedAt + durationMs)` spans, merging any
 * overlap. This is what keeps a group's duration faithful when its stages run concurrently: several
 * reconciliation classes overlap in time, so their real elapsed time is the union, never the sum.
 * Spans missing a start or a positive duration cannot be placed on the timeline and are ignored.
 */
export function mergeIntervalsDurationMs(spans: readonly OperationalStageTiming[]): number {
  const intervals = spans
    .filter(
      (span): span is { startedAt: number; durationMs: number } =>
        span.startedAt !== undefined && span.durationMs !== undefined && span.durationMs > 0,
    )
    .map((span) => ({ start: span.startedAt, end: span.startedAt + span.durationMs }))
    .sort((a, b) => a.start - b.start);

  let total = 0;
  let cursor = Number.NEGATIVE_INFINITY;
  for (const interval of intervals) {
    const start = Math.max(interval.start, cursor);
    if (interval.end > start) total += interval.end - start;
    cursor = Math.max(cursor, interval.end);
  }
  return total;
}

/**
 * Roll the per-key operational metrics up into a small, ordered set of labelled group totals.
 * Grouping by prefix (rather than itemizing raw keys) keeps the summary robust to key drift and
 * needs no per-key label table. A group's presence and cost come from the priced metrics — cost
 * stays null for a group only when no metric in it reported one, so a partially-known group still
 * shows its known spend. Duration comes from the group's stage spans (their real wall-clock union)
 * when `operationalStages` is supplied; without it, it falls back to summing the metric durations.
 */
export function summarizeOperationalMetrics(
  operationalMetrics: Readonly<Record<string, { readonly durationMs: number; readonly costUsd: number | null }>>,
  operationalStages?: Readonly<Record<string, OperationalStageTiming>>,
): OperationalGroupTotal[] {
  const metricDurationByGroup = new Map<OperationalGroupKey, number>();
  const costByGroup = new Map<OperationalGroupKey, number | null>();

  for (const [metricKey, metrics] of Object.entries(operationalMetrics)) {
    const group = operationalGroupKey(metricKey);
    metricDurationByGroup.set(group, (metricDurationByGroup.get(group) ?? 0) + Math.max(0, metrics.durationMs));
    if (metrics.costUsd !== null) {
      const priorCost = costByGroup.get(group);
      costByGroup.set(group, (priorCost ?? 0) + Math.max(0, metrics.costUsd));
    } else if (!costByGroup.has(group)) {
      costByGroup.set(group, null);
    }
  }

  const spansByGroup = new Map<OperationalGroupKey, OperationalStageTiming[]>();
  for (const [stageKey, timing] of Object.entries(operationalStages ?? {})) {
    const group = operationalStageGroupKey(stageKey);
    const spans = spansByGroup.get(group) ?? [];
    spans.push(timing);
    spansByGroup.set(group, spans);
  }

  const totals: OperationalGroupTotal[] = [];
  for (const key of OPERATIONAL_GROUP_ORDER) {
    if (!metricDurationByGroup.has(key)) continue;
    const spans = spansByGroup.get(key);
    // Real wall-clock from the stage spans; fall back to the summed metric durations when no spans
    // were supplied (e.g. the console path passes metrics only).
    const durationMs = spans !== undefined ? mergeIntervalsDurationMs(spans) : (metricDurationByGroup.get(key) ?? 0);
    totals.push({
      key,
      label: OPERATIONAL_GROUP_LABELS[key],
      durationMs,
      costUsd: costByGroup.get(key) ?? null,
    });
  }
  return totals;
}
