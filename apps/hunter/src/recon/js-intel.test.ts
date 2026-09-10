import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeJavaScript } from './js-intel.js';

const SAMPLE_BUNDLE = `
const API_BASE = "https://app.example.com";
fetch("/api/v2/admin/users").then(handle);
fetch('/internal/debug/config');
const cfg = { host: "db-primary.internal" };
const featureFlags = { newCheckout: true };
const token = "AKIAABCDEFGHIJKLMNOP";
`;

test('discovers endpoint strings referenced in JS as both discoveries and observations', () => {
  const result = analyzeJavaScript(SAMPLE_BUNDLE, 'bundle-app.js', 'https://app.example.com', 'e1');
  const endpointDiscoveries = result.discoveries.filter((d) => d.kind === 'endpoint');
  assert.ok(endpointDiscoveries.some((d) => d.label === '/api/v2/admin/users'));
  assert.ok(endpointDiscoveries.some((d) => d.label === '/internal/debug/config'));

  const endpointObservations = result.observations.filter((o) => o.vulnClass === 'js-intel-endpoint-discovery');
  assert.equal(endpointObservations.length, 2);
});

test('flags internal-looking host references', () => {
  const result = analyzeJavaScript(SAMPLE_BUNDLE, 'bundle-app.js', 'https://app.example.com', 'e1');
  const internal = result.observations.filter((o) => o.vulnClass === 'js-intel-internal-reference');
  assert.equal(internal.length, 1);
  assert.match(internal[0]?.title ?? '', /db-primary\.internal/);
});

test('flags feature-flag configuration', () => {
  const result = analyzeJavaScript(SAMPLE_BUNDLE, 'bundle-app.js', 'https://app.example.com', 'e1');
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-feature-flags'));
});

test('flags a possible secret but redacts it — never keeps the full value', () => {
  const result = analyzeJavaScript(SAMPLE_BUNDLE, 'bundle-app.js', 'https://app.example.com', 'e1');
  const secretObs = result.observations.find((o) => o.vulnClass === 'js-intel-secret-exposure');
  assert.ok(secretObs);
  assert.ok(!secretObs.description.includes('AKIAABCDEFGHIJKLMNOP'));
  assert.match(secretObs.description, /redacted/);
});

test('records the artifact itself as a js-artifact discovery', () => {
  const result = analyzeJavaScript(SAMPLE_BUNDLE, 'bundle-app.js', 'https://app.example.com', 'e1');
  assert.ok(result.discoveries.some((d) => d.kind === 'js-artifact' && d.label === 'bundle-app.js'));
});

test('flags a candidate DOM XSS only when both an untrusted source and a dangerous sink are present', () => {
  const withBoth = analyzeJavaScript(
    'const q = new URLSearchParams(location.search).get("q"); resultsDiv.innerHTML = q;',
    'bundle-search.js',
    'https://app.example.com/search',
    'e1',
  );
  assert.ok(withBoth.observations.some((o) => o.vulnClass === 'xss'));

  const sinkOnly = analyzeJavaScript(
    'resultsDiv.innerHTML = trustedTemplate;',
    'bundle-safe.js',
    'https://app.example.com/search',
    'e1',
  );
  assert.equal(
    sinkOnly.observations.some((o) => o.vulnClass === 'xss'),
    false,
  );
});

test('a bundle with no interesting content yields no false-positive observations', () => {
  const result = analyzeJavaScript('const x = 1 + 1;', 'trivial.js', 'https://app.example.com', 'e1');
  assert.equal(result.observations.length, 0);
});
