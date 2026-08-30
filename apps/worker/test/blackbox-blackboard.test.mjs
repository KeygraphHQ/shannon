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

test('initialization atomically writes a redacted revision-zero document', async (t) => {
  const { root, snapshot } = await makeStore(t);
  const boardPath = path.join(root, '.shannon', 'blackbox', 'blackboard.json');
  const serialized = await readFile(boardPath, 'utf8');

  assert.equal(snapshot.revision, 0);
  assert.equal(snapshot.targetOrigin, TARGET_ORIGIN);
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
