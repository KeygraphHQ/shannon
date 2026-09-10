import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Observation, ProgramScope } from '../types.js';
import { classifyDiscoveryScope, classifyRawDiscoveryScope, filterInScopeObservations } from './scope-tagging.js';

function program(): ProgramScope {
  return {
    programId: 'p1',
    programName: 'P1',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [
      {
        identifier: '*.example.com',
        type: 'wildcard-domain',
        instruction: 'in-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
      {
        identifier: 'admin.example.com',
        type: 'domain',
        instruction: 'out-of-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 60,
  };
}

test('classifies an in-scope host discovered as a bare label', () => {
  assert.equal(classifyDiscoveryScope(program(), 'host', 'api.example.com'), 'in-scope');
});

test('classifies an out-of-scope host even when it would match a wildcard', () => {
  assert.equal(classifyDiscoveryScope(program(), 'host', 'admin.example.com'), 'out-of-scope');
});

test('classifies an asset discovered as a full URL by its hostname', () => {
  assert.equal(classifyDiscoveryScope(program(), 'asset', 'https://api.example.com/health'), 'in-scope');
});

test('classifies an unrelated host as unknown, not in-scope', () => {
  assert.equal(classifyDiscoveryScope(program(), 'host', 'other.org'), 'unknown');
});

test('non-host/asset kinds are always unknown — scope is inherited via the graph, not guessed', () => {
  assert.equal(classifyDiscoveryScope(program(), 'endpoint', '/search'), 'unknown');
});

function observation(assetRef: string): Observation {
  return {
    id: 'obs-1',
    engagementId: 'e1',
    source: 'fixture',
    assetRef,
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

test('filterInScopeObservations drops observations against an out-of-scope asset', () => {
  const observations = [observation('https://admin.example.com/panel'), observation('https://api.example.com/search')];
  const filtered = filterInScopeObservations(program(), observations);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.assetRef, 'https://api.example.com/search');
});

test('filterInScopeObservations keeps observations whose scope is merely unknown', () => {
  const observations = [observation('https://other.org/x')];
  assert.equal(filterInScopeObservations(program(), observations).length, 1);
});

test('classifyRawDiscoveryScope inherits scope from an attributes.host hint for non-host/asset kinds', () => {
  const inScope = classifyRawDiscoveryScope(program(), {
    source: 'katana',
    kind: 'endpoint',
    label: '/search',
    attributes: { host: 'api.example.com' },
    confidence: 0.7,
    discoveredAt: new Date().toISOString(),
  });
  assert.equal(inScope, 'in-scope');

  const outOfScope = classifyRawDiscoveryScope(program(), {
    source: 'katana',
    kind: 'endpoint',
    label: '/panel',
    attributes: { host: 'admin.example.com' },
    confidence: 0.7,
    discoveredAt: new Date().toISOString(),
  });
  assert.equal(outOfScope, 'out-of-scope');
});
