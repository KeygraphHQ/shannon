import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';

const ACTIVITY_MOCKS_KEY = 'shannon.blackbox.workflow.test.activities';
const TEMPORAL_WORKFLOW_MOCK_URL = 'shannon-test:temporal-workflow';

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@temporalio/workflow') {
      return { url: TEMPORAL_WORKFLOW_MOCK_URL, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url === TEMPORAL_WORKFLOW_MOCK_URL) {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          const activityMocks = Symbol.for(${JSON.stringify(ACTIVITY_MOCKS_KEY)});

          export class ApplicationFailure extends Error {
            static nonRetryable(message, type) {
              const failure = new ApplicationFailure(message);
              failure.type = type;
              return failure;
            }
          }

          export function defineQuery(name) {
            return name;
          }

          export function isCancellation() {
            return false;
          }

          export function setHandler() {}

          export function proxyActivities() {
            return new Proxy(Object.create(null), {
              get(_target, property) {
                if (typeof property !== 'string') return undefined;
                return (...args) => {
                  const implementation = globalThis[activityMocks]?.[property];
                  if (typeof implementation !== 'function') {
                    throw new Error(\`Unexpected workflow activity: \${property}\`);
                  }
                  return implementation(...args);
                };
              },
            });
          }
        `,
      };
    }
    return nextLoad(url, context);
  },
});

const { blackboxAuthzWorkflow, buildSettlement } = await import('../dist/temporal/blackbox-workflow.js');

const WORKFLOW_INPUT = {
  webUrl: 'https://target.example',
  repoPath: '/target',
  configPath: '/target/blackbox.yaml',
  workspace: 'run-1',
  workflowId: 'workflow-1',
  auditDir: '/target/audit',
};

function task(taskId) {
  return {
    taskId,
    kind: 'analysis',
    objective: 'Compare evidence',
    evidence: [{ id: 'exchange-1', kind: 'exchange' }],
    identityLease: null,
    hypothesisId: null,
    status: 'running',
  };
}

function contribution(taskId, overrides = {}) {
  return {
    taskId,
    role: 'blackbox-analysis',
    baseRevision: 4,
    hypotheses: [],
    ...overrides,
  };
}

test('buildSettlement pairs attempts with registered tasks and sorts persisted outcomes', () => {
  const tasks = [task('task-b'), task('task-a'), task('task-c'), task('task-d')];
  const deliveryUnknown = contribution('task-c', {
    role: 'blackbox-action',
    actions: [{ status: 'delivery_unknown' }],
  });
  const settlement = buildSettlement(
    WORKFLOW_INPUT,
    4,
    tasks,
    [
      { status: 'fulfilled', value: contribution('task-b') },
      { status: 'rejected', reason: new Error('analysis failed') },
      { status: 'fulfilled', value: deliveryUnknown },
      { status: 'fulfilled', value: contribution('wrong-task') },
    ],
    'workflow-1:1:settle:task-a,task-b,task-c,task-d',
  );

  assert.deepEqual(settlement.contributions.map(({ taskId }) => taskId), ['task-b', 'task-c']);
  assert.equal(settlement.contributions[1], deliveryUnknown);
  assert.deepEqual(settlement.failures, [
    { taskId: 'task-a', reason: 'analysis failed' },
    { taskId: 'task-d', reason: 'worker contribution task ID does not match its registered task' },
  ]);
  assert.equal(settlement.baseRevision, 4);
});

test('buildSettlement rejects an attempt count that cannot be paired deterministically', () => {
  assert.throws(
    () => buildSettlement(WORKFLOW_INPUT, 4, [task('task-a')], [], 'workflow-1:1:settle:task-a'),
    /exactly one attempt/i,
  );
});

test('buildSettlement persists a rejected action as delivery unknown instead of allowing a resend', () => {
  const replayPlan = {
    steps: [
      {
        stepId: 'attacker-replay',
        sourceExchangeId: 'exchange-1',
        actor: 'attacker',
        mutations: [{ type: 'set_path', path: '/api/items/victim-item' }],
      },
    ],
    proofCondition: { type: 'body_contains', marker: 'victim-marker' },
  };
  const action = {
    ...task('action-timeout'),
    kind: 'action',
    identityLease: 'attacker',
    hypothesisId: 'hypothesis-1',
    replayPlan,
  };

  const settlement = buildSettlement(
    WORKFLOW_INPUT,
    7,
    [action],
    [{ status: 'rejected', reason: new Error('activity timed out') }],
    'workflow-1:1:settle:action-timeout',
  );

  assert.deepEqual(settlement.failures, []);
  assert.deepEqual(settlement.contributions, [{
    taskId: 'action-timeout',
    role: 'blackbox-action',
    baseRevision: 7,
    actions: [{
      actionId: 'action-timeout',
      hypothesisId: 'hypothesis-1',
      sequence: { actionId: 'action-timeout', ...replayPlan },
      status: 'delivery_unknown',
      exchangeIds: [],
      observation: null,
      provenance: { actor: 'blackbox-action', taskId: 'action-timeout', baseRevision: 7 },
    }],
  }]);
});

const VALIDATION_SELECTION = {
  schemaVersion: 1,
  kind: 'blackbox-cross-identity-validation',
  comparisonSha256: 'a'.repeat(64),
  sourceManifestSha256: 'b'.repeat(64),
  selectionDigest: 'c'.repeat(64),
  comparisonId: 'comparison-000001',
  routeSignature: 'GET:/api/memos/:id',
  method: 'GET',
  origin: 'https://target.example',
  routePathPrefix: '/api/memos',
  requestClass: 'request-class-0001',
  recordedRole: 'member',
  victimIdentity: 'victim',
  attackerIdentity: 'attacker',
};

const SELECTED_REPLAY_PLAN = {
  steps: [
    {
      stepId: 'selected-attacker-replay',
      sourceExchangeId: 'victim-source',
      actor: 'attacker',
      mutations: [],
    },
  ],
  proofCondition: { type: 'json_pointer_equals', pointer: '/data/ownerId', value: 'victim-memo' },
};

const SELECTED_ACTION_TASK = {
  taskId: 'selected-validation-action',
  kind: 'action',
  objective: 'Verify the selected cross-identity read with fresh state',
  evidence: [{ id: 'victim-source', kind: 'exchange' }],
  identityLease: 'attacker',
  hypothesisId: 'selected-validation-hypothesis',
  status: 'pending',
  replayPlan: SELECTED_REPLAY_PLAN,
};

const BLACKBOX_ARTIFACT_NAMES = [
  'traffic_inventory.json',
  'blackbox_blackboard.json',
  'blackbox_authz_findings.json',
  'blackbox_authz_evidence.md',
];

function selectedInput() {
  return { ...WORKFLOW_INPUT, validationSelection: VALIDATION_SELECTION };
}

function selectedTaskState(status) {
  return {
    taskId: SELECTED_ACTION_TASK.taskId,
    status,
    identityLease: SELECTED_ACTION_TASK.identityLease,
  };
}

function terminalResult(status, revision) {
  return {
    mode: 'blackbox',
    status,
    revision,
    findingCount: status === 'findings' ? 1 : 0,
    artifactNames: BLACKBOX_ARTIFACT_NAMES,
    failures: [],
  };
}

function completedActionContribution(baseRevision, passed) {
  return {
    taskId: SELECTED_ACTION_TASK.taskId,
    role: 'blackbox-action',
    baseRevision,
    actions: [
      {
        actionId: SELECTED_ACTION_TASK.taskId,
        hypothesisId: SELECTED_ACTION_TASK.hypothesisId,
        sequence: { actionId: SELECTED_ACTION_TASK.taskId, ...SELECTED_REPLAY_PLAN },
        status: 'completed',
        exchangeIds: ['selected-action-exchange'],
        observation: { passed },
        provenance: {
          actor: 'blackbox-action',
          taskId: SELECTED_ACTION_TASK.taskId,
          baseRevision,
        },
      },
    ],
  };
}

function verifiedAttempt(candidateId) {
  return {
    verification: {
      verificationId: 'selected-verification',
      candidateId,
      verdict: 'verified',
      freshStateRefs: [
        { identity: 'victim', stateRef: '/target/state/victim.json' },
        { identity: 'attacker', stateRef: '/target/state/attacker.json' },
      ],
      replayActionIds: [SELECTED_ACTION_TASK.taskId],
      replayExchangeIds: ['selected-verification-exchange'],
      observation: { passed: true },
      failureReason: null,
      demonstratedAction: 'Read another member\'s memo',
      concreteEffect: 'Returned the victim memo body',
      affectedParty: 'customer',
    },
    exchanges: [],
  };
}

function blockedAttempt(candidateId) {
  return {
    verification: {
      verificationId: 'selected-verification',
      candidateId,
      verdict: 'blocked',
      freshStateRefs: [],
      replayActionIds: [SELECTED_ACTION_TASK.taskId],
      replayExchangeIds: [],
      observation: null,
      failureReason: 'fresh verification state was unavailable',
    },
    exchanges: [],
  };
}

function mockActivity(registry, calls, name, implementation) {
  registry[name] = async (...args) => {
    assert.deepEqual(args[0].validationSelection, VALIDATION_SELECTION, `${name} lost the selected validation`);
    calls.push({ name, args });
    return implementation(...args);
  };
}

async function withActivityMocks(registry, operation) {
  const key = Symbol.for(ACTIVITY_MOCKS_KEY);
  assert.equal(globalThis[key], undefined);
  globalThis[key] = registry;
  try {
    return await operation();
  } finally {
    delete globalThis[key];
  }
}

function selectedActionHarness({ outcome, terminalStatus }) {
  const registry = Object.create(null);
  const calls = [];
  let revision = 0;
  let evaluations = 0;
  const candidateIds = outcome === 'verified' || outcome === 'blocked' ? ['selected-candidate'] : [];

  mockActivity(registry, calls, 'preflightBlackbox', async () => ({
    targetOrigin: 'https://target.example',
    targetUrl: 'https://target.example',
    blackboardPath: '/target/.shannon/blackbox/blackboard.json',
    revision: ++revision,
    identities: [
      { name: 'victim', role: 'member', stateRef: '/target/state/victim.json' },
      { name: 'attacker', role: 'member', stateRef: '/target/state/attacker.json' },
    ],
    resumedTasks: [SELECTED_ACTION_TASK],
    unresolvedCandidateIds: [],
    consumedPlanningWaves: 1,
    pendingPlanningEvaluation: { waveNumber: 1, plannerStop: true },
    finalizationIntent: null,
    terminalResult: null,
  }));

  mockActivity(registry, calls, 'captureIdentity', async (_input, identity) => ({
    identity,
    authenticated: true,
    successEvidence: `${identity} authenticated`,
    failureReason: null,
    exchangeIds: [`${identity}-capture`],
    revision: ++revision,
  }));

  mockActivity(registry, calls, 'startBlackboxTasks', async (input) => {
    assert.equal(input.revision, revision);
    assert.deepEqual(input.taskIds, [SELECTED_ACTION_TASK.taskId]);
    revision += 1;
    return { revision, tasks: [selectedTaskState('running')] };
  });

  mockActivity(registry, calls, 'runBlackboxAction', async (input) => {
    assert.equal(input.revision, revision);
    assert.deepEqual(input.task, SELECTED_ACTION_TASK);
    if (outcome === 'unknown') throw new Error('action delivery could not be determined');
    return completedActionContribution(revision, outcome !== 'denied');
  });

  mockActivity(registry, calls, 'settleBlackboxTasks', async (input) => {
    assert.equal(input.baseRevision, revision);
    assert.deepEqual(input.failures, []);
    const action = input.contributions[0]?.actions?.[0];
    if (outcome === 'unknown') {
      assert.equal(action?.status, 'delivery_unknown');
      assert.equal(action?.observation, null);
    } else {
      assert.equal(action?.status, 'completed');
      assert.equal(action?.observation?.passed, outcome !== 'denied');
    }
    revision += 1;
    return { revision, tasks: [selectedTaskState('completed')], candidateIds };
  });

  if (outcome === 'verified' || outcome === 'blocked') {
    mockActivity(registry, calls, 'runBlackboxVerifier', async (input) => {
      assert.equal(input.revision, revision);
      assert.equal(input.candidateId, 'selected-candidate');
      return outcome === 'verified' ? verifiedAttempt(input.candidateId) : blockedAttempt(input.candidateId);
    });
    mockActivity(registry, calls, 'recordBlackboxVerification', async (input) => {
      assert.equal(input.revision, revision);
      assert.equal(input.attempt.verification.verdict, outcome);
      revision += 1;
      return revision;
    });
  }

  if (outcome === 'denied') {
    mockActivity(registry, calls, 'reserveBlackboxPlanningWave', async (input) => {
      assert.equal(input.revision, revision);
      assert.equal(input.waveNumber, 2);
      revision += 1;
      return { revision, tasks: [selectedTaskState('completed')] };
    });
    mockActivity(registry, calls, 'runBlackboxPlanner', async (_input, plannerRevision) => {
      assert.equal(plannerRevision, revision);
      return {
        baseRevision: revision,
        tasks: [],
        stop: true,
        stopReason: 'The selected denial is terminal.',
        closeHypothesisIds: [SELECTED_ACTION_TASK.hypothesisId],
        compiledHypotheses: [],
      };
    });
    mockActivity(registry, calls, 'readPlannerSnapshot', async () => ({
      revision,
      targetOrigin: 'https://target.example',
      rules: { avoid: [], focus: [] },
      identities: [
        { name: 'victim', authenticated: true },
        { name: 'attacker', authenticated: true },
      ],
      exchanges: [],
      references: [],
      hypotheses: [{ hypothesisId: SELECTED_ACTION_TASK.hypothesisId, status: 'tested' }],
      tasks: [{ ...SELECTED_ACTION_TASK, status: 'completed' }],
      deliveryUnknownActions: [],
      rejectedTaskIds: [],
    }));
    mockActivity(registry, calls, 'registerPlannedWave', async (input) => {
      assert.equal(input.revision, revision);
      assert.equal(input.waveNumber, 2);
      assert.deepEqual(input.wave.closedHypothesisIds, [SELECTED_ACTION_TASK.hypothesisId]);
      revision += 1;
      return { revision, wave: input.wave, tasks: [selectedTaskState('completed')] };
    });
  }

  if (outcome === 'blocked') {
    mockActivity(registry, calls, 'reserveBlackboxPlanningWave', async (input) => {
      assert.equal(input.revision, revision);
      assert.equal(input.waveNumber, 2);
      revision += 1;
      return { revision, tasks: [selectedTaskState('completed')] };
    });
    mockActivity(registry, calls, 'runBlackboxPlanner', async (_input, plannerRevision) => {
      assert.equal(plannerRevision, revision);
      const error = new Error('selected verification remained blocked');
      error.name = 'SelectedValidationNotObservedError';
      throw error;
    });
    mockActivity(registry, calls, 'readPlannerSnapshot', async () => ({
      revision,
      tasks: [selectedTaskState('completed')],
    }));
  }

  mockActivity(registry, calls, 'evaluateBlackboxProgress', async (input) => {
    assert.equal(input.revision, revision);
    assert.equal(input.plannerStop, true);
    evaluations += 1;
    assert.equal(input.waveNumber, evaluations);
    revision += 1;
    if ((outcome === 'denied' || outcome === 'blocked') && evaluations === 1) {
      return { decision: 'continue', revision };
    }
    return { decision: terminalStatus === 'incomplete' ? 'incomplete' : 'complete', revision };
  });

  mockActivity(registry, calls, 'finalizeBlackboxRun', async (input) => {
    assert.equal(input.revision, revision);
    assert.equal(input.status, terminalStatus === 'incomplete' ? 'incomplete' : 'complete');
    revision += 1;
    return terminalResult(terminalStatus, revision);
  });

  return { registry, calls };
}

test('selected validation reaches a verified finding terminal result', async () => {
  const harness = selectedActionHarness({ outcome: 'verified', terminalStatus: 'findings' });
  const result = await withActivityMocks(harness.registry, () => blackboxAuthzWorkflow(selectedInput()));

  assert.equal(result.status, 'findings');
  assert.equal(result.findingCount, 1);
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxAction').length, 1);
  assert.deepEqual(
    harness.calls.filter(({ name }) => name === 'runBlackboxVerifier').map(({ args }) => args[0].candidateId),
    ['selected-candidate'],
  );
  assert.equal(harness.calls.some(({ name }) => name === 'captureAnonymous'), false);
  assert.equal(harness.calls.some(({ name }) => name === 'runBlackboxPlanner'), false);
});

test('selected validation denial completes with no findings', async () => {
  const harness = selectedActionHarness({ outcome: 'denied', terminalStatus: 'no_findings' });
  const result = await withActivityMocks(harness.registry, () => blackboxAuthzWorkflow(selectedInput()));

  assert.equal(result.status, 'no_findings');
  assert.equal(result.findingCount, 0);
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxAction').length, 1);
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxPlanner').length, 1);
  assert.deepEqual(
    harness.calls.find(({ name }) => name === 'registerPlannedWave')?.args[0].wave.closedHypothesisIds,
    [SELECTED_ACTION_TASK.hypothesisId],
  );
  assert.equal(harness.calls.some(({ name }) => name === 'runBlackboxVerifier'), false);
  assert.equal(harness.calls.some(({ name }) => name === 'captureAnonymous'), false);
});

test('selected validation with unknown action delivery ends incomplete without a resend', async () => {
  const harness = selectedActionHarness({ outcome: 'unknown', terminalStatus: 'incomplete' });
  const result = await withActivityMocks(harness.registry, () => blackboxAuthzWorkflow(selectedInput()));

  assert.equal(result.status, 'incomplete');
  assert.equal(result.findingCount, 0);
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxAction').length, 1);
  assert.equal(harness.calls.some(({ name }) => name === 'runBlackboxVerifier'), false);
  assert.equal(harness.calls.some(({ name }) => name === 'runBlackboxPlanner'), false);
});

test('selected validation with a blocked fresh verifier ends incomplete', async () => {
  const harness = selectedActionHarness({ outcome: 'blocked', terminalStatus: 'incomplete' });
  const result = await withActivityMocks(harness.registry, () => blackboxAuthzWorkflow(selectedInput()));

  assert.equal(result.status, 'incomplete');
  assert.equal(result.findingCount, 0);
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxAction').length, 1);
  assert.deepEqual(
    harness.calls.filter(({ name }) => name === 'recordBlackboxVerification').map(({ args }) => args[0].attempt.verification.verdict),
    ['blocked'],
  );
  assert.equal(harness.calls.filter(({ name }) => name === 'runBlackboxPlanner').length, 1);
  assert.match(
    harness.calls.find(({ name }) => name === 'finalizeBlackboxRun')?.args[0].failure,
    /SelectedValidationNotObservedError/,
  );
});

test('selected validation missing from fresh captures finalizes incomplete', async () => {
  const registry = Object.create(null);
  const calls = [];
  let revision = 0;

  mockActivity(registry, calls, 'preflightBlackbox', async () => ({
    targetOrigin: 'https://target.example',
    targetUrl: 'https://target.example',
    blackboardPath: '/target/.shannon/blackbox/blackboard.json',
    revision: ++revision,
    identities: [
      { name: 'victim', role: 'member', stateRef: '/target/state/victim.json' },
      { name: 'attacker', role: 'member', stateRef: '/target/state/attacker.json' },
    ],
    resumedTasks: [],
    unresolvedCandidateIds: [],
    consumedPlanningWaves: 0,
    pendingPlanningEvaluation: null,
    finalizationIntent: null,
    terminalResult: null,
  }));
  mockActivity(registry, calls, 'captureIdentity', async (_input, identity) => ({
    identity,
    authenticated: true,
    successEvidence: `${identity} authenticated`,
    failureReason: null,
    exchangeIds: [],
    revision: ++revision,
  }));
  mockActivity(registry, calls, 'reserveBlackboxPlanningWave', async (input) => {
    assert.equal(input.revision, revision);
    revision += 1;
    return { revision, tasks: [] };
  });
  mockActivity(registry, calls, 'runBlackboxPlanner', async (_input, plannerRevision) => {
    assert.equal(plannerRevision, revision);
    const error = new Error('selected route absent from the fresh snapshot');
    error.name = 'SelectedValidationNotObservedError';
    throw error;
  });
  mockActivity(registry, calls, 'readPlannerSnapshot', async () => ({ revision, tasks: [] }));
  mockActivity(registry, calls, 'finalizeBlackboxRun', async (input) => {
    assert.equal(input.status, 'incomplete');
    assert.equal(input.failure, 'black-box workflow component failed (SelectedValidationNotObservedError)');
    revision += 1;
    return terminalResult('incomplete', revision);
  });

  const result = await withActivityMocks(registry, () => blackboxAuthzWorkflow(selectedInput()));

  assert.equal(result.status, 'incomplete');
  assert.equal(calls.filter(({ name }) => name === 'runBlackboxPlanner').length, 1);
  assert.equal(calls.some(({ name }) => name === 'runBlackboxAction'), false);
  assert.equal(calls.some(({ name }) => name === 'captureAnonymous'), false);
});
