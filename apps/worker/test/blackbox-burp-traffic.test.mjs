import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  BURP_END_OF_ITEMS,
  BURP_TRUNCATION_MARKER,
  BurpMcpClient,
  createHostHeaderFetch,
  extractMcpText,
  parseHistoryText,
  readTargetHistory,
  snapshotHistory,
} from '../dist/blackbox/burp-client.js';
import { getHeaderValues, parseHttpRequest, parseHttpResponse } from '../dist/blackbox/http-message.js';
import { assertRequestInScope, requestMatchesScope } from '../dist/blackbox/scope-guard.js';
import {
  collapseExchanges,
  diffHistory,
  historyHash,
  normalizeCapturedTraffic,
} from '../dist/blackbox/traffic-normalizer.js';

const TARGET_ORIGIN = 'https://api.target.example';
const EXPECTED_BURP_END_OF_ITEMS = 'Reached end of items';

const REQUEST_CRLF = [
  'POST /api/users/42?expand=roles&csrf_token=query-secret HTTP/1.1',
  'Host: api.target.example',
  'X-Trace: alpha',
  'X-Trace: beta',
  'Cookie: session=cookie-secret',
  'Authorization: Bearer bearer-secret',
  'Proxy-Authorization: Basic proxy-secret',
  'Content-Type: application/json; charset=utf-8',
  '',
  JSON.stringify({
    password: 'password-secret',
    access_token: 'body-token',
    csrf_token: 'csrf-secret',
    object_id: '42',
    name: 'Ada',
  }),
].join('\r\n');

const RESPONSE_CRLF = [
  'HTTP/1.1 200 OK',
  'Content-Type: application/json',
  'Set-Cookie: session=response-cookie-secret',
  'Set-Cookie: csrf=response-csrf-secret',
  '',
  JSON.stringify({ id: '42', name: 'Ada' }),
].join('\r\n');

const REQUEST_LF = ['GET /health HTTP/1.1', 'Host: api.target.example', 'X-Trace: one', 'X-Trace: two', '', ''].join(
  '\n',
);
const RESPONSE_LF = ['HTTP/1.1 204 No Content', 'Content-Length: 0', '', ''].join('\n');

function payload(request = REQUEST_LF, response = RESPONSE_LF, notes = '') {
  return { request, response, notes };
}

function mcpResult(records, includeFooter = true) {
  const lines = records.map((record) => JSON.stringify(record));
  if (includeFooter) lines.push(EXPECTED_BURP_END_OF_ITEMS);
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: false };
}

class FakeBurpClient {
  constructor(handler) {
    this.handler = handler;
    this.calls = [];
  }

  async connect() {}

  async call(name, arguments_) {
    this.calls.push({ name, arguments_ });
    return this.handler(name, arguments_);
  }

  async close() {}
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

test('HTTP parser preserves start lines, duplicate headers, and empty CRLF/LF bodies', () => {
  const request = parseHttpRequest(REQUEST_CRLF);
  assert.equal(request.method, 'POST');
  assert.equal(request.target, '/api/users/42?expand=roles&csrf_token=query-secret');
  assert.equal(request.version, '1.1');
  assert.deepEqual(getHeaderValues(request.headers, 'x-trace'), ['alpha', 'beta']);
  assert.match(request.body, /"object_id":"42"/);

  const response = parseHttpResponse(RESPONSE_CRLF);
  assert.equal(response.status, 200);
  assert.equal(response.reason, 'OK');
  assert.deepEqual(getHeaderValues(response.headers, 'set-cookie'), [
    'session=response-cookie-secret',
    'csrf=response-csrf-secret',
  ]);

  assert.equal(parseHttpRequest(REQUEST_LF).body, '');
  assert.equal(parseHttpResponse(RESPONSE_LF).body, '');
});

test('Burp history parser accepts only JSON records, blanks, and the exact footer', () => {
  assert.equal(BURP_END_OF_ITEMS, EXPECTED_BURP_END_OF_ITEMS);
  const text = `\n${JSON.stringify(payload())}\n${JSON.stringify(payload(REQUEST_CRLF, RESPONSE_CRLF, 'second'))}\n${EXPECTED_BURP_END_OF_ITEMS}`;
  const records = parseHistoryText(text);
  assert.equal(records.length, 2);
  assert.deepEqual(records.map(({ occurrence }) => occurrence), [1, 1]);

  assert.throws(() => parseHistoryText('{broken'), /history line 1/i);
  assert.throws(() => parseHistoryText('end of items'), /history line 1/i);
  assert.throws(() => parseHistoryText(`${EXPECTED_BURP_END_OF_ITEMS} `), /history line 1/i);
  assert.throws(() => parseHistoryText(JSON.stringify({ response: RESPONSE_LF })), /request/i);
});

test('Burp history parser preserves missing-message placeholders and accepts nullable notes', async () => {
  const noRequest = { request: '<no request>', response: '<no response>', notes: null };
  const noResponse = { request: REQUEST_LF, response: '<no response>', notes: null };
  const records = parseHistoryText(mcpResult([noRequest, noResponse]).content[0].text);

  assert.deepEqual(records, [
    { request: '<no request>', response: '<no response>', notes: '', occurrence: 1 },
    { request: REQUEST_LF, response: '<no response>', notes: '', occurrence: 1 },
  ]);

  const client = new FakeBurpClient(() => mcpResult([noRequest, noResponse]));
  const snapshot = await readTargetHistory(client, TARGET_ORIGIN, {});
  assert.equal(snapshot.orderedRecords.length, 1, 'an unparseable request placeholder must not abort the page');
  assert.equal(snapshot.orderedRecords[0].response, '<no response>');
});

test('traffic capture excludes truncated requests without treating truncated responses as proof', async (t) => {
  assert.equal(BURP_TRUNCATION_MARKER, '... (truncated)');
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-truncated-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const truncatedRequest = payload(
    `POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"id":"42"${BURP_TRUNCATION_MARKER}`,
    RESPONSE_CRLF,
  );
  const truncatedResponse = payload(
    'GET /api/items/42 HTTP/1.1\r\nHost: api.target.example\r\n\r\n',
    `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"42"${BURP_TRUNCATION_MARKER}`,
  );
  const client = new FakeBurpClient(() => mcpResult([truncatedRequest, truncatedResponse]));
  const snapshot = await readTargetHistory(client, TARGET_ORIGIN, {});
  assert.equal(snapshot.orderedRecords.length, 1);
  assert.equal(snapshot.orderedRecords[0].request, truncatedResponse.request);

  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before: snapshotHistory([]),
    after: snapshotHistory([
      { ...truncatedRequest, occurrence: 1 },
      { ...truncatedResponse, occurrence: 1 },
    ]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'truncated-capture', baseRevision: 1 },
  });
  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].responseStatus, 0);
  assert.equal(exchanges[0].responseContentType, null);
  assert.equal(exchanges[0].responseFingerprint, `sha256:${sha256('<no response>')}`);
  assert.deepEqual(await readdir(path.join(root, 'raw')), [`${exchanges[0].exchangeId}.json`]);
  assert.deepEqual(
    JSON.parse(await readFile(path.join(root, 'raw', `${exchanges[0].exchangeId}.json`), 'utf8')),
    snapshot.orderedRecords[0],
  );
});

test('MCP result extraction accepts text only and rejects errors or mixed content', () => {
  assert.equal(
    extractMcpText({ content: [{ type: 'text', text: 'one' }, { type: 'text', text: 'two' }] }),
    'one\ntwo',
  );
  assert.throws(() => extractMcpText({ isError: true, content: [{ type: 'text', text: 'sensitive error' }] }), /failed/i);
  assert.throws(
    () => extractMcpText({ content: [{ type: 'text', text: 'one' }, { type: 'image', data: 'abc' }] }),
    /non-text/i,
  );
  assert.throws(() => extractMcpText({ content: [] }), /text content/i);
});

test('production Burp adapter verifies tools, restricts calls, and sets the MCP Host header', async () => {
  const events = [];
  const transportInputs = [];
  let adapterFetchHeaders;
  const adapterFetch = async (_input, init) => {
    adapterFetchHeaders = new Headers(init?.headers);
    return new Response('', { status: 200 });
  };
  const sdkClient = {
    async connect(transport) {
      events.push(['connect', transport]);
    },
    async listTools() {
      return {
        tools: [
          { name: 'get_proxy_http_history_regex' },
          { name: 'send_http1_request' },
          { name: 'send_http2_request' },
          { name: 'set_project_options' },
        ],
      };
    },
    async callTool(input) {
      events.push(['call', input]);
      return { content: [{ type: 'text', text: EXPECTED_BURP_END_OF_ITEMS }] };
    },
    async close() {
      events.push(['close']);
    },
  };
  const transport = { kind: 'fake-transport' };
  const client = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    {
      createClient: () => sdkClient,
      createTransport: (url, options) => {
        transportInputs.push({ url, options });
        return transport;
      },
      fetch: adapterFetch,
    },
  );

  await client.connect();
  await transportInputs[0].options.fetch('data:text/plain,unused', { headers: { 'X-Test': 'kept' } });
  await client.call('get_proxy_http_history_regex', { regex: 'target', count: 100, offset: 0 });
  await assert.rejects(client.call('get_proxy_http_history', {}), /not allowed/i);
  await client.close();
  assert.deepEqual(events, [
    ['connect', transport],
    [
      'call',
      {
        name: 'get_proxy_http_history_regex',
        arguments: { regex: 'target', count: 100, offset: 0 },
      },
    ],
    ['close'],
  ]);
  assert.equal(transportInputs[0].url.href, 'http://host.docker.internal:9876/');
  assert.equal(adapterFetchHeaders.get('host'), '127.0.0.1:9876');
  assert.equal(adapterFetchHeaders.get('x-test'), 'kept');

  const missingSdkClient = {
    ...sdkClient,
    async listTools() {
      return { tools: [{ name: 'get_proxy_http_history_regex' }, { name: 'send_http1_request' }] };
    },
  };
  const missing = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    { createClient: () => missingSdkClient, createTransport: () => transport },
  );
  await assert.rejects(missing.connect(), /send_http2_request/);

  let forwardedHeaders;
  const scopedFetch = createHostHeaderFetch('127.0.0.1:9876', async (_input, init) => {
    forwardedHeaders = new Headers(init?.headers);
    return new Response('', { status: 200 });
  });
  await scopedFetch('http://host.docker.internal:9876', { headers: { 'X-Test': 'kept' } });
  assert.equal(forwardedHeaders.get('host'), '127.0.0.1:9876');
  assert.equal(forwardedHeaders.get('x-test'), 'kept');
});

test('history pagination uses only escaped target-host regex pages and exact-origin records', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => payload(REQUEST_LF, RESPONSE_LF, `item-${index}`));
  const secondPage = [payload(REQUEST_LF, RESPONSE_LF, 'item-100'), payload(REQUEST_LF, RESPONSE_LF, 'item-101')];
  const client = new FakeBurpClient((_name, { offset }) =>
    offset === 0 ? mcpResult(firstPage, false) : mcpResult(secondPage),
  );

  const snapshot = await readTargetHistory(client, `${TARGET_ORIGIN}/`, {});
  assert.equal(snapshot.orderedRecords.length, 102);
  assert.deepEqual(
    client.calls.map(({ name, arguments_ }) => ({ name, ...arguments_ })),
    [
      { name: 'get_proxy_http_history_regex', regex: 'api\\.target\\.example', count: 100, offset: 0 },
      { name: 'get_proxy_http_history_regex', regex: 'api\\.target\\.example', count: 100, offset: 100 },
    ],
  );

  const originForm = payload('GET /one HTTP/1.1\r\nHost: api.target.example\r\n\r\n');
  const absoluteForm = payload('GET https://api.target.example/two HTTP/1.1\r\nHost: api.target.example\r\n\r\n');
  const foreign = payload('GET https://other.example/three HTTP/1.1\r\nHost: other.example\r\n\r\n');
  const hostMismatch = payload('GET https://api.target.example/four HTTP/1.1\r\nHost: other.example\r\n\r\n');
  const mixed = new FakeBurpClient(() => mcpResult([originForm, absoluteForm, foreign, hostMismatch]));
  const filtered = await readTargetHistory(mixed, TARGET_ORIGIN, {});
  assert.equal(filtered.orderedRecords.length, 2);
});

test('scope rules use avoid precedence and OR-within/AND-across focus groups', () => {
  const request = parseHttpRequest(
    'GET /api/resource?object_id=42 HTTP/1.1\r\nHost: api.target.example\r\nX-Tenant: alpha\r\n\r\n',
  );
  const focus = [
    { type: 'url_path', value: '/other' },
    { type: 'url_path', value: '/api/*' },
    { type: 'method', value: 'POST' },
    { type: 'method', value: 'GET' },
    { type: 'domain', value: 'target.example' },
    { type: 'subdomain', value: 'api' },
    { type: 'header', value: 'X-Tenant' },
    { type: 'parameter', value: 'object_id' },
  ];
  assert.equal(requestMatchesScope(request, TARGET_ORIGIN, { focus }), true);
  assert.equal(
    requestMatchesScope(parseHttpRequest(REQUEST_LF), TARGET_ORIGIN, { focus }),
    false,
    'every represented focus rule type must match',
  );
  assert.equal(
    requestMatchesScope(request, TARGET_ORIGIN, {
      focus,
      avoid: [{ type: 'url_path', value: '/api/resource' }],
    }),
    false,
  );
  assert.throws(
    () => assertRequestInScope(request, TARGET_ORIGIN, { focus: [{ type: 'code_path', value: 'src/**' }] }),
    /code_path/i,
  );

  const onlyMismatch = [
    [{ type: 'url_path', value: '/admin' }],
    [{ type: 'method', value: 'POST' }],
    [{ type: 'domain', value: 'other.example' }],
    [{ type: 'subdomain', value: 'www' }],
    [{ type: 'header', value: 'X-Missing' }],
    [{ type: 'parameter', value: 'missing' }],
  ];
  for (const mismatchedGroup of onlyMismatch) {
    const type = mismatchedGroup[0].type;
    const isolated = focus.map((rule) => (rule.type === type ? mismatchedGroup[0] : rule));
    assert.equal(requestMatchesScope(request, TARGET_ORIGIN, { focus: isolated }), false, `${type} must be enforced`);
  }

  const literalMetacharacter = parseHttpRequest(
    'GET /api.v1/resource HTTP/1.1\r\nHost: api.target.example\r\n\r\n',
  );
  const regexLookalike = parseHttpRequest('GET /apixv1/resource HTTP/1.1\r\nHost: api.target.example\r\n\r\n');
  const broadPrefix = parseHttpRequest('GET /api2/resource HTTP/1.1\r\nHost: api.target.example\r\n\r\n');
  assert.equal(
    requestMatchesScope(literalMetacharacter, TARGET_ORIGIN, { focus: [{ type: 'url_path', value: '/api.v1/*' }] }),
    true,
  );
  assert.equal(
    requestMatchesScope(regexLookalike, TARGET_ORIGIN, { focus: [{ type: 'url_path', value: '/api.v1/*' }] }),
    false,
  );
  assert.equal(
    requestMatchesScope(broadPrefix, TARGET_ORIGIN, { focus: [{ type: 'url_path', value: '/api' }] }),
    false,
  );
});

test('parameter scope inspects nested JSON and multipart bodies and fails closed when malformed', () => {
  const nestedJson = parseHttpRequest(
    [
      'POST /api/resource HTTP/1.1',
      'Host: api.target.example',
      'Content-Type: application/problem+json',
      '',
      JSON.stringify({ wrapper: { user_id: '42' } }),
    ].join('\r\n'),
  );
  const multipart = parseHttpRequest(
    [
      'POST /api/resource HTTP/1.1',
      'Host: api.target.example',
      'Content-Type: multipart/form-data; boundary=scope-boundary',
      '',
      '--scope-boundary',
      'Content-Disposition: form-data; name="user_id"',
      '',
      '42',
      '--scope-boundary--',
      '',
    ].join('\r\n'),
  );
  const malformedJson = parseHttpRequest(
    'POST /api/resource HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"user_id":',
  );
  const avoidUserId = { avoid: [{ type: 'parameter', value: 'user_id' }] };

  assert.equal(requestMatchesScope(nestedJson, TARGET_ORIGIN, avoidUserId), false);
  assert.equal(
    requestMatchesScope(nestedJson, TARGET_ORIGIN, { focus: [{ type: 'parameter', value: 'user_id' }] }),
    true,
  );
  assert.equal(requestMatchesScope(multipart, TARGET_ORIGIN, avoidUserId), false);
  assert.equal(requestMatchesScope(malformedJson, TARGET_ORIGIN, avoidUserId), false);
});

test('history diff is a multiset and attributes repeated identical requests', () => {
  const a = payload(REQUEST_LF, RESPONSE_LF, 'a');
  const b = payload('GET /other HTTP/1.1\r\nHost: api.target.example\r\n\r\n', RESPONSE_LF, 'b');
  const before = snapshotHistory([{ ...a, occurrence: 99 }]);
  const after = snapshotHistory([
    { ...a, occurrence: 99 },
    { ...a, occurrence: 99 },
    { ...b, occurrence: 99 },
  ]);

  const delta = diffHistory(before, after);
  assert.equal(delta.length, 2);
  assert.equal(delta[0].occurrence, 2);
  assert.equal(delta[1].occurrence, 1);
  assert.equal(after.occurrenceCounts[historyHash(a)], 2);
});

test('normalization persists exact raw evidence and exposes stable redacted metadata only', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-'));
  const secondRoot = await mkdtemp(path.join(tmpdir(), 'shannon-burp-repeat-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(secondRoot, { recursive: true, force: true })]));
  const before = snapshotHistory([]);
  const after = snapshotHistory([{ ...payload(REQUEST_CRLF, RESPONSE_CRLF, 'captured'), occurrence: 1 }]);
  const configuredSecrets = [
    'query-secret',
    'cookie-secret',
    'bearer-secret',
    'proxy-secret',
    'password-secret',
    'body-token',
    'csrf-secret',
    'response-cookie-secret',
    'response-csrf-secret',
  ];
  const provenance = { actor: 'blackbox-recon', taskId: 'capture-attacker', baseRevision: 7 };
  const input = {
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before,
    after,
    rawDirectory: path.join(root, '.shannon', 'blackbox', 'raw'),
    configuredSecrets,
    provenance,
  };

  const exchanges = await normalizeCapturedTraffic(input);
  assert.equal(exchanges.length, 1);
  const exchange = exchanges[0];
  assert.equal(exchange.identity, 'attacker');
  assert.equal(exchange.captureSequence, 1);
  assert.equal(exchange.method, 'POST');
  assert.equal(exchange.origin, TARGET_ORIGIN);
  assert.equal(exchange.path, '/api/users/{id}');
  assert.deepEqual(exchange.queryKeys, ['<redacted>', 'expand']);
  assert.deepEqual(exchange.candidateObjectReferences, ['42']);
  assert.equal(exchange.rawRecordRef, `raw:${exchange.exchangeId}`);
  assert.deepEqual(exchange.provenance, provenance);
  assert.ok(exchange.responseFingerprint.length <= 72);

  const expectedHistoryHash = sha256(`${REQUEST_CRLF}\0${RESPONSE_CRLF}`);
  assert.equal(exchange.exchangeId, `ex_${sha256(`attacker\0${1}\0${expectedHistoryHash}`).slice(0, 24)}`);
  assert.equal(
    exchange.routeSignature,
    `route_${sha256(
      `${exchange.method}\0${exchange.origin}\0${exchange.path}\0${exchange.queryKeys.join(',')}\0${exchange.bodyShape}`,
    ).slice(0, 24)}`,
  );

  const serialized = JSON.stringify(exchanges).toLowerCase();
  for (const forbidden of [
    ...configuredSecrets,
    'cookie',
    'set-cookie',
    'authorization',
    'password',
    'access_token',
    'csrf_token',
  ]) {
    assert.equal(serialized.includes(forbidden.toLowerCase()), false, `normalized output leaked ${forbidden}`);
  }
  assert.equal(serialized.includes('http/1.1'), false);

  const rawPath = path.join(input.rawDirectory, `${exchange.exchangeId}.json`);
  assert.deepEqual(JSON.parse(await readFile(rawPath, 'utf8')), after.orderedRecords[0]);

  const repeated = await normalizeCapturedTraffic({
    ...input,
    rawDirectory: path.join(secondRoot, '.shannon', 'blackbox', 'raw'),
  });
  assert.deepEqual(repeated, exchanges);

  const variants = [
    exchange,
    structuredClone(exchange),
    { ...exchange, exchangeId: 'ex_method', method: 'PUT' },
    { ...exchange, exchangeId: 'ex_path', path: '/api/users/{id}/roles' },
    { ...exchange, exchangeId: 'ex_query', queryKeys: ['expand', 'view'] },
    { ...exchange, exchangeId: 'ex_body', bodyShape: 'json:{object_id:number}' },
    { ...exchange, exchangeId: 'ex_request_type', requestContentType: 'application/problem+json' },
    { ...exchange, exchangeId: 'ex_status', responseStatus: 201 },
    { ...exchange, exchangeId: 'ex_response_type', responseContentType: 'text/plain' },
    { ...exchange, exchangeId: 'ex_fingerprint', responseFingerprint: 'sha256:different' },
    { ...exchange, exchangeId: 'ex_identity', identity: 'victim' },
    { ...exchange, exchangeId: 'ex_order', captureSequence: 2 },
  ];
  assert.deepEqual(
    collapseExchanges(variants).map(({ exchangeId }) => exchangeId),
    [
      exchange.exchangeId,
      'ex_method',
      'ex_path',
      'ex_query',
      'ex_body',
      'ex_request_type',
      'ex_status',
      'ex_response_type',
      'ex_fingerprint',
      'ex_identity',
      'ex_order',
    ],
  );
});

test('normalization filters scope before persistence and sequences only the attributed delta', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-scope-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const rawDirectory = path.join(root, 'raw');
  const allowed = payload(
    'GET /api/resource?object_id=42 HTTP/1.1\r\nHost: api.target.example\r\nX-Tenant: alpha\r\n\r\n',
  );
  const foreign = payload(
    'GET https://other.example/api/resource?object_id=43 HTTP/1.1\r\nHost: other.example\r\nX-Tenant: alpha\r\n\r\n',
  );
  const hostMismatch = payload(
    'GET https://api.target.example/api/resource?object_id=44 HTTP/1.1\r\nHost: other.example\r\nX-Tenant: alpha\r\n\r\n',
  );
  const avoided = payload(
    'GET /api/private?object_id=45 HTTP/1.1\r\nHost: api.target.example\r\nX-Tenant: alpha\r\n\r\n',
  );
  const rules = {
    focus: [
      { type: 'url_path', value: '/api/*' },
      { type: 'method', value: 'GET' },
      { type: 'domain', value: 'target.example' },
      { type: 'subdomain', value: 'api' },
      { type: 'header', value: 'X-Tenant' },
      { type: 'parameter', value: 'object_id' },
    ],
    avoid: [{ type: 'url_path', value: '/api/private' }],
  };

  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules,
    identity: 'attacker',
    before: snapshotHistory([]),
    after: snapshotHistory([
      { ...foreign, occurrence: 1 },
      { ...allowed, occurrence: 1 },
      { ...hostMismatch, occurrence: 1 },
      { ...avoided, occurrence: 1 },
    ]),
    rawDirectory,
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'scope-capture', baseRevision: 1 },
  });

  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].captureSequence, 1);
  assert.deepEqual(await readdir(rawDirectory), [`${exchanges[0].exchangeId}.json`]);
  assert.equal(JSON.parse(await readFile(path.join(rawDirectory, `${exchanges[0].exchangeId}.json`), 'utf8')).request, allowed.request);
});

test('normalization assigns IDs from delta-relative order after multiset subtraction', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-delta-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const a = payload(REQUEST_LF, RESPONSE_LF, 'a');
  const b = payload('GET /other HTTP/1.1\r\nHost: api.target.example\r\n\r\n', RESPONSE_LF, 'b');
  const before = snapshotHistory([{ ...a, occurrence: 1 }]);
  const after = snapshotHistory([
    { ...a, occurrence: 1 },
    { ...a, occurrence: 2 },
    { ...b, occurrence: 1 },
  ]);

  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before,
    after,
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'delta-capture', baseRevision: 1 },
  });

  assert.deepEqual(exchanges.map(({ captureSequence }) => captureSequence), [1, 2]);
  assert.deepEqual(
    exchanges.map(({ exchangeId }, index) => exchangeId),
    [a, b].map((record, index) => `ex_${sha256(`attacker\0${index + 1}\0${historyHash(record)}`).slice(0, 24)}`),
  );
});

test('normalization redacts dynamic secret names and secret-bearing media types', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-secrets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configuredSecret = 'configured-secret';
  const request = [
    'POST /api/items?state=query-state&nonce=query-nonce HTTP/1.1',
    'Host: api.target.example',
    `Content-Type: application/${configuredSecret}`,
    '',
    JSON.stringify({
      key: 'short-opaque-secret',
      private_key: 'private-key-value',
      privateKey: 'camel-private-key-value',
      pass: 'short-password',
      state: 'body-state',
      nonce: 'body-nonce',
      session: { object_id: 'nested-secret-reference' },
      object_id: '42',
    }),
  ].join('\r\n');
  const response = [
    'HTTP/1.1 200 OK',
    `Content-Type: application/${configuredSecret}`,
    '',
    '{}',
  ].join('\r\n');
  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before: snapshotHistory([]),
    after: snapshotHistory([{ ...payload(request, response), occurrence: 1 }]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [configuredSecret],
    provenance: { actor: 'blackbox-recon', taskId: 'secret-capture', baseRevision: 1 },
  });

  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].requestContentType, null);
  assert.equal(exchanges[0].responseContentType, null);
  assert.deepEqual(exchanges[0].candidateObjectReferences, ['42']);
  const serialized = JSON.stringify(exchanges).toLowerCase();
  for (const forbidden of [
    configuredSecret,
    'private_key',
    'privatekey',
    'pass',
    'state',
    'nonce',
    'private-key-value',
    'camel-private-key-value',
    'short-password',
    'query-state',
    'query-nonce',
    'body-state',
    'body-nonce',
    'short-opaque-secret',
    'nested-secret-reference',
  ]) {
    assert.equal(serialized.includes(forbidden), false, `normalized output leaked ${forbidden}`);
  }
});

test('normalization retains request evidence when Burp has no response', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-no-response-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const raw = { request: REQUEST_LF, response: '<no response>', notes: '', occurrence: 1 };
  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before: snapshotHistory([]),
    after: snapshotHistory([raw]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'no-response-capture', baseRevision: 1 },
  });

  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].responseStatus, 0);
  assert.equal(exchanges[0].responseContentType, null);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'raw', `${exchanges[0].exchangeId}.json`), 'utf8')), raw);
});
