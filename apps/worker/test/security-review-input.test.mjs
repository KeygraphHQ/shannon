import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { reviewFile } from '../dist/security-review/index.js';

async function fixture(t) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'security-review-input-'));
  const owner = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    const current = await fs.lstat(root, { bigint: true });
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('security-review-input-'));
    assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev);
    assert.equal(current.isSymbolicLink(), false);
    await fs.rm(resolved, { recursive: true });
  });
  const file = path.join(root, 'config ü 東京.yaml');
  const write = async (text, name = file) => { await fs.writeFile(name, text); return name; };
  return { root, file, write };
}
const codes = result => result.diagnostics.map(item => item.code);

test('file API produces deterministic declared risks and preserves Unicode-path source bytes', async t => {
  const { file, write } = await fixture(t);
  await write('services:\n  app:\n    image: example\n    privileged: true\n');
  const original = await fs.readFile(file);
  const first = await reviewFile('compose', file);
  assert.equal(first.status, 'completed');
  assert.deepEqual(first, await reviewFile('compose', file));
  assert.equal(first.issues[0].ruleId, 'compose/privileged');
  assert.deepEqual(first.issues[0].evidence, { file, pointer: '/services/app/privileged' });
  assert.equal(first.scope.deployedState, 'not-assessed');
  assert.deepEqual(await fs.readFile(file), original);
});

test('YAML duplicates, multiple documents, custom tags and cycles fail without source-value diagnostics', async t => {
  const { file, write } = await fixture(t);
  for (const text of [
    'private-sentinel: x\nprivate-sentinel: y\n',
    'services: {}\n---\nservices: {}\n',
    'services: !!js/function private-sentinel\n',
    'services: &cycle {app: *cycle}\n',
  ]) {
    await write(text);
    const result = await reviewFile('compose', file);
    assert.equal(result.status, 'failed');
    assert.equal(result.issues.length, 0);
    assert.ok(result.diagnostics.length);
    assert.ok(!JSON.stringify(result.diagnostics).includes('private-sentinel'));
  }
});

test('JSON extension enforces JSON syntax and duplicate-key rejection', async t => {
  const { root, write } = await fixture(t);
  const file = path.join(root, 'input.json');
  for (const text of ['{"services":{},}', '{"services":{},"services":{}}', 'services: {}']) {
    await write(text, file);
    assert.equal((await reviewFile('compose', file)).status, 'failed');
  }
});

test('parser rejects YAML merge semantics explicitly and accepts bounded ordinary aliases', async t => {
  const { file, write } = await fixture(t);
  await write('x-base: &base {image: example}\nservices:\n  app:\n    <<: *base\n');
  const merge = await reviewFile('compose', file);
  assert.notEqual(merge.status, 'completed');
  assert.ok(codes(merge).includes('unsupported_yaml_merge'));
  await write('x-base: &base {image: example}\nservices:\n  app: *base\n');
  assert.equal((await reviewFile('compose', file)).status, 'completed');
});

test('byte, depth, node and alias budgets produce explicit failed analysis', async t => {
  const { file, write } = await fixture(t);
  const cases = [
    ['services: {}', { maxBytes: 3 }, 'input_too_large'],
    ['services: {app: {image: example}}', { maxDepth: 1 }, 'depth_limit'],
    ['services: {app: {image: example}}', { maxNodes: 2 }, 'node_limit'],
    ['x-a: &a {image: example}\nservices: {one: *a, two: *a}', { maxReferences: 1 }, 'reference_limit'],
  ];
  for (const [text, limits, code] of cases) {
    await write(text);
    const result = await reviewFile('compose', file, limits);
    assert.equal(result.status, 'failed');
    assert.ok(codes(result).includes(code), JSON.stringify(result));
    assert.ok(result.scope.rules.every(rule => rule.state === 'unknown'));
  }
});

test('invalid UTF-8, absent files, directories and multiply linked files fail safely', async t => {
  const { root, file, write } = await fixture(t);
  await write(Buffer.from([0xc3, 0x28]));
  assert.ok(codes(await reviewFile('compose', file)).includes('invalid_encoding'));
  assert.equal((await reviewFile('compose', path.join(root, 'absent'))).status, 'failed');
  assert.equal((await reviewFile('compose', root)).status, 'failed');
  await write('services: {}');
  const alias = path.join(root, 'hardlink.yaml'); await fs.link(file, alias);
  assert.ok(codes(await reviewFile('compose', file)).includes('unsafe_file'));
});

test('symbolic/junction ancestors and linked files are never followed', async t => {
  const { root, file, write } = await fixture(t); await write('services: {}');
  const real = path.join(root, 'real'); await fs.mkdir(real);
  const link = path.join(root, 'link');
  await fs.symlink(real, link, process.platform === 'win32' ? 'junction' : 'dir');
  const nested = path.join(real, 'config.yaml'); await write('services: {}', nested);
  assert.ok(codes(await reviewFile('compose', path.join(link, 'config.yaml'))).includes('unsafe_directory'));
  if (process.platform !== 'win32') {
    const fileLink = path.join(root, 'file-link'); await fs.symlink(file, fileLink);
    assert.ok(codes(await reviewFile('compose', fileLink)).includes('unsafe_file'));
  }
});

test('processing deadline includes isolated process startup and leaves an explicit failure', async t => {
  const { file, write } = await fixture(t); await write('services: {}');
  const result = await reviewFile('compose', file, { timeoutMs: 1 });
  assert.equal(result.status, 'failed');
  assert.ok(codes(result).includes('processing_timeout'));
});

test('public limit overrides can tighten but cannot remove the goal boundaries', async t => {
  const { file, write } = await fixture(t); await write('services: {}');
  for (const limits of [{ maxBytes: Infinity }, { maxDepth: 65 }, { maxNodes: 0 }, { timeoutMs: 30001 }, { bogus: 1 }])
    assert.ok(codes(await reviewFile('compose', file, limits)).includes('invalid_limits'));
});
