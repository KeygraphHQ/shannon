/**
 * Adversarial validation.
 *
 * A structured, multi-perspective review a hypothesis must pass before the
 * finding lifecycle (`findings/lifecycle.ts`) is allowed to move it past
 * "reproduced": a researcher's claim, a skeptic's counterclaims (grounded
 * in the hypothesis's own recorded contradictions and unverified
 * assumptions — never invented from nothing), the distinguishing questions
 * that would resolve them, and a final validation result. An LLM's opinion
 * is never itself proof: `validationResult` can only be "passed" when at
 * least one supporting observation was independently verified (reproduced)
 * — see `hasVerifiedSupport` below — matching this repository's rule that a
 * statement of belief is not evidence.
 */

import type { Hypothesis, Observation } from '../types.js';

export interface AdversarialClaim {
  readonly statement: string;
  readonly basedOnObservationIds: readonly string[];
}

export interface AdversarialCounterclaim {
  readonly alternativeExplanation: string;
  readonly plausibility: number;
}

export interface DistinguishingQuestion {
  readonly question: string;
  readonly resolved: boolean;
  readonly resolution: string | undefined;
}

export type AdversarialValidationResult = 'passed' | 'failed' | 'inconclusive';

export interface AdversarialReview {
  readonly claim: AdversarialClaim;
  readonly counterclaims: readonly AdversarialCounterclaim[];
  readonly distinguishingQuestions: readonly DistinguishingQuestion[];
  readonly unresolvedQuestions: readonly string[];
  readonly validationResult: AdversarialValidationResult;
  readonly finalConfidence: number;
}

export interface AdversarialReviewInput {
  readonly hypothesis: Hypothesis;
  readonly supportingObservations: readonly Observation[];
  readonly contradictingObservations: readonly Observation[];
  /** Which of `hypothesis.requiredEvidence` items are actually satisfied, as determined by the caller from real evidence/observations — never guessed here from free text. */
  readonly satisfiedRequirements: ReadonlySet<string>;
}

const CONFIDENCE_HINT_PLAUSIBILITY: Readonly<Record<string, number>> = { high: 0.8, medium: 0.5, low: 0.3 };
const ASSUMPTION_COUNTERCLAIM_PLAUSIBILITY = 0.3;
const FAILURE_PLAUSIBILITY_THRESHOLD = 0.5;

function buildCounterclaims(input: AdversarialReviewInput): readonly AdversarialCounterclaim[] {
  const counterclaims: AdversarialCounterclaim[] = [];
  for (const observation of input.contradictingObservations) {
    counterclaims.push({
      alternativeExplanation: `"${observation.title}" contradicts the claim`,
      plausibility: CONFIDENCE_HINT_PLAUSIBILITY[observation.confidenceHint.toLowerCase()] ?? 0.3,
    });
  }
  for (const assumption of input.hypothesis.assumptions ?? []) {
    counterclaims.push({
      alternativeExplanation: `the assumption "${assumption}" does not actually hold`,
      plausibility: ASSUMPTION_COUNTERCLAIM_PLAUSIBILITY,
    });
  }
  return counterclaims;
}

function buildDistinguishingQuestions(input: AdversarialReviewInput): readonly DistinguishingQuestion[] {
  return input.hypothesis.requiredEvidence.map((requirement) => {
    const resolved = input.satisfiedRequirements.has(requirement);
    return {
      question: `what evidence would confirm: "${requirement}"?`,
      resolved,
      resolution: resolved ? 'satisfied by collected evidence' : undefined,
    };
  });
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Runs the full researcher/skeptic/validator cycle over one hypothesis.
 * Never returns "passed" without at least one independently verified
 * supporting observation, regardless of how confident the hypothesis
 * itself claims to be — an unverified claim is "inconclusive" at best.
 */
export function runAdversarialReview(input: AdversarialReviewInput): AdversarialReview {
  const claim: AdversarialClaim = {
    statement: input.hypothesis.statement,
    basedOnObservationIds: input.supportingObservations.map((o) => o.id),
  };
  const counterclaims = buildCounterclaims(input);
  const distinguishingQuestions = buildDistinguishingQuestions(input);
  const unresolvedQuestions = distinguishingQuestions.filter((q) => !q.resolved).map((q) => q.question);
  const maxCounterclaimPlausibility = counterclaims.reduce((max, c) => Math.max(max, c.plausibility), 0);
  const hasVerifiedSupport = input.supportingObservations.some((o) => o.verified);

  let validationResult: AdversarialValidationResult;
  if (!hasVerifiedSupport) {
    validationResult = 'inconclusive';
  } else if (
    input.contradictingObservations.length > 0 &&
    maxCounterclaimPlausibility >= FAILURE_PLAUSIBILITY_THRESHOLD
  ) {
    validationResult = 'failed';
  } else if (unresolvedQuestions.length > 0) {
    validationResult = 'inconclusive';
  } else {
    validationResult = 'passed';
  }

  const rawConfidence =
    input.hypothesis.confidence - maxCounterclaimPlausibility * 0.3 - unresolvedQuestions.length * 0.05;
  const finalConfidence = Number(
    (validationResult === 'failed' ? Math.min(0.2, clamp01(rawConfidence)) : clamp01(rawConfidence)).toFixed(4),
  );

  return { claim, counterclaims, distinguishingQuestions, unresolvedQuestions, validationResult, finalConfidence };
}
