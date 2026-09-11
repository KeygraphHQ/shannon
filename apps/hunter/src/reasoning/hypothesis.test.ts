import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordMemory } from '../memory/hunt-memory.js';
import type { Observation } from '../types.js';
import {
  hypothesesFromObservations,
  scoreHypothesisGroup,
  selectNextInvestigation,
  updateHypothesisWithObservation,
} from './hypothesis.js';

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    engagementId: 'e1',
    source: 'fixture',
    assetRef: 'https://app.example.com/search',
    vulnClass: 'xss',
    title: 'Reflected XSS',
    description: 'desc',
    severityHint: 'medium',
    confidenceHint: 'high',
    verified: false,
    tags: [],
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

test('groups observations by asset + vuln class into one hypothesis each', () => {
  const observations = [
    observation({ id: 'obs-1' }),
    observation({ id: 'obs-2' }),
    observation({ id: 'obs-3', vulnClass: 'authz', assetRef: 'https://app.example.com/admin' }),
  ];
  const hypotheses = hypothesesFromObservations(observations, 'e1');
  assert.equal(hypotheses.length, 2);
  const xssHypothesis = hypotheses.find((h) => h.vulnClass === 'xss');
  assert.equal(xssHypothesis?.supportingObservationIds.length, 2);
  assert.ok(xssHypothesis?.requiredEvidence.length && xssHypothesis.requiredEvidence.length > 0);
  assert.ok(xssHypothesis?.nextInvestigation.length && xssHypothesis.nextInvestigation.length > 0);
});

test('a verified observation scores a higher confidence than an otherwise identical unverified one', () => {
  const unverified = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ verified: false })],
  });
  const verified = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ verified: true })],
  });
  assert.ok(verified.confidence > unverified.confidence);
});

test('higher severity scores a higher priority than lower severity at equal confidence', () => {
  const low = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ severityHint: 'low' })],
  });
  const critical = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ severityHint: 'critical' })],
  });
  assert.ok(critical.priorityScore > low.priorityScore);
  assert.equal(critical.potentialImpact, 'critical');
  assert.equal(low.potentialImpact, 'low');
});

test('a low-confidence hypothesis has higher information gain than an already-confident one', () => {
  const lowConfidence = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ confidenceHint: 'low', verified: false })],
  });
  const highConfidence = scoreHypothesisGroup({
    vulnClass: 'xss',
    assetRef: 'a',
    observations: [observation({ confidenceHint: 'high', verified: true })],
  });
  assert.ok(lowConfidence.informationGain > highConfidence.informationGain);
});

test('selectNextInvestigation returns the highest scoring open hypothesis', () => {
  const observations = [
    observation({ id: 'obs-1', vulnClass: 'xss', severityHint: 'low', confidenceHint: 'low', assetRef: 'a' }),
    observation({
      id: 'obs-2',
      vulnClass: 'authz',
      severityHint: 'critical',
      confidenceHint: 'high',
      assetRef: 'b',
      verified: true,
    }),
  ];
  const hypotheses = hypothesesFromObservations(observations, 'e1');
  const next = selectNextInvestigation(hypotheses);
  assert.equal(next?.vulnClass, 'authz');
});

test('selectNextInvestigation ignores hypotheses that are not open or investigating', () => {
  const observations = [observation()];
  const hypotheses = hypothesesFromObservations(observations, 'e1').map((h) => ({ ...h, status: 'resolved' as const }));
  assert.equal(selectNextInvestigation(hypotheses), undefined);
});

test('updateHypothesisWithObservation raises confidence and records support for a supportive observation', () => {
  const [hypothesis] = hypothesesFromObservations([observation({ confidenceHint: 'low' })], 'e1');
  if (!hypothesis) throw new Error('expected a hypothesis');

  const newObservation = observation({ id: 'obs-new', confidenceHint: 'high', verified: true });
  const updated = updateHypothesisWithObservation(hypothesis, newObservation, true);

  assert.ok(updated.confidence > hypothesis.confidence);
  assert.ok(updated.supportingObservationIds.includes('obs-new'));
  assert.ok(updated.informationGain <= hypothesis.informationGain);
});

test('updateHypothesisWithObservation can flip a hypothesis to contradicted', () => {
  const [hypothesis] = hypothesesFromObservations([observation({ confidenceHint: 'low' })], 'e1');
  if (!hypothesis) throw new Error('expected a hypothesis');

  const contradictingObservation = observation({ id: 'obs-contra', confidenceHint: 'high' });
  const updated = updateHypothesisWithObservation(hypothesis, contradictingObservation, false);

  assert.equal(updated.status, 'contradicted');
  assert.ok(updated.contradictingObservationIds.includes('obs-contra'));
  assert.ok(updated.confidence < hypothesis.confidence);
});

test('scoreHypothesisGroup with no memory (or empty memory) behaves exactly as before — the default is a pure no-op', () => {
  const group = { vulnClass: 'xss', assetRef: 'a', observations: [observation()] };
  const withoutMemoryArg = scoreHypothesisGroup(group);
  const withEmptyMemory = scoreHypothesisGroup(group, []);
  assert.deepEqual(withoutMemoryArg, withEmptyMemory);
});

test('a vulnClass with a history of successful hypotheses scores a higher priority than the same evidence with no history', () => {
  const group = { vulnClass: 'idor', assetRef: 'a', observations: [observation({ vulnClass: 'idor' })] };
  const neutral = scoreHypothesisGroup(group);
  const memory = [
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
  ];
  const boosted = scoreHypothesisGroup(group, memory);
  assert.ok(boosted.priorityScore > neutral.priorityScore);
  // Memory must never touch confidence — only which hypothesis looks worth investigating next.
  assert.equal(boosted.confidence, neutral.confidence);
});

test('a vulnClass with a history of false positives scores a lower priority than the same evidence with no history', () => {
  const group = {
    vulnClass: 'js-intel-feature-flags',
    assetRef: 'a',
    observations: [observation({ vulnClass: 'js-intel-feature-flags' })],
  };
  const neutral = scoreHypothesisGroup(group);
  const memory = [
    recordMemory({
      kind: 'false-positive-pattern',
      description: 'x',
      outcome: 'negative',
      confidence: 0.6,
      source: 'test',
      vulnClass: 'js-intel-feature-flags',
    }),
    recordMemory({
      kind: 'false-positive-pattern',
      description: 'x',
      outcome: 'negative',
      confidence: 0.6,
      source: 'test',
      vulnClass: 'js-intel-feature-flags',
    }),
  ];
  const suppressed = scoreHypothesisGroup(group, memory);
  assert.ok(suppressed.priorityScore < neutral.priorityScore);
  assert.equal(suppressed.confidence, neutral.confidence);
});

test('hypothesesFromObservations threads memory through to every generated hypothesis', () => {
  const observations = [observation({ vulnClass: 'idor', assetRef: 'a' })];
  const memory = [
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
  ];
  const withoutMemory = hypothesesFromObservations(observations, 'e1');
  const withMemory = hypothesesFromObservations(observations, 'e1', memory);
  assert.ok((withMemory[0]?.priorityScore ?? 0) > (withoutMemory[0]?.priorityScore ?? 0));
});

test('updateHypothesisWithObservation threads memory through without changing confidence', () => {
  const [hypothesis] = hypothesesFromObservations([observation({ vulnClass: 'idor', confidenceHint: 'low' })], 'e1');
  if (!hypothesis) throw new Error('expected a hypothesis');
  const newObservation = observation({ id: 'obs-new', vulnClass: 'idor', confidenceHint: 'high', verified: true });
  const memory = [
    recordMemory({
      kind: 'successful-hypothesis-pattern',
      description: 'x',
      outcome: 'positive',
      confidence: 0.8,
      source: 'test',
      vulnClass: 'idor',
    }),
  ];
  const withoutMemory = updateHypothesisWithObservation(hypothesis, newObservation, true);
  const withMemory = updateHypothesisWithObservation(hypothesis, newObservation, true, memory);
  assert.ok(withMemory.priorityScore > withoutMemory.priorityScore);
  assert.equal(withMemory.confidence, withoutMemory.confidence);
});
