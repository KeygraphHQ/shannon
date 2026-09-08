import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const { reviewRepository, CONVENTIONAL_NAMES, EXCLUDED_DIRECTORIES, REPOSITORY_LIMITS } = await import(
  process.env.SECURITY_REVIEW_REPOSITORY_MODULE ?? '../dist/security-review/repository.js'
);
const compose = JSON.stringify({ services: { app: { image: 'example', privileged: true } } });
const openapi = JSON.stringify({ openapi: '3.0.3', info: { title: 'Example', version: '1' }, paths: {} });

async function fixture(t, entries = {}) {
  const parent = await fs.realpath(os.tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'security-review-repository-'));
  const identity = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    const resolved = path.resolve(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('security-review-repository-'));
    const current = await fs.lstat(resolved, { bigint: true });
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(current.dev, identity.dev);
    assert.equal(current.ino, identity.ino);
    await fs.rm(resolved, { recursive: true });
  });
  for (const [relative, content] of Object.entries(entries)) {
    const file = path.join(root, ...relative.split('/'));
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, content);
  }
  return root;
}

test('mixed recursive discovery returns portable fingerprints, evidence and deliberate exclusions', async (t) => {
  const entries = {
    'compose.yaml': compose,
    'specs/日本 語/openapi.json': openapi,
    'README.md': 'ordinary unrelated data',
    'custom.yaml': compose,
    'node_modules/compose.yaml': compose,
    'output/openapi.json': openapi,
  };
  const root = await fixture(t, entries);
  const result = await reviewRepository(root);
  assert.equal(result.status, 'completed');
  assert.equal(result.discovery.state, 'complete');
  assert.deepEqual(result.files.map(({ path: name, format }) => [name, format]), [
    ['compose.yaml', 'compose'], ['specs/日本 語/openapi.json', 'openapi'],
  ]);
  assert.equal(result.discovery.ignoredFiles, 2);
  assert.deepEqual(result.discovery.skipped, [
    { path: 'node_modules', reason: 'excluded-directory' },
    { path: 'output', reason: 'excluded-directory' },
  ]);
  assert.deepEqual(result.policy.conventionalNames, CONVENTIONAL_NAMES);
  assert.deepEqual(result.policy.excludedDirectories, EXCLUDED_DIRECTORIES);
  assert.deepEqual(result.limits, REPOSITORY_LIMITS);
  for (const file of result.files) {
    assert.equal(file.sha256, createHash('sha256').update(entries[file.path]).digest('hex'));
    assert.equal(file.bytes, Buffer.byteLength(entries[file.path]));
    assert.equal(file.result.source.file, file.path);
    assert.ok(file.result.issues.every(({ evidence }) => evidence.file === file.path));
    assert.ok(file.observations.every(({ issue }) => issue.evidence.file === file.path));
  }
  assert.equal(result.files[0].observations.length, 1);
  assert.equal(JSON.stringify(result).includes(root), false);
  for (const [name, content] of Object.entries(entries)) assert.equal(await fs.readFile(path.join(root, name), 'utf8'), content);
});

test('snapshots are deterministic across repeat reads and different checkout roots', async (t) => {
  const entries = { 'z/compose.yml': compose, 'a/openapi.json': openapi };
  const first = await fixture(t, entries);
  const second = await fixture(t, entries);
  const result = await reviewRepository(first);
  assert.deepEqual(await reviewRepository(first), result);
  assert.deepEqual(await reviewRepository(second), result);
});

test('explicit files are additive and exclusions take precedence with exact path segments', async (t) => {
  const root = await fixture(t, {
    'compose.yaml': compose, 'defs/service.settings': compose, 'defs/api.settings': openapi,
    'generated/compose.yml': compose, 'generated-copy/compose.yml': compose,
    'node_modules/manual.settings': compose,
  });
  const result = await reviewRepository(root, {
    include: [
      { format: 'openapi', path: 'defs/api.settings' },
      { format: 'compose', path: 'defs/service.settings' },
      { format: 'compose', path: 'defs/service.settings' },
      { format: 'compose', path: 'node_modules/manual.settings' },
    ],
    exclude: ['generated', 'generated'],
  });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.files.map(({ path: name }) => name), [
    'compose.yaml', 'defs/api.settings', 'defs/service.settings', 'generated-copy/compose.yml',
  ]);
  assert.equal(result.policy.includes.length, 3);
  assert.deepEqual(result.policy.excludes, ['generated']);
  assert.ok(result.discovery.skipped.some(({ path: name, reason }) => name === 'generated' && reason === 'excluded-path'));
});

test('a complete empty inventory is valid and explicit missing selections remain incomplete', async (t) => {
  const root = await fixture(t, { 'README.md': 'empty supported inventory' });
  const empty = await reviewRepository(root);
  assert.equal(empty.status, 'completed');
  assert.equal(empty.discovery.state, 'complete');
  assert.deepEqual(empty.files, []);
  const selected = await reviewRepository(root, { include: [{ format: 'compose', path: 'missing.conf' }] });
  assert.equal(selected.status, 'partial');
  assert.equal(selected.discovery.state, 'incomplete');
  assert.ok(selected.diagnostics.some(({ path: name, code }) => name === 'missing.conf' && code === 'repository/selection-missing'));
});

test('invalid selectors and widening limits fail with fixed private prose', async (t) => {
  const root = await fixture(t);
  for (const unsafe of ['../secret', '/absolute', 'a\\b', 'a//b', 'a/./b', 'a:b', 'NUL.yml', 'a.', 'a/../b', 'a\u0001b']) {
    await assert.rejects(reviewRepository(root, { include: [{ format: 'compose', path: unsafe }] }), { message: 'Invalid repository options.' });
    await assert.rejects(reviewRepository(root, { exclude: [unsafe] }), { message: 'Invalid repository options.' });
  }
  for (const limits of [{ maxFiles: 129 }, { concurrency: 3 }, { maxBytes: 0 }, { timeoutMs: -1 }, { maxDepth: 1.5 }, { unknown: 1 }]) {
    await assert.rejects(reviewRepository(root, { limits }), { message: 'Invalid repository options.' });
  }
  await assert.rejects(reviewRepository(root, { include: [{ path: 'a', format: 'compose' }, { path: 'a', format: 'openapi' }] }), { message: 'Invalid repository options.' });
});

test('missing and non-directory roots fail without exposing absolute roots in prose', async (t) => {
  const root = await fixture(t, { 'plain.txt': 'file' });
  for (const input of [path.join(root, 'does-not-exist'), path.join(root, 'plain.txt')]) {
    const result = await reviewRepository(input);
    assert.equal(result.status, 'failed');
    assert.equal(result.discovery.state, 'incomplete');
    assert.deepEqual(result.files, []);
    assert.ok(result.diagnostics.length > 0);
    assert.equal(JSON.stringify(result).includes(root), false);
  }
});

test('Windows network and alternate-stream roots are rejected before discovery reads', { skip: process.platform !== 'win32' }, async (t) => {
  let reads = 0;
  const inspect = t.mock.method(fs, 'lstat', async () => { reads++; throw new Error('unexpected-discovery-read'); });
  for (const root of ['\\\\server\\share', '//server/share', 'C:\\local:stream']) {
    const result = await reviewRepository(root);
    assert.equal(result.status, 'failed');
    assert.deepEqual(result.files, []);
  }
  assert.equal(reads, 0);
  inspect.mock.restore();
});

test('malformed selected files remain inventoried failures while other files complete', async (t) => {
  const root = await fixture(t, { 'compose.yaml': '{', 'api/openapi.json': openapi });
  const result = await reviewRepository(root);
  assert.equal(result.status, 'partial');
  assert.equal(result.discovery.state, 'complete');
  assert.equal(result.files.length, 2);
  assert.equal(result.files.find(({ path: name }) => name === 'compose.yaml').result.status, 'failed');
  assert.equal(result.files.find(({ path: name }) => name === 'api/openapi.json').result.status, 'completed');
});

test('aggregate file, byte, entry and depth exhaustion are explicit incomplete inventories', async (t) => {
  const root = await fixture(t, { 'compose.yml': compose, 'openapi.json': openapi, 'a/b/compose.yml': compose, 'other.txt': 'ordinary' });
  for (const [limits, reason] of [
    [{ maxFiles: 1 }, 'file-limit'], [{ maxBytes: 1 }, 'byte-limit'],
    [{ maxEntries: 1 }, 'entry-limit'], [{ maxDepth: 1 }, 'depth-limit'],
  ]) {
    const result = await reviewRepository(root, { limits });
    assert.equal(result.status, 'partial');
    assert.equal(result.discovery.state, 'incomplete');
    assert.ok(result.discovery.skipped.some((entry) => entry.reason === reason), reason);
    assert.ok(result.files.length <= result.limits.maxFiles);
    assert.ok(result.discovery.entriesVisited <= result.limits.maxEntries);
    assert.ok(result.discovery.selectedBytes <= result.limits.maxBytes);
  }
});

test('entry-limited inventories do not depend on filesystem enumeration order', async (t) => {
  const root = await fixture(t, { 'compose.yaml': compose, 'openapi.json': openapi });
  const original = fs.opendir;
  let order = ['compose.yaml', 'openapi.json'];
  const opened = t.mock.method(fs, 'opendir', async (name, options) => {
    if (name !== root) return original(name, options);
    const remaining = [...order];
    return { async read() { const value = remaining.shift(); return value === undefined ? null : { name: value }; }, async close() {} };
  });
  try {
    const first = await reviewRepository(root, { limits: { maxEntries: 1 } });
    order.reverse();
    const second = await reviewRepository(root, { limits: { maxEntries: 1 } });
    assert.equal(first.status, 'partial');
    assert.deepEqual(first, second);
  } finally { opened.mock.restore(); }
});

test('directory junctions and hard-linked candidates are never followed', async (t) => {
  const outside = await fixture(t, { 'compose.yaml': compose });
  const root = await fixture(t, { 'original.txt': compose });
  await fs.symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.link(path.join(root, 'original.txt'), path.join(root, 'compose.yaml'));
  const result = await reviewRepository(root);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.files, []);
  assert.deepEqual(result.discovery.skipped.filter(({ reason }) => reason === 'linked-path').map(({ path: name }) => name), ['compose.yaml', 'linked']);
});

test('unreadable discovery and stalled filesystem work return fixed incomplete diagnostics', async (t) => {
  const root = await fixture(t);
  const original = fs.opendir;
  const denial = t.mock.method(fs, 'opendir', async (name, options) => {
    if (name === root) throw new Error('private-sentinel-permission');
    return original(name, options);
  });
  const unreadable = await reviewRepository(root);
  assert.equal(unreadable.status, 'partial');
  assert.equal(unreadable.discovery.state, 'incomplete');
  assert.equal(JSON.stringify(unreadable).includes('private-sentinel'), false);
  denial.mock.restore();
  let calls = 0;
  const stalled = t.mock.method(fs, 'opendir', (name, options) => {
    if (name === root) { calls++; return new Promise(() => {}); }
    return original(name, options);
  });
  const start = Date.now();
  await assert.rejects(reviewRepository(root, { limits: { timeoutMs: 300 } }), { message: 'Repository processing deadline exceeded.' });
  assert.ok(Date.now() - start < 2500);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, 1);
  stalled.mock.restore();
});

test('snapshot byte caps fail explicitly instead of silently dropping inventory', async (t) => {
  const root = await fixture(t, { 'compose.yml': compose });
  await assert.rejects(reviewRepository(root, { limits: { maxSnapshotBytes: 1 } }), { message: 'Repository snapshot size limit exceeded.' });
});

test('the file pool respects its concurrency ceiling and a tightened sequential override', async (t) => {
  const root = await fixture(t, Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`dir-${index}/compose.yaml`, compose])));
  const original = childProcess.spawn;
  let active = 0;
  let maximum = 0;
  let launched = 0;
  const spawned = t.mock.method(childProcess, 'spawn', (...args) => {
    const child = original(...args);
    active++;
    launched++;
    maximum = Math.max(maximum, active);
    child.once('close', () => active--);
    return child;
  });
  syncBuiltinESMExports();
  try {
    assert.equal((await reviewRepository(root)).status, 'completed');
    assert.equal(launched, 5);
    assert.equal(maximum, 2);
    assert.equal(active, 0);
    maximum = 0;
    launched = 0;
    assert.equal((await reviewRepository(root, { limits: { concurrency: 1 } })).status, 'completed');
    assert.equal(launched, 5);
    assert.equal(maximum, 1);
    assert.equal(active, 0);
  } finally {
    spawned.mock.restore();
    syncBuiltinESMExports();
  }
});

test('the repository deadline kills active file children without starting queued work', async (t) => {
  const root = await fixture(t, Object.fromEntries(Array.from({ length: 5 }, (_, index) => [`dir-${index}/compose.yaml`, compose])));
  let launched = 0;
  let killed = 0;
  let reads = 0;
  const original = fs.lstat;
  const inspected = t.mock.method(fs, 'lstat', (...args) => { reads++; return original(...args); });
  const spawned = t.mock.method(childProcess, 'spawn', () => {
    launched++;
    const child = new EventEmitter();
    child.send = (_job, callback) => callback(null);
    child.kill = (signal) => {
      assert.equal(signal, 'SIGKILL');
      killed++;
      queueMicrotask(() => child.emit('close', null));
      return true;
    };
    return child;
  });
  syncBuiltinESMExports();
  try {
    await assert.rejects(reviewRepository(root, { limits: { timeoutMs: 300 } }), { message: 'Repository processing deadline exceeded.' });
    const observedReads = reads;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(launched, 2);
    assert.equal(killed, 2);
    assert.equal(reads, observedReads);
  } finally {
    spawned.mock.restore();
    inspected.mock.restore();
    syncBuiltinESMExports();
  }
});
