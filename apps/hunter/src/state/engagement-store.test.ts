import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  advancePhase,
  loadEngagement,
  newEngagement,
  saveEngagement,
  withFindings,
  withObservations,
} from './engagement-store.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-engagement-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('newEngagement starts at the first pipeline phase', () => {
  const engagement = newEngagement({ id: 'e1', programId: 'p1', targets: [] });
  assert.equal(engagement.phase, 'scope-validation');
  assert.deepEqual(engagement.findingIds, []);
});

test('save then load round-trips an engagement', async () => {
  await withTempWorkspace(async (dir) => {
    const engagement = newEngagement({ id: 'e1', programId: 'p1', targets: [] });
    await saveEngagement(dir, engagement);
    const loaded = await loadEngagement(dir, 'e1');
    assert.equal(loaded.ok, true);
    if (loaded.ok) {
      assert.equal(loaded.value.id, 'e1');
      assert.equal(loaded.value.phase, 'scope-validation');
    }
  });
});

test('loadEngagement fails cleanly when the file does not exist', async () => {
  await withTempWorkspace(async (dir) => {
    const loaded = await loadEngagement(dir, 'missing');
    assert.equal(loaded.ok, false);
  });
});

test('advancePhase moves forward through the fixed order', () => {
  const engagement = newEngagement({ id: 'e1', programId: 'p1', targets: [] });
  const advanced = advancePhase(engagement, 'recon');
  assert.equal(advanced.ok, true);
  if (advanced.ok) {
    assert.equal(advanced.value.phase, 'recon');
  }
});

test('advancePhase refuses to move backward', () => {
  const engagement = { ...newEngagement({ id: 'e1', programId: 'p1', targets: [] }), phase: 'observations' as const };
  const result = advancePhase(engagement, 'scope-validation');
  assert.equal(result.ok, false);
});

test('withObservations and withFindings de-duplicate ids', () => {
  let engagement = newEngagement({ id: 'e1', programId: 'p1', targets: [] });
  engagement = withObservations(engagement, ['obs-1', 'obs-2']);
  engagement = withObservations(engagement, ['obs-2', 'obs-3']);
  assert.deepEqual(engagement.observationIds, ['obs-1', 'obs-2', 'obs-3']);

  engagement = withFindings(engagement, ['f-1']);
  engagement = withFindings(engagement, ['f-1']);
  assert.deepEqual(engagement.findingIds, ['f-1']);
});
