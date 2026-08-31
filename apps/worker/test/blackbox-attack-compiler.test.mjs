import assert from 'node:assert/strict';
import test from 'node:test';

import { compileAuthorizationAttacks } from '../dist/blackbox/attack-compiler.js';

const TARGET_ORIGIN = 'https://target.example';
const PROVENANCE = { actor: 'blackbox-recon', taskId: 'recon-fixture', baseRevision: 6 };

function exchange(exchangeId, identity, objectReference) {
  return {
    exchangeId,
    routeSignature: 'route_memo_get',
    identity,
    captureSequence: 1,
    method: 'GET',
    origin: TARGET_ORIGIN,
    path: `/api/memos/${objectReference}`,
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: `sha256:${exchangeId}`,
    candidateObjectReferences: [objectReference],
    rawRecordRef: `raw/${exchangeId}.json`,
    provenance: PROVENANCE,
  };
}

function resource(resourceId, ownerIdentity, objectReference, exchangeId) {
  return {
    resourceId,
    resourceType: 'memo',
    objectReferences: [objectReference],
    ownerIdentity,
    visibility: 'private',
    evidence: [{ id: exchangeId, kind: 'exchange' }],
    provenance: PROVENANCE,
  };
}

function snapshot() {
  return {
    schemaVersion: 1,
    revision: 7,
    targetOrigin: TARGET_ORIGIN,
    runScope: {
      mode: 'blackbox',
      targetOrigin: TARGET_ORIGIN,
      identities: ['attacker', 'victim'],
      burpMcpUrl: 'http://127.0.0.1:9876/',
      burpMcpHostHeader: '127.0.0.1:9876',
      burpProxyUrl: 'http://127.0.0.1:8080/',
      evidenceBindingVersion: 1,
      identityBindingContractDigest: 'a'.repeat(64),
    },
    identities: [
      { name: 'attacker', role: 'ordinary user', authenticated: true, stateRef: 'state/attacker.json' },
      { name: 'victim', role: 'ordinary user', authenticated: true, stateRef: 'state/victim.json' },
    ],
    exchanges: [
      exchange('ex_victim_memo', 'victim', 'victim-memo-4d2e'),
      exchange('ex_attacker_memo', 'attacker', 'peer-9b1c'),
    ],
    resources: [
      resource('res_victim_memo', 'victim', 'victim-memo-4d2e', 'ex_victim_memo'),
      resource('res_attacker_memo', 'attacker', 'peer-9b1c', 'ex_attacker_memo'),
    ],
    transitions: [],
    hypotheses: [],
    actions: [],
    candidateProofs: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
    runStatus: 'running',
  };
}

test('compiles owner-bound peer routes into an identity-swap action', () => {
  const compiled = compileAuthorizationAttacks(snapshot(), 1);

  assert.equal(compiled.hypotheses.length, 1);
  assert.equal(compiled.tasks.length, 1);
  assert.match(compiled.hypotheses[0].hypothesisId, /^hyp_authz_[a-f0-9]{24}$/);
  assert.deepEqual(compiled.hypotheses[0], {
    hypothesisId: compiled.tasks[0].hypothesisId,
    kind: 'horizontal',
    summary: 'An authenticated peer may read a victim-owned private memo.',
    preconditions: ['The victim and attacker hold distinct authenticated identities.'],
    attackerCapability: 'Replay the victim memo request with the attacker identity.',
    evidence: [
      { id: 'ex_attacker_memo', kind: 'exchange' },
      { id: 'ex_victim_memo', kind: 'exchange' },
      { id: 'res_attacker_memo', kind: 'resource' },
      { id: 'res_victim_memo', kind: 'resource' },
    ],
    priority: 'high',
    status: 'open',
    provenance: { actor: 'orchestrator', taskId: 'authorization-compiler', baseRevision: 7 },
  });
  assert.match(compiled.tasks[0].taskId, /^action_authz_[a-f0-9]{24}$/);
  assert.deepEqual(compiled.tasks[0], {
    taskId: compiled.tasks[0].taskId,
    kind: 'action',
    objective: 'Replay the victim memo request as attacker and prove whether it discloses victim-owned data.',
    evidence: compiled.hypotheses[0].evidence,
    identityLease: 'attacker',
    hypothesisId: compiled.hypotheses[0].hypothesisId,
    status: 'pending',
    replayPlan: {
      steps: [
        {
          stepId: compiled.tasks[0].replayPlan.steps[0].stepId,
          sourceExchangeId: 'ex_victim_memo',
          actor: 'attacker',
          mutations: [],
        },
      ],
      proofCondition: { type: 'body_contains', marker: 'victim-memo-4d2e' },
    },
  });
  assert.match(compiled.tasks[0].replayPlan.steps[0].stepId, /^step_authz_[a-f0-9]{24}$/);
});

test('accepts read-only RPC posts and rejects mixed-name state changes', () => {
  const readSnapshot = snapshot();
  readSnapshot.exchanges = readSnapshot.exchanges.map((candidate) => ({
    ...candidate,
    method: 'POST',
    path: '/memos.api.v1.MemoService/GetMemo',
  }));

  assert.equal(compileAuthorizationAttacks(readSnapshot, 1).tasks.length, 1);

  const writeSnapshot = structuredClone(readSnapshot);
  writeSnapshot.exchanges = writeSnapshot.exchanges.map((candidate) => ({
    ...candidate,
    path: '/memos.api.v1.MemoService/GetAndDeleteMemo',
  }));

  assert.deepEqual(compileAuthorizationAttacks(writeSnapshot), { hypotheses: [], tasks: [] });
});

test('does not repeat a completed route replay after the route is recaptured', () => {
  const initial = snapshot();
  const firstWave = compileAuthorizationAttacks(initial);
  const recaptured = structuredClone(initial);
  recaptured.tasks = firstWave.tasks.map((task) => ({ ...task, status: 'completed' }));
  recaptured.exchanges.push(exchange('ex_victim_recaptured', 'victim', 'victim-record-new-7f3a'));
  recaptured.resources[0].objectReferences = ['victim-record-new-7f3a'];
  recaptured.resources[0].evidence.push({ id: 'ex_victim_recaptured', kind: 'exchange' });

  assert.deepEqual(compileAuthorizationAttacks(recaptured), { hypotheses: [], tasks: [] });
});

test('allows a new resource after a failed replay on the same route', () => {
  const initial = snapshot();
  const firstWave = compileAuthorizationAttacks(initial, 1);
  const recaptured = structuredClone(initial);
  recaptured.tasks = firstWave.tasks.map((task) => ({ ...task, status: 'failed' }));
  recaptured.exchanges.push(exchange('ex_new_victim_memo', 'victim', 'victim-record-new-7f3a'));
  recaptured.resources.push(resource('res_new_victim_memo', 'victim', 'victim-record-new-7f3a', 'ex_new_victim_memo'));

  const secondWave = compileAuthorizationAttacks(recaptured, 6);
  assert.ok(secondWave.tasks.some((task) => task.replayPlan.steps[0].sourceExchangeId === 'ex_new_victim_memo'));
});

test('does not infer a vertical privilege direction from opaque role labels', () => {
  const crossRole = snapshot();
  crossRole.identities[0].role = 'administrator';
  crossRole.identities[1].role = 'ordinary user';

  assert.deepEqual(compileAuthorizationAttacks(crossRole), { hypotheses: [], tasks: [] });
});

test('requires a successful peer control with an object reference absent from the victim baseline', () => {
  const deniedControl = snapshot();
  deniedControl.exchanges[1].responseStatus = 403;
  assert.deepEqual(compileAuthorizationAttacks(deniedControl), { hypotheses: [], tasks: [] });

  const staticRouteReference = snapshot();
  staticRouteReference.exchanges[0] = {
    ...exchange('ex_victim_memo', 'victim', 'alice-record-123'),
    path: '/api/profiles/alice-record-123',
    candidateObjectReferences: [],
  };
  staticRouteReference.exchanges[1] = {
    ...exchange('ex_attacker_memo', 'attacker', 'bob-record-456'),
    path: '/api/profiles/bob-record-456',
    candidateObjectReferences: [],
  };
  staticRouteReference.resources = [
    resource('res_victim_memo', 'victim', 'alice-record-123', 'ex_victim_memo'),
    resource('res_attacker_memo', 'attacker', 'profiles', 'ex_attacker_memo'),
  ];
  assert.deepEqual(compileAuthorizationAttacks(staticRouteReference), { hypotheses: [], tasks: [] });
});
