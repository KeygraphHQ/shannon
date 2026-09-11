import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  type DeclaredTransition,
  detectAuthorizationInconsistencies,
  detectUnexpectedTransitions,
  loadStateGraph,
  type NewTransitionInput,
  recordTransition,
  saveStateGraph,
  stateGraphAnomaliesToHypotheses,
  stateGraphFilePath,
} from './state-graph.js';

function transitionInput(overrides: Partial<NewTransitionInput> = {}): NewTransitionInput {
  return {
    engagementId: 'eng-1',
    actorRef: 'user-a',
    role: 'user',
    authState: 'authenticated-user',
    fromState: 'guest',
    action: 'login',
    toState: 'authenticated',
    authorizationOutcome: 'allowed',
    source: 'behavioral-diff',
    ...overrides,
  };
}

test('recordTransition produces a well-formed transition', () => {
  const t = recordTransition(transitionInput());
  assert.equal(t.action, 'login');
  assert.equal(t.authorizationOutcome, 'allowed');
});

test('save then load round-trips the state graph', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-stategraph-'));
  try {
    const transitions = [recordTransition(transitionInput()), recordTransition(transitionInput({ action: 'export' }))];
    await saveStateGraph(dir, 'eng-1', transitions);
    const loaded = await loadStateGraph(dir, 'eng-1');
    assert.ok(loaded.ok);
    assert.equal(loaded.value.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadStateGraph fails closed on a corrupted file rather than throwing or fabricating data', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-stategraph-'));
  try {
    const filePath = stateGraphFilePath(dir, 'eng-1');
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not valid json', 'utf8');
    const loaded = await loadStateGraph(dir, 'eng-1');
    assert.equal(loaded.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadStateGraph returns empty for a fresh engagement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-stategraph-'));
  try {
    const loaded = await loadStateGraph(dir, 'never-existed');
    assert.ok(loaded.ok);
    assert.deepEqual(loaded.value, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('detectUnexpectedTransitions is a no-op with no declared model', () => {
  const anomalies = detectUnexpectedTransitions([recordTransition(transitionInput())], []);
  assert.equal(anomalies.length, 0);
});

test('detectUnexpectedTransitions flags a succeeded transition absent from the declared model', () => {
  const declared: readonly DeclaredTransition[] = [
    { fromState: 'guest', action: 'login', toState: 'authenticated', allowedRoles: ['user'] },
  ];
  const anomalies = detectUnexpectedTransitions(
    [
      recordTransition(
        transitionInput({ fromState: 'authenticated', action: 'export-all-data', toState: 'authenticated' }),
      ),
    ],
    declared,
  );
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0]?.kind, 'unexpected-transition');
});

test('detectUnexpectedTransitions flags a role/state mismatch when the transition is declared but the role is not', () => {
  const declared: readonly DeclaredTransition[] = [
    { fromState: 'authenticated', action: 'export', toState: 'authenticated', allowedRoles: ['admin'] },
  ];
  const anomalies = detectUnexpectedTransitions(
    [
      recordTransition(
        transitionInput({ role: 'user', fromState: 'authenticated', action: 'export', toState: 'authenticated' }),
      ),
    ],
    declared,
  );
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0]?.kind, 'role-state-mismatch');
});

test('detectUnexpectedTransitions ignores denied attempts (those are the control-working-correctly case)', () => {
  const declared: readonly DeclaredTransition[] = [
    { fromState: 'authenticated', action: 'export', toState: 'authenticated', allowedRoles: ['admin'] },
  ];
  const anomalies = detectUnexpectedTransitions(
    [
      recordTransition(
        transitionInput({ role: 'user', fromState: 'authenticated', action: 'export', authorizationOutcome: 'denied' }),
      ),
    ],
    declared,
  );
  assert.equal(anomalies.length, 0);
});

test('detectAuthorizationInconsistencies flags the same action/resource allowed for one actor and denied for another', () => {
  const transitions = [
    recordTransition(
      transitionInput({ actorRef: 'user-a', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'denied' }),
    ),
    recordTransition(
      transitionInput({ actorRef: 'user-b', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'allowed' }),
    ),
  ];
  const anomalies = detectAuthorizationInconsistencies(transitions);
  assert.equal(anomalies.length, 1);
  assert.equal(anomalies[0]?.kind, 'authorization-inconsistency');
});

test('detectAuthorizationInconsistencies does not flag consistent outcomes across actors', () => {
  const transitions = [
    recordTransition(
      transitionInput({ actorRef: 'user-a', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'denied' }),
    ),
    recordTransition(
      transitionInput({ actorRef: 'user-b', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'denied' }),
    ),
  ];
  const anomalies = detectAuthorizationInconsistencies(transitions);
  assert.equal(anomalies.length, 0);
});

test('detectAuthorizationInconsistencies ignores transitions with no resource reference', () => {
  const transitions = [recordTransition(transitionInput())];
  const anomalies = detectAuthorizationInconsistencies(transitions);
  assert.equal(anomalies.length, 0);
});

test('stateGraphAnomaliesToHypotheses turns an authorization inconsistency into an authz hypothesis', () => {
  const transitions = [
    recordTransition(
      transitionInput({ actorRef: 'user-a', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'denied' }),
    ),
    recordTransition(
      transitionInput({ actorRef: 'user-b', resourceRef: 'doc-42', action: 'read', authorizationOutcome: 'allowed' }),
    ),
  ];
  const anomalies = detectAuthorizationInconsistencies(transitions);
  const hypotheses = stateGraphAnomaliesToHypotheses(anomalies, 'eng-1');
  assert.equal(hypotheses.length, 1);
  assert.equal(hypotheses[0]?.vulnClass, 'authz');
  assert.equal(hypotheses[0]?.assetRef, 'doc-42');
});
