import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadCheckpoint, newCheckpoint, saveCheckpoint } from './checkpoint.js';

test('newCheckpoint starts at round 0, in-progress, with empty collections', () => {
  const checkpoint = newCheckpoint('e1');
  assert.equal(checkpoint.round, 0);
  assert.equal(checkpoint.status, 'in-progress');
  assert.deepEqual(checkpoint.hypotheses, []);
  assert.deepEqual(checkpoint.completedActionKeys, []);
});

test('loadCheckpoint returns a fresh checkpoint (not an error) when none exists yet', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-checkpoint-test-'));
  try {
    const loaded = await loadCheckpoint(dir, 'e1');
    assert.equal(loaded.ok, true);
    if (loaded.ok) assert.equal(loaded.value.round, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('saveCheckpoint then loadCheckpoint round-trips progress', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-checkpoint-test-'));
  try {
    const checkpoint = { ...newCheckpoint('e1'), round: 3, completedActionKeys: ['shannon::https://app.example.com'] };
    await saveCheckpoint(dir, checkpoint);
    const loaded = await loadCheckpoint(dir, 'e1');
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.value.round, 3);
      assert.deepEqual(loaded.value.completedActionKeys, ['shannon::https://app.example.com']);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
