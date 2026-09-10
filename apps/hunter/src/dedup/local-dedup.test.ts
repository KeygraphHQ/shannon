import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createFinding } from '../findings/lifecycle.js';
import {
  computeSignature,
  createDisclosedReportProvider,
  DisabledDisclosedReportProvider,
  HackerOneApiDisclosedReportProvider,
  LocalSignatureDeduplicator,
} from './local-dedup.js';

function makeFinding(overrides: Partial<Parameters<typeof createFinding>[0]> = {}) {
  return createFinding({
    engagementId: 'e1',
    title: 'Reflected XSS',
    vulnClass: 'xss',
    assetRef: 'https://app.example.com/search?q=test',
    confidence: 0.8,
    observationIds: ['obs-1'],
    reason: 'test fixture finding',
    ...overrides,
  });
}

test('computeSignature ignores query strings when comparing the same endpoint', () => {
  const a = computeSignature({ vulnClass: 'xss', assetRef: 'https://app.example.com/search?q=1' });
  const b = computeSignature({ vulnClass: 'xss', assetRef: 'https://app.example.com/search?q=2' });
  assert.equal(a, b);
});

test('flags a finding on the same asset and vuln class as a duplicate', () => {
  const dedup = new LocalSignatureDeduplicator();
  const existing = makeFinding();
  const candidate = makeFinding({ assetRef: 'https://app.example.com/search?q=other' });

  const result = dedup.checkDuplicate(candidate, [existing]);
  assert.equal(result.isDuplicate, true);
  if (result.isDuplicate) {
    assert.equal(result.matchedFindingId, existing.id);
  }
});

test('does not flag findings on different assets or vuln classes', () => {
  const dedup = new LocalSignatureDeduplicator();
  const existing = makeFinding();
  const differentAsset = makeFinding({ assetRef: 'https://app.example.com/other-endpoint' });
  const differentClass = makeFinding({ vulnClass: 'authz' });

  assert.equal(dedup.checkDuplicate(differentAsset, [existing]).isDuplicate, false);
  assert.equal(dedup.checkDuplicate(differentClass, [existing]).isDuplicate, false);
});

test('a finding never matches itself in the existing list', () => {
  const dedup = new LocalSignatureDeduplicator();
  const candidate = makeFinding();
  assert.equal(dedup.checkDuplicate(candidate, [candidate]).isDuplicate, false);
});

test('DisabledDisclosedReportProvider always reports PROVIDER_DISABLED and never a match', async () => {
  const provider = new DisabledDisclosedReportProvider();
  const result = await provider.search(makeFinding());
  assert.equal(result.status, 'PROVIDER_DISABLED');
  assert.equal(result.matchedReportUrl, undefined);
});

test('HackerOneApiDisclosedReportProvider reports NO_PROVIDER without credentials', async () => {
  const provider = new HackerOneApiDisclosedReportProvider(undefined);
  const result = await provider.search(makeFinding());
  assert.equal(result.status, 'NO_PROVIDER');
});

test('HackerOneApiDisclosedReportProvider reports PROVIDER_ERROR rather than a fabricated match, even with credentials', async () => {
  const provider = new HackerOneApiDisclosedReportProvider({ apiUsername: 'u', apiToken: 't' });
  const result = await provider.search(makeFinding());
  assert.equal(result.status, 'PROVIDER_ERROR');
  assert.match(result.detail, /not implemented/);
});

test('createDisclosedReportProvider picks the disabled provider when no credentials are in the environment', () => {
  const provider = createDisclosedReportProvider({});
  assert.ok(provider instanceof DisabledDisclosedReportProvider);
});

test('createDisclosedReportProvider picks the HackerOne API provider when both credential vars are set', () => {
  const provider = createDisclosedReportProvider({ HACKERONE_API_USERNAME: 'u', HACKERONE_API_TOKEN: 't' });
  assert.ok(provider instanceof HackerOneApiDisclosedReportProvider);
});
