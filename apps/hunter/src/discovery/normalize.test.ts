import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveTargetUrl, normalizeDiscoveredProgram } from './normalize.js';
import type { DiscoveredProgram } from './types.js';

function baseProgram(overrides: Partial<DiscoveredProgram> = {}): DiscoveredProgram {
  return {
    programId: 'acme',
    programName: 'Acme Corp',
    platform: 'hackerone',
    offersBounty: true,
    assets: [],
    rulesOfEngagement: ['no social engineering'],
    disallowedTechniques: ['dos'],
    signals: {},
    sourceProvider: 'test',
    discoveredAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

test('normalizeDiscoveredProgram always writes authorizationConfirmed: false', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({ assets: [{ identifier: 'acme.com', type: 'domain', instruction: 'in-scope' }] }),
  );
  assert.ok(result.ok);
  assert.equal(result.value.scope.authorizationConfirmed, false);
});

test('an unclear-instruction asset is dropped, never defaulted to in-scope', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({
      assets: [
        { identifier: 'acme.com', type: 'domain', instruction: 'in-scope' },
        { identifier: 'maybe.acme.com', type: 'domain', instruction: 'unclear' },
      ],
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.value.scope.assets.length, 1);
  assert.equal(result.value.scope.assets[0]?.identifier, 'acme.com');
  assert.ok(result.value.droppedAssets.some((d) => d.includes('maybe.acme.com')));
});

test('an unsupported-type asset is dropped', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({
      assets: [
        { identifier: 'acme.com', type: 'domain', instruction: 'in-scope' },
        { identifier: 'com.acme.app', type: 'unsupported', instruction: 'in-scope' },
      ],
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.value.scope.assets.length, 1);
  assert.ok(result.value.droppedAssets.some((d) => d.includes('com.acme.app')));
});

test('a valid program round-trips through the real parseProgramScope validator', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({
      assets: [{ identifier: '*.acme.com', type: 'wildcard-domain', instruction: 'in-scope', tier: 'critical' }],
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.value.scope.programId, 'acme');
  assert.equal(result.value.scope.assets[0]?.tier, 'critical');
  assert.equal(result.value.scope.rulesOfEngagement[0], 'no social engineering');
  assert.equal(result.value.scope.disallowedTechniques[0], 'dos');
});

test('an empty programId fails validation through the real validator, not a bespoke check', () => {
  const result = normalizeDiscoveredProgram(baseProgram({ programId: '' }));
  assert.equal(result.ok, false);
});

test('deriveTargetUrl prefers an explicit url asset', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({
      assets: [
        { identifier: 'acme.com', type: 'domain', instruction: 'in-scope' },
        { identifier: 'https://app.acme.com/', type: 'url', instruction: 'in-scope' },
      ],
    }),
  );
  assert.ok(result.ok);
  assert.equal(deriveTargetUrl(result.value.scope), 'https://app.acme.com/');
});

test('deriveTargetUrl synthesizes https:// from a wildcard-domain asset when no url asset exists', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({ assets: [{ identifier: '*.acme.com', type: 'wildcard-domain', instruction: 'in-scope' }] }),
  );
  assert.ok(result.ok);
  assert.equal(deriveTargetUrl(result.value.scope), 'https://acme.com');
});

test('deriveTargetUrl returns undefined for a repo-only program rather than guessing', () => {
  const result = normalizeDiscoveredProgram(
    baseProgram({ assets: [{ identifier: './repo', type: 'repo', instruction: 'in-scope' }] }),
  );
  assert.ok(result.ok);
  assert.equal(deriveTargetUrl(result.value.scope), undefined);
});
