/**
 * Uncertainty-aware program opportunity assessment.
 *
 * `discovery/scoring.ts` answers one narrow question — "given the signals
 * present, what is this program's weighted-average attractiveness?" — and
 * deliberately never conflates that with how much evidence backs the
 * answer (`confidenceScore`/`completenessScore` are new, separate fields on
 * `ProgramOpportunityScore`, not folded into `totalScore`). This module is
 * the layer that actually makes a decision from that split: it is the
 * concrete fix for the failure mode the live 222-program run exposed —
 * `rankPrograms`/`selectBestProgram` alone will still hand you the raw
 * highest-`totalScore` program even when that program is Uber-and-X-shaped
 * (barely any evidence, so nothing pulled its score down). Everything in
 * `orchestration/lifecycle.ts` and the CLI's `rank`/`explain` commands that
 * actually needs to *pick* a program should go through `assessProgram`/
 * `assessPrograms` here, not `selectBestProgram` directly.
 *
 * Five things this module is careful to keep conceptually separate (per the
 * mission's Phase 2), because collapsing them back into one opaque number
 * is exactly the mistake being fixed:
 *   A) opportunity  — `score.totalScore` (unchanged, from scoring.ts)
 *   B) confidence    — `score.confidenceScore` (how much we trust what we have)
 *   C) completeness  — `score.completenessScore` (how much we have at all)
 *   D) uncertainty   — `1 - confidenceScore`, plus an illustrative estimated range
 *   E) research cost — `researchCost` (below)
 *   F) expected value — `expectedValue` (below), which is the only field
 *      that combines the others, and only ever for the *decision* layer,
 *      never written back into (A).
 *
 * Every economic figure here is either a real provider-sourced dollar
 * amount (when `DiscoveredProgram.bountyRangeUsd` exists) or an explicitly
 * labeled 0..1 proxy — see `BountyEconomics`. This module never invents a
 * dollar figure.
 */

import type { HuntMemoryEntry } from '../memory/hunt-memory.js';
import { prioritizationMultiplier } from '../memory/hunt-memory.js';
import { type ProgramOpportunityScore, type ScoreComponent, type SignalKey, scoreProgram } from './scoring.js';
import type { DiscoveredProgram } from './types.js';

// === Evidence state (Phase 3) ===

export type EvidenceState = 'KNOWN_POSITIVE' | 'KNOWN_NEGATIVE' | 'KNOWN_NEUTRAL' | 'STALE' | 'LOW_CONFIDENCE';

/** How stale (in days) a signal must be before it is classified `STALE` regardless of its raw value — mirrors `scoring.ts`'s own `FRESHNESS_HALF_LIFE_DAYS`, so "stale" here means the same thing scoring's own decay curve already treats as meaningfully old. */
const STALE_THRESHOLD_DAYS = 90;
/** Below this per-signal confidence, the signal is flagged `LOW_CONFIDENCE` regardless of value — a near-worthless assertion should read as such even if its raw value looks decisive. */
const LOW_CONFIDENCE_THRESHOLD = 0.2;
/** How far from the 0.5 neutral prior a raw value must sit to count as a directional (positive/negative) claim rather than `KNOWN_NEUTRAL`. */
const NEUTRAL_BAND = 0.05;

export function classifySignalState(component: ScoreComponent, now: number): EvidenceState {
  if (component.confidence <= LOW_CONFIDENCE_THRESHOLD) return 'LOW_CONFIDENCE';
  const ageDays = (now - Date.parse(component.freshnessAt)) / 86_400_000;
  if (Number.isFinite(ageDays) && ageDays > STALE_THRESHOLD_DAYS) return 'STALE';
  if (component.rawValue > 0.5 + NEUTRAL_BAND) return 'KNOWN_POSITIVE';
  if (component.rawValue < 0.5 - NEUTRAL_BAND) return 'KNOWN_NEGATIVE';
  return 'KNOWN_NEUTRAL';
}

export type EvidenceTier = 'RICH' | 'PARTIAL' | 'THIN' | 'NONE';

export function evidenceTierFor(completenessScore: number): EvidenceTier {
  if (completenessScore <= 0) return 'NONE';
  if (completenessScore < 0.375) return 'THIN'; // < 3 of 8
  if (completenessScore < 0.75) return 'PARTIAL'; // < 6 of 8
  return 'RICH';
}

// === Economics (Phase 8) ===

export type BountyEstimateSource = 'PROVIDER' | 'PROXY' | 'NONE';

export interface BountyEconomics {
  readonly bountyKnown: boolean;
  readonly bountyEstimateSource: BountyEstimateSource;
  /** A real dollar figure, present only when `DiscoveredProgram.bountyRangeUsd` came from the provider — never derived, never estimated. */
  readonly bountyRangeUsd: { readonly min: number | undefined; readonly max: number } | undefined;
  /** 0..1, ESTIMATED — explicitly never dollars. Present only when `bountyEstimateSource === 'PROXY'`. */
  readonly proxyOpportunityScore: number | undefined;
  readonly note: string;
}

function assessBountyEconomics(program: DiscoveredProgram): BountyEconomics {
  if (program.bountyRangeUsd) {
    return {
      bountyKnown: true,
      bountyEstimateSource: 'PROVIDER',
      bountyRangeUsd: program.bountyRangeUsd,
      proxyOpportunityScore: undefined,
      note: `published bounty range known from provider (up to $${program.bountyRangeUsd.max}).`,
    };
  }
  const proxyInputs = [program.signals.vulnClassHistory?.value, program.signals.assetSurfaceBreadth?.value].filter(
    (v): v is number => v !== undefined,
  );
  const proxyOpportunityScore =
    proxyInputs.length > 0 ? proxyInputs.reduce((a, b) => a + b, 0) / proxyInputs.length : undefined;
  return {
    bountyKnown: false,
    bountyEstimateSource: proxyOpportunityScore !== undefined ? 'PROXY' : 'NONE',
    bountyRangeUsd: undefined,
    proxyOpportunityScore,
    note:
      'Actual bounty range unavailable from current provider.' +
      (proxyOpportunityScore !== undefined
        ? ' A 0-1 proxy was estimated from disclosure-history/asset-surface signals only — never represented as real dollars.'
        : ' No proxy signal was available either.'),
  };
}

// === Research cost (Phase 10) ===

export type ResearchCostBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';

export interface ResearchCostEstimate {
  readonly band: ResearchCostBand;
  /** An illustrative band, not a precise estimate — see this module's docstring on avoiding fake precision. */
  readonly estimatedHoursRange: readonly [number, number];
  readonly costConfidence: number;
  readonly factors: readonly string[];
}

function estimateResearchCost(program: DiscoveredProgram): ResearchCostEstimate {
  const assetCount = program.assets.length;
  const typeVariety = new Set(program.assets.map((a) => a.type)).size;
  const costSignal = program.signals.researchCost;
  const factors: string[] = [`${assetCount} in-scope asset(s)`, `${typeVariety} distinct asset type(s) in scope`];
  if (costSignal) factors.push(`provider researchCost signal: ${costSignal.detail}`);

  // Bands are keyed off asset count/type-variety alone — the only research-cost proxies this
  // package can actually observe today (no JS-surface/API-complexity/auth-requirement data is
  // available from any current discovery provider). The provider's own `researchCost` signal,
  // when present, only ever nudges `costConfidence`, never the band itself, so a thin or
  // low-confidence provider opinion cannot override the one honestly-available input.
  let band: ResearchCostBand;
  let estimatedHoursRange: readonly [number, number];
  if (assetCount <= 3) {
    band = 'LOW';
    estimatedHoursRange = [1, 4];
  } else if (assetCount <= 15) {
    band = 'MEDIUM';
    estimatedHoursRange = [4, 12];
  } else if (assetCount <= 50) {
    band = 'HIGH';
    estimatedHoursRange = [12, 30];
  } else {
    band = 'VERY_HIGH';
    estimatedHoursRange = [30, 80];
  }
  if (typeVariety >= 4) {
    factors.push('above-average technology diversity — actual research time may run toward the high end of the band');
  }

  const costConfidence = costSignal ? Math.min(0.6, costSignal.confidence) : 0.25;
  return { band, estimatedHoursRange, costConfidence, factors };
}

// === Capability fit (Phase 9) ===

export interface CapabilityFitAssessment {
  readonly score: number;
  readonly basis: 'OBSERVED' | 'PRIOR';
  readonly confidence: number;
  readonly matchedVulnClasses: readonly string[];
  readonly note: string;
}

function estimateCapabilityFit(
  program: DiscoveredProgram,
  memory: readonly HuntMemoryEntry[],
): CapabilityFitAssessment {
  const weaknessTypes = program.disclosedWeaknessTypes ?? [];
  const priorScore = program.signals.capabilityFit?.value ?? 0.5;

  if (memory.length === 0) {
    return {
      score: priorScore,
      basis: 'PRIOR',
      confidence: 0.3,
      matchedVulnClasses: [],
      note: 'no validated hunt-memory outcomes exist yet — using the capabilityFit prior (adapter applicability), never observed performance.',
    };
  }
  if (weaknessTypes.length === 0) {
    return {
      score: priorScore,
      basis: 'PRIOR',
      confidence: 0.35,
      matchedVulnClasses: [],
      note: 'program has no disclosed weakness-type data to match against hunt-memory — prior only.',
    };
  }

  const multipliers = weaknessTypes.map((vc) => prioritizationMultiplier(memory, vc));
  // prioritizationMultiplier ranges [0.5, 1.5]; a value of exactly 1 means memory had nothing to
  // say about that class (neither positive nor negative), so it is excluded from "matched".
  const matched = weaknessTypes.filter((_, i) => multipliers[i] !== 1);
  if (matched.length === 0) {
    return {
      score: priorScore,
      basis: 'PRIOR',
      confidence: 0.35,
      matchedVulnClasses: [],
      note: 'disclosed weakness types present, but hunt-memory has no prior outcome for any of them — prior only.',
    };
  }
  const avgMultiplier = multipliers.reduce((a, b) => a + b, 0) / multipliers.length;
  const observedScore = Math.max(0, Math.min(1, (avgMultiplier - 0.5) / 1.0));
  return {
    score: observedScore,
    basis: 'OBSERVED',
    confidence: Math.min(0.85, 0.3 + 0.1 * matched.length),
    matchedVulnClasses: matched,
    note: `derived from ${matched.length} vuln-class(es) with a validated outcome in hunt-memory: ${matched.join(', ')}.`,
  };
}

// === Expected value (Phase 8 synthesis) ===

export interface ExpectedValueAssessment {
  readonly expectedValueScore: number;
  /** unitless (score/hour), never dollars/hour unless `bountyEconomics.bountyKnown` — see `isProxy`. */
  readonly expectedValuePerHour: number | undefined;
  readonly isProxy: boolean;
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function estimateExpectedValue(
  opportunityScore: number | undefined,
  bountyEconomics: BountyEconomics,
  capabilityFit: CapabilityFitAssessment,
  researchCost: ResearchCostEstimate,
): ExpectedValueAssessment {
  const opportunity = opportunityScore ?? 0;
  const bountyFactor = bountyEconomics.bountyKnown
    ? clamp01((bountyEconomics.bountyRangeUsd?.max ?? 0) / 5000) // same $5000 documented ceiling scoring.ts uses
    : (bountyEconomics.proxyOpportunityScore ?? 0.3);
  // Documented, fixed weights — a transparent blend, not a fitted/learned model. 0.5/0.3/0.2 puts
  // the most weight on the already-confidence-aware opportunity score, meaningful but secondary
  // weight on economics (proxy or real), and the least on capability fit (thinnest evidence today).
  const expectedValueScore = clamp01(0.5 * opportunity + 0.3 * bountyFactor + 0.2 * capabilityFit.score);
  const midHours = (researchCost.estimatedHoursRange[0] + researchCost.estimatedHoursRange[1]) / 2;
  const expectedValuePerHour = midHours > 0 ? expectedValueScore / midHours : undefined;
  return { expectedValueScore, expectedValuePerHour, isProxy: !bountyEconomics.bountyKnown };
}

// === Decision (Phase 17) ===

export type RecommendedAction = 'HUNT_NOW' | 'INVESTIGATE_MORE' | 'WATCH' | 'SKIP';

/**
 * Adequate-confidence and decent-value thresholds — documented constants,
 * not magic numbers, tuned against the live 222-program dataset (see
 * apps/hunter/README.md's opportunity-model section) rather than picked to
 * force a particular outcome. Exported so `discovery/decision.ts` applies
 * the exact same confidence bar to its cross-scenario shortlist
 * (`topTier`) that `decide()` applies to a single program's own
 * recommendation — a program too uncertain to earn its own HUNT_NOW must
 * not be allowed into the shortlist through the back door of "it won one
 * scenario" either.
 */
export const ADEQUATE_CONFIDENCE = 0.45;
const DECENT_VALUE = 0.6;
const CHEAP_INFO_BANDS: ReadonlySet<ResearchCostBand> = new Set(['LOW', 'MEDIUM']);

function decide(
  opportunityScore: number | undefined,
  confidenceScore: number,
  completenessScore: number,
  expectedValue: ExpectedValueAssessment,
  researchCost: ResearchCostEstimate,
): { readonly action: RecommendedAction; readonly reason: string } {
  if (opportunityScore === undefined) {
    return { action: 'SKIP', reason: 'no signal data at all for this program — nothing to evaluate.' };
  }
  const confidenceOk = confidenceScore >= ADEQUATE_CONFIDENCE;
  const decentValue = expectedValue.expectedValueScore >= DECENT_VALUE;
  const cheap = CHEAP_INFO_BANDS.has(researchCost.band);

  if (decentValue && confidenceOk) {
    return {
      action: 'HUNT_NOW',
      reason: `expected value ${expectedValue.expectedValueScore.toFixed(2)} is decent and confidence ${confidenceScore.toFixed(2)} is adequate — evidence supports acting, pending scope/ROE review and explicit authorization.`,
    };
  }
  if (decentValue && !confidenceOk) {
    return {
      action: 'INVESTIGATE_MORE',
      reason: `expected value ${expectedValue.expectedValueScore.toFixed(2)} looks promising but confidence ${confidenceScore.toFixed(2)} is below the ${ADEQUATE_CONFIDENCE} threshold (completeness ${completenessScore.toFixed(2)}) — the uncertainty is decision-relevant${cheap ? ', and research cost is low enough that a closer look is cheap' : ''}.`,
    };
  }
  if (!decentValue && completenessScore < 0.5) {
    return {
      action: 'WATCH',
      reason: `current evidence is too thin (completeness ${completenessScore.toFixed(2)}) to judge value confidently, and what is known does not yet look strong (expected value ${expectedValue.expectedValueScore.toFixed(2)}) — revisit if fresher intelligence arrives.`,
    };
  }
  return {
    action: 'SKIP',
    reason: `expected value ${expectedValue.expectedValueScore.toFixed(2)} is below the ${DECENT_VALUE} threshold with adequate evidence (completeness ${completenessScore.toFixed(2)}) to trust that judgment.`,
  };
}

// === Full assessment ===

export interface ProgramOpportunityAssessment {
  readonly programId: string;
  readonly programName: string;
  readonly opportunityScore: number | undefined;
  readonly confidenceScore: number;
  readonly completenessScore: number;
  readonly uncertaintyScore: number;
  /** An illustrative band around `opportunityScore`, sized from `uncertaintyScore` — NOT a statistically rigorous confidence interval. See this module's docstring. */
  readonly estimatedRange: { readonly low: number; readonly high: number } | undefined;
  readonly evidenceTier: EvidenceTier;
  readonly missingSignals: readonly SignalKey[];
  readonly staleSignals: readonly SignalKey[];
  readonly unknownSignals: readonly SignalKey[];
  readonly positiveSignals: readonly SignalKey[];
  readonly negativeSignals: readonly SignalKey[];
  readonly bountyEconomics: BountyEconomics;
  readonly researchCost: ResearchCostEstimate;
  readonly capabilityFit: CapabilityFitAssessment;
  readonly expectedValue: ExpectedValueAssessment;
  readonly dataQualityNotes: readonly string[];
  readonly recommendedAction: RecommendedAction;
  readonly recommendationReason: string;
  readonly positiveFactors: readonly string[];
  readonly negativeFactors: readonly string[];
  readonly unknownFactors: readonly string[];
  readonly riskFactors: readonly string[];
  /** The underlying score this assessment was built from — kept for callers (`explainSelection`, CLI `explain`) that need the raw component breakdown too. */
  readonly score: ProgramOpportunityScore;
}

export interface AssessOptions {
  readonly now?: number;
  readonly weights?: Readonly<Partial<Record<SignalKey, number>>>;
  readonly memory?: readonly HuntMemoryEntry[];
}

/** `UNCERTAINTY_RANGE_SCALE` bounds how wide `estimatedRange` can ever get (at `confidenceScore === 0`, the band spans ±0.4 around the point estimate) — a deliberately modest, documented scale, not derived from any distributional assumption. */
const UNCERTAINTY_RANGE_SCALE = 0.4;

export function assessProgram(program: DiscoveredProgram, options: AssessOptions = {}): ProgramOpportunityAssessment {
  const now = options.now ?? Date.now();
  const memory = options.memory ?? [];
  const score = scoreProgram(program, options.weights ?? {}, now);

  const states = score.components.map((c) => [c, classifySignalState(c, now)] as const);
  const positiveSignals = states.filter(([, s]) => s === 'KNOWN_POSITIVE').map(([c]) => c.key);
  const negativeSignals = states.filter(([, s]) => s === 'KNOWN_NEGATIVE').map(([c]) => c.key);
  const staleSignals = states.filter(([, s]) => s === 'STALE').map(([c]) => c.key);

  const uncertaintyScore = clamp01(1 - score.confidenceScore);
  const estimatedRange =
    score.totalScore === undefined
      ? undefined
      : {
          low: clamp01(score.totalScore - uncertaintyScore * UNCERTAINTY_RANGE_SCALE),
          high: clamp01(score.totalScore + uncertaintyScore * UNCERTAINTY_RANGE_SCALE),
        };

  const bountyEconomics = assessBountyEconomics(program);
  const researchCost = estimateResearchCost(program);
  const capabilityFit = estimateCapabilityFit(program, memory);
  const expectedValue = estimateExpectedValue(score.totalScore, bountyEconomics, capabilityFit, researchCost);
  const { action, reason } = decide(
    score.totalScore,
    score.confidenceScore,
    score.completenessScore,
    expectedValue,
    researchCost,
  );

  const dataQualityNotes = program.dataQualityNotes ?? [];

  return {
    programId: program.programId,
    programName: program.programName,
    opportunityScore: score.totalScore,
    confidenceScore: score.confidenceScore,
    completenessScore: score.completenessScore,
    uncertaintyScore,
    estimatedRange,
    evidenceTier: evidenceTierFor(score.completenessScore),
    missingSignals: score.missingSignals,
    staleSignals,
    unknownSignals: score.missingSignals,
    positiveSignals,
    negativeSignals,
    bountyEconomics,
    researchCost,
    capabilityFit,
    expectedValue,
    dataQualityNotes,
    recommendedAction: action,
    recommendationReason: reason,
    positiveFactors: score.components
      .filter((c) => positiveSignals.includes(c.key))
      .map((c) => `${c.key}: ${c.detail}`),
    negativeFactors: score.components
      .filter((c) => negativeSignals.includes(c.key))
      .map((c) => `${c.key}: ${c.detail}`),
    unknownFactors: score.missingSignals.map((k) => `${k}: no data available from any current provider`),
    riskFactors: [
      ...score.components.filter((c) => staleSignals.includes(c.key)).map((c) => `${c.key} is stale: ${c.detail}`),
      ...dataQualityNotes,
    ],
    score,
  };
}

export function assessPrograms(
  programs: readonly DiscoveredProgram[],
  options: AssessOptions = {},
): readonly ProgramOpportunityAssessment[] {
  return programs.map((p) => assessProgram(p, options));
}
