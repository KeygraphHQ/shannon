/**
 * Hypothesis / reasoning model.
 *
 * This module is the seam where an autonomous reasoning loop will
 * eventually live: today, `hypothesesFromObservations`,
 * `updateHypothesisWithObservation`, and `selectNextInvestigation` are
 * deterministic heuristics (severity/confidence weighting, one hypothesis
 * per asset+vuln-class cluster, highest score first). Later, Claude Code as
 * the controller can replace or augment these with model-driven reasoning
 * over the same `Observation`/`Hypothesis` types — nothing else in the
 * pipeline needs to change, because every phase already exchanges these
 * plain records rather than anything tool- or model-specific.
 *
 * A hypothesis is never a finding: it is a candidate belief about the
 * system, carrying its own confidence, priority, and information-gain
 * estimate, that a finding is only ever created *from* once it has been
 * selected as the next-best investigation (see pipeline/adaptive-loop.ts).
 */

import { randomUUID } from 'node:crypto';
import type { HuntMemoryEntry } from '../memory/hunt-memory.js';
import { prioritizationMultiplier } from '../memory/hunt-memory.js';
import type { Hypothesis, HypothesisStatus, ImpactLevel, Observation } from '../types.js';

const SEVERITY_WEIGHT: Readonly<Record<string, number>> = {
  critical: 1,
  high: 0.75,
  medium: 0.5,
  low: 0.25,
  informational: 0.1,
};

const CONFIDENCE_WEIGHT: Readonly<Record<string, number>> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
};

const DEFAULT_SEVERITY_WEIGHT = 0.3;
const DEFAULT_CONFIDENCE_WEIGHT = 0.4;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function severityWeightOf(hint: string): number {
  return SEVERITY_WEIGHT[hint.toLowerCase()] ?? DEFAULT_SEVERITY_WEIGHT;
}

function confidenceWeightOf(hint: string): number {
  return CONFIDENCE_WEIGHT[hint.toLowerCase()] ?? DEFAULT_CONFIDENCE_WEIGHT;
}

function impactFromSeverityWeight(severity: number): ImpactLevel {
  if (severity >= 1) return 'critical';
  if (severity >= 0.75) return 'high';
  if (severity >= 0.5) return 'medium';
  return 'low';
}

const NEXT_INVESTIGATION_BY_VULN_CLASS: Readonly<Record<string, string>> = {
  xss: 'source-aware Shannon scan of the affected endpoint to confirm sink/sanitization behavior',
  authz: 'behavioral diff across auth states (anonymous/user/resource-owner/admin) on the affected endpoint',
  idor: 'behavioral diff across auth states, then a Shannon exploitation pass if source is available',
  ssrf: 'active recon on the target parameter (redirect/host allow-list probing) followed by Shannon',
  'js-intel-secret-exposure': 'manual review of the referenced source location; do not use any discovered credential',
  'js-intel-endpoint-discovery':
    'JS/source-map collection against the referencing page, to see whether the newly discovered endpoint ships its own bundle worth analyzing',
};

function suggestNextInvestigation(vulnClass: string): string {
  return (
    NEXT_INVESTIGATION_BY_VULN_CLASS[vulnClass.toLowerCase()] ??
    'source-aware Shannon scan of the affected asset, if a local repository is available'
  );
}

const REQUIRED_EVIDENCE_BY_VULN_CLASS: Readonly<Record<string, readonly string[]>> = {
  xss: ['proof the payload executes in a real browser context', 'confirmation of the injection sink'],
  authz: ['a second account/role confirming the access difference', 'a captured request/response pair'],
  idor: ['a second account/role confirming the access difference', 'a captured request/response pair'],
};

function requiredEvidenceFor(vulnClass: string): readonly string[] {
  return (
    REQUIRED_EVIDENCE_BY_VULN_CLASS[vulnClass.toLowerCase()] ?? [
      'independent reproduction',
      'demonstrated real-world impact',
    ]
  );
}

export interface HypothesisSourceGroup {
  readonly vulnClass: string;
  readonly assetRef: string;
  readonly observations: readonly Observation[];
}

export interface HypothesisScore {
  readonly confidence: number;
  readonly potentialImpact: ImpactLevel;
  readonly informationGain: number;
  readonly priorityScore: number;
}

/**
 * MVP scoring heuristic — see module docstring for why this is a seam, not
 * the final design. `memory` is optional and defaults to empty, so every
 * existing caller is completely unaffected; when supplied (see
 * `pipeline/adaptive-loop.ts`), `memory/hunt-memory.ts:prioritizationMultiplier`
 * applies a bounded (0.5x-1.5x) nudge to `priorityScore` only — never to
 * `confidence`, which must stay an honest reflection of the current
 * engagement's own evidence, not this vulnClass's track record elsewhere.
 */
export function scoreHypothesisGroup(
  group: HypothesisSourceGroup,
  memory: readonly HuntMemoryEntry[] = [],
): HypothesisScore {
  const severity = Math.max(...group.observations.map((o) => severityWeightOf(o.severityHint)));
  const confidenceWeight = Math.max(...group.observations.map((o) => confidenceWeightOf(o.confidenceHint)));
  const verifiedBonus = group.observations.some((o) => o.verified) ? 0.2 : 0;
  const corroborationBonus = Math.min(0.1, (group.observations.length - 1) * 0.05);

  const confidence = clamp01(confidenceWeight * 0.6 + verifiedBonus + corroborationBonus);
  const potentialImpact = impactFromSeverityWeight(severity);
  // Uncertain-but-potentially-severe hypotheses have the highest expected
  // value of investigation; a hypothesis already at high confidence has
  // little left to learn from further investigation.
  const informationGain = clamp01((1 - confidence) * (0.5 + 0.5 * severity));
  const multiplier = prioritizationMultiplier(memory, group.vulnClass);
  const rawPriorityScore = severity * 0.4 + confidence * 0.3 + informationGain * 0.2 + corroborationBonus;
  const memoryAdjustedPriorityScore = Number((rawPriorityScore * multiplier).toFixed(4));

  return {
    confidence: Number(confidence.toFixed(4)),
    potentialImpact,
    informationGain: Number(informationGain.toFixed(4)),
    priorityScore: memoryAdjustedPriorityScore,
  };
}

function groupObservations(observations: readonly Observation[]): readonly HypothesisSourceGroup[] {
  const groups = new Map<string, Observation[]>();
  for (const observation of observations) {
    const key = `${observation.vulnClass}::${observation.assetRef}`;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.push(observation);
    } else {
      groups.set(key, [observation]);
    }
  }
  return Array.from(groups.values()).map((group) => ({
    vulnClass: group[0]?.vulnClass ?? '',
    assetRef: group[0]?.assetRef ?? '',
    observations: group,
  }));
}

export function hypothesesFromObservations(
  observations: readonly Observation[],
  engagementId: string,
  memory: readonly HuntMemoryEntry[] = [],
): Hypothesis[] {
  const now = new Date().toISOString();
  return groupObservations(observations).map((group) => {
    const score = scoreHypothesisGroup(group, memory);
    return {
      id: `hyp-${randomUUID()}`,
      engagementId,
      statement: `${group.vulnClass} may be present on ${group.assetRef}: ${group.observations.map((o) => o.title).join('; ')}`,
      vulnClass: group.vulnClass,
      assetRef: group.assetRef,
      supportingObservationIds: group.observations.map((o) => o.id),
      contradictingObservationIds: [],
      potentialImpact: score.potentialImpact,
      confidence: score.confidence,
      priorityScore: score.priorityScore,
      informationGain: score.informationGain,
      requiredEvidence: requiredEvidenceFor(group.vulnClass),
      nextInvestigation: suggestNextInvestigation(group.vulnClass),
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };
  });
}

function statusAfterUpdate(contradictingCount: number, confidence: number): HypothesisStatus {
  if (contradictingCount > 0 && confidence < 0.2) {
    return 'contradicted';
  }
  if (confidence >= 0.8) {
    return 'supported';
  }
  return 'investigating';
}

/**
 * Folds one new observation into an existing hypothesis: a supportive
 * observation raises confidence and information gain shrinks (less left to
 * learn); a contradictory one lowers confidence and can flip the hypothesis
 * to "contradicted". This is how a later discovery is allowed to change
 * what the controller believes about an earlier lead.
 */
export function updateHypothesisWithObservation(
  hypothesis: Hypothesis,
  observation: Observation,
  supportive: boolean,
  memory: readonly HuntMemoryEntry[] = [],
): Hypothesis {
  const weight = confidenceWeightOf(observation.confidenceHint);
  const delta = supportive ? weight * 0.2 : -weight * 0.3;
  const confidence = clamp01(hypothesis.confidence + delta);
  const supportingObservationIds = supportive
    ? Array.from(new Set([...hypothesis.supportingObservationIds, observation.id]))
    : hypothesis.supportingObservationIds;
  const contradictingObservationIds = supportive
    ? hypothesis.contradictingObservationIds
    : Array.from(new Set([...hypothesis.contradictingObservationIds, observation.id]));
  const informationGain = clamp01((1 - confidence) * 0.75);
  const multiplier = prioritizationMultiplier(memory, hypothesis.vulnClass);
  const rawPriorityScore = confidence * 0.3 + informationGain * 0.2 + (supportive ? 0.5 : 0.1);
  const priorityScore = Number((rawPriorityScore * multiplier).toFixed(4));

  return {
    ...hypothesis,
    confidence: Number(confidence.toFixed(4)),
    informationGain: Number(informationGain.toFixed(4)),
    priorityScore,
    supportingObservationIds,
    contradictingObservationIds,
    status: statusAfterUpdate(contradictingObservationIds.length, confidence),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Deterministic placeholder for the next-best-investigation decision among
 * a flat hypothesis list: pick the highest-scored open hypothesis, breaking
 * ties by insertion order. `reasoning/actions.ts` builds on this to also
 * account for novelty and cost once actions (not just hypotheses) are the
 * unit of selection.
 */
export function selectNextInvestigation(hypotheses: readonly Hypothesis[]): Hypothesis | undefined {
  const open = hypotheses.filter((h) => h.status === 'open' || h.status === 'investigating');
  if (open.length === 0) {
    return undefined;
  }
  return [...open].sort((a, b) => {
    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }
    return a.createdAt.localeCompare(b.createdAt);
  })[0];
}
