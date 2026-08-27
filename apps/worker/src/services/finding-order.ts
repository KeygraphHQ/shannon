// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Shared ordering for structured findings and every derived report surface. */

const UNRANKED = Number.MAX_SAFE_INTEGER;

export const SEVERITY_RANK: Readonly<Record<string, number>> = Object.freeze({
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
});

export const CONFIDENCE_RANK: Readonly<Record<string, number>> = Object.freeze({
  high: 0,
  medium: 1,
  low: 2,
});

/**
 * Recognized report categories. Unrecognized values form a sentinel group after `Miscellaneous`.
 *
 * Mirrors the `TypstCategory` union in report-output-schema.ts as plain strings rather than
 * importing the type. A category added there without a matching entry here will not fail to
 * compile; it will just sort into the unrecognized/lexical tail instead of its intended position.
 */
export const CATEGORY_ORDER = ['Injection', 'XSS', 'Authentication', 'SSRF', 'Authorization', 'Miscellaneous'] as const;

export function severityRank(severity: string | null | undefined): number {
  if (severity == null) return UNRANKED;
  return SEVERITY_RANK[severity] ?? UNRANKED;
}

export function confidenceRank(confidence: string | null | undefined): number {
  if (confidence == null) return UNRANKED;
  return CONFIDENCE_RANK[confidence] ?? UNRANKED;
}

export function categoryRank(category: string): number {
  const index = CATEGORY_ORDER.indexOf(category as (typeof CATEGORY_ORDER)[number]);
  return index === -1 ? UNRANKED : index;
}

/** Recognized categories first; unknown sentinel categories follow in lexical order. */
export function compareCategories(first: string, second: string): number {
  const firstRank = categoryRank(first);
  const secondRank = categoryRank(second);
  if (firstRank !== secondRank) return firstRank - secondRank;
  if (firstRank !== UNRANKED || first === second) return 0;
  return first < second ? -1 : 1;
}

export function trailingRefNumber(reference: string): number | null {
  const match = /(\d+)$/.exec(reference);
  if (match === null) return null;
  const parsed = Number.parseInt(match[1] as string, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Numeric suffix first, then the full reference as the deterministic fallback. */
export function compareRef(first: string, second: string): number {
  const firstNumber = trailingRefNumber(first);
  const secondNumber = trailingRefNumber(second);
  if (firstNumber !== secondNumber) {
    if (firstNumber === null) return 1;
    if (secondNumber === null) return -1;
    return firstNumber - secondNumber;
  }
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

export interface FindingOrderFields {
  readonly category: string;
  readonly severity?: string | null;
  readonly finding_id: string;
}

/** Category, severity, numeric suffix, then full-reference fallback. */
export function compareFindings(first: FindingOrderFields, second: FindingOrderFields): number {
  const categoryDifference = compareCategories(first.category, second.category);
  if (categoryDifference !== 0) return categoryDifference;

  const severityDifference = severityRank(first.severity) - severityRank(second.severity);
  if (severityDifference !== 0) return severityDifference;
  return compareRef(first.finding_id, second.finding_id);
}

export function orderFindings<T extends FindingOrderFields>(findings: readonly T[]): T[] {
  return [...findings].sort(compareFindings);
}
