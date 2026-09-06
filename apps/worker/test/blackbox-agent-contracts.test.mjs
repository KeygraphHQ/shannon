import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import Ajv from 'ajv';
import { Value } from 'typebox/value';

import {
  BLACKBOX_AGENTS,
  PLANNER_BATCH_SCHEMA,
  VERIFICATION_RESULT_SCHEMA,
  WORKER_CONTRIBUTION_SCHEMA,
} from '../dist/blackbox/agents.js';
import { BlackboxAgentRunner } from '../dist/blackbox/agent-runner.js';
import { createBlackboxSubmitTool, createBlackboxTools } from '../dist/blackbox/tools.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPACT_INVARIANT = 'An observation is not a finding';

const VALID = {
  planner: {
    baseRevision: 0,
    tasks: [],
    stop: false,
  },
  contribution: {
    taskId: 'recon-1',
    baseRevision: 0,
    role: 'blackbox-recon',
    exchanges: [],
    resources: [],
    transitions: [],
  },
  verification: {
    verificationId: 'verification-1',
    candidateId: 'candidate-1',
    verdict: 'blocked',
    freshStateRefs: [{ identity: 'attacker', stateRef: 'bb-verify-candidate-1-attacker' }],
    replayActionIds: [],
    replayExchangeIds: [],
    observation: null,
    failureReason: 'No replay evidence',
  },
};

function logger() {
  const entries = [];
  return {
    entries,
    info(message, attrs) { entries.push(['info', message, attrs]); },
    warn(message, attrs) { entries.push(['warn', message, attrs]); },
    error(message, attrs) { entries.push(['error', message, attrs]); },
  };
}

function audit() {
  const calls = [];
  return {
    calls,
    async startAgent(...args) { calls.push(['startAgent', ...args]); },
    async logEvent(...args) { calls.push(['logEvent', ...args]); },
  };
}

function runnerInput(kind = 'planner', overrides = {}) {
  return {
    kind,
    ...(kind === 'blackbox-verifier' ? { candidateId: 'candidate-1' } : {}),
    targetOrigin: 'https://target.example',
    task: null,
    snapshot: {
      revision: 0,
      routes: [],
      identities: [{ name: 'attacker', role: 'ordinary user' }],
      resources: [],
      ownershipLinks: [],
      transitions: [],
      hypotheses: [],
      actionOutcomes: [],
      candidateProofs: [],
      verifierFailureReasons: [],
      failedTasks: [],
    },
    identity: null,
    customTools: [],
    auditSession: audit(),
    logger: logger(),
    ...overrides,
  };
}

test('black-box contracts are separate from white-box execution order', () => {
  assert.deepEqual(Object.keys(BLACKBOX_AGENTS).sort(), [
    'blackbox-action',
    'blackbox-analysis',
    'blackbox-recon',
    'blackbox-verifier',
    'planner',
  ]);
  const whitebox = ['pre-recon', 'recon', 'injection-vuln', 'xss-vuln', 'auth-vuln', 'ssrf-vuln', 'authz-vuln'];
  assert.equal(Object.keys(BLACKBOX_AGENTS).some((name) => whitebox.includes(name)), false);
  for (const [kind, definition] of Object.entries(BLACKBOX_AGENTS)) {
    const promptKind = kind.replace('blackbox-', '');
    assert.match(definition.promptFile, new RegExp(`blackbox-${promptKind}\\.txt$`));
    assert.ok(['planner', 'contribution', 'verification'].includes(definition.submitTool));
  }
});

test('each role prompt states the impact invariant and its boundary', async () => {
  const expected = {
    planner: [
      'ownership',
      'transition',
      'no_demonstrated_impact',
      'never claim',
      'snapshot.hypotheses',
      'analysis task',
      'later wave',
    ],
    'blackbox-recon': ['one assigned workflow', 'leased identity', 'object', 'state change', 'arbitrary target'],
    'blackbox-analysis': ['compare', 'falsifiable', 'do not send'],
    'blackbox-action': ['assigned replay', 'proof condition', 'observed outcomes', 'severity'],
    'blackbox-verifier': ['recreate', 'verified', 'disproved', 'blocked', 'severity', 'confidence'],
  };
  for (const [kind, definition] of Object.entries(BLACKBOX_AGENTS)) {
    const prompt = await readFile(path.join(ROOT, 'prompts', definition.promptFile), 'utf8');
    assert.match(prompt, new RegExp(IMPACT_INVARIANT, 'i'));
    assert.match(prompt, /As an attacker, I could/i);
    for (const phrase of expected[kind]) assert.match(prompt, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${kind}: ${phrase}`);
  }
});

test('submit schemas reject unknown properties at every top level', () => {
  const schemas = [PLANNER_BATCH_SCHEMA, WORKER_CONTRIBUTION_SCHEMA, VERIFICATION_RESULT_SCHEMA];
  for (const schema of schemas) {
    assert.equal(schema.additionalProperties, false);
    const valid = VALID[schema === PLANNER_BATCH_SCHEMA ? 'planner' : schema === WORKER_CONTRIBUTION_SCHEMA ? 'contribution' : 'verification'];
    assert.equal(Value.Check(schema, valid), true);
    const candidate = { ...valid, unexpected: true };
    assert.equal(Value.Check(schema, candidate), false);
    const ajv = new Ajv({ allErrors: true, strict: false });
    assert.equal(ajv.compile(schema)(candidate), false);
  }

  const exchange = {
    exchangeId: 'exchange-1',
    routeSignature: 'GET /objects/{id}',
    identity: 'attacker',
    captureSequence: 1,
    method: 'GET',
    origin: 'https://target.example',
    path: '/objects/1',
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: 'sha256:response',
    candidateObjectReferences: ['1'],
    rawRecordRef: 'raw/exchange-1.json',
    provenance: { actor: 'blackbox-recon', taskId: 'recon-1', baseRevision: 0 },
  };
  assert.equal(Value.Check(WORKER_CONTRIBUTION_SCHEMA, { ...VALID.contribution, exchanges: [exchange] }), true);
  assert.equal(
    Value.Check(WORKER_CONTRIBUTION_SCHEMA, {
      ...VALID.contribution,
      exchanges: [{ ...exchange, unexpected: true }],
    }),
    false,
  );
});

test('submit schemas reject stable identifiers that downstream scheduling cannot consume', () => {
  const provenance = { actor: 'blackbox-analysis', taskId: 'analysis-1', baseRevision: 0 };
  const evidence = [{ id: 'exchange-1', kind: 'exchange' }];
  const invalid = 'record:1';

  assert.equal(
    Value.Check(PLANNER_BATCH_SCHEMA, {
      ...VALID.planner,
      tasks: [
        {
          taskId: invalid,
          kind: 'analysis',
          objective: 'Compare ownership evidence',
          evidence,
          identityLease: null,
          hypothesisId: null,
          status: 'pending',
        },
      ],
    }),
    false,
  );
  assert.equal(
    Value.Check(WORKER_CONTRIBUTION_SCHEMA, {
      ...VALID.contribution,
      resources: [
        {
          resourceId: invalid,
          resourceType: 'account',
          objectReferences: ['1'],
          ownerIdentity: 'attacker',
          visibility: 'private',
          evidence,
          provenance,
        },
      ],
    }),
    false,
  );
  assert.equal(
    Value.Check(WORKER_CONTRIBUTION_SCHEMA, {
      ...VALID.contribution,
      transitions: [
        {
          transitionId: invalid,
          identity: 'attacker',
          fromState: 'before',
          toState: 'after',
          triggerExchangeId: 'exchange-1',
          captureSequence: 1,
          resourceId: null,
          provenance,
        },
      ],
    }),
    false,
  );
  assert.equal(
    Value.Check(WORKER_CONTRIBUTION_SCHEMA, {
      ...VALID.contribution,
      hypotheses: [
        {
          hypothesisId: invalid,
          kind: 'horizontal',
          summary: 'Another identity may access the account',
          preconditions: [],
          attackerCapability: 'ordinary account',
          evidence,
          priority: 'high',
          status: 'open',
          provenance,
        },
      ],
    }),
    false,
  );
  assert.equal(
    Value.Check(WORKER_CONTRIBUTION_SCHEMA, {
      ...VALID.contribution,
      candidateProofs: [
        {
          candidateId: invalid,
          hypothesisId: 'hypothesis-1',
          victimIdentity: 'victim',
          attackerIdentity: 'attacker',
          victimResourceId: 'resource-1',
          baselineExchangeId: 'exchange-1',
          actionId: 'action-1',
          verificationSourceExchangeId: 'exchange-1',
          demonstratedAction: 'Read another account',
          concreteEffect: 'Disclosed private account data',
          affectedParty: 'customer',
          preconditions: [],
          provenance,
        },
      ],
    }),
    false,
  );
  assert.equal(Value.Check(VERIFICATION_RESULT_SCHEMA, { ...VALID.verification, candidateId: invalid }), false);
});

test('recon submissions accept unavailable response status zero and reject low nonzero statuses', async () => {
  const exchange = {
    exchangeId: 'exchange-status-zero',
    routeSignature: 'GET /objects/{id}',
    identity: 'attacker',
    captureSequence: 1,
    method: 'GET',
    origin: 'https://target.example',
    path: '/objects/1',
    queryKeys: [],
    bodyShape: 'none',
    requestContentType: null,
    responseStatus: 0,
    responseContentType: null,
    responseFingerprint: 'sha256:unavailable-response',
    candidateObjectReferences: [],
    rawRecordRef: 'raw/exchange-status-zero.json',
    provenance: { actor: 'blackbox-recon', taskId: 'recon-status-zero', baseRevision: 0 },
  };
  const contribution = {
    ...VALID.contribution,
    taskId: 'recon-status-zero',
    exchanges: [exchange],
  };

  const accepted = createBlackboxSubmitTool('blackbox-recon');
  await accepted.tool.execute('submit-status-zero', contribution);
  assert.equal(accepted.getCaptured().exchanges[0].responseStatus, 0);

  const rejected = createBlackboxSubmitTool('blackbox-recon');
  await assert.rejects(
    rejected.tool.execute('submit-low-status', {
      ...contribution,
      exchanges: [{ ...exchange, responseStatus: 99 }],
    }),
    /invalid structured result/i,
  );
});

test('planner submissions close hypotheses only when stopping without tasks', async () => {
  const rejected = createBlackboxSubmitTool('planner');
  await assert.rejects(
    rejected.tool.execute('submit-close-while-working', {
      ...VALID.planner,
      tasks: [
        {
          taskId: 'analysis-1',
          kind: 'analysis',
          objective: 'Compare ownership evidence',
          evidence: [{ id: 'exchange-1', kind: 'exchange' }],
          identityLease: null,
          hypothesisId: null,
          status: 'pending',
        },
      ],
      closeHypothesisIds: ['hypothesis-1'],
    }),
    /hypotheses may close only when the planner stops with no tasks/i,
  );
  assert.equal(rejected.getCaptured(), undefined);
  assert.equal(rejected.getCallCount(), 0);

  const accepted = createBlackboxSubmitTool('planner');
  await accepted.tool.execute('submit-close-and-stop', {
    ...VALID.planner,
    stop: true,
    closeHypothesisIds: ['hypothesis-1'],
  });
  assert.deepEqual(accepted.getCaptured().closeHypothesisIds, ['hypothesis-1']);
  assert.equal(accepted.getCallCount(), 1);
});

test('planner submissions reject action tasks without a hypothesis', async () => {
  const submit = createBlackboxSubmitTool('planner');
  await assert.rejects(
    submit.tool.execute('submit-unbound-action', {
      ...VALID.planner,
      tasks: [
        {
          taskId: 'action-1',
          kind: 'action',
          objective: 'Replay the ownership boundary',
          evidence: [{ id: 'exchange-1', kind: 'exchange' }],
          identityLease: 'attacker',
          hypothesisId: null,
          status: 'pending',
          replayPlan: {
            steps: [
              {
                stepId: 'step-1',
                sourceExchangeId: 'exchange-1',
                actor: 'attacker',
                mutations: [{ type: 'set_path', path: '/objects/2' }],
              },
            ],
            proofCondition: { type: 'body_contains', marker: 'victim-marker' },
          },
        },
      ],
    }),
    /action task requires a hypothesis/i,
  );
  assert.equal(submit.getCaptured(), undefined);
  assert.equal(submit.getCallCount(), 0);
});

test('planner submissions correct unknown action hypotheses through analysis before terminating', async () => {
  const submit = createBlackboxSubmitTool('planner', { existingHypothesisIds: [] });
  const evidence = [{ id: 'exchange-1', kind: 'exchange' }];

  await assert.rejects(
    submit.tool.execute('submit-unknown-action', {
      ...VALID.planner,
      tasks: [
        {
          taskId: 'action-unknown',
          kind: 'action',
          objective: 'Replay the ownership boundary',
          evidence,
          identityLease: 'attacker',
          hypothesisId: 'hypothesis-invented',
          status: 'pending',
          replayPlan: {
            steps: [
              {
                stepId: 'step-unknown',
                sourceExchangeId: 'exchange-1',
                actor: 'attacker',
                mutations: [],
              },
            ],
            proofCondition: { type: 'body_contains', marker: 'victim-marker' },
          },
        },
      ],
    }),
    /unknown hypothesis hypothesis-invented.*analysis task/i,
  );
  assert.equal(submit.getCaptured(), undefined);
  assert.equal(submit.getCallCount(), 0);

  const corrected = {
    ...VALID.planner,
    tasks: [
      {
        taskId: 'analysis-ownership-boundary',
        kind: 'analysis',
        objective: 'Establish whether the observed ownership boundary is vulnerable',
        evidence,
        identityLease: null,
        hypothesisId: null,
        status: 'pending',
      },
    ],
  };
  await submit.tool.execute('submit-analysis', corrected);
  assert.deepEqual(submit.getCaptured(), corrected);
  assert.equal(submit.getCallCount(), 1);
});

test('planner runner binds action submissions to hypotheses in its snapshot', async () => {
  const action = {
    ...VALID.planner,
    tasks: [
      {
        taskId: 'action-existing',
        kind: 'action',
        objective: 'Replay the persisted authorization hypothesis',
        evidence: [{ id: 'exchange-1', kind: 'exchange' }],
        identityLease: 'attacker',
        hypothesisId: 'hypothesis-existing',
        status: 'pending',
        replayPlan: {
          steps: [
            {
              stepId: 'step-existing',
              sourceExchangeId: 'exchange-1',
              actor: 'attacker',
              mutations: [],
            },
          ],
          proofCondition: { type: 'body_contains', marker: 'victim-marker' },
        },
      },
    ],
  };
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      await submit.tool.execute('submit-existing-action', action);
      return { success: true, structuredOutput: action, result: 'done', cost: 0, duration: 1 };
    },
  });
  const base = runnerInput();
  const result = await runner.run(runnerInput('planner', {
    snapshot: {
      ...base.snapshot,
      hypotheses: [{ hypothesisId: 'hypothesis-existing', status: 'open' }],
    },
  }));

  assert.deepEqual(result, action);
});

test('BlackboxAgentRunner returns only one schema-valid submission from injected Pi execution', async () => {
  const calls = [];
  const auditSession = audit();
  const agentLogger = logger();
  const submission = { ...VALID.planner };
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      calls.push(args);
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      if (submit) await submit.tool.execute('submit-1', submission);
      return { success: true, structuredOutput: submission, result: 'ignored model text', cost: 0, duration: 1 };
    },
  });
  const result = await runner.run(runnerInput('planner', { auditSession, logger: agentLogger }));

  assert.deepEqual(result, submission);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].some((value) => value && value.childTasks === false), true);
  assert.equal(auditSession.calls.filter(([name]) => name === 'startAgent').length, 1);
});

test('runner returns a submission that quotes leased credentials and authentication syntax verbatim', async () => {
  const secret = 'bootstrap-password-123';
  const submission = { ...VALID.planner, stopReason: `blocked by ${secret} on Authorization: Bearer runtime-token` };
  const auditSession = audit();
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      await submit.tool.execute('submit-1', submission);
      return { success: true, structuredOutput: submission, result: 'done', cost: 0, duration: 1 };
    },
  });

  const result = await runner.run(runnerInput('planner', {
    auditSession,
    identity: {
      name: 'attacker',
      role: 'ordinary user',
      loginInstructions: 'Sign in',
      credentials: { password: secret },
    },
  }));

  assert.deepEqual(result, submission);
  const startAgent = auditSession.calls.find(([name]) => name === 'startAgent');
  assert.match(startAgent[2], new RegExp(secret));
});

test('runner distinguishes missing and invalid structured submissions and does not return Pi output', async () => {
  for (const [returnValue, code] of [
    [{ success: true, result: 'text only', cost: 0, duration: 1 }, 'missing_submission'],
    [{ success: true, structuredOutput: { unexpected: true }, cost: 0, duration: 1 }, 'invalid_submission'],
  ]) {
    const runner = new BlackboxAgentRunner({ runPiPrompt: async () => returnValue });
    await assert.rejects(
      runner.run(runnerInput('planner')),
      (error) => error?.name === 'BlackboxAgentError' && error.failure?.code === code && !('prompt' in error.failure),
    );
  }
});

test('analysis can create only open hypotheses; lifecycle status belongs to the orchestrator', () => {
  const base = {
    hypothesisId: 'hypothesis-1',
    kind: 'horizontal',
    summary: 'Another identity may access the resource.',
    preconditions: ['two identities'],
    attackerCapability: 'read another identity resource',
    evidence: [{ id: 'exchange-1', kind: 'exchange' }],
    priority: 'high',
    provenance: { actor: 'blackbox-analysis', taskId: 'analysis-1', baseRevision: 1 },
  };
  const contribution = {
    taskId: 'analysis-1',
    baseRevision: 1,
    role: 'blackbox-analysis',
    hypotheses: [{ ...base, status: 'open' }],
  };
  assert.equal(Value.Check(WORKER_CONTRIBUTION_SCHEMA, contribution), true);
  for (const status of ['queued', 'tested', 'verified', 'disproved', 'blocked', 'no_demonstrated_impact']) {
    assert.equal(
      Value.Check(WORKER_CONTRIBUTION_SCHEMA, { ...contribution, hypotheses: [{ ...base, status }] }),
      false,
      `analysis must not assign ${status}`,
    );
  }
});

test('runner converts prompt and audit setup failures to its safe failure contract', async () => {
  const missingPromptRunner = new BlackboxAgentRunner({ promptDirectory: path.join(ROOT, 'missing-prompts') });
  await assert.rejects(
    missingPromptRunner.run(runnerInput('planner')),
    (error) => error?.name === 'BlackboxAgentError' && error.failure?.code === 'agent_failed',
  );

  const auditFailureRunner = new BlackboxAgentRunner();
  await assert.rejects(
    auditFailureRunner.run(runnerInput('planner', {
      auditSession: {
        ...audit(),
        async startAgent() { throw new Error('bootstrap-password-123'); },
      },
    })),
    (error) =>
      error?.name === 'BlackboxAgentError' &&
      error.failure?.code === 'agent_failed' &&
      !error.message.includes('bootstrap-password-123'),
  );
});

test('runner binds contribution submission to the assigned worker role', async () => {
  let rejectedWrongRole = false;
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      try {
        await submit.tool.execute('submit-1', {
          taskId: 'analysis-1',
          role: 'blackbox-action',
          baseRevision: 0,
          actions: [],
        });
      } catch {
        rejectedWrongRole = true;
      }
      return { success: false, retryable: false, error: 'stopped', cost: 0, duration: 1 };
    },
  });

  await assert.rejects(
    runner.run(runnerInput('blackbox-analysis', {
      task: {
        taskId: 'analysis-1',
        kind: 'analysis',
        objective: 'Compare identities',
        evidence: [],
        identityLease: null,
        hypothesisId: null,
        status: 'running',
      },
    })),
    (error) => error?.name === 'BlackboxAgentError' && error.failure?.code === 'agent_failed',
  );
  assert.equal(rejectedWrongRole, true);

  const analysisSubmit = createBlackboxSubmitTool('blackbox-analysis');
  await assert.rejects(
    analysisSubmit.tool.execute('submit-empty-action', {
      taskId: 'analysis-1',
      role: 'blackbox-analysis',
      baseRevision: 0,
      actions: [],
    }),
    /cannot|invalid|action/i,
  );
});

test('verified submissions require independently stated concrete impact', async () => {
  const submit = createBlackboxSubmitTool('blackbox-verifier');
  await assert.rejects(
    submit.tool.execute('submit-1', {
      ...VALID.verification,
      verdict: 'verified',
      failureReason: null,
    }),
    /impact|action|effect|affected/i,
  );

  await assert.rejects(
    submit.tool.execute('submit-2', {
      ...VALID.verification,
      verdict: 'verified',
      failureReason: null,
      demonstratedAction: 'read another user record',
      concreteEffect: 'disclosure of private data',
      affectedParty: 'users',
    }),
    /proof|observation|replay/i,
  );
});

test('worker prompts contain only evidence linked to their assignment', async () => {
  const cases = [
    {
      kind: 'blackbox-recon',
      taskKind: 'recon',
      tools: createBlackboxTools({ role: 'blackbox-recon', readTargetHistory: async () => [] })
        .filter(({ name }) => name === 'read_target_history'),
    },
    { kind: 'blackbox-analysis', taskKind: 'analysis', tools: [] },
    {
      kind: 'blackbox-action',
      taskKind: 'action',
      tools: createBlackboxTools({
        role: 'blackbox-action',
        task: {
          taskId: 'linked', kind: 'action', objective: 'Replay linked', evidence: [],
          identityLease: 'attacker', hypothesisId: 'linked-hypothesis', status: 'running',
        },
        replayTargetRequest: async () => ({ status: 'completed' }),
      }).filter(({ name }) => name === 'replay_target_request'),
    },
  ];

  for (const { kind, taskKind, tools } of cases) {
    let prompt = '';
    const runner = new BlackboxAgentRunner({
      runPiPrompt: async (...args) => {
        prompt = args[0];
        const submit = args.find((value) => value && typeof value.getCaptured === 'function');
        const contribution = { taskId: 'linked', role: kind, baseRevision: 0 };
        await submit.tool.execute('submit-1', contribution);
        return { success: true, structuredOutput: contribution, result: 'done', cost: 0, duration: 1 };
      },
    });
    const task = {
      taskId: 'linked',
      kind: taskKind,
      objective: 'Inspect linked evidence',
      evidence: [{ id: 'linked-exchange', kind: 'exchange' }],
      identityLease: taskKind === 'analysis' ? null : 'attacker',
      hypothesisId: taskKind === 'action' ? 'linked-hypothesis' : null,
      status: 'running',
      replayPlan: taskKind === 'action' ? {
        steps: [{
          stepId: 'linked-step',
          sourceExchangeId: 'linked-exchange',
          actor: 'attacker',
          mutations: [{ type: 'set_path', path: '/linked' }],
        }],
        proofCondition: { type: 'body_contains', marker: 'linked-marker' },
      } : undefined,
    };
    await runner.run(runnerInput(kind, {
      task,
      customTools: tools,
      snapshot: {
        ...runnerInput().snapshot,
        routes: [
          { exchangeId: 'linked-exchange', identity: 'attacker', responseFingerprint: 'linked-fingerprint' },
          { exchangeId: 'unrelated-exchange', identity: 'victim', responseFingerprint: 'UNRELATED-SENTINEL' },
        ],
        resources: [
          { resourceId: 'linked-exchange', ownerIdentity: 'attacker' },
          { resourceId: 'unrelated-resource', ownerIdentity: 'victim', detail: 'UNRELATED-SENTINEL' },
        ],
        ownershipLinks: [],
        transitions: [],
        hypotheses: [
          { hypothesisId: 'linked-hypothesis', summary: 'linked' },
          { hypothesisId: 'unrelated-hypothesis', summary: 'UNRELATED-SENTINEL' },
        ],
      },
    }));
    assert.match(prompt, /linked-exchange/, `${kind} must receive linked evidence`);
    if (kind === 'blackbox-analysis') assert.match(prompt, /"name": "attacker"/);
    assert.doesNotMatch(prompt, /UNRELATED-SENTINEL/, `${kind} received unrelated evidence`);
  }
});

test('planner receives bounded failed-task context for replanning interrupted recon', async () => {
  let prompt = '';
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      prompt = args[0];
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      await submit.tool.execute('submit-1', VALID.planner);
      return { success: true, structuredOutput: VALID.planner, result: 'done', cost: 0, duration: 1 };
    },
  });

  await runner.run(runnerInput('planner', {
    snapshot: {
      ...runnerInput().snapshot,
      failedTasks: [{
        taskId: 'recon-interrupted',
        kind: 'recon',
        objective: 'FAILED-RECON-OBJECTIVE',
        identityLease: 'attacker',
        hypothesisId: null,
      }],
    },
  }));

  assert.match(prompt, /recon-interrupted/);
  assert.match(prompt, /FAILED-RECON-OBJECTIVE/);
});

test('agent runner preserves cancellation and forwards the exact signal to Pi', async () => {
  const controller = new AbortController();
  let observedSignal;
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      observedSignal = args[9];
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      await submit.tool.execute('submit-1', VALID.planner);
      return { success: true, structuredOutput: VALID.planner, result: 'done', cost: 0, duration: 1 };
    },
  });

  await runner.run(runnerInput('planner', { cancellationSignal: controller.signal }));
  assert.equal(observedSignal, controller.signal);

  const reason = new Error('activity cancelled');
  controller.abort(reason);
  await assert.rejects(
    runner.run(runnerInput('planner', { cancellationSignal: controller.signal })),
    (error) => error === reason,
  );
});

test('verifier prompt omits claimant hypotheses and prior verifier conclusions', async () => {
  let prompt = '';
  const runner = new BlackboxAgentRunner({
    runPiPrompt: async (...args) => {
      prompt = args[0];
      const submit = args.find((value) => value && typeof value.getCaptured === 'function');
      await submit.tool.execute('submit-1', VALID.verification);
      return { success: true, structuredOutput: VALID.verification, result: 'done', cost: 0, duration: 1 };
    },
  });
  const customTools = createBlackboxTools({
    role: 'blackbox-verifier',
    candidateId: 'candidate-1',
    replayVerificationRequest: async () => ({ status: 'verified' }),
  }).filter(({ name }) => name === 'replay_verification_request');

  await runner.run(runnerInput('blackbox-verifier', {
    customTools,
    snapshot: {
      ...runnerInput().snapshot,
      routes: [{
        exchangeId: 'exchange-baseline',
        routeSignature: 'route-reproduction',
        identity: 'victim',
        method: 'PATCH',
        origin: 'https://target.example',
        path: '/api/reproduction-source',
      }, {
        exchangeId: 'exchange-unrelated',
        method: 'GET',
        path: '/UNRELATED-ROUTE-SENTINEL',
      }],
      hypotheses: [{ summary: 'CLAIMANT-HYPOTHESIS-SENTINEL' }],
      candidateProofs: [{
        candidateId: 'candidate-1',
        actionId: 'action-1',
        victimIdentity: 'victim',
        attackerIdentity: 'attacker',
        victimResourceId: 'resource-1',
        baselineExchangeId: 'exchange-baseline',
        verificationSourceExchangeId: 'exchange-verify',
        demonstratedAction: 'CLAIMANT-ACTION-SENTINEL',
        concreteEffect: 'CLAIMANT-EFFECT-SENTINEL',
        affectedParty: 'users',
      }, {
        candidateId: 'candidate-unrelated',
        actionId: 'action-unrelated',
        victimIdentity: 'victim',
        attackerIdentity: 'attacker',
        victimResourceId: 'resource-unrelated',
        baselineExchangeId: 'exchange-unrelated',
        verificationSourceExchangeId: 'exchange-unrelated',
      }],
      actionOutcomes: [{
        actionId: 'action-1',
        hypothesisId: 'hypothesis-1',
        sequence: { proofCondition: 'ACTION-REPRODUCTION-SENTINEL' },
        title: 'CLAIMANT-TITLE-SENTINEL',
        severity: 'CLAIMANT-SEVERITY-SENTINEL',
        verdict: 'CLAIMANT-VERDICT-SENTINEL',
      }, {
        actionId: 'action-unrelated',
        hypothesisId: 'hypothesis-unrelated',
        sequence: { proofCondition: 'UNRELATED-VERIFIER-INPUT-SENTINEL' },
      }],
      verifierFailureReasons: ['PRIOR-VERIFIER-CONCLUSION-SENTINEL'],
    },
  }));

  assert.match(prompt, /ACTION-REPRODUCTION-SENTINEL/);
  assert.match(prompt, /\/api\/reproduction-source/);
  assert.doesNotMatch(prompt, /CLAIMANT-HYPOTHESIS-SENTINEL/);
  assert.doesNotMatch(prompt, /PRIOR-VERIFIER-CONCLUSION-SENTINEL/);
  assert.doesNotMatch(prompt, /CLAIMANT-(?:TITLE|SEVERITY|VERDICT)-SENTINEL/);
  assert.doesNotMatch(prompt, /CLAIMANT-(?:ACTION|EFFECT)-SENTINEL/);
  assert.doesNotMatch(prompt, /UNRELATED-VERIFIER-INPUT-SENTINEL/);
  assert.doesNotMatch(prompt, /UNRELATED-ROUTE-SENTINEL/);
});

test('verifier rejects planner task prose', async () => {
  const runner = new BlackboxAgentRunner({ runPiPrompt: async () => VALID.verification });
  const customTools = createBlackboxTools({
    role: 'blackbox-verifier',
    candidateId: 'candidate-1',
    replayVerificationRequest: async () => ({ status: 'verified' }),
  }).filter(({ name }) => name === 'replay_verification_request');

  await assert.rejects(
    runner.run(runnerInput('blackbox-verifier', {
      task: {
        taskId: 'verifier-task',
        kind: 'action',
        objective: 'Critical confirmed vulnerability',
        evidence: [],
        identityLease: null,
        hypothesisId: null,
        status: 'running',
      },
      customTools,
    })),
    (error) => error?.name === 'BlackboxAgentError' && error.failure?.code === 'invalid_submission',
  );
});
