import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Hypothesis } from '../types.js';
import {
  actionKey,
  buildActionQueue,
  markActionDone,
  markActionFailed,
  markActionSkipped,
  selectNextBestAction,
} from './actions.js';

function hypothesis(overrides: Partial<Hypothesis> = {}): Hypothesis {
  const now = new Date().toISOString();
  return {
    id: 'hyp-1',
    engagementId: 'e1',
    statement: 'xss may be present',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com/search',
    supportingObservationIds: ['obs-1'],
    contradictingObservationIds: [],
    potentialImpact: 'medium',
    confidence: 0.5,
    priorityScore: 0.5,
    informationGain: 0.5,
    requiredEvidence: ['reproduction'],
    nextInvestigation: 'run Shannon',
    status: 'open',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

test('buildActionQueue creates one action per open/investigating hypothesis, mapped to a suitable action kind', () => {
  const actions = buildActionQueue(
    [
      hypothesis({ id: 'h1', vulnClass: 'xss' }),
      hypothesis({ id: 'h2', vulnClass: 'authz', assetRef: 'https://app.example.com/admin' }),
    ],
    'e1',
    new Set(),
  );
  assert.equal(actions.length, 2);
  assert.equal(actions.find((a) => a.hypothesisId === 'h1')?.kind, 'shannon');
  assert.equal(actions.find((a) => a.hypothesisId === 'h2')?.kind, 'behavioral-diff');
});

test('buildActionQueue skips hypotheses that are not open or investigating', () => {
  const actions = buildActionQueue([hypothesis({ status: 'resolved' })], 'e1', new Set());
  assert.equal(actions.length, 0);
});

test('buildActionQueue avoids repeating an already-completed (kind, target) pair', () => {
  const completed = new Set([actionKey('shannon', 'https://app.example.com/search')]);
  const actions = buildActionQueue([hypothesis()], 'e1', completed);
  assert.equal(actions.length, 0);
});

test('selectNextBestAction prefers higher information gain adjusted for cost', () => {
  const actions = buildActionQueue(
    [
      hypothesis({ id: 'h1', informationGain: 0.9, vulnClass: 'js-intel-secret-exposure' }),
      hypothesis({ id: 'h2', informationGain: 0.2, vulnClass: 'xss', assetRef: 'https://app.example.com/other' }),
    ],
    'e1',
    new Set(),
  );
  const next = selectNextBestAction(actions);
  assert.equal(next?.hypothesisId, 'h1');
});

test('selectNextBestAction returns undefined once nothing is queued', () => {
  assert.equal(selectNextBestAction([]), undefined);
});

test('markActionDone and markActionSkipped set terminal status, completedAt, and a result summary', () => {
  const [action] = buildActionQueue([hypothesis()], 'e1', new Set());
  if (!action) throw new Error('expected an action');

  const done = markActionDone(action, 'ingested 2 observations');
  assert.equal(done.status, 'done');
  assert.ok(done.completedAt);
  assert.equal(done.resultSummary, 'ingested 2 observations');

  const skipped = markActionSkipped(action, 'no local repo available for Shannon');
  assert.equal(skipped.status, 'skipped');
});

test('markActionFailed is distinct from skipped — a genuine execution error, not "nothing to do"', () => {
  const [action] = buildActionQueue([hypothesis()], 'e1', new Set());
  if (!action) throw new Error('expected an action');
  const failed = markActionFailed(action, 'ffuf exited 1: connection refused');
  assert.equal(failed.status, 'failed');
  assert.ok(failed.completedAt);
});
