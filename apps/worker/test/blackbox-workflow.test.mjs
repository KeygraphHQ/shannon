import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSettlement } from '../dist/temporal/blackbox-workflow.js';

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
