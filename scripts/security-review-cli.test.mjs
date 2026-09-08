import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const launcher = fileURLToPath(new URL('./review.mjs', import.meta.url));
async function fixture(t) {
  const parent = await fs.realpath(tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'security-review-cli-'));
  const owner = await fs.lstat(directory, { bigint: true });
  t.after(async () => {
    const current = await fs.lstat(directory, { bigint: true });
    const resolved = await fs.realpath(directory);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('security-review-cli-'));
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev);
    await fs.rm(resolved, { recursive: true });
  });
  return directory;
}
async function run(args, entry = launcher, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...args], { cwd, shell: false, windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', value => { out += value; });
    child.stderr.on('data', value => { err += value; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 35_000);
    child.once('error', reject);
    child.once('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

test('source-only launcher help and build instructions work without dependencies or dist', async t => {
  const directory = await fixture(t);
  const entry = path.join(directory, 'review.mjs'); await fs.copyFile(launcher, entry);
  const help = await run(['--help'], entry);
  assert.equal(help.code, 0); assert.match(help.out, /pnpm --silent review/);
  assert.match(help.out, /frozen-lockfile/); assert.equal(help.err, '');
  const missing = await run(['compose', 'input.yaml'], entry);
  assert.equal(missing.code, 1); assert.equal(JSON.parse(missing.out).diagnostics[0].code, 'build_required');
  assert.equal(missing.err, '');
});
test('invalid CLI arguments have a distinct usage exit code and fixed diagnostic', async () => {
  for (const args of [[], ['unknown', 'file'], ['compose'], ['compose', 'file', '--other'], ['compose', 'file', '--fail-on-findings', 'extra']]) {
    const result = await run(args);
    assert.equal(result.code, 2); assert.equal(JSON.parse(result.out).diagnostics[0].code, 'usage'); assert.equal(result.err, '');
  }
});
test('CLI preserves Unicode paths, source bytes and deterministic private evidence; findings gate is opt-in', async t => {
  const directory = await fixture(t);
  const file = path.join(directory, 'configuration ü 東京.yaml');
  await fs.writeFile(file, 'services:\n  app:\n    image: private-value-sentinel\n    privileged: true\n');
  const before = await fs.readFile(file);
  const first = await run(['compose', file], launcher, directory);
  const again = await run(['compose', file], launcher, directory);
  assert.equal(first.code, 0); assert.equal(first.err, ''); assert.equal(first.out, again.out);
  const result = JSON.parse(first.out);
  assert.equal(result.status, 'completed'); assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0].evidence, { file, pointer: '/services/app/privileged' });
  assert.ok(!first.out.includes('private-value-sentinel'));
  assert.equal((await run(['compose', file, '--fail-on-findings'])).code, 3);
  assert.deepEqual(await fs.readFile(file), before);
});
test('partial findings and parse failures exit incomplete even with the findings gate', async t => {
  const directory = await fixture(t); const file = path.join(directory, 'input.yaml');
  await fs.writeFile(file, 'services:\n  app:\n    privileged: true\n    network_mode: "${NETWORK}"\n');
  const partial = await run(['compose', file, '--fail-on-findings']);
  assert.equal(partial.code, 1); assert.equal(JSON.parse(partial.out).status, 'partial');
  assert.equal(JSON.parse(partial.out).issues.length, 1);
  await fs.writeFile(file, 'private-sentinel: [');
  const failed = await run(['compose', file]);
  assert.equal(failed.code, 1); assert.equal(JSON.parse(failed.out).status, 'failed');
  assert.ok(!failed.out.includes('private-sentinel')); assert.equal(failed.err, '');
});
test('OpenAPI local contract review needs no target or model credentials', async t => {
  const directory = await fixture(t); const file = path.join(directory, 'api.json');
  await fs.writeFile(file, JSON.stringify({ openapi: '3.1.1', info: { title: 'Example', version: '1' }, paths: {}, security: [{ Absent: [] }] }));
  const response = await run(['openapi', file]);
  assert.equal(response.code, 0);
  assert.equal(JSON.parse(response.out).issues[0].ruleId, 'openapi/undeclared-security-scheme');
});
