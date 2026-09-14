import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DiscoveredProgram } from '../discovery/types.js';
import {
  DEFAULT_REFRESH_POLICY,
  detectLifecycleChange,
  fingerprint,
  loadProgramIntel,
  needsRefresh,
  type ProgramIntelStore,
  saveProgramIntel,
  upsertProgramIntel,
} from './program-intelligence.js';

const NOW = new Date('2026-09-14T00:00:00.000Z').getTime();

function program(overrides: Partial<DiscoveredProgram> = {}): DiscoveredProgram {
  return {
    programId: 'acme',
    programName: 'Acme',
    platform: 'hackerone',
    offersBounty: true,
    assets: [{ identifier: 'acme.com', type: 'domain', instruction: 'in-scope' }],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    signals: {},
    sourceProvider: 'test',
    discoveredAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

test('fingerprint is order-independent for object keys and array contents in the same order', () => {
  assert.equal(fingerprint({ a: 1, b: 2 }), fingerprint({ b: 2, a: 1 }));
  assert.notEqual(fingerprint(['a', 'b']), fingerprint(['b', 'a']), 'array element order still matters');
});

test('needsRefresh with no prior record requires everything', () => {
  const needs = needsRefresh(undefined, DEFAULT_REFRESH_POLICY, NOW);
  assert.equal(needs.scope, true);
  assert.equal(needs.disclosures, true);
  assert.equal(needs.bounty, true);
  assert.ok(needs.reasons.length > 0);
});

test('needsRefresh reports fresh facets as not needing refresh, and stale ones as needing it', () => {
  const store = upsertProgramIntel({}, program(), NOW, 'v1');
  const record = store.acme;
  const soon = needsRefresh(record, DEFAULT_REFRESH_POLICY, NOW + 1000);
  assert.equal(soon.scope, false);
  assert.equal(soon.disclosures, true, 'disclosures were never present on this program, so never refreshed');

  const muchLater = needsRefresh(record, DEFAULT_REFRESH_POLICY, NOW + 30 * 86_400_000);
  assert.equal(muchLater.scope, true);
  assert.equal(muchLater.bounty, true);
});

test('TTLs are configurable, not hard-coded — a custom policy changes the outcome', () => {
  const store = upsertProgramIntel({}, program(), NOW, 'v1');
  const record = store.acme;
  const tightPolicy = { ...DEFAULT_REFRESH_POLICY, scopeTtlMs: 1000 };
  const needs = needsRefresh(record, tightPolicy, NOW + 5000);
  assert.equal(needs.scope, true);
});

test('detectLifecycleChange: NEW for the first sighting, UNCHANGED when nothing differs, SCOPE_CHANGED for a scope-only diff', () => {
  const first = detectLifecycleChange(undefined, {
    scopeHash: 'a',
    policyHash: 'b',
    disclosureFingerprint: undefined,
    bountyFingerprint: undefined,
  });
  assert.equal(first.status, 'NEW');

  const prevRecord = {
    programId: 'acme',
    slug: 'acme',
    name: 'Acme',
    status: 'bounty',
    lastSeenAt: new Date(NOW).toISOString(),
    lastScopeRefreshAt: new Date(NOW).toISOString(),
    lastDisclosureRefreshAt: undefined,
    lastPolicyRefreshAt: new Date(NOW).toISOString(),
    lastBountyRefreshAt: undefined,
    scopeHash: 'a',
    policyHash: 'b',
    disclosureFingerprint: undefined,
    bountyFingerprint: undefined,
    assetFingerprint: 'a',
    sourceVersion: 'v1',
    lifecycleStatus: 'NEW' as const,
    history: [],
  };
  const unchanged = detectLifecycleChange(prevRecord, {
    scopeHash: 'a',
    policyHash: 'b',
    disclosureFingerprint: undefined,
    bountyFingerprint: undefined,
  });
  assert.equal(unchanged.status, 'UNCHANGED');

  const scopeChanged = detectLifecycleChange(prevRecord, {
    scopeHash: 'a-different',
    policyHash: 'b',
    disclosureFingerprint: undefined,
    bountyFingerprint: undefined,
  });
  assert.equal(scopeChanged.status, 'SCOPE_CHANGED');
});

test('upsertProgramIntel does not advance lastDisclosureRefreshAt/lastBountyRefreshAt for facets the program does not currently carry', () => {
  const store1 = upsertProgramIntel({}, program({ bountyRangeUsd: { min: 10, max: 100 } }), NOW, 'v1');
  assert.ok(store1.acme?.lastBountyRefreshAt);
  const store2 = upsertProgramIntel(store1, program(), NOW + 86_400_000, 'v1'); // no bountyRangeUsd this round
  assert.equal(
    store2.acme?.lastBountyRefreshAt,
    store1.acme?.lastBountyRefreshAt,
    'a round with no bounty data must not falsely mark bounty as freshly refreshed',
  );
});

test('history is bounded and append-only across repeated upserts', () => {
  let store: ProgramIntelStore = {};
  for (let i = 0; i < 25; i += 1) {
    store = upsertProgramIntel(
      store,
      program({ assets: [{ identifier: `host${i}.com`, type: 'domain', instruction: 'in-scope' }] }),
      NOW + i * 1000,
      'v1',
    );
  }
  assert.ok((store.acme?.history.length ?? 0) <= 20);
});

test('save then load round-trips the store', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'program-intel-'));
  try {
    const store = upsertProgramIntel({}, program(), NOW, 'v1');
    await saveProgramIntel(dir, store);
    const loaded = await loadProgramIntel(dir);
    assert.ok(loaded.ok);
    // JSON drops explicit `undefined` values (e.g. lastBountyRefreshAt on a program with no
    // bounty data yet) -- comparing against a JSON round-trip of the original store is the
    // realistic definition of "round-trips", not byte-for-byte object identity of `undefined` keys.
    assert.deepEqual(loaded.value, JSON.parse(JSON.stringify(store)));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('loadProgramIntel returns an empty store, not an error, when nothing was ever saved', async () => {
  const result = await loadProgramIntel('/nonexistent/workspace/dir');
  assert.ok(result.ok);
  assert.deepEqual(result.value, {});
});
