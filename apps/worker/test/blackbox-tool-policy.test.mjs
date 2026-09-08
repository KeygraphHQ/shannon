import assert from 'node:assert/strict';
import test from 'node:test';
import { Value } from 'typebox/value';

import * as piExecutor from '../dist/ai/pi/pi-executor.js';
import { BLACKBOX_AGENTS } from '../dist/blackbox/agents.js';
import { createBlackboxTools } from '../dist/blackbox/tools.js';

const {
  DEFAULT_PI_TOOL_POLICY,
  resolvePiSessionToolConfiguration,
  resolvePiToolNames,
} = piExecutor;

const CUSTOM = {
  planner: ['submit_planner_tasks'],
  'blackbox-recon': ['read_target_history', 'submit_worker_contribution'],
  'blackbox-analysis': ['submit_worker_contribution'],
  'blackbox-action': ['replay_target_request', 'submit_worker_contribution'],
  'blackbox-verifier': ['replay_verification_request', 'submit_verification'],
};

const ROLE_SURFACES = {
  planner: { builtins: [], browser: false },
  'blackbox-recon': { builtins: ['bash'], browser: true },
  'blackbox-analysis': { builtins: [], browser: false },
  'blackbox-action': { builtins: ['bash'], browser: true },
  'blackbox-verifier': { builtins: ['bash'], browser: true },
};

function toolNames(value) {
  if (Array.isArray(value)) return value.map((tool) => (typeof tool === 'string' ? tool : tool.name));
  if (value && Array.isArray(value.tools)) return value.tools.map((tool) => (typeof tool === 'string' ? tool : tool.name));
  throw new TypeError('black-box tool factory must return a tools array');
}

function makeTask(kind, taskId = `${kind}-task`) {
  return {
    taskId,
    kind,
    objective: `Execute ${kind}`,
    evidence: [],
    identityLease: kind === 'analysis' ? null : 'attacker',
    hypothesisId: kind === 'action' ? 'hyp-1' : null,
    status: 'running',
  };
}

test('the existing white-box Pi surface remains unchanged when no policy is supplied', () => {
  assert.deepEqual(resolvePiToolNames(undefined, ['custom_collector']), [
    'read',
    'bash',
    'edit',
    'write',
    'grep',
    'find',
    'ls',
    'task',
    'todo_write',
    'glob',
    'custom_collector',
  ]);
  assert.deepEqual(DEFAULT_PI_TOOL_POLICY, {
    builtinTools: ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'],
    includeTask: true,
    includeTodo: true,
    includeGlob: true,
    includeBrowserSkill: false,
  });
});

test('an explicit black-box Pi policy is authoritative and deduplicates custom tools', () => {
  assert.deepEqual(
    resolvePiToolNames(
      { builtinTools: ['bash'], includeTask: false, includeTodo: false, includeGlob: false, includeBrowserSkill: true },
      ['submit_result', 'bash', 'submit_result'],
    ),
    ['bash', 'submit_result'],
  );
  assert.deepEqual(resolvePiToolNames({}, ['submit_result']), ['submit_result']);
});

test('the object passed to the Pi session removes disabled custom helpers', () => {
  const task = { name: 'task' };
  const todo = { name: 'todo_write' };
  const glob = { name: 'glob' };
  const submit = { name: 'submit_result' };
  const configuration = resolvePiSessionToolConfiguration(
    { builtinTools: ['bash', 'bash'] },
    false,
    [task, todo, glob, submit],
  );

  assert.deepEqual(configuration.tools, ['bash', 'submit_result']);
  assert.deepEqual(configuration.customTools, [submit]);

  const defaults = resolvePiSessionToolConfiguration(undefined, undefined, [task, todo, glob, submit]);
  assert.deepEqual(defaults.tools, [
    'read', 'bash', 'edit', 'write', 'grep', 'find', 'ls',
    'task', 'todo_write', 'glob', 'submit_result',
  ]);
  assert.deepEqual(defaults.customTools, [task, todo, glob, submit]);
});

test('black-box role definitions expose only the planned capability surface', () => {
  for (const [kind, surface] of Object.entries(ROLE_SURFACES)) {
    const definition = BLACKBOX_AGENTS[kind];
    assert.ok(definition, `missing ${kind} black-box agent definition`);
    assert.deepEqual([...definition.policy.builtinTools], surface.builtins, `${kind} built-ins`);
    assert.equal(definition.policy.includeBrowserSkill, surface.browser, `${kind} browser skill`);
    assert.equal(definition.policy.includeTask, false, `${kind} task access`);
    assert.equal(definition.policy.includeTodo, false, `${kind} todo access`);
    assert.equal(definition.policy.includeGlob, false, `${kind} glob access`);

    const taskKind = kind === 'planner' ? 'analysis' : kind.replace('blackbox-', '');
    const options = { role: kind, task: makeTask(taskKind) };
    if (kind === 'blackbox-recon') options.readTargetHistory = async () => [];
    if (kind === 'blackbox-action') options.replayTargetRequest = async () => ({ status: 'completed' });
    if (kind === 'blackbox-verifier') {
      options.candidateId = 'candidate-surface';
      options.replayVerificationRequest = async () => ({ status: 'blocked' });
    }
    const tools = createBlackboxTools(options);
    assert.deepEqual(toolNames(tools), CUSTOM[kind], `${kind} custom tools`);
    assert.equal(toolNames(tools).some((name) => ['edit', 'write', 'read', 'grep', 'find', 'ls', 'task', 'todo_write', 'glob'].includes(name)), false);
    assert.equal(toolNames(tools).some((name) => /burp|request|intercept|settings/i.test(name) && !CUSTOM[kind].includes(name)), false);
  }
});

test('only black-box browser policies load the playwright-only bash guard', () => {
  assert.equal(typeof piExecutor.resolvePiExtensionPaths, 'function');

  for (const [kind, definition] of Object.entries(BLACKBOX_AGENTS)) {
    const paths = piExecutor.resolvePiExtensionPaths(definition.policy);
    const guardPaths = paths.filter((entry) => entry.endsWith('blackbox-bash-guard'));
    assert.equal(guardPaths.length, ROLE_SURFACES[kind].browser ? 1 : 0, kind);
  }

  assert.equal(
    piExecutor
      .resolvePiExtensionPaths({ builtinTools: ['bash'], includeBrowserSkill: true })
      .some((entry) => entry.endsWith('blackbox-bash-guard')),
    false,
    'generic/white-box browser policy',
  );
  assert.equal(
    piExecutor.resolvePiExtensionPaths(undefined).some((entry) => entry.endsWith('blackbox-bash-guard')),
    false,
    'default policy',
  );
});

test('black-box browser policies bind an inline guard to one exact safe session set', () => {
  assert.equal(typeof piExecutor.resolvePiExtensionFactories, 'function');
  const policy = BLACKBOX_AGENTS['blackbox-recon'].policy;
  const allowed = ['bb-attacker'];
  const factories = piExecutor.resolvePiExtensionFactories(policy, allowed);
  allowed[0] = 'bb-mutated';

  assert.equal(factories.length, 1);
  let handler;
  factories[0]({ on(_event, callback) { handler = callback; } });
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'allowed', input: { command: 'playwright-cli -s=bb-attacker snapshot' } }),
    undefined,
  );
  assert.equal(
    handler({ type: 'tool_call', toolName: 'bash', toolCallId: 'denied', input: { command: 'playwright-cli -s=bb-mutated snapshot' } })?.block,
    true,
  );

  for (const sessions of [undefined, [], [''], ['bb-one', 'bb-one'], ['unsafe/name'], ['-unsafe'], ['a'.repeat(257)]]) {
    assert.throws(() => piExecutor.resolvePiExtensionFactories(policy, sessions), /playwright session/i);
  }
  assert.deepEqual(piExecutor.resolvePiExtensionFactories(undefined, undefined), []);
  assert.throws(() => piExecutor.resolvePiExtensionFactories(undefined, []), /playwright session/i);
  assert.throws(
    () => piExecutor.resolvePiExtensionFactories(BLACKBOX_AGENTS.planner.policy, ['bb-planner']),
    /playwright session/i,
  );
});

test('target replay derives its approved action from the assignment and permits one fresh-actor retry only', async () => {
  const calls = [];
  const tools = createBlackboxTools({
    role: 'blackbox-action',
    task: makeTask('action', 'action-17'),
    replayTargetRequest: async (...arguments_) => {
      calls.push(arguments_.length);
      return calls.length === 1 ? { status: 'needs_fresh_actor_request' } : { status: 'completed', proof: { passed: true } };
    },
  });
  const replay = tools.find((tool) => tool.name === 'replay_target_request');
  assert.ok(replay);

  assert.equal(Value.Check(replay.parameters, {}), true);
  assert.equal(Value.Check(replay.parameters, { actionId: 'action-17' }), false);
  await replay.execute('call-1', {});
  await replay.execute('call-2', {});
  assert.deepEqual(calls, [0, 0]);
  await assert.rejects(replay.execute('call-3', {}), /second|only|already|call/i);
  assert.deepEqual(calls, [0, 0]);
});

test('a fresh-actor response on the retry does not permit a third request', async () => {
  let calls = 0;
  const tools = createBlackboxTools({
    role: 'blackbox-action',
    task: makeTask('action', 'action-retry'),
    replayTargetRequest: async () => {
      calls += 1;
      return { status: 'needs_fresh_actor_request' };
    },
  });
  const replay = tools.find((tool) => tool.name === 'replay_target_request');

  await replay.execute('call-1', {});
  await replay.execute('call-2', {});
  await assert.rejects(replay.execute('call-3', {}), /only|call|already/i);
  assert.equal(calls, 2);
});

test('verification replay rejects a mismatched candidate without sending traffic', async () => {
  let calls = 0;
  const tools = createBlackboxTools({
    role: 'blackbox-verifier',
    candidateId: 'candidate-9',
    replayVerificationRequest: async () => {
      calls += 1;
      return { status: 'verified' };
    },
  });
  const replay = tools.find((tool) => tool.name === 'replay_verification_request');
  assert.ok(replay);

  await assert.rejects(replay.execute('call-1', { candidateId: 'candidate-other' }), /bound|assigned|mismatch|candidate/i);
  assert.equal(calls, 0);
  await replay.execute('call-2', { candidateId: 'candidate-9' });
  assert.equal(calls, 1);
  await assert.rejects(replay.execute('call-3', { candidateId: 'candidate-9' }), /already|extra|only|call/i);
  assert.equal(calls, 1);
});

test('verification replay remains one-shot when fresh actor acquisition is host-controlled', async () => {
  let calls = 0;
  const tools = createBlackboxTools({
    role: 'blackbox-verifier',
    candidateId: 'candidate-host-retry',
    replayVerificationRequest: async () => {
      calls += 1;
      return { status: 'needs_fresh_actor_request' };
    },
  });
  const replay = tools.find((tool) => tool.name === 'replay_verification_request');
  assert.ok(replay);

  await replay.execute('call-1', { candidateId: 'candidate-host-retry' });
  await assert.rejects(
    replay.execute('call-2', { candidateId: 'candidate-host-retry' }),
    /already|extra|only|call/i,
  );
  assert.equal(calls, 1);
});

test('verification replay requires an explicit assigned candidate', () => {
  assert.throws(
    () => createBlackboxTools({ role: 'blackbox-verifier' }),
    /candidate|assigned/i,
  );
});

test('effect roles fail construction when their bound callback is missing', () => {
  assert.throws(() => createBlackboxTools({ role: 'blackbox-recon' }), /history|callback|configured/i);
  assert.throws(
    () => createBlackboxTools({ role: 'blackbox-action', task: makeTask('action', 'action-missing') }),
    /replay|callback|configured/i,
  );
  assert.throws(
    () => createBlackboxTools({ role: 'blackbox-verifier', candidateId: 'candidate-missing' }),
    /replay|callback|configured/i,
  );
});
