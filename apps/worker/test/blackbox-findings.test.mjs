import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import {
  collectVerifiedFindings,
  hasValidBlackboxControlEvidence,
} from '../dist/blackbox/finding-validator.js';

const TARGET_ORIGIN = 'https://target.example';
const MARKER = 'victim-private-record-7';
const MARKER_DIGEST = createHash('sha256').update(MARKER).digest('hex');

function exchange(exchangeId, identity, provenance, overrides = {}) {
  return {
    exchangeId,
    routeSignature: 'route_object_7',
    identity,
    captureSequence: 1,
    method: 'GET',
    origin: TARGET_ORIGIN,
    path: '/api/objects/7',
    queryKeys: ['view'],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: `sha256:${exchangeId}`,
    candidateObjectReferences: ['7'],
    rawRecordRef: `raw/${exchangeId}.json`,
    provenance,
    ...overrides,
  };
}

function validSnapshot() {
  const actionPlan = {
    steps: [{
      stepId: 'read-as-attacker',
      sourceExchangeId: 'ex-baseline',
      actor: 'attacker',
      mutations: [{ type: 'set_query', name: 'view', value: 'private' }],
    }],
    proofCondition: { type: 'body_contains', marker: MARKER },
  };
  const actionObservation = {
    condition: actionPlan.proofCondition,
    passed: true,
    baselineExchangeId: 'ex-baseline',
    baselinePassed: true,
    controlExchangeIds: ['ex-control'],
    controlPassed: false,
    proofSourceRequestDigest: 'a'.repeat(64),
    proofSentRequestDigest: 'a'.repeat(64),
    observedMarkerDigest: MARKER_DIGEST,
    observedTransitionId: null,
    verificationExchangeId: 'ex-action',
  };
  const candidate = {
    candidateId: 'candidate-1',
    hypothesisId: 'hypothesis-1',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    victimResourceId: 'resource-1',
    baselineExchangeId: 'ex-baseline',
    actionId: 'action-1',
    verificationSourceExchangeId: 'ex-action',
    demonstratedAction: 'read a victim-owned private record',
    concreteEffect: "loss of confidentiality for the victim's private record",
    affectedParty: 'users',
    preconditions: ['an ordinary account and the victim object identifier'],
    provenance: { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 },
  };
  return {
    schemaVersion: 1,
    revision: 7,
    targetOrigin: TARGET_ORIGIN,
    identities: [
      { name: 'attacker', role: 'ordinary user', authenticated: true, stateRef: 'capture/attacker.json' },
      { name: 'victim', role: 'ordinary user', authenticated: true, stateRef: 'capture/victim.json' },
    ],
    exchanges: [
      exchange('ex-baseline', 'victim', { actor: 'blackbox-recon', taskId: 'recon-victim', baseRevision: 1 }),
      exchange('ex-action', 'attacker', { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 }, {
        captureSequence: 2,
        responseFingerprint: 'sha256:private-record',
      }),
      exchange('ex-verify', 'attacker', { actor: 'blackbox-verifier', taskId: 'verification-1', baseRevision: 6 }, {
        captureSequence: 3,
        responseFingerprint: 'sha256:private-record',
      }),
      exchange('ex-control', 'attacker', { actor: 'blackbox-recon', taskId: 'recon-attacker', baseRevision: 1 }, {
        candidateObjectReferences: ['8'],
      }),
    ],
    resources: [{
      resourceId: 'resource-1',
      resourceType: 'private record',
      objectReferences: ['7'],
      ownerIdentity: 'victim',
      visibility: 'private',
      evidence: [{ id: 'ex-baseline', kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'recon-victim', baseRevision: 1 },
    }, {
      resourceId: 'resource-peer',
      resourceType: 'private record',
      objectReferences: ['8'],
      ownerIdentity: 'attacker',
      visibility: 'private',
      evidence: [{ id: 'ex-control', kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'recon-attacker', baseRevision: 1 },
    }],
    transitions: [],
    hypotheses: [{
      hypothesisId: 'hypothesis-1',
      kind: 'horizontal',
      summary: 'Another user may read the victim record',
      preconditions: ['two ordinary accounts'],
      attackerCapability: 'read a victim-owned record',
      evidence: [{ id: 'resource-1', kind: 'resource' }],
      priority: 'high',
      status: 'verified',
      provenance: { actor: 'blackbox-analysis', taskId: 'analysis-1', baseRevision: 3 },
    }],
    actions: [{
      actionId: 'action-1',
      hypothesisId: 'hypothesis-1',
      sequence: { actionId: 'action-1', ...actionPlan },
      status: 'completed',
      exchangeIds: ['ex-action'],
      observation: actionObservation,
      provenance: { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 },
    }],
    candidateProofs: [candidate],
    verifications: [{
      verificationId: 'verification-1',
      candidateId: 'candidate-1',
      verdict: 'verified',
      freshStateRefs: [{
        identity: 'attacker',
        stateRef: '.shannon/blackbox/verification-runs/verification-1/.shannon/blackbox/identities/attacker/storage-state.json',
      }],
      replayActionIds: ['action-1'],
      replayExchangeIds: ['ex-verify'],
      observation: { ...actionObservation, verificationExchangeId: 'ex-verify' },
      failureReason: null,
      demonstratedAction: candidate.demonstratedAction,
      concreteEffect: candidate.concreteEffect,
      affectedParty: candidate.affectedParty,
    }],
    tasks: [{
      taskId: 'action-1',
      kind: 'action',
      objective: 'Test cross-user record access',
      evidence: [{ id: 'ex-baseline', kind: 'exchange' }],
      identityLease: 'attacker',
      hypothesisId: 'hypothesis-1',
      status: 'completed',
      replayPlan: actionPlan,
    }],
    rejectedTasks: [],
    runStatus: 'running',
    operationReceipts: [],
  };
}

test('accepts only the cross-bound action and independent replay as a finding', () => {
  const findings = collectVerifiedFindings(validSnapshot(), TARGET_ORIGIN);

  assert.equal(findings.length, 1);
  assert.match(findings[0].findingId, /^finding_[a-f0-9]{24}$/);
  assert.deepEqual(findings[0], {
    findingId: findings[0].findingId,
    hypothesisId: 'hypothesis-1',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    baselineExchangeId: 'ex-baseline',
    attackExchangeIds: ['ex-action'],
    verificationExchangeIds: ['ex-verify'],
    replaySequence: validSnapshot().actions[0].sequence,
    demonstratedAction: 'read a victim-owned private record',
    concreteEffect: "loss of confidentiality for the victim's private record",
    affectedParty: 'users',
    impactStatement: "As an attacker, I could read a victim-owned private record, causing loss of confidentiality for the victim's private record to users.",
    preconditions: ['an ordinary account and the victim object identifier'],
    verifierResultId: 'verification-1',
  });
});

test('accepts an anonymous attacker without inventing a fresh authenticated state', () => {
  const snapshot = validSnapshot();
  snapshot.candidateProofs[0].attackerIdentity = 'anonymous';
  snapshot.actions[0].sequence.steps[0].actor = 'anonymous';
  snapshot.tasks[0].replayPlan.steps[0].actor = 'anonymous';
  snapshot.tasks[0].identityLease = null;
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action').identity = 'anonymous';
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-verify').identity = 'anonymous';
  snapshot.verifications[0].freshStateRefs = [];

  const findings = collectVerifiedFindings(snapshot, TARGET_ORIGIN);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].attackerIdentity, 'anonymous');
});

test('accepts independently worded verifier impact instead of requiring claimant prose', () => {
  const snapshot = validSnapshot();
  snapshot.verifications[0].demonstratedAction = 'retrieve the private object through another account';
  snapshot.verifications[0].concreteEffect = 'loss of confidentiality for victim-owned content';

  const findings = collectVerifiedFindings(snapshot, TARGET_ORIGIN);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].demonstratedAction, snapshot.verifications[0].demonstratedAction);
  assert.equal(findings[0].concreteEffect, snapshot.verifications[0].concreteEffect);
});

test('accepts a victim-owned slug resource without relying on identifier-shape extraction', () => {
  const snapshot = validSnapshot();
  snapshot.resources[0].objectReferences = ['alice'];
  for (const exchange of snapshot.exchanges) {
    exchange.path = '/api/profiles/alice';
    exchange.candidateObjectReferences = [];
  }
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-control').path = '/api/profiles/bob';
  snapshot.resources.find(({ resourceId }) => resourceId === 'resource-peer').objectReferences = ['bob'];
  snapshot.actions[0].sequence.steps[0].mutations = [{ type: 'set_path', path: '/api/profiles/alice' }];
  snapshot.tasks[0].replayPlan.steps[0].mutations = [{ type: 'set_path', path: '/api/profiles/alice' }];

  assert.equal(collectVerifiedFindings(snapshot, TARGET_ORIGIN).length, 1);
});

test('rejects a peer slug that is not grounded in its control exchange', () => {
  const snapshot = validSnapshot();
  snapshot.resources[0].objectReferences = ['alice'];
  snapshot.resources.find(({ resourceId }) => resourceId === 'resource-peer').objectReferences = ['bob'];
  for (const exchange of snapshot.exchanges) {
    exchange.path = '/api/profiles/alice';
    exchange.candidateObjectReferences = [];
  }

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('rejects a static route segment presented as a peer object reference', () => {
  const snapshot = validSnapshot();
  snapshot.resources[0].objectReferences = ['alice'];
  snapshot.resources.find(({ resourceId }) => resourceId === 'resource-peer').objectReferences = ['profiles'];
  for (const exchange of snapshot.exchanges) {
    exchange.path = '/api/profiles/alice';
    exchange.candidateObjectReferences = [];
  }

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('rejects a denied horizontal peer control', () => {
  const snapshot = validSnapshot();
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-control').responseStatus = 403;

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('requires a peer control for same-role private access even when the hypothesis is mislabeled', () => {
  const snapshot = validSnapshot();
  snapshot.hypotheses[0].kind = 'workflow';
  snapshot.resources[0].visibility = 'role-scoped';
  snapshot.resources = snapshot.resources.filter(({ resourceId }) => resourceId !== 'resource-peer');

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('rejects a common 200 denial marker when nonpersistent controls are empty', () => {
  const snapshot = validSnapshot();
  const condition = { type: 'body_contains', marker: 'Access denied' };
  const digest = createHash('sha256').update(condition.marker).digest('hex');
  snapshot.actions[0].sequence.proofCondition = condition;
  snapshot.tasks[0].replayPlan.proofCondition = condition;
  for (const observation of [snapshot.actions[0].observation, snapshot.verifications[0].observation]) {
    observation.condition = condition;
    observation.observedMarkerDigest = digest;
    observation.controlExchangeIds = [];
    observation.controlPassed = false;
  }
  for (const exchange of snapshot.exchanges.filter(({ exchangeId }) => exchangeId !== 'ex-baseline')) {
    exchange.responseFingerprint = 'sha256:access-denied';
  }

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('accepts a vertical negative control without requiring horizontal peer ownership', () => {
  const snapshot = validSnapshot();
  snapshot.hypotheses[0].kind = 'vertical';
  snapshot.identities.find(({ name }) => name === 'victim').role = 'administrator';
  snapshot.resources[0].visibility = 'role-scoped';
  snapshot.resources = snapshot.resources.filter(({ resourceId }) => resourceId !== 'resource-peer');
  const control = snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-control');
  control.responseStatus = 403;
  control.candidateObjectReferences = [];
  for (const observation of [snapshot.actions[0].observation, snapshot.verifications[0].observation]) {
    observation.controlExchangeIds = ['ex-control'];
    observation.controlPassed = false;
  }

  assert.equal(
    hasValidBlackboxControlEvidence(snapshot, snapshot.candidateProofs[0], snapshot.actions[0], TARGET_ORIGIN),
    true,
  );
  assert.equal(collectVerifiedFindings(snapshot, TARGET_ORIGIN).length, 1);

  snapshot.actions[0].observation.controlExchangeIds = [];
  snapshot.verifications[0].observation.controlExchangeIds = [];
  assert.equal(
    hasValidBlackboxControlEvidence(snapshot, snapshot.candidateProofs[0], snapshot.actions[0], TARGET_ORIGIN),
    false,
  );
  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('accepts an anonymous-to-role vertical control without requiring an impossible peer owner', () => {
  const snapshot = validSnapshot();
  snapshot.candidateProofs[0].attackerIdentity = 'anonymous';
  snapshot.identities.find(({ name }) => name === 'victim').role = 'administrator';
  snapshot.resources[0].visibility = 'role-scoped';
  snapshot.resources = snapshot.resources.filter(({ resourceId }) => resourceId !== 'resource-peer');
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-control').responseStatus = 403;

  assert.equal(
    hasValidBlackboxControlEvidence(snapshot, snapshot.candidateProofs[0], snapshot.actions[0], TARGET_ORIGIN),
    true,
  );
});

test('accepts horizontal controls with a differing leaf reference under shared context', () => {
  const snapshot = validSnapshot();
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-baseline').candidateObjectReferences = ['tenant-1', 'record-7'];
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-control').candidateObjectReferences = ['tenant-1', 'record-8'];
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action').candidateObjectReferences = ['tenant-1', 'record-7'];
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-verify').candidateObjectReferences = ['tenant-1', 'record-7'];
  snapshot.resources.find(({ resourceId }) => resourceId === 'resource-1').objectReferences = ['tenant-1', 'record-7'];
  snapshot.resources.find(({ resourceId }) => resourceId === 'resource-peer').objectReferences = ['tenant-1', 'record-8'];

  assert.equal(collectVerifiedFindings(snapshot, TARGET_ORIGIN).length, 1);
});

test('rejects a nonpersistent control exchange without a peer resource', () => {
  const snapshot = validSnapshot();
  snapshot.resources = snapshot.resources.filter(({ resourceId }) => resourceId !== 'resource-peer');
  for (const observation of [snapshot.actions[0].observation, snapshot.verifications[0].observation]) {
    observation.controlExchangeIds = ['ex-control'];
    observation.controlPassed = false;
  }

  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('accepts a nonpersistent control exchange backed by a distinct peer resource', () => {
  const snapshot = validSnapshot();
  assert.equal(
    hasValidBlackboxControlEvidence(snapshot, snapshot.candidateProofs[0], snapshot.actions[0], TARGET_ORIGIN),
    true,
  );
  assert.equal(collectVerifiedFindings(snapshot, TARGET_ORIGIN).length, 1);
});

function persistentSnapshot() {
  const snapshot = validSnapshot();
  const condition = { type: 'persistent_state', verificationSourceExchangeId: 'ex-baseline', marker: MARKER };
  snapshot.actions[0].sequence.proofCondition = condition;
  snapshot.tasks[0].replayPlan.proofCondition = condition;
  snapshot.actions[0].exchangeIds = ['ex-action-precheck', 'ex-action', 'ex-action-check'];
  snapshot.actions[0].observation = {
    condition,
    passed: true,
    baselineExchangeId: 'ex-action-precheck',
    baselinePassed: false,
    controlExchangeIds: [],
    controlPassed: false,
    proofSourceRequestDigest: 'a'.repeat(64),
    proofSentRequestDigest: 'a'.repeat(64),
    observedMarkerDigest: MARKER_DIGEST,
    observedTransitionId: null,
    verificationExchangeId: 'ex-action-check',
  };
  snapshot.candidateProofs[0].verificationSourceExchangeId = 'ex-action-check';
  snapshot.exchanges.push(
    exchange(
      'ex-action-precheck',
      'victim',
      { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 },
      { captureSequence: 2, responseFingerprint: 'sha256:state-absent' },
    ),
    exchange(
      'ex-action-check',
      'victim',
      { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 },
      { captureSequence: 2, responseFingerprint: 'sha256:changed-state' },
    ),
    exchange(
      'ex-verify-precheck',
      'victim',
      { actor: 'blackbox-verifier', taskId: 'verification-1', baseRevision: 6 },
      { captureSequence: 3, responseFingerprint: 'sha256:state-absent' },
    ),
    exchange(
      'ex-verify-check',
      'victim',
      { actor: 'blackbox-verifier', taskId: 'verification-1', baseRevision: 6 },
      { captureSequence: 3, responseFingerprint: 'sha256:changed-state' },
    ),
  );
  snapshot.verifications[0].replayExchangeIds = ['ex-verify-precheck', 'ex-verify', 'ex-verify-check'];
  snapshot.verifications[0].observation = {
    ...snapshot.actions[0].observation,
    baselineExchangeId: 'ex-verify-precheck',
    verificationExchangeId: 'ex-verify-check',
  };
  snapshot.verifications[0].freshStateRefs.push({
    identity: 'victim',
    stateRef: '.shannon/blackbox/verification-runs/verification-1/.shannon/blackbox/identities/victim/storage-state.json',
  });
  snapshot.resources[0].objectReferences = [];
  for (const exchange of snapshot.exchanges) exchange.candidateObjectReferences = [];
  snapshot.transitions = [{
    transitionId: 'transition-victim-state',
    identity: 'victim',
    fromState: 'disabled',
    toState: 'enabled',
    triggerExchangeId: 'ex-baseline',
    captureSequence: 1,
    resourceId: 'resource-1',
    provenance: { actor: 'blackbox-recon', taskId: 'recon-victim', baseRevision: 1 },
  }];

  return snapshot;
}

test('accepts a replayed persistent-state marker only when the victim baseline fails first', () => {
  const snapshot = persistentSnapshot();
  assert.deepEqual(snapshot.actions[0].observation.controlExchangeIds, []);
  assert.deepEqual(snapshot.verifications[0].observation.controlExchangeIds, []);
  assert.equal(
    hasValidBlackboxControlEvidence(snapshot, snapshot.candidateProofs[0], snapshot.actions[0], TARGET_ORIGIN),
    true,
  );
  assert.equal(collectVerifiedFindings(snapshot, TARGET_ORIGIN).length, 1);
  snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action-check').responseFingerprint =
    snapshot.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action-precheck').responseFingerprint;
  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

test('rejects persistent-state evidence when any explicit action runs as the victim', () => {
  const snapshot = persistentSnapshot();
  const victimStep = {
    stepId: 'change-as-victim',
    sourceExchangeId: 'ex-baseline',
    actor: 'victim',
    mutations: [{ type: 'set_query', name: 'enabled', value: 'true' }],
  };
  snapshot.actions[0].sequence.steps.unshift(victimStep);
  snapshot.actions[0].exchangeIds = ['ex-action-precheck', 'ex-action-victim', 'ex-action', 'ex-action-check'];
  snapshot.verifications[0].replayExchangeIds = [
    'ex-verify-precheck',
    'ex-verify-victim',
    'ex-verify',
    'ex-verify-check',
  ];
  snapshot.exchanges.push(
    exchange('ex-action-victim', 'victim', { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 }),
    exchange('ex-verify-victim', 'victim', { actor: 'blackbox-verifier', taskId: 'verification-1', baseRevision: 6 }),
  );

  const attackerOnly = structuredClone(snapshot);
  attackerOnly.actions[0].sequence.steps[0].actor = 'attacker';
  attackerOnly.tasks[0].replayPlan.steps[0].actor = 'attacker';
  attackerOnly.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action-victim').identity = 'attacker';
  attackerOnly.exchanges.find(({ exchangeId }) => exchangeId === 'ex-verify-victim').identity = 'attacker';
  assert.equal(collectVerifiedFindings(attackerOnly, TARGET_ORIGIN).length, 1);
  assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
});

const invalidCases = [
  ['duplicate candidate identifier', (s) => { s.candidateProofs.push(structuredClone(s.candidateProofs[0])); }],
  ['same attacker and victim', (s) => { s.candidateProofs[0].attackerIdentity = 'victim'; }],
  ['public resource', (s) => { s.resources[0].visibility = 'public'; }],
  ['unowned resource', (s) => { s.resources[0].ownerIdentity = null; }],
  ['resource not backed by the victim baseline', (s) => { s.resources[0].evidence = []; }],
  ['resource and baseline object mismatch', (s) => { s.resources[0].objectReferences = ['99']; }],
  ['baseline captured as the attacker', (s) => { s.exchanges[0].identity = 'attacker'; }],
  ['baseline not captured by recon', (s) => { s.exchanges[0].provenance.actor = 'blackbox-action'; }],
  ['baseline not replayed by the attacker', (s) => { s.actions[0].sequence.steps[0].sourceExchangeId = 'ex-action'; }],
  ['proof request retargeted away from the victim baseline', (s) => {
    s.actions[0].sequence.steps[0].mutations = [{ type: 'set_path', path: '/api/profiles/bob' }];
    s.tasks[0].replayPlan.steps[0].mutations = [{ type: 'set_path', path: '/api/profiles/bob' }];
    s.actions[0].observation.proofSentRequestDigest = 'b'.repeat(64);
    s.verifications[0].observation.proofSentRequestDigest = 'b'.repeat(64);
  }],
  ['failed delivery', (s) => { s.actions[0].status = 'delivery_unknown'; }],
  ['denial-page marker', (s) => {
    const condition = { type: 'body_contains', marker: 'Access denied' };
    const digest = createHash('sha256').update(condition.marker).digest('hex');
    s.actions[0].sequence.proofCondition = condition;
    s.tasks[0].replayPlan.proofCondition = condition;
    for (const observation of [s.actions[0].observation, s.verifications[0].observation]) {
      observation.condition = condition;
      observation.baselinePassed = false;
      observation.observedMarkerDigest = digest;
    }
    s.exchanges.find(({ exchangeId }) => exchangeId === 'ex-action').responseStatus = 403;
    s.exchanges.find(({ exchangeId }) => exchangeId === 'ex-verify').responseStatus = 403;
    s.candidateProofs[0].concreteEffect = 'sensitive information disclosure';
    s.verifications[0].concreteEffect = 'sensitive information disclosure';
  }],
  ['nondiscriminating cross-identity marker', (s) => {
    const control = exchange(
      'ex-control',
      'attacker',
      { actor: 'blackbox-recon', taskId: 'recon-attacker', baseRevision: 1 },
      { candidateObjectReferences: ['8'] },
    );
    s.exchanges.push(control);
    for (const observation of [s.actions[0].observation, s.verifications[0].observation]) {
      observation.controlExchangeIds = ['ex-control'];
      observation.controlPassed = true;
    }
  }],
  ['proof observed only as the victim', (s) => {
    const victimStep = {
      stepId: 'read-as-victim',
      sourceExchangeId: 'ex-baseline',
      actor: 'victim',
      mutations: [{ type: 'set_query', name: 'proof', value: 'victim' }],
    };
    const steps = [...s.actions[0].sequence.steps, victimStep];
    s.actions[0].sequence.steps = steps;
    s.tasks[0].replayPlan.steps = structuredClone(steps);
    s.actions[0].exchangeIds = ['ex-action', 'ex-action-victim'];
    s.actions[0].observation.verificationExchangeId = 'ex-action-victim';
    s.candidateProofs[0].verificationSourceExchangeId = 'ex-action-victim';
    s.verifications[0].replayExchangeIds = ['ex-verify', 'ex-verify-victim'];
    s.verifications[0].observation.verificationExchangeId = 'ex-verify-victim';
    s.verifications[0].freshStateRefs.push({
      identity: 'victim',
      stateRef: '.shannon/blackbox/verification-runs/verification-1/.shannon/blackbox/identities/victim/storage-state.json',
    });
    s.exchanges.push(
      exchange('ex-action-victim', 'victim', { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 5 }),
      exchange('ex-verify-victim', 'victim', { actor: 'blackbox-verifier', taskId: 'verification-1', baseRevision: 6 }),
    );
  }],
  ['status-only action evidence', (s) => { s.actions[0].observation.observedMarkerDigest = null; }],
  ['action proof exchange not linked', (s) => { s.actions[0].observation.verificationExchangeId = 'ex-baseline'; }],
  ['forged action exchange provenance', (s) => { s.exchanges[1].provenance.taskId = 'other-action'; }],
  ['missing verifier', (s) => { s.verifications = []; }],
  ['blocked verifier', (s) => { s.verifications[0].verdict = 'blocked'; }],
  ['verifier failure reason', (s) => { s.verifications[0].failureReason = 'replay was uncertain'; }],
  ['mismatched verification digest', (s) => { s.verifications[0].observation.observedMarkerDigest = '0'.repeat(64); }],
  ['verification reuses action evidence', (s) => {
    s.verifications[0].replayExchangeIds = ['ex-action'];
    s.verifications[0].observation.verificationExchangeId = 'ex-action';
  }],
  ['forged verification provenance', (s) => { s.exchanges[2].provenance.taskId = 'other-verifier'; }],
  ['capture state reused for verification', (s) => { s.verifications[0].freshStateRefs[0].stateRef = 'capture/attacker.json'; }],
  ['out-of-origin evidence', (s) => { s.exchanges[2].origin = 'https://redirect.example'; }],
  ['candidate and verifier affected parties disagree', (s) => { s.verifications[0].affectedParty = 'application'; }],
  ['speculative impact', (s) => { s.candidateProofs[0].concreteEffect = 'might expose a record'; s.verifications[0].concreteEffect = 'might expose a record'; }],
  ['generic information-only claim', (s) => { s.candidateProofs[0].concreteEffect = 'information was exposed'; s.verifications[0].concreteEffect = 'information was exposed'; }],
  ['generic noun-form disclosure claim', (s) => { s.candidateProofs[0].concreteEffect = 'disclosure of information'; s.verifications[0].concreteEffect = 'disclosure of information'; }],
  ['generic sensitive-data claim', (s) => { s.candidateProofs[0].concreteEffect = 'sensitive data exposure'; s.verifications[0].concreteEffect = 'sensitive data exposure'; }],
  ['generic leakage claim', (s) => { s.candidateProofs[0].concreteEffect = 'information leakage'; s.verifications[0].concreteEffect = 'information leakage'; }],
  ['authentication material in impact', (s) => { s.candidateProofs[0].demonstratedAction = 'use Authorization: Bearer secret'; s.verifications[0].demonstratedAction = 'use Authorization: Bearer secret'; }],
];

test('rejects structurally invalid or impact-free candidates', async (t) => {
  for (const [name, mutate] of invalidCases) {
    await t.test(name, () => {
      const snapshot = validSnapshot();
      mutate(snapshot);
      assert.deepEqual(collectVerifiedFindings(snapshot, TARGET_ORIGIN), []);
    });
  }
});

test('sorts accepted findings by stable finding ID', () => {
  const snapshot = validSnapshot();
  const second = structuredClone(snapshot.candidateProofs[0]);
  second.candidateId = 'candidate-2';
  const secondVerification = structuredClone(snapshot.verifications[0]);
  secondVerification.verificationId = 'verification-2';
  secondVerification.candidateId = 'candidate-2';
  secondVerification.freshStateRefs[0].stateRef = '.shannon/blackbox/verification-runs/verification-2/.shannon/blackbox/identities/attacker/storage-state.json';
  secondVerification.replayExchangeIds = ['ex-verify-2'];
  secondVerification.observation.verificationExchangeId = 'ex-verify-2';
  snapshot.exchanges.push(exchange(
    'ex-verify-2',
    'attacker',
    { actor: 'blackbox-verifier', taskId: 'verification-2', baseRevision: 7 },
    { captureSequence: 4 },
  ));
  snapshot.candidateProofs.unshift(second);
  snapshot.verifications.unshift(secondVerification);

  const findings = collectVerifiedFindings(snapshot, TARGET_ORIGIN);
  assert.equal(findings.length, 2);
  assert.deepEqual(findings.map(({ findingId }) => findingId), [...findings.map(({ findingId }) => findingId)].sort());
});
