// Executes the documented local CI demonstration against retained benign inputs.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const launcher = fileURLToPath(new URL('./review.mjs', import.meta.url));
const fixtures = fileURLToPath(new URL('../apps/worker/test/fixtures/repository-review/projects/', import.meta.url));
async function command(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], { shell: false, windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', chunk => { out += chunk; }); child.stderr.on('data', chunk => { err += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 130_000);
    child.once('error', reject); child.once('close', exitCode => {
      clearTimeout(timer);
      try { assert.equal(err, ''); resolve({ exitCode, result: JSON.parse(out) }); } catch { reject(new Error('Local CI command did not return structured output.')); }
    });
  });
}
const parent = await fs.realpath(tmpdir());
const directory = await fs.mkdtemp(path.join(parent, 'repository-review-ci-'));
const owner = await fs.lstat(directory, { bigint: true });
try {
  for (const [name, expected] of [['clean', 0], ['privileged', 0], ['known', 0], ['partial', 1]]) {
    const outcome = await command(['repo', path.join(fixtures, name), '--output', path.join(directory, `${name}.json`)]);
    assert.equal(outcome.exitCode, expected);
  }
  const cases = [];
  for (const [name, baseline, candidate, expected, counts] of [
    ['unchanged', 'privileged', 'privileged', 0, { new: 0, unchanged: 1, removed: 0, unknown: 0 }],
    ['introduced', 'clean', 'privileged', 3, { new: 1, unchanged: 0, removed: 0, unknown: 0 }],
    ['incomplete', 'known', 'partial', 1, { new: 0, unchanged: 1, removed: 0, unknown: 1 }],
  ]) {
    const outcome = await command(['compare', path.join(directory, `${baseline}.json`), path.join(directory, `${candidate}.json`), '--fail-on-new-findings']);
    assert.equal(outcome.exitCode, expected); assert.deepEqual(outcome.result.counts, counts);
    cases.push({ name, exitCode: outcome.exitCode, status: outcome.result.status, counts });
  }
  console.log(JSON.stringify({ schemaVersion: 1, kind: 'repository-review-ci-example', status: 'passed', cases }));
} finally {
  const resolved = await fs.realpath(directory); const current = await fs.lstat(directory, { bigint: true });
  assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('repository-review-ci-'));
  assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev); assert.ok(!current.isSymbolicLink());
  await fs.rm(resolved, { recursive: true });
}
