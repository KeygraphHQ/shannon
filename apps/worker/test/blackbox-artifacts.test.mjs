import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BLACKBOX_ARTIFACT_NAMES,
  publishBlackboxArtifacts,
  renderBlackboxArtifacts,
} from '../dist/blackbox/artifacts.js';

const TARGET_ORIGIN = 'https://target.example';
const SECRET = 'artifact-secret-value';
const NO_FINDINGS = 'No replay-verified findings were produced. This run is not a clean assessment of unexercised routes or workflows.';

function exchange(exchangeId, routeSignature, identity, captureSequence) {
  return {
    exchangeId,
    routeSignature,
    identity,
    captureSequence,
    method: 'GET',
    origin: TARGET_ORIGIN,
    path: `/api/${SECRET}/${exchangeId}`,
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: `sha256:${exchangeId}`,
    candidateObjectReferences: [exchangeId],
    rawRecordRef: `raw/${exchangeId}.json`,
    provenance: { actor: 'blackbox-recon', taskId: `task-${exchangeId}`, baseRevision: 1 },
  };
}

function snapshot() {
  return {
    schemaVersion: 1,
    revision: 9,
    targetOrigin: TARGET_ORIGIN,
    identities: [
      { name: 'victim', role: 'ordinary user', authenticated: true, stateRef: 'capture/victim.json' },
      { name: 'attacker', role: 'ordinary user', authenticated: true, stateRef: 'capture/attacker.json' },
    ],
    exchanges: [
      exchange('ex-z', 'route-z', 'victim', 2),
      exchange('ex-a-victim', 'route-a', 'victim', 1),
      exchange('ex-a-attacker', 'route-a', 'attacker', 1),
    ],
    resources: [{
      resourceId: 'resource-z',
      resourceType: 'private record',
      objectReferences: ['z'],
      ownerIdentity: 'victim',
      visibility: 'private',
      evidence: [{ id: 'ex-z', kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'task-z', baseRevision: 1 },
    }, {
      resourceId: 'resource-a',
      resourceType: `record password=${SECRET}`,
      objectReferences: ['a'],
      ownerIdentity: 'attacker',
      visibility: 'private',
      evidence: [{ id: 'ex-a-attacker', kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'task-a', baseRevision: 1 },
    }],
    transitions: [],
    hypotheses: [],
    actions: [],
    candidateProofs: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
    runStatus: 'running',
    operationReceipts: [{ operationKey: 'internal', requestDigest: `sha256:${'0'.repeat(64)}`, revision: 1 }],
  };
}

function finding() {
  return {
    findingId: 'finding-1',
    hypothesisId: 'hypothesis-1',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    baselineExchangeId: 'ex-z',
    attackExchangeIds: ['ex-a-attacker'],
    verificationExchangeIds: ['ex-a-victim'],
    replaySequence: {
      actionId: 'action-1',
      steps: [{
        stepId: 'step-1',
        sourceExchangeId: 'ex-z',
        actor: 'attacker',
        mutations: [
          { type: 'set_path', path: `/api/${SECRET}/z` },
          { type: 'set_header', name: 'X-Auth', value: 'Bearer runtime-session-token-92d841' },
          { type: 'set_form_field', name: 'password', value: 'runtime-password-83c27f' },
        ],
      }],
      proofCondition: { type: 'body_contains', marker: 'victim-private-marker-runtime' },
    },
    demonstratedAction: 'read a victim-owned record',
    concreteEffect: 'loss of confidentiality for the victim record',
    affectedParty: 'users',
    impactStatement: 'As an attacker, I could read a victim-owned record, causing loss of confidentiality for the victim record to users.',
    preconditions: ['ordinary account'],
    verifierResultId: 'verification-1',
  };
}

test('renders exactly four sorted projections and the explicit no-findings result', () => {
  const rendered = renderBlackboxArtifacts({
    snapshot: snapshot(),
    findings: [],
    status: 'complete',
    failure: null,
  });

  assert.deepEqual(Object.keys(rendered), [...BLACKBOX_ARTIFACT_NAMES]);

  const inventory = JSON.parse(rendered['traffic_inventory.json']);
  assert.equal(inventory.every(({ path: requestPath }) => requestPath.includes(SECRET)), true);
  assert.deepEqual(inventory.map(({ routeSignature, identity }) => [routeSignature, identity]), [
    ['route-a', 'attacker'],
    ['route-a', 'victim'],
    ['route-z', 'victim'],
  ]);
  assert.equal(inventory.some((entry) => Object.hasOwn(entry, 'rawRecordRef')), false);

  const board = JSON.parse(rendered['blackbox_blackboard.json']);
  assert.equal(board.revision, 10);
  assert.equal(board.runStatus, 'complete');
  assert.equal(board.failure, null);
  assert.deepEqual(board.resources.map(({ resourceId }) => resourceId), ['resource-a', 'resource-z']);
  assert.equal(board.resources[0].resourceType, `record password=${SECRET}`);
  assert.equal(Object.hasOwn(board, 'operationReceipts'), false);
  assert.equal(board.identities.some((identity) => Object.hasOwn(identity, 'stateRef')), false);
  assert.deepEqual(JSON.parse(rendered['blackbox_authz_findings.json']), []);
  assert.equal(rendered['blackbox_authz_evidence.md'].includes(NO_FINDINGS), true);
});

test('renders replay order and normalized response comparisons for each finding', () => {
  const rendered = renderBlackboxArtifacts({
    snapshot: snapshot(),
    findings: [finding()],
    status: 'complete',
    failure: null,
  });
  const markdown = rendered['blackbox_authz_evidence.md'];

  assert.equal(markdown.includes('finding-1'), true);
  assert.equal(markdown.includes(finding().impactStatement), true);
  assert.match(markdown, /step-1.*attacker.*ex-z/s);
  assert.match(markdown, /ex-z.*ex-a-attacker.*200/s);
  assert.match(markdown, /ex-z.*ex-a-victim.*200/s);
  assert.equal(markdown.includes(SECRET), true);
  assert.equal(markdown.includes('runtime-session-token-92d841'), true);
  assert.equal(markdown.includes('runtime-password-83c27f'), true);
  assert.equal(markdown.includes('victim-private-marker-runtime'), true);
  assert.deepEqual(JSON.parse(rendered['blackbox_authz_findings.json']), [finding()]);
});

test('writes proof and credential payloads through every artifact projection verbatim', () => {
  const source = snapshot();
  const reportFinding = finding();
  source.resources[0].resourceType = 'private victim-private-marker-runtime record';
  source.exchanges[0].path = '/api/victim-private-marker-runtime/ex-z';
  reportFinding.impactStatement =
    'As an attacker, I could retrieve victim-private-marker-runtime from another user.';
  const rejectedProofValue = { email: 'victim-runtime-email@example.test', tier: 'internal' };
  const rejectedPlan = {
    steps: [{
      stepId: 'rejected-step',
      sourceExchangeId: 'ex-z',
      actor: 'attacker',
      mutations: [
        { type: 'set_query', name: 'session_nonce', value: 'runtime-nonce-4f92d1' },
        { type: 'set_json_pointer', pointer: '/credential/api_key', value: 'runtime-api-key-193c7a' },
      ],
    }],
    proofCondition: { type: 'json_pointer_equals', pointer: '/owner', value: rejectedProofValue },
  };
  source.actions = [{
    actionId: 'action-1',
    hypothesisId: 'hypothesis-1',
    sequence: reportFinding.replaySequence,
    status: 'completed',
    exchangeIds: ['ex-a-attacker'],
    observation: {
      condition: reportFinding.replaySequence.proofCondition,
      passed: true,
      baselineExchangeId: 'ex-z',
      baselinePassed: true,
      observedMarkerDigest: 'a'.repeat(64),
      observedTransitionId: null,
      verificationExchangeId: 'ex-a-attacker',
    },
    provenance: { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 4 },
  }];
  source.rejectedTasks = [{
    task: {
      taskId: 'rejected-action',
      kind: 'action',
      objective: 'Rejected replay',
      evidence: [{ id: 'ex-z', kind: 'exchange' }],
      identityLease: 'attacker',
      hypothesisId: 'hypothesis-1',
      status: 'rejected',
      replayPlan: rejectedPlan,
    },
    reason: 'invalid task',
  }];

  const rendered = renderBlackboxArtifacts({
    snapshot: source,
    findings: [reportFinding],
    status: 'complete',
    failure: null,
  });
  const combined = Object.values(rendered).join('\n');
  for (const observed of [
    'victim-private-marker-runtime',
    'runtime-session-token-92d841',
    'runtime-password-83c27f',
    'runtime-nonce-4f92d1',
    'runtime-api-key-193c7a',
    'victim-runtime-email@example.test',
  ]) {
    assert.equal(combined.includes(observed), true, `${observed} is missing from the artifacts`);
  }

  const board = JSON.parse(rendered['blackbox_blackboard.json']);
  assert.equal(board.schemaVersion, 1);
  assert.equal(board.targetOrigin, TARGET_ORIGIN);
  assert.equal(board.actions[0].sequence.steps[0].stepId, 'step-1');
  assert.equal(board.actions[0].sequence.steps[0].actor, 'attacker');
  assert.equal(board.actions[0].sequence.proofCondition.marker, 'victim-private-marker-runtime');
  assert.equal(board.actions[0].observation.observedMarkerDigest, 'a'.repeat(64));
  assert.equal(board.rejectedTasks[0].reason, 'invalid task');
  assert.equal(board.rejectedTasks[0].task.replayPlan.proofCondition.pointer, '/owner');
  assert.deepEqual(board.rejectedTasks[0].task.replayPlan.proofCondition.value, rejectedProofValue);
  assert.deepEqual(board.rejectedTasks[0].task.replayPlan.steps[0].mutations, rejectedPlan.steps[0].mutations);
});

test('publishes only the fixed manifest with the blackboard commit marker last', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-artifacts-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rendered = renderBlackboxArtifacts({
    snapshot: snapshot(),
    findings: [],
    status: 'complete',
    failure: null,
  });

  const writes = [];
  const names = await publishBlackboxArtifacts(root, rendered, {
    async ensureDirectory(directoryPath) {
      await mkdir(directoryPath, { recursive: true });
    },
    async atomicWrite(filePath, data) {
      writes.push(path.basename(filePath));
      await writeFile(filePath, data);
    },
  });
  const directory = path.join(root, '.shannon', 'deliverables');
  assert.deepEqual(names, [...BLACKBOX_ARTIFACT_NAMES]);
  assert.deepEqual(writes, [
    'traffic_inventory.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
    'blackbox_blackboard.json',
  ]);
  assert.deepEqual((await readdir(directory)).sort(), [...BLACKBOX_ARTIFACT_NAMES].sort());
  for (const name of names) {
    assert.equal(await readFile(path.join(directory, name), 'utf8'), rendered[name]);
  }
});

test('never returns a partial-success manifest when an artifact write fails', async () => {
  const rendered = renderBlackboxArtifacts({
    snapshot: snapshot(),
    findings: [],
    status: 'incomplete',
    failure: 'required component failed',
  });
  const writes = [];

  await assert.rejects(
    publishBlackboxArtifacts('C:/target', rendered, {
      async ensureDirectory() {},
      async atomicWrite(filePath) {
        writes.push(path.basename(filePath));
        if (writes.length === 3) throw new Error('simulated write failure');
      },
    }),
    /simulated write failure/,
  );
  assert.deepEqual(writes, [
    'traffic_inventory.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
  ]);
  assert.equal(writes.includes('blackbox_blackboard.json'), false);
});
