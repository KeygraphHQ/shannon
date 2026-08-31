import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createBlackboxActivities } from '../dist/blackbox/activities.js';
import { validateAndScheduleWave } from '../dist/blackbox/scheduler.js';

const TARGET_ORIGIN = 'https://target.example';
const SECRET = 'password-fixture-secret';

const REQUEST = (id) => `GET /api/items/${id} HTTP/1.1\r\nHost: target.example\r\nAccept: application/json\r\n\r\n`;
const RESPONSE = (id) => `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"${id}","owner":"user"}`;

function normalizedExchange(exchangeId, overrides = {}) {
  return {
    exchangeId,
    routeSignature: `GET:/api/items/${exchangeId}`,
    identity: 'attacker',
    captureSequence: 1,
    method: 'GET',
    origin: TARGET_ORIGIN,
    path: `/api/items/${exchangeId}`,
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: `sha256:${exchangeId}`,
    candidateObjectReferences: [exchangeId],
    rawRecordRef: `raw/${exchangeId}.json`,
    provenance: { actor: 'blackbox-recon', taskId: 'bootstrap-attacker', baseRevision: 1 },
    ...overrides,
  };
}

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

function statePathFor(root, identity) {
  return path.join(root, '.shannon', 'blackbox', 'identities', identity, 'storage-state.json');
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

function boardFake(options = {}) {
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
    seed(value) { snapshot = { ...snapshot, ...structuredClone(value) }; },
    async initialize(value) {
      calls.push(['initialize', value]);
      if (options.boardInitializeError) throw new Error(options.boardInitializeError);
      snapshot = {
        ...snapshot,
        targetOrigin: value.targetOrigin,
        runScope: value.runScope,
        identities: snapshot.identities.length === 0 ? value.identities : snapshot.identities,
      };
      return structuredClone(snapshot);
    },
    async read() { calls.push(['read']); return structuredClone(snapshot); },
    async reservePlanningWave(revision, operationKey, waveNumber) {
      calls.push(['reservePlanningWave', revision, operationKey, waveNumber]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        planningWave: { waveNumber, phase: 'reserved', plannerStop: null },
      };
      return structuredClone(snapshot);
    },
    async registerTasks(revision, batch) {
      calls.push(['registerTasks', revision, batch]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        ...(batch.planningWave
          ? {
              planningWave: {
                waveNumber: batch.planningWave.waveNumber,
                phase: 'registered',
                plannerStop: batch.planningWave.plannerStop,
              },
            }
          : {}),
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
    async recoverInterruptedTasks(revision, operationKey) {
      calls.push(['recoverInterruptedTasks', revision, operationKey]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        tasks: snapshot.tasks.map((task) => task.status !== 'running'
          ? task
          : { ...task, status: task.kind === 'analysis' ? 'pending' : 'failed' }),
      };
      return structuredClone(snapshot);
    },
    async refreshIdentityCapture(revision, operationKey, identity) {
      calls.push(['refreshIdentityCapture', revision, operationKey, identity]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        identities: snapshot.identities.map((entry) =>
          entry.name === identity ? { ...entry, authenticated: false } : entry),
        tasks: snapshot.tasks.map((task) =>
          task.taskId === `bootstrap-${identity}` ? { ...task, status: 'pending' } : task),
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
    async recordVerification(revision, operationKey, attempt) {
      calls.push(['recordVerification', revision, operationKey, attempt]);
      snapshot = {
        ...snapshot,
        revision: snapshot.revision + 1,
        exchanges: [...snapshot.exchanges, ...attempt.exchanges],
        verifications: [...snapshot.verifications, attempt.verification],
      };
      return structuredClone(snapshot);
    },
    async recordPlanningDecision(revision, operationKey, waveNumber, decision) {
      calls.push(['recordPlanningDecision', revision, operationKey, waveNumber, decision]);
      if (snapshot.operationReceipts?.some((receipt) => receipt.operationKey === operationKey)) {
        return structuredClone(snapshot);
      }
      const nextRevision = snapshot.revision + 1;
      snapshot = {
        ...snapshot,
        revision: nextRevision,
        planningDecision: { waveNumber, decision },
        planningWave: null,
        operationReceipts: [
          ...(snapshot.operationReceipts ?? []),
          { operationKey, requestDigest: 'a'.repeat(64), revision: nextRevision },
        ],
      };
      return structuredClone(snapshot);
    },
    async setRunStatus(revision, operationKey, status) {
      calls.push(['setRunStatus', revision, operationKey, status]);
      snapshot = { ...snapshot, revision: snapshot.revision + 1, runStatus: status };
      return structuredClone(snapshot);
    },
  };
}

function burpFake(historyQueue, calls, options = {}, cursor = { index: 0 }) {
  return {
    async connect() { calls.push(['connect']); if (options.connectError) throw new Error(options.connectError); },
    async close() { calls.push(['close']); if (options.closeError) throw new Error(options.closeError); },
    async call(name, args, cancellationSignal) {
      calls.push(['call', name, args, cancellationSignal]);
      if (name !== 'get_proxy_http_history_regex') throw new Error(`unexpected Burp tool ${name}`);
      return { content: [{ type: 'text', text: history(historyQueue[Math.min(cursor.index++, historyQueue.length - 1)] ?? []) }] };
    },
  };
}

async function makeDeps(t, root, options = {}) {
  const burpCalls = [];
  const browserCalls = [];
  const config = rawConfig(options.identityNames);
  const board = boardFake(options);
  const agents = [];
  const auditCalls = [];
  const historyCursor = { index: 0 };
  const authCheckCursor = { index: 0 };
  const environment = options.environment ?? { SHANNON_BURP_PROXY_URL: 'http://proxy.example:8080' };
  const replayCalls = [];
  const fileSystem = { readFile, writeFile, mkdir, rm };
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
      const [, commandArguments] = args;
      const stateSaveIndex = commandArguments.indexOf('state-save');
      if (stateSaveIndex >= 0 && commandArguments[stateSaveIndex + 1]) {
        const stateFile = commandArguments[stateSaveIndex + 1];
        await mkdir(path.dirname(stateFile), { recursive: true });
        await writeFile(stateFile, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
      }
      const serialized = JSON.stringify(args);
      const isAuthCheck = /eval/.test(serialized);
      const configuredAuthResult = isAuthCheck
        ? options.authCheckQueue?.[
            Math.min(authCheckCursor.index++, Math.max((options.authCheckQueue?.length ?? 1) - 1, 0))
          ]
        : undefined;
      return {
        stdout: isAuthCheck
          ? options.authCheckOutput ?? (configuredAuthResult === false
            ? '__SHANNON_AUTH_FAILED__'
            : '__SHANNON_AUTH_OK__')
          : '',
        stderr: '',
        exitCode: 0,
      };
    },
    createAgentRunner: () => ({
      async run(runInput) {
        agents.push(runInput);
        if (options.agentHandler) return options.agentHandler(runInput);
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
    createAuditSession: (_input, scope) => ({
      async initialize(workflowId) { auditCalls.push(['initialize', workflowId, scope]); },
      async addResumeAttempt(workflowId, terminated) { auditCalls.push(['resume', workflowId, terminated]); },
      async startAgent() {},
      async endAgent() {},
    }),
    logger: logger(),
    getCancellationSignal: () => options.cancellationSignal,
    readEnvironment: () => environment,
    fileSystem,
    createReplayRawStore: () => ({}),
    createReplayService(replayOptions) {
      return {
        async replay(command) {
          replayCalls.push({ command, options: replayOptions });
          if (options.replayHandler) return options.replayHandler(command, replayOptions, replayCalls.length);
          return { status: 'needs_fresh_actor_request', stepId: command.steps[0]?.stepId, routeSignature: 'route-1' };
        },
      };
    },
    ...(options.publishArtifacts ? { publishArtifacts: options.publishArtifacts } : {}),
    ...(options.copyDeliverables ? { copyDeliverables: options.copyDeliverables } : {}),
  };
  t.after(() => rm(root, { recursive: true, force: true }));
  return { deps, board, agents, auditCalls, burpCalls, browserCalls, replayCalls };
}

async function tempRoot(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-blackbox-activities-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test('capture interprets Playwright auth results without accepting malformed structured output', async (t) => {
  const cases = [
    {
      name: 'structured success',
      output: [
        '### Result',
        '"__SHANNON_AUTH_OK__"',
        '### Ran Playwright code',
        "(() => (true ? '__SHANNON_AUTH_OK__' : '__SHANNON_AUTH_FAILED__'))()",
      ].join('\n'),
      expected: true,
    },
    {
      name: 'structured failure',
      output: [
        '### Result',
        '"__SHANNON_AUTH_FAILED__"',
        '### Ran Playwright code',
        "(() => (false ? '__SHANNON_AUTH_OK__' : '__SHANNON_AUTH_FAILED__'))()",
      ].join('\n'),
      expected: false,
    },
    { name: 'missing result heading', output: '### Ran Playwright code\n__SHANNON_AUTH_OK__', expected: false },
    { name: 'missing/truncated code heading', output: '### Result\n__SHANNON_AUTH_OK__\n### Ran Playwright', expected: false },
    {
      name: 'reversed headings',
      output: '### Ran Playwright code\nsource\n### Result\n__SHANNON_AUTH_OK__',
      expected: false,
    },
    { name: 'plain success', output: '__SHANNON_AUTH_OK__', expected: true },
    { name: 'plain failure', output: '__SHANNON_AUTH_FAILED__', expected: false },
  ];

  for (const { name, output, expected } of cases) {
    await t.test(name, async (caseTest) => {
      const root = await tempRoot(caseTest);
      const { deps } = await makeDeps(caseTest, root, {
        identityNames: ['attacker'],
        authCheckOutput: output,
        historyQueue: [
          [], [{ id: 'preflight' }],
          [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'attacker' }],
        ],
      });
      const activities = createBlackboxActivities(deps);

      await activities.preflightBlackbox(input(root));
      if (expected) {
        const capture = await activities.captureIdentity(input(root), 'attacker');
        assert.equal(capture.authenticated, true);
        assert.equal(capture.exchangeIds.length, 1);
      } else {
        const capture = await activities.captureIdentity(input(root), 'attacker');
        assert.equal(capture.authenticated, false);
      }
    });
  }
});

test('missing proxy fails before creating an agent or connecting to Burp', async (t) => {
  const root = await tempRoot(t);
  const { deps, burpCalls, agents } = await makeDeps(t, root, { environment: {} });
  const activities = createBlackboxActivities(deps);

  await assert.rejects(activities.preflightBlackbox(input(root)), /SHANNON_BURP_PROXY_URL|proxy/i);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(agents, []);
});

test('persisted scope mismatch fails before Burp, browser, replay, or model effects', async (t) => {
  const root = await tempRoot(t);
  const { deps, burpCalls, browserCalls, replayCalls, agents } = await makeDeps(t, root, {
    boardInitializeError: 'Black-box resume scope mismatch: burpProxyUrl',
  });
  const activities = createBlackboxActivities(deps);

  await assert.rejects(activities.preflightBlackbox(input(root)), /scope mismatch.*burpProxyUrl/i);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(replayCalls, []);
  assert.deepEqual(agents, []);
});

test('preflight applies black-box Burp defaults, requires history delta, and closes its browser session', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'preflight' }]],
  });
  const activities = createBlackboxActivities(deps);

  const result = await activities.preflightBlackbox(input(root));
  assert.equal(deps.burpSettings.url, 'http://host.docker.internal:9876/');
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

test('activities forward Temporal cancellation to model, browser, and Burp boundaries', async (t) => {
  const root = await tempRoot(t);
  const controller = new AbortController();
  const { deps, board, agents, burpCalls, browserCalls } = await makeDeps(t, root, {
    cancellationSignal: controller.signal,
    historyQueue: [[], [{ id: 'preflight' }]],
    agentHandler: async () => ({ baseRevision: 0, tasks: [], stop: true }),
  });
  const activities = createBlackboxActivities(deps);

  const preflight = await activities.preflightBlackbox(input(root));
  board.seed({ revision: preflight.revision });
  await activities.runBlackboxPlanner(input(root), preflight.revision);

  assert.equal(
    burpCalls.filter(([name]) => name === 'call').every((call) => call[3] === controller.signal),
    true,
  );
  const openCall = browserCalls.find(([, args]) => args.includes('open'));
  assert.equal(openCall[2].signal, controller.signal);
  const closeCall = browserCalls.find(([, args]) => args.includes('close'));
  assert.equal('signal' in closeCall[2], false);
  assert.equal(agents.at(-1).cancellationSignal, controller.signal);
});

test('resume records its workflow, recovers once, and reuses a completed bootstrap capture', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, auditCalls, burpCalls, browserCalls, agents } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'preflight' }]],
  });
  board.seed({
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: name === 'attacker',
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    tasks: [
      {
        taskId: 'bootstrap-attacker',
        kind: 'recon',
        objective: 'captured before interruption',
        evidence: [],
        identityLease: 'attacker',
        hypothesisId: null,
        status: 'completed',
      },
      {
        taskId: 'resume-analysis',
        kind: 'analysis',
        objective: 'resume analysis',
        evidence: [],
        identityLease: null,
        hypothesisId: null,
        status: 'pending',
      },
      {
        taskId: 'resume-recon',
        kind: 'recon',
        objective: 'resume recon',
        evidence: [],
        identityLease: 'attacker',
        hypothesisId: null,
        status: 'pending',
      },
      {
        taskId: 'resume-action',
        kind: 'action',
        objective: 'resume approved action',
        evidence: [],
        identityLease: 'attacker',
        hypothesisId: 'resume-hypothesis',
        status: 'pending',
        replayPlan: {
          steps: [],
          proofCondition: { type: 'body_contains', marker: 'resume-marker' },
        },
      },
    ],
  });
  const runInput = {
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
    terminatedWorkflows: ['workflow-1'],
  };
  const activities = createBlackboxActivities(deps);

  await mkdir(path.dirname(statePathFor(root, 'attacker')), { recursive: true });
  await writeFile(statePathFor(root, 'attacker'), JSON.stringify({ cookies: [], origins: [] }), 'utf8');

  const preflight = await activities.preflightBlackbox(runInput);
  const effectCounts = [burpCalls.length, browserCalls.length, agents.length];
  const capture = await activities.captureIdentity(runInput, 'attacker');

  assert.equal(capture.authenticated, true);
  assert.equal(capture.revision > 0, true);
  assert.deepEqual(preflight.resumedTasks.map(({ taskId }) => taskId), [
    'resume-analysis',
    'resume-recon',
    'resume-action',
  ]);
  assert.equal(burpCalls.length, effectCounts[0]);
  assert.equal(agents.length, effectCounts[2]);
  assert.equal(browserCalls.slice(effectCounts[1]).some(([, args]) => args.includes('state-load')), true);
  assert.equal(browserCalls.slice(effectCounts[1]).some(([, args]) => args.includes('eval')), true);
  assert.equal(browserCalls.slice(effectCounts[1]).some(([, args]) => args.includes('state-save')), true);
  assert.equal(board.calls.some(([name]) => name === 'refreshIdentityCapture'), false);
  assert.equal(board.calls.filter(([name]) => name === 'recoverInterruptedTasks').length, 1);
  assert.deepEqual(auditCalls.find(([name]) => name === 'resume')?.slice(1), [
    'workflow-resume',
    ['workflow-1'],
  ]);
});

test('resume returns a committed terminal result without repeating external work', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, auditCalls, burpCalls, browserCalls, agents } = await makeDeps(t, root);
  const artifactNames = [
    'traffic_inventory.json',
    'blackbox_blackboard.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
  ];
  const artifactDirectory = path.join(root, '.shannon', 'deliverables');
  const outputPath = path.join(root, 'resumed-output');
  await mkdir(artifactDirectory, { recursive: true });
  for (const artifactName of artifactNames) {
    await writeFile(
      path.join(artifactDirectory, artifactName),
      artifactName === 'blackbox_blackboard.json'
        ? JSON.stringify({
            revision: 9,
            targetOrigin: TARGET_ORIGIN,
            runStatus: 'incomplete',
            failure: 'planner stopped before coverage completed',
          })
        : '{}',
      'utf8',
    );
  }
  board.seed({
    revision: 9,
    runStatus: 'incomplete',
    operationReceipts: [{
      operationKey: 'workflow-1:8:finalize:',
      requestDigest: `sha256:${'a'.repeat(64)}`,
      revision: 9,
    }],
  });
  const runInput = {
    ...input(root),
    outputPath,
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
    terminatedWorkflows: ['workflow-1'],
  };

  const preflight = await createBlackboxActivities(deps).preflightBlackbox(runInput);

  assert.deepEqual(preflight.terminalResult, {
    mode: 'blackbox',
    status: 'incomplete',
    revision: 9,
    findingCount: 0,
    artifactNames,
    failures: ['planner stopped before coverage completed'],
  });
  for (const artifactName of artifactNames) {
    assert.equal(await readFile(path.join(outputPath, artifactName), 'utf8'), await readFile(path.join(artifactDirectory, artifactName), 'utf8'));
  }
  assert.deepEqual(board.calls.map(([name]) => name), ['initialize']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
  assert.deepEqual(auditCalls.find(([name]) => name === 'resume')?.slice(1), [
    'workflow-resume',
    ['workflow-1'],
  ]);
});

test('resume rejects a terminal board created by artifact-publication fallback', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls, agents } = await makeDeps(t, root);
  board.seed({
    revision: 9,
    runStatus: 'incomplete',
    operationReceipts: [{
      operationKey: 'workflow-1:2:finalize::incomplete',
      requestDigest: `sha256:${'b'.repeat(64)}`,
      revision: 9,
    }],
  });

  await assert.rejects(
    createBlackboxActivities(deps).preflightBlackbox({
      ...input(root),
      workflowId: 'workflow-resume',
      resumeFromWorkspace: 'run-1',
    }),
    /artifact publication.*did not complete|terminal.*artifact/i,
  );
  assert.deepEqual(board.calls.map(([name]) => name), ['initialize']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
});

test('resume refreshes a completed bootstrap when persisted identity state is missing', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, agents } = await makeDeps(t, root, {
    identityNames: ['attacker'],
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'attacker-refresh' }],
    ],
  });
  board.seed({
    identities: [{
      name: 'attacker',
      role: 'ordinary user',
      authenticated: true,
      stateRef: '.shannon/blackbox/identities/attacker/storage-state.json',
    }],
    tasks: [{
      taskId: 'bootstrap-attacker',
      kind: 'recon',
      objective: 'captured before interruption',
      evidence: [],
      identityLease: 'attacker',
      hypothesisId: null,
      status: 'completed',
    }],
  });
  const runInput = {
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  };
  const activities = createBlackboxActivities(deps);

  await activities.preflightBlackbox(runInput);
  const capture = await activities.captureIdentity(runInput, 'attacker');

  assert.equal(capture.authenticated, true);
  assert.equal(board.calls.filter(([name]) => name === 'refreshIdentityCapture').length, 1);
  assert.equal(agents.length, 1);
});

test('resume surfaces candidate proofs whose verifier result was never committed', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls, agents } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'preflight' }]],
  });
  board.seed({
    candidateProofs: [
      { candidateId: 'candidate-unresolved' },
      { candidateId: 'candidate-verified' },
    ],
    verifications: [{ candidateId: 'candidate-verified', verdict: 'verified' }],
  });

  const preflight = await createBlackboxActivities(deps).preflightBlackbox({
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  });

  assert.deepEqual(preflight.unresolvedCandidateIds, ['candidate-unresolved']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
});

test('resume surfaces a durable finalization decision before external work', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls, agents } = await makeDeps(t, root);
  board.seed({
    revision: 14,
    planningDecision: { waveNumber: 5, decision: 'incomplete' },
  });

  const preflight = await createBlackboxActivities(deps).preflightBlackbox({
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  });

  assert.equal(preflight.consumedPlanningWaves, 5);
  assert.equal(preflight.finalizationIntent, 'incomplete');
  assert.deepEqual(board.calls.map(([name]) => name), ['initialize']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
});

test('resume finalizes a reserved wave at the safety cap before target traffic', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls, agents } = await makeDeps(t, root);
  board.seed({
    revision: 14,
    planningDecision: { waveNumber: 7, decision: 'continue' },
    planningWave: { waveNumber: 8, phase: 'reserved', plannerStop: null },
  });

  const preflight = await createBlackboxActivities(deps).preflightBlackbox({
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  });

  assert.equal(preflight.consumedPlanningWaves, 8);
  assert.equal(preflight.finalizationIntent, 'incomplete');
  assert.deepEqual(board.calls.map(([name]) => name), ['initialize']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
});

test('resume restores the consumed wave from a committed planner registration', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, burpCalls, browserCalls, agents } = await makeDeps(t, root);
  board.seed({
    revision: 14,
    planningDecision: { waveNumber: 5, decision: 'continue' },
    operationReceipts: [{
      operationKey: 'prior-workflow:6:register:task-6',
      requestDigest: 'a'.repeat(64),
      revision: 13,
    }],
    candidateProofs: [{ candidateId: 'candidate-unresolved' }],
  });

  const preflight = await createBlackboxActivities(deps).preflightBlackbox({
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  });

  assert.equal(preflight.consumedPlanningWaves, 6);
  assert.equal(preflight.finalizationIntent, null);
  assert.deepEqual(preflight.unresolvedCandidateIds, ['candidate-unresolved']);
  assert.deepEqual(burpCalls, []);
  assert.deepEqual(browserCalls, []);
  assert.deepEqual(agents, []);
});

test('resume returns a registered wave for evaluation with its durable planner stop bit', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root);
  board.seed({
    revision: 14,
    planningDecision: { waveNumber: 4, decision: 'continue' },
    planningWave: { waveNumber: 5, phase: 'registered', plannerStop: true },
    candidateProofs: [{ candidateId: 'candidate-unresolved' }],
  });

  const preflight = await createBlackboxActivities(deps).preflightBlackbox({
    ...input(root),
    workflowId: 'workflow-resume',
    resumeFromWorkspace: 'run-1',
  });

  assert.equal(preflight.consumedPlanningWaves, 5);
  assert.deepEqual(preflight.pendingPlanningEvaluation, { waveNumber: 5, plannerStop: true });
});

test('planner task IDs are namespaced by evidence revision before scheduling', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, agents } = await makeDeps(t, root, {
    agentHandler: async (runInput) => ({
      baseRevision: 0,
      tasks: [{
        taskId: 'task-1',
        kind: 'analysis',
        objective: 'Compare ownership evidence',
        evidence: [{ id: 'exchange-1', kind: 'exchange' }],
        identityLease: null,
        hypothesisId: null,
        status: 'running',
      }],
      stop: false,
    }),
  });
  const activities = createBlackboxActivities(deps);

  const failedRecon = {
    taskId: 'recon-interrupted',
    kind: 'recon',
    objective: 'Replan the interrupted browser exploration',
    evidence: [],
    identityLease: 'attacker',
    hypothesisId: null,
    status: 'failed',
  };
  board.seed({ revision: 7, tasks: [failedRecon] });
  const first = await activities.runBlackboxPlanner(input(root), 7);
  board.seed({ revision: 8 });
  const second = await activities.runBlackboxPlanner(input(root), 8);

  assert.match(first.tasks[0].taskId, /^task_[a-f0-9]{24}$/);
  assert.notEqual(first.tasks[0].taskId, 'task-1');
  assert.notEqual(first.tasks[0].taskId, second.tasks[0].taskId);
  assert.equal(first.baseRevision, 7);
  assert.equal(first.tasks[0].status, 'pending');
  assert.deepEqual(agents[0].snapshot.failedTasks, [{
    taskId: failedRecon.taskId,
    kind: failedRecon.kind,
    objective: failedRecon.objective,
    identityLease: failedRecon.identityLease,
    hypothesisId: failedRecon.hypothesisId,
  }]);
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

test('recon preserves attributable traffic when the model submission fails after browsing', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root, {
    identityNames: ['attacker'],
    agentErrorIdentity: 'attacker',
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'bootstrap-attacker' }],
      [{ id: 'bootstrap-attacker' }], [{ id: 'bootstrap-attacker' }, { id: 'later-recon' }],
    ],
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);
  await activities.preflightBlackbox(runInput);

  const capture = await activities.captureIdentity(runInput, 'attacker');
  assert.equal(capture.authenticated, true);
  assert.equal(capture.exchangeIds.length, 1);

  const reconTask = {
    taskId: 'recon-after-model-failure',
    kind: 'recon',
    objective: 'Exercise another observed route',
    evidence: [{ id: capture.exchangeIds[0], kind: 'exchange' }],
    identityLease: 'attacker',
    hypothesisId: null,
    status: 'running',
  };
  board.seed({ revision: capture.revision, tasks: [reconTask] });
  const contribution = await activities.runBlackboxRecon({
    ...runInput,
    task: reconTask,
    revision: capture.revision,
  });
  assert.equal(contribution.exchanges?.length, 1);
  assert.equal(contribution.resources, undefined);
  assert.equal(contribution.transitions, undefined);
});

test('model-created recon record IDs are task-namespaced and internal references follow them', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root, {
    identityNames: ['attacker'],
    historyQueue: [
      [], [{ id: 'preflight' }],
      [{ id: 'preflight' }], [{ id: 'preflight' }, { id: 'anonymous' }],
      [{ id: 'preflight' }, { id: 'anonymous' }], [{ id: 'preflight' }, { id: 'anonymous' }, { id: 'attacker' }],
    ],
    agentHandler: async (runInput) => ({
      taskId: runInput.task.taskId,
      role: 'blackbox-recon',
      baseRevision: runInput.snapshot.revision,
      resources: [{
        resourceId: 'resource-1',
        resourceType: 'account',
        objectReferences: ['1'],
        ownerIdentity: runInput.identity.name === 'anonymous' ? null : runInput.identity.name,
        visibility: 'private',
        evidence: [],
        provenance: { actor: 'blackbox-recon', taskId: runInput.task.taskId, baseRevision: runInput.snapshot.revision },
      }],
      transitions: [{
        transitionId: 'transition-1',
        identity: runInput.identity.name,
        fromState: 'before',
        toState: 'after',
        triggerExchangeId: 'exchange-1',
        captureSequence: 1,
        resourceId: 'resource-1',
        provenance: { actor: 'blackbox-recon', taskId: runInput.task.taskId, baseRevision: runInput.snapshot.revision },
      }],
    }),
  });
  const activities = createBlackboxActivities(deps);
  const runInput = input(root);

  await activities.preflightBlackbox(runInput);
  await activities.captureAnonymous(runInput);
  await activities.captureIdentity(runInput, 'attacker');

  const contributions = board.calls
    .filter(([name]) => name === 'settleTasks')
    .flatMap(([, batch]) => batch.contributions)
    .filter(({ resources }) => resources?.length);
  assert.equal(contributions.length, 2);
  assert.notEqual(contributions[0].resources[0].resourceId, contributions[1].resources[0].resourceId);
  for (const contribution of contributions) {
    assert.match(contribution.resources[0].resourceId, /^resource_[a-f0-9]{24}$/);
    assert.match(contribution.transitions[0].transitionId, /^transition_[a-f0-9]{24}$/);
    assert.equal(contribution.transitions[0].resourceId, contribution.resources[0].resourceId);
  }
});

test('later recon previews and persists the same globally sequenced exchange IDs', async (t) => {
  const root = await tempRoot(t);
  const existing = normalizedExchange('existing-exchange', {
    captureSequence: 7,
    routeSignature: 'route_existing',
  });
  const task = {
    taskId: 'recon-with-existing-history',
    kind: 'recon',
    objective: 'Exercise another authenticated route',
    evidence: [{ id: existing.exchangeId, kind: 'exchange' }],
    identityLease: 'attacker',
    hypothesisId: null,
    status: 'running',
  };
  const { deps, board } = await makeDeps(t, root, {
    historyQueue: [[], [{ id: 'new-route' }], [{ id: 'new-route' }]],
    agentHandler: async (runInput) => {
      const readHistory = runInput.customTools.find(({ name }) => name === 'read_target_history');
      const previewResult = await readHistory.execute('read-later-recon', {});
      const preview = previewResult.details;
      return {
        taskId: task.taskId,
        role: 'blackbox-recon',
        baseRevision: 4,
        resources: [{
          resourceId: 'resource-1',
          resourceType: 'item',
          objectReferences: ['new-route'],
          ownerIdentity: 'attacker',
          visibility: 'private',
          evidence: [{ id: preview[0].exchangeId, kind: 'exchange' }],
          provenance: { actor: 'blackbox-recon', taskId: task.taskId, baseRevision: 4 },
        }],
      };
    },
  });
  board.seed({
    revision: 4,
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: true,
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    exchanges: [existing],
    tasks: [task],
  });

  const contribution = await createBlackboxActivities(deps).runBlackboxRecon({
    ...input(root),
    task,
    revision: 4,
  });

  assert.equal(contribution.exchanges?.[0].captureSequence, 8);
  assert.equal(contribution.resources?.[0].evidence[0].id, contribution.exchanges?.[0].exchangeId);
});

test('recon does not overwrite a known-good identity state after the live session loses authentication', async (t) => {
  const root = await tempRoot(t);
  const { deps, board, browserCalls } = await makeDeps(t, root, {
    identityNames: ['attacker'],
    authCheckQueue: [true, false],
    historyQueue: [[], [{ id: 'recon' }]],
  });
  const task = {
    taskId: 'recon-auth-expired',
    kind: 'recon',
    objective: 'Exercise one authenticated route',
    evidence: [{ id: 'exchange-1', kind: 'exchange' }],
    identityLease: 'attacker',
    hypothesisId: null,
    status: 'running',
  };
  board.seed({
    revision: 4,
    identities: [{
      name: 'attacker',
      role: 'ordinary user',
      authenticated: true,
      stateRef: '.shannon/blackbox/identities/attacker/storage-state.json',
    }],
    tasks: [task],
  });

  await assert.rejects(
    createBlackboxActivities(deps).runBlackboxRecon({ ...input(root), task, revision: 4 }),
    /no longer authenticated/i,
  );
  assert.equal(browserCalls.some(([, args]) => args.includes('state-save')), false);
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
    replayPlan: {
      steps: [{
        stepId: 'step-1',
        sourceExchangeId: 'exchange-1',
        actor: 'attacker',
        mutations: [{ type: 'set_path', path: '/api/items/2' }],
      }],
      proofCondition: { type: 'body_contains', marker: 'changed' },
    },
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

test('action executes the persisted replay plan and derives its result from the replay service', async (t) => {
  const root = await tempRoot(t);
  const source = normalizedExchange('source-exchange');
  const replayed = normalizedExchange('action-exchange', {
    identity: 'attacker',
    path: '/api/items/victim',
    provenance: { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 7 },
  });
  const persistedTask = {
    taskId: 'action-1',
    kind: 'action',
    objective: 'Replay the victim object route as attacker',
    evidence: [
      { id: source.exchangeId, kind: 'exchange' },
      { id: 'resource-victim', kind: 'resource' },
    ],
    identityLease: 'attacker',
    hypothesisId: 'hypothesis-1',
    status: 'running',
    replayPlan: {
      steps: [{
        stepId: 'step-1',
        sourceExchangeId: source.exchangeId,
        actor: 'attacker',
        mutations: [{ type: 'set_path', path: '/api/items/victim' }],
      }],
      proofCondition: { type: 'body_contains', marker: 'victim-private-marker' },
    },
  };
  const observation = {
    condition: persistedTask.replayPlan.proofCondition,
    passed: true,
    baselineExchangeId: source.exchangeId,
    baselinePassed: true,
    controlExchangeIds: [],
    controlPassed: false,
    proofSourceRequestDigest: 'a'.repeat(64),
    proofSentRequestDigest: 'a'.repeat(64),
    observedMarkerDigest: createHash('sha256').update('victim-private-marker').digest('hex'),
    observedTransitionId: null,
    verificationExchangeId: replayed.exchangeId,
  };
  let actionToolResult;
  const { deps, board, replayCalls, browserCalls } = await makeDeps(t, root, {
    historyQueue: [[], []],
    replayHandler: async () => ({
      status: 'completed',
      exchanges: [replayed],
      comparison: {
        baselineExchangeId: source.exchangeId,
        observedExchangeId: replayed.exchangeId,
        baselineStatus: 200,
        observedStatus: 200,
        statusChanged: false,
        baselineFingerprint: 'sha256:source',
        observedFingerprint: 'sha256:action',
        fingerprintChanged: true,
      },
      observation,
    }),
    agentHandler: async (runInput) => {
      const replay = runInput.customTools.find(({ name }) => name === 'replay_target_request');
      actionToolResult = await replay.execute('replay-1', { actionId: persistedTask.taskId });
      return {
        taskId: persistedTask.taskId,
        role: 'blackbox-action',
        baseRevision: 7,
        candidateProofs: [{
          candidateId: 'candidate-1',
          hypothesisId: 'model-copied-the-wrong-hypothesis',
          victimIdentity: 'victim',
          attackerIdentity: 'attacker',
          victimResourceId: 'resource-victim',
          baselineExchangeId: source.exchangeId,
          actionId: 'model-copied-the-wrong-action',
          verificationSourceExchangeId: replayed.exchangeId,
          demonstratedAction: 'read another user private object',
          concreteEffect: 'private object contents were disclosed',
          affectedParty: 'users',
          preconditions: ['attacker has an ordinary account'],
          provenance: { actor: 'blackbox-action', taskId: persistedTask.taskId, baseRevision: 7 },
        }],
      };
    },
  });
  board.seed({
    revision: 7,
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: true,
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    exchanges: [source],
    resources: [{
      resourceId: 'resource-victim',
      resourceType: 'private item',
      objectReferences: ['victim'],
      ownerIdentity: 'victim',
      visibility: 'private',
      evidence: [{ id: source.exchangeId, kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'bootstrap-victim', baseRevision: 1 },
    }],
    hypotheses: [{
      hypothesisId: 'hypothesis-1',
      kind: 'horizontal',
      summary: 'An attacker may read a victim item.',
      preconditions: ['two accounts'],
      attackerCapability: 'read another user item',
      evidence: [{ id: source.exchangeId, kind: 'exchange' }],
      priority: 'high',
      status: 'queued',
      provenance: { actor: 'blackbox-analysis', taskId: 'analysis-1', baseRevision: 6 },
    }],
    tasks: [persistedTask],
  });
  const forgedInputTask = {
    ...persistedTask,
    replayPlan: {
      ...persistedTask.replayPlan,
      steps: [{
        ...persistedTask.replayPlan.steps[0],
        mutations: [{ type: 'set_path', path: '/forged-by-caller' }],
      }],
    },
  };

  const contribution = await createBlackboxActivities(deps).runBlackboxAction({
    ...input(root),
    task: forgedInputTask,
    revision: 7,
  });

  assert.deepEqual(replayCalls.map(({ command }) => command), [{
    actionId: persistedTask.taskId,
    ...persistedTask.replayPlan,
  }]);
  assert.equal(browserCalls.some(([, args]) => args.includes('state-save') && args.at(-1) === statePathFor(root, 'attacker')), true);
  assert.equal(JSON.stringify(actionToolResult).includes('HTTP/1.1'), false);
  assert.deepEqual(contribution.exchanges?.map(({ exchangeId }) => exchangeId), [replayed.exchangeId]);
  assert.deepEqual(contribution.actions, [{
    actionId: persistedTask.taskId,
    hypothesisId: persistedTask.hypothesisId,
    sequence: { actionId: persistedTask.taskId, ...persistedTask.replayPlan },
    status: 'completed',
    exchangeIds: [replayed.exchangeId],
    observation,
    provenance: { actor: 'blackbox-action', taskId: persistedTask.taskId, baseRevision: 7 },
  }]);
  assert.deepEqual(contribution.candidateProofs?.map(({ candidateId }) => candidateId), [
    `candidate_${createHash('sha256')
      .update(`${persistedTask.taskId}\0candidate\0candidate-1`)
      .digest('hex')
      .slice(0, 24)}`,
  ]);
  assert.equal(contribution.candidateProofs?.[0].hypothesisId, persistedTask.hypothesisId);
  assert.equal(contribution.candidateProofs?.[0].actionId, persistedTask.taskId);

  deps.createReplayService = () => ({
    async replay() {
      return {
        status: 'completed',
        exchanges: [replayed],
        comparison: {
          baselineExchangeId: source.exchangeId,
          observedExchangeId: replayed.exchangeId,
          baselineStatus: 200,
          observedStatus: 200,
          statusChanged: false,
          baselineFingerprint: 'sha256:source',
          observedFingerprint: 'sha256:action',
          fingerprintChanged: true,
        },
        observation: { ...observation, controlPassed: true },
      };
    },
  });
  const nondiscriminating = await createBlackboxActivities(deps).runBlackboxAction({
    ...input(root),
    task: persistedTask,
    revision: 7,
  });
  assert.equal(nondiscriminating.candidateProofs, undefined);

  deps.createReplayService = () => ({
    async replay() {
      return { status: 'delivery_unknown', reason: 'dispatch outcome is unknown' };
    },
  });
  deps.createAgentRunner = () => ({
    async run(runInput) {
      const replay = runInput.customTools.find(({ name }) => name === 'replay_target_request');
      await replay.execute('replay-delivery-unknown', { actionId: persistedTask.taskId });
      throw new Error('model failed after dispatch');
    },
  });
  const preserved = await createBlackboxActivities(deps).runBlackboxAction({
    ...input(root),
    task: persistedTask,
    revision: 7,
  });
  assert.equal(preserved.actions[0].status, 'delivery_unknown');
  assert.equal(preserved.candidateProofs, undefined);
});

test('verifier replays the approved sequence under fresh identity state and derives immutable evidence fields', async (t) => {
  const root = await tempRoot(t);
  const source = normalizedExchange('source-exchange');
  const actionExchange = normalizedExchange('action-exchange', {
    path: '/api/items/victim',
    provenance: { actor: 'blackbox-action', taskId: 'action-1', baseRevision: 7 },
  });
  const verificationExchange = normalizedExchange('verification-exchange', {
    path: '/api/items/victim',
    provenance: { actor: 'blackbox-verifier', taskId: 'verification', baseRevision: 9 },
  });
  const replayPlan = {
    steps: [
      {
        stepId: 'step-1',
        sourceExchangeId: source.exchangeId,
        actor: 'attacker',
        mutations: [{ type: 'set_path', path: '/api/items/victim' }],
      },
      {
        stepId: 'step-2',
        sourceExchangeId: source.exchangeId,
        actor: 'victim',
        mutations: [{ type: 'set_path', path: '/api/items/victim' }],
      },
    ],
    proofCondition: { type: 'body_contains', marker: 'victim-private-marker' },
  };
  const actionTask = {
    taskId: 'action-1',
    kind: 'action',
    objective: 'Replay the victim object route as attacker',
    evidence: [{ id: source.exchangeId, kind: 'exchange' }],
    identityLease: 'attacker',
    hypothesisId: 'hypothesis-1',
    status: 'completed',
    replayPlan,
  };
  const actionObservation = {
    condition: replayPlan.proofCondition,
    passed: true,
    baselineExchangeId: source.exchangeId,
    baselinePassed: true,
    controlExchangeIds: [],
    controlPassed: false,
    proofSourceRequestDigest: 'a'.repeat(64),
    proofSentRequestDigest: 'a'.repeat(64),
    observedMarkerDigest: createHash('sha256').update('victim-private-marker').digest('hex'),
    observedTransitionId: null,
    verificationExchangeId: actionExchange.exchangeId,
  };
  const action = {
    actionId: actionTask.taskId,
    hypothesisId: actionTask.hypothesisId,
    sequence: { actionId: actionTask.taskId, ...replayPlan },
    status: 'completed',
    exchangeIds: [actionExchange.exchangeId],
    observation: actionObservation,
    provenance: { actor: 'blackbox-action', taskId: actionTask.taskId, baseRevision: 7 },
  };
  const candidate = {
    candidateId: 'candidate-1',
    hypothesisId: actionTask.hypothesisId,
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    victimResourceId: 'resource-victim',
    baselineExchangeId: source.exchangeId,
    actionId: actionTask.taskId,
    verificationSourceExchangeId: actionExchange.exchangeId,
    demonstratedAction: 'claimant text must not control verification',
    concreteEffect: 'claimant effect must not control verification',
    affectedParty: 'users',
    preconditions: ['two accounts'],
    provenance: { actor: 'blackbox-action', taskId: actionTask.taskId, baseRevision: 7 },
  };
  const verificationId = `verify_${createHash('sha256').update(candidate.candidateId).digest('hex').slice(0, 24)}`;
  const verificationObservation = {
    ...actionObservation,
    verificationExchangeId: verificationExchange.exchangeId,
  };
  let verifierInput;
  const loginInputs = [];
  const { deps, board, replayCalls, browserCalls } = await makeDeps(t, root, {
    historyQueue: [[], []],
    replayHandler: async () => ({
      status: 'completed',
      exchanges: [verificationExchange],
      comparison: {
        baselineExchangeId: source.exchangeId,
        observedExchangeId: verificationExchange.exchangeId,
        baselineStatus: 200,
        observedStatus: 200,
        statusChanged: false,
        baselineFingerprint: 'sha256:source',
        observedFingerprint: 'sha256:verification',
        fingerprintChanged: true,
      },
      observation: verificationObservation,
    }),
    agentHandler: async (runInput) => {
      if (runInput.kind === 'blackbox-recon') {
        loginInputs.push(runInput);
        const statePath = runInput.identity.loginInstructions.match(/state-save ([^\n]+)/)?.[1];
        assert.ok(statePath);
        await mkdir(path.dirname(statePath), { recursive: true });
        await writeFile(statePath, JSON.stringify({ cookies: [], origins: [] }), 'utf8');
        return {
          taskId: runInput.task.taskId,
          role: 'blackbox-recon',
          baseRevision: runInput.snapshot.revision,
          exchanges: [],
        };
      }
      verifierInput = runInput;
      const replay = runInput.customTools.find(({ name }) => name === 'replay_verification_request');
      await replay.execute('verify-1', { candidateId: candidate.candidateId });
      return {
        verificationId: 'model-controlled-id',
        candidateId: candidate.candidateId,
        verdict: 'verified',
        freshStateRefs: [{ identity: 'attacker', stateRef: 'model-controlled-state' }],
        replayActionIds: ['model-controlled-action'],
        replayExchangeIds: ['model-controlled-exchange'],
        observation: verificationObservation,
        failureReason: null,
        demonstratedAction: 'read another user private object',
        concreteEffect: 'private object contents were disclosed',
        affectedParty: 'users',
      };
    },
  });
  board.seed({
    revision: 9,
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: true,
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    exchanges: [source, actionExchange],
    resources: [{
      resourceId: 'resource-victim',
      resourceType: 'private item',
      objectReferences: ['victim'],
      ownerIdentity: 'victim',
      visibility: 'private',
      evidence: [{ id: source.exchangeId, kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'bootstrap-victim', baseRevision: 1 },
    }],
    hypotheses: [{
      hypothesisId: 'hypothesis-1',
      kind: 'horizontal',
      summary: 'An attacker may read a victim item.',
      preconditions: ['two accounts'],
      attackerCapability: 'read another user item',
      evidence: [{ id: source.exchangeId, kind: 'exchange' }],
      priority: 'high',
      status: 'tested',
      provenance: { actor: 'blackbox-analysis', taskId: 'analysis-1', baseRevision: 6 },
    }],
    actions: [action],
    candidateProofs: [candidate],
    tasks: [actionTask],
  });

  const attempt = await createBlackboxActivities(deps).runBlackboxVerifier({
    ...input(root),
    candidateId: candidate.candidateId,
    revision: 9,
  });

  assert.equal(replayCalls.length, 1);
  assert.notEqual(replayCalls[0].command.actionId, action.actionId);
  assert.equal(replayCalls[0].command.actionId, verificationId);
  assert.equal(
    browserCalls.some(([, args]) =>
      args.includes('state-save') && String(args.at(-1)).includes(`verification-runs${path.sep}${verificationId}`)),
    true,
  );
  assert.deepEqual(replayCalls[0].command.steps, action.sequence.steps);
  assert.deepEqual(replayCalls[0].command.proofCondition, action.sequence.proofCondition);
  assert.deepEqual(loginInputs.map(({ identity }) => identity.name), ['attacker', 'victim']);
  assert.deepEqual(loginInputs.map(({ identity }) => identity.credentials.username), [
    'attacker@example.com',
    'victim@example.com',
  ]);
  assert.equal(
    loginInputs.every(({ customTools }) => customTools.map(({ name }) => name).join(',') === 'read_target_history'),
    true,
  );
  assert.equal(loginInputs.every(({ identity }) => !('victim' in identity.credentials)), true);
  assert.equal(verifierInput.identity.credentials, undefined);
  assert.equal(verifierInput.identity.sensitiveValues.includes('backup@example.com'), true);
  assert.deepEqual(attempt.exchanges.map(({ exchangeId }) => exchangeId), [verificationExchange.exchangeId]);
  assert.deepEqual(attempt.verification, {
    verificationId,
    candidateId: candidate.candidateId,
    verdict: 'verified',
    freshStateRefs: [
      {
        identity: 'attacker',
        stateRef: `.shannon/blackbox/verification-runs/${verificationId}/.shannon/blackbox/identities/attacker/storage-state.json`,
      },
      {
        identity: 'victim',
        stateRef: `.shannon/blackbox/verification-runs/${verificationId}/.shannon/blackbox/identities/victim/storage-state.json`,
      },
    ],
    replayActionIds: [action.actionId],
    replayExchangeIds: [verificationExchange.exchangeId],
    observation: verificationObservation,
    failureReason: null,
    demonstratedAction: 'read another user private object',
    concreteEffect: 'private object contents were disclosed',
    affectedParty: 'users',
  });

  deps.createAgentRunner = () => ({
    async run(runInput) {
      const replay = runInput.customTools.find(({ name }) => name === 'replay_verification_request');
      await replay.execute('verify-before-invalid-submission', { candidateId: candidate.candidateId });
      throw new Error('invalid verifier submission');
    },
  });
  const preserved = await createBlackboxActivities(deps).runBlackboxVerifier({
    ...input(root),
    candidateId: candidate.candidateId,
    revision: 9,
  });
  assert.equal(preserved.verification.verdict, 'blocked');
  assert.match(preserved.verification.failureReason ?? '', /submission failed/i);
  assert.deepEqual(preserved.exchanges.map(({ exchangeId }) => exchangeId), [verificationExchange.exchangeId]);
});

test('control activities revalidate and atomically register the planner wave', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root);
  const source = normalizedExchange('planner-source');
  board.seed({
    revision: 5,
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: true,
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    exchanges: [source],
  });
  const accepted = {
    taskId: 'analysis-accepted',
    kind: 'analysis',
    objective: 'Compare the observed ownership boundary',
    evidence: [{ id: source.exchangeId, kind: 'exchange' }],
    identityLease: null,
    hypothesisId: null,
    status: 'pending',
  };
  const invalid = {
    taskId: 'recon-invalid-identity',
    kind: 'recon',
    objective: 'Explore with an identity that does not exist',
    evidence: [{ id: source.exchangeId, kind: 'exchange' }],
    identityLease: 'fabricated',
    hypothesisId: null,
    status: 'pending',
  };
  const batch = { baseRevision: 5, tasks: [accepted, invalid], stop: false };
  const activities = createBlackboxActivities(deps);
  const schedulerSnapshot = await activities.readPlannerSnapshot(input(root));
  const wave = validateAndScheduleWave(batch, schedulerSnapshot);

  await assert.rejects(
    activities.registerPlannedWave({
      ...input(root),
      revision: 5,
      waveNumber: 1,
      batch,
      wave: { ...wave, concurrent: [] },
      operationKey: 'workflow-1:1:register:analysis-accepted',
    }),
    /does not match scheduler validation/i,
  );
  assert.equal(board.calls.filter(([name]) => name === 'registerTasks').length, 0);

  const registered = await activities.registerPlannedWave({
    ...input(root),
    revision: 5,
    waveNumber: 1,
    batch,
    wave,
    operationKey: 'workflow-1:1:register:analysis-accepted',
  });
  const registration = board.calls.find(([name]) => name === 'registerTasks');
  assert.deepEqual(registration[2].planningWave, { waveNumber: 1, plannerStop: false });
  assert.deepEqual(registration[2].accepted.map(({ taskId }) => taskId), ['analysis-accepted']);
  assert.deepEqual(registration[2].rejected.map(({ task, reason }) => [task.taskId, reason]), [
    ['recon-invalid-identity', wave.rejected[0].reason],
  ]);
  assert.deepEqual(registered.tasks.find(({ taskId }) => taskId === accepted.taskId), {
    taskId: accepted.taskId,
    status: 'pending',
    identityLease: null,
  });
});

test('control activities redact failures, evaluate persisted progress, and finalize the run', async (t) => {
  const root = await tempRoot(t);
  const { deps, board } = await makeDeps(t, root);
  const candidate = {
    candidateId: 'candidate-control',
    hypothesisId: 'hypothesis-control',
    victimIdentity: 'victim',
    attackerIdentity: 'attacker',
    victimResourceId: 'resource-control',
    baselineExchangeId: 'source-control',
    actionId: 'action-control',
    verificationSourceExchangeId: 'action-exchange-control',
    demonstratedAction: 'read another user object',
    concreteEffect: 'private contents were disclosed',
    affectedParty: 'users',
    preconditions: ['ordinary account'],
    provenance: { actor: 'blackbox-action', taskId: 'action-control', baseRevision: 8 },
  };
  board.seed({
    revision: 9,
    candidateProofs: [candidate],
    hypotheses: [{
      hypothesisId: candidate.hypothesisId,
      kind: 'horizontal',
      summary: 'Cross-user access may be possible',
      preconditions: ['two accounts'],
      attackerCapability: 'read another user object',
      evidence: [],
      priority: 'high',
      status: 'tested',
      provenance: { actor: 'blackbox-analysis', taskId: 'analysis-control', baseRevision: 7 },
    }],
  });
  const activities = createBlackboxActivities(deps);

  const blockedRevision = await activities.recordBlackboxVerificationFailure({
    ...input(root),
    revision: 9,
    candidateId: candidate.candidateId,
    reason: `verifier failed with ${SECRET}`,
    operationKey: 'workflow-1:1:verify-failure:candidate-control',
  });
  assert.equal(blockedRevision, 10);
  const recorded = board.calls.find(([name]) => name === 'recordVerification')[3].verification;
  assert.equal(recorded.verdict, 'blocked');
  assert.equal(recorded.failureReason.includes(SECRET), false);
  assert.deepEqual(recorded.replayActionIds, [candidate.actionId]);

  board.seed({
    revision: 10,
    hypotheses: [],
    tasks: [],
  });
  const evaluation = await activities.evaluateBlackboxProgress({
    ...input(root),
    revision: 10,
    waveNumber: 2,
    plannerStop: true,
    operationKey: 'workflow-1:2:evaluate:',
  });
  assert.deepEqual(evaluation, { decision: 'complete', revision: 11 });
  assert.deepEqual(
    await activities.evaluateBlackboxProgress({
      ...input(root),
      revision: 10,
      waveNumber: 2,
      plannerStop: true,
      operationKey: 'workflow-1:2:evaluate:',
    }),
    evaluation,
  );
  assert.deepEqual(board.calls.findLast(([name]) => name === 'recordPlanningDecision'), [
    'recordPlanningDecision',
    10,
    'workflow-1:2:evaluate:',
    2,
    'complete',
  ]);

  const finalized = await activities.finalizeBlackboxRun({
    ...input(root),
    revision: 11,
    status: 'incomplete',
    failure: `finalization context ${SECRET}`,
    operationKey: 'workflow-1:2:finalize:',
  });
  assert.equal(finalized.mode, 'blackbox');
  assert.equal(finalized.status, 'incomplete');
  assert.equal(finalized.revision, 12);
  assert.equal(finalized.failures[0].includes(SECRET), false);
  assert.equal(finalized.findingCount, 0);
  assert.deepEqual(finalized.artifactNames, [
    'traffic_inventory.json',
    'blackbox_blackboard.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
  ]);
  assert.equal(board.calls.findLast(([name]) => name === 'setRunStatus')[3], 'incomplete');
});

test('artifact publication failure records incomplete and never returns partial success', async (t) => {
  const root = await tempRoot(t);
  let publishCalls = 0;
  const { deps, board } = await makeDeps(t, root, {
    publishArtifacts: async () => {
      publishCalls += 1;
      assert.equal(board.calls.some(([name]) => name === 'setRunStatus'), false);
      throw new Error('third artifact write failed');
    },
  });
  board.seed({ revision: 4 });

  await assert.rejects(
    createBlackboxActivities(deps).finalizeBlackboxRun({
      ...input(root),
      revision: 4,
      status: 'complete',
      operationKey: 'workflow-1:2:finalize:',
    }),
    /artifact write failed/,
  );

  assert.equal(publishCalls, 1);
  assert.deepEqual(
    board.calls.filter(([name]) => name === 'setRunStatus').map(([, revision, operationKey, status]) => [
      revision,
      operationKey,
      status,
    ]),
    [[4, 'workflow-1:2:finalize::incomplete', 'incomplete']],
  );
});

test('output copy failure records incomplete before the workflow can report success', async (t) => {
  const root = await tempRoot(t);
  const outputPath = path.join(root, 'exported');
  const copyCalls = [];
  const { deps, board } = await makeDeps(t, root, {
    publishArtifacts: async () => [
      'traffic_inventory.json',
      'blackbox_blackboard.json',
      'blackbox_authz_findings.json',
      'blackbox_authz_evidence.md',
    ],
    copyDeliverables: async (...args) => {
      copyCalls.push(args);
      assert.equal(board.calls.some(([name]) => name === 'setRunStatus'), false);
      throw new Error('output copy failed');
    },
  });
  board.seed({ revision: 4 });

  await assert.rejects(
    createBlackboxActivities(deps).finalizeBlackboxRun({
      ...input(root),
      outputPath,
      revision: 4,
      status: 'complete',
      operationKey: 'workflow-1:2:finalize:',
    }),
    /output copy failed/,
  );

  assert.deepEqual(copyCalls, [[root, outputPath, [
    'traffic_inventory.json',
    'blackbox_blackboard.json',
    'blackbox_authz_findings.json',
    'blackbox_authz_evidence.md',
  ]]]);
  assert.deepEqual(
    board.calls.filter(([name]) => name === 'setRunStatus').map(([, revision, operationKey, status]) => [
      revision,
      operationKey,
      status,
    ]),
    [[4, 'workflow-1:2:finalize::incomplete', 'incomplete']],
  );
});

test('finalization publishes and counts only a replay-verified impact finding', async (t) => {
  const root = await tempRoot(t);
  let published;
  const { deps, board } = await makeDeps(t, root, {
    publishArtifacts: async (_repoPath, artifacts) => {
      published = artifacts;
      return [
        'traffic_inventory.json',
        'blackbox_blackboard.json',
        'blackbox_authz_findings.json',
        'blackbox_authz_evidence.md',
      ];
    },
  });
  const marker = 'victim-object-marker';
  const digest = createHash('sha256').update(marker).digest('hex');
  const proofCondition = { type: 'body_contains', marker };
  const replayPlan = {
    steps: [{
      stepId: 'read-victim-object',
      sourceExchangeId: 'ex-baseline-control',
      actor: 'attacker',
      mutations: [{ type: 'set_path', path: '/api/items/object-1' }],
    }],
    proofCondition,
  };
  const observation = (exchangeId) => ({
    condition: proofCondition,
    passed: true,
    baselineExchangeId: 'ex-baseline-control',
    baselinePassed: true,
    controlExchangeIds: [],
    controlPassed: false,
    proofSourceRequestDigest: 'a'.repeat(64),
    proofSentRequestDigest: 'a'.repeat(64),
    observedMarkerDigest: digest,
    observedTransitionId: null,
    verificationExchangeId: exchangeId,
  });
  board.seed({
    revision: 12,
    identities: rawConfig().identities.map(({ name, role }) => ({
      name,
      role,
      authenticated: true,
      stateRef: `.shannon/blackbox/identities/${name}/storage-state.json`,
    })),
    exchanges: [
      normalizedExchange('ex-baseline-control', {
        routeSignature: 'route_control',
        identity: 'victim',
        candidateObjectReferences: ['object-1'],
      }),
      normalizedExchange('ex-action-control', {
        routeSignature: 'route_control',
        identity: 'attacker',
        captureSequence: 2,
        candidateObjectReferences: ['object-1'],
        provenance: { actor: 'blackbox-action', taskId: 'action-control', baseRevision: 10 },
      }),
      normalizedExchange('ex-verify-control', {
        routeSignature: 'route_control',
        identity: 'attacker',
        captureSequence: 3,
        candidateObjectReferences: ['object-1'],
        provenance: { actor: 'blackbox-verifier', taskId: 'verification-control', baseRevision: 11 },
      }),
    ],
    resources: [{
      resourceId: 'resource-control',
      resourceType: 'private item',
      objectReferences: ['object-1'],
      ownerIdentity: 'victim',
      visibility: 'private',
      evidence: [{ id: 'ex-baseline-control', kind: 'exchange' }],
      provenance: { actor: 'blackbox-recon', taskId: 'recon-control', baseRevision: 2 },
    }],
    hypotheses: [{
      hypothesisId: 'hypothesis-control',
      kind: 'horizontal',
      summary: 'Cross-user object read',
      preconditions: ['two accounts'],
      attackerCapability: 'read another user object',
      evidence: [{ id: 'resource-control', kind: 'resource' }],
      priority: 'high',
      status: 'verified',
      provenance: { actor: 'blackbox-analysis', taskId: 'analysis-control', baseRevision: 4 },
    }],
    actions: [{
      actionId: 'action-control',
      hypothesisId: 'hypothesis-control',
      sequence: { actionId: 'action-control', ...replayPlan },
      status: 'completed',
      exchangeIds: ['ex-action-control'],
      observation: observation('ex-action-control'),
      provenance: { actor: 'blackbox-action', taskId: 'action-control', baseRevision: 10 },
    }],
    candidateProofs: [{
      candidateId: 'candidate-control',
      hypothesisId: 'hypothesis-control',
      victimIdentity: 'victim',
      attackerIdentity: 'attacker',
      victimResourceId: 'resource-control',
      baselineExchangeId: 'ex-baseline-control',
      actionId: 'action-control',
      verificationSourceExchangeId: 'ex-action-control',
      demonstratedAction: 'read a victim-owned item',
      concreteEffect: 'loss of confidentiality for the private item',
      affectedParty: 'users',
      preconditions: ['ordinary attacker account'],
      provenance: { actor: 'blackbox-action', taskId: 'action-control', baseRevision: 10 },
    }],
    verifications: [{
      verificationId: 'verification-control',
      candidateId: 'candidate-control',
      verdict: 'verified',
      freshStateRefs: [{
        identity: 'attacker',
        stateRef: '.shannon/blackbox/verification-runs/verification-control/.shannon/blackbox/identities/attacker/storage-state.json',
      }],
      replayActionIds: ['action-control'],
      replayExchangeIds: ['ex-verify-control'],
      observation: observation('ex-verify-control'),
      failureReason: null,
      demonstratedAction: 'retrieve the private item through another account',
      concreteEffect: 'loss of confidentiality for victim-owned content',
      affectedParty: 'users',
    }],
    tasks: [{
      taskId: 'action-control',
      kind: 'action',
      objective: 'Replay the victim item request as the attacker',
      evidence: [{ id: 'ex-baseline-control', kind: 'exchange' }],
      identityLease: 'attacker',
      hypothesisId: 'hypothesis-control',
      status: 'completed',
      replayPlan,
    }],
  });

  const finalized = await createBlackboxActivities(deps).finalizeBlackboxRun({
    ...input(root),
    revision: 12,
    status: 'complete',
    operationKey: 'workflow-1:3:finalize:',
  });

  assert.equal(finalized.findingCount, 1);
  assert.equal(finalized.mode, 'blackbox');
  assert.equal(finalized.status, 'findings');
  assert.deepEqual(finalized.failures, []);
  assert.equal(JSON.parse(published['blackbox_authz_findings.json']).length, 1);
  assert.equal(board.calls.findLast(([name]) => name === 'setRunStatus')[3], 'complete');
});
