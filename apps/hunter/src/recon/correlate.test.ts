import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RawDiscovery } from '../types.js';
import { correlateDiscoveries, crossSourceCorrelated } from './correlate.js';

function discovery(overrides: Partial<RawDiscovery> = {}): RawDiscovery {
  return {
    source: 'subfinder',
    kind: 'host',
    label: 'api.example.com',
    attributes: {},
    confidence: 0.6,
    discoveredAt: new Date().toISOString(),
    ...overrides,
  };
}

test('correlateDiscoveries merges discoveries of the same kind+label regardless of casing', () => {
  const correlated = correlateDiscoveries([
    discovery({ source: 'subfinder' }),
    discovery({ source: 'ct-logs', label: 'API.example.com' }),
  ]);
  assert.equal(correlated.length, 1);
  assert.deepEqual([...(correlated[0]?.sources ?? [])].sort(), ['ct-logs', 'subfinder']);
});

test('correlateDiscoveries keeps distinct labels/kinds separate', () => {
  const correlated = correlateDiscoveries([
    discovery({ label: 'api.example.com' }),
    discovery({ label: 'www.example.com' }),
    discovery({ kind: 'endpoint', label: 'api.example.com' }),
  ]);
  assert.equal(correlated.length, 3);
});

test('combined confidence from two independent sources exceeds either alone', () => {
  const correlated = correlateDiscoveries([
    discovery({ confidence: 0.5 }),
    discovery({ source: 'amass', confidence: 0.5 }),
  ]);
  assert.equal(correlated.length, 1);
  assert.ok((correlated[0]?.confidence ?? 0) > 0.5);
});

test('crossSourceCorrelated only returns multi-source discoveries', () => {
  const correlated = correlateDiscoveries([
    discovery({ label: 'a.example.com' }),
    discovery({ label: 'b.example.com' }),
    discovery({ label: 'b.example.com', source: 'amass' }),
  ]);
  const multi = crossSourceCorrelated(correlated);
  assert.equal(multi.length, 1);
  assert.equal(multi[0]?.label, 'b.example.com');
});
