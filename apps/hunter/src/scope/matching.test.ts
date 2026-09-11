import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScopeAsset } from '../types.js';
import { cidrContains, classifyHostScope, domainMatches, parseCidr, parseIPv4 } from './matching.js';

function asset(overrides: Partial<ScopeAsset> = {}): ScopeAsset {
  return {
    identifier: 'app.example.com',
    type: 'domain',
    instruction: 'in-scope',
    tier: 'standard',
    bountyEligible: true,
    requiresAuthentication: false,
    ...overrides,
  };
}

test('domainMatches matches an exact "domain" asset', () => {
  assert.equal(domainMatches(asset(), 'app.example.com'), true);
  assert.equal(domainMatches(asset(), 'other.example.com'), false);
});

test('domainMatches matches an "ip" asset by exact equality', () => {
  const ipAsset = asset({ identifier: '127.0.0.1', type: 'ip' });
  assert.equal(domainMatches(ipAsset, '127.0.0.1'), true);
  assert.equal(domainMatches(ipAsset, '127.0.0.2'), false);
});

test('classifyHostScope reports an ip-scoped host as in-scope', () => {
  const result = classifyHostScope([asset({ identifier: '127.0.0.1', type: 'ip' })], '127.0.0.1');
  assert.equal(result, 'in-scope');
});

// === parseIPv4 ===

test('parseIPv4 parses a well-formed dotted-quad address', () => {
  assert.equal(parseIPv4('10.0.0.1'), 10 * 2 ** 24 + 1);
  assert.equal(parseIPv4('0.0.0.0'), 0);
  assert.equal(parseIPv4('255.255.255.255'), 0xffffffff);
});

test('parseIPv4 rejects a hostname', () => {
  assert.equal(parseIPv4('app.example.com'), undefined);
});

test('parseIPv4 rejects an octet out of range', () => {
  assert.equal(parseIPv4('10.0.0.256'), undefined);
  assert.equal(parseIPv4('999.1.1.1'), undefined);
});

test('parseIPv4 rejects a leading-zero octet — a common source of ambiguous parsing between tools', () => {
  assert.equal(parseIPv4('10.0.0.01'), undefined);
});

test('parseIPv4 rejects the wrong number of octets', () => {
  assert.equal(parseIPv4('10.0.0'), undefined);
  assert.equal(parseIPv4('10.0.0.0.0'), undefined);
});

test('parseIPv4 rejects an IPv6 address', () => {
  assert.equal(parseIPv4('::1'), undefined);
});

// === parseCidr ===

test('parseCidr parses a well-formed CIDR range', () => {
  assert.deepEqual(parseCidr('10.0.0.0/24'), { network: parseIPv4('10.0.0.0'), prefixLength: 24 });
});

test('parseCidr accepts the boundary prefix lengths 0 and 32', () => {
  assert.deepEqual(parseCidr('0.0.0.0/0'), { network: 0, prefixLength: 0 });
  assert.deepEqual(parseCidr('10.0.0.5/32'), { network: parseIPv4('10.0.0.5'), prefixLength: 32 });
});

test('parseCidr rejects a prefix length out of range', () => {
  assert.equal(parseCidr('10.0.0.0/33'), undefined);
  assert.equal(parseCidr('10.0.0.0/-1'), undefined);
});

test('parseCidr rejects a malformed network address', () => {
  assert.equal(parseCidr('not-an-ip/24'), undefined);
  assert.equal(parseCidr('10.0.0.0'), undefined, 'missing "/prefix" entirely');
});

// === cidrContains ===

test('cidrContains matches an address inside the range', () => {
  assert.equal(cidrContains('10.0.0.0/24', '10.0.0.1'), true);
  assert.equal(cidrContains('10.0.0.0/24', '10.0.0.254'), true);
});

test('cidrContains excludes an address outside the range (same /24 boundary)', () => {
  assert.equal(cidrContains('10.0.0.0/24', '10.0.1.0'), false);
  assert.equal(cidrContains('10.0.0.0/24', '9.255.255.255'), false);
});

test('cidrContains handles the /32 boundary — exactly one address matches', () => {
  assert.equal(cidrContains('10.0.0.5/32', '10.0.0.5'), true);
  assert.equal(cidrContains('10.0.0.5/32', '10.0.0.6'), false);
});

test('cidrContains handles the /0 boundary — every valid IPv4 address matches', () => {
  assert.equal(cidrContains('0.0.0.0/0', '1.2.3.4'), true);
  assert.equal(cidrContains('0.0.0.0/0', '255.255.255.255'), true);
});

test('cidrContains handles an odd, non-byte-aligned prefix length', () => {
  // 192.168.1.0/23 covers 192.168.0.0 - 192.168.1.255
  assert.equal(cidrContains('192.168.0.0/23', '192.168.0.1'), true);
  assert.equal(cidrContains('192.168.0.0/23', '192.168.1.255'), true);
  assert.equal(cidrContains('192.168.0.0/23', '192.168.2.0'), false);
});

test('cidrContains fails closed for a non-IP host (never DNS-resolves)', () => {
  assert.equal(cidrContains('10.0.0.0/24', 'app.example.com'), false);
});

test('cidrContains fails closed for a malformed CIDR range', () => {
  assert.equal(cidrContains('not-a-cidr', '10.0.0.1'), false);
});

// === domainMatches / classifyHostScope: cidr assets, consistent with exact/wildcard behavior ===

test('domainMatches matches a "cidr" asset by real range containment', () => {
  const cidrAsset = asset({ identifier: '10.0.0.0/24', type: 'cidr' });
  assert.equal(domainMatches(cidrAsset, '10.0.0.5'), true);
  assert.equal(domainMatches(cidrAsset, '10.0.1.5'), false);
});

test('classifyHostScope: a cidr in-scope asset admits an address inside the range', () => {
  const result = classifyHostScope([asset({ identifier: '10.0.0.0/24', type: 'cidr' })], '10.0.0.42');
  assert.equal(result, 'in-scope');
});

test('classifyHostScope: an address just outside a cidr range is "unknown", not "in-scope" — fail-closed', () => {
  const result = classifyHostScope([asset({ identifier: '10.0.0.0/24', type: 'cidr' })], '10.0.1.1');
  assert.equal(result, 'unknown');
});

test('classifyHostScope: a narrower cidr exclusion wins over a broader cidr inclusion (out-of-scope always wins)', () => {
  const assets = [
    asset({ identifier: '10.0.0.0/16', type: 'cidr', instruction: 'in-scope' }),
    asset({ identifier: '10.0.5.0/24', type: 'cidr', instruction: 'out-of-scope' }),
  ];
  assert.equal(classifyHostScope(assets, '10.0.5.7'), 'out-of-scope');
  assert.equal(classifyHostScope(assets, '10.0.1.7'), 'in-scope');
});

test('classifyHostScope: a hostname is never treated as in-scope via a cidr asset alone', () => {
  const result = classifyHostScope([asset({ identifier: '10.0.0.0/8', type: 'cidr' })], 'app.example.com');
  assert.equal(result, 'unknown');
});
