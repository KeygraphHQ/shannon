import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFinding, transitionFinding } from '../findings/lifecycle.js';
import type { Hypothesis } from '../types.js';
import { emptyWorldModel, upsertNode } from '../worldmodel/graph.js';
import { computeReconMetrics } from './recon-quality.js';

function hypothesis(confidence: number): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: `hyp-${confidence}`,
    engagementId: 'e1',
    statement: 'x',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com',
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'medium',
    confidence,
    priorityScore: confidence,
    informationGain: 0.5,
    requiredEvidence: [],
    nextInvestigation: 'test',
    status: 'open',
    createdAt: now,
    updatedAt: now,
  };
}

test('computeReconMetrics counts unique and cross-source-correlated assets', () => {
  const single = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'a.example.com',
    source: 'subfinder',
    confidence: 0.6,
  });
  const withSecond = upsertNode(single.model, {
    kind: 'host',
    label: 'b.example.com',
    source: 'subfinder',
    confidence: 0.6,
  });
  const corroborated = upsertNode(withSecond.model, {
    kind: 'host',
    label: 'b.example.com',
    source: 'amass',
    confidence: 0.6,
  });

  const metrics = computeReconMetrics({
    worldModel: corroborated.model,
    hypotheses: [],
    findings: [],
    huntStartedAt: undefined,
  });

  assert.equal(metrics.uniqueAssetCount, 2);
  assert.equal(metrics.crossSourceCorrelatedAssetCount, 1);
});

test('computeReconMetrics averages hypothesis confidence and returns 0 for none', () => {
  const withHypotheses = computeReconMetrics({
    worldModel: emptyWorldModel(),
    hypotheses: [hypothesis(0.4), hypothesis(0.6)],
    findings: [],
    huntStartedAt: undefined,
  });
  assert.equal(withHypotheses.averageHypothesisConfidence, 0.5);

  const withoutHypotheses = computeReconMetrics({
    worldModel: emptyWorldModel(),
    hypotheses: [],
    findings: [],
    huntStartedAt: undefined,
  });
  assert.equal(withoutHypotheses.averageHypothesisConfidence, 0);
});

test('computeReconMetrics reports validated-finding-rate and evidence-completeness honestly', () => {
  const candidate = createFinding({
    engagementId: 'e1',
    title: 'x',
    vulnClass: 'xss',
    assetRef: 'a',
    confidence: 0.5,
    observationIds: [],
    reason: 'test',
  });
  const investigated = transitionFinding(candidate, 'investigated', 'test');
  if (!investigated.ok) throw new Error(investigated.error);

  const metrics = computeReconMetrics({
    worldModel: emptyWorldModel(),
    hypotheses: [],
    findings: [candidate, investigated.value],
    huntStartedAt: undefined,
  });
  assert.equal(metrics.validatedFindingRate, 0);
  assert.equal(metrics.evidenceCompletenessRate, 0);
});

test('computeReconMetrics computes time-to-first-useful-discovery relative to hunt start', () => {
  const start = new Date(Date.now() - 5000).toISOString();
  const { model } = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'a.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const metrics = computeReconMetrics({ worldModel: model, hypotheses: [], findings: [], huntStartedAt: start });
  assert.ok(metrics.timeToFirstUsefulDiscoveryMs !== undefined && metrics.timeToFirstUsefulDiscoveryMs >= 0);
});

test('computeReconMetrics leaves time-to-first-useful-discovery undefined with no start time', () => {
  const { model } = upsertNode(emptyWorldModel(), {
    kind: 'host',
    label: 'a.example.com',
    source: 'subfinder',
    confidence: 0.8,
  });
  const metrics = computeReconMetrics({ worldModel: model, hypotheses: [], findings: [], huntStartedAt: undefined });
  assert.equal(metrics.timeToFirstUsefulDiscoveryMs, undefined);
});
