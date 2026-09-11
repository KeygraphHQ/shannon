import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  checkpointFilePath,
  loadCheckpoint,
  newCheckpoint,
  quarantineCorruptedCheckpoint,
  saveCheckpoint,
} from './checkpoint.js';

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

test('loadCheckpoint fails closed (a Result error, never a throw or fabricated checkpoint) on a corrupted file', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-checkpoint-test-'));
  try {
    const filePath = checkpointFilePath(dir, 'e1');
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not valid json', 'utf8');
    const loaded = await loadCheckpoint(dir, 'e1');
    assert.equal(loaded.ok, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('quarantineCorruptedCheckpoint moves the corrupted file aside — never deletes it — and leaves nothing loadable at the original path', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-checkpoint-test-'));
  try {
    const filePath = checkpointFilePath(dir, 'e1');
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, '{not valid json', 'utf8');

    const result = await quarantineCorruptedCheckpoint(dir, 'e1');
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.value?.includes('.corrupted-'));

    // The corrupted content is preserved verbatim at the quarantine path — not discarded.
    const quarantinedContent = await readFile(result.value as string, 'utf8');
    assert.equal(quarantinedContent, '{not valid json');

    // A fresh load now sees no checkpoint at all (ENOENT), not the corrupted one.
    const reloaded = await loadCheckpoint(dir, 'e1');
    assert.equal(reloaded.ok, true);
    if (reloaded.ok) assert.equal(reloaded.value.round, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('quarantineCorruptedCheckpoint is a safe no-op (not an error) when there is nothing to quarantine', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-checkpoint-test-'));
  try {
    const result = await quarantineCorruptedCheckpoint(dir, 'never-existed');
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.value, undefined);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
