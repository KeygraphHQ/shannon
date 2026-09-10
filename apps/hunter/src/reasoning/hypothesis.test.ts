import assert from 'node:assert/strict';
import { test } from 'node:test';
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
