// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Pure deterministic collapse, ordering, and reference assignment for class tasks. */

import type { ReconciliationClass } from '../../types/reconciliation.js';
import { ArtifactIntegrityError } from './artifact-store.js';
import type {
  MergedObservation,
  PrimaryPreference,
  ReconciliationObservation,
  ReconciliationTask,
} from './contracts.js';
import { REF_PREFIX } from './refs.js';

const PRIORITY_ORDER: Readonly<Record<string, number>> = Object.freeze({ P1: 0, P2: 1, P3: 2 });
const CONFIDENCE_ORDER: Readonly<Record<string, number>> = Object.freeze({ high: 0, medium: 1, low: 2 });
const MISSING_PRIORITY_RANK = 2;
const MISSING_CONFIDENCE_RANK = 2;

type PreTask = Omit<ReconciliationTask, 'ID'>;

/** Ordered tasks, complete lineage, and merged-member accounting. */
export interface FixedTasks {
  tasks: ReconciliationTask[];
  observationToTask: Record<string, string>;
  mergedFromTotal: number;
}

/** Mint dense references `PREFIX-01..PREFIX-NN`, continuing unpadded past 99. */
export function mintTaskReferences(count: number, vulnerabilityClass: ReconciliationClass): string[] {
  const references: string[] = [];
  for (let index = 1; index <= count; index++) {
    references.push(`${REF_PREFIX[vulnerabilityClass]}-${String(index).padStart(2, '0')}`);
  }
  return references;
}

function rank(value: unknown, order: Readonly<Record<string, number>>, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  return order[value] ?? fallback;
}

// The strongest priority or confidence across a merged group of observations wins for the task,
// rather than the primary observation's own value. A weaker duplicate finding should not water
// down a stronger signal one of the other producers already established for the same vulnerability.
function strongest(
  members: readonly ReconciliationObservation[],
  field: 'priority' | 'confidence',
  order: Readonly<Record<string, number>>,
): string | undefined {
  let best: string | undefined;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const member of members) {
    const value = (member as unknown as Record<string, unknown>)[field];
    if (typeof value !== 'string') continue;
    const valueRank = rank(value, order, Number.POSITIVE_INFINITY);
    if (valueRank < bestRank) {
      best = value;
      bestRank = valueRank;
    }
  }
  return best;
}

// A `preferred` member (a SAST producer) outranks a `default` one, so a group that pairs a SAST
// finding with a vulnerability-analysis finding keeps the SAST observation as the task primary.
function preferenceRank(preference: PrimaryPreference): number {
  return preference === 'preferred' ? 0 : 1;
}

function primaryIndex(members: readonly ReconciliationObservation[]): number {
  if (members.length === 0) {
    throw new ArtifactIntegrityError('Cannot materialize an empty observation group');
  }
  let selected = 0;
  let selectedRank = preferenceRank(members[0]?.primary_preference ?? 'default');
  for (let index = 1; index < members.length; index++) {
    const member = members[index];
    if (member === undefined) continue;
    const memberRank = preferenceRank(member.primary_preference);
    if (memberRank < selectedRank) {
      selected = index;
      selectedRank = memberRank;
    }
  }
  return selected;
}

// `primary_preference` has already done its job by the time a group reaches this function: it
// picked the primary observation via `primaryIndex` above. Dropping it here, rather than carrying
// it into the task, is what the `MaterializedProducerFields` type in contracts.ts enforces at
// compile time; nothing downstream of materialization is allowed to see or re-derive this preference.
function toMaterialized(observation: ReconciliationObservation): MergedObservation {
  const { primary_preference: _primaryPreference, ...materialized } = observation;
  return materialized as MergedObservation;
}

/** Collapse one member group into a single pre-task: pick the primary, fold the rest as `merged_from`. */
function buildTask(members: readonly ReconciliationObservation[]): PreTask {
  const selectedIndex = primaryIndex(members);
  const primary = members[selectedIndex];
  if (primary === undefined) {
    throw new ArtifactIntegrityError('Materialization selected a missing primary observation');
  }
  const merged = members.filter((_member, index) => index !== selectedIndex);
  const priority = strongest(members, 'priority', PRIORITY_ORDER);
  const confidence = strongest(members, 'confidence', CONFIDENCE_ORDER);

  const task: Record<string, unknown> = { ...toMaterialized(primary) };
  if (priority !== undefined) task.priority = priority;
  if (confidence !== undefined) task.confidence = confidence;
  if (merged.length > 0) task.merged_from = merged.map(toMaterialized);
  return task as PreTask;
}

function compareCodeUnits(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function taskField(task: PreTask, field: string): unknown {
  return (task as unknown as Record<string, unknown>)[field];
}

// Total order over tasks: priority, then confidence, then producer ID as a final tie-break. The
// producer-ID comparison guarantees no two tasks ever compare equal, so the sort is fully
// deterministic and the dense reference assignment below is reproducible across retries.
function compareTasks(first: PreTask, second: PreTask): number {
  const priorityDifference =
    rank(taskField(first, 'priority'), PRIORITY_ORDER, MISSING_PRIORITY_RANK) -
    rank(taskField(second, 'priority'), PRIORITY_ORDER, MISSING_PRIORITY_RANK);
  if (priorityDifference !== 0) return priorityDifference;

  const confidenceDifference =
    rank(taskField(first, 'confidence'), CONFIDENCE_ORDER, MISSING_CONFIDENCE_RANK) -
    rank(taskField(second, 'confidence'), CONFIDENCE_ORDER, MISSING_CONFIDENCE_RANK);
  if (confidenceDifference !== 0) return confidenceDifference;

  const firstProducer = taskField(first, 'producer_id');
  const secondProducer = taskField(second, 'producer_id');
  return compareCodeUnits(
    typeof firstProducer === 'string' ? firstProducer : '',
    typeof secondProducer === 'string' ? secondProducer : '',
  );
}

/** Collapse member groups, sort by the locked total order, and assign dense stable references. */
export function buildFixedTasks(
  memberGroups: ReadonlyArray<readonly ReconciliationObservation[]>,
  vulnerabilityClass: ReconciliationClass,
): FixedTasks {
  const preTasks = memberGroups.map(buildTask);
  preTasks.sort(compareTasks);

  const references = mintTaskReferences(preTasks.length, vulnerabilityClass);
  const tasks = preTasks.map(
    (task, index) =>
      ({
        ...(task as unknown as Record<string, unknown>),
        ID: references[index] as string,
      }) as ReconciliationTask,
  );

  const observationToTask: Record<string, string> = Object.create(null);
  let mergedFromTotal = 0;
  for (const task of tasks) {
    observationToTask[task.producer_id] = task.ID;
    for (const member of task.merged_from ?? []) {
      observationToTask[member.producer_id] = task.ID;
      mergedFromTotal++;
    }
  }
  return { tasks, observationToTask, mergedFromTotal };
}
