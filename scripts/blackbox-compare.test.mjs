import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createOwnedWorkspace, removeOwnedWorkspace } from './test-reporting-install.mjs';

const launcher = fileURLToPath(new URL('./blackbox-compare.mjs', import.meta.url));
const run = (file, args = [], options = {}) => spawnSync(process.execPath, [file, ...args], {
  encoding: 'utf8', timeout: 15_000, windowsHide: true, ...options,
});
async function owned(t) {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  return owner.directory;
}
async function fixture(t, findings = []) {
  const root = await owned(t);
  const input = path.join(root, '比較 inputs 日本');
  await mkdir(input);
  const board = {
    schemaVersion: 1, revision: 1, targetOrigin: 'https://example.invalid', runStatus: 'complete',
    failure: null, identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [], actions: [],
    candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
  };
  await writeFile(path.join(input, 'traffic_inventory.json'), '[]');
  await writeFile(path.join(input, 'blackbox_blackboard.json'), JSON.stringify(board));
  if (findings !== undefined)
    await writeFile(path.join(input, 'blackbox_authz_findings.json'), typeof findings === 'string' ? findings : JSON.stringify(findings));
  return { root, input };
}

test('comparison help works from a source-only Unicode directory without dependencies', async t => {
  const root = await owned(t);
  const directory = path.join(root, 'source only 日本');
  await mkdir(directory);
  const file = path.join(directory, 'blackbox-compare.mjs');
  await copyFile(launcher, file);
  for (const flag of ['--help', '-h']) {
    const result = run(file, [flag], { cwd: directory });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Usage: blackbox-compare/);
    assert.match(result.stdout, /pnpm --filter @shannon\/worker build/);
    assert.match(result.stdout, /60 seconds/);
    assert.equal(result.stderr, '');
  }
});

test('comparison parser rejects invalid and duplicate arguments with one fixed diagnostic', () => {
  for (const args of [
    [],
    ['--output', 'PRIVATE_ARGUMENT'],
    ['input', '--raw-dir'],
    ['input', '--output', '-h'],
    ['input', '--unknown', 'PRIVATE_ARGUMENT'],
    ['input', '--help'],
    ['input', '--raw-dir', 'first', '--raw-dir', 'PRIVATE_ARGUMENT'],
    ['input', '--output', 'first', '--output', 'PRIVATE_ARGUMENT'],
  ]) {
    const result = run(launcher, args);
    assert.equal(result.status, 2, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schemaVersion, 1);
    assert.equal(output.kind, 'offline-blackbox-cross-identity-triage');
    assert.equal(output.status, 'failed');
    assert.equal(output.diagnostics.length, 1);
    assert.equal(output.diagnostics[0].code, 'invalid_usage');
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_ARGUMENT/);
  }
});

test('comparison source-only invocation reports a fixed setup failure', async t => {
  const root = await owned(t);
  const file = path.join(root, 'blackbox-compare.mjs');
  await copyFile(launcher, file);
  const result = run(file, ['PRIVATE_INPUT_PATH']);
  assert.equal(result.status, 1);
  const output = JSON.parse(result.stdout);
  assert.equal(output.diagnostics.length, 1);
  assert.equal(output.diagnostics[0].code, 'setup_required');
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_INPUT_PATH|ERR_MODULE|file:\/\//);
  assert.equal(result.stderr, '');
});

test('comparison CLI stdout equals saved JSON and completed processing exits zero', async t => {
  const { root, input } = await fixture(t);
  const output = path.join(root, 'comparison output 日本');
  const result = run(launcher, [input, '--output', output]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const saved = await readFile(path.join(output, 'comparison.json'), 'utf8');
  assert.equal(result.stdout, saved);
  assert.ok(saved.endsWith('\n'));
  assert.ok(!saved.endsWith('\n\n'));
  assert.equal(JSON.parse(saved).status, 'completed');
  assert.match(await readFile(path.join(output, 'comparison.md'), 'utf8'), /Offline black-box cross-identity triage/);
  assert.equal(result.stderr, '');
});

test('comparison CLI uses exit one for partial, failed, and output processing failures', async t => {
  const partial = await fixture(t, '{');
  const partialRun = run(launcher, [partial.input]);
  assert.equal(partialRun.status, 1);
  assert.equal(JSON.parse(partialRun.stdout).status, 'partial');
  assert.equal(partialRun.stderr, '');

  const missing = await owned(t);
  const failedRun = run(launcher, [missing]);
  assert.equal(failedRun.status, 1);
  assert.equal(JSON.parse(failedRun.stdout).status, 'failed');
  assert.equal(failedRun.stderr, '');

  const normal = await fixture(t);
  const existing = path.join(normal.root, 'existing');
  await mkdir(existing);
  await writeFile(path.join(existing, 'PRIVATE_UNCHANGED'), 'unchanged');
  const refused = run(launcher, [normal.input, '--output', existing]);
  assert.equal(refused.status, 1);
  const refusedOutput = JSON.parse(refused.stdout);
  assert.deepEqual(refusedOutput, {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'failed',
    diagnostics: [{ code: 'processing_failed', message: 'Saved comparison processing failed.' }],
  });
  assert.equal(await readFile(path.join(existing, 'PRIVATE_UNCHANGED'), 'utf8'), 'unchanged');
  assert.equal(refused.stderr, '');
});
