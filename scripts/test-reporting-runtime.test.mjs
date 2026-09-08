import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSuccessfulContainer, removeOwnedResource, reportingContextInputs, reportingTestProfile } from './test-reporting-runtime.mjs';

function fakeDocker(inspected, removed = { code: 0, output: '', timedOut: false }) {
  const calls = [];
  return {
    calls,
    run: async args => {
      calls.push(args);
      return calls.length === 1 ? inspected : removed;
    },
  };
}

test('cleans an owned resource even when its creation response was lost', async () => {
  for (const kind of ['container', 'network', 'image']) {
    const docker = fakeDocker({ code: 0, output: 'our-run\n', timedOut: false });
    await removeOwnedResource(docker.run, kind, 'unique-attempted-name', 'our-run');
    assert.equal(docker.calls[0][1], 'inspect');
    assert.deepEqual(docker.calls[1], [kind, 'rm', ...(kind === 'container' ? ['--force'] : []), 'unique-attempted-name']);
  }
});

test('does not delete a resource whose ownership label differs or is absent', async () => {
  for (const output of ['other-run', '', '<no value>']) {
    const docker = fakeDocker({ code: 0, output, timedOut: false });
    await assert.rejects(removeOwnedResource(docker.run, 'container', 'same-name', 'our-run'), /ownership label/);
    assert.equal(docker.calls.length, 1);
  }
});

test('an explicitly missing attempted resource needs no deletion', async () => {
  const docker = fakeDocker({ code: 1, output: 'Error: No such container: unique-name', timedOut: false });
  await removeOwnedResource(docker.run, 'container', 'unique-name', 'our-run');
  assert.equal(docker.calls.length, 1);
});

test('daemon errors and timeouts cannot be treated as absence or successful cleanup', async () => {
  for (const inspected of [
    { code: 1, output: 'Internal Server Error', timedOut: false },
    { code: null, output: 'No such container', timedOut: true },
  ]) {
    const docker = fakeDocker(inspected);
    await assert.rejects(removeOwnedResource(docker.run, 'container', 'unique-name', 'our-run'), /Could not inspect/);
    assert.equal(docker.calls.length, 1);
  }
});

test('a resource removal failure is reported', async () => {
  const docker = fakeDocker({ code: 0, output: 'our-run', timedOut: false }, { code: 1, output: 'network has active endpoints', timedOut: false });
  await assert.rejects(removeOwnedResource(docker.run, 'network', 'unique-name', 'our-run'), /Could not remove/);
});

test('an attached container must be exited, stopped and successful', () => {
  assert.doesNotThrow(() => assertSuccessfulContainer({ Status: 'exited', Running: false, ExitCode: 0 }));
  for (const state of [
    { Status: 'running', Running: true, ExitCode: 0 },
    { Status: 'created', Running: false, ExitCode: 0 },
    { Status: 'exited', Running: false, ExitCode: 1 },
  ]) assert.throws(() => assertSuccessfulContainer(state), /did not exit successfully/);
});

test('bundle profile disables service setup and uses a fixed command without a network', () => {
  const profile = reportingTestProfile(['--bundles']);
  assert.equal(profile.temporal, false);
  assert.equal(profile.network, 'none');
  assert.deepEqual(profile.command, ['pnpm', 'test:reporting:bundles']);
  const runtime = reportingTestProfile([]);
  assert.equal(runtime.temporal, true);
  assert.notEqual(runtime.network, 'none');
  assert.deepEqual(runtime.command, []);
});

test('unsupported runtime options fail before any Docker execution', () => {
  for (const args of [['--unknown'], ['--bundles', '--extra'], ['--bundles', '--bundles'], ['--review', '--review'], ['--review', '--bundles'], ['--review', 'publish']])
    assert.throws(() => reportingTestProfile(args), /Usage:/);
});

test('review profile uses a fixed offline command with no Temporal service and an explicit fixture context', () => {
  const profile = reportingTestProfile(['--review']);
  assert.deepEqual(profile, { name: 'review', temporal: false, network: 'none', command: ['pnpm', 'test:review:cases'] });
  const inputs = reportingContextInputs(profile);
  for (const entry of ['scripts/review.mjs', 'scripts/evaluate-security-review.mjs', 'scripts/security-review-cli.test.mjs',
    'apps/worker/test/fixtures/security-review', 'apps/worker/test/security-review-input.test.mjs',
    'apps/worker/test/security-review-evaluation.test.mjs', 'apps/worker/test/security-review-openapi.test.mjs',
    'apps/worker/test/security-review-compose.test.mjs', 'apps/worker/test/security-review-openapi-review.test.mjs',
    'apps/worker/test/security-review-compose-review.test.mjs', 'apps/worker/test/security-review-boundaries-review.test.mjs']) assert.ok(inputs.includes(entry), `missing ${entry}`);
  assert.equal(inputs.length, new Set(inputs).size);
  for (const entry of ['apps/worker/test', 'apps/worker/test/reporting-runtime.test.mjs', 'apps/worker/test/fixtures/reporting-runtime',
    'workspaces', 'configs', '.env', '.git', 'node_modules', 'apps/worker/dist']) assert.ok(!inputs.includes(entry), `unexpected ${entry}`);
  const reporting = reportingContextInputs(reportingTestProfile(['--bundles']));
  assert.ok(reporting.includes('apps/worker/test/reporting-runtime.test.mjs'));
  assert.ok(!reporting.includes('scripts/review.mjs'));
  assert.throws(() => reportingContextInputs({ name: 'arbitrary' }), /Unsupported/);
});
