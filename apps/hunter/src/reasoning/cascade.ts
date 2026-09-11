/**
 * Research cascade engine.
 *
 * Upgrades the flat "observation -> hypothesis -> action -> observation"
 * loop (`reasoning/hypothesis.ts`) into: anomaly -> competing explanations
 * -> experiment design -> observation -> hypothesis update -> new
 * hypotheses -> cascade. This module owns two distinct jobs:
 *
 * 1. `runResearchCascade` turns anomalies (`anomaly/engine.ts`) into
 *    *multiple* competing `Hypothesis` records — one per plausible
 *    explanation, never a single forced interpretation — with deterministic
 *    termination (max cascade depth, a cap on new hypotheses per run,
 *    dedup against both the existing hypothesis set and within the same
 *    run, and scope enforcement).
 * 2. `applyObservationWithContradictionTracking` and
 *    `resolveCompetingHypotheses` are how a later observation is folded
 *    back in without discarding history: a contradiction is recorded
 *    structurally (never just a confidence number going down) and survives
 *    even once a hypothesis is discarded, and a competing set converges
 *    only once every alternative but one has actually been contradicted —
 *    never merged away.
 */

import { randomUUID } from 'node:crypto';
import type { Anomaly } from '../anomaly/engine.js';
import type { Hypothesis, ImpactLevel, Observation, ToolRisk } from '../types.js';
import { updateHypothesisWithObservation } from './hypothesis.js';

export interface CascadeBudget {
  readonly maxDepth: number;
  readonly maxHypothesesPerAnomaly: number;
  readonly maxNewHypotheses: number;
}

export const DEFAULT_CASCADE_BUDGET: CascadeBudget = {
  maxDepth: 4,
  maxHypothesesPerAnomaly: 3,
  maxNewHypotheses: 25,
};

export interface AnomalyCascadeSeed {
  readonly anomaly: Anomaly;
  readonly assetRef: string;
  /** Set when this anomaly was discovered while investigating an earlier hypothesis — depth is inherited and enforced from here. */
  readonly parentHypothesisId?: string;
  readonly parentDepth?: number;
}

export type CascadeEventKind =
  | 'hypothesis-generated'
  | 'duplicate-suppressed'
  | 'depth-limit-reached'
  | 'budget-exhausted'
  | 'scope-blocked';

export interface CascadeEvent {
  readonly at: string;
  readonly kind: CascadeEventKind;
  readonly detail: string;
}

export interface CascadeContext {
  readonly engagementId: string;
  readonly existingHypotheses: readonly Hypothesis[];
  readonly budget?: Partial<CascadeBudget>;
  /** Omit to allow every asset — the cascade engine defers to whatever scope filtering already ran upstream by default, but a caller with scope context should always supply this. */
  readonly isInScope?: (assetRef: string) => boolean;
}

export interface CascadeResult {
  readonly newHypotheses: readonly Hypothesis[];
  readonly events: readonly CascadeEvent[];
}

const DIMENSION_VULN_CLASS_HINT: Readonly<Partial<Record<string, string>>> = {
  'authorization-outcome': 'authz',
  redirects: 'open-redirect',
  'workflow-transition': 'workflow-bypass',
  cookies: 'session-manipulation',
  'error-behavior': 'input-validation-anomaly',
};

function inferVulnClass(anomaly: Anomaly): string {
  for (const change of anomaly.changedDimensions) {
    const hint = DIMENSION_VULN_CLASS_HINT[change.dimension];
    if (hint) return hint;
  }
  return 'behavioral-anomaly';
}

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function existingSignatures(hypotheses: readonly Hypothesis[]): ReadonlySet<string> {
  return new Set(hypotheses.map((h) => `${h.vulnClass.toLowerCase()}::${h.assetRef}::${normalize(h.statement)}`));
}

function impactFromSignificance(significance: number): ImpactLevel {
  if (significance >= 0.75) return 'high';
  if (significance >= 0.45) return 'medium';
  return 'low';
}

const DEFAULT_HYPOTHESIS_RISK: ToolRisk = 'low';
const DEFAULT_HYPOTHESIS_COST = 0.3;

/**
 * Generates competing hypotheses from a batch of anomalies. Every
 * termination path (depth, scope, per-anomaly cap, total cap, dedup) is
 * recorded as a `CascadeEvent` rather than silently dropped, so a caller
 * can audit exactly why the cascade stopped where it did.
 */
export function runResearchCascade(seeds: readonly AnomalyCascadeSeed[], ctx: CascadeContext): CascadeResult {
  const budget: CascadeBudget = { ...DEFAULT_CASCADE_BUDGET, ...ctx.budget };
  const events: CascadeEvent[] = [];
  const newHypotheses: Hypothesis[] = [];
  const seenSignatures = new Set(existingSignatures(ctx.existingHypotheses));
  const now = () => new Date().toISOString();

  for (const seed of seeds) {
    if (newHypotheses.length >= budget.maxNewHypotheses) {
      events.push({
        at: now(),
        kind: 'budget-exhausted',
        detail: `maxNewHypotheses (${budget.maxNewHypotheses}) reached`,
      });
      break;
    }

    if (ctx.isInScope && !ctx.isInScope(seed.assetRef)) {
      events.push({ at: now(), kind: 'scope-blocked', detail: `"${seed.assetRef}" is not in scope; anomaly ignored` });
      continue;
    }

    const depth = (seed.parentDepth ?? -1) + 1;
    if (depth > budget.maxDepth) {
      events.push({
        at: now(),
        kind: 'depth-limit-reached',
        detail: `cascade depth ${depth} exceeds maxDepth (${budget.maxDepth}) for anomaly ${seed.anomaly.id}`,
      });
      continue;
    }

    const explanations = seed.anomaly.possibleExplanations.slice(0, budget.maxHypothesesPerAnomaly);
    const vulnClass = inferVulnClass(seed.anomaly);
    const groupIds: string[] = [];
    const generated: Hypothesis[] = [];

    for (const explanation of explanations) {
      if (newHypotheses.length + generated.length >= budget.maxNewHypotheses) {
        events.push({
          at: now(),
          kind: 'budget-exhausted',
          detail: `maxNewHypotheses (${budget.maxNewHypotheses}) reached`,
        });
        break;
      }
      const statement = `${explanation} (anomaly: ${seed.anomaly.changedDimensions.map((c) => c.dimension).join(', ')})`;
      const signature = `${vulnClass}::${seed.assetRef}::${normalize(statement)}`;
      if (seenSignatures.has(signature)) {
        events.push({
          at: now(),
          kind: 'duplicate-suppressed',
          detail: `duplicate hypothesis suppressed: ${signature}`,
        });
        continue;
      }
      seenSignatures.add(signature);

      const confidence = Number(
        ((seed.anomaly.significance * seed.anomaly.confidence) / explanations.length || 0.05).toFixed(4),
      );
      const id = `hyp-${randomUUID()}`;
      groupIds.push(id);
      generated.push({
        id,
        engagementId: ctx.engagementId,
        statement,
        vulnClass,
        assetRef: seed.assetRef,
        supportingObservationIds: [],
        contradictingObservationIds: [],
        potentialImpact: impactFromSignificance(seed.anomaly.significance),
        confidence,
        priorityScore: Number((confidence * 0.5 + seed.anomaly.significance * 0.3).toFixed(4)),
        informationGain: Number((1 - confidence).toFixed(4)),
        requiredEvidence: [...seed.anomaly.suggestedExperiments],
        nextInvestigation:
          seed.anomaly.suggestedExperiments[0] ?? 'design a distinguishing experiment for this anomaly',
        status: 'open',
        createdAt: now(),
        updatedAt: now(),
        assumptions: [explanation],
        ...(seed.parentHypothesisId !== undefined ? { parentHypothesisId: seed.parentHypothesisId } : {}),
        cascadeDepth: depth,
        risk: DEFAULT_HYPOTHESIS_RISK,
        cost: DEFAULT_HYPOTHESIS_COST,
      });
    }

    // Cross-link every hypothesis generated from this one anomaly as competing explanations of the same phenomenon.
    for (const hypothesis of generated) {
      const competingHypothesisIds = groupIds.filter((id) => id !== hypothesis.id);
      newHypotheses.push(competingHypothesisIds.length > 0 ? { ...hypothesis, competingHypothesisIds } : hypothesis);
      events.push({
        at: now(),
        kind: 'hypothesis-generated',
        detail: `"${hypothesis.statement}" generated from anomaly ${seed.anomaly.id} at depth ${depth}`,
      });
    }
  }

  return { newHypotheses: newHypotheses.sort((a, b) => b.informationGain - a.informationGain), events };
}

/**
 * Folds one observation into a hypothesis, exactly like
 * `hypothesis.ts:updateHypothesisWithObservation`, but additionally
 * preserves a structured contradiction record when the observation does
 * not support it — retained forever, even once the hypothesis is
 * discarded, because a failed hypothesis remains useful as negative
 * evidence for the rest of the engagement.
 */
export function applyObservationWithContradictionTracking(
  hypothesis: Hypothesis,
  observation: Observation,
  supportive: boolean,
  note: string,
): Hypothesis {
  const updated = updateHypothesisWithObservation(hypothesis, observation, supportive);
  if (supportive) return updated;
  const structuredContradictions = [
    ...(hypothesis.structuredContradictions ?? []),
    { observationId: observation.id, note, at: new Date().toISOString() },
  ];
  return { ...updated, structuredContradictions };
}

export interface ConvergenceResult {
  /** The sole surviving hypothesis once every competing alternative has been contradicted — undefined until convergence actually happens. */
  readonly winner: Hypothesis | undefined;
  readonly contradicted: readonly Hypothesis[];
  readonly stillCompeting: readonly Hypothesis[];
}

/**
 * A competing set converges only when exactly one member is left that is
 * neither contradicted nor discarded — never by picking the
 * highest-confidence member while alternatives remain viable. Contradicted
 * members are returned, never dropped, so the negative evidence stays
 * visible.
 */
export function resolveCompetingHypotheses(hypotheses: readonly Hypothesis[]): ConvergenceResult {
  const contradicted = hypotheses.filter((h) => h.status === 'contradicted' || h.status === 'discarded');
  const remaining = hypotheses.filter((h) => h.status !== 'contradicted' && h.status !== 'discarded');
  if (remaining.length === 1 && contradicted.length > 0) {
    return { winner: remaining[0], contradicted, stillCompeting: [] };
  }
  return { winner: undefined, contradicted, stillCompeting: remaining };
}
