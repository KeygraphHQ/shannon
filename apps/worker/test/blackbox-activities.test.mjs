import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBlackboxActivities } from '../dist/blackbox/activities.js';

const TARGET_ORIGIN = 'https://target.example';
const SECRET = 'password-fixture-secret';

const REQUEST = (id) => `GET /api/items/${id} HTTP/1.1\r\nHost: target.example\r\nAccept: application/json\r\n\r\n`;
const RESPONSE = (id) => `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"${id}","owner":"user"}`;

function history(records) {
  return records.map(({ id }) => JSON.stringify({ request: REQUEST(id), response: RESPONSE(id), notes: '' })).join('\n');
}

function rawConfig(identityNames = ['attacker', 'victim', 'backup']) {
  return {
    rules: {},
    identities: identityNames.map((name) => ({
      name,
      role: 'ordinary user',
      authentication: {
        login_type: 'form',
        login_url: `${TARGET_ORIGIN}/login`,
        credentials: { username: `${name}@example.com`, password: SECRET },
        success_condition: { type: 'url_contains', value: '/dashboard' },
      },
    })),
  };
}

function input(root) {
  return {
    webUrl: `${TARGET_ORIGIN}/login`,
    repoPath: root,
    configPath: path.join(root, 'blackbox.yaml'),
    workspace: 'run-1',
    workflowId: 'workflow-1',
    auditDir: path.join(root, 'audit'),
  };
}

function logger() {
  const entries = [];
  return {
    entries,
    info(message, attrs) { entries.push(['info', message, attrs]); },
    warn(message, attrs) { entries.push(['warn', message, attrs]); },
    error(message, attrs) { entries.push(['error', message, attrs]); },
  };
}

function boardFake() {
  let snapshot = {
    schemaVersion: 1,
    revision: 0,
    targetOrigin: TARGET_ORIGIN,
    identities: [],
    exchanges: [],
    resources: [],
    transitions: [],
    hypotheses: [],
    actions: [],
    candidateProofs: [],
    verifications: [],
    tasks: [],
    rejectedTasks: [],
    runStatus: 'running',
  };
  const calls = [];
  return {
    calls,
    async initialize(value) {
      calls.push(['initialize', value]);
      snapshot = { ...snapshot, targetOrigin: value.targetOrigin, identities: value.identities };
      return structuredClone(snapshot);
    },
    async read() { calls.push(['read']); return structuredClone(snapshot); },
    async registerTasks(revision, batch) {
      calls.push(['registerTasks', revision, batch]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        tasks: [...snapshot.tasks, ...batch.accepted.map((task) => ({ ...task, status: 'pending' }))],
      };
      return structuredClone(snapshot);
    },
    async startTasks(revision, operationKey, taskIds) {
      calls.push(['startTasks', revision, operationKey, taskIds]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        tasks: snapshot.tasks.map((task) => taskIds.includes(task.taskId) ? { ...task, status: 'running' } : task),
      };
      return structuredClone(snapshot);
    },
    async settleTasks(batch) {
      calls.push(['settleTasks', batch]);
      const completed = new Set(batch.contributions.map(({ taskId }) => taskId));
      const failed = new Set(batch.failures.map(({ taskId }) => taskId));
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        exchanges: [...snapshot.exchanges, ...batch.contributions.flatMap(({ exchanges = [] }) => exchanges)],
        identities: snapshot.identities.map((entry) => {
          const capture = batch.identityCaptures?.find(({ identity }) => identity === entry.name);
          return capture ? { ...entry, authenticated: true, stateRef: capture.stateRef } : entry;
        }),
        tasks: snapshot.tasks.map((task) => completed.has(task.taskId)
          ? { ...task, status: 'completed' }
          : failed.has(task.taskId) ? { ...task, status: 'failed' } : task),
      };
      return structuredClone(snapshot);
    },
    async merge(contribution) {
      calls.push(['merge', contribution]);
      snapshot = { ...snapshot, revision: snapshot.revision + 1, exchanges: [...snapshot.exchanges, ...(contribution.exchanges ?? [])] };
      return structuredClone(snapshot);
    },
  };
}

function burpFake(historyQueue, calls, options = {}, cursor = { index: 0 }) {
  return {
    async connect() { calls.push(['connect']); if (options.connectError) throw new Error(options.connectError); },
    async close() { calls.push(['close']); if (options.closeError) throw new Error(options.closeError); },
    async call(name, args) {
      calls.push(['call', name, args]);
      if (name !== 'get_proxy_http_history_regex') throw new Error(`unexpected Burp tool ${name}`);
      return { content: [{ type: 'text', text: history(historyQueue[Math.min(cursor.index++, historyQueue.length - 1)] ?? []) }] };
    },
  };
}

async function makeDeps(t, root, options = {}) {
  const burpCalls = [];
  const browserCalls = [];
  const config = rawConfig(options.identityNames);
  const board = boardFake();
  const agents = [];
  const historyCursor = { index: 0 };
  const environment = options.environment ?? { SHANNON_BURP_PROXY_URL: 'http://proxy.example:8080' };
  const fileSystem = { readFile, writeFile, rm };
  const deps = {
    parseConfig(configPath, mode) {
      assert.equal(configPath, input(root).configPath);
      assert.equal(mode, 'blackbox');
      return config;
    },
    createBurpClient(settings) {
      deps.burpSettings = settings;
      return burpFake(options.historyQueue ?? [[], [{ id: 'preflight' }]], burpCalls, options, historyCursor);
    },
    writePlaywrightConfig: async (...args) => { deps.playwrightArgs = args; return { result: 'wrote', configPath: path.join(root, '.playwright', 'cli.config.json') }; },
    createBlackboardStore: () => board,
    async runBrowserCommand(...args) {
      browserCalls.push(args);
      const serialized = JSON.stringify(args);
      if (/state-save/.test(serialized)) {
        const identity = serialized.match(/bb-([a-z0-9-]+)/i)?.[1];
        if (identity) {
          const stateDir = path.join(root, '.shannon', 'blackbox', 'identities', identity);
          await mkdir(stateDir, { recursive: true });
          await writeFile(path.join(stateDir, 'storage-state.json'), JSON.stringify({ cookies: [], origins: [] }), 'utf8');
        }
      }
      return { stdout: /eval/.test(serialized) ? '__SHANNON_AUTH_OK__' : '', stderr: '', exitCode: 0 };
    },
    createAgentRunner: () => ({
      async run(runInput) {
        agents.push(runInput);
        if (options.agentErrorIdentity === runInput.identity?.name) throw new Error('bootstrap failed');
        return {
          taskId: runInput.task?.taskId ?? `${runInput.identity?.name ?? 'anonymous'}-task`,
          role: 'blackbox-recon',
          baseRevision: runInput.snapshot.revision,
          exchanges: [],
          resources: [],
          transitions: [],
        };
      },
    }),
    createAuditSession: () => ({ async initialize() {}, async startAgent() {}, async endAgent() {} }),
    logger: logger(),
    readEnvironment: () => environment,
    fileSystem,
  };
  t.after(() => rm(root, { recursive: true, force: true }));
  return { deps, board, agents, burpCalls, browserCalls };
}

async function tempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-activities-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('missing proxy fails before creating an agent or connecting to Burp', async (t) => {
  const root = await tempRoot(t);
  const { deps, burpCalls, agents } = await makeDeps(t, root, { environment: {} });
  const activities = createBlackboxActivities(deps);

  await assert.rejects(activities.preflightBlackbox(input(root)), /SHANNON_BURP_PROXY_URL|proxy/i);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(agents, []);
});

test('preflight applies black-box Burp defaults, requires history delta, and closes its browser session', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'preflight' }]],
  });
  const activities = createBlackboxActivities(deps);

  const result = await activities.preflightBlackbox(input(root));
  assert.equal(deps.burpSettings.url, 'http://host.docker.internal:9876');
  assert.equal(deps.burpSettings.hostHeader, '127.0.0.1:9876');
  assert.deepEqual(board.calls.slice(0, 2).map(([name]) => name), ['initialize', 'registerTasks']);
  const bootstrapTasks = board.calls[1][2].accepted;
  assert.deepEqual(bootstrapTasks.map(({ taskId }) => taskId), [
    'bootstrap-anonymous',
    'bootstrap-attacker',
    'bootstrap-victim',
    'bootstrap-backup',
  ]);
  assert.deepEqual(browserCalls, [
    ['playwright-cli', ['-s=blackbox-preflight', 'open', `${TARGET_ORIGIN}/login`], { cwd: root }],
    ['playwright-cli', ['-s=blackbox-preflight', 'close'], { cwd: root }],
  ]);
  assert.equal(result.targetOrigin, TARGET_ORIGIN);
  assert.equal(result.revision, 1);
  assert.equal(burpCalls.filter(([name]) => name === 'connect').length, 1);
  assert.equal(burpCalls.filter(([name]) => name === 'close').length, 1);
});

test('preflight rejects a browser navigation that produces no target history delta', async (t) => {
  const root = await tempRoot(t);
  const { deps, browserCalls, agents } = await makeDeps(t, root, { historyQueue: [[], []] });
  const activities = createBlackboxActivities(deps);

  await assert.rejects(activities.preflightBlackbox(input(root)), /history|proxy|traffic/i);
  assert.equal(browserCalls.some((args) => JSON.stringify(args).includes('close')), true);
  assert.deepEqual(agents, []);
});

test('missing required Burp tools fails preflight before browser or model execution', async (t) => {
  const root = await tempRoot(t);
  const { deps, burpCalls, browserCalls, agents } = await makeDeps(t, root, {
    connectError: 'Burp MCP is missing required tools: send_http2_request',
  });
  const activities = createBlackboxActivities(deps);

  await assert.rejects(activities.preflightBlackbox(input(root)), /send_http2_request|required tools/i);
  assert.equal(burpCalls.some(([name]) => name === 'connect'), true);
  assert.deepEqual(agents, []);
  assert.deepEqual(browserCalls, []);
});

test('capture bootstraps anonymous first, then identities sequentially, imports only the history delta, and returns no secrets', async (t) => {
  const root = await tempRoot(t);
  const identityNames = ['attacker', 'victim', 'backup'];
  const { deps, board, agents, browserCalls, burpCalls } = await makeDeps(t, root, {
    identityNames,
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'anonymous' }],
      [{ id: 'preflight' }, { id: 'anonymous' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }],
      [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }, { id: 'victim' }],
      [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }, { id: 'victim' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }, { id: 'victim' }, { id: 'backup' }],
    ],
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);

  await activities.preflightBlackbox(runInput);
  const anonymous = await activities.captureAnonymous(runInput);
  const attacker = await activities.captureIdentity(runInput, 'attacker');
  const victim = await activities.captureIdentity(runInput, 'victim');
  const backup = await activities.captureIdentity(runInput, 'backup');

  assert.deepEqual(agents.map((entry) => entry.identity?.name ?? 'anonymous'), ['anonymous', 'attacker', 'victim', 'backup']);
  for (const [index, agent] of agents.entries()) {
    assert.equal(agent.identity?.sensitiveValues?.includes('backup@example.com'), true);
    assert.equal(agent.identity?.sensitiveValues?.includes(SECRET), true);
    if (index === 0) {
      assert.equal(agent.identity?.credentials, undefined);
    } else {
      assert.deepEqual(agent.identity?.credentials, {
        username: `${identityNames[index - 1]}@example.com`,
        password: SECRET,
      });
    }
  }
  const sessions = browserCalls.map((args) => JSON.stringify(args)).filter((value) => /bb-(?:anonymous|attacker|victim|backup)/.test(value));
  assert.equal(new Set(sessions.map((value) => value.match(/bb-(?:anonymous|attacker|victim|backup)/)?.[0]).filter(Boolean)).size >= 4, true);
  const stateSaves = browserCalls.filter(([, args]) => args.includes('state-save'));
  assert.deepEqual(
    stateSaves.map(([, args]) => args),
    identityNames.map((name) => [
      `-s=bb-${name}`,
      'state-save',
      path.join(root, '.shannon', 'blackbox', 'identities', name, 'storage-state.json'),
    ]),
  );
  assert.equal(attacker.exchangeIds.length, 1);
  assert.equal(victim.exchangeIds.length, 1);
  assert.equal(backup.exchangeIds.length, 1);
  assert.equal(anonymous.exchangeIds.length, 1);
  const settledExchanges = board.calls
    .filter(([name]) => name === 'settleTasks')
    .flatMap(([, batch]) => batch.contributions.flatMap(({ exchanges = [] }) => exchanges));
  assert.equal(settledExchanges.length, 4);
  assert.equal(burpCalls.filter(([name, tool]) => name === 'call' && tool === 'get_proxy_http_history_regex').length, 10);
  assert.deepEqual(
    board.calls
      .filter(([name]) => name === 'settleTasks')
      .flatMap(([, batch]) => (batch.identityCaptures ?? []).map(({ identity }) => identity)),
    ['attacker', 'victim', 'backup'],
  );
  for (const result of [attacker, victim, backup]) {
    assert.deepEqual(Object.keys(result).sort(), ['authenticated', 'exchangeIds', 'failureReason', 'identity', 'revision', 'successEvidence']);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
    assert.equal(JSON.stringify(result).includes('HTTP/1.1'), false);
    assert.equal(JSON.stringify(result).includes('Cookie'), false);
    assert.equal(JSON.stringify(result).includes('Authorization'), false);
    assert.equal(JSON.stringify(result).includes('CSRF'), false);
    assert.equal(result.authenticated, true);
    assert.equal(result.successEvidence, '/dashboard');
  }
  assert.equal(anonymous.authenticated, false);
  assert.equal(anonymous.successEvidence, null);
  assert.equal(anonymous.failureReason, null);
});

test('one failed identity returns a safe failure while two successful identities remain possible', async (t) => {
  const root = await tempRoot(t);
  const { deps } = await makeDeps(t, root, {
    identityNames: ['attacker', 'victim', 'backup'],
    agentErrorIdentity: 'victim',
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'anonymous' }],
      [{ id: 'preflight' }, { id: 'anonymous' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }],
      [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }],
      [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }, { id: 'backup' }],
    ],
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);
  await activities.preflightBlackbox(runInput);
  await activities.captureAnonymous(runInput);
  const attacker = await activities.captureIdentity(runInput, 'attacker');
  const victim = await activities.captureIdentity(runInput, 'victim');
  const backup = await activities.captureIdentity(runInput, 'backup');

  assert.equal(attacker.authenticated, true);
  assert.equal(victim.authenticated, false);
  assert.equal(backup.authenticated, true);
  assert.match(victim.failureReason ?? '', /failed|bootstrap|identity/i);
  assert.equal(JSON.stringify(victim).includes(SECRET), false);
  assert.equal(JSON.stringify(victim).includes('HTTP/1.1'), false);
});

test('workers reject a running task of another kind before browser, Burp, or model side effects', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, agents, burpCalls, browserCalls } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'preflight' }]],
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);
  const preflight = await activities.preflightBlackbox(runInput);

  const actionTask = {
    taskId: 'action-wrong-role',
    kind: 'action',
    objective: 'Attempt an approved replay',
    evidence: [],
    identityLease: 'attacker',
    hypothesisId: 'hypothesis-1',
    status: 'pending',
    sourceExchangeId: 'exchange-1',
    proofCondition: { type: 'body_contains', marker: 'changed' },
  };
  const registeredAction = await board.registerTasks(preflight.revision, {
    operationKey: 'test:register-action',
    accepted: [actionTask],
    rejected: [],
  });
  const runningAction = await board.startTasks(registeredAction.revision, 'test:start-action', [actionTask.taskId]);
  const sideEffectsBeforeRecon = {
    agents: agents.length,
    burp: burpCalls.length,
    browser: browserCalls.length,
  };

  await assert.rejects(
    activities.runBlackboxRecon({ ...runInput, task: actionTask, revision: runningAction.revision }),
    /task kind|requires.*recon|recon.*kind/i,
  );
  assert.deepEqual(
    { agents: agents.length, burp: burpCalls.length, browser: browserCalls.length },
    sideEffectsBeforeRecon,
  );

  const reconTask = {
    taskId: 'recon-wrong-role',
    kind: 'recon',
    objective: 'Explore one route',
    evidence: [],
    identityLease: 'attacker',
    hypothesisId: null,
    status: 'pending',
  };
  const registeredRecon = await board.registerTasks(runningAction.revision, {
    operationKey: 'test:register-recon',
    accepted: [reconTask],
    rejected: [],
  });
  const runningRecon = await board.startTasks(registeredRecon.revision, 'test:start-recon', [reconTask.taskId]);
  const sideEffectsBeforeAnalysis = {
    agents: agents.length,
    burp: burpCalls.length,
    browser: browserCalls.length,
  };

  await assert.rejects(
    activities.runBlackboxAnalysis({ ...runInput, task: reconTask, revision: runningRecon.revision }),
    /task kind|requires.*analysis|analysis.*kind/i,
  );
  assert.deepEqual(
    { agents: agents.length, burp: burpCalls.length, browser: browserCalls.length },
    sideEffectsBeforeAnalysis,
  );
});

test('identity capture rejects a bootstrap task leased to another actor before external side effects', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, agents, burpCalls, browserCalls } = await makeDeps(t, root);
  const activities = createBlackboxActivities(deps);
  const wrongBootstrap = {
    taskId: 'bootstrap-attacker',
    kind: 'recon',
    objective: 'Incorrectly leased bootstrap',
    evidence: [],
    identityLease: 'victim',
    hypothesisId: null,
    status: 'pending',
  };
  await board.registerTasks(0, {
    operationKey: 'test:register-wrong-bootstrap',
    accepted: [wrongBootstrap],
    rejected: [],
  });

  await assert.rejects(
    activities.captureIdentity(input(root), 'attacker'),
    /bootstrap.*identity|identity.*lease|scope/i,
  );
  assert.deepEqual(agents, []);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
});

test('Burp close failure cannot replace a completed preflight or identity capture result', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root, {
    closeError: 'close transport failed',
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'attacker' }],
    ],
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);

  const preflight = await activities.preflightBlackbox(runInput);
  const capture = await activities.captureIdentity(runInput, 'attacker');

  assert.equal(preflight.revision, 1);
  assert.equal(capture.authenticated, true);
  assert.equal(
    board.calls
      .filter(([name]) => name === 'settleTasks')
      .at(-1)?.[1].contributions[0].taskId,
    'bootstrap-attacker',
  );
});
