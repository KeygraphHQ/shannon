import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Observation, WorldModelSnapshot } from '../types.js';
import { buildActionQueue } from './actions.js';
import { HeuristicReasoningProvider } from './heuristic-provider.js';
import { hypothesesFromObservations } from './hypothesis.js';

function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: 'obs-1',
    engagementId: 'e1',
    source: 'fixture',
    assetRef: 'https://app.example.com/search',
    vulnClass: 'xss',
    title: 'Reflected XSS',
    description: 'desc',
    severityHint: 'high',
    confidenceHint: 'high',
    verified: true,
    tags: [],
    collectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function snapshotFor(observations: readonly Observation[]): WorldModelSnapshot {
  const hypotheses = hypothesesFromObservations(observations, 'e1');
  const candidateActions = buildActionQueue(hypotheses, 'e1', new Set());
  return {
    programId: 'p1',
    nodes: [],
    edges: [],
    hypotheses,
    recentObservations: observations,
    completedActions: [],
    candidateActions,
    round: 1,
  };
}

test('source is "heuristic"', () => {
  assert.equal(new HeuristicReasoningProvider().source, 'heuristic');
});

test('selectNextBestAction proposes the highest-value queued action, matching a real candidate exactly', async () => {
  const snapshot = snapshotFor([observation()]);
  const provider = new HeuristicReasoningProvider();
  const proposal = await provider.selectNextBestAction(snapshot);
  assert.ok(proposal);
  const matches = snapshot.candidateActions.some(
    (a) =>
      a.kind === proposal?.kind && a.targetRef === proposal?.targetRef && a.hypothesisId === proposal?.hypothesisId,
  );
  assert.ok(matches, 'heuristic proposal must always match a real candidate action');
});

test('selectNextBestAction returns undefined when there is nothing queued', async () => {
  const snapshot = snapshotFor([]);
  const provider = new HeuristicReasoningProvider();
  assert.equal(await provider.selectNextBestAction(snapshot), undefined);
});

test('generateHypotheses proposes one hypothesis per (vulnClass, assetRef) cluster', async () => {
  const provider = new HeuristicReasoningProvider();
  const proposals = await provider.generateHypotheses(
    [observation(), observation({ id: 'obs-2', vulnClass: 'authz' })],
    'e1',
  );
  assert.equal(proposals.length, 2);
  assert.ok(proposals.every((p) => p.supportingObservationIds.length > 0));
});
