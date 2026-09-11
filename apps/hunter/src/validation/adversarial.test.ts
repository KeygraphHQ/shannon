import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Hypothesis, Observation } from '../types.js';
import { runAdversarialReview } from './adversarial.js';

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: 'hyp-1',
    engagementId: 'e1',
    statement: 'this looks vulnerable',
    vulnClass: 'authz',
    assetRef: 'a',
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'high',
    confidence: 0.8,
    priorityScore: 0.8,
    informationGain: 0.2,
    requiredEvidence: ['a second account/role confirming the access difference'],
    nextInvestigation: 'x',
    status: 'investigating',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    engagementId: 'e1',
    source: 'behavioral-diff',
    assetRef: 'a',
    vulnClass: 'authz',
    title: 'observed difference',
    description: 'x',
    severityHint: 'high',
    confidenceHint: 'medium',
    verified: false,
    tags: [],
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('an unverified claim is never "passed" — an LLM/heuristic statement alone is not proof', () => {
  const review = runAdversarialReview({
    hypothesis: hypothesis(),
    supportingObservations: [observation({ verified: false })],
    contradictingObservations: [],
    satisfiedRequirements: new Set(hypothesis().requiredEvidence),
  });
  assert.equal(review.validationResult, 'inconclusive');
});

test('a verified claim with all required evidence satisfied and no credible counterclaim passes', () => {
  const h = hypothesis();
  const review = runAdversarialReview({
    hypothesis: h,
    supportingObservations: [observation({ verified: true })],
    contradictingObservations: [],
    satisfiedRequirements: new Set(h.requiredEvidence),
  });
  assert.equal(review.validationResult, 'passed');
  assert.ok(review.finalConfidence > 0);
});

test('unresolved required-evidence questions keep the result inconclusive even with verified support', () => {
  const review = runAdversarialReview({
    hypothesis: hypothesis(),
    supportingObservations: [observation({ verified: true })],
    contradictingObservations: [],
    satisfiedRequirements: new Set(),
  });
  assert.equal(review.validationResult, 'inconclusive');
  assert.equal(review.unresolvedQuestions.length, 1);
});

test('a credible contradicting observation fails the review and caps confidence low', () => {
  const h = hypothesis();
  const review = runAdversarialReview({
    hypothesis: h,
    supportingObservations: [observation({ verified: true })],
    contradictingObservations: [
      observation({ id: 'obs-2', confidenceHint: 'high', title: 'a false-positive explanation was confirmed' }),
    ],
    satisfiedRequirements: new Set(h.requiredEvidence),
  });
  assert.equal(review.validationResult, 'failed');
  assert.ok(review.finalConfidence <= 0.2);
});

test('a low-confidence contradicting observation does not, by itself, fail the review', () => {
  const h = hypothesis();
  const review = runAdversarialReview({
    hypothesis: h,
    supportingObservations: [observation({ verified: true })],
    contradictingObservations: [observation({ id: 'obs-2', confidenceHint: 'low' })],
    satisfiedRequirements: new Set(h.requiredEvidence),
  });
  assert.notEqual(review.validationResult, 'failed');
});

test('an unverified assumption always produces a counterclaim the skeptic can raise', () => {
  const h = hypothesis({ assumptions: ['the two identities were tested against the exact same resource'] });
  const review = runAdversarialReview({
    hypothesis: h,
    supportingObservations: [observation({ verified: true })],
    contradictingObservations: [],
    satisfiedRequirements: new Set(h.requiredEvidence),
  });
  assert.equal(review.counterclaims.length, 1);
  assert.match(review.counterclaims[0]?.alternativeExplanation ?? '', /does not actually hold/);
});

test('the claim always cites exactly the supporting observation ids it was given', () => {
  const review = runAdversarialReview({
    hypothesis: hypothesis(),
    supportingObservations: [observation({ id: 'obs-a' }), observation({ id: 'obs-b' })],
    contradictingObservations: [],
    satisfiedRequirements: new Set(hypothesis().requiredEvidence),
  });
  assert.deepEqual(review.claim.basedOnObservationIds, ['obs-a', 'obs-b']);
});
