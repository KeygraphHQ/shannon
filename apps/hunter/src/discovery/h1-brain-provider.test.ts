import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { type H1BrainSnapshot, H1BrainSnapshotProvider, normalizeSnapshotProgram } from './h1-brain-provider.js';

async function withTempSnapshot(snapshot: H1BrainSnapshot, fn: (path: string) => Promise<void>): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'h1-brain-snapshot-'));
  const path = join(dir, 'snapshot.json');
  try {
    await writeFile(path, JSON.stringify(snapshot), 'utf8');
    await fn(path);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('normalizeSnapshotProgram derives only the signals actually present in the record', () => {
  const program = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    scopes: [{ asset_identifier: '*.acme.com', asset_type: 'WILDCARD', instruction: 'eligible' }],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(
    program.signals.bountyAttractiveness,
    undefined,
    'no bounty_min/max in the record -> no signal, never guessed',
  );
  assert.ok(program.signals.assetSurfaceBreadth, 'a scoped asset was present -> a surface-breadth signal is derived');
  assert.ok(program.signals.capabilityFit);
});

test('normalizeSnapshotProgram maps a wildcard asset to wildcard-domain, not a bare domain', () => {
  const program = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    scopes: [{ asset_identifier: '*.acme.com', asset_type: 'WILDCARD', instruction: 'eligible' }],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(program.assets[0]?.type, 'wildcard-domain');
});

test('normalizeSnapshotProgram derives bountyAttractiveness only when a bounty is documented', () => {
  const program = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    bounty_min: 100,
    bounty_max: 2000,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.ok(program.signals.bountyAttractiveness);
  assert.ok(program.signals.bountyAttractiveness.value > 0 && program.signals.bountyAttractiveness.value <= 1);
});

test('normalizeSnapshotProgram inverts disclosed report volume into competitionPressure (more reports = lower value)', () => {
  const quiet = normalizeSnapshotProgram({
    handle: 'a',
    name: 'A',
    disclosed_report_count: 2,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  const crowded = normalizeSnapshotProgram({
    handle: 'b',
    name: 'B',
    disclosed_report_count: 500,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.ok(quiet.signals.competitionPressure);
  assert.ok(crowded.signals.competitionPressure);
  assert.ok(quiet.signals.competitionPressure.value > crowded.signals.competitionPressure.value);
});

test('normalizeSnapshotProgram credits capabilityFit only when a web-shaped asset exists', () => {
  const webOnly = normalizeSnapshotProgram({
    handle: 'a',
    name: 'A',
    scopes: [{ asset_identifier: 'acme.com', asset_type: 'DOMAIN', instruction: 'eligible' }],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  const repoOnly = normalizeSnapshotProgram({
    handle: 'b',
    name: 'B',
    scopes: [{ asset_identifier: 'github.com/acme/private-repo', asset_type: 'SOURCE_CODE', instruction: 'eligible' }],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(webOnly.signals.capabilityFit?.value, 1);
  assert.ok((repoOnly.signals.capabilityFit?.value ?? 1) < 1);
});

test('H1BrainSnapshotProvider reads and normalizes a real snapshot file', async () => {
  await withTempSnapshot(
    {
      programs: [
        {
          handle: 'acme',
          name: 'Acme Corp',
          offers_bounty: true,
          scopes: [{ asset_identifier: '*.acme.com', asset_type: 'WILDCARD', instruction: 'eligible' }],
          bounty_max: 3000,
          disclosed_report_count: 40,
          snapshot_at: '2026-09-14T00:00:00.000Z',
        },
      ],
    },
    async (path) => {
      const provider = new H1BrainSnapshotProvider(path);
      const result = await provider.discoverPrograms();
      assert.ok(result.ok, result.ok ? undefined : result.error);
      assert.equal(result.value.length, 1);
      assert.equal(result.value[0]?.programId, 'acme');
      assert.equal(result.value[0]?.sourceProvider, 'h1-brain-snapshot');
    },
  );
});

test('H1BrainSnapshotProvider rejects a snapshot missing required fields rather than fabricating a program', async () => {
  await withTempSnapshot({ programs: [{ handle: 'acme' } as never] }, async (path) => {
    const provider = new H1BrainSnapshotProvider(path);
    const result = await provider.discoverPrograms();
    assert.equal(result.ok, false);
  });
});

test('H1BrainSnapshotProvider reports a clear error for a missing snapshot file', async () => {
  const provider = new H1BrainSnapshotProvider('/nonexistent/snapshot.json');
  const result = await provider.discoverPrograms();
  assert.equal(result.ok, false);
});
