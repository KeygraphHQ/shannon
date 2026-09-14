/**
 * Value-of-information ranking: given an already-built `OpportunityReport`,
 * decide which programs would most benefit from a targeted refresh — the
 * "cheapest piece of additional information that could materially change
 * the decision" (mission Phase 11). Pure and deterministic: same report in,
 * same priority order out.
 *
 * This never performs a refresh itself — this package makes no live network
 * calls (see `discovery/h1-brain-provider.ts`'s docstring); it only tells an
 * operator/agent *which* programs are worth re-querying h1-brain for, and
 * *what* to re-query, so the expensive step (Phase 25's "222 programs -> Top
 * 30 -> targeted refresh -> Top 10") is targeted rather than global.
 */

import type { TopOpportunityEntry } from './decision.js';

export interface RefreshPriority {
  readonly programId: string;
  readonly programName: string;
  /** 0..1 — higher means refreshing this program is more likely to change the overall decision. */
  readonly priorityScore: number;
  readonly reason: string;
  readonly suggestedActions: readonly string[];
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function decisionRelevance(action: TopOpportunityEntry['finalAction']): number {
  switch (action) {
    case 'INVESTIGATE_MORE':
      return 1;
    case 'HUNT_NOW':
      return 0.6;
    case 'WATCH':
      return 0.4;
    case 'SKIP':
      return 0.1;
    default:
      return 0.1;
  }
}

/**
 * Ranks entries by how much a refresh could plausibly move the decision: a
 * program already confidently SKIPped gets little priority even if its data
 * is old (more data is unlikely to change "skip"); a program sitting at
 * INVESTIGATE_MORE with several missing signals is exactly the case a cheap
 * refresh is meant to resolve.
 */
export function prioritizeRefresh(entries: readonly TopOpportunityEntry[], limit = 30): readonly RefreshPriority[] {
  const scored = entries.map((entry) => {
    const a = entry.assessment;
    const relevance = decisionRelevance(entry.finalAction);
    const missingRatio = a.missingSignals.length / 8;
    const priorityScore = clamp01(0.5 * relevance + 0.3 * a.uncertaintyScore + 0.2 * missingRatio);

    const suggestedActions: string[] = [];
    if (a.missingSignals.includes('bountyAttractiveness'))
      suggestedActions.push('retrieve bounty/economics information');
    if (
      a.missingSignals.includes('competitionPressure') ||
      a.missingSignals.includes('disclosedReportDensity') ||
      a.missingSignals.includes('vulnClassHistory')
    ) {
      suggestedActions.push('refresh disclosed-report intelligence');
    }
    if (a.missingSignals.includes('programFreshness'))
      suggestedActions.push('retrieve program/policy last-updated timestamp');
    if (a.missingSignals.includes('assetSurfaceBreadth') || a.missingSignals.includes('capabilityFit')) {
      suggestedActions.push('refresh scope');
    }
    if (a.staleSignals.length > 0) suggestedActions.push(`refresh stale signal(s): ${a.staleSignals.join(', ')}`);
    if (suggestedActions.length === 0) {
      suggestedActions.push('compare current scope/disclosure hash against cache to confirm nothing changed');
    }

    return {
      programId: a.programId,
      programName: a.programName,
      priorityScore,
      reason: `${entry.finalAction}, uncertainty ${a.uncertaintyScore.toFixed(2)}, ${a.missingSignals.length}/8 signal(s) missing`,
      suggestedActions,
    };
  });

  return scored.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, limit);
}
