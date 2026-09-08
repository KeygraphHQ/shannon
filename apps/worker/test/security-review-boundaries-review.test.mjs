import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';

import { reviewFile } from '../dist/security-review/index.js';

async function fixture(t, text) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'security-review-boundaries-'));
  const owner = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    const current = await fs.lstat(root, { bigint: true });
    const resolved = await fs.realpath(root);
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('security-review-boundaries-'));
    assert.equal(current.isSymbolicLink(), false);
    assert.equal(current.ino, owner.ino); assert.equal(current.dev, owner.dev);
    await fs.rm(resolved, { recursive: true });
  });
  const file = path.join(root, 'synthetic.yaml');
  await fs.writeFile(file, text);
  return file;
}

test('independent boundary review: non-string YAML keys cannot silently become service names', async t => {
  const text = 'services:\n  ? [app]\n  : {image: synthetic:fixture, privileged: true}\n';
  const file = await fixture(t, text);
  const result = await reviewFile('compose', file);
  assert.equal(result.status, 'failed', 'A sequence mapping key was coerced into a normal service key');
  assert.equal(result.issues.length, 0);
  assert.ok(result.diagnostics.some((item) => item.code === 'invalid_document'));
  assert.equal(await fs.readFile(file, 'utf8'), text);
});

test('independent boundary review: scalar aliases consume the reference budget', async t => {
  const text = 'x-flag: &flag false\nservices:\n  one: {image: synthetic:fixture, privileged: *flag}\n  two: {image: synthetic:fixture, privileged: *flag}\n';
  const file = await fixture(t, text);
  const result = await reviewFile('compose', file, { maxReferences: 1 });
  assert.equal(result.status, 'failed', 'Two scalar alias expansions bypassed a reference budget of one');
  assert.equal(result.issues.length, 0);
  assert.ok(result.diagnostics.some((item) => item.code === 'reference_limit'));
  assert.equal(await fs.readFile(file, 'utf8'), text);
});

test('independent boundary review: one bounded scalar alias remains usable', async t => {
  const file = await fixture(t, 'x-flag: &flag false\nservices:\n  one: {image: synthetic:fixture, privileged: *flag}\n');
  const result = await reviewFile('compose', file, { maxReferences: 1 });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.diagnostics, []);
});

test('independent boundary review: aliases and local references share the per-input expansion ceiling', async t => {
  const file = await fixture(t, `openapi: 3.1.1
info: {title: Synthetic contract, version: 1.0.0}
paths: {}
x-key: &key {type: apiKey, in: header, name: X-Synthetic-Key}
components:
  securitySchemes:
    Key: *key
    Referenced: {$ref: '#/components/securitySchemes/Key'}
security:
  - Referenced: []
`);
  const result = await reviewFile('openapi', file, { maxReferences: 1 });
  assert.notEqual(result.status, 'completed', 'One alias plus one local reference bypassed a per-input expansion ceiling of one');
  assert.ok(result.diagnostics.length > 0);
});

test('independent boundary review: numeric, boolean and null YAML keys are rejected before coercion', async t => {
  for (const key of ['1', 'true', 'null']) {
    const file = await fixture(t, `x-notes:\n  ${key}: harmless\nservices: {}\n`);
    const result = await reviewFile('compose', file);
    assert.equal(result.status, 'failed', `Non-string ${key} mapping key was silently coerced`);
    assert.ok(result.diagnostics.some((item) => item.code === 'invalid_document'));
  }
});

test('independent boundary review: quoted numeric, boolean and null strings remain valid keys', async t => {
  const file = await fixture(t, 'x-notes: {"1": harmless, "true": harmless, "null": harmless}\nservices: {}\n');
  const result = await reviewFile('compose', file);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.diagnostics, []);
});

test('independent boundary review: implicit flow pairs cannot coerce a collection key', async t => {
  const file = await fixture(t, 'x-notes: [ [app]: harmless ]\nservices: {}\n');
  const result = await reviewFile('compose', file);
  assert.equal(result.status, 'failed');
  assert.ok(result.diagnostics.some((item) => item.code === 'invalid_document'));
});

test('independent boundary review: string aliases can be mapping keys within the budget', async t => {
  const file = await fixture(t, 'x-name: &name app\nservices:\n  *name : {image: synthetic:fixture, privileged: false}\n');
  const result = await reviewFile('compose', file, { maxReferences: 1 });
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.diagnostics, []);
});

test('independent boundary review: omitted mapping values do not turn adjacent values into keys', async t => {
  for (const text of [
    'x-notes:\n  empty:\n  next: harmless\nservices: {}\n',
    'x-notes: {empty: , next: harmless}\nservices: {}\n',
  ]) {
    const file = await fixture(t, text);
    const result = await reviewFile('compose', file);
    assert.equal(result.status, 'completed');
    assert.deepEqual(result.diagnostics, []);
  }
});
