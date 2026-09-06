import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
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
  filterCapturedTrafficByToken,
  historyHash,
  normalizeCapturedTraffic,
  normalizeRawExchange,
} from '../dist/blackbox/traffic-normalizer.js';

const TARGET_ORIGIN = 'https://api.target.example';
const EXPECTED_BURP_END_OF_ITEMS = 'Reached end of items';
const CAPTURE_TOKEN = 'capture_0123456789abcdef';

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

function withCaptureToken(request, token = CAPTURE_TOKEN) {
  const separator = request.includes('\r\n') ? '\r\n' : '\n';
  const [startLine, ...rest] = request.split(separator);
  return [startLine, `X-Shannon-Capture: ${token}`, ...rest].join(separator);
}

function captured(record, token = CAPTURE_TOKEN) {
  return { ...record, request: withCaptureToken(record.request, token) };
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

  async call(name, arguments_, cancellationSignal) {
    this.calls.push({ name, arguments_, cancellationSignal });
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

test('HTTP response parser accepts an empty reason phrase after the status separator', () => {
  const response = parseHttpResponse('HTTP/1.1 200 \r\nContent-Length: 0\r\n\r\n');

  assert.equal(response.status, 200);
  assert.equal(response.reason, '');
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

test('Burp history parser recovers complete requests from truncated response envelopes', () => {
  const completeRequest = REQUEST_CRLF;
  const oversized = JSON.stringify({ request: completeRequest, response: 'response-byte'.repeat(600) });
  const truncated = `${oversized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`;
  assert.equal(truncated.length, 5000 + BURP_TRUNCATION_MARKER.length);

  assert.deepEqual(parseHistoryText(truncated), [
    { request: completeRequest, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 },
  ]);
});

test('Burp history parser accepts cuts immediately after the request and within the response delimiter', () => {
  const responseField = ',"response":"';
  const oversizedResponse = 'response-byte'.repeat(600);
  const requestForCut = (cutSuffixLength) => {
    const targetResponseFieldIndex = 5000 - cutSuffixLength;
    let request = 'GET /boundary HTTP/1.1';
    const responseFieldIndex = () => JSON.stringify({ request, response: oversizedResponse }).indexOf(responseField);
    while (responseFieldIndex() < targetResponseFieldIndex) request += 'a';
    while (responseFieldIndex() > targetResponseFieldIndex) request = request.slice(0, -1);
    assert.equal(responseFieldIndex(), targetResponseFieldIndex);
    return request;
  };

  for (let cutSuffixLength = 0; cutSuffixLength < responseField.length; cutSuffixLength += 1) {
    const request = requestForCut(cutSuffixLength);
    const serialized = JSON.stringify({ request, response: oversizedResponse });
    const truncated = `${serialized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`;
    assert.deepEqual(parseHistoryText(truncated), [
      { request, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 },
    ]);
  }

  const request = requestForCut(responseField.length - 1);
  const serialized = JSON.stringify({ request, response: oversizedResponse });
  const malformedPrefix = `${serialized.slice(0, 5000 - 1)}x`;
  assert.throws(
    () => parseHistoryText(`${malformedPrefix}${BURP_TRUNCATION_MARKER}`),
    /history line 1/i,
  );
});

test('Burp history parser recovers the stable envelope at every field boundary', () => {
  const responseField = ',"response":"';
  const notesField = ',"notes":"';
  const oversizedResponse = 'response-byte'.repeat(600);
  const requestForResponseDelimiterCut = (cutSuffixLength) => {
    const targetResponseFieldIndex = 5000 - cutSuffixLength;
    let request = 'GET /stable-envelope HTTP/1.1';
    const responseFieldIndex = () => JSON.stringify({ request, response: oversizedResponse, notes: 'notes' }).indexOf(responseField);
    while (responseFieldIndex() < targetResponseFieldIndex) request += 'a';
    while (responseFieldIndex() > targetResponseFieldIndex) request = request.slice(0, -1);
    assert.equal(responseFieldIndex(), targetResponseFieldIndex);
    return request;
  };
  for (let cutSuffixLength = 0; cutSuffixLength < responseField.length; cutSuffixLength += 1) {
    const request = requestForResponseDelimiterCut(cutSuffixLength);
    const serialized = JSON.stringify({ request, response: oversizedResponse, notes: 'notes' });
    assert.deepEqual(parseHistoryText(`${serialized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`), [
      { request, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 },
    ]);
  }

  let response = 'complete-response';
  const request = 'GET /complete-response HTTP/1.1';
  const targetNotesFieldIndex = 4982;
  const notesFieldIndex = () => JSON.stringify({ request, response, notes: 'truncated-notes'.repeat(100) }).indexOf(notesField);
  while (notesFieldIndex() < targetNotesFieldIndex) response += 'r';
  while (notesFieldIndex() > targetNotesFieldIndex) response = response.slice(0, -1);
  assert.equal(notesFieldIndex(), targetNotesFieldIndex);
  const notesEnvelope = JSON.stringify({ request, response, notes: 'truncated-notes'.repeat(100) });
  assert.deepEqual(parseHistoryText(`${notesEnvelope.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`), [
    { request, response, notes: BURP_TRUNCATION_MARKER, occurrence: 1 },
  ]);

  const malformed = notesEnvelope.slice(0, 5000).replace(',"notes":"', ',"notse":"');
  assert.throws(() => parseHistoryText(`${malformed}${BURP_TRUNCATION_MARKER}`), /history line 1/i);
});

test('Burp history parser accepts dangling JSON escapes only inside a recognized truncated string', () => {
  const alignDanglingCut = (field) => {
    let request = field === 'request' ? 'GET /dangling HTTP/1.1\\' : 'GET /dangling HTTP/1.1';
    let response = field === 'response' ? 'response\\' : 'response';
    let notes = field === 'notes' ? 'notes\\' : 'notes';
    const adjust = (value) => {
      if (field === 'request') request = value;
      else if (field === 'response') response = value;
      else notes = value;
    };
    let serialized = JSON.stringify({ request, response, notes });
    while (!(serialized[4999] === '\\' && serialized[5000] === '\\')) {
      const value = field === 'request' ? request : field === 'response' ? response : notes;
      adjust(`${value.slice(0, -1)}a\\`);
      serialized = JSON.stringify({ request, response, notes });
    }
    return { request, response, notes, serialized };
  };

  const requestCut = alignDanglingCut('request');
  assert.equal(parseHistoryText(`${requestCut.serialized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`)[0].request.endsWith(BURP_TRUNCATION_MARKER), true);

  const responseCut = alignDanglingCut('response');
  assert.deepEqual(parseHistoryText(`${responseCut.serialized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`), [
    { request: responseCut.request, response: BURP_TRUNCATION_MARKER, notes: '', occurrence: 1 },
  ]);

  const notesCut = alignDanglingCut('notes');
  assert.deepEqual(parseHistoryText(`${notesCut.serialized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`), [
    { request: notesCut.request, response: notesCut.response, notes: BURP_TRUNCATION_MARKER, occurrence: 1 },
  ]);
});

test('Burp history parser keeps truncated requests countable but excludes them from target history', async () => {
  const oversized = JSON.stringify({
    request: `GET /${'request-byte'.repeat(600)} HTTP/1.1\r\nHost: api.target.example\r\n\r\n`,
    response: RESPONSE_LF,
  });
  const truncated = `${oversized.slice(0, 5000)}${BURP_TRUNCATION_MARKER}`;
  const records = parseHistoryText(truncated);
  assert.equal(records.length, 1);
  assert.equal(records[0].request.endsWith(BURP_TRUNCATION_MARKER), true);
  assert.equal(records[0].response, BURP_TRUNCATION_MARKER);

  const client = new FakeBurpClient(() => ({ content: [{ type: 'text', text: truncated }] }));
  const snapshot = await readTargetHistory(client, TARGET_ORIGIN, {});
  assert.equal(snapshot.orderedRecords.length, 0);
});

test('Burp history parser rejects malformed marker-bearing lines and preserves valid marker values', () => {
  const validRequest = `${REQUEST_LF}${BURP_TRUNCATION_MARKER}`;
  const validResponse = `response${BURP_TRUNCATION_MARKER}`;
  const validNotes = `notes${BURP_TRUNCATION_MARKER}`;
  assert.deepEqual(parseHistoryText(JSON.stringify({ request: validRequest, response: validResponse, notes: validNotes })), [
    { request: validRequest, response: validResponse, notes: validNotes, occurrence: 1 },
  ]);

  const malformed = `${'{"request":'.padEnd(5000, 'x')}${BURP_TRUNCATION_MARKER}`;
  assert.throws(() => parseHistoryText(malformed), /history line 1/i);
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
      captured({ ...truncatedRequest, occurrence: 1 }),
      captured({ ...truncatedResponse, occurrence: 1 }),
    ]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'truncated-capture', baseRevision: 1 },
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
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
  let sdkCallOptions;
  let sdkConnectOptions;
  let sdkListOptions;
  let adapterFetchHeaders;
  const adapterFetch = async (_input, init) => {
    adapterFetchHeaders = new Headers(init?.headers);
    return new Response('', { status: 200 });
  };
  const sdkClient = {
    async connect(transport, options) {
      sdkConnectOptions = options;
      events.push(['connect', transport]);
    },
    async listTools(_params, options) {
      sdkListOptions = options;
      return {
        tools: [
          { name: 'get_proxy_http_history_regex' },
          { name: 'send_http1_request' },
          { name: 'send_http2_request' },
          { name: 'set_project_options' },
        ],
      };
    },
    async callTool(input, _schema, options) {
      sdkCallOptions = options;
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

  const controller = new AbortController();
  await client.connect(controller.signal);
  await transportInputs[0].options.fetch('data:text/plain,unused', { headers: { 'X-Test': 'kept' } });
  await client.call(
    'get_proxy_http_history_regex',
    { regex: 'target', count: 100, offset: 0 },
    controller.signal,
  );
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
  assert.equal(sdkConnectOptions.signal, controller.signal);
  assert.equal(sdkListOptions.signal, controller.signal);
  assert.equal(sdkCallOptions.signal, controller.signal);

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

test('Burp adapter reconnects once after a read-only history request times out', async () => {
  const events = [];
  let clientNumber = 0;
  const createClient = () => {
    const number = ++clientNumber;
    return {
      async connect() {
        events.push(['connect', number]);
      },
      async listTools() {
        events.push(['listTools', number]);
        return {
          tools: [
            { name: 'get_proxy_http_history_regex' },
            { name: 'send_http1_request' },
            { name: 'send_http2_request' },
          ],
        };
      },
      async callTool(input) {
        events.push(['call', number, input.name]);
        if (number === 1) {
          throw Object.assign(new Error('Request timed out'), { code: -32001 });
        }
        return { content: [{ type: 'text', text: EXPECTED_BURP_END_OF_ITEMS }] };
      },
      async close() {
        events.push(['close', number]);
      },
    };
  };
  const client = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    { createClient, createTransport: () => ({ kind: 'fake-transport' }) },
  );

  await client.connect();
  const result = await client.call('get_proxy_http_history_regex', { regex: 'capture-token', count: 100, offset: 0 });
  await client.close();

  assert.equal(extractMcpText(result), EXPECTED_BURP_END_OF_ITEMS);
  assert.deepEqual(events, [
    ['connect', 1],
    ['listTools', 1],
    ['call', 1, 'get_proxy_http_history_regex'],
    ['close', 1],
    ['connect', 2],
    ['listTools', 2],
    ['call', 2, 'get_proxy_http_history_regex'],
    ['close', 2],
  ]);
});

test('Burp adapter retries connection setup once when tool discovery times out', async () => {
  const events = [];
  let clientNumber = 0;
  const createClient = () => {
    const number = ++clientNumber;
    return {
      async connect() {
        events.push(['connect', number]);
      },
      async listTools() {
        events.push(['listTools', number]);
        if (number === 1) {
          throw Object.assign(new Error('Request timed out'), { code: -32001 });
        }
        return {
          tools: [
            { name: 'get_proxy_http_history_regex' },
            { name: 'send_http1_request' },
            { name: 'send_http2_request' },
          ],
        };
      },
      async callTool() {
        return { content: [{ type: 'text', text: EXPECTED_BURP_END_OF_ITEMS }] };
      },
      async close() {
        events.push(['close', number]);
      },
    };
  };
  const client = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    { createClient, createTransport: () => ({ kind: 'fake-transport' }) },
  );

  await client.connect();
  await client.close();

  assert.deepEqual(events, [
    ['connect', 1],
    ['listTools', 1],
    ['close', 1],
    ['connect', 2],
    ['listTools', 2],
    ['close', 2],
  ]);
});

test('Burp adapter does not retry a timed-out state-changing request', async () => {
  let createdClients = 0;
  let closeCalls = 0;
  const sdkClient = {
    async connect() {},
    async listTools() {
      return {
        tools: [
          { name: 'get_proxy_http_history_regex' },
          { name: 'send_http1_request' },
          { name: 'send_http2_request' },
        ],
      };
    },
    async callTool() {
      throw Object.assign(new Error('Request timed out'), { code: -32001 });
    },
    async close() {
      closeCalls += 1;
    },
  };
  const client = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    {
      createClient: () => {
        createdClients += 1;
        return sdkClient;
      },
      createTransport: () => ({ kind: 'fake-transport' }),
    },
  );

  await client.connect();
  await assert.rejects(client.call('send_http1_request', { content: 'GET / HTTP/1.1\r\n\r\n' }), {
    code: -32001,
  });
  await client.close();

  assert.equal(createdClients, 1);
  assert.equal(closeCalls, 1);
});

test('host override reaches a real HTTP server for SSE GET and JSON POST', async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ method: request.method, host: request.headers.host, body: Buffer.concat(chunks).toString('utf8') });

    if (request.method === 'GET') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end('data: ready\n\n');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end('{}');
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const scopedFetch = createHostHeaderFetch(`configured.test:${port}`);

  const sseResponse = await scopedFetch(`http://127.0.0.1:${port}/sse`);
  assert.equal(sseResponse.status, 200);
  assert.equal(await sseResponse.text(), 'data: ready\n\n');

  const postResponse = await scopedFetch(`http://127.0.0.1:${port}/rpc`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0"}',
  });
  assert.equal(postResponse.status, 200);
  assert.equal(await postResponse.text(), '{}');

  assert.deepEqual(requests, [
    { method: 'GET', host: `configured.test:${port}`, body: '' },
    { method: 'POST', host: `configured.test:${port}`, body: '{"jsonrpc":"2.0"}' },
  ]);
});

test('native host fetch follows redirects while preserving configured Host and fetch semantics', async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ method: request.method, path: request.url, host: request.headers.host, body: Buffer.concat(chunks).toString('utf8') });

    if (request.url === '/sse') {
      response.writeHead(301, { location: '/sse-final' });
      response.end();
      return;
    }
    if (request.url === '/sse-final') {
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      response.end('data: ready\n\n');
      return;
    }
    if (request.url === '/rpc') {
      response.writeHead(307, { location: '/rpc-final' });
      response.end();
      return;
    }
    if (request.url === '/rpc-final') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{}');
      return;
    }
    if (request.url === '/rpc-rewrite') {
      response.writeHead(303, { location: '/rpc-get' });
      response.end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ method: request.method, body: Buffer.concat(chunks).toString('utf8') }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const baseUrl = `http://127.0.0.1:${port}`;
  const configuredHost = `configured.test:${port}`;
  const scopedFetch = createHostHeaderFetch(configuredHost);

  const sseResponse = await scopedFetch(`${baseUrl}/sse`, { redirect: 'follow' });
  assert.equal(sseResponse.status, 200);
  assert.equal(sseResponse.url, `${baseUrl}/sse-final`);
  assert.equal(sseResponse.redirected, true);
  assert.equal(await sseResponse.text(), 'data: ready\n\n');

  const postResponse = await scopedFetch(`${baseUrl}/rpc`, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0"}',
  });
  assert.equal(postResponse.status, 200);
  assert.equal(postResponse.url, `${baseUrl}/rpc-final`);
  assert.equal(postResponse.redirected, true);
  assert.equal(await postResponse.text(), '{}');

  const rewrittenResponse = await scopedFetch(`${baseUrl}/rpc-rewrite`, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'content-type': 'application/json' },
    body: '{"jsonrpc":"2.0"}',
  });
  assert.equal(rewrittenResponse.status, 200);
  assert.equal(rewrittenResponse.url, `${baseUrl}/rpc-get`);
  assert.equal(rewrittenResponse.redirected, true);
  assert.deepEqual(JSON.parse(await rewrittenResponse.text()), { method: 'GET', body: '' });

  assert.deepEqual(requests, [
    { method: 'GET', path: '/sse', host: configuredHost, body: '' },
    { method: 'GET', path: '/sse-final', host: configuredHost, body: '' },
    { method: 'POST', path: '/rpc', host: configuredHost, body: '{"jsonrpc":"2.0"}' },
    { method: 'POST', path: '/rpc-final', host: configuredHost, body: '{"jsonrpc":"2.0"}' },
    { method: 'POST', path: '/rpc-rewrite', host: configuredHost, body: '{"jsonrpc":"2.0"}' },
    { method: 'GET', path: '/rpc-get', host: configuredHost, body: '' },
  ]);
});

test('native host fetch exposes null Response bodies for null-body statuses and HEAD', async (t) => {
  const server = createServer((request, response) => {
    if (request.url === '/no-content') response.writeHead(204).end();
    else if (request.url === '/reset-content') response.writeHead(205).end();
    else if (request.url === '/not-modified') response.writeHead(304).end();
    else response.writeHead(200).end();
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const scopedFetch = createHostHeaderFetch(`configured.test:${address.port}`);
  for (const path of ['/no-content', '/reset-content', '/not-modified']) {
    const response = await scopedFetch(`${baseUrl}${path}`);
    assert.equal(response.body, null, `${path} must expose a null body`);
    assert.equal(await response.text(), '');
  }
  const headResponse = await scopedFetch(`${baseUrl}/head`, { method: 'HEAD' });
  assert.equal(headResponse.body, null, 'HEAD must expose a null body');
  assert.equal(await headResponse.text(), '');
});

test('native host fetch aborts a request while buffering its body', async (t) => {
  const server = createServer((_request, response) => response.writeHead(500).end());
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  t.after(() => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  let bodyCancelled = false;
  const body = new ReadableStream({
    start() {},
    cancel() {
      bodyCancelled = true;
    },
  });
  const controller = new AbortController();
  const scopedFetch = createHostHeaderFetch(`configured.test:${address.port}`);
  const pending = scopedFetch(`http://127.0.0.1:${address.port}/slow`, {
    method: 'POST',
    body,
    duplex: 'half',
    signal: controller.signal,
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  controller.abort();
  await assert.rejects(
    Promise.race([
      pending,
      new Promise((_, reject) => setTimeout(() => reject(new Error('body buffering ignored cancellation')), 100)),
    ]),
    (error) => error?.name === 'AbortError',
  );
  assert.equal(bodyCancelled, true);
});

test('Burp adapter aborts and closes a client stuck establishing the SSE transport', async () => {
  let markConnectStarted;
  const connectStarted = new Promise((resolve) => { markConnectStarted = resolve; });
  let closeCalls = 0;
  const sdkClient = {
    async connect() {
      markConnectStarted();
      await new Promise(() => {});
    },
    async listTools() {
      throw new Error('listTools must not run after cancellation');
    },
    async callTool() {
      throw new Error('callTool must not run after cancellation');
    },
    async close() {
      closeCalls += 1;
    },
  };
  const client = new BurpMcpClient(
    { url: 'http://host.docker.internal:9876', hostHeader: '127.0.0.1:9876' },
    { createClient: () => sdkClient, createTransport: () => ({ kind: 'stuck-transport' }) },
  );
  const controller = new AbortController();

  const connecting = client.connect(controller.signal);
  await connectStarted;
  controller.abort();
  const bounded = Promise.race([
    connecting,
    new Promise((_, reject) => setTimeout(() => reject(new Error('connect ignored cancellation')), 100)),
  ]);

  await assert.rejects(bounded, (error) => error?.name === 'AbortError');
  assert.equal(closeCalls, 1);
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

test('capture-token history reads request only the current activity corpus', async () => {
  const activityToken = 'Capture_0123456789ABCDEF';
  const unrelated = Array.from({ length: 100 }, (_, index) =>
    payload(REQUEST_LF, RESPONSE_LF, `unrelated-${index}`),
  );
  const current = [
    captured(payload(REQUEST_LF, RESPONSE_LF, 'current-1'), activityToken),
    captured(payload(REQUEST_LF, RESPONSE_LF, 'current-2'), activityToken),
  ];
  const caseVariant = captured(payload(REQUEST_LF, RESPONSE_LF, 'case-variant'), activityToken.toLowerCase());
  const corpus = [...unrelated, ...current, caseVariant];
  const client = new FakeBurpClient((_name, { regex, count, offset }) => {
    const javascriptPattern = regex
      .replace(/^\(\?m\)/, '')
      .replace(/\(\?i:([^)]*)\)/g, '(?:$1)');
    const expression = new RegExp(javascriptPattern, 'm');
    const page = corpus.filter(({ request }) => expression.test(request)).slice(offset, offset + count);
    return mcpResult(page);
  });

  const snapshot = await readTargetHistory(client, TARGET_ORIGIN, {}, undefined, [activityToken]);

  assert.deepEqual(snapshot.orderedRecords.map(({ notes }) => notes), ['current-1', 'current-2']);
  assert.equal(client.calls.length, 1);
  assert.match(client.calls[0].arguments_.regex, /X-Shannon-Capture/i);
});

test('legacy history cancellation remains the fourth argument', async () => {
  const controller = new AbortController();
  const client = new FakeBurpClient(() => mcpResult([]));

  await readTargetHistory(client, TARGET_ORIGIN, {}, controller.signal);

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].cancellationSignal, controller.signal);
});

test('an explicit empty capture-token set avoids a broad history query', async () => {
  const client = new FakeBurpClient(() => {
    throw new Error('Burp history must not be queried without a current capture token');
  });

  const snapshot = await readTargetHistory(client, TARGET_ORIGIN, {}, undefined, []);

  assert.deepEqual(snapshot, { orderedRecords: [], occurrenceCounts: {} });
  assert.deepEqual(client.calls, []);
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

test('capture ownership filtering is exact, strips its reserved header, and never returns the token', () => {
  const reflectedResponse = [
    'HTTP/1.1 200 OK',
    `X-Reflected-Capture: ${CAPTURE_TOKEN}`,
    '',
    `reflected=${CAPTURE_TOKEN}`,
  ].join('\r\n');
  const matching = captured({ ...payload(REQUEST_LF, reflectedResponse, 'matching'), occurrence: 1 });
  const wrong = captured({ ...payload(REQUEST_LF, RESPONSE_LF, 'wrong'), occurrence: 2 }, `${CAPTURE_TOKEN}-wrong`);
  const absent = { ...payload(REQUEST_LF, RESPONSE_LF, 'absent'), occurrence: 3 };
  const duplicate = {
    ...matching,
    request: withCaptureToken(matching.request),
    occurrence: 4,
  };

  const selected = filterCapturedTrafficByToken([wrong, absent, duplicate, matching], CAPTURE_TOKEN);

  assert.equal(selected.length, 1);
  assert.equal(selected[0].notes, 'matching');
  assert.equal(selected[0].request, REQUEST_LF);
  assert.equal(selected[0].response.includes('x'.repeat(CAPTURE_TOKEN.length)), true);
  assert.equal(JSON.stringify(selected).includes(CAPTURE_TOKEN), false);
  assert.equal(matching.request.includes(CAPTURE_TOKEN), true, 'the pure filter must not mutate its input');
  const allXToken = 'x'.repeat(16);
  const [allXSelected] = filterCapturedTrafficByToken(
    [captured({ ...payload(REQUEST_LF, RESPONSE_LF, allXToken), occurrence: 1 }, allXToken)],
    allXToken,
  );
  assert.equal(JSON.stringify(allXSelected).includes(allXToken), false);
  assert.throws(() => filterCapturedTrafficByToken([matching], ''), /capture token/i);
});

test('normalization persists exact raw evidence and exposes stable route metadata', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-'));
  const secondRoot = await mkdtemp(path.join(tmpdir(), 'shannon-burp-repeat-'));
  t.after(() => Promise.all([rm(root, { recursive: true, force: true }), rm(secondRoot, { recursive: true, force: true })]));
  const before = snapshotHistory([]);
  const unrelated = { ...payload('GET /unrelated HTTP/1.1\r\nHost: api.target.example\r\n\r\n', RESPONSE_LF, 'other-run'), occurrence: 1 };
  const wrongRun = captured({ ...unrelated, occurrence: 2 }, `${CAPTURE_TOKEN}-other-run`);
  const after = snapshotHistory([
    unrelated,
    wrongRun,
    captured({ ...payload(REQUEST_CRLF, RESPONSE_CRLF, 'captured'), occurrence: 1 }),
  ]);
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
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
  };

  const exchanges = await normalizeCapturedTraffic(input);
  assert.equal(exchanges.length, 1);
  const exchange = exchanges[0];
  assert.equal(exchange.identity, 'attacker');
  assert.equal(exchange.captureSequence, 1);
  assert.equal(exchange.method, 'POST');
  assert.equal(exchange.origin, TARGET_ORIGIN);
  assert.equal(exchange.path, '/api/users/{id}');
  assert.deepEqual(exchange.queryKeys, ['csrf_token', 'expand']);
  assert.equal(
    exchange.bodyShape,
    'json:{access_token:string,csrf_token:string,name:string,object_id:string,password:string}',
  );
  assert.deepEqual(exchange.candidateObjectReferences, ['42']);
  assert.equal(exchange.rawRecordRef, `raw:${exchange.exchangeId}`);
  assert.deepEqual(exchange.provenance, provenance);
  assert.ok(exchange.responseFingerprint.length <= 72);

  const expectedHistoryHash = sha256(`${REQUEST_CRLF}\0${RESPONSE_CRLF}`);
  assert.equal(
    exchange.exchangeId,
    `ex_${sha256(`capture-attacker\0attacker\0${1}\0${expectedHistoryHash}`).slice(0, 24)}`,
  );
  assert.equal(
    exchange.routeSignature,
    `route_${sha256(
      `${exchange.method}\0${exchange.origin}\0${exchange.path}\0expand\0json:{name:string,object_id:string}`,
    ).slice(0, 24)}`,
  );

  // The projection is a route shape, so it carries field names and never the message text itself.
  assert.equal(JSON.stringify(exchanges).toLowerCase().includes('http/1.1'), false);

  const rawPath = path.join(input.rawDirectory, `${exchange.exchangeId}.json`);
  assert.deepEqual(JSON.parse(await readFile(rawPath, 'utf8')), {
    ...payload(REQUEST_CRLF, RESPONSE_CRLF, 'captured'),
    occurrence: 1,
  });

  const repeated = await normalizeCapturedTraffic({
    ...input,
    rawDirectory: path.join(secondRoot, '.shannon', 'blackbox', 'raw'),
  });
  assert.deepEqual(repeated, exchanges);

  const freshVerification = await normalizeCapturedTraffic({
    ...input,
    rawDirectory: path.join(secondRoot, '.shannon', 'blackbox', 'verification-raw'),
    provenance: { actor: 'blackbox-verifier', taskId: 'verify-candidate', baseRevision: 9 },
    captureSequenceOffset: 9,
  });
  assert.notEqual(freshVerification[0].exchangeId, exchange.exchangeId);
  assert.equal(freshVerification[0].captureSequence, 10);

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
    // Differs only in the capture ordinal, so it is the same exchange observed twice.
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
      captured({ ...foreign, occurrence: 1 }),
      captured({ ...allowed, occurrence: 1 }),
      captured({ ...hostMismatch, occurrence: 1 }),
      captured({ ...avoided, occurrence: 1 }),
    ]),
    rawDirectory,
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'scope-capture', baseRevision: 1 },
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
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
    captured({ ...a, occurrence: 1 }),
    captured({ ...b, occurrence: 1 }),
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
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
  });

  assert.deepEqual(exchanges.map(({ captureSequence }) => captureSequence), [1, 2]);
  assert.deepEqual(
    exchanges.map(({ exchangeId }, index) => exchangeId),
    [a, b].map(
      (record, index) =>
        `ex_${sha256(`delta-capture\0attacker\0${index + 1}\0${historyHash(record)}`).slice(0, 24)}`,
    ),
  );
});

test('normalization records dynamic secret names and secret-bearing media types verbatim', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-secrets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const configuredSecret = 'configured-secret';
  const request = [
    'POST /api/items?state=query-state&nonce=query-nonce&authenticity_id=777 HTTP/1.1',
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
      authenticity_id: '888',
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
    after: snapshotHistory([captured({ ...payload(request, response), occurrence: 1 })]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [configuredSecret],
    provenance: { actor: 'blackbox-recon', taskId: 'secret-capture', baseRevision: 1 },
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
  });

  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].requestContentType, `application/${configuredSecret}`);
  assert.equal(exchanges[0].responseContentType, `application/${configuredSecret}`);
  assert.deepEqual(exchanges[0].queryKeys, ['authenticity_id', 'nonce', 'state']);
  assert.equal(
    exchanges[0].bodyShape,
    'json:{authenticity_id:string,key:string,nonce:string,object_id:string,pass:string,' +
      'privateKey:string,private_key:string,session:{object_id:string},state:string}',
  );
  // Credential-shaped values stay out of the object references the compiler builds attacks from.
  assert.deepEqual(exchanges[0].candidateObjectReferences, ['42']);
});

test('normalization names declared opaque carriers but never treats them as resource references', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-burp-identity-fields-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const request = [
    'POST /api/items?subject_id=42&view=full HTTP/1.1',
    'Host: api.target.example',
    'Content-Type: application/json',
    '',
    JSON.stringify({ identity: { opaque_id: '99' }, object_ids: ['123', '456'], resource_id: '100' }),
  ].join('\r\n');
  const reflectedResponse = RESPONSE_CRLF.replace(
    '\r\n\r\n',
    `\r\nX-Capture-Echo: ${CAPTURE_TOKEN}\r\n\r\n`,
  );
  const exchanges = await normalizeCapturedTraffic({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    before: snapshotHistory([]),
    after: snapshotHistory([captured({ ...payload(request, reflectedResponse), occurrence: 1 })]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'identity-field-capture', baseRevision: 1 },
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [
      { location: 'query', name: 'subject_id' },
      { location: 'json', pointer: '/identity/opaque_id' },
      { location: 'json', pointer: '/object_ids/0' },
    ],
  });

  assert.equal(exchanges.length, 1);
  assert.deepEqual(exchanges[0].queryKeys, ['subject_id', 'view']);
  assert.equal(exchanges[0].bodyShape, 'json:{identity:{opaque_id:string},object_ids:[string],resource_id:string}');
  assert.deepEqual(exchanges[0].candidateObjectReferences, ['100', '456']);
  const persisted = await readFile(path.join(root, 'raw', `${exchanges[0].exchangeId}.json`), 'utf8');
  assert.equal(persisted.includes(CAPTURE_TOKEN), false);
  assert.equal(persisted.includes('X-Shannon-Capture'), false);
  assert.doesNotThrow(() => JSON.parse(persisted));
  assert.equal(persisted.includes('x'.repeat(CAPTURE_TOKEN.length)), true);
  assert.equal(
    exchanges[0].responseFingerprint,
    `sha256:${sha256(reflectedResponse.replaceAll(CAPTURE_TOKEN, 'x'.repeat(CAPTURE_TOKEN.length)))}`,
  );
});

test('normalization exposes mutable workflow field names without exposing their values', () => {
  const exchange = normalizeRawExchange({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    raw: {
      request: [
        'POST /api/reset?state=enabled&page_token=page-secret&reset_token=reset-secret HTTP/1.1',
        'Host: api.target.example',
        'Content-Type: application/json',
        '',
        JSON.stringify({ new_password: 'new-password-secret' }),
      ].join('\r\n'),
      response: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}',
      notes: '',
      occurrence: 1,
    },
    captureSequence: 1,
    configuredSecrets: ['page-secret', 'reset-secret', 'new-password-secret'],
    identityBoundRequestFields: [],
    provenance: { actor: 'blackbox-recon', taskId: 'workflow-field-capture', baseRevision: 1 },
  });

  assert.deepEqual(exchange.queryKeys, ['page_token', 'reset_token', 'state']);
  assert.match(exchange.bodyShape, /new_password:string/);
  assert.equal(JSON.stringify(exchange).includes('page-secret'), false);
  assert.equal(JSON.stringify(exchange).includes('reset-secret'), false);
  assert.equal(JSON.stringify(exchange).includes('new-password-secret'), false);
});

test('normalization groups only response-grounded sibling slugs', () => {
  const normalize = (slug, captureSequence, body = JSON.stringify({ slug })) =>
    normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: 'attacker',
      raw: {
        request: `GET /api/profiles/${slug} HTTP/1.1\r\nHost: api.target.example\r\n\r\n`,
        response: `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n${body}`,
        notes: '',
        occurrence: 1,
      },
      captureSequence,
      configuredSecrets: [],
      identityBoundRequestFields: [],
      provenance: { actor: 'blackbox-recon', taskId: 'slug-capture', baseRevision: 1 },
    });

  const alice = normalize('alice', 1);
  const bob = normalize('bob', 2);
  const active = normalize('active', 3, '{}');
  assert.equal(alice.path, '/api/profiles/alice');
  assert.equal(bob.path, '/api/profiles/bob');
  assert.equal(alice.routeSignature, bob.routeSignature);
  assert.notEqual(alice.routeSignature, active.routeSignature);
});

test('route signatures omit actor-only query, form, and JSON identity carriers', () => {
  const normalize = (request, captureSequence) =>
    normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: captureSequence === 1 ? 'victim' : 'attacker',
      raw: {
        request,
        response: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}',
        notes: '',
        occurrence: 1,
      },
      captureSequence,
      configuredSecrets: [],
      identityBoundRequestFields: [{ location: 'json', pointer: '/identity/opaque' }],
      provenance: { actor: 'blackbox-recon', taskId: 'carrier-capture', baseRevision: 1 },
    });

  const pairs = [
    [
      'GET /api/items?keep=1 HTTP/1.1\r\nHost: api.target.example\r\n\r\n',
      'GET /api/items?keep=1&access_token=actor HTTP/1.1\r\nHost: api.target.example\r\n\r\n',
    ],
    [
      'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/x-www-form-urlencoded\r\n\r\nkeep=1',
      'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/x-www-form-urlencoded\r\n\r\nkeep=1&csrf_token=actor',
    ],
    [
      'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"keep":true,"identity":{}}',
      'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"keep":true,"identity":{"opaque":"actor"}}',
    ],
  ];

  for (const [source, actor] of pairs) {
    assert.equal(normalize(source, 1).routeSignature, normalize(actor, 2).routeSignature);
  }
  assert.notEqual(
    normalize('POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{}', 1)
      .routeSignature,
    normalize(
      'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"items":[]}',
      2,
    ).routeSignature,
  );
});

test('route signatures preserve order and multiplicity around numeric JSON carriers', () => {
  const normalize = (items, captureSequence) =>
    normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: captureSequence === 1 ? 'victim' : 'attacker',
      raw: {
        request: `POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ items })}`,
        response: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}',
        notes: '',
        occurrence: 1,
      },
      captureSequence,
      configuredSecrets: [],
      identityBoundRequestFields: [{ location: 'json', pointer: '/items/0/id' }],
      provenance: { actor: 'blackbox-recon', taskId: 'ordered-array-capture', baseRevision: 1 },
    });

  const source = [
    { id: 'victim-item', kind: 'alpha', label: 'primary' },
    { id: 'other-item', kind: 'beta' },
    { id: 'other-item-2', kind: 'beta' },
  ];
  const reordered = [source[1], source[0], source[2]];
  const duplicateRemoved = [source[0], source[1]];

  assert.notEqual(normalize(source, 1).routeSignature, normalize(reordered, 2).routeSignature);
  assert.notEqual(normalize(source, 1).routeSignature, normalize(duplicateRemoved, 3).routeSignature);
});

test('response candidates ignore request selector paths but exclude reflected carrier values', () => {
  const normalize = (responseId, captureSequence) =>
    normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: 'attacker',
      raw: {
        request: 'POST /api/items HTTP/1.1\r\nHost: api.target.example\r\nContent-Type: application/json\r\n\r\n{"id":"opaque-request-id"}',
        response: `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"${responseId}"}`,
        notes: '',
        occurrence: 1,
      },
      captureSequence,
      configuredSecrets: [],
      identityBoundRequestFields: [{ location: 'json', pointer: '/id' }],
      provenance: { actor: 'blackbox-recon', taskId: 'response-candidate-capture', baseRevision: 1 },
    });

  assert.deepEqual(normalize('resource-123', 1).candidateObjectReferences, ['resource-123']);
  assert.deepEqual(normalize('opaque-request-id', 2).candidateObjectReferences, []);

  const businessState = normalizeRawExchange({
    targetOrigin: TARGET_ORIGIN,
    rules: {},
    identity: 'attacker',
    raw: {
      request: 'GET /api/items?state=resource-123 HTTP/1.1\r\nHost: api.target.example\r\n\r\n',
      response: 'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"resource-123"}',
      notes: '',
      occurrence: 1,
    },
    captureSequence: 3,
    configuredSecrets: [],
    identityBoundRequestFields: [],
    provenance: { actor: 'blackbox-recon', taskId: 'response-candidate-capture', baseRevision: 1 },
  });
  assert.deepEqual(businessState.candidateObjectReferences, ['resource-123']);

  for (const [header, reflected] of [['Cookie: sid=short-cookie', 'short-cookie'], ['Authorization: Bearer short-bearer', 'short-bearer']]) {
    const protectedReflection = normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: 'attacker',
      raw: {
        request: `GET /api/items HTTP/1.1\r\nHost: api.target.example\r\n${header}\r\n\r\n`,
        response: `HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{"id":"${reflected}"}`,
        notes: '',
        occurrence: 1,
      },
      captureSequence: 4,
      configuredSecrets: [],
      identityBoundRequestFields: [],
      provenance: { actor: 'blackbox-recon', taskId: 'response-candidate-capture', baseRevision: 1 },
    });
    assert.deepEqual(protectedReflection.candidateObjectReferences, []);
  }
});

test('capture-token redaction preserves HTTP body framing', () => {
  const request = [
    'POST /echo HTTP/1.1',
    'Host: api.target.example',
    `Content-Length: ${CAPTURE_TOKEN.length}`,
    'Content-Type: text/plain',
    '',
    CAPTURE_TOKEN,
  ].join('\r\n');
  const [selected] = filterCapturedTrafficByToken([captured({ ...payload(request), occurrence: 1 })], CAPTURE_TOKEN);
  const parsed = parseHttpRequest(selected.request);

  assert.equal(parsed.body.includes(CAPTURE_TOKEN), false);
  assert.equal(Number(getHeaderValues(parsed.headers, 'content-length')[0]), Buffer.byteLength(parsed.body));
  assert.notEqual(
    normalizeRawExchange({
      targetOrigin: TARGET_ORIGIN,
      rules: {},
      identity: 'anonymous',
      raw: selected,
      captureSequence: 1,
      configuredSecrets: [],
      identityBoundRequestFields: [],
      provenance: { actor: 'blackbox-recon', taskId: 'framing-capture', baseRevision: 1 },
    }),
    null,
  );
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
    after: snapshotHistory([captured(raw)]),
    rawDirectory: path.join(root, 'raw'),
    configuredSecrets: [],
    provenance: { actor: 'blackbox-recon', taskId: 'no-response-capture', baseRevision: 1 },
    captureToken: CAPTURE_TOKEN,
    identityBoundRequestFields: [],
  });

  assert.equal(exchanges.length, 1);
  assert.equal(exchanges[0].responseStatus, 0);
  assert.equal(exchanges[0].responseContentType, null);
  assert.deepEqual(JSON.parse(await readFile(path.join(root, 'raw', `${exchanges[0].exchangeId}.json`), 'utf8')), raw);
});
