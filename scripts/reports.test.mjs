import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const original = fileURLToPath(new URL('./reports.mjs', import.meta.url));
const SECRET = 'private-launcher-credential-39b2';

async function checkout(t) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'report-launcher-test-'));
  t.after(async () => {
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('report-launcher-test-'));
    await fs.rm(resolved, { recursive: true, force: true });
  });
  const repository = path.join(root, 'checkout with spaces ü');
  const scripts = path.join(repository, 'scripts');
  const caller = path.join(root, 'external caller é');
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(caller);
  const launcher = path.join(scripts, 'reports.mjs');
  await fs.copyFile(original, launcher);
  const cli = path.join(repository, 'apps', 'worker', 'dist', 'scripts', 'report-bundle.js');
  const run = (...args) => {
    const result = spawnSync(process.execPath, [launcher, ...args], {
      cwd: caller, encoding: 'utf8', timeout: 15000,
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null);
    assert.equal(result.stderr, '');
    return result;
  };
  const stub = async code => {
    await fs.mkdir(path.dirname(cli), { recursive: true });
    await fs.writeFile(cli, code);
  };
  return { root, repository, caller, cli, run, stub };
}

function jsonResult(result, status) {
  assert.equal(result.status, status);
  assert.equal(result.stdout.trim().split('\n').length, 1);
  assert.ok(!result.stdout.includes(SECRET));
  return JSON.parse(result.stdout);
}

test('help works in a fresh checkout without dependencies or compiled output', async t => {
  const { repository, run } = await checkout(t);
  const result = run('--help');
  assert.equal(result.status, 0);
  for (const expected of ['check', 'archive', 'share', 'catalog', 'library', '--require-integrity', '--frozen-lockfile', '@shannon/worker build', 'Node.js 22', 'pnpm 10.33.0', 'Exit codes']) {
    assert.ok(result.stdout.includes(expected), expected);
  }
  assert.deepEqual(await fs.readdir(repository), ['scripts']);
});

test('each operation reports a fixed build prerequisite before a worker build exists', async t => {
  const { repository, run } = await checkout(t);
  for (const args of [
    ['check', SECRET], ['check', SECRET, '--require-integrity'],
    ['archive', SECRET, SECRET], ['share', SECRET, SECRET], ['catalog', SECRET], ['library', SECRET, SECRET],
  ]) {
    const result = run(...args);
    const output = jsonResult(result, 1);
    assert.equal(output.valid, false);
    assert.equal(output.issues[0].code, 'build_required');
    assert.match(output.issues[0].message, /install --frozen-lockfile/);
    assert.ok(!result.stdout.includes(repository));
  }
  assert.deepEqual(await fs.readdir(repository), ['scripts']);
});

test('invalid arguments produce usage errors before a worker build exists', async t => {
  const { run } = await checkout(t);
  for (const args of [[], [SECRET], ['check'], ['archive', SECRET], ['share', SECRET, SECRET, SECRET], ['check', SECRET, SECRET], ['--help', SECRET], ['catalog'], ['catalog', SECRET, SECRET], ['library', SECRET], ['library', SECRET, SECRET, SECRET]]) {
    const output = jsonResult(run(...args), 2);
    assert.equal(output.issues[0].code, 'usage');
  }
});

test('a directory at the compiled entry point is diagnosed as unavailable build output', async t => {
  const { cli, run } = await checkout(t);
  await fs.mkdir(cli, { recursive: true });
  assert.equal(jsonResult(run('check', SECRET), 1).issues[0].code, 'build_required');
});

test('launcher forwards paths and metacharacters exactly and preserves the caller directory', async t => {
  const { caller, run, stub } = await checkout(t);
  await stub('console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));');
  const source = 'relative directory/évidence $HOME `test` & ; "quote"';
  const destination = 'another directory/公開 [result]';
  for (const args of [
    ['check', source], ['check', source, '--require-integrity'],
    ['archive', source, destination], ['share', source, destination], ['catalog', source], ['library', source, destination],
  ]) {
    const result = run(...args);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), { args, cwd: caller });
  }
});

test('structured CLI failures and nonzero child statuses are preserved', async t => {
  const { run, stub } = await checkout(t);
  const output = { schemaVersion: 1, valid: false, issues: [{ code: 'fixture_failure', message: 'Fixed failure.' }] };
  for (const status of [1, 2, 7]) {
    await stub(`console.log(${JSON.stringify(JSON.stringify(output))}); process.exitCode = ${status};`);
    assert.deepEqual(jsonResult(run('check', SECRET), status), output);
  }
});

test('child crashes omit raw startup diagnostics and return a fixed JSON failure', async t => {
  const { repository, run, stub } = await checkout(t);
  await stub(`throw new Error(${JSON.stringify(SECRET)});`);
  const result = run('check', SECRET);
  assert.equal(jsonResult(result, 1).issues[0].code, 'launch_failed');
  assert.ok(!result.stdout.includes(repository));
});

test('silent child failures preserve their status with a machine-readable diagnostic', async t => {
  const { run, stub } = await checkout(t);
  await stub('process.exitCode = 7;');
  assert.equal(jsonResult(run('check', SECRET), 7).issues[0].code, 'launch_failed');
});

test('a child exiting successfully without a result is reported as a launch failure', async t => {
  const { run, stub } = await checkout(t);
  await stub('process.exitCode = 0;');
  assert.equal(jsonResult(run('check', SECRET), 1).issues[0].code, 'launch_failed');
});
