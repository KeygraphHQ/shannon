import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, link, lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createOwnedWorkspace, removeOwnedWorkspace } from '../../../scripts/test-reporting-install.mjs';
import { observeDirectory } from '../dist/blackbox-observation/index.js';

async function fixture(t, changes = {}) {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, '記録 inputs');
  await mkdir(input);
  const files = { 'traffic_inventory.json': [], 'blackbox_blackboard.json': {
    schemaVersion: 1, revision: 1, targetOrigin: 'https://example.invalid', runStatus: 'incomplete',
    failure: null, identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [],
    actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
  }, 'blackbox_authz_findings.json': [], ...changes };
  for (const [name, value] of Object.entries(files)) {
    if (value !== undefined) await writeFile(path.join(input, name), typeof value === 'string' ? value : JSON.stringify(value));
  }
  return { root: owner.directory, input };
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

test('file API deterministically analyzes native JSON and records same-read input hashes', async t => {
  const { input } = await fixture(t);
  const before = new Map(await Promise.all((await readdir(input)).map(async name => [name, await readFile(path.join(input, name))])));
  const first = await observeDirectory(input);
  const second = await observeDirectory(input);
  assert.equal(first.result.status, 'completed');
  assert.deepEqual(first, second);
  assert.deepEqual(JSON.parse(first.json), first.result);
  for (const source of first.result.sources) {
    assert.equal(source.sha256, hash(before.get(source.file)));
    assert.equal(source.bytes, before.get(source.file).length);
    assert.deepEqual(await readFile(path.join(input, source.file)), before.get(source.file));
  }
});

test('optional findings absence is supported; malformed requested JSON remains explicit', async t => {
  const missing = await fixture(t, { 'blackbox_authz_findings.json': undefined });
  const absent = await observeDirectory(missing.input);
  assert.equal(absent.result.status, 'completed');
  assert.equal(absent.result.recorded.findings.count, null);
  for (const invalid of ['{', '{"duplicate":1,"duplicate":2}', '[]\nPRIVATE_SENTINEL']) {
    const broken = await fixture(t, { 'blackbox_authz_findings.json': invalid });
    const result = await observeDirectory(broken.input);
    assert.equal(result.result.status, 'partial');
    assert.equal(result.result.recorded.findings.count, null);
    assert.doesNotMatch(result.json + result.markdown, /PRIVATE_SENTINEL|"duplicate":/);
  }
});

test('required input absence and linked or non-regular paths cannot pass', async t => {
  const missing = await fixture(t, { 'traffic_inventory.json': undefined });
  assert.equal((await observeDirectory(missing.input)).result.status, 'failed');
  const original = await fixture(t);
  const alias = path.join(original.root, 'linked');
  await symlink(original.input, alias, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await observeDirectory(alias)).result.status, 'failed');
  await link(path.join(original.input, 'traffic_inventory.json'), path.join(original.root, 'hardlinked.json'));
  assert.equal((await observeDirectory(original.input)).result.status, 'failed');
  const directory = await fixture(t, { 'traffic_inventory.json': undefined });
  await mkdir(path.join(directory.input, 'traffic_inventory.json'));
  assert.equal((await observeDirectory(directory.input)).result.status, 'failed');
});

test('explicit raw directory must exist and be real even when no exchanges are selected', async t => {
  const { input, root } = await fixture(t);
  assert.equal((await observeDirectory(input, { rawDirectory: path.join(root, 'missing') })).result.status, 'failed');
  await symlink(input, path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal((await observeDirectory(input, { rawDirectory: path.join(root, 'alias') })).result.status, 'failed');
});

test('input bytes, nodes, nesting and output limits cannot be raised or silently truncated', async t => {
  const { input } = await fixture(t);
  for (const limits of [{ maxNativeBytes: 8 }, { maxTotalBytes: 8 }, { maxNodes: 2 }, { maxDepth: 1 }]) {
    assert.equal((await observeDirectory(input, { limits })).result.status, 'failed');
  }
  await assert.rejects(observeDirectory(input, { limits: { maxOutputBytes: 8 } }), /Observation output exceeds/);
  await assert.rejects(observeDirectory(input, { limits: { timeoutMs: 60_001 } }), /Invalid observation limits/);
});

test('deadline and pre-abort reap the fixed worker and leave sources and output untouched', async t => {
  const { input, root } = await fixture(t);
  const outputDirectory = path.join(root, 'not-created');
  const before = await readFile(path.join(input, 'blackbox_blackboard.json'));
  const controller = new AbortController();
  controller.abort();
  const started = Date.now();
  for (const options of [{ signal: controller.signal }, { limits: { timeoutMs: 1 } }]) {
    const result = await observeDirectory(input, { ...options, outputDirectory });
    assert.equal(result.result.status, 'failed');
    assert.ok(result.result.diagnostics.some(value => value.code === 'processing-timeout'));
  }
  assert.ok(Date.now() - started < 5_000);
  assert.deepEqual(await readFile(path.join(input, 'blackbox_blackboard.json')), before);
  await assert.rejects(lstat(outputDirectory), { code: 'ENOENT' });
});

test('outputs are exclusive, bounded and outside both explicit input roots', async t => {
  const { input, root } = await fixture(t);
  const raw = path.join(root, 'raw');
  await mkdir(raw);
  for (const outputDirectory of [input, path.join(input, 'new'), raw, path.join(raw, 'new'), path.join(root, 'absent-parent', 'new')]) {
    const result = await observeDirectory(input, { rawDirectory: raw, outputDirectory });
    assert.equal(result.result.status, 'failed');
  }
  assert.deepEqual((await readdir(input)).sort(), ['blackbox_authz_findings.json', 'blackbox_blackboard.json', 'traffic_inventory.json']);
  assert.deepEqual(await readdir(raw), []);
  const outputDirectory = path.join(root, '観測 output');
  const result = await observeDirectory(input, { outputDirectory });
  assert.equal(result.result.status, 'completed');
  assert.equal(await readFile(path.join(outputDirectory, 'observation.json'), 'utf8'), result.json);
  assert.equal(await readFile(path.join(outputDirectory, 'observation.md'), 'utf8'), result.markdown);
  assert.equal((await observeDirectory(input, { outputDirectory })).result.status, 'failed');
  assert.equal(await readFile(path.join(outputDirectory, 'observation.json'), 'utf8'), result.json);
});

test('raw loader reads only selected native IDs with bounded same-read hashes', async t => {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, 'raw fixture');
  await cp(new URL('./fixtures/blackbox-observation/sets/raw-quality/', import.meta.url), input,
    { recursive: true, force: false, errorOnExist: true });
  const rawDirectory = path.join(input, 'raw');
  // Deliberately irrelevant invalid data must never be discovered or parsed.
  await writeFile(path.join(rawDirectory, 'unassociated.json'), 'PRIVATE_SENTINEL invalid JSON');
  const result = await observeDirectory(input, { rawDirectory });
  assert.equal(result.result.status, 'completed');
  const rawSources = result.result.sources.filter(source => source.source === 'raw');
  assert.equal(rawSources.length, 4);
  for (const source of rawSources) {
    assert.match(source.file, /^ex_[a-f0-9]{24}\.json$/);
    const bytes = await readFile(path.join(rawDirectory, source.file));
    assert.equal(source.sha256, hash(bytes));
    assert.equal(source.bytes, bytes.length);
  }
  assert.doesNotMatch(result.json + result.markdown, /PRIVATE_SENTINEL|unassociated/);
  for (const limits of [{ maxRawFiles: 1 }, { maxRawBytes: 1 }]) {
    assert.equal((await observeDirectory(input, { rawDirectory, limits })).result.status, 'failed');
  }
  await link(path.join(rawDirectory, rawSources[0].file), path.join(owner.directory, 'linked-raw.json'));
  assert.equal((await observeDirectory(input, { rawDirectory })).result.status, 'partial');
});

test('file worker cannot inherit caller Node preload settings', async t => {
  const { input } = await fixture(t);
  const previous = process.env.NODE_OPTIONS;
  process.env.NODE_OPTIONS = '--require=PRIVATE_SENTINEL_missing_preload';
  try {
    const result = await observeDirectory(input);
    assert.equal(result.result.status, 'completed');
    assert.doesNotMatch(result.json + result.markdown, /PRIVATE_SENTINEL/);
  } finally {
    if (previous === undefined) delete process.env.NODE_OPTIONS;
    else process.env.NODE_OPTIONS = previous;
  }
});
