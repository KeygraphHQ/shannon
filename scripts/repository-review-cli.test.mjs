import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
const launcher = fileURLToPath(new URL('./review.mjs', import.meta.url));
async function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [launcher, ...args], { shell: false, windowsHide: true });
    let out = ''; let err = '';
    child.stdout.on('data', data => { out += data; }); child.stderr.on('data', data => { err += data; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 40_000);
    child.once('error', reject); child.once('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
async function fixture(t) {
  const parent = await fs.realpath(tmpdir());
  const directory = await fs.mkdtemp(path.join(parent, 'repository-cli-'));
  const owner = await fs.lstat(directory, { bigint: true });
  t.after(async () => {
    const resolved = await fs.realpath(directory); const current = await fs.lstat(directory, { bigint: true });
    assert.equal(path.dirname(resolved), parent); assert.ok(path.basename(resolved).startsWith('repository-cli-'));
    assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev); assert.ok(!current.isSymbolicLink());
    await fs.rm(resolved, { recursive: true });
  });
  return directory;
}

test('repository CLI stores portable Unicode snapshots exclusively and gates supported changes', async t => {
  const directory = await fixture(t); const project = path.join(directory, 'project ü 東京');
  await fs.mkdir(project); await fs.mkdir(path.join(project, 'output'));
  const source = path.join(project, 'custom ü.yaml');
  const beforeBytes = 'services:\n  app:\n    privileged: false\n';
  await fs.writeFile(source, beforeBytes);
  const baseline = path.join(project, 'output', 'baseline.json');
  const candidate = path.join(project, 'output', 'candidate.json');
  const args = ['repo', project, '--include', 'compose:custom ü.yaml'];
  const initial = await run([...args, '--output', baseline]);
  assert.equal(initial.code, 0, initial.out); assert.equal(initial.err, '');
  assert.equal(JSON.parse(initial.out).files[0].path, 'custom ü.yaml');
  assert.ok(!initial.out.includes(project));
  const saved = await fs.readFile(baseline, 'utf8'); assert.deepEqual(JSON.parse(saved), JSON.parse(initial.out));
  const repeat = await run([...args, '--output', baseline]); assert.equal(repeat.code, 1);
  assert.equal(await fs.readFile(baseline, 'utf8'), saved); assert.equal(await fs.readFile(source, 'utf8'), beforeBytes);
  assert.equal((await run([...args, '--output', path.join(project, 'openapi.json')])).code, 1);
  assert.equal(await fs.stat(path.join(project, 'openapi.json')).catch(() => null), null);
  await fs.writeFile(source, 'services:\n  app:\n    privileged: true\n');
  assert.equal((await run([...args, '--output', candidate])).code, 0);
  const added = await run(['compare', baseline, candidate, '--fail-on-new-findings']);
  assert.equal(added.code, 3, added.out); assert.equal(JSON.parse(added.out).counts.new, 1);
  assert.equal((await run(['compare', baseline, candidate])).code, 0);
  const same = await run(['compare', candidate, candidate, '--fail-on-new-findings']);
  assert.equal(same.code, 0); assert.equal(JSON.parse(same.out).counts.unchanged, 1);
  await fs.writeFile(source, 'services:\n  app:\n    network_mode: "${NETWORK}"\n');
  const partial = path.join(project, 'output', 'partial.json');
  assert.equal((await run([...args, '--output', partial])).code, 1);
  const uncertain = await run(['compare', candidate, partial, '--fail-on-new-findings']);
  assert.equal(uncertain.code, 1); assert.equal(JSON.parse(uncertain.out).status, 'partial');
});
test('snapshot loading rejects missing, oversized, linked and duplicate-key input with fixed failures', async t => {
  const directory = await fixture(t); const input = path.join(directory, 'snapshot.json');
  assert.equal((await run(['compare', input, input])).code, 1);
  await fs.writeFile(input, '{"private-sentinel":1,"private-sentinel":2}');
  const malformed = await run(['compare', input, input]);
  assert.equal(malformed.code, 1); assert.ok(!malformed.out.includes('private-sentinel')); assert.equal(malformed.err, '');
  await fs.writeFile(input, ' '.repeat(16 * 1024 * 1024 + 1));
  assert.equal((await run(['compare', input, input])).code, 1);
  const linked = path.join(directory, 'linked.json'); await fs.link(input, linked);
  assert.equal((await run(['compare', linked, linked])).code, 1);
});
test('repository output refuses a linked parent and argument failures remain usage errors', async t => {
  const directory = await fixture(t); const project = path.join(directory, 'project'); const target = path.join(directory, 'target');
  await fs.mkdir(project); await fs.mkdir(target);
  const link = path.join(directory, 'link'); await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir');
  const rejected = await run(['repo', project, '--output', path.join(link, 'snapshot.json')]); assert.equal(rejected.code, 1);
  assert.deepEqual(await fs.readdir(target), []);
  for (const args of [['repo'], ['repo', project, '--include'], ['repo', project, '--include', 'compose:../outside.yml'], ['repo', project, '--exclude', '../outside'], ['repo', project, '--other'], ['compare', 'one'], ['compare', 'one', 'two', '--fail-on-findings']]) {
    assert.equal((await run(args)).code, 2);
  }
});
