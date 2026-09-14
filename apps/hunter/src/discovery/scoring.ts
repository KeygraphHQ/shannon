/**
 * Program Opportunity Model.
 *
 * Turns each candidate `DiscoveredProgram`'s `signals` into one inspectable
 * `ProgramOpportunityScore`: a confidence- and freshness-weighted average of
 * whichever signals that program actually carries. A signal a program does
 * not carry is never defaulted to 0 or 0.5 (which would silently punish or
 * reward incomplete data) — it is simply excluded from that program's
 * denominator and named in `missingSignals`, so two programs with different
 * data completeness stay honestly comparable rather than falsely equal.
 *
 * This is deliberately a transparent weighted average, not a machine-learned
 * or opaque model: every contribution can be read straight off
 * `ScoreComponent`, and `explainSelection` turns the top two candidates'
 * component differences into the "Program X ranked above Program Y because…"
 * sentence the review asks for.
 */

import type { DiscoveredProgram, ProgramSignal, ProgramSignals } from './types.js';

export type SignalKey = keyof ProgramSignals;

/** Default relative importance of each signal. A caller may override any subset via `rankPrograms(programs, { weights: {...} })`. */
export const DEFAULT_SIGNAL_WEIGHTS: Readonly<Record<SignalKey, number>> = {
  bountyAttractiveness: 1.2,
  competitionPressure: 1.0,
  disclosedReportDensity: 0.6,
  vulnClassHistory: 0.9,
  assetSurfaceBreadth: 0.8,
  researchCost: 1.0,
  programFreshness: 0.5,
  capabilityFit: 1.1,
};

const SIGNAL_KEYS = Object.keys(DEFAULT_SIGNAL_WEIGHTS) as readonly SignalKey[];

/** Below this confidence, a signal still counts but at sharply reduced weight — a low-confidence guess should never carry as much as a verified figure. */
const MIN_EFFECTIVE_CONFIDENCE = 0.05;

/** A signal older than this decays toward `MIN_FRESHNESS_FACTOR`, linearly. */
const FRESHNESS_HALF_LIFE_DAYS = 90;
const MIN_FRESHNESS_FACTOR = 0.35;

export interface ScoreComponent {
  readonly key: SignalKey;
  readonly source: string;
  readonly rawValue: number;
  readonly weight: number;
  readonly confidence: number;
  readonly freshnessAt: string;
  readonly freshnessFactor: number;
  /**
   * `weight * (confidence * freshnessFactor) * (rawValue - 0.5)` — this
   * component's trust-scaled *deviation from neutral*, before
   * normalization. Framing it as a deviation (rather than a raw
   * weight*value product) is what makes low trust actually matter: a
   * component with low confidence or stale data contributes a small
   * deviation regardless of how extreme `rawValue` is, pulling the total
   * score toward 0.5 rather than asserting a confident opinion the
   * evidence does not support. A weight*value*confidence product without
   * this reframing would let confidence/freshness cancel out of the final
   * *ratio* whenever a program has only one signal (numerator and
   * denominator both scale by the same factor) — this shape does not have
   * that failure mode.
   */
  readonly contribution: number;
  readonly detail: string;
}

export interface ProgramOpportunityScore {
  readonly programId: string;
  readonly programName: string;
  /**
   * `0.5 + (sum of trust-scaled deviations) / (sum of weights)`, clamped to
   * [0, 1]. 0.5 is the neutral prior a program starts from before any
   * signal is considered; each present signal pulls the score above or
   * below that only in proportion to how far from neutral it is *and* how
   * much it should be trusted (confidence * freshness). `undefined` when
   * every signal was missing — there is nothing to evaluate a program on at
   * all, not even a neutral guess.
   */
  readonly totalScore: number | undefined;
  readonly components: readonly ScoreComponent[];
  readonly missingSignals: readonly SignalKey[];
  /** Sum of weight*confidence*freshnessFactor across present components — how much real evidence this score rests on, independent of the score's direction. */
  readonly evidenceWeight: number;
}

function freshnessFactor(freshnessAt: string, now: number): number {
  const ageMs = now - new Date(freshnessAt).getTime();
  if (!Number.isFinite(ageMs) || ageMs <= 0) return 1;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = 1 - (1 - MIN_FRESHNESS_FACTOR) * Math.min(1, ageDays / (FRESHNESS_HALF_LIFE_DAYS * 2));
  return Math.max(MIN_FRESHNESS_FACTOR, Math.min(1, decay));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Scores one program against its own signals, ignoring every other
 * candidate — ranking (which needs the whole set, for tie-breaking) is a
 * separate step in `rankPrograms`.
 */
const NEUTRAL = 0.5;

export function scoreProgram(
  program: DiscoveredProgram,
  weights: Readonly<Partial<Record<SignalKey, number>>> = {},
  now: number = Date.now(),
): ProgramOpportunityScore {
  const components: ScoreComponent[] = [];
  const missingSignals: SignalKey[] = [];
  let weightedDeviationSum = 0;
  let weightSum = 0;
  let evidenceWeight = 0;

  for (const key of SIGNAL_KEYS) {
    const signal: ProgramSignal | undefined = program.signals[key];
    if (!signal) {
      missingSignals.push(key);
      continue;
    }
    const weight = weights[key] ?? DEFAULT_SIGNAL_WEIGHTS[key];
    const confidence = Math.max(MIN_EFFECTIVE_CONFIDENCE, clamp01(signal.confidence));
    const ff = freshnessFactor(signal.freshnessAt, now);
    const rawValue = clamp01(signal.value);
    const trust = confidence * ff;
    const contribution = weight * trust * (rawValue - NEUTRAL);

    components.push({
      key,
      source: program.sourceProvider,
      rawValue,
      weight,
      confidence,
      freshnessAt: signal.freshnessAt,
      freshnessFactor: ff,
      contribution,
      detail: signal.detail,
    });
    weightedDeviationSum += contribution;
    weightSum += weight;
    evidenceWeight += weight * trust;
  }

  const totalScore = weightSum > 0 ? clamp01(NEUTRAL + weightedDeviationSum / weightSum) : undefined;

  return {
    programId: program.programId,
    programName: program.programName,
    totalScore,
    components,
    missingSignals,
    evidenceWeight,
  };
}

export interface RankedProgram {
  readonly program: DiscoveredProgram;
  readonly score: ProgramOpportunityScore;
  readonly rank: number;
}

/**
 * Ranks every candidate by `totalScore` descending. A program with no
 * signals at all (`totalScore: undefined`) sorts last, always — there is no
 * data to justify picking it over anything that has at least one signal.
 * Ties break first by `evidenceWeight` (more corroborated data wins), then
 * by `programId` for full determinism (the same input always produces the
 * same order, needed for `selectBestProgram` to be testable).
 */
export function rankPrograms(
  programs: readonly DiscoveredProgram[],
  weights: Readonly<Partial<Record<SignalKey, number>>> = {},
  now: number = Date.now(),
): readonly RankedProgram[] {
  const scored = programs.map((program) => ({ program, score: scoreProgram(program, weights, now) }));
  scored.sort((a, b) => {
    if (a.score.totalScore === undefined && b.score.totalScore === undefined) {
      return a.program.programId.localeCompare(b.program.programId);
    }
    if (a.score.totalScore === undefined) return 1;
    if (b.score.totalScore === undefined) return -1;
    if (b.score.totalScore !== a.score.totalScore) return b.score.totalScore - a.score.totalScore;
    if (b.score.evidenceWeight !== a.score.evidenceWeight) return b.score.evidenceWeight - a.score.evidenceWeight;
    return a.program.programId.localeCompare(b.program.programId);
  });
  return scored.map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export function selectBestProgram(ranked: readonly RankedProgram[]): RankedProgram | undefined {
  const top = ranked[0];
  if (!top || top.score.totalScore === undefined) return undefined;
  return top;
}

/**
 * "Program X ranked above Program Y because…" — a plain-language diff of
 * the two programs' components, largest contribution gap first, so the
 * explanation names the signals that actually decided the ranking rather
 * than restating every number.
 */
export function explainSelection(ranked: readonly RankedProgram[]): string {
  const winner = ranked[0];
  if (!winner || winner.score.totalScore === undefined) {
    return 'no program had enough signal data to be selected';
  }
  const runnerUp = ranked[1];
  if (!runnerUp || runnerUp.score.totalScore === undefined) {
    return `"${winner.program.programName}" selected (score ${winner.score.totalScore.toFixed(3)}, evidence weight ${winner.score.evidenceWeight.toFixed(2)}) — it is the only candidate with enough signal data to score`;
  }

  const winnerByKey = new Map(winner.score.components.map((c) => [c.key, c] as const));
  const runnerUpByKey = new Map(runnerUp.score.components.map((c) => [c.key, c] as const));
  const allKeys = new Set<SignalKey>([...winnerByKey.keys(), ...runnerUpByKey.keys()]);

  const diffs = [...allKeys]
    .map((key) => {
      const w = winnerByKey.get(key);
      const r = runnerUpByKey.get(key);
      const wContribution = w ? w.contribution : 0;
      const rContribution = r ? r.contribution : 0;
      return { key, delta: wContribution - rContribution, winnerComponent: w, runnerUpComponent: r };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 3);

  const reasons = diffs.map(({ key, delta, winnerComponent, runnerUpComponent }) => {
    if (delta === 0) return `"${key}" contributed equally to both`;
    const leader = delta > 0 ? winner : runnerUp;
    const leaderComponent = delta > 0 ? winnerComponent : runnerUpComponent;
    const laggerComponent = delta > 0 ? runnerUpComponent : winnerComponent;
    const leaderDetail = leaderComponent
      ? `${leaderComponent.rawValue.toFixed(2)} (${leaderComponent.detail})`
      : 'no signal';
    const laggerDetail = laggerComponent
      ? `${laggerComponent.rawValue.toFixed(2)} (${laggerComponent.detail})`
      : 'no signal';
    return `"${key}" favored "${leader.program.programName}" (${leaderDetail} vs "${laggerDetail}" for the other, weighted contribution gap ${Math.abs(delta).toFixed(3)})`;
  });

  return (
    `"${winner.program.programName}" (score ${winner.score.totalScore.toFixed(3)}) ranked above ` +
    `"${runnerUp.program.programName}" (score ${runnerUp.score.totalScore.toFixed(3)}) because: ${reasons.join('; ')}.`
  );
}
