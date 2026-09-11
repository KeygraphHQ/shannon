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
  assert.equal(result.provenanceEdges.length, 0);
});

test('infers the HTTP method from a fetch-style call adjacent to the endpoint string', () => {
  const result = analyzeJavaScript('api.delete("/api/v2/admin/users");', 'bundle.js', 'https://app.example.com', 'e1');
  const discovery = result.discoveries.find((d) => d.kind === 'endpoint');
  assert.ok(discovery);
  assert.deepEqual(discovery?.attributes.methods, ['DELETE']);
});

test('infers the HTTP method from a method option object near the endpoint string', () => {
  const result = analyzeJavaScript(
    'fetch("/api/v2/admin/users", { method: "POST" });',
    'bundle.js',
    'https://app.example.com',
    'e1',
  );
  const discovery = result.discoveries.find((d) => d.kind === 'endpoint');
  assert.ok(discovery);
  assert.deepEqual(discovery?.attributes.methods, ['POST']);
});

test('records a provenance edge for an endpoint with a dynamic resource segment', () => {
  const result = analyzeJavaScript(
    'fetch(`/api/v2/admin/users/{userId}`);',
    'bundle.js',
    'https://app.example.com',
    'e1',
  );
  assert.equal(result.provenanceEdges.length, 1);
  assert.equal(result.provenanceEdges[0]?.sinkKind, 'api-endpoint');
});

test('detects a GraphQL operation', () => {
  const result = analyzeJavaScript(
    'const QUERY = gql`query GetUser($id: ID!) { user(id: $id) { name } }`;',
    'bundle.js',
    'https://app.example.com',
    'e1',
  );
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-graphql-operation'));
});

test('detects client-side auth/role logic and records a provenance edge to the authorization decision', () => {
  const result = analyzeJavaScript(
    'if (user.role === "admin") { showAdminPanel(); }',
    'bundle.js',
    'https://app.example.com',
    'e1',
  );
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-auth-logic'));
  assert.ok(result.provenanceEdges.some((e) => e.sinkKind === 'authorization-decision'));
});

test('detects a named workflow function', () => {
  const result = analyzeJavaScript('function approveRefund(orderId) { return post(orderId); }', 'bundle.js', 'a', 'e1');
  const obs = result.observations.find((o) => o.vulnClass === 'js-intel-workflow-function');
  assert.ok(obs);
  assert.match(obs?.title ?? '', /approveRefund/);
});

test('detects a third-party integration domain', () => {
  const result = analyzeJavaScript(
    'const stripe = Stripe("pk_live_x"); fetch("https://api.stripe.com/v1/tokens");',
    'bundle.js',
    'a',
    'e1',
  );
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-third-party-integration'));
});

test('detects an environment reference bundled into client code', () => {
  const result = analyzeJavaScript('const key = process.env.PUBLIC_API_KEY;', 'bundle.js', 'a', 'e1');
  const obs = result.observations.find((o) => o.vulnClass === 'js-intel-env-reference');
  assert.ok(obs);
  assert.match(obs?.title ?? '', /PUBLIC_API_KEY/);
});

test('detects a source-map reference', () => {
  const result = analyzeJavaScript('console.log(1);\n//# sourceMappingURL=app.js.map', 'bundle.js', 'a', 'e1');
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-sourcemap-reference'));
});

test('detects a dynamically-imported chunk and records it as a related js-artifact', () => {
  const result = analyzeJavaScript('const mod = await import("./admin-panel.js");', 'bundle.js', 'a', 'e1');
  assert.ok(result.discoveries.some((d) => d.kind === 'js-artifact' && d.label === './admin-panel.js'));
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-chunk-reference'));
});

test('detects a client-side navigation/state transition', () => {
  const result = analyzeJavaScript('router.push("/checkout/confirm");', 'bundle.js', 'a', 'e1');
  assert.ok(result.observations.some((o) => o.vulnClass === 'js-intel-client-state-transition'));
});

test('a bundle with only a plain fetch to a documented-looking endpoint produces no new-category false positives', () => {
  const result = analyzeJavaScript('fetch("/api/v1/health");', 'bundle.js', 'a', 'e1');
  const categories = new Set(result.observations.map((o) => o.vulnClass));
  assert.deepEqual([...categories], ['js-intel-endpoint-discovery']);
});
