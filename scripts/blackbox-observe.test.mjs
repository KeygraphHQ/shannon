import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createOwnedWorkspace, removeOwnedWorkspace } from './test-reporting-install.mjs';

const launcher = fileURLToPath(new URL('./blackbox-observe.mjs', import.meta.url));
const run = (file, args = [], options = {}) => spawnSync(process.execPath, [file, ...args], {
  encoding: 'utf8', timeout: 15_000, windowsHide: true, ...options,
});
async function owned(t) {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  return owner.directory;
}

test('observation help works in a source-only Unicode directory without dependencies', async t => {
  const root = await owned(t);
  const directory = path.join(root, 'saved view_日本');
  await mkdir(directory);
  const file = path.join(directory, 'blackbox-observe.mjs');
  await copyFile(launcher, file);
  const result = run(file, ['--help'], { cwd: directory });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Usage: blackbox-observe/);
  assert.match(result.stdout, /pnpm --filter @shannon\/worker build/);
  assert.match(result.stdout, /60 seconds/);
  assert.equal(result.stderr, '');
});

test('observation usage rejects unsupported arguments without reflecting private text', () => {
  for (const args of [[], ['--replay', 'PRIVATE_SENTINEL'], ['input', '--output'],
    ['input', '--raw-dir', 'first', '--raw-dir', 'PRIVATE_SENTINEL'],
    ['input', '--help'], ['input', '--fail-on-findings']]) {
    const result = run(launcher, args);
    assert.equal(result.status, 2, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'failed');
    assert.equal(output.diagnostics[0].code, 'invalid_usage');
    assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_SENTINEL/);
  }
});

test('observation source-only invocation has a fixed setup failure', async t => {
  const root = await owned(t);
  const file = path.join(root, 'blackbox-observe.mjs');
  await copyFile(launcher, file);
  const result = run(file, ['PRIVATE_SENTINEL']);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).diagnostics[0].code, 'setup_required');
  assert.doesNotMatch(result.stdout + result.stderr, /PRIVATE_SENTINEL|ERR_MODULE|file:\/\//);
});

test('observation CLI creates deterministic native outputs and never overwrites an existing destination', async t => {
  const root = await owned(t);
  const input = path.join(root, '入力 records');
  const output = path.join(root, '観測 report');
  await mkdir(input);
  const board = { schemaVersion: 1, revision: 1, targetOrigin: 'https://example.invalid',
    runStatus: 'incomplete', failure: null, identities: [], exchanges: [], resources: [],
    transitions: [], hypotheses: [], actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [] };
  await writeFile(path.join(input, 'traffic_inventory.json'), '[]');
  await writeFile(path.join(input, 'blackbox_blackboard.json'), JSON.stringify(board));
  await writeFile(path.join(input, 'blackbox_authz_findings.json'), '[]');
  const result = run(launcher, [input, '--output', output]);
  assert.equal(result.status, 0, result.stderr + result.stdout);
  const saved = await readFile(path.join(output, 'observation.json'), 'utf8');
  assert.equal(result.stdout, saved);
  assert.equal(JSON.parse(saved).status, 'completed');
  assert.match(await readFile(path.join(output, 'observation.md'), 'utf8'), /recorded|Recorded/);
  const again = run(launcher, [input]);
  assert.equal(again.stdout, result.stdout);
  const refused = run(launcher, [input, '--output', output]);
  assert.equal(refused.status, 1);
  assert.equal(await readFile(path.join(output, 'observation.json'), 'utf8'), saved);
  assert.equal(await readFile(path.join(input, 'traffic_inventory.json'), 'utf8'), '[]');
});

test('observation CLI reports missing required input as failed processing', async t => {
  const input = await owned(t);
  const result = run(launcher, [input]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).status, 'failed');
  assert.equal(result.stderr, '');
});
