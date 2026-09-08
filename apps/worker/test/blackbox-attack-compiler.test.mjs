import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  compileAuthorizationAttacks,
  compileSelectedAuthorizationAttack,
} from '../dist/blackbox/attack-compiler.js';
import { accessValidationResolvedDigest } from '../dist/blackbox-observation/access-validation.js';

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

function rawJsonResponse(body, status = 200) {
  const reason = status === 403 ? 'Forbidden' : 'OK';
  return [`HTTP/1.1 ${status} ${reason}`, 'Content-Type: application/json', '', JSON.stringify(body)].join('\r\n');
}

function bindResponseFingerprints(input, rawResponses) {
  for (const candidate of input.exchanges) {
    candidate.responseFingerprint = `sha256:${createHash('sha256').update(rawResponses.get(candidate.exchangeId)).digest('hex')}`;
  }
}

function selected(input, overrides = {}) {
  const payload = {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: 'c'.repeat(64),
    sourceManifestSha256: 'd'.repeat(64),
    comparisonId: 'comparison-000002',
    routeSignature: 'route_memo_get',
    method: 'GET',
    origin: TARGET_ORIGIN,
    routePathPrefix: '/api/memos',
    requestClass: 'request-class-0001',
    recordedRole: 'ordinary user',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    ...overrides,
  };
  const resolved = { ...payload, selectionDigest: accessValidationResolvedDigest(payload) };
  input.runScope.validationSelectionDigest = resolved.selectionDigest;
  return resolved;
}

function selectedRaw(input, options = {}) {
  const victimMarker = options.victimMarker ?? 'victim-memo-4d2e';
  const attackerMarker = options.attackerMarker ?? 'peer-9b1c';
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse({ data: { ownerId: victimMarker, secret: 'victim-only' } })],
    ['ex_attacker_memo', rawJsonResponse({ data: { ownerId: attackerMarker, secret: 'attacker-only' } })],
  ]);
  input.exchanges.find(value => value.exchangeId === 'ex_attacker_memo').path = '/api/memos/victim-memo-4d2e';
  const rawRequests = new Map([
    [
      'ex_victim_memo',
      'GET /api/memos/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
    ],
    [
      'ex_attacker_memo',
      'GET /api/memos/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: attacker\r\n\r\n',
    ],
  ]);
  bindResponseFingerprints(input, rawResponses);
  return { rawRequests, rawResponses };
}

test('compiles only the selected fresh GET candidate with current raw proof', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);

  assert.equal(compileAuthorizationAttacks(input, 6, rawResponses, rawRequests).tasks.length, 0);

  const compiled = compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests);

  assert.equal(compiled.hypotheses.length, 1);
  assert.equal(compiled.tasks.length, 1);
  assert.equal(compiled.tasks[0].identityLease, 'attacker');
  assert.equal(compiled.tasks[0].replayPlan.steps.length, 1);
  assert.deepEqual(compiled.tasks[0].replayPlan.steps[0], {
    stepId: compiled.tasks[0].replayPlan.steps[0].stepId,
    sourceExchangeId: 'ex_victim_memo',
    actor: 'attacker',
    mutations: [],
  });
  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'json_pointer_equals',
    pointer: '/data/ownerId',
    value: 'victim-memo-4d2e',
  });
});

test('compiles fresh dynamic paths from the selected route without replaying the recorded path', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  input.exchanges[0].path = '/api/memos/current-victim-a17f';
  input.exchanges[0].candidateObjectReferences = ['current-victim-a17f'];
  input.exchanges[1].path = '/api/memos/current-attacker-c893';
  input.resources[0].objectReferences = ['current-victim-a17f'];
  rawRequests.set(
    'ex_victim_memo',
    'GET /api/memos/current-victim-a17f HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
  );
  rawRequests.set(
    'ex_attacker_memo',
    'GET /api/memos/current-attacker-c893 HTTP/1.1\r\nHost: target.example\r\nAuthorization: attacker\r\n\r\n',
  );
  rawResponses.set(
    'ex_victim_memo',
    rawJsonResponse({ data: { ownerId: 'current-victim-a17f', secret: 'victim-only' } }),
  );
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileSelectedAuthorizationAttack(
    input,
    selected(input),
    rawResponses,
    rawRequests,
  );

  assert.equal(compiled.tasks.length, 1);
  assert.equal(compiled.tasks[0].replayPlan.steps[0].sourceExchangeId, 'ex_victim_memo');
  assert.equal(compiled.tasks[0].replayPlan.proofCondition.value, 'current-victim-a17f');
});

test('selected compilation ignores newer same-signature traffic outside the selected path prefix', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  const unrelated = structuredClone(input.exchanges[0]);
  unrelated.exchangeId = 'ex_victim_unrelated';
  unrelated.captureSequence = 2;
  unrelated.path = '/api/admin/victim-memo-4d2e';
  unrelated.rawRecordRef = 'raw/ex_victim_unrelated.json';
  input.exchanges.push(unrelated);
  rawRequests.set(
    unrelated.exchangeId,
    'GET /api/admin/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
  );
  rawResponses.set(
    unrelated.exchangeId,
    rawJsonResponse({ data: { ownerId: 'victim-memo-4d2e', secret: 'unrelated' } }),
  );
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests);

  assert.equal(compiled.tasks.length, 1);
  assert.equal(compiled.tasks[0].replayPlan.steps[0].sourceExchangeId, 'ex_victim_memo');
});

test('selected compilation rejects same-signature traffic when no exchange is under the selected path prefix', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  input.exchanges[0].path = '/api/admin/victim-memo-4d2e';
  input.exchanges[1].path = '/api/admin/victim-memo-4d2e';
  rawRequests.set(
    'ex_victim_memo',
    'GET /api/admin/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
  );
  rawRequests.set(
    'ex_attacker_memo',
    'GET /api/admin/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: attacker\r\n\r\n',
  );

  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
});

test('filters the selected route before applying the generic candidate ceiling', () => {
  const input = snapshot();
  input.exchanges = [];
  input.resources = [];
  const rawRequests = new Map();
  const rawResponses = new Map();
  for (let index = 1; index <= 7; index += 1) {
    const suffix = String(index).padStart(2, '0');
    const victimReference = `victim-marker-${suffix}`;
    const attackerReference = `attacker-peer-${suffix}`;
    const victimExchange = exchange(`ex_victim_${suffix}`, 'victim', victimReference);
    const attackerExchange = exchange(`ex_attacker_${suffix}`, 'attacker', attackerReference);
    victimExchange.routeSignature = `route_selected_${suffix}`;
    attackerExchange.routeSignature = `route_selected_${suffix}`;
    victimExchange.path = `/api/selected/${suffix}`;
    attackerExchange.path = `/api/selected/${suffix}`;
    input.exchanges.push(victimExchange, attackerExchange);
    input.resources.push(
      resource(`res_victim_${suffix}`, 'victim', victimReference, victimExchange.exchangeId),
      resource(`res_attacker_${suffix}`, 'attacker', attackerReference, attackerExchange.exchangeId),
    );
    const victimResponse = rawJsonResponse({ data: { ownerId: victimReference } });
    const attackerResponse = rawJsonResponse({ data: { ownerId: attackerReference } });
    rawResponses.set(victimExchange.exchangeId, victimResponse);
    rawResponses.set(attackerExchange.exchangeId, attackerResponse);
    rawRequests.set(
      victimExchange.exchangeId,
      `GET /api/selected/${suffix} HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n`,
    );
    rawRequests.set(
      attackerExchange.exchangeId,
      `GET /api/selected/${suffix} HTTP/1.1\r\nHost: target.example\r\nAuthorization: attacker\r\n\r\n`,
    );
  }
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileSelectedAuthorizationAttack(
    input,
    selected(input, {
      routeSignature: 'route_selected_01',
      routePathPrefix: '/api/selected',
    }),
    rawResponses,
    rawRequests,
  );

  assert.equal(compiled.tasks.length, 1);
  assert.equal(compiled.tasks[0].replayPlan.steps[0].sourceExchangeId, 'ex_victim_01');
});

test('selected compilation rejects unsafe, stale, unrelated, and raw-incomplete candidates', async (t) => {
  const cases = [
    ['unsafe method', input => { input.exchanges.forEach(value => { value.method = 'POST'; }); }, { method: 'POST' }],
    ['unrelated route', () => {}, { routeSignature: 'route_other' }],
    ['unrelated origin', () => {}, { origin: 'https://other.example' }],
    ['missing victim', input => { input.identities = input.identities.filter(value => value.name !== 'victim'); }, {}],
    ['stale victim state', input => { input.identities.find(value => value.name === 'victim').stateRef = null; }, {}],
    ['unauthenticated attacker', input => { input.identities.find(value => value.name === 'attacker').authenticated = false; }, {}],
    ['changed attacker role', input => { input.identities.find(value => value.name === 'attacker').role = 'administrator'; }, {}],
    ['stale run scope', input => { input.runScope.targetOrigin = 'https://other.example'; }, {}],
    ['changed selection scope', input => { input.runScope.validationSelectionDigest = 'e'.repeat(64); }, {}],
  ];

  for (const [name, mutate, overrides] of cases) {
    await t.test(name, () => {
      const input = snapshot();
      const { rawRequests, rawResponses } = selectedRaw(input);
      const selection = selected(input, overrides);
      mutate(input);
      assert.deepEqual(
        compileSelectedAuthorizationAttack(input, selection, rawResponses, rawRequests),
        { hypotheses: [], tasks: [] },
      );
    });
  }

  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  rawRequests.delete('ex_victim_memo');
  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
  rawRequests.set(
    'ex_victim_memo',
    'GET /api/memos/victim-memo-4d2e HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
  );
  rawResponses.delete('ex_attacker_memo');
  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
});

test('selected compilation rejects proof that also passes in the fresh peer control', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input, { attackerMarker: 'victim-memo-4d2e' });
  input.exchanges[1].candidateObjectReferences = ['peer-9b1c'];

  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
});

test('selected compilation emits the victim replay when the fresh attacker control is denied', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  input.exchanges[1].responseStatus = 403;
  input.resources = input.resources.filter(({ ownerIdentity }) => ownerIdentity === 'victim');
  rawResponses.set('ex_attacker_memo', rawJsonResponse({ error: 'forbidden' }, 403));
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests);

  assert.equal(compiled.tasks.length, 1);
  assert.equal(compiled.tasks[0].identityLease, 'attacker');
  assert.equal(compiled.tasks[0].replayPlan.steps[0].sourceExchangeId, 'ex_victim_memo');
  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'json_pointer_equals',
    pointer: '/data/ownerId',
    value: 'victim-memo-4d2e',
  });
});

for (const responseStatus of [302, 503]) {
  test(`selected compilation rejects an attacker control with status ${responseStatus}`, () => {
    const input = snapshot();
    const { rawRequests, rawResponses } = selectedRaw(input);
    input.exchanges[1].responseStatus = responseStatus;
    rawResponses.set('ex_attacker_memo', rawJsonResponse({ error: 'unusable control' }, responseStatus));
    bindResponseFingerprints(input, rawResponses);

    assert.deepEqual(
      compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
      { hypotheses: [], tasks: [] },
    );
  });
}

test('selected compilation never falls back to an older exchange when the latest raw record is missing', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  const latestVictim = structuredClone(input.exchanges[0]);
  latestVictim.exchangeId = 'ex_victim_latest';
  latestVictim.captureSequence = 2;
  latestVictim.rawRecordRef = 'raw/ex_victim_latest.json';
  input.exchanges.push(latestVictim);
  input.resources[0].evidence.push({ id: latestVictim.exchangeId, kind: 'exchange' });

  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
});

test('selected compilation rejects tampered selectors and untrusted raw records', async (t) => {
  await t.test('selector field changed after digest binding', () => {
    const input = snapshot();
    const { rawRequests, rawResponses } = selectedRaw(input);
    const selection = selected(input);
    selection.requestClass = 'request-class-0002';
    assert.deepEqual(
      compileSelectedAuthorizationAttack(input, selection, rawResponses, rawRequests),
      { hypotheses: [], tasks: [] },
    );
  });

  await t.test('raw request declares another origin', () => {
    const input = snapshot();
    const { rawRequests, rawResponses } = selectedRaw(input);
    rawRequests.set(
      'ex_victim_memo',
      'GET /api/memos/victim-memo-4d2e HTTP/1.1\r\nHost: other.example\r\nAuthorization: victim\r\n\r\n',
    );
    assert.deepEqual(
      compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
      { hypotheses: [], tasks: [] },
    );
  });

  await t.test('raw request target disagrees with its fresh exchange', () => {
    const input = snapshot();
    const { rawRequests, rawResponses } = selectedRaw(input);
    rawRequests.set(
      'ex_victim_memo',
      'GET /api/memos/different-current-object HTTP/1.1\r\nHost: target.example\r\nAuthorization: victim\r\n\r\n',
    );
    assert.deepEqual(
      compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
      { hypotheses: [], tasks: [] },
    );
  });

  await t.test('raw control response is truncated', () => {
    const input = snapshot();
    const { rawRequests, rawResponses } = selectedRaw(input);
    input.exchanges[1].responseStatus = 403;
    input.resources = input.resources.filter(({ ownerIdentity }) => ownerIdentity === 'victim');
    rawResponses.set('ex_attacker_memo', `${rawJsonResponse({ error: 'forbidden' }, 403)}... (truncated)`);
    bindResponseFingerprints(input, rawResponses);
    assert.deepEqual(
      compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
      { hypotheses: [], tasks: [] },
    );
  });
});

test('selected compilation refuses a selected route after unknown delivery', () => {
  const input = snapshot();
  const { rawRequests, rawResponses } = selectedRaw(input);
  const historicalSource = structuredClone(input.exchanges[0]);
  historicalSource.exchangeId = 'ex_victim_historical';
  historicalSource.path = '/api/memos/historical-victim-001';
  historicalSource.rawRecordRef = 'raw/ex_victim_historical.json';
  input.exchanges[0].captureSequence = 2;
  input.exchanges.push(historicalSource);
  input.actions.push({
    actionId: 'prior-uncertain-action',
    hypothesisId: 'prior-hypothesis',
    sequence: {
      actionId: 'prior-uncertain-action',
      steps: [{
        stepId: 'prior-step',
        sourceExchangeId: 'ex_victim_historical',
        actor: 'attacker',
        mutations: [],
      }],
      proofCondition: { type: 'body_contains', marker: 'prior-marker' },
    },
    status: 'delivery_unknown',
    exchangeIds: [],
    observation: null,
    provenance: { actor: 'blackbox-action', taskId: 'prior-uncertain-action', baseRevision: 6 },
  });

  assert.deepEqual(
    compileSelectedAuthorizationAttack(input, selected(input), rawResponses, rawRequests),
    { hypotheses: [], tasks: [] },
  );
});

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

test('derives a discriminating JSON proof when a short object reference appears in generic control text', () => {
  const input = snapshot();
  input.exchanges[0] = exchange('ex_victim_memo', 'victim', '3');
  input.exchanges[1] = exchange('ex_attacker_memo', 'attacker', '2');
  input.resources[0] = resource('res_victim_memo', 'victim', '3', 'ex_victim_memo');
  input.resources[1] = resource('res_attacker_memo', 'attacker', '2', 'ex_attacker_memo');
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse({ status: 'success', data: { id: 3, UserId: 3 } })],
    ['ex_attacker_memo', rawJsonResponse({ status: 'success', data: { id: 2, UserId: 2, noise: '3' } })],
  ]);
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'json_pointer_equals',
    pointer: '/data/UserId',
    value: 3,
  });
});

test('does not compile an authorization replay whose only exact proof is a bare object selector', () => {
  const input = snapshot();
  input.exchanges[0] = exchange('ex_victim_memo', 'victim', '3');
  input.exchanges[1] = exchange('ex_attacker_memo', 'attacker', '2');
  input.resources[0] = resource('res_victim_memo', 'victim', '3', 'ex_victim_memo');
  input.resources[1] = resource('res_attacker_memo', 'attacker', '2', 'ex_attacker_memo');
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse({ data: { id: 3 } })],
    ['ex_attacker_memo', rawJsonResponse({ data: { id: 2 } })],
  ]);
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled, { hypotheses: [], tasks: [] });
});

test('retains the grounded fallback for a scalar JSON root', () => {
  const input = snapshot();
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse('victim-memo-4d2e')],
    ['ex_attacker_memo', rawJsonResponse('peer-9b1c')],
  ]);
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'body_contains',
    marker: 'victim-memo-4d2e',
  });
});

test('selects an escaped reference pointer and ignores forbidden object paths', () => {
  const input = snapshot();
  const rawResponses = new Map([
    [
      'ex_victim_memo',
      rawJsonResponse({
        constructor: { id: 'victim-memo-4d2e' },
        session: { id: 'victim-memo-4d2e' },
        data: { 'record~/ID': 'victim-memo-4d2e' },
      }),
    ],
    [
      'ex_attacker_memo',
      rawJsonResponse({
        constructor: { id: 'peer-9b1c' },
        session: { id: 'peer-9b1c' },
        data: { 'record~/ID': 'peer-9b1c' },
      }),
    ],
  ]);
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'json_pointer_equals',
    pointer: '/data/record~0~1ID',
    value: 'victim-memo-4d2e',
  });
});

test('does not derive structured proof from raw evidence with a mismatched fingerprint', () => {
  const input = snapshot();
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse({ id: 'victim-memo-4d2e' })],
    ['ex_attacker_memo', rawJsonResponse({ id: 'peer-9b1c' })],
  ]);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'body_contains',
    marker: 'victim-memo-4d2e',
  });
});

test('retains the fallback when another readable control has the victim value at the selected pointer', () => {
  const input = snapshot();
  input.identities.push({
    name: 'observer',
    role: 'ordinary user',
    authenticated: true,
    stateRef: 'state/observer.json',
  });
  input.exchanges.push(exchange('ex_observer_memo', 'observer', 'observer-7c3d'));
  const rawResponses = new Map([
    ['ex_victim_memo', rawJsonResponse({ id: 'victim-memo-4d2e' })],
    ['ex_attacker_memo', rawJsonResponse({ id: 'peer-9b1c' })],
    ['ex_observer_memo', rawJsonResponse({ id: 'victim-memo-4d2e' })],
  ]);
  bindResponseFingerprints(input, rawResponses);

  const compiled = compileAuthorizationAttacks(input, 1, rawResponses);

  assert.deepEqual(compiled.tasks[0].replayPlan.proofCondition, {
    type: 'body_contains',
    marker: 'victim-memo-4d2e',
  });
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
