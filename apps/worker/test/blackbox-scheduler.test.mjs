import assert from 'node:assert/strict';
import test from 'node:test';

import {
  commandForActionTask,
  decideRunCompletion,
  operationKeyFor,
  validateAndScheduleWave,
} from '../dist/blackbox/scheduler.js';

const TARGET_ORIGIN = 'https://target.example';

function snapshot(overrides = {}) {
  return {
    revision: 7,
    targetOrigin: TARGET_ORIGIN,
    rules: {
      focus: [{ type: 'url_path', value: '/api' }],
      avoid: [{ type: 'url_path', value: '/api/admin' }],
    },
    identities: [
      { name: 'attacker', authenticated: true },
      { name: 'victim', authenticated: true },
      { name: 'unauthenticated', authenticated: false },
    ],
    exchanges: [
      {
        exchangeId: 'ex_victim',
        origin: TARGET_ORIGIN,
        path: '/api/users/100',
        identity: 'victim',
        inScope: true,
      },
      {
        exchangeId: 'ex_verify',
        origin: TARGET_ORIGIN,
        path: '/api/users/100/audit',
        identity: 'victim',
        inScope: true,
      },
      {
        exchangeId: 'ex_foreign',
        origin: 'https://foreign.example',
        path: '/api/users/100',
        identity: 'victim',
        inScope: true,
      },
      {
        exchangeId: 'ex_avoided',
        origin: TARGET_ORIGIN,
        path: '/api/admin/users/100',
        identity: 'victim',
        inScope: false,
      },
    ],
    references: [
      { id: 'ex_victim', kind: 'exchange' },
      { id: 'ex_verify', kind: 'exchange' },
      { id: 'ex_foreign', kind: 'exchange' },
      { id: 'ex_avoided', kind: 'exchange' },
      { id: 'resource_100', kind: 'resource' },
      { id: 'transition_1', kind: 'transition' },
    ],
    hypotheses: [
      { hypothesisId: 'hyp_authz', status: 'open' },
      { hypothesisId: 'hyp_info', status: 'open' },
      { hypothesisId: 'hyp_verified', status: 'verified' },
    ],
    tasks: [
      { taskId: 'prior_task', status: 'completed', identityLease: 'attacker', hypothesisId: 'hyp_authz' },
      { taskId: 'active_task', status: 'running', identityLease: 'victim', hypothesisId: null },
    ],
    rejectedTaskIds: ['prior_rejected'],
    ...overrides,
  };
}

function task(taskId, kind, overrides = {}) {
  return {
    taskId,
    kind,
    objective: `Run ${taskId}`,
    evidence: [{ id: 'ex_victim', kind: 'exchange' }],
    identityLease: kind === 'recon' ? 'attacker' : null,
    hypothesisId: null,
    status: 'pending',
    ...overrides,
  };
}

function actionTask(taskId = 'action_authz', overrides = {}) {
  return task(taskId, 'action', {
    evidence: [
      { id: 'ex_victim', kind: 'exchange' },
      { id: 'ex_verify', kind: 'exchange' },
      { id: 'resource_100', kind: 'resource' },
    ],
    identityLease: 'attacker',
    hypothesisId: 'hyp_authz',
    replayPlan: {
      steps: [
        {
          stepId: 'step_read_other_user',
          sourceExchangeId: 'ex_victim',
          actor: 'attacker',
          mutations: [{ type: 'set_path', path: '/api/users/101' }],
        },
      ],
      proofCondition: {
        type: 'persistent_state',
        verificationSourceExchangeId: 'ex_verify',
        marker: 'user-101',
      },
    },
    ...overrides,
  });
}

function batch(tasks, overrides = {}) {
  return { baseRevision: 7, tasks, stop: false, ...overrides };
}

test('schedules independent recon and analysis concurrently and serializes approved actions', () => {
  const recon = task('recon_attacker', 'recon');
  const analysis = task('analysis_compare', 'analysis', {
    evidence: [{ id: 'resource_100', kind: 'resource' }],
  });
  const action = actionTask();

  const wave = validateAndScheduleWave(batch([recon, analysis, action]), snapshot({ tasks: [] }));

  assert.deepEqual(wave.concurrent, [recon, analysis]);
  assert.deepEqual(wave.actions, [action]);
  assert.deepEqual(wave.rejected, []);
  assert.deepEqual(wave.closedHypothesisIds, []);
  assert.deepEqual(commandForActionTask(action), {
    actionId: 'action_authz',
    ...action.replayPlan,
  });
  assert.equal(commandForActionTask(action, 'action_authz_attempt_1').actionId, 'action_authz_attempt_1');
});

test('rejects duplicate, prior, unsupported, unbacked, and conflicting concurrent tasks', () => {
  const duplicateOne = task('duplicate', 'analysis');
  const duplicateTwo = task('duplicate', 'recon');
  const invalidGroups = [
    [
      duplicateOne,
      duplicateTwo,
      task('prior_task', 'analysis'),
      task('prior_rejected', 'analysis'),
      task('../unsafe', 'analysis'),
      task('unsupported', 'scan'),
    ],
    [
      task('unknown_evidence', 'analysis', { evidence: [{ id: 'fabricated', kind: 'exchange' }] }),
      task('empty_evidence', 'analysis', { evidence: [] }),
      task('unknown_identity', 'recon', { identityLease: 'fabricated' }),
      task('unauthenticated_identity', 'recon', { identityLease: 'unauthenticated' }),
      task('missing_recon_lease', 'recon', { identityLease: null }),
      task('running_status', 'analysis', { status: 'running' }),
    ],
  ];
  const conflict = [
    task('lease_one', 'analysis', { identityLease: 'attacker' }),
    task('lease_two', 'recon', { identityLease: 'attacker' }),
  ];

  const waves = [
    ...invalidGroups.map((cases) => validateAndScheduleWave(batch(cases), snapshot())),
    validateAndScheduleWave(batch(conflict), snapshot()),
  ];
  const reasons = new Map(waves.flatMap(({ rejected }) => rejected).map((entry) => [entry.taskId, entry.reason]));

  assert.deepEqual(waves.flatMap(({ concurrent }) => concurrent).map(({ taskId }) => taskId), ['lease_one']);
  assert.equal(waves.flatMap(({ actions }) => actions).length, 0);
  assert.match(reasons.get('duplicate'), /duplicate/i);
  assert.match(reasons.get('prior_task'), /prior|existing/i);
  assert.match(reasons.get('prior_rejected'), /prior|existing/i);
  assert.match(reasons.get('../unsafe'), /identifier/i);
  assert.match(reasons.get('unsupported'), /kind/i);
  assert.match(reasons.get('unknown_evidence'), /evidence/i);
  assert.match(reasons.get('empty_evidence'), /evidence/i);
  assert.match(reasons.get('unknown_identity'), /identity/i);
  assert.match(reasons.get('unauthenticated_identity'), /authenticated/i);
  assert.match(reasons.get('missing_recon_lease'), /lease/i);
  assert.match(reasons.get('running_status'), /pending/i);
  assert.match(reasons.get('lease_two'), /lease|identity/i);
});

test('rejects malformed or insufficient action plans before any replay can run', () => {
  const baseStep = actionTask().replayPlan.steps[0];
  const cases = [
    actionTask('missing_hypothesis', { hypothesisId: null }),
    actionTask('unknown_hypothesis', { hypothesisId: 'fabricated' }),
    task('missing_plan', 'action', { hypothesisId: 'hyp_authz' }),
    actionTask('uncited_source', {
      evidence: [{ id: 'resource_100', kind: 'resource' }, { id: 'ex_verify', kind: 'exchange' }],
    }),
    actionTask('uncited_proof_source', {
      evidence: [{ id: 'resource_100', kind: 'resource' }, { id: 'ex_victim', kind: 'exchange' }],
    }),
    actionTask('foreign_source', {
      evidence: [
        { id: 'ex_foreign', kind: 'exchange' },
        { id: 'ex_verify', kind: 'exchange' },
      ],
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [{ ...baseStep, sourceExchangeId: 'ex_foreign' }],
      },
    }),
    actionTask('avoided_source', {
      evidence: [
        { id: 'ex_avoided', kind: 'exchange' },
        { id: 'ex_verify', kind: 'exchange' },
      ],
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [{ ...baseStep, sourceExchangeId: 'ex_avoided' }],
      },
    }),
    actionTask('bad_actor', {
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [{ ...baseStep, actor: 'unauthenticated' }],
      },
    }),
    actionTask('no_steps', { replayPlan: { ...actionTask().replayPlan, steps: [] } }),
    actionTask('too_many_steps', {
      replayPlan: {
        ...actionTask().replayPlan,
        steps: Array.from({ length: 5 }, (_, index) => ({ ...baseStep, stepId: `step_${index}` })),
      },
    }),
    actionTask('no_mutation_same_identity', {
      replayPlan: { ...actionTask().replayPlan, steps: [{ ...baseStep, actor: 'victim', mutations: [] }] },
    }),
    actionTask('too_many_mutations', {
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [
          {
            ...baseStep,
            mutations: Array.from({ length: 9 }, (_, index) => ({
              type: 'set_query',
              name: 'value',
              value: String(index),
            })),
          },
        ],
      },
    }),
    actionTask('invalid_path', {
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [{ ...baseStep, mutations: [{ type: 'set_path', path: 'https://foreign.example/api' }] }],
      },
    }),
    actionTask('avoided_path', {
      replayPlan: {
        ...actionTask().replayPlan,
        steps: [{ ...baseStep, mutations: [{ type: 'set_path', path: '/api/admin/users' }] }],
      },
    }),
  ];

  const waves = [];
  for (let index = 0; index < cases.length; index += 6) {
    waves.push(validateAndScheduleWave(batch(cases.slice(index, index + 6)), snapshot({ tasks: [] })));
  }
  const rejected = waves.flatMap((wave) => wave.rejected);

  assert.equal(waves.flatMap(({ concurrent }) => concurrent).length, 0);
  assert.equal(waves.flatMap(({ actions }) => actions).length, 0);
  assert.deepEqual(
    rejected.map(({ taskId }) => taskId),
    cases.map(({ taskId }) => taskId),
  );
  for (const rejection of rejected) {
    assert.match(rejection.reason, /action|hypothesis|plan|evidence|source|scope|origin|actor|step|mutation|path/i);
  }
});

test('serialized actions may reuse the same authenticated identity', () => {
  const first = actionTask('action_one');
  const second = actionTask('action_two');
  const wave = validateAndScheduleWave(batch([first, second]), snapshot({ tasks: [] }));

  assert.deepEqual(wave.actions, [first, second]);
  assert.deepEqual(wave.rejected, []);
});

test('an identity swap is a valid authorization mutation without an explicit request-field mutation', () => {
  const identitySwap = actionTask('action_identity_swap', {
    replayPlan: {
      ...actionTask().replayPlan,
      steps: [{ ...actionTask().replayPlan.steps[0], actor: 'attacker', mutations: [] }],
    },
  });

  const wave = validateAndScheduleWave(batch([identitySwap]), snapshot({ tasks: [] }));

  assert.deepEqual(wave.actions, [identitySwap]);
  assert.deepEqual(wave.rejected, []);
});

test('actions wait for identities leased by pre-existing running work', () => {
  const leasedTask = actionTask('action_leased_task', { identityLease: 'victim' });
  const leasedActor = actionTask('action_leased_actor', {
    replayPlan: {
      ...actionTask().replayPlan,
      steps: [{ ...actionTask().replayPlan.steps[0], actor: 'victim' }],
    },
  });

  const wave = validateAndScheduleWave(batch([leasedTask, leasedActor]), snapshot());

  assert.equal(wave.actions.length, 0);
  assert.deepEqual(wave.rejected.map(({ taskId }) => taskId), ['action_leased_task', 'action_leased_actor']);
  for (const { reason } of wave.rejected) assert.match(reason, /leased|running|identity/i);
});

test('requires the current revision and a bounded planner batch', () => {
  assert.throws(
    () => validateAndScheduleWave(batch([], { baseRevision: 6 }), snapshot()),
    /revision|stale/i,
  );
  assert.throws(
    () => validateAndScheduleWave(batch(Array.from({ length: 7 }, (_, index) => task(`task_${index}`, 'analysis'))), snapshot()),
    /zero to six|six tasks|batch/i,
  );
});

test('deduplicates explicit valid closure IDs and rejects unsafe, unknown, or terminal closures', () => {
  const wave = validateAndScheduleWave(
    batch([], { stop: true, closeHypothesisIds: ['hyp_info', 'hyp_info'] }),
    snapshot({ tasks: [] }),
  );
  assert.deepEqual(wave.closedHypothesisIds, ['hyp_info']);

  for (const closeHypothesisIds of [['fabricated'], ['../unsafe'], ['hyp_verified']]) {
    assert.throws(
      () => validateAndScheduleWave(batch([], { stop: true, closeHypothesisIds }), snapshot({ tasks: [] })),
      /hypothesis|identifier|terminal/i,
    );
  }
  assert.throws(
    () => validateAndScheduleWave(batch([task('still_working', 'analysis')], { stop: true, closeHypothesisIds: ['hyp_info'] }), snapshot({ tasks: [] })),
    /close|tasks/i,
  );
});

test('completion requires planner stop with no pending task or open impact hypothesis', () => {
  assert.equal(
    decideRunCompletion({
      wave: 4,
      plannerStop: true,
      pendingTasks: 0,
      openImpactHypotheses: 0,
      hitSafetyLimit: false,
    }),
    'complete',
  );
  for (const input of [
    { plannerStop: false, pendingTasks: 0, openImpactHypotheses: 0 },
    { plannerStop: true, pendingTasks: 1, openImpactHypotheses: 0 },
    { plannerStop: true, pendingTasks: 0, openImpactHypotheses: 1 },
  ]) {
    assert.equal(decideRunCompletion({ wave: 4, hitSafetyLimit: false, ...input }), 'continue');
  }
  assert.equal(
    decideRunCompletion({
      wave: 8,
      plannerStop: true,
      pendingTasks: 1,
      openImpactHypotheses: 0,
      hitSafetyLimit: false,
    }),
    'incomplete',
  );
  assert.equal(
    decideRunCompletion({
      wave: 2,
      plannerStop: false,
      pendingTasks: 0,
      openImpactHypotheses: 0,
      hitSafetyLimit: true,
    }),
    'incomplete',
  );
});

test('operation keys validate and deterministically sort record IDs without mutating input', () => {
  const ids = ['task_b', 'task_a'];
  assert.equal(operationKeyFor('workflow-1', 3, 'settle', ids), 'workflow-1:3:settle:task_a,task_b');
  assert.deepEqual(ids, ['task_b', 'task_a']);

  for (const call of [
    () => operationKeyFor('bad:workflow', 1, 'start', []),
    () => operationKeyFor('workflow-1', -1, 'start', []),
    () => operationKeyFor('workflow-1', 1, 'start', ['../unsafe']),
    () => operationKeyFor('workflow-1', 1, 'start', ['duplicate', 'duplicate']),
    () => operationKeyFor('workflow-1', 1, 'unknown', []),
  ]) {
    assert.throws(call, /workflow|wave|identifier|duplicate|transition/i);
  }
});

test('command construction rejects non-actions and invalid execution identifiers', () => {
  assert.throws(() => commandForActionTask(task('analysis_only', 'analysis')), /action/i);
  assert.throws(() => commandForActionTask(actionTask(), '../unsafe'), /identifier/i);
});
