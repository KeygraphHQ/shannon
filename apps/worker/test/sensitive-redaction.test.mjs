import assert from 'node:assert/strict';
import test from 'node:test';

import { redactPortableTokens, redactSensitive } from '../dist/ai/sensitive-redaction.js';

const POLICY = { sensitiveValues: [], redactAuthenticationSyntax: true };
const PORTABLE_POLICY = { sensitiveValues: [], redactAuthenticationSyntax: true, redactPortableTokens: true };
const LEAK = 'leaked-value-1';

// Every alternative the key list accepts, in the casings a real transcript produces.
const CREDENTIAL_KEYS = [
  'authorization',
  'Proxy-Authorization',
  'cookie',
  'Set-Cookie',
  'password',
  'passwd',
  'pwd',
  'secret',
  'credential',
  'nonce',
  'api_key',
  'apikey',
  'api-key',
  'access_token',
  'accesstoken',
  'refresh_token',
  'csrf',
  'csrf_token',
  'xsrf',
  'xsrf-token',
  'session',
  'sessionid',
  'session_id',
  'x-auth',
  'x_auth',
  'X-Auth-Token',
  'token',
];

// Names that only read as a credential in a key position, never in prose.
const KEY_POSITION_ONLY_KEYS = ['key', 'state'];

function redact(value, policy = POLICY) {
  return redactSensitive(value, policy);
}

test('redacts the value of every quoted credential key in a JSON body', () => {
  for (const key of [...CREDENTIAL_KEYS, ...KEY_POSITION_ONLY_KEYS]) {
    const body = `{"${key}":"${LEAK}"}`;
    assert.equal(redact(body), `{"${key}":"<redacted>"}`, `${key} leaked from a quoted JSON key`);
  }
});

test('redacts quoted credential keys across serialization shapes', () => {
  assert.equal(
    redact('{"access_token":"eyJhbGciOiJIUzI1NiJ9.payload.signature","token_type":"Bearer"}'),
    '{"access_token":"<redacted>","token_type":"Bearer"}',
  );
  assert.equal(redact('{"authorization":"Bearer abc 123"}'), '{"authorization":"<redacted>"}');
  assert.equal(redact('{"set-cookie":"session=abc123; Path=/"}'), '{"set-cookie":"<redacted>"}');
  assert.equal(redact('{ "csrf_token" : "ctok" , "id": 7 }'), '{ "csrf_token" : "<redacted>" , "id": 7 }');
  assert.equal(redact("{'api_key': 'abc123'}"), '{\'api_key\': "<redacted>"}');
  assert.equal(redact('{"password":"a\\"b","user":"bob"}'), '{"password":"<redacted>","user":"bob"}');
  assert.equal(redact('{"api_key": 12345}'), '{"api_key": "<redacted>"}');
});

test('redacts the value of every bare credential key in a transcript', () => {
  for (const key of CREDENTIAL_KEYS) {
    assert.equal(redact(`${key}=${LEAK}`), `${key}=<redacted>`, `${key} leaked from a bare assignment`);
  }
  assert.equal(redact('access_token=plain'), 'access_token=<redacted>');
  assert.equal(redact('token=abc123&next=/home'), 'token=<redacted>&next=/home');
  assert.equal(redact('sessionid=deadbeef; Path=/'), 'sessionid=<redacted>; Path=/');
});

test('keeps redacting credential-bearing headers', () => {
  assert.equal(redact('Cookie: sid=1; other=2'), 'Cookie: sid=<redacted>; other=<redacted>');
  assert.equal(redact('set-cookie: a=1; b=2'), 'set-cookie: a=<redacted>; b=<redacted>');
  assert.equal(redact('Authorization: Bearer abc123').includes('abc123'), false);
});

test('leaves ordinary prose untouched so impact statements survive redaction', () => {
  const prose = [
    'Attacker reads a victim-owned record, causing loss of confidentiality for the victim record.',
    'changes the order state: shipped for another tenant',
    'returns the primary key: 42 for another tenant',
    'the request bypasses Basic authentication entirely',
    'no secret here at all',
    '{"note":"no secret here"}',
  ];
  for (const value of prose) {
    assert.equal(redact(value), value, `redaction rewrote ordinary prose: ${value}`);
  }
});

test('redacts a whole subtree under a sensitive key whatever its JSON type', () => {
  assert.deepEqual(redact({ api_key: 12345 }), { api_key: '<redacted>' });
  assert.deepEqual(redact({ authorization: ['Bearer x'] }), { authorization: '<redacted>' });
  assert.deepEqual(redact({ cookie: { a: 'b' } }), { cookie: '<redacted>' });
  assert.deepEqual(redact({ secret: null }), { secret: '<redacted>' });
  assert.deepEqual(redact({ state: false }), { state: '<redacted>' });
  assert.deepEqual(redact({ token: 7, note: 'kept' }), { token: '<redacted>', note: 'kept' });
});

test('a sensitive key does not consume a shared object from the circular tracker', () => {
  const shared = { note: 'plain text' };
  assert.deepEqual(redact({ secret: shared, visible: shared }), {
    secret: '<redacted>',
    visible: { note: 'plain text' },
  });
});

test('still reports genuine circular references', () => {
  const circular = { note: 'plain text' };
  circular.self = circular;
  assert.deepEqual(redact(circular), { note: 'plain text', self: '<circular>' });
});

test('strips portable credentials only when the policy asks for it', () => {
  const bearer = 'transcript Bearer abcdefgh12345678 rest';
  const jwt = 'raw eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-value-here rest';

  assert.equal(redact(bearer), bearer);
  assert.equal(redact(jwt), jwt);
  assert.equal(redact(bearer, PORTABLE_POLICY), 'transcript Bearer <redacted> rest');
  assert.equal(redact(jwt, PORTABLE_POLICY), 'raw <redacted> rest');
});

test('redactPortableTokens rewrites scheme-prefixed and JWT-shaped credentials', () => {
  assert.equal(redactPortableTokens('curl -H "Bearer abcdefgh12345678"'), 'curl -H "Bearer <redacted>"');
  assert.equal(redactPortableTokens('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig-value-here'), '<redacted>');
  assert.equal(redactPortableTokens('plain transcript line'), 'plain transcript line');
});

test('configured secret values are still replaced everywhere they appear', () => {
  const policy = { sensitiveValues: ['victim-private-marker'], redactAuthenticationSyntax: true };
  assert.equal(
    redactSensitive('found victim-private-marker in the body', policy),
    'found <redacted> in the body',
  );
});
