// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Skill Forge — Validator (Module 6)
 *
 * A/B runner that compares original vs. candidate skill versions.
 *
 * Comparison strategy:
 * - Structural: JSON schema diff for queue deliverables, heading structure for markdown
 * - Semantic: Key extraction — do both versions find the same vulns, endpoints, recommendations?
 * - Metric: token count, duration, cost — from profiler data
 *
 * MVP: manual validation (single comparison). Auto A/B with multiple runs is v2.
 */

import { getForgeDb } from './db.js';
import type {
  ABTestResult,
  AggregateMetrics,
  OutputComparison,
  ForgeConfig,
} from './types.js';

// ---------------------------------------------------------------------------
// Output comparison
// ---------------------------------------------------------------------------

/**
 * Compare two outputs for structural and semantic equivalence.
 */
export function compareOutputs(
  originalOutput: string,
  candidateOutput: string
): OutputComparison {
  // Try JSON structural comparison first
  const jsonComparison = compareJsonOutputs(originalOutput, candidateOutput);
  if (jsonComparison) return jsonComparison;

  // Fall back to markdown/text structural comparison
  return compareTextOutputs(originalOutput, candidateOutput);
}

/**
 * Compare JSON outputs — checks schema structure and key values.
 */
function compareJsonOutputs(
  original: string,
  candidate: string
): OutputComparison | null {
  let origObj: unknown;
  let candObj: unknown;

  try {
    origObj = JSON.parse(original);
    candObj = JSON.parse(candidate);
  } catch {
    return null; // Not JSON, skip
  }

  const origKeys = extractJsonKeys(origObj);
  const candKeys = extractJsonKeys(candObj);

  const missingKeys = origKeys.filter((k) => !candKeys.includes(k));
  const extraKeys = candKeys.filter((k) => !origKeys.includes(k));

  const structuralMatch = missingKeys.length === 0 && extraKeys.length === 0;

  // Semantic: compare values of critical fields
  const origValues = extractCriticalValues(origObj);
  const candValues = extractCriticalValues(candObj);
  const valueDiffs = compareValueSets(origValues, candValues);

  const semanticallyIdentical = structuralMatch && valueDiffs.length === 0;

  const diffParts: string[] = [];
  if (missingKeys.length > 0) diffParts.push(`Missing keys: ${missingKeys.join(', ')}`);
  if (extraKeys.length > 0) diffParts.push(`Extra keys: ${extraKeys.join(', ')}`);
  if (valueDiffs.length > 0) diffParts.push(`Value diffs: ${valueDiffs.join('; ')}`);

  return {
    semanticallyIdentical,
    diffSummary: diffParts.length > 0 ? diffParts.join(' | ') : 'Outputs are identical.',
    structuralMatch,
  };
}

/**
 * Compare text/markdown outputs — checks heading structure and key sections.
 */
function compareTextOutputs(
  original: string,
  candidate: string
): OutputComparison {
  const origHeadings = extractMarkdownHeadings(original);
  const candHeadings = extractMarkdownHeadings(candidate);

  const missingHeadings = origHeadings.filter((h) => !candHeadings.includes(h));
  const extraHeadings = candHeadings.filter((h) => !origHeadings.includes(h));

  const structuralMatch = missingHeadings.length === 0 && extraHeadings.length === 0;

  // Word count comparison as proxy for content coverage
  const origWords = original.split(/\s+/).length;
  const candWords = candidate.split(/\s+/).length;
  const wordRatio = candWords / Math.max(origWords, 1);

  // If candidate is less than 20% of original, likely lost content
  const contentPreserved = wordRatio > 0.20;

  const semanticallyIdentical = structuralMatch && contentPreserved;

  const diffParts: string[] = [];
  if (missingHeadings.length > 0) diffParts.push(`Missing sections: ${missingHeadings.join(', ')}`);
  if (extraHeadings.length > 0) diffParts.push(`New sections: ${extraHeadings.join(', ')}`);
  diffParts.push(`Word count: ${origWords} → ${candWords} (${(wordRatio * 100).toFixed(0)}%)`);

  return {
    semanticallyIdentical,
    diffSummary: diffParts.join(' | '),
    structuralMatch,
  };
}

// ---------------------------------------------------------------------------
// A/B Test runner
// ---------------------------------------------------------------------------

/**
 * Run an A/B comparison between original and candidate versions.
 *
 * In the MVP, this compares profiler stats from execution_log entries
 * tagged with the respective version_ids, plus structural output comparison.
 *
 * @param skillId - The skill being tested
 * @param originalVersionId - e.g. "original" or "v1"
 * @param candidateVersionId - e.g. "v2"
 * @param originalOutput - Sample output from original version
 * @param candidateOutput - Sample output from candidate version
 * @param config - Forge configuration for thresholds
 */
export function runABTest(
  skillId: string,
  originalVersionId: string,
  candidateVersionId: string,
  originalOutput: string,
  candidateOutput: string,
  config?: Partial<ForgeConfig>
): ABTestResult {
  const db = getForgeDb(config);
  const improvementThreshold = config?.thresholds?.improvement_threshold ?? 0.20;

  // Gather metrics from execution_log for each version
  const allExecutions = db.getExecutionsBySkill(skillId);
  const origExecutions = allExecutions.filter((e) => e.version_id === originalVersionId);
  const candExecutions = allExecutions.filter((e) => e.version_id === candidateVersionId);

  const originalMetrics = aggregateMetrics(origExecutions);
  const candidateMetrics = aggregateMetrics(candExecutions);

  // Compare outputs
  const outputComparison = compareOutputs(originalOutput, candidateOutput);

  // Compute improvement percentages
  const improvement = computeImprovement(originalMetrics, candidateMetrics);

  // Determine recommendation
  const { recommendation, promotionEligible } = determineRecommendation(
    outputComparison,
    improvement,
    improvementThreshold
  );

  return {
    skillId,
    originalVersion: originalVersionId,
    candidateVersion: candidateVersionId,
    runs: origExecutions.length + candExecutions.length,
    originalMetrics,
    candidateMetrics,
    outputComparison,
    improvement,
    recommendation,
    promotionEligible,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function aggregateMetrics(
  entries: Array<{ duration_ms: number | null; tokens_in: number | null; tokens_out: number | null; cost_usd: number | null; success: boolean }>
): AggregateMetrics {
  if (entries.length === 0) {
    return {
      avgDurationMs: 0,
      avgTokensIn: 0,
      avgTokensOut: 0,
      avgCostUsd: 0,
      successRate: 0,
      runCount: 0,
    };
  }

  const avg = (arr: number[]) =>
    arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

  const durations = entries.filter((e) => e.duration_ms !== null).map((e) => e.duration_ms!);
  const tokensIn = entries.filter((e) => e.tokens_in !== null).map((e) => e.tokens_in!);
  const tokensOut = entries.filter((e) => e.tokens_out !== null).map((e) => e.tokens_out!);
  const costs = entries.filter((e) => e.cost_usd !== null).map((e) => e.cost_usd!);
  const successCount = entries.filter((e) => e.success).length;

  return {
    avgDurationMs: Math.round(avg(durations)),
    avgTokensIn: Math.round(avg(tokensIn)),
    avgTokensOut: Math.round(avg(tokensOut)),
    avgCostUsd: parseFloat(avg(costs).toFixed(4)),
    successRate: parseFloat((successCount / entries.length).toFixed(3)),
    runCount: entries.length,
  };
}

function computeImprovement(
  original: AggregateMetrics,
  candidate: AggregateMetrics
): ABTestResult['improvement'] {
  const pctChange = (orig: number, cand: number) =>
    orig > 0 ? parseFloat(((cand - orig) / orig * 100).toFixed(1)) : 0;

  return {
    durationPct: pctChange(original.avgDurationMs, candidate.avgDurationMs),
    tokensPct: pctChange(original.avgTokensOut, candidate.avgTokensOut),
    costPct: pctChange(original.avgCostUsd, candidate.avgCostUsd),
    successRateDelta: parseFloat((candidate.successRate - original.successRate).toFixed(3)),
  };
}

function determineRecommendation(
  outputComparison: OutputComparison,
  improvement: ABTestResult['improvement'],
  threshold: number
): { recommendation: ABTestResult['recommendation']; promotionEligible: boolean } {
  // If outputs differ semantically, never promote
  if (!outputComparison.semanticallyIdentical) {
    return { recommendation: 'reject', promotionEligible: false };
  }

  // Calculate overall improvement score (weighted)
  // Negative values = improvement (faster, fewer tokens, cheaper)
  const overallImprovement =
    (Math.abs(Math.min(0, improvement.durationPct)) * 0.3 +
     Math.abs(Math.min(0, improvement.tokensPct)) * 0.4 +
     Math.abs(Math.min(0, improvement.costPct)) * 0.2 +
     Math.max(0, improvement.successRateDelta * 100) * 0.1) / 100;

  if (overallImprovement >= threshold) {
    return { recommendation: 'promote', promotionEligible: true };
  }

  // If there's some improvement but not enough, suggest manual review
  if (overallImprovement > 0) {
    return { recommendation: 'needs_review', promotionEligible: false };
  }

  return { recommendation: 'reject', promotionEligible: false };
}

// ---------------------------------------------------------------------------
// Content extraction helpers
// ---------------------------------------------------------------------------

function extractJsonKeys(obj: unknown, prefix: string = ''): string[] {
  const keys: string[] = [];
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      keys.push(fullKey);
      keys.push(...extractJsonKeys(value, fullKey));
    }
  } else if (Array.isArray(obj) && obj.length > 0) {
    keys.push(...extractJsonKeys(obj[0], `${prefix}[]`));
  }
  return keys;
}

function extractCriticalValues(obj: unknown): Map<string, string> {
  const values = new Map<string, string>();
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    const record = obj as Record<string, unknown>;
    // Extract known critical fields for pentest deliverables
    const criticalFields = ['status', 'severity', 'vulnerability_type', 'endpoint', 'method', 'validated'];
    for (const field of criticalFields) {
      if (field in record) {
        values.set(field, JSON.stringify(record[field]));
      }
    }
    // Recurse into vulnerabilities array
    if ('vulnerabilities' in record && Array.isArray(record.vulnerabilities)) {
      values.set('vulnerability_count', String(record.vulnerabilities.length));
    }
  }
  return values;
}

function compareValueSets(a: Map<string, string>, b: Map<string, string>): string[] {
  const diffs: string[] = [];
  for (const [key, valueA] of a) {
    const valueB = b.get(key);
    if (valueB === undefined) {
      diffs.push(`${key}: present in original, missing in candidate`);
    } else if (valueA !== valueB) {
      diffs.push(`${key}: ${valueA} → ${valueB}`);
    }
  }
  for (const key of b.keys()) {
    if (!a.has(key)) {
      diffs.push(`${key}: missing in original, present in candidate`);
    }
  }
  return diffs;
}

function extractMarkdownHeadings(text: string): string[] {
  const headingRegex = /^#{1,6}\s+(.+)$/gm;
  const headings: string[] = [];
  let match;
  while ((match = headingRegex.exec(text)) !== null) {
    headings.push(match[1]?.trim() ?? '');
  }
  return headings;
}
