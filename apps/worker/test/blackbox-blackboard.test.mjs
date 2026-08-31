import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import * as blackboard from '../dist/blackbox/blackboard.js';

const TARGET_ORIGIN = 'https://target.example';
const UNTRUSTED_PROVENANCE = { actor: 'orchestrator', taskId: 'fabricated', baseRevision: 999 };

function requireExport(name) {
  assert.equal(typeof blackboard[name], 'function', `${name} must be exported`);
  return blackboard[name];
}

function initialization() {
  return {
    targetOrigin: TARGET_ORIGIN,
    runScope: {
      mode: 'blackbox',
      targetOrigin: TARGET_ORIGIN,
      identities: ['attacker', 'victim'],
      burpMcpUrl: 'http://host.docker.internal:9876/',
      burpMcpHostHeader: '127.0.0.1:9876',
      burpProxyUrl: 'http://host.docker.internal:18080/',
      evidenceBindingVersion: 1,
      identityBindingContractDigest: 'a'.repeat(64),
    },
    identities: [
      {
        name: 'attacker',
        role: 'ordinary user',
        authenticated: true,
        stateRef: 'state/attacker.json',
        authentication: { credentials: { password: 'configured-password' } },
      },
      {
        name: 'victim',
        role: 'ordinary user',
        authenticated: true,
        stateRef: 'state/victim.json',
      },
    ],
    configuredSecrets: ['configured-password', 'cookie-fixture-value', 'bearer-fixture-value', 'csrf-fixture-value'],
  };
}

async function makeStore(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackboard-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const FileBlackboardStore = requireExport('FileBlackboardStore');
  const store = new FileBlackboardStore(root);
  const snapshot = await store.initialize(initialization());
  return { root, store, snapshot };
}

function plannerTask(taskId, kind, overrides = {}) {
  return {
    taskId,
    kind,
    objective: `Run ${kind} task`,
    evidence: [],
    identityLease: kind === 'analysis' ? null : 'attacker',
    hypothesisId: null,
    status: 'pending',
    ...overrides,
  };
}

async function makeRunningStore(t, kind = 'recon', taskId = `${kind}-1`) {
  const state = await makeStore(t);
  let snapshot = await state.store.registerTasks(0, {
    operationKey: `register:${taskId}`,
    accepted: [plannerTask(taskId, kind)],
    rejected: [],
  });
  snapshot = await state.store.startTasks(snapshot.revision, `start:${taskId}`, [taskId]);
  return { ...state, snapshot, taskId };
}

function exchange(exchangeId = 'ex_001', overrides = {}) {
  return {
    exchangeId,
    routeSignature: 'route_001',
    identity: 'attacker',
    captureSequence: 1,
    method: 'GET',
    origin: TARGET_ORIGIN,
    path: '/api/objects/1',
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: 'sha256:safe-response',
    candidateObjectReferences: ['1'],
    rawRecordRef: `raw/${exchangeId}.json`,
    provenance: UNTRUSTED_PROVENANCE,
    ...overrides,
  };
}

function hypothesis(hypothesisId = 'hyp_001', evidence = []) {
  return {
    hypothesisId,
    kind: 'horizontal',
    summary: 'One user may read another user resource.',
    preconditions: ['Two authenticated users exist.'],
    attackerCapability: 'Read another user resource.',
    evidence,
    priority: 'high',
    status: 'open',
    provenance: UNTRUSTED_PROVENANCE,
  };
}

function action(actionId = 'act_001', hypothesisId = 'hyp_001') {
  return {
    actionId,
    hypothesisId,
    sequence: {
      actionId,
      steps: [],
      proofCondition: { type: 'body_contains', marker: 'victim-marker' },
    },
    status: 'completed',
    exchangeIds: [],
    observation: null,
    provenance: UNTRUSTED_PROVENANCE,
  };
}

function replayPlan(overrides = {}) {
  return {
    steps: [],
    proofCondition: { type: 'body_contains', marker: 'victim-marker' },
    ...overrides,
  };
}

function resource(resourceId = 'res_victim', overrides = {}) {
  return {
    resourceId,
    resourceType: 'account-record',
    objectReferences: ['victim-record'],
    ownerIdentity: 'victim',
    visibility: 'private',
    evidence: [{ id: 'ex_victim', kind: 'exchange' }],
    provenance: UNTRUSTED_PROVENANCE,
    ...overrides,
  };
}

function candidateProof(actionId = 'action-1', hypothesisId = 'hyp_action', overrides = {}) {
  return {
    candidateId: 'candidate-1',
    hypothesisId,
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    victimResourceId: 'res_victim',
    baselineExchangeId: 'ex_victim',
    actionId,
    verificationSourceExchangeId: 'ex_victim',
    demonstratedAction: 'read a victim-owned record',
    concreteEffect: 'the victim record was disclosed',
    affectedParty: 'users',
    preconditions: ['Two ordinary users exist.'],
    provenance: UNTRUSTED_PROVENANCE,
    ...overrides,
  };
}

async function makeActionStore(t, planOverrides = {}) {
  const state = await makeStore(t);
  let snapshot = await state.store.registerTasks(state.snapshot.revision, {
    operationKey: 'register:action-fixture-recon',
    accepted: [
      plannerTask('recon-attacker', 'recon'),
      plannerTask('recon-victim', 'recon', { identityLease: 'victim' }),
    ],
    rejected: [],
  });
  snapshot = await state.store.startTasks(snapshot.revision, 'start:action-fixture-recon', [
    'recon-attacker',
    'recon-victim',
  ]);
  snapshot = await state.store.settleTasks({
    operationKey: 'settle:action-fixture-recon',
    baseRevision: snapshot.revision,
    contributions: [
      {
        taskId: 'recon-attacker',
        role: 'blackbox-recon',
        baseRevision: snapshot.revision,
        exchanges: [exchange('ex_attacker')],
      },
      {
        taskId: 'recon-victim',
        role: 'blackbox-recon',
        baseRevision: snapshot.revision,
        exchanges: [exchange('ex_victim', { identity: 'victim', path: '/api/objects/victim-record' })],
        resources: [resource()],
      },
    ],
    failures: [],
  });
  snapshot = await state.store.registerTasks(snapshot.revision, {
    operationKey: 'register:action-fixture-analysis',
    accepted: [plannerTask('analysis-action', 'analysis')],
    rejected: [],
  });
  snapshot = await state.store.startTasks(snapshot.revision, 'start:action-fixture-analysis', ['analysis-action']);
  snapshot = await state.store.settleTasks({
    operationKey: 'settle:action-fixture-analysis',
    baseRevision: snapshot.revision,
    contributions: [{
      taskId: 'analysis-action',
      role: 'blackbox-analysis',
      baseRevision: snapshot.revision,
      hypotheses: [hypothesis('hyp_action', [
        { id: 'ex_attacker', kind: 'exchange' },
        { id: 'res_victim', kind: 'resource' },
      ])],
    }],
    failures: [],
  });
  const approvedPlan = replayPlan({
    steps: [
      { stepId: 'victim-baseline', sourceExchangeId: 'ex_victim', actor: 'victim', mutations: [] },
      {
        stepId: 'attacker-replay',
        sourceExchangeId: 'ex_victim',
        actor: 'attacker',
        mutations: [{ type: 'set_path', path: '/api/objects/victim-record' }],
      },
    ],
    ...planOverrides,
  });
  snapshot = await state.store.registerTasks(snapshot.revision, {
    operationKey: 'register:action-fixture-action',
    accepted: [plannerTask('action-1', 'action', {
      hypothesisId: 'hyp_action',
      replayPlan: approvedPlan,
    })],
    rejected: [],
  });
  snapshot = await state.store.startTasks(snapshot.revision, 'start:action-fixture-action', ['action-1']);
  return { ...state, snapshot, approvedPlan };
}

function successfulActionContribution(baseRevision, approvedPlan, overrides = {}) {
  return {
    taskId: 'action-1',
    role: 'blackbox-action',
    baseRevision,
    exchanges: [exchange('ex_action', { captureSequence: 3 })],
    actions: [{
      ...action('action-1', 'hyp_action'),
      sequence: { actionId: 'action-1', ...approvedPlan },
      exchangeIds: ['ex_action'],
      observation: {
        condition: approvedPlan.proofCondition,
        passed: true,
        observedMarkerDigest: 'sha256:observed-marker',
        observedTransitionId: null,
        verificationExchangeId: 'ex_action',
      },
    }],
    candidateProofs: [candidateProof()],
    ...overrides,
  };
}

async function makeSettledActionStore(t, planOverrides = {}) {
  const state = await makeActionStore(t, planOverrides);
  const snapshot = await state.store.settleTasks({
    operationKey: 'settle:action-fixture-success',
    baseRevision: state.snapshot.revision,
    contributions: [successfulActionContribution(state.snapshot.revision, state.approvedPlan)],
    failures: [],
  });
  return { ...state, snapshot };
}

function verifiedAttempt(approvedPlan, overrides = {}) {
  const base = {
    verification: {
      verificationId: 'verification-1',
      candidateId: 'candidate-1',
      verdict: 'verified',
      freshStateRefs: [
        { identity: 'attacker', stateRef: 'verify/attacker/storage-state.json' },
        { identity: 'victim', stateRef: 'verify/victim/storage-state.json' },
      ],
      replayActionIds: ['action-1'],
      replayExchangeIds: ['ex_verify'],
      observation: {
        condition: approvedPlan.proofCondition,
        passed: true,
        observedMarkerDigest: 'sha256:verified-marker',
        observedTransitionId: null,
        verificationExchangeId: 'ex_verify',
      },
      failureReason: null,
      demonstratedAction: 'read a victim-owned record',
      concreteEffect: 'the victim record was disclosed',
      affectedParty: 'users',
    },
    exchanges: [exchange('ex_verify', { captureSequence: 4 })],
  };
  return {
    ...base,
    ...overrides,
    verification: { ...base.verification, ...(overrides.verification ?? {}) },
  };
}

test('initialization atomically writes a redacted revision-zero document', async (t) => {
  const { root, snapshot } = await makeStore(t);
  const boardPath = path.join(root, '.shannon', 'blackbox', 'blackboard.json');
  const serialized = await readFile(boardPath, 'utf8');

  assert.equal(snapshot.revision, 0);
  assert.deepEqual(snapshot.operationReceipts, []);
  assert.equal(snapshot.targetOrigin, TARGET_ORIGIN);
  assert.deepEqual(snapshot.runScope, initialization().runScope);
  assert.deepEqual(snapshot.identities.map(({ name, role, authenticated, stateRef }) => ({ name, role, authenticated, stateRef })), [
    { name: 'attacker', role: 'ordinary user', authenticated: true, stateRef: 'state/attacker.json' },
    { name: 'victim', role: 'ordinary user', authenticated: true, stateRef: 'state/victim.json' },
  ]);
  assert.equal(serialized.includes('configured-password'), false);
  assert.equal(serialized.includes('cookie-fixture-value'), false);
  assert.equal(serialized.includes('bearer-fixture-value'), false);
  assert.equal(serialized.includes('csrf-fixture-value'), false);
  await assert.rejects(readFile(`${boardPath}.tmp`, 'utf8'), /ENOENT/);
});

test('resume compares the complete black-box scope independent of identity order', async (t) => {
  const { root, snapshot } = await makeStore(t);
  const FileBlackboardStore = requireExport('FileBlackboardStore');
  const resumed = new FileBlackboardStore(root);
  const reordered = initialization();
  reordered.identities.reverse();
  reordered.runScope.identities = ['victim', 'attacker'];

  assert.deepEqual(await resumed.initialize(reordered), snapshot);

  for (const [field, value] of [
    ['targetOrigin', 'https://other.example'],
    ['identities', ['attacker', 'backup']],
    ['burpMcpUrl', 'http://host.docker.internal:9999/'],
    ['burpMcpHostHeader', '127.0.0.1:9999'],
    ['burpProxyUrl', 'http://host.docker.internal:19090/'],
    ['evidenceBindingVersion', 2],
    ['identityBindingContractDigest', 'b'.repeat(64)],
  ]) {
    const changed = initialization();
    changed.runScope = { ...changed.runScope, [field]: value };
    if (field === 'targetOrigin') changed.targetOrigin = value;
    await assert.rejects(new FileBlackboardStore(root).initialize(changed), /scope|origin|identit/i);
  }
});

test('resume atomically recovers interrupted work without resending an action', async (t) => {
  const state = await makeActionStore(t);
  let snapshot = await state.store.registerTasks(state.snapshot.revision, {
    operationKey: 'register:interrupted-workers',
    accepted: [
      plannerTask('analysis-interrupted', 'analysis'),
      plannerTask('analysis-pending', 'analysis'),
      plannerTask('recon-interrupted', 'recon', { identityLease: 'victim' }),
      plannerTask('recon-pending', 'recon', { identityLease: 'victim' }),
      plannerTask('action-pending', 'action', {
        hypothesisId: 'hyp_action',
        replayPlan: state.approvedPlan,
      }),
    ],
    rejected: [],
  });
  snapshot = await state.store.startTasks(snapshot.revision, 'start:interrupted-workers', [
    'analysis-interrupted',
    'recon-interrupted',
  ]);

  const recovered = await state.store.recoverInterruptedTasks(
    snapshot.revision,
    'resume:recover-interrupted',
  );
  const statuses = Object.fromEntries(recovered.tasks.map(({ taskId, status }) => [taskId, status]));
  assert.equal(statuses['action-1'], 'failed');
  assert.equal(statuses['analysis-interrupted'], 'pending');
  assert.equal(statuses['analysis-pending'], 'pending');
  assert.equal(statuses['recon-interrupted'], 'failed');
  assert.equal(statuses['recon-pending'], 'pending');
  assert.equal(statuses['action-pending'], 'failed');
  assert.deepEqual(recovered.actions.find(({ actionId }) => actionId === 'action-1'), {
    actionId: 'action-1',
    hypothesisId: 'hyp_action',
    sequence: { actionId: 'action-1', ...state.approvedPlan },
    status: 'delivery_unknown',
    exchangeIds: [],
    observation: null,
    provenance: {
      actor: 'blackbox-action',
      taskId: 'action-1',
      baseRevision: snapshot.revision,
    },
  });
  assert.deepEqual(
    await state.store.recoverInterruptedTasks(recovered.revision, 'resume:recover-interrupted'),
    recovered,
  );
});

test('resume retries an interrupted bootstrap capture as a fresh browser session', async (t) => {
  const { store } = await makeStore(t);
  const task = plannerTask('bootstrap-attacker', 'recon', {
    identityLease: 'attacker',
    hypothesisId: null,
  });
  let snapshot = await store.registerTasks(0, {
    operationKey: 'register:bootstrap-resume',
    accepted: [task],
    rejected: [],
  });
  snapshot = await store.startTasks(snapshot.revision, 'start:bootstrap-resume', [task.taskId]);

  const recovered = await store.recoverInterruptedTasks(snapshot.revision, 'recover:bootstrap-resume');
  assert.equal(recovered.tasks.find(({ taskId }) => taskId === task.taskId)?.status, 'pending');
  assert.equal(recovered.actions.length, 0);
});

test('host can reopen only a completed configured identity bootstrap for live state refresh', async (t) => {
  const { store } = await makeStore(t);
  const task = plannerTask('bootstrap-attacker', 'recon', {
    identityLease: 'attacker',
    hypothesisId: null,
  });
  let snapshot = await store.registerTasks(0, {
    operationKey: 'register:bootstrap-refresh',
    accepted: [task],
    rejected: [],
  });
  snapshot = await store.startTasks(snapshot.revision, 'start:bootstrap-refresh', [task.taskId]);
  snapshot = await store.settleTasks({
    operationKey: 'settle:bootstrap-refresh',
    baseRevision: snapshot.revision,
    contributions: [{
      taskId: task.taskId,
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
    }],
    failures: [],
    identityCaptures: [{
      identity: 'attacker',
      stateRef: '.shannon/blackbox/identities/attacker/storage-state.json',
    }],
  });

  const refreshed = await store.refreshIdentityCapture(
    snapshot.revision,
    'refresh:bootstrap-attacker',
    'attacker',
  );

  assert.equal(refreshed.tasks.find(({ taskId }) => taskId === task.taskId)?.status, 'pending');
  assert.equal(refreshed.identities.find(({ name }) => name === 'attacker')?.authenticated, false);
  assert.deepEqual(
    await store.refreshIdentityCapture(refreshed.revision, 'refresh:bootstrap-attacker', 'attacker'),
    refreshed,
  );
  await assert.rejects(
    store.refreshIdentityCapture(refreshed.revision, 'refresh:unknown', 'unknown'),
    /unknown identity/i,
  );
});

test('recovery does not treat planner recon task IDs with a bootstrap prefix as identity capture', async (t) => {
  const { store, snapshot } = await makeStore(t);
  const task = plannerTask('bootstrap-followup', 'recon');
  let current = await store.registerTasks(snapshot.revision, {
    operationKey: 'register:bootstrap-prefix-recon',
    accepted: [task],
    rejected: [],
  });
  current = await store.startTasks(current.revision, 'start:bootstrap-prefix-recon', [task.taskId]);

  const recovered = await store.recoverInterruptedTasks(current.revision, 'recover:bootstrap-prefix-recon');

  assert.equal(recovered.tasks.find(({ taskId }) => task.taskId)?.status, 'failed');
});

test('a keyed transition replays idempotently before stale-revision checks and rejects changed content', async (t) => {
  const { store } = await makeStore(t);
  const batch = {
    operationKey: 'register:idempotent',
    accepted: [plannerTask('recon-idempotent', 'recon')],
    rejected: [],
  };

  const first = await store.registerTasks(0, batch);
  const reorderedTask = Object.fromEntries(Object.entries(plannerTask('recon-idempotent', 'recon')).reverse());
  const replay = await store.registerTasks(0, {
    rejected: [],
    accepted: [reorderedTask],
    operationKey: 'register:idempotent',
  });

  assert.deepEqual(replay, first);
  assert.equal(first.operationReceipts.length, 1);
  assert.match(first.operationReceipts[0].requestDigest, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(first.operationReceipts[0], {
    operationKey: 'register:idempotent',
    requestDigest: first.operationReceipts[0].requestDigest,
    revision: 1,
  });

  await assert.rejects(
    store.registerTasks(0, {
      operationKey: 'register:idempotent',
      accepted: [plannerTask('recon-changed', 'recon')],
      rejected: [],
    }),
    /operation key.*different content/i,
  );
  assert.deepEqual(await store.read(), first);
});

test('every keyed lifecycle transition is idempotent', async (t) => {
  const { store } = await makeStore(t);
  let snapshot = await store.registerTasks(0, {
    operationKey: 'lifecycle:register',
    accepted: [plannerTask('recon-lifecycle', 'recon')],
    rejected: [],
  });

  const started = await store.startTasks(snapshot.revision, 'lifecycle:start', ['recon-lifecycle']);
  assert.deepEqual(
    await store.startTasks(snapshot.revision, 'lifecycle:start', ['recon-lifecycle']),
    started,
  );

  const settlement = {
    operationKey: 'lifecycle:settle',
    baseRevision: started.revision,
    contributions: [{
      taskId: 'recon-lifecycle',
      role: 'blackbox-recon',
      baseRevision: started.revision,
      exchanges: [exchange('ex_lifecycle')],
    }],
    failures: [],
  };
  const settled = await store.settleTasks(settlement);
  assert.deepEqual(await store.settleTasks(settlement), settled);

  const finalized = await store.setRunStatus(settled.revision, 'lifecycle:finalize', 'complete', null);
  assert.deepEqual(
    await store.setRunStatus(settled.revision, 'lifecycle:finalize', 'complete', null),
    finalized,
  );
  assert.equal(finalized.operationReceipts.length, 4);
});

test('planning decisions durably advance the global wave and preserve terminal intent', async (t) => {
  const { store, snapshot } = await makeStore(t);
  const continued = await store.recordPlanningDecision(
    snapshot.revision,
    'workflow-1:1:evaluate:',
    1,
    'continue',
  );
  assert.deepEqual(continued.planningDecision, { waveNumber: 1, decision: 'continue' });
  assert.deepEqual(
    await store.recordPlanningDecision(snapshot.revision, 'workflow-1:1:evaluate:', 1, 'continue'),
    continued,
  );

  const completing = await store.recordPlanningDecision(
    continued.revision,
    'workflow-1:4:evaluate:',
    4,
    'complete',
  );
  assert.deepEqual(completing.planningDecision, { waveNumber: 4, decision: 'complete' });
  await assert.rejects(
    store.recordPlanningDecision(completing.revision, 'workflow-1:5:evaluate:', 5, 'continue'),
    /finalization|terminal.*decision/i,
  );
});

test('planning waves are reserved before model work and preserve stop until evaluation', async (t) => {
  const { store, snapshot } = await makeStore(t);
  const reserved = await store.reservePlanningWave(snapshot.revision, 'workflow-1:1:reserve:', 1);
  assert.deepEqual(reserved.planningWave, { waveNumber: 1, phase: 'reserved', plannerStop: null });
  assert.deepEqual(
    await store.reservePlanningWave(snapshot.revision, 'workflow-1:1:reserve:', 1),
    reserved,
  );

  const registered = await store.registerTasks(reserved.revision, {
    operationKey: 'workflow-1:1:register:',
    accepted: [],
    rejected: [],
    planningWave: { waveNumber: 1, plannerStop: true },
  });
  assert.deepEqual(registered.planningWave, { waveNumber: 1, phase: 'registered', plannerStop: true });

  const evaluated = await store.recordPlanningDecision(
    registered.revision,
    'workflow-1:1:evaluate:',
    1,
    'complete',
  );
  assert.equal(evaluated.planningWave, null);
  assert.deepEqual(evaluated.planningDecision, { waveNumber: 1, decision: 'complete' });
});

test('schema-version-one documents written before operation receipts and terminal failures remain readable', async (t) => {
  const { root, store } = await makeStore(t);
  const boardPath = path.join(root, '.shannon', 'blackbox', 'blackboard.json');
  const legacy = JSON.parse(await readFile(boardPath, 'utf8'));
  delete legacy.operationReceipts;
  delete legacy.terminalFailure;
  await writeFile(boardPath, JSON.stringify(legacy), 'utf8');

  const snapshot = await store.read();
  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.operationReceipts, undefined);
  assert.equal(snapshot.terminalFailure, undefined);
});

test('task registration queues action hypotheses and closes exhausted hypotheses atomically', async (t) => {
  const { store, snapshot, taskId } = await makeRunningStore(t, 'analysis');
  let current = await store.settleTasks({
    operationKey: 'settle:analysis-lifecycle',
    baseRevision: snapshot.revision,
    contributions: [{
      taskId,
      role: 'blackbox-analysis',
      baseRevision: snapshot.revision,
      hypotheses: [hypothesis('hyp_queue'), hypothesis('hyp_close')],
    }],
    failures: [],
  });
  const beforeRegistration = current;
  current = await store.registerTasks(current.revision, {
    operationKey: 'register:action-lifecycle',
    accepted: [plannerTask('act_lifecycle', 'action', {
      hypothesisId: 'hyp_queue',
      replayPlan: replayPlan(),
    })],
    rejected: [],
    closedHypothesisIds: ['hyp_close'],
  });

  assert.equal(current.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_queue')?.status, 'queued');
  assert.equal(
    current.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_close')?.status,
    'no_demonstrated_impact',
  );

  await assert.rejects(
    store.registerTasks(current.revision, {
      operationKey: 'register:reopen-closed-hypothesis',
      accepted: [plannerTask('act_reopen', 'action', {
        hypothesisId: 'hyp_close',
        replayPlan: replayPlan(),
      })],
      rejected: [],
    }),
    /cannot queue.*no_demonstrated_impact/i,
  );
  await assert.rejects(
    store.registerTasks(current.revision, {
      operationKey: 'register:unknown-closure',
      accepted: [],
      rejected: [],
      closedHypothesisIds: ['hyp_missing'],
    }),
    /unknown hypothesis/i,
  );
  assert.notDeepEqual(current, beforeRegistration);
  assert.deepEqual(await store.read(), current);
});

test('analysis cannot assign orchestrator-owned hypothesis lifecycle states', async (t) => {
  const { store, snapshot, taskId } = await makeRunningStore(t, 'analysis');
  const before = await store.read();

  await assert.rejects(
    store.settleTasks({
      operationKey: 'settle:analysis-terminal-hypothesis',
      baseRevision: snapshot.revision,
      contributions: [{
        taskId,
        role: 'blackbox-analysis',
        baseRevision: snapshot.revision,
        hypotheses: [{ ...hypothesis('hyp_model_terminal'), status: 'verified' }],
      }],
      failures: [],
    }),
    /hypothesis.*open|open.*hypothesis|lifecycle/i,
  );
  assert.deepEqual(await store.read(), before);
});

test('queued and blocked hypotheses can be replanned or explicitly closed', async (t) => {
  await t.test('queued after action activity failure can be replanned', async (t) => {
    const { store, snapshot, approvedPlan } = await makeActionStore(t);
    const failed = await store.settleTasks({
      operationKey: 'settle:action-activity-failure',
      baseRevision: snapshot.revision,
      contributions: [],
      failures: [{ taskId: 'action-1', reason: 'activity failed before replay' }],
    });
    assert.equal(failed.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'queued');

    const replanned = await store.registerTasks(failed.revision, {
      operationKey: 'register:replan-queued',
      accepted: [plannerTask('action-2', 'action', {
        hypothesisId: 'hyp_action',
        replayPlan: approvedPlan,
      })],
      rejected: [],
    });
    assert.equal(replanned.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'queued');
  });

  await t.test('blocked verification can be explicitly closed', async (t) => {
    const { store, snapshot } = await makeSettledActionStore(t);
    const blocked = await store.recordVerification(snapshot.revision, 'verify:blocked-for-closure', {
      verification: {
        verificationId: 'verification-blocked-for-closure',
        candidateId: 'candidate-1',
        verdict: 'blocked',
        freshStateRefs: [],
        replayActionIds: ['action-1'],
        replayExchangeIds: [],
        observation: null,
        failureReason: 'fresh login could not be established',
      },
      exchanges: [],
    });
    assert.equal(blocked.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'blocked');

    const closed = await store.registerTasks(blocked.revision, {
      operationKey: 'register:close-blocked',
      accepted: [],
      rejected: [],
      closedHypothesisIds: ['hyp_action'],
    });
    assert.equal(
      closed.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status,
      'no_demonstrated_impact',
    );
  });
});

test('action settlement atomically binds replay evidence to its registered task and marks the hypothesis tested', async (t) => {
  const { store, snapshot, approvedPlan } = await makeActionStore(t);
  const contribution = successfulActionContribution(snapshot.revision, approvedPlan);
  const settled = await store.settleTasks({
    operationKey: 'settle:action-1',
    baseRevision: snapshot.revision,
    contributions: [contribution],
    failures: [],
  });

  assert.equal(settled.tasks.find(({ taskId }) => taskId === 'action-1')?.status, 'completed');
  assert.equal(settled.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'tested');
  assert.equal(settled.exchanges.find(({ exchangeId }) => exchangeId === 'ex_action')?.provenance.taskId, 'action-1');
  assert.equal(settled.actions[0].actionId, 'action-1');
  assert.equal(settled.candidateProofs[0].hypothesisId, 'hyp_action');
  assert.equal(settled.revision, snapshot.revision + 1);
});

test('a non-completed action outcome is persisted once and fails its task without a failure entry', async (t) => {
  const { store, snapshot, approvedPlan } = await makeActionStore(t);
  const contribution = successfulActionContribution(snapshot.revision, approvedPlan, {
    candidateProofs: [],
  });
  contribution.actions = contribution.actions.map((result) => ({
    ...result,
    status: 'delivery_unknown',
    observation: null,
  }));

  const settled = await store.settleTasks({
    operationKey: 'settle:action-delivery-unknown',
    baseRevision: snapshot.revision,
    contributions: [contribution],
    failures: [],
  });

  assert.equal(settled.actions.find(({ actionId }) => actionId === 'action-1')?.status, 'delivery_unknown');
  assert.equal(settled.tasks.find(({ taskId }) => taskId === 'action-1')?.status, 'failed');
  assert.equal(settled.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'tested');
  assert.equal(settled.exchanges.some(({ exchangeId }) => exchangeId === 'ex_action'), true);
});

test('action settlement rejects an unbound result or candidate without a partial write', async (t) => {
  for (const [name, mutate, pattern] of [
    ['missing result', (contribution) => ({ ...contribution, actions: [] }), /exactly one action result/i],
    ['wrong result ID', (contribution) => ({
      ...contribution,
      actions: contribution.actions.map((result) => ({
        ...result,
        actionId: 'action-other',
        sequence: { ...result.sequence, actionId: 'action-other' },
      })),
      candidateProofs: contribution.candidateProofs.map((proof) => ({ ...proof, actionId: 'action-other' })),
    }), /action result.*task/i],
    ['changed replay plan', (contribution) => ({
      ...contribution,
      actions: contribution.actions.map((result) => ({
        ...result,
        sequence: { ...result.sequence, proofCondition: { type: 'body_contains', marker: 'changed' } },
      })),
    }), /approved replay plan/i],
    ['changed proof observation', (contribution) => ({
      ...contribution,
      actions: contribution.actions.map((result) => ({
        ...result,
        observation: {
          ...result.observation,
          condition: { type: 'body_contains', marker: 'changed' },
        },
      })),
    }), /observation.*approved proof/i],
    ['wrong candidate hypothesis', (contribution) => ({
      ...contribution,
      candidateProofs: contribution.candidateProofs.map((proof) => ({
        ...proof,
        hypothesisId: 'hyp_other',
      })),
    }), /candidate.*hypothesis/i],
    ['unsafe candidate ID', (contribution) => ({
      ...contribution,
      candidateProofs: contribution.candidateProofs.map((proof) => ({
        ...proof,
        candidateId: 'candidate:1',
      })),
    }), /proof ID.*safe identifier/i],
  ]) {
    await t.test(name, async (t) => {
      const { store, snapshot, approvedPlan } = await makeActionStore(t);
      const before = await store.read();
      await assert.rejects(
        store.settleTasks({
          operationKey: `settle:invalid:${name}`,
          baseRevision: snapshot.revision,
          contributions: [mutate(successfulActionContribution(snapshot.revision, approvedPlan))],
          failures: [],
        }),
        pattern,
      );
      assert.deepEqual(await store.read(), before);
    });
  }
});

test('verification atomically merges fresh replay evidence and promotes the tested hypothesis', async (t) => {
  const { store, snapshot, approvedPlan } = await makeSettledActionStore(t);
  const result = await store.recordVerification(
    snapshot.revision,
    'verify:candidate-1',
    verifiedAttempt(approvedPlan),
  );

  assert.equal(result.verifications[0].verdict, 'verified');
  assert.equal(result.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'verified');
  assert.deepEqual(result.exchanges.find(({ exchangeId }) => exchangeId === 'ex_verify')?.provenance, {
    actor: 'blackbox-verifier',
    taskId: 'verification-1',
    baseRevision: snapshot.revision,
  });
  assert.equal(result.revision, snapshot.revision + 1);
  assert.deepEqual(
    await store.recordVerification(snapshot.revision, 'verify:candidate-1', verifiedAttempt(approvedPlan)),
    result,
  );
});

test('a later blocked verifier result cannot downgrade an already verified hypothesis', async (t) => {
  const { store, snapshot, approvedPlan } = await makeSettledActionStore(t);
  const verified = await store.recordVerification(
    snapshot.revision,
    'verify:monotonic-success',
    verifiedAttempt(approvedPlan),
  );
  const afterBlocked = await store.recordVerification(verified.revision, 'verify:monotonic-blocked', {
    verification: {
      verificationId: 'verification-later-blocked',
      candidateId: 'candidate-1',
      verdict: 'blocked',
      freshStateRefs: [],
      replayActionIds: ['action-1'],
      replayExchangeIds: [],
      observation: null,
      failureReason: 'later fresh login failed',
    },
    exchanges: [],
  });

  assert.equal(afterBlocked.hypotheses.find(({ hypothesisId }) => hypothesisId === 'hyp_action')?.status, 'verified');
});

test('verified results require a passed linked replay from fresh state without partial evidence', async (t) => {
  for (const [name, mutate, pattern] of [
    ['failed observation', (attempt) => ({
      ...attempt,
      verification: {
        ...attempt.verification,
        observation: { ...attempt.verification.observation, passed: false },
      },
    }), /verified.*passed observation/i],
    ['missing original action', (attempt) => ({
      ...attempt,
      verification: { ...attempt.verification, replayActionIds: [] },
    }), /original action/i],
    ['reused capture state', (attempt) => ({
      ...attempt,
      verification: {
        ...attempt.verification,
        freshStateRefs: attempt.verification.freshStateRefs.map((ref) =>
          ref.identity === 'attacker' ? { ...ref, stateRef: 'state/attacker.json' } : ref,
        ),
      },
    }), /fresh state.*attacker|attacker.*capture state/i],
    ['missing replay actor', (attempt) => ({
      ...attempt,
      verification: {
        ...attempt.verification,
        freshStateRefs: attempt.verification.freshStateRefs.filter(({ identity }) => identity !== 'victim'),
      },
    }), /fresh state.*victim|victim.*fresh state/i],
  ]) {
    await t.test(name, async (t) => {
      const { store, snapshot, approvedPlan } = await makeSettledActionStore(t);
      const before = await store.read();
      await assert.rejects(
        store.recordVerification(
          snapshot.revision,
          `verify:invalid:${name}`,
          mutate(verifiedAttempt(approvedPlan)),
        ),
        pattern,
      );
      assert.deepEqual(await store.read(), before);
    });
  }
});

test('persistent-state verification requires fresh state for its verification-source identity', async (t) => {
  const plan = {
    steps: [{ stepId: 'attacker-replay', sourceExchangeId: 'ex_victim', actor: 'attacker', mutations: [] }],
    proofCondition: {
      type: 'persistent_state',
      verificationSourceExchangeId: 'ex_victim',
      marker: 'victim-marker',
    },
  };
  const { store, snapshot, approvedPlan } = await makeSettledActionStore(t, plan);
  const attempt = verifiedAttempt(approvedPlan);
  attempt.verification.freshStateRefs = attempt.verification.freshStateRefs.filter(
    ({ identity }) => identity !== 'victim',
  );

  await assert.rejects(
    store.recordVerification(snapshot.revision, 'verify:persistent-source', attempt),
    /fresh state.*victim|victim.*fresh state/i,
  );
});

test('task settlement atomically records authenticated identity state without credentials', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackboard-identity-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const FileBlackboardStore = requireExport('FileBlackboardStore');
  const store = new FileBlackboardStore(root);
  const initial = initialization();
  let snapshot = await store.initialize({
    ...initial,
    identities: initial.identities.map((identity) => ({ ...identity, authenticated: false, stateRef: null })),
  });
  const stateRef = '.shannon/blackbox/identities/attacker/storage-state.json';
  const task = plannerTask('bootstrap-attacker', 'recon');
  snapshot = await store.registerTasks(snapshot.revision, {
    operationKey: 'register:bootstrap-attacker',
    accepted: [task],
    rejected: [],
  });
  snapshot = await store.startTasks(snapshot.revision, 'start:bootstrap-attacker', [task.taskId]);
  const updated = await store.settleTasks({
    operationKey: 'settle:bootstrap-attacker',
    baseRevision: snapshot.revision,
    contributions: [{
      taskId: task.taskId,
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
    }],
    failures: [],
    identityCaptures: [{ identity: 'attacker', stateRef }],
  });

  assert.equal(updated.revision, 3);
  assert.deepEqual(updated.identities.find(({ name }) => name === 'attacker'), {
    name: 'attacker',
    role: 'ordinary user',
    authenticated: true,
    stateRef,
  });
  assert.equal(updated.tasks.find(({ taskId }) => taskId === task.taskId)?.status, 'completed');
  assert.equal(JSON.stringify(updated).includes('configured-password'), false);
  await assert.rejects(
    store.settleTasks({
      baseRevision: updated.revision,
      operationKey: 'capture:unknown',
      contributions: [],
      failures: [],
      identityCaptures: [{
        identity: 'unknown',
        stateRef: '.shannon/blackbox/identities/unknown/storage-state.json',
      }],
    }),
    /unknown identity/i,
  );
});

test('identity capture settlement requires the matching bootstrap identity lease', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackboard-identity-lease-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const FileBlackboardStore = requireExport('FileBlackboardStore');
  const store = new FileBlackboardStore(root);
  const initial = initialization();
  let snapshot = await store.initialize({
    ...initial,
    identities: initial.identities.map((identity) => ({ ...identity, authenticated: false, stateRef: null })),
  });
  const task = plannerTask('bootstrap-attacker', 'recon', { identityLease: 'victim' });
  snapshot = await store.registerTasks(snapshot.revision, {
    operationKey: 'register:wrong-bootstrap-lease',
    accepted: [task],
    rejected: [],
  });
  snapshot = await store.startTasks(snapshot.revision, 'start:wrong-bootstrap-lease', [task.taskId]);

  await assert.rejects(
    store.settleTasks({
      operationKey: 'settle:wrong-bootstrap-lease',
      baseRevision: snapshot.revision,
      contributions: [{
        taskId: task.taskId,
        role: 'blackbox-recon',
        baseRevision: snapshot.revision,
      }],
      failures: [],
      identityCaptures: [{
        identity: 'attacker',
        stateRef: '.shannon/blackbox/identities/attacker/storage-state.json',
      }],
    }),
    /identity lease|leased.*attacker|bootstrap.*attacker/i,
  );
  const unchanged = await store.read();
  assert.equal(unchanged.revision, snapshot.revision);
  assert.equal(unchanged.identities.find(({ name }) => name === 'attacker')?.authenticated, false);
  assert.equal(unchanged.tasks.find(({ taskId }) => taskId === task.taskId)?.status, 'running');
});

test('resume requires the configured secret set and keeps enforcing it across store instances', async (t) => {
  const { root } = await makeStore(t);
  const FileBlackboardStore = requireExport('FileBlackboardStore');
  const resumed = new FileBlackboardStore(root);
  const missingSecrets = initialization();
  delete missingSecrets.configuredSecrets;

  await assert.rejects(resumed.initialize(missingSecrets), /configured secrets/i);
  await resumed.initialize(initialization());
  let snapshot = await resumed.registerTasks(0, {
    operationKey: 'register:resume-secret',
    accepted: [plannerTask('recon-secret', 'recon')],
    rejected: [],
  });
  snapshot = await resumed.startTasks(snapshot.revision, 'start:resume-secret', ['recon-secret']);
  await assert.rejects(
    resumed.merge({
      taskId: 'recon-secret',
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
      exchanges: [exchange('ex_secret', { bodyShape: 'configured-password' })],
    }),
    /secret material/i,
  );
});

test('persisted documents require a target origin and valid run status', async (t) => {
  for (const [field, value] of [
    ['targetOrigin', null],
    ['runStatus', 'paused'],
  ]) {
    await t.test(field, async (t) => {
      const { root, store } = await makeStore(t);
      const boardPath = path.join(root, '.shannon', 'blackbox', 'blackboard.json');
      const document = JSON.parse(await readFile(boardPath, 'utf8'));
      document[field] = value;
      await writeFile(boardPath, JSON.stringify(document), 'utf8');
      await assert.rejects(store.read(), new RegExp(field, 'i'));
    });
  }
});

test('a current contribution increments once and receives orchestrator-owned provenance', async (t) => {
  const { store, snapshot, taskId } = await makeRunningStore(t);
  const result = await store.merge({
    taskId,
    role: 'blackbox-recon',
    baseRevision: snapshot.revision,
    exchanges: [exchange()],
  });

  assert.equal(result.revision, snapshot.revision + 1);
  assert.equal(result.exchanges.length, 1);
  assert.deepEqual(result.exchanges[0].provenance, {
    actor: 'blackbox-recon',
    taskId,
    baseRevision: snapshot.revision,
  });
});

test('a stale contribution fails without changing the document', async (t) => {
  const { root, store, snapshot, taskId } = await makeRunningStore(t);
  await store.merge({
    taskId,
    role: 'blackbox-recon',
    baseRevision: snapshot.revision,
    exchanges: [exchange()],
  });
  const boardPath = path.join(root, '.shannon', 'blackbox', 'blackboard.json');
  const before = await readFile(boardPath, 'utf8');

  await assert.rejects(
    store.merge({
      taskId,
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
      exchanges: [exchange('ex_stale')],
    }),
    (error) => error instanceof blackboard.StaleBlackboardRevisionError,
  );
  assert.equal(await readFile(boardPath, 'utf8'), before);
});

test('unknown task and evidence references are rejected', async (t) => {
  await t.test('task', async (t) => {
    const { store } = await makeStore(t);
    await assert.rejects(
      store.merge({ taskId: 'missing', role: 'blackbox-recon', baseRevision: 0, exchanges: [] }),
      /unknown task/i,
    );
  });

  for (const kind of ['exchange', 'resource', 'action', 'proof']) {
    await t.test(kind, async (t) => {
      const { store, snapshot, taskId } = await makeRunningStore(t, 'analysis');
      await assert.rejects(
        store.merge({
          taskId,
          role: 'blackbox-analysis',
          baseRevision: snapshot.revision,
          hypotheses: [hypothesis('hyp_bad_ref', [{ id: `missing-${kind}`, kind }])],
        }),
        new RegExp(`unknown ${kind}`, 'i'),
      );
    });
  }

  await t.test('hypothesis', async (t) => {
    const { store, snapshot, taskId } = await makeRunningStore(t, 'action');
    await assert.rejects(
      store.merge({
        taskId,
        role: 'blackbox-action',
        baseRevision: snapshot.revision,
        actions: [action('act_bad_hypothesis', 'missing-hypothesis')],
      }),
      /unknown hypothesis/i,
    );
  });
});

test('worker roles cannot submit incompatible record types or verification results', async (t) => {
  await t.test('recon cannot submit candidate proofs', async (t) => {
    const { store, snapshot, taskId } = await makeRunningStore(t, 'recon');
    await assert.rejects(
      store.merge({
        taskId,
        role: 'blackbox-recon',
        baseRevision: snapshot.revision,
        candidateProofs: [{}],
      }),
      /blackbox-recon.*candidate proof/i,
    );
  });

  await t.test('analysis cannot submit action results', async (t) => {
    const { store, snapshot, taskId } = await makeRunningStore(t, 'analysis');
    await assert.rejects(
      store.merge({ taskId, role: 'blackbox-analysis', baseRevision: snapshot.revision, actions: [{}] }),
      /blackbox-analysis.*action/i,
    );
  });

  await t.test('action cannot submit verification results', async (t) => {
    const { store, snapshot, taskId } = await makeRunningStore(t, 'action');
    await assert.rejects(
      store.merge({
        taskId,
        role: 'blackbox-action',
        baseRevision: snapshot.revision,
        verifications: [{}],
      }),
      /worker.*verification/i,
    );
  });
});

test('duplicate handling is deterministic, idempotent only for identical records, and sorted', async (t) => {
  const { store, snapshot, taskId } = await makeRunningStore(t);
  const same = exchange('ex_002');
  const result = await store.merge({
    taskId,
    role: 'blackbox-recon',
    baseRevision: snapshot.revision,
    exchanges: [same, exchange('ex_001'), same],
  });
  assert.deepEqual(result.exchanges.map(({ exchangeId }) => exchangeId), ['ex_001', 'ex_002']);

  const before = await store.read();
  await assert.rejects(
    store.merge({
      taskId,
      role: 'blackbox-recon',
      baseRevision: before.revision,
      exchanges: [exchange('ex_002', { method: 'POST' }), exchange('ex_002')],
    }),
    /conflicting duplicate.*ex_002/i,
  );
  assert.deepEqual(await store.read(), before);
});

test('accepted and rejected tasks share one task ID namespace', async (t) => {
  const { store } = await makeStore(t);
  const snapshot = await store.registerTasks(0, {
    operationKey: 'register:accepted',
    accepted: [plannerTask('task_shared', 'analysis')],
    rejected: [],
  });
  const before = await store.read();

  await assert.rejects(
    store.registerTasks(snapshot.revision, {
      operationKey: 'register:rejected',
      accepted: [],
      rejected: [{ task: plannerTask('task_shared', 'analysis'), reason: 'duplicate' }],
    }),
    /duplicate task ID/i,
  );
  assert.deepEqual(await store.read(), before);
});

test('terminal status freezes the blackboard while preserving idempotent finalization retry', async (t) => {
  const { store } = await makeStore(t);
  const initial = await store.read();
  await assert.rejects(
    store.setRunStatus(0, 'finalize:invalid', 'paused'),
    /status must be terminal/i,
  );
  assert.deepEqual(await store.read(), initial);

  const terminal = await store.setRunStatus(0, 'finalize:complete', 'failed', 'replay evidence was unavailable');

  assert.equal(terminal.terminalFailure, 'replay evidence was unavailable');
  const retried = await store.setRunStatus(0, 'finalize:complete', 'failed', 'replay evidence was unavailable');
  assert.deepEqual(retried, terminal);
  await assert.rejects(
    store.setRunStatus(0, 'finalize:complete', 'failed', 'a different failure'),
    /different content/i,
  );
  await assert.rejects(
    store.registerTasks(terminal.revision, {
      operationKey: 'register:after-finalize',
      accepted: [plannerTask('late-task', 'analysis')],
      rejected: [],
    }),
    /terminal|final|running/i,
  );
  await assert.rejects(
    store.setRunStatus(terminal.revision, 'finalize:changed', 'failed', 'changed terminal state'),
    /terminal|final|running/i,
  );
  assert.deepEqual(await store.read(), terminal);
});

test('concurrent writes serialize and reject one stale writer', async (t) => {
  const { store } = await makeStore(t);
  let snapshot = await store.registerTasks(0, {
    operationKey: 'register:concurrent',
    accepted: [plannerTask('recon-a', 'recon', { identityLease: 'attacker' }), plannerTask('recon-b', 'recon', { identityLease: 'victim' })],
    rejected: [],
  });
  snapshot = await store.startTasks(snapshot.revision, 'start:concurrent', ['recon-a', 'recon-b']);

  const attempts = await Promise.allSettled([
    store.merge({
      taskId: 'recon-a',
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
      exchanges: [exchange('ex_a')],
    }),
    store.merge({
      taskId: 'recon-b',
      role: 'blackbox-recon',
      baseRevision: snapshot.revision,
      exchanges: [exchange('ex_b', { identity: 'victim' })],
    }),
  ]);

  assert.equal(attempts.filter(({ status }) => status === 'fulfilled').length, 1);
  const rejected = attempts.find(({ status }) => status === 'rejected');
  assert.equal(rejected?.status, 'rejected');
  assert.equal(rejected.reason instanceof blackboard.StaleBlackboardRevisionError, true);
  assert.equal((await store.read()).exchanges.length, 1);
});
