// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Closed Pass 1 submission schema and defensive group acceptance. */

import { describeReusedLabels, describeUnknownLabels } from './submit-validation.js';

const TOP_LEVEL_KEYS = Object.freeze(['groups'] as const);
const GROUP_KEYS = Object.freeze(['queue_labels', 'reasoning'] as const);

export interface TaskFormationGroup {
  readonly queue_labels: readonly string[];
  readonly reasoning: string;
}

export interface AcceptedTaskGroups {
  readonly groups: readonly TaskFormationGroup[];
  readonly rejectedGroupCount: number;
  readonly droppedUnknownLabelCount: number;
}

interface ParsedGroup {
  readonly group?: TaskFormationGroup;
  readonly labels: readonly string[];
  readonly duplicateLabels: readonly string[];
  readonly closed: boolean;
  readonly structurallyValid: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index]);
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function parseGroup(value: unknown): ParsedGroup {
  if (!isRecord(value)) {
    return { labels: [], duplicateLabels: [], closed: false, structurallyValid: false };
  }

  const closed = hasExactKeys(value, GROUP_KEYS);
  const rawLabels = value.queue_labels;
  const labels = Array.isArray(rawLabels)
    ? rawLabels.filter((label): label is string => typeof label === 'string')
    : [];
  const duplicateLabels = duplicateValues(labels);
  const structurallyValid =
    closed &&
    Array.isArray(rawLabels) &&
    labels.length === rawLabels.length &&
    labels.length >= 2 &&
    duplicateLabels.length === 0 &&
    typeof value.reasoning === 'string' &&
    value.reasoning.trim().length > 0;

  return {
    ...(structurallyValid && { group: { queue_labels: labels, reasoning: value.reasoning as string } }),
    labels,
    duplicateLabels,
    closed,
    structurallyValid,
  };
}

function capturedGroups(captured: unknown): { readonly closed: boolean; readonly groups: readonly unknown[] } {
  if (!isRecord(captured) || !hasExactKeys(captured, TOP_LEVEL_KEYS) || !Array.isArray(captured.groups)) {
    return { closed: false, groups: [] };
  }
  return { closed: true, groups: captured.groups };
}

/** Build the call-local schema. Both object layers reject unknown properties. */
export function buildTaskFormationSchema(queueLabels: readonly string[]): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['groups'],
    properties: {
      groups: {
        type: 'array',
        description:
          'Sets of observations that predict one exploitation attempt. Use an empty array when every observation stands alone.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['queue_labels', 'reasoning'],
          properties: {
            queue_labels: {
              type: 'array',
              minItems: 2,
              uniqueItems: true,
              items: { type: 'string', enum: [...queueLabels] },
              description: 'Two or more distinct labels supplied in this call. A label belongs to at most one group.',
            },
            reasoning: {
              type: 'string',
              minLength: 1,
              description: 'Why one exploitation attempt and one verdict settle every named observation.',
            },
          },
        },
      },
    },
  };
}

/** Explain cross-group and nonblank constraints so the model can correct a rejected call. */
export function findTaskFormationProblems(captured: unknown, queueLabels: ReadonlySet<string>): string[] {
  const envelope = capturedGroups(captured);
  if (!envelope.closed) return ['The submission must be exactly one object with a groups array and no other fields.'];

  const parsed = envelope.groups.map(parseGroup);
  const problems: string[] = [];
  const unknown = new Set<string>();
  const duplicateWithinGroup = new Set<string>();
  const labelUse = new Map<string, number>();
  let malformedGroups = 0;
  let undersizedGroups = 0;
  let blankReasoningGroups = 0;

  for (let index = 0; index < envelope.groups.length; index++) {
    const raw = envelope.groups[index];
    const group = parsed[index] as ParsedGroup;
    if (!isRecord(raw) || !group.closed || !Array.isArray(raw.queue_labels)) malformedGroups++;
    if (group.labels.length < 2) undersizedGroups++;
    if (isRecord(raw) && (typeof raw.reasoning !== 'string' || raw.reasoning.trim().length === 0)) {
      blankReasoningGroups++;
    }
    for (const duplicate of group.duplicateLabels) duplicateWithinGroup.add(duplicate);
    for (const label of group.labels) {
      if (!queueLabels.has(label)) unknown.add(label);
      labelUse.set(label, (labelUse.get(label) ?? 0) + 1);
    }
  }

  if (malformedGroups > 0) {
    problems.push('Every group must contain exactly queue_labels and reasoning, with no other fields.');
  }
  if (undersizedGroups > 0) {
    problems.push(
      'Every group must name at least two distinct queued observations; leave single observations ungrouped.',
    );
  }
  if (duplicateWithinGroup.size > 0) {
    problems.push(`A group cannot repeat a label: ${[...duplicateWithinGroup].join(', ')}.`);
  }
  if (blankReasoningGroups > 0) {
    problems.push('Every group needs nonblank reasoning tied to one exploitation attempt and one verdict.');
  }

  const unknownMessage = describeUnknownLabels([...unknown], 'queued finding');
  if (unknownMessage) problems.push(unknownMessage);

  const reused = [...labelUse.entries()].filter(([, count]) => count > 1).map(([label]) => label);
  const reusedMessage = describeReusedLabels(reused, 'group');
  if (reusedMessage) problems.push(reusedMessage);
  return problems;
}

/**
 * Defensively accept only closed, well-formed groups. Reuse is counted across every submitted
 * group, including a group already invalid for another reason, so every claimant is discarded.
 */
export function acceptTaskGroups(captured: unknown, queueLabels: ReadonlySet<string>): AcceptedTaskGroups {
  const envelope = capturedGroups(captured);
  if (!envelope.closed) {
    const submittedCount = isRecord(captured) && Array.isArray(captured.groups) ? captured.groups.length : 0;
    return { groups: [], rejectedGroupCount: submittedCount, droppedUnknownLabelCount: 0 };
  }

  const parsed = envelope.groups.map(parseGroup);
  const labelUse = new Map<string, number>();
  for (const group of parsed) {
    for (const label of group.labels) labelUse.set(label, (labelUse.get(label) ?? 0) + 1);
  }

  let droppedUnknownLabelCount = 0;
  const groups: TaskFormationGroup[] = [];
  for (const parsedGroup of parsed) {
    const containsUnknown = parsedGroup.labels.some((label) => !queueLabels.has(label));
    if (containsUnknown) droppedUnknownLabelCount++;
    if (!parsedGroup.structurallyValid || parsedGroup.group === undefined || containsUnknown) continue;
    if (parsedGroup.labels.some((label) => labelUse.get(label) !== 1)) continue;
    groups.push(parsedGroup.group);
  }

  return {
    groups,
    rejectedGroupCount: envelope.groups.length - groups.length,
    droppedUnknownLabelCount,
  };
}
