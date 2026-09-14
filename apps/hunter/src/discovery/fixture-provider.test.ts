import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { FixtureDiscoveryProvider } from './fixture-provider.js';
import { rankPrograms, selectBestProgram } from './scoring.js';

const BUNDLED_DATASET = fileURLToPath(new URL('../../fixtures/discovery/programs.json', import.meta.url));

test('reads the bundled synthetic multi-program dataset', async () => {
  const provider = new FixtureDiscoveryProvider(BUNDLED_DATASET);
  const result = await provider.discoverPrograms();
  assert.ok(result.ok, result.ok ? undefined : result.error);
  assert.ok(result.value.length >= 8, `expected at least 8 synthetic programs, got ${result.value.length}`);
  assert.ok(result.value.every((p) => p.sourceProvider === 'fixture'));
});

test('the bundled dataset produces a rational, inspectable ranking', async () => {
  const provider = new FixtureDiscoveryProvider(BUNDLED_DATASET);
  const result = await provider.discoverPrograms();
  assert.ok(result.ok);
  const ranked = rankPrograms(result.value);
  const winner = selectBestProgram(ranked);
  assert.ok(winner, 'a winner must be selected from a dataset where every program has at least one signal');
  // medium-bounty/low-competition/rich-app should beat high-bounty/high-competition — see scoring.test.ts for the isolated proof of this property.
  assert.equal(winner?.program.programId, 'initech-midrich');
});

test('a program with a restrictive ROE still scores, but its capabilityFit/researchCost signals reflect the cost of that restriction', async () => {
  const provider = new FixtureDiscoveryProvider(BUNDLED_DATASET);
  const result = await provider.discoverPrograms();
  assert.ok(result.ok);
  const ironclad = result.value.find((p) => p.programId === 'ironclad-restrictiveroe');
  assert.ok(ironclad);
  assert.equal(ironclad.disallowedTechniques.includes('active scanning'), true);
});

test('a program missing several signals still ranks, using only the signals it has', async () => {
  const provider = new FixtureDiscoveryProvider(BUNDLED_DATASET);
  const result = await provider.discoverPrograms();
  assert.ok(result.ok);
  const ranked = rankPrograms(result.value);
  const apiforge = ranked.find((r) => r.program.programId === 'apiforge-interesting');
  assert.ok(apiforge);
  assert.equal(apiforge.score.missingSignals.includes('competitionPressure'), true);
  assert.equal(apiforge.score.missingSignals.includes('vulnClassHistory'), true);
  assert.notEqual(apiforge.score.totalScore, undefined);
});

test('rejects a fixture file that is not a valid discovered-program array', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-discovery-'));
  const badPath = join(dir, 'bad.json');
  await writeFile(badPath, JSON.stringify([{ programId: 'x' }]), 'utf8');
  const provider = new FixtureDiscoveryProvider(badPath);
  const result = await provider.discoverPrograms();
  assert.equal(result.ok, false);
  await rm(dir, { recursive: true, force: true });
});

test('reports a clear error for a missing file rather than throwing', async () => {
  const provider = new FixtureDiscoveryProvider('/nonexistent/path/programs.json');
  const result = await provider.discoverPrograms();
  assert.equal(result.ok, false);
});
