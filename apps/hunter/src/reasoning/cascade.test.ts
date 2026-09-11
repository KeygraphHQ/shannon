import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectAnomaly, type ObservationSample } from '../anomaly/engine.js';
import type { Hypothesis, Observation } from '../types.js';
import {
  type AnomalyCascadeSeed,
  applyObservationWithContradictionTracking,
  resolveCompetingHypotheses,
  runResearchCascade,
} from './cascade.js';

function sample(overrides: Partial<ObservationSample> = {}): ObservationSample {
  return { label: 'baseline', httpStatus: 200, authorizationOutcome: 'denied', ...overrides };
}

function seedFromAnomaly(
  overrides: { assetRef?: string; parentHypothesisId?: string; parentDepth?: number } = {},
): AnomalyCascadeSeed {
  const anomaly = detectAnomaly(sample(), sample({ label: 'variant', authorizationOutcome: 'allowed' }), {
    source: 'test',
  });
  if (!anomaly) throw new Error('expected an anomaly for this fixture');
  return {
    anomaly,
    assetRef: overrides.assetRef ?? 'https://app.example.com/api/resource',
    ...(overrides.parentHypothesisId !== undefined ? { parentHypothesisId: overrides.parentHypothesisId } : {}),
    ...(overrides.parentDepth !== undefined ? { parentDepth: overrides.parentDepth } : {}),
  };
}

test('one anomaly branches into multiple competing hypotheses, cross-linked to each other', () => {
  const result = runResearchCascade([seedFromAnomaly()], { engagementId: 'e1', existingHypotheses: [] });
  assert.ok(result.newHypotheses.length >= 2);
  const first = result.newHypotheses[0];
  assert.ok(first);
  assert.ok((first.competingHypothesisIds?.length ?? 0) >= 1);
  for (const id of first.competingHypothesisIds ?? []) {
    assert.ok(result.newHypotheses.some((h) => h.id === id));
  }
});

test('every generated hypothesis carries its originating explanation as an assumption', () => {
  const result = runResearchCascade([seedFromAnomaly()], { engagementId: 'e1', existingHypotheses: [] });
  for (const h of result.newHypotheses) {
    assert.equal(h.assumptions?.length, 1);
  }
});

test('duplicate hypotheses (same vulnClass+asset+statement) are suppressed against the existing set', () => {
  const seed = seedFromAnomaly();
  const first = runResearchCascade([seed], { engagementId: 'e1', existingHypotheses: [] });
  const second = runResearchCascade([seed], { engagementId: 'e1', existingHypotheses: first.newHypotheses });
  assert.equal(second.newHypotheses.length, 0);
  assert.ok(second.events.some((e) => e.kind === 'duplicate-suppressed'));
});

test('cascade depth is enforced deterministically', () => {
  const withinDepth = runResearchCascade([seedFromAnomaly({ parentDepth: 2 })], {
    engagementId: 'e1',
    existingHypotheses: [],
    budget: { maxDepth: 4 },
  });
  assert.ok(withinDepth.newHypotheses.length > 0);

  const beyondDepth = runResearchCascade([seedFromAnomaly({ parentDepth: 4 })], {
    engagementId: 'e1',
    existingHypotheses: [],
    budget: { maxDepth: 4 },
  });
  assert.equal(beyondDepth.newHypotheses.length, 0);
  assert.ok(beyondDepth.events.some((e) => e.kind === 'depth-limit-reached'));
});

test('scope blocking prevents hypothesis generation for an out-of-scope asset', () => {
  const result = runResearchCascade([seedFromAnomaly({ assetRef: 'https://out-of-scope.example.com/x' })], {
    engagementId: 'e1',
    existingHypotheses: [],
    isInScope: (ref) => !ref.includes('out-of-scope'),
  });
  assert.equal(result.newHypotheses.length, 0);
  assert.ok(result.events.some((e) => e.kind === 'scope-blocked'));
});

test('budget exhaustion stops the cascade deterministically once maxNewHypotheses is hit', () => {
  const seeds = [
    seedFromAnomaly({ assetRef: 'a' }),
    seedFromAnomaly({ assetRef: 'b' }),
    seedFromAnomaly({ assetRef: 'c' }),
  ];
  const result = runResearchCascade(seeds, {
    engagementId: 'e1',
    existingHypotheses: [],
    budget: { maxNewHypotheses: 2 },
  });
  assert.equal(result.newHypotheses.length, 2);
  assert.ok(result.events.some((e) => e.kind === 'budget-exhausted'));
});

test('information-gain selection: results are sorted with the highest information gain first', () => {
  const result = runResearchCascade([seedFromAnomaly()], { engagementId: 'e1', existingHypotheses: [] });
  const gains = result.newHypotheses.map((h) => h.informationGain);
  const sorted = [...gains].sort((a, b) => b - a);
  assert.deepEqual(gains, sorted);
});

test('the cascade terminates for a zero-anomaly batch without error', () => {
  const result = runResearchCascade([], { engagementId: 'e1', existingHypotheses: [] });
  assert.equal(result.newHypotheses.length, 0);
  assert.equal(result.events.length, 0);
});

function baseHypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: 'hyp-1',
    engagementId: 'e1',
    statement: 'x',
    vulnClass: 'authz',
    assetRef: 'a',
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'medium',
    confidence: 0.5,
    priorityScore: 0.5,
    informationGain: 0.5,
    requiredEvidence: [],
    nextInvestigation: 'x',
    status: 'open',
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
    title: 'x',
    description: 'x',
    severityHint: 'medium',
    confidenceHint: 'medium',
    verified: false,
    tags: [],
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('applyObservationWithContradictionTracking records a structured contradiction on a non-supportive observation', () => {
  const hypothesis = baseHypothesis();
  const updated = applyObservationWithContradictionTracking(
    hypothesis,
    observation(),
    false,
    'response matched the anonymous baseline',
  );
  assert.equal(updated.structuredContradictions?.length, 1);
  assert.equal(updated.structuredContradictions?.[0]?.observationId, 'obs-1');
});

test('applyObservationWithContradictionTracking preserves prior contradictions even once the hypothesis is discarded', () => {
  let hypothesis = baseHypothesis({ confidence: 0.25 });
  hypothesis = applyObservationWithContradictionTracking(
    hypothesis,
    observation({ id: 'obs-1' }),
    false,
    'first contradiction',
  );
  hypothesis = applyObservationWithContradictionTracking(
    hypothesis,
    observation({ id: 'obs-2' }),
    false,
    'second contradiction',
  );
  assert.equal(hypothesis.structuredContradictions?.length, 2);
});

test('applyObservationWithContradictionTracking does not record a contradiction for a supportive observation', () => {
  const hypothesis = baseHypothesis();
  const updated = applyObservationWithContradictionTracking(hypothesis, observation({ verified: true }), true, 'n/a');
  assert.equal(updated.structuredContradictions, undefined);
});

test('resolveCompetingHypotheses converges once every alternative but one is contradicted', () => {
  const survivor = baseHypothesis({ id: 'hyp-survivor', status: 'investigating' });
  const loser = baseHypothesis({ id: 'hyp-loser', status: 'contradicted' });
  const result = resolveCompetingHypotheses([survivor, loser]);
  assert.equal(result.winner?.id, 'hyp-survivor');
  assert.equal(result.contradicted.length, 1);
});

test('resolveCompetingHypotheses reports still-competing when more than one alternative remains viable', () => {
  const a = baseHypothesis({ id: 'a', status: 'open' });
  const b = baseHypothesis({ id: 'b', status: 'investigating' });
  const result = resolveCompetingHypotheses([a, b]);
  assert.equal(result.winner, undefined);
  assert.equal(result.stillCompeting.length, 2);
});

test('resolveCompetingHypotheses reports no winner when every alternative is contradicted (all disproven)', () => {
  const a = baseHypothesis({ id: 'a', status: 'contradicted' });
  const b = baseHypothesis({ id: 'b', status: 'discarded' });
  const result = resolveCompetingHypotheses([a, b]);
  assert.equal(result.winner, undefined);
  assert.equal(result.contradicted.length, 2);
});
