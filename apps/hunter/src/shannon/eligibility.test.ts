import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkShannonEligibility } from './eligibility.js';

test('is ineligible with no repo path — black-box targets never get source-aware mode', async () => {
  const result = await checkShannonEligibility(undefined);
  assert.equal(result.eligible, false);
  assert.match(result.reason, /black-box/);
});

test('is ineligible when the repo path is a URL', async () => {
  const result = await checkShannonEligibility('https://github.com/example/app');
  assert.equal(result.eligible, false);
});

test('is ineligible when the repo path does not exist', async () => {
  const result = await checkShannonEligibility('/definitely/not/a/real/path/xyz');
  assert.equal(result.eligible, false);
});

test('is eligible for a real local directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-eligibility-test-'));
  try {
    const result = await checkShannonEligibility(dir);
    assert.equal(result.eligible, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
