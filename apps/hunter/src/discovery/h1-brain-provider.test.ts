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

test(
  'regression (Uber/X): a disclosed-report result explicitly marked contaminated is never scored and never ' +
    'treated as a confirmed zero, no matter what count/weakness data accompanies it',
  () => {
    const uberShaped = normalizeSnapshotProgram({
      handle: 'uber',
      name: 'Uber',
      disclosed_report_provider_status: 'contaminated',
      // Even if a count/weakness list is present (e.g. because it was captured before the
      // contamination was noticed), a 'contaminated' status must override it completely.
      disclosed_report_count: 15,
      disclosed_weakness_types: ['Code Injection'],
      snapshot_at: '2026-09-14T00:00:00.000Z',
    });
    assert.equal(uberShaped.signals.competitionPressure, undefined);
    assert.equal(uberShaped.signals.disclosedReportDensity, undefined);
    assert.equal(uberShaped.signals.vulnClassHistory, undefined);
    assert.equal(uberShaped.disclosedWeaknessTypes, undefined);
    assert.ok(uberShaped.dataQualityNotes && uberShaped.dataQualityNotes.length > 0);
    assert.match(uberShaped.dataQualityNotes?.[0] ?? '', /CONTAMINATED_DATA|quarantined/);
  },
);

test('a provider_error status also withholds disclosure-derived signals rather than defaulting to zero competition', () => {
  const errored = normalizeSnapshotProgram({
    handle: 'flaky',
    name: 'Flaky Co',
    disclosed_report_provider_status: 'provider_error',
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(errored.signals.competitionPressure, undefined);
  assert.equal(errored.signals.disclosedReportDensity, undefined);
  assert.ok(errored.dataQualityNotes?.some((n) => n.includes('PROVIDER_ERROR')));
});

test('an explicit no_match status (a real, confirmed zero) still produces a usable competitionPressure signal', () => {
  const confirmedZero = normalizeSnapshotProgram({
    handle: 'quiet',
    name: 'Quiet Co',
    disclosed_report_provider_status: 'no_match',
    disclosed_report_count: 0,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.ok(confirmedZero.signals.competitionPressure);
  assert.equal(confirmedZero.dataQualityNotes, undefined);
});

test('a capped disclosed-report count is represented as a lower bound ("≥N"), never as an exact figure', () => {
  const capped = normalizeSnapshotProgram({
    handle: 'popular',
    name: 'Popular Co',
    disclosed_report_count: 15,
    disclosed_report_count_capped: true,
    disclosed_weakness_types: ['XSS', 'IDOR'],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.match(capped.signals.competitionPressure?.detail ?? '', /≥15/);
  assert.match(capped.signals.disclosedReportDensity?.detail ?? '', /≥15/);
  assert.ok(capped.dataQualityNotes?.some((n) => n.includes('lower bound')));
  const uncapped = normalizeSnapshotProgram({
    handle: 'exact',
    name: 'Exact Co',
    disclosed_report_count: 15,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.ok(
    (capped.signals.competitionPressure?.confidence ?? 1) < (uncapped.signals.competitionPressure?.confidence ?? 0),
    'a capped/lower-bound count must carry strictly less confidence than an exact count of the same value',
  );
});

test('disclosedWeaknessTypes is exposed structurally, not just embedded in a signal detail string', () => {
  const program = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    disclosed_report_count: 5,
    disclosed_weakness_types: ['Cross-site Scripting (XSS) - Stored', 'SSRF'],
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.deepEqual(program.disclosedWeaknessTypes, ['Cross-site Scripting (XSS) - Stored', 'SSRF']);
});

test('adversarial (C): fabricated/quarantined bounty data is rejected outright, never scored, regardless of the figures present', () => {
  const fabricated = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    bounty_min: 1000,
    bounty_max: 50000,
    bounty_provider_status: 'contaminated',
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.equal(fabricated.signals.bountyAttractiveness, undefined);
  assert.equal(fabricated.bountyRangeUsd, undefined);
  assert.ok(fabricated.dataQualityNotes?.some((n) => n.includes('bounty data quarantined')));
});

test('a legitimate bounty figure (status "ok", the default) is scored and surfaced as real dollars', () => {
  const legit = normalizeSnapshotProgram({
    handle: 'acme',
    name: 'Acme Corp',
    bounty_min: 100,
    bounty_max: 5000,
    snapshot_at: '2026-09-14T00:00:00.000Z',
  });
  assert.ok(legit.signals.bountyAttractiveness);
  assert.deepEqual(legit.bountyRangeUsd, { min: 100, max: 5000 });
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
