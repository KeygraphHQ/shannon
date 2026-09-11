import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Observation } from '../types.js';
import { appendObservations, listObservations } from './observation-log.js';

function observation(id: string): Observation {
  return {
    id,
    engagementId: 'e1',
    source: 'fixture',
    assetRef: 'https://app.example.com',
    vulnClass: 'xss',
    title: 'x',
    description: 'x',
    severityHint: 'low',
    confidenceHint: 'low',
    verified: false,
    tags: [],
    collectedAt: new Date().toISOString(),
  };
}

test('listObservations returns empty for a fresh engagement', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-obslog-test-'));
  try {
    const result = await listObservations(dir, 'e1');
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendObservations across multiple calls accumulates, in order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-obslog-test-'));
  try {
    await appendObservations(dir, 'e1', [observation('obs-1'), observation('obs-2')]);
    await appendObservations(dir, 'e1', [observation('obs-3')]);
    const result = await listObservations(dir, 'e1');
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(
        result.value.map((o) => o.id),
        ['obs-1', 'obs-2', 'obs-3'],
      );
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('appendObservations with an empty array is a safe no-op', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-obslog-test-'));
  try {
    await appendObservations(dir, 'e1', []);
    const result = await listObservations(dir, 'e1');
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.value, []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
