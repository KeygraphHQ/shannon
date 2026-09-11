import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Hypothesis } from '../types.js';
import { actionKey } from './actions.js';
import { designExperiments, experimentToHuntAction, selectBestExperiment } from './experiment.js';

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: 'hyp-1',
    engagementId: 'e1',
    statement: 'authz may be broken on /api/resource',
    vulnClass: 'authz',
    assetRef: 'https://app.example.com/api/resource',
    supportingObservationIds: [],
    contradictingObservationIds: [],
    potentialImpact: 'high',
    confidence: 0.4,
    priorityScore: 0.5,
    informationGain: 0.6,
    requiredEvidence: ['a second account/role confirming the access difference'],
    nextInvestigation: 'behavioral diff across auth states',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('designExperiments produces one experiment per open/investigating hypothesis', () => {
  const experiments = designExperiments([hypothesis(), hypothesis({ id: 'hyp-2', status: 'resolved' })]);
  assert.equal(experiments.length, 1);
  assert.equal(experiments[0]?.hypothesisId, 'hyp-1');
  assert.equal(experiments[0]?.actionKind, 'behavioral-diff');
});

test('designExperiments skips a hypothesis whose (actionKind, target) signature already ran', () => {
  const h = hypothesis();
  const already = new Set([actionKey('behavioral-diff', h.assetRef)]);
  const experiments = designExperiments([h], already);
  assert.equal(experiments.length, 0);
});

test('designExperiments carries the hypothesis required evidence into both expected outcomes and validation criteria', () => {
  const experiments = designExperiments([hypothesis()]);
  assert.deepEqual(experiments[0]?.expectedOutcomes, hypothesis().requiredEvidence);
  assert.deepEqual(experiments[0]?.validationCriteria, hypothesis().requiredEvidence);
});

test('selectBestExperiment picks the higher-information-gain, lower-risk candidate', () => {
  const experiments = designExperiments([
    hypothesis({ id: 'hyp-low-gain', informationGain: 0.2, assetRef: 'https://app.example.com/low' }),
    hypothesis({ id: 'hyp-high-gain', informationGain: 0.9, assetRef: 'https://app.example.com/high' }),
  ]);
  const selection = selectBestExperiment(experiments);
  assert.equal(selection.selected?.hypothesisId, 'hyp-high-gain');
  assert.equal(selection.deferred.length, 1);
});

test('selectBestExperiment states why every non-selected experiment was deferred', () => {
  const experiments = designExperiments([
    hypothesis({ id: 'hyp-a', informationGain: 0.3, assetRef: 'https://app.example.com/a' }),
    hypothesis({ id: 'hyp-b', informationGain: 0.9, assetRef: 'https://app.example.com/b' }),
  ]);
  const selection = selectBestExperiment(experiments);
  assert.match(selection.deferred[0]?.reason ?? '', /do not test this yet/);
});

test('selectBestExperiment penalizes high-risk experiments even with a similar raw information gain', () => {
  const lowRiskHigherScore = designExperiments([
    hypothesis({
      id: 'hyp-manual',
      vulnClass: 'js-intel-secret-exposure',
      informationGain: 0.5,
      assetRef: 'https://app.example.com/x',
    }),
  ])[0];
  const highRiskShannon = designExperiments([
    hypothesis({ id: 'hyp-xss', vulnClass: 'xss', informationGain: 0.55, assetRef: 'https://app.example.com/y' }),
  ])[0];
  assert.ok(lowRiskHigherScore);
  assert.ok(highRiskShannon);
  const selection = selectBestExperiment([lowRiskHigherScore, highRiskShannon]);
  assert.equal(selection.selected?.actionKind, 'manual-review');
});

test('selectBestExperiment returns undefined for an empty candidate list', () => {
  const selection = selectBestExperiment([]);
  assert.equal(selection.selected, undefined);
  assert.equal(selection.deferred.length, 0);
});

test('experimentToHuntAction converts into a plain queued HuntAction usable by the existing execution pipeline', () => {
  const experiments = designExperiments([hypothesis()]);
  const experiment = experiments[0];
  assert.ok(experiment);
  const action = experimentToHuntAction(experiment, 'e1');
  assert.equal(action.kind, experiment.actionKind);
  assert.equal(action.targetRef, experiment.targetRef);
  assert.equal(action.hypothesisId, experiment.hypothesisId);
  assert.equal(action.status, 'queued');
});
