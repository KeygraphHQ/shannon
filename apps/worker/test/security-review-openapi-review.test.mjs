import assert from 'node:assert/strict';
import test from 'node:test';

// Independent review regressions, authored separately from the OpenAPI rules.
const { analyzeOpenApi } = await import(
  process.env.SECURITY_REVIEW_OPENAPI_MODULE ?? '../dist/security-review/openapi.js'
);
const info = { title: 'Independent review example', version: '1' };

// https://spec.openapis.org/oas/v3.1.1.html#openapi-object
// https://spec.openapis.org/oas/v3.1.1.html#info-object
test('a version marker alone is not a supported OpenAPI document', () => {
  const result = analyzeOpenApi({ openapi: '3.1.1' });
  assert.deepEqual(result.issues, []);
  assert.ok(result.diagnostics.length > 0, 'missing document envelope must remain incomplete');
});

test('the required OpenAPI info object cannot silently be missing or malformed', () => {
  for (const openapi of ['3.0.4', '3.1.1']) {
    for (const info of [null, [], {}, { title: 'Example' }, { title: 1, version: '1' }, { title: 'Example', version: 1 }]) {
      const result = analyzeOpenApi({ openapi, info, paths: {} });
      assert.deepEqual(result.issues, []);
      assert.ok(result.diagnostics.length > 0, `${openapi}: malformed info must remain incomplete`);
    }
    assert.ok(analyzeOpenApi({ openapi, paths: {} }).diagnostics.length > 0);
  }
});

// https://spec.openapis.org/oas/v3.1.1.html#openapi-description
test('OpenAPI 3.1 requires description content but permits a components-only document', () => {
  assert.ok(analyzeOpenApi({ openapi: '3.1.1', info }).diagnostics.length > 0);
  for (const content of [{ paths: {} }, { components: {} }, { webhooks: {} }]) {
    assert.deepEqual(analyzeOpenApi({ openapi: '3.1.1', info, ...content }), { issues: [], diagnostics: [] });
  }
});

test('a shared local Path Item reports its one declaration once', () => {
  const result = analyzeOpenApi({
    openapi: '3.1.1', info,
    paths: { '/one': { $ref: '#/components/pathItems/common' }, '/two': { $ref: '#/components/pathItems/common' } },
    components: { pathItems: { common: { get: { security: [{ absent: [] }], responses: { 200: { description: 'OK' } } } } } },
  });
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => [ruleId, pointer]), [
    ['openapi/undeclared-security-scheme', '/components/pathItems/common/get/security/0/absent'],
  ]);
  assert.deepEqual(result.diagnostics, []);
});

test('an unresolved alias does not suppress an independent absent requirement declaration', () => {
  const result = analyzeOpenApi({
    openapi: '3.1.1', info, paths: {},
    components: { securitySchemes: { alias: { $ref: '#/components/securitySchemes/alias' } } },
    security: [{ alias: [] }, { absent: [] }],
  });
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => [ruleId, pointer]), [
    ['openapi/undeclared-security-scheme', '/security/1/absent'],
  ]);
  assert.ok(result.diagnostics.length > 0);
});

test('an empty supported OAuth flow set has no locally available required scope', () => {
  const result = analyzeOpenApi({
    openapi: '3.1.1', info, paths: {},
    components: { securitySchemes: { oauth: { type: 'oauth2', flows: {} } } },
    security: [{ oauth: ['read'] }],
  });
  assert.deepEqual(result.issues.map(({ ruleId, pointer }) => [ruleId, pointer]), [
    ['openapi/undeclared-oauth-scope', '/security/0/oauth/0'],
  ]);
  assert.deepEqual(result.diagnostics, []);
});
