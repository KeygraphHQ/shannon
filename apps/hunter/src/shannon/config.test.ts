import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildShannonInvocation, formatInvocation, SHANNON_PACKAGE_SPEC } from './config.js';
import { executeInvocation, planInvocation } from './invoke.js';

test('builds the exact verified Shannon invocation with no invented flags', () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: '/repo/app' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.command, 'npx');
    assert.deepEqual(result.value.args, [
      SHANNON_PACKAGE_SPEC,
      'start',
      '--url',
      'https://app.example.com',
      '--repo',
      '/repo/app',
    ]);
  }
});

test('includes --workspace only when provided', () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: '/repo/app', workspace: 'my-hunt' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.ok(result.value.args.includes('--workspace'));
    assert.ok(result.value.args.includes('my-hunt'));
  }
});

test('rejects a non-http(s) url', () => {
  const result = buildShannonInvocation({ url: 'not-a-url', repo: '/repo/app' });
  assert.equal(result.ok, false);
});

test('rejects a repo that is a URL rather than a local path', () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: 'https://github.com/x/y' });
  assert.equal(result.ok, false);
});

test('formatInvocation renders a copy-pasteable command line', () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: '/repo/app' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(
      formatInvocation(result.value),
      `npx ${SHANNON_PACKAGE_SPEC} start --url https://app.example.com --repo /repo/app`,
    );
  }
});

test('planInvocation never executes anything and just describes the command', () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: '/repo/app' });
  assert.equal(result.ok, true);
  if (result.ok) {
    const plan = planInvocation(result.value);
    assert.equal(plan.commandLine, formatInvocation(result.value));
  }
});

test('executeInvocation refuses to run without explicit confirmation', async () => {
  const result = buildShannonInvocation({ url: 'https://app.example.com', repo: '/repo/app' });
  assert.equal(result.ok, true);
  if (result.ok) {
    const execResult = await executeInvocation(result.value, { confirmed: false });
    assert.equal(execResult.ok, false);
  }
});
