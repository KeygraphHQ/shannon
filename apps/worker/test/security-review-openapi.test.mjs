import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeOpenApi } from '../dist/security-review/openapi.js';
import { DEFAULT_LIMITS } from '../dist/security-review/types.js';

// Focused implementation tests; the independently labeled corpus is separate.
// Semantics: https://spec.openapis.org/oas/v3.0.4.html#security-requirement-object
// and https://spec.openapis.org/oas/v3.1.1.html#security-requirement-object .
const SCHEME = 'openapi/undeclared-security-scheme';
const SCOPE = 'openapi/undeclared-oauth-scope';
const apiKey = { type: 'apiKey', in: 'header', name: 'Authorization' };
const oauth = (scopes = {}) => ({
  type: 'oauth2',
  flows: { clientCredentials: { tokenUrl: 'https://example.invalid/token', scopes } },
});
const document = (fields = {}) => ({
  openapi: '3.1.1', info: { title: 'Local example', version: '1' }, paths: {}, ...fields,
});
const compactIssues = (result) => result.issues.map(({ ruleId, pointer, classification, applicability }) =>
  ({ ruleId, pointer, classification, applicability }));
const issue = (ruleId, pointer) => ({ ruleId, pointer, classification: 'contract-consistency', applicability: 'declared' });
const codes = (result) => result.diagnostics.map(({ code }) => code);

test('OpenAPI checks every AND and OR declaration without treating anonymous access as a defect', () => {
  const result = analyzeOpenApi(document({
    components: { securitySchemes: { known: apiKey } },
    security: [{}, { known: [], absent: [] }, { another: [] }],
  }));
  assert.deepEqual(compactIssues(result), [issue(SCHEME, '/security/1/absent'), issue(SCHEME, '/security/2/another')]);
  assert.deepEqual(result.diagnostics, []);
});

test('OpenAPI reports root evidence once and honors explicit operation overrides', () => {
  const result = analyzeOpenApi(document({
    security: [{ rootMissing: [] }],
    paths: { '/items': {
      get: { security: [] }, post: {}, put: { security: [{}] },
      delete: { security: [{ localMissing: [] }] },
    } },
  }));
  assert.deepEqual(compactIssues(result), [issue(SCHEME, '/security/0/rootMissing'), issue(SCHEME, '/paths/~1items/delete/security/0/localMissing')]);
});

test('OpenAPI omission, empty requirements, and explicit anonymous access have no findings', () => {
  for (const fields of [{}, { security: [] }, { security: [{}] }]) {
    assert.deepEqual(analyzeOpenApi(document(fields)), { issues: [], diagnostics: [] });
  }
});

test('OpenAPI distinguishes malformed declaration maps from absent maps', () => {
  for (const components of [null, [], { securitySchemes: null }, { securitySchemes: [] }, { securitySchemes: { $ref: '#/x-schemes' } }]) {
    const result = analyzeOpenApi(document({ components, security: [{ missing: [] }] }));
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0);
  }
  assert.deepEqual(compactIssues(analyzeOpenApi(document({ security: [{ missing: [] }] }))), [issue(SCHEME, '/security/0/missing')]);
});

test('OpenAPI ignores reference siblings and resolves same-document schemes', () => {
  const result = analyzeOpenApi(document({
    components: { securitySchemes: {
      alias: { $ref: '#/components/securitySchemes/base', type: 'oauth2', flows: {} },
      base: apiKey,
    } }, security: [{ alias: [] }],
  }));
  assert.deepEqual(result, { issues: [], diagnostics: [] });
});

test('OpenAPI does not confuse external, missing, invalid, or cyclic references with missing schemes', () => {
  const references = [
    ['https://example.invalid/auth.json', 'openapi/external-reference'],
    ['./auth.yaml#/scheme', 'openapi/external-reference'],
    ['#/components/securitySchemes/absent', 'openapi/unresolved-reference'],
    ['#/components/securitySchemes/alias', 'openapi/cyclic-reference'],
    ['#/%ZZ', 'openapi/invalid-reference'],
    ['#/bad~2escape', 'openapi/invalid-reference'],
  ];
  for (const [$ref, expected] of references) {
    const result = analyzeOpenApi(document({
      components: { securitySchemes: { alias: { $ref } } }, security: [{ alias: ['read'] }],
    }));
    assert.deepEqual(result.issues, []);
    assert.ok(codes(result).includes(expected), expected);
  }
});

test('OpenAPI resolves percent encoded local JSON Pointer references without following inherited properties', () => {
  const result = analyzeOpenApi(document({
    'x-definitions': { 'a/b~c': oauth({ read: 'Read' }) },
    components: { securitySchemes: { auth: { $ref: '#/x-definitions/a%7E1b%7E0c' } } },
    security: [{ auth: ['read', 'write'] }],
  }));
  assert.deepEqual(compactIssues(result), [issue(SCOPE, '/security/0/auth/1')]);
  const inherited = analyzeOpenApi(document({
    components: { securitySchemes: { auth: { $ref: '#/constructor' } } }, security: [{ auth: [] }],
  }));
  assert.ok(codes(inherited).includes('openapi/unresolved-reference'));
});

test('OpenAPI combines declared OAuth scopes from all valid flows, preserving case', () => {
  const auth = oauth({ read: 'Read' });
  auth.flows.implicit = { authorizationUrl: 'https://example.invalid/authorize', scopes: { write: 'Write' } };
  const result = analyzeOpenApi(document({ components: { securitySchemes: { auth } }, security: [{ auth: ['read', 'write', 'Read'] }] }));
  assert.deepEqual(compactIssues(result), [issue(SCOPE, '/security/0/auth/2')]);
  assert.deepEqual(result.diagnostics, []);
});

test('OpenAPI empty OAuth scope maps are known, while missing or malformed flow scopes are unknown', () => {
  const known = analyzeOpenApi(document({ components: { securitySchemes: { auth: oauth() } }, security: [{ auth: ['read'] }] }));
  assert.deepEqual(compactIssues(known), [issue(SCOPE, '/security/0/auth/0')]);
  for (const flows of [null, [], { clientCredentials: {} }, { clientCredentials: { tokenUrl: '/token', scopes: [] } },
    { clientCredentials: { tokenUrl: '/token', scopes: { read: 1 } } },
    { clientCredentials: { $ref: '#/x-flow' } }, { futureFlow: { scopes: {} } }]) {
    const result = analyzeOpenApi(document({ components: { securitySchemes: { auth: { type: 'oauth2', flows } } }, security: [{ auth: ['absent'] }] }));
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0);
  }
});

test('OpenAPI a malformed additional OAuth flow prevents false absence claims', () => {
  const auth = oauth({ read: 'Read' });
  auth.flows.implicit = { authorizationUrl: '/authorize' };
  const result = analyzeOpenApi(document({ components: { securitySchemes: { auth } }, security: [{ auth: ['absent'] }] }));
  assert.deepEqual(result.issues, []);
  assert.ok(result.diagnostics.length > 0);
});

test('OpenAPI OpenID scopes remain unknown and are never fetched', () => {
  const result = analyzeOpenApi(document({ components: { securitySchemes: {
    identity: { type: 'openIdConnect', openIdConnectUrl: 'https://example.invalid/.well-known/openid-configuration' },
  } }, security: [{ identity: ['profile'] }] }));
  assert.deepEqual(result.issues, []);
  assert.ok(codes(result).includes('openapi/openid-scopes-unknown'));
});

test('OpenAPI 3.1 non-OAuth roles are valid while 3.0 nonempty non-OAuth arrays are malformed', () => {
  for (const scheme of [apiKey, { type: 'http', scheme: 'bearer' }, { type: 'mutualTLS' }]) {
    assert.deepEqual(analyzeOpenApi(document({ components: { securitySchemes: { auth: scheme } }, security: [{ auth: ['operator'] }] })), { issues: [], diagnostics: [] });
  }
  const older = analyzeOpenApi(document({ openapi: '3.0.4', components: { securitySchemes: { auth: apiKey } }, security: [{ auth: ['operator'] }] }));
  assert.deepEqual(older.issues, []);
  assert.ok(codes(older).includes('openapi/invalid-security-requirement'));
});

test('OpenAPI malformed requirement lists do not become undeclared scheme findings', () => {
  for (const security of [null, {}, [{ missing: 'scope' }], [{ missing: [1] }], [null], [{ $ref: '#/security/0' }]]) {
    const result = analyzeOpenApi(document({ security }));
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0);
  }
});

test('OpenAPI checks local referenced path items, used callbacks, and 3.1 webhooks at actual source pointers', () => {
  const result = analyzeOpenApi(document({
    paths: { '/alias': { $ref: '#/components/pathItems/shared' } },
    components: { pathItems: { shared: { get: { security: [{ absent: [] }], callbacks: { completed: { $ref: '#/components/callbacks/completed' } } } } },
      callbacks: { completed: { '{$request.body#/callback}': { post: { security: [{ callbackMissing: [] }] } } } } },
    webhooks: { delivery: { post: { security: [{ hookMissing: [] }] } } },
  }));
  assert.deepEqual(compactIssues(result), [
    issue(SCHEME, '/components/pathItems/shared/get/security/0/absent'),
    issue(SCHEME, '/components/callbacks/completed/{$request.body#~1callback}/post/security/0/callbackMissing'),
    issue(SCHEME, '/webhooks/delivery/post/security/0/hookMissing'),
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test('OpenAPI does not scan unused component callbacks or arbitrary schema/example security keys', () => {
  const result = analyzeOpenApi(document({ components: {
    callbacks: { unused: { '/callback': { post: { security: [{ missing: [] }] } } } },
    schemas: { payload: { security: [{ missing: [] }] } },
  }, 'x-example': { security: [{ missing: [] }] } }));
  assert.deepEqual(result, { issues: [], diagnostics: [] });
});

test('OpenAPI explicitly diagnoses unsupported version, operation references and path reference siblings', () => {
  for (const input of [
    document({ openapi: '3.2.0' }), document({ openapi: '2.0' }),
    document({ paths: { '/x': { get: { $ref: '#/x-operation' } } } }),
    document({ paths: { '/x': { $ref: '#/x-item', get: { security: [{ missing: [] }] } } } }),
    document({ openapi: '3.0.4', webhooks: { event: {} } }),
  ]) {
    const result = analyzeOpenApi(input);
    assert.deepEqual(result.issues, []);
    assert.ok(result.diagnostics.length > 0);
  }
});

test('OpenAPI recursive callback references and exhausted budgets stop with explicit diagnostics', () => {
  const input = document({ paths: { '/x': { get: { callbacks: { recursive: { $ref: '#/components/callbacks/recursive' } } } } },
    components: { callbacks: { recursive: { '/callback': { post: { callbacks: { recursive: { $ref: '#/components/callbacks/recursive' } } } } } } } });
  assert.ok(codes(analyzeOpenApi(input)).includes('openapi/cyclic-reference'));
  const referenced = document({ components: { securitySchemes: { alias: { $ref: '#/x-auth' } } }, 'x-auth': apiKey, security: [{ alias: [] }] });
  assert.ok(codes(analyzeOpenApi(referenced, { ...DEFAULT_LIMITS, maxReferences: 0 })).includes('openapi/reference-limit'));
  assert.ok(codes(analyzeOpenApi(input, { ...DEFAULT_LIMITS, maxNodes: 1 })).includes('openapi/node-limit'));
  assert.ok(codes(analyzeOpenApi(input, { ...DEFAULT_LIMITS, maxDepth: 1 })).includes('openapi/depth-limit'));
});

test('OpenAPI source values stay out of prose and source objects remain unchanged', () => {
  const input = document({ paths: { '/private~segment/token': { get: { security: [{ secret_scheme: [] }] } } } });
  const before = JSON.stringify(input);
  const result = analyzeOpenApi(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(result.issues[0].pointer, '/paths/~1private~0segment~1token/get/security/0/secret_scheme');
  for (const entry of [...result.issues, ...result.diagnostics]) {
    assert.ok(!entry.message.includes('secret_scheme'));
    assert.ok(!entry.message.includes('private~segment'));
  }
  assert.ok(result.issues[0].remediation.length > 0);
});

test('OpenAPI invalid envelope metadata retains independent local requirement observations', () => {
  const result = analyzeOpenApi(document({ info: [], security: [{ absent: [] }] }));
  assert.deepEqual(compactIssues(result), [issue(SCHEME, '/security/0/absent')]);
  assert.ok(codes(result).includes('openapi/invalid-info'));
});

test('OpenAPI 3.0 requires paths even when the document declares reusable components', () => {
  const result = analyzeOpenApi({ openapi: '3.0.4', info: { title: 'Example', version: '1' }, components: {} });
  assert.deepEqual(result.issues, []);
  assert.ok(codes(result).includes('openapi/invalid-paths'));
});
