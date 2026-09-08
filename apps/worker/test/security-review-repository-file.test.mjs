import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { reviewFileForRepository, reviewerIdentity } from '../dist/security-review/repository-file.js';

const file = fileURLToPath(new URL('./fixtures/security-review/compose/privileged-literal-true.yaml', import.meta.url));
test('repository file metadata describes the same reviewed bytes', async () => {
  const source = file;
  const bytes = await fs.readFile(source);
  const analysis = await reviewFileForRepository('compose', source);
  assert.notEqual(analysis.result.status, 'failed');
  assert.equal(analysis.bytes, bytes.length);
  assert.equal(analysis.sha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(analysis.observations.map(item => item.issue), analysis.result.issues);
  assert.ok(analysis.observations.every(item => /^[a-f0-9]{64}$/.test(item.identity)));
});
test('an aborted file review and identity read stop explicitly', async () => {
  const signal = AbortSignal.abort();
  const analysis = await reviewFileForRepository('compose', file, undefined, signal);
  assert.equal(analysis.result.status, 'failed');
  assert.equal(analysis.result.diagnostics[0].code, 'processing_timeout');
  assert.equal(analysis.sha256, null);
  await assert.rejects(reviewerIdentity(signal), /Reviewer identity unavailable/);
});
