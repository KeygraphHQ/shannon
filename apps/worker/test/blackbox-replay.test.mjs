import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { parseHttpRequest } from '../dist/blackbox/http-message.js';
import { FileIdentityStateResolver } from '../dist/blackbox/identity-state.js';
import { FileReplayRawStore, ReplayService } from '../dist/blackbox/replay-service.js';

const TARGET_ORIGIN = 'https://api.target.example:8443';
const PROVENANCE = { actor: 'blackbox-action', taskId: 'action-task', baseRevision: 3 };
const CONFIGURED_SECRETS = [
  'victim-cookie',
  'victim-bearer',
  'victim-proxy',
  'victim-header-csrf',
  'victim-query-csrf',
  'victim-body-csrf',
  'victim-request-token',
  'attacker-cookie',
  'attacker-bearer',
  'attacker-header-csrf',
  'attacker-query-csrf',
  'attacker-body-csrf',
  'attacker-request-token',
];

const SOURCE_REQUEST = [
  'PATCH /api/users/100?view=full&csrf_token=victim-query-csrf HTTP/1.1',
  'Host: api.target.example:8443',
  'Cookie: session=victim-cookie',
  'Authorization: Bearer victim-bearer',
  'Proxy-Authorization: Basic victim-proxy',
  'X-CSRF-Token: victim-header-csrf',
  'X-Request-Token: victim-request-token',
  'X-Keep: keep-header',
  'Content-Type: application/json',
  'Content-Length: 128',
  '',
  JSON.stringify({
    object_id: '100',
    csrf_token: 'victim-body-csrf',
    keep: 'unchanged',
    nested: { name: 'Ada' },
  }),
].join('\r\n');

const ACTOR_REQUEST = [
  'PATCH /api/users/999?view=full&csrf_token=attacker-query-csrf HTTP/1.1',
  'Host: api.target.example:8443',
  'Cookie: stale=do-not-copy',
  'Authorization: Bearer attacker-bearer',
  'X-CSRF-Token: attacker-header-csrf',
  'X-Request-Token: attacker-request-token',
  'X-Keep: actor-header',
  'Content-Type: application/json',
  '',
  JSON.stringify({
    object_id: '999',
    csrf_token: 'attacker-body-csrf',
    keep: 'actor-value',
    nested: { name: 'Mallory' },
  }),
].join('\r\n');

const BASELINE_RESPONSE = [
  'HTTP/1.1 200 OK',
  'Content-Type: application/json',
  '',
  JSON.stringify({ object_id: '100', owner: 'victim', marker: 'victim-private-marker' }),
].join('\r\n');

function response(body, status = 200, headers = []) {
  return [`HTTP/1.1 ${status} ${status === 200 ? 'OK' : 'Result'}`, 'Content-Type: application/json', ...headers, '', body].join(
    '\r\n',
  );
}

function mcpResponse(rawResponse) {
  return { content: [{ type: 'text', text: rawResponse }], isError: false };
}

function raw(request, responseText = BASELINE_RESPONSE) {
  return { request, response: responseText, notes: '', occurrence: 1 };
}

function exchange(exchangeId, identity, routeSignature = 'route_users', overrides = {}) {
  return {
    exchangeId,
    routeSignature,
    identity,
    captureSequence: 1,
    method: 'PATCH',
    origin: TARGET_ORIGIN,
    path: '/api/users/{id}',
    queryKeys: ['<redacted>', 'view'],
    bodyShape: 'json:{<redacted>:redacted,keep:string,nested:{name:string},object_id:string}',
    requestContentType: 'application/json',
    responseStatus: 200,
    responseContentType: 'application/json',
    responseFingerprint: `sha256:baseline-${exchangeId}`,
    candidateObjectReferences: ['100'],
    rawRecordRef: `raw:${exchangeId}`,
    provenance: { actor: 'blackbox-recon', taskId: 'capture', baseRevision: 1 },
    ...overrides,
  };
}

function replayCommand(actionId = 'act_auth', overrides = {}) {
  return {
    actionId,
    steps: [
      {
        stepId: 'step_auth',
        sourceExchangeId: 'ex_source',
        actor: 'attacker',
        mutations: [
          { type: 'set_path', path: '/api/users/200' },
          { type: 'set_query', name: 'view', value: 'private' },
          { type: 'set_json_pointer', pointer: '/object_id', value: '200' },
        ],
      },
    ],
    proofCondition: { type: 'body_contains', marker: 'victim-private-marker' },
    ...overrides,
  };
}

class FakeBurpClient {
  constructor(results = []) {
    this.results = [...results];
    this.calls = [];
  }

  async connect() {}

  async call(name, arguments_, cancellationSignal) {
    this.calls.push({ name, arguments_, cancellationSignal });
    const next = this.results.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('No queued Burp result');
    if (typeof next === 'function') return next(cancellationSignal);
    return typeof next === 'string' ? mcpResponse(next) : next;
  }

  async close() {}
}

class FakeRawStore {
  constructor(records = new Map()) {
    this.records = new Map(records);
    this.actions = new Map();
    this.rawWrites = [];
    this.actionWrites = [];
  }

  async readExchange(exchangeId) {
    return structuredClone(this.records.get(exchangeId) ?? null);
  }

  async writeExchange(exchangeId, record) {
    this.rawWrites.push({ exchangeId, record: structuredClone(record) });
    this.records.set(exchangeId, structuredClone(record));
  }

  async readAction(actionId) {
    return structuredClone(this.actions.get(actionId) ?? null);
  }

  async writeAction(record) {
    this.actionWrites.push(structuredClone(record));
    this.actions.set(record.actionId, structuredClone(record));
  }
}

class FailOnceRawStore extends FakeRawStore {
  constructor(records, { exchange = false, action = false } = {}) {
    super(records);
    this.failExchangeWrite = exchange;
    this.failActionWrite = action;
  }

  async writeExchange(exchangeId, record) {
    if (this.failExchangeWrite) {
      this.failExchangeWrite = false;
      throw new Error('transient exchange persistence failure');
    }
    return super.writeExchange(exchangeId, record);
  }

  async writeAction(record) {
    if (this.failActionWrite) {
      this.failActionWrite = false;
      throw new Error('transient action persistence failure');
    }
    return super.writeAction(record);
  }
}

class FakeIdentityStateResolver {
  constructor() {
    this.identities = new Set(['attacker', 'victim', 'operator']);
    this.cookies = new Map([
      ['attacker', 'session=attacker-cookie'],
      ['victim', 'session=victim-cookie'],
      ['operator', 'session=operator-cookie'],
    ]);
    this.latest = new Map([
      ['attacker\0route_users', 'ex_attacker_latest'],
      ['victim\0route_users', 'ex_source'],
    ]);
    this.calls = [];
  }

  isKnownIdentity(identity) {
    return this.identities.has(identity);
  }

  async getCookieHeader(identity, target) {
    this.calls.push({ type: 'cookies', identity, target: target.href });
    return this.cookies.get(identity) ?? null;
  }

  async getLatestExchangeId(identity, routeSignature) {
    this.calls.push({ type: 'latest', identity, routeSignature });
    return this.latest.get(`${identity}\0${routeSignature}`) ?? null;
  }
}

function harness({
  burpResults,
  rules = {},
  exchanges,
  records,
  rawStore: injectedRawStore,
  identityState,
  configuredSecrets,
  cancellationSignal,
} = {}) {
  const catalog =
    exchanges ??
    [
      exchange('ex_source', 'victim'),
      exchange('ex_attacker_latest', 'attacker', 'route_users', {
        captureSequence: 9,
        candidateObjectReferences: ['200'],
      }),
    ];
  const rawStore =
    injectedRawStore ??
    new FakeRawStore(
      records ??
        new Map([
          ['ex_source', raw(SOURCE_REQUEST)],
          [
            'ex_attacker_latest',
            raw(
              ACTOR_REQUEST,
              response(JSON.stringify({ object_id: '200', owner: 'attacker', marker: 'attacker-private-marker' })),
            ),
          ],
        ]),
    );
  const client = new FakeBurpClient(
    burpResults ?? [response(JSON.stringify({ object_id: '200', marker: 'victim-private-marker' }))],
  );
  const resolver = identityState ?? new FakeIdentityStateResolver();
  const service = new ReplayService({
    targetOrigin: TARGET_ORIGIN,
    rules,
    configuredSecrets: configuredSecrets ?? CONFIGURED_SECRETS,
    exchanges: catalog,
    client,
    rawStore,
    identityState: resolver,
    provenance: PROVENANCE,
    cancellationSignal,
  });
  return { service, client, rawStore, identityState: resolver };
}

test('file identity resolver contains paths and selects current target cookies and latest route capture', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-identity-state-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const identityDir = path.join(root, '.shannon', 'blackbox', 'identities', 'attacker');
  await mkdir(identityDir, { recursive: true });
  await writeFile(
    path.join(identityDir, 'storage-state.json'),
    JSON.stringify({
      cookies: [
        { name: 'valid', value: 'yes', domain: 'api.target.example', path: '/api', expires: 2_000, secure: true },
        { name: 'expired', value: 'no', domain: 'api.target.example', path: '/', expires: 900, secure: true },
        { name: 'foreign', value: 'no', domain: '.other.example', path: '/', expires: 2_000, secure: true },
        { name: 'host_only_parent', value: 'no', domain: 'target.example', path: '/', expires: 2_000, secure: true },
        { name: 'wrong_path', value: 'no', domain: 'api.target.example', path: '/admin', expires: 2_000, secure: true },
        { name: 'session', value: 'ok', domain: '.target.example', path: '/', expires: -1, secure: true },
      ],
      origins: [],
    }),
    'utf8',
  );
  const resolver = new FileIdentityStateResolver({ targetRoot: root, identities: ['attacker'], now: () => 1_000_000 });
  await resolver.writeCaptureIndex('attacker', [
    { exchangeId: 'ex_old', routeSignature: 'route_users', captureSequence: 1 },
    { exchangeId: 'ex_latest', routeSignature: 'route_users', captureSequence: 4 },
    { exchangeId: 'ex_other', routeSignature: 'route_other', captureSequence: 10 },
  ]);

  assert.equal(
    await resolver.getCookieHeader('attacker', new URL('https://api.target.example:8443/api/users/1')),
    'valid=yes; session=ok',
  );
  assert.equal(await resolver.getLatestExchangeId('attacker', 'route_users'), 'ex_latest');
  assert.equal(
    JSON.parse(await readFile(path.join(identityDir, 'capture-index.json'), 'utf8')).identity,
    'attacker',
  );
  assert.equal(resolver.isKnownIdentity('attacker'), true);
  assert.equal(resolver.isKnownIdentity('../victim'), false);
  await assert.rejects(resolver.getCookieHeader('../victim', new URL(TARGET_ORIGIN)), /unknown|identity/i);
  assert.throws(
    () => new FileIdentityStateResolver({ targetRoot: root, identities: ['../escape'] }),
    /identity/i,
  );
});

test('identity-bound replay strips victim state, substitutes the actor, preserves fields, and redacts its outcome', async () => {
  const { service, client, rawStore } = harness();
  const outcome = await service.replay(replayCommand());

  assert.equal(outcome.status, 'completed');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].name, 'send_http1_request');
  assert.deepEqual(
    {
      targetHostname: client.calls[0].arguments_.targetHostname,
      targetPort: client.calls[0].arguments_.targetPort,
      usesHttps: client.calls[0].arguments_.usesHttps,
    },
    { targetHostname: 'api.target.example', targetPort: 8443, usesHttps: true },
  );

  const outbound = parseHttpRequest(client.calls[0].arguments_.content);
  assert.equal(outbound.target, '/api/users/200?view=private&csrf_token=attacker-query-csrf');
  assert.equal(outbound.headers.find(({ name }) => name.toLowerCase() === 'cookie')?.value, 'session=attacker-cookie');
  assert.equal(
    outbound.headers.find(({ name }) => name.toLowerCase() === 'authorization')?.value,
    'Bearer attacker-bearer',
  );
  assert.equal(outbound.headers.some(({ name }) => name.toLowerCase() === 'proxy-authorization'), false);
  assert.equal(
    outbound.headers.find(({ name }) => name.toLowerCase() === 'x-csrf-token')?.value,
    'attacker-header-csrf',
  );
  assert.equal(
    outbound.headers.find(({ name }) => name.toLowerCase() === 'x-request-token')?.value,
    'attacker-request-token',
  );
  assert.equal(outbound.headers.find(({ name }) => name.toLowerCase() === 'x-keep')?.value, 'keep-header');
  const body = JSON.parse(outbound.body);
  assert.deepEqual(body, {
    object_id: '200',
    csrf_token: 'attacker-body-csrf',
    keep: 'unchanged',
    nested: { name: 'Ada' },
  });
  assert.equal(Number(outbound.headers.find(({ name }) => name.toLowerCase() === 'content-length')?.value), Buffer.byteLength(outbound.body));

  assert.equal(outcome.exchanges.length, 1);
  assert.equal(outcome.exchanges[0].identity, 'attacker');
  assert.equal(outcome.exchanges[0].captureSequence, 10);
  assert.equal(outcome.observation.passed, true);
  assert.equal(outcome.comparison.baselineExchangeId, 'ex_source');
  assert.equal(outcome.comparison.observedExchangeId, outcome.exchanges[0].exchangeId);
  assert.equal(rawStore.rawWrites.length, 1);
  assert.equal(rawStore.rawWrites[0].record.request, client.calls[0].arguments_.content);
  assert.match(rawStore.rawWrites[0].record.response, /victim-private-marker/);

  const exposed = JSON.stringify({ outcome, action: rawStore.actionWrites[0] });
  for (const secret of CONFIGURED_SECRETS) {
    assert.equal(exposed.includes(secret), false, `replay outcome leaked ${secret}`);
  }
});

test('replay forwards its cancellation signal to every Burp dispatch', async () => {
  const controller = new AbortController();
  const { service, client } = harness({ cancellationSignal: controller.signal });

  const outcome = await service.replay(replayCommand('act_cancel_signal'));

  assert.equal(outcome.status, 'completed');
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].cancellationSignal, controller.signal);
});

test('replay distinguishes pre-dispatch cancellation from an unknown mid-dispatch outcome', async () => {
  const beforeDispatch = new AbortController();
  const beforeReason = new Error('cancelled before dispatch');
  beforeDispatch.abort(beforeReason);
  const before = harness({ cancellationSignal: beforeDispatch.signal });

  await assert.rejects(before.service.replay(replayCommand('act_cancel_before')), (error) => error === beforeReason);
  assert.equal(before.client.calls.length, 0);

  const duringDispatch = new AbortController();
  const duringReason = new Error('cancelled during dispatch');
  const during = harness({
    cancellationSignal: duringDispatch.signal,
    burpResults: [async (signal) => {
      duringDispatch.abort(duringReason);
      signal.throwIfAborted();
    }],
  });
  const command = replayCommand('act_cancel_during');
  const first = await during.service.replay(command);
  const second = await during.service.replay(command);

  assert.equal(first.status, 'delivery_unknown');
  assert.deepEqual(second, first);
  assert.equal(during.client.calls.length, 1);
});

test('identity substitution alone can replay a victim request as the attacker', async () => {
  const { service, client } = harness();
  const outcome = await service.replay(replayCommand('act_identity_swap', {
    steps: [{
      stepId: 'step_identity_swap',
      sourceExchangeId: 'ex_source',
      actor: 'attacker',
      mutations: [],
    }],
  }));

  assert.equal(outcome.status, 'completed');
  assert.equal(client.calls.length, 1);
  const outbound = parseHttpRequest(client.calls[0].arguments_.content);
  assert.equal(outbound.target, '/api/users/100?view=full&csrf_token=attacker-query-csrf');
  assert.equal(
    outbound.headers.find(({ name }) => name.toLowerCase() === 'authorization')?.value,
    'Bearer attacker-bearer',
  );
  assert.equal(JSON.parse(outbound.body).object_id, '100');
});

test('identity-bound replay replaces form CSRF from the actor equivalent request', async () => {
  const sourceRequest = [
    'POST /api/users/100 HTTP/1.1',
    'Host: api.target.example:8443',
    'Cookie: session=victim-cookie',
    'Content-Type: application/x-www-form-urlencoded',
    '',
    'object_id=100&csrf_token=victim-body-csrf&keep=unchanged',
  ].join('\r\n');
  const actorRequest = [
    'POST /api/users/999 HTTP/1.1',
    'Host: api.target.example:8443',
    'Cookie: stale=do-not-copy',
    'Content-Type: application/x-www-form-urlencoded',
    '',
    'object_id=999&csrf_token=attacker-body-csrf&keep=actor-value',
  ].join('\r\n');
  const { service, client } = harness({
    exchanges: [
      exchange('ex_source', 'victim', 'route_users', { method: 'POST' }),
      exchange('ex_attacker_latest', 'attacker', 'route_users', { method: 'POST', captureSequence: 9 }),
    ],
    records: new Map([
      ['ex_source', raw(sourceRequest)],
      ['ex_attacker_latest', raw(actorRequest)],
    ]),
  });

  const outcome = await service.replay(
    replayCommand('act_form_csrf', {
      steps: [
        {
          stepId: 'step_form_csrf',
          sourceExchangeId: 'ex_source',
          actor: 'attacker',
          mutations: [{ type: 'set_form_field', name: 'object_id', value: '200' }],
        },
      ],
    }),
  );

  assert.equal(outcome.status, 'completed');
  const outbound = parseHttpRequest(client.calls[0].arguments_.content);
  assert.deepEqual(Object.fromEntries(new URLSearchParams(outbound.body)), {
    object_id: '200',
    keep: 'unchanged',
    csrf_token: 'attacker-body-csrf',
  });
});

test('anonymous replay removes all inherited authentication without consulting identity state', async () => {
  const state = new FakeIdentityStateResolver();
  const { service, client } = harness({ identityState: state });
  const command = replayCommand('act_anonymous', {
    steps: [
      {
        stepId: 'step_anonymous',
        sourceExchangeId: 'ex_source',
        actor: 'anonymous',
        mutations: [{ type: 'set_path', path: '/api/users/200' }],
      },
    ],
    proofCondition: { type: 'body_contains', marker: 'absent-marker' },
  });
  const outcome = await service.replay(command);
  const outbound = client.calls[0].arguments_.content;

  for (const secret of CONFIGURED_SECRETS.filter((value) => value.startsWith('victim-'))) {
    assert.equal(outbound.includes(secret), false);
  }
  assert.equal(state.calls.length, 0);
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.observation.passed, false);
});

test('all actor-bound state resolves before dispatch and missing equivalents request a fresh capture', async () => {
  const state = new FakeIdentityStateResolver();
  state.latest.set('operator\0route_users', 'ex_missing_operator');
  const command = replayCommand('act_preflight', {
    steps: [
      replayCommand().steps[0],
      {
        stepId: 'step_operator',
        sourceExchangeId: 'ex_source',
        actor: 'operator',
        mutations: [{ type: 'set_path', path: '/api/users/300' }],
      },
    ],
  });
  const { service, client, rawStore } = harness({ identityState: state });
  const outcome = await service.replay(command);

  assert.deepEqual(outcome, {
    status: 'needs_fresh_actor_request',
    stepId: 'step_operator',
    routeSignature: 'route_users',
  });
  assert.equal(client.calls.length, 0);
  assert.equal(rawStore.rawWrites.length, 0);
});

test('mutations are ordered and preserve untouched form and JSON fields', async () => {
  const formRequest = [
    'POST /api/items/1?keep=yes&remove=old HTTP/1.1',
    'Host: api.target.example:8443',
    'X-Keep: one',
    'X-Remove: old',
    'Content-Type: application/x-www-form-urlencoded',
    '',
    'keep=one&remove=two',
  ].join('\r\n');
  const jsonRequest = [
    'POST /api/items/1 HTTP/1.1',
    'Host: api.target.example:8443',
    'Content-Type: application/json',
    '',
    JSON.stringify({ keep: 'one', nested: { target: 'old', other: true } }),
  ].join('\r\n');
  const catalog = [
    exchange('ex_form', 'anonymous', 'route_form', { method: 'POST', path: '/api/items/{id}' }),
    exchange('ex_json', 'anonymous', 'route_json', { method: 'POST', path: '/api/items/{id}' }),
  ];
  const records = new Map([
    ['ex_form', raw(formRequest)],
    ['ex_json', raw(jsonRequest)],
  ]);
  const { service, client } = harness({
    exchanges: catalog,
    records,
    configuredSecrets: [],
    burpResults: [response('{}'), response('{}')],
  });

  await service.replay({
    actionId: 'act_form',
    steps: [
      {
        stepId: 'step_form',
        sourceExchangeId: 'ex_form',
        actor: 'anonymous',
        mutations: [
          { type: 'set_path', path: '/api/items/2' },
          { type: 'set_query', name: 'added', value: 'first' },
          { type: 'set_query', name: 'added', value: 'second' },
          { type: 'remove_query', name: 'remove' },
          { type: 'set_header', name: 'X-New', value: 'new' },
          { type: 'remove_header', name: 'X-Remove' },
          { type: 'set_form_field', name: 'keep', value: 'changed' },
          { type: 'set_form_field', name: 'added', value: 'body' },
        ],
      },
    ],
    proofCondition: { type: 'body_contains', marker: 'not-present' },
  });
  const form = parseHttpRequest(client.calls[0].arguments_.content);
  assert.equal(form.target, '/api/items/2?keep=yes&added=second');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(form.body)), { keep: 'changed', remove: 'two', added: 'body' });
  assert.equal(form.headers.find(({ name }) => name.toLowerCase() === 'x-keep')?.value, 'one');
  assert.equal(form.headers.find(({ name }) => name.toLowerCase() === 'x-new')?.value, 'new');
  assert.equal(form.headers.some(({ name }) => name.toLowerCase() === 'x-remove'), false);

  await service.replay({
    actionId: 'act_json',
    steps: [
      {
        stepId: 'step_json',
        sourceExchangeId: 'ex_json',
        actor: 'anonymous',
        mutations: [{ type: 'set_json_pointer', pointer: '/nested/target', value: 'new' }],
      },
    ],
    proofCondition: { type: 'json_pointer_equals', pointer: '/ok', value: true },
  });
  assert.deepEqual(JSON.parse(parseHttpRequest(client.calls[1].arguments_.content).body), {
    keep: 'one',
    nested: { target: 'new', other: true },
  });
});

test('replay rejects fabricated references, oversized commands, forbidden state, invalid bodies, and failed scope', async () => {
  const { service, client, rawStore } = harness({ rules: { avoid: [{ type: 'url_path', value: '/admin' }] } });
  const invalidCommands = [
    replayCommand('act_unknown', {
      steps: [{ ...replayCommand().steps[0], sourceExchangeId: '../ex_fabricated' }],
    }),
    replayCommand('act_no_steps', { steps: [] }),
    replayCommand('act_five_steps', { steps: Array.from({ length: 5 }, (_, index) => ({ ...replayCommand().steps[0], stepId: `step_${index}` })) }),
    replayCommand('act_nine_mutations', {
      steps: [
        {
          ...replayCommand().steps[0],
          mutations: Array.from({ length: 9 }, (_, index) => ({ type: 'set_query', name: 'value', value: String(index) })),
        },
      ],
    }),
    ...['Cookie', 'authorization', 'PROXY-AUTHORIZATION', 'Host', 'origin', 'X-CSRF-Token'].map((name, index) =>
      replayCommand(`act_header_${index}`, {
        steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_header', name, value: 'model-secret' }] }],
      }),
    ),
    replayCommand('act_absolute_path', {
      steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_path', path: 'https://other.example/admin' }] }],
    }),
    replayCommand('act_authority_path', {
      steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_path', path: '//other.example/admin' }] }],
    }),
    replayCommand('act_bad_pointer', {
      steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_json_pointer', pointer: 'not-a-pointer', value: 1 }] }],
    }),
    replayCommand('act_proto_pointer', {
      steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_json_pointer', pointer: '/__proto__/polluted', value: true }] }],
    }),
    replayCommand('act_avoid', {
      steps: [{ ...replayCommand().steps[0], mutations: [{ type: 'set_path', path: '/admin' }] }],
    }),
    { ...replayCommand('act_raw_state'), cookie: 'model-cookie' },
  ];

  for (const command of invalidCommands) {
    await assert.rejects(service.replay(command), /replay|request|mutation|header|path|scope|unknown|step|field/i);
  }

  const malformedCatalog = [exchange('ex_malformed', 'anonymous', 'route_bad', { method: 'POST' })];
  const malformedRecords = new Map([
    [
      'ex_malformed',
      raw('POST /api/items HTTP/1.1\r\nHost: api.target.example:8443\r\nContent-Type: application/json\r\n\r\n{bad'),
    ],
  ]);
  const malformed = harness({ exchanges: malformedCatalog, records: malformedRecords, configuredSecrets: [] });
  await assert.rejects(
    malformed.service.replay({
      actionId: 'act_malformed',
      steps: [
        {
          stepId: 'step_malformed',
          sourceExchangeId: 'ex_malformed',
          actor: 'anonymous',
          mutations: [{ type: 'set_json_pointer', pointer: '/id', value: 1 }],
        },
      ],
      proofCondition: { type: 'body_contains', marker: 'x' },
    }),
    /json|body/i,
  );
  assert.equal(client.calls.length, 0);
  assert.equal(rawStore.rawWrites.length, 0);
  assert.equal(malformed.client.calls.length, 0);
});

test('four steps retain order, stop after a dispatched failure, and are never resent', async () => {
  const simpleRequest = 'GET /api/items/1 HTTP/1.1\r\nHost: api.target.example:8443\r\nX-Keep: yes\r\n\r\n';
  const catalog = Array.from({ length: 4 }, (_, index) =>
    exchange(`ex_order_${index + 1}`, 'anonymous', `route_order_${index + 1}`, {
      method: 'GET',
      path: '/api/items/{id}',
      requestContentType: null,
    }),
  );
  const records = new Map(catalog.map(({ exchangeId }) => [exchangeId, raw(simpleRequest)]));
  const steps = catalog.map(({ exchangeId }, index) => ({
    stepId: `step_order_${index + 1}`,
    sourceExchangeId: exchangeId,
    actor: 'anonymous',
    mutations: [{ type: 'set_query', name: 'sequence', value: String(index + 1) }],
  }));
  const success = harness({
    exchanges: catalog,
    records,
    configuredSecrets: [],
    burpResults: [response('one'), response('two'), response('three'), response('four')],
  });
  const outcome = await success.service.replay({
    actionId: 'act_ordered',
    steps,
    proofCondition: { type: 'body_contains', marker: 'four' },
  });
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.exchanges.map(({ captureSequence }) => captureSequence), [2, 3, 4, 5]);
  assert.deepEqual(
    success.client.calls.map(({ arguments_ }) => parseHttpRequest(arguments_.content).target),
    ['/api/items/1?sequence=1', '/api/items/1?sequence=2', '/api/items/1?sequence=3', '/api/items/1?sequence=4'],
  );
  assert.deepEqual(success.rawStore.rawWrites.map(({ record }) => record.notes), steps.map(({ stepId }) => `act_ordered:${stepId}`));

  const failing = harness({
    exchanges: catalog,
    records,
    configuredSecrets: [],
    burpResults: [response('first'), new Error('connection dropped after dispatch'), response('must-not-send')],
  });
  const first = await failing.service.replay({
    actionId: 'act_partial_failure',
    steps: steps.slice(0, 3),
    proofCondition: { type: 'body_contains', marker: 'never' },
  });
  assert.equal(first.status, 'delivery_unknown');
  assert.equal(failing.client.calls.length, 2);
  assert.equal(failing.rawStore.rawWrites.length, 2);
  assert.equal(failing.rawStore.rawWrites[1].record.response, '<no response>');
  assert.match(failing.rawStore.rawWrites[1].exchangeId, /^attempt_/);
  const repeated = await failing.service.replay({
    actionId: 'act_partial_failure',
    steps: steps.slice(0, 3),
    proofCondition: { type: 'body_contains', marker: 'never' },
  });
  assert.deepEqual(repeated, first);
  assert.equal(failing.client.calls.length, 2);
});

test('HTTP/2 sources use only the structured HTTP/2 Burp tool', async () => {
  const h2Request = ['GET /api/h2?view=one HTTP/2', 'Host: api.target.example:8443', 'Accept: application/json', '', ''].join(
    '\r\n',
  );
  const catalog = [exchange('ex_h2', 'anonymous', 'route_h2', { method: 'GET', path: '/api/h2' })];
  const records = new Map([['ex_h2', raw(h2Request)]]);
  const { service, client } = harness({
    exchanges: catalog,
    records,
    configuredSecrets: [],
    burpResults: [['HTTP/2 200 OK', 'Content-Type: application/json', '', '{"ok":true}'].join('\r\n')],
  });
  const outcome = await service.replay({
    actionId: 'act_h2',
    steps: [
      {
        stepId: 'step_h2',
        sourceExchangeId: 'ex_h2',
        actor: 'anonymous',
        mutations: [{ type: 'set_query', name: 'view', value: 'two' }],
      },
    ],
    proofCondition: { type: 'json_pointer_equals', pointer: '/ok', value: true },
  });

  assert.equal(client.calls[0].name, 'send_http2_request');
  assert.deepEqual(client.calls[0].arguments_.pseudoHeaders, {
    ':method': 'GET',
    ':path': '/api/h2?view=two',
    ':scheme': 'https',
    ':authority': 'api.target.example:8443',
  });
  assert.equal(client.calls[0].arguments_.headers.accept, 'application/json');
  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.observation.passed, true);
});

test('HTTP/2 replay rejects duplicate headers that the Burp schema cannot preserve', async () => {
  const h2Request = [
    'GET /api/h2?view=one HTTP/2',
    'Host: api.target.example:8443',
    'X-Variant: first',
    'X-Variant: second',
    '',
    '',
  ].join('\r\n');
  const { service, client } = harness({
    exchanges: [exchange('ex_h2_duplicates', 'anonymous', 'route_h2_duplicates', { method: 'GET', path: '/api/h2' })],
    records: new Map([['ex_h2_duplicates', raw(h2Request)]]),
    configuredSecrets: [],
  });

  await assert.rejects(
    service.replay({
      actionId: 'act_h2_duplicates',
      steps: [
        {
          stepId: 'step_h2_duplicates',
          sourceExchangeId: 'ex_h2_duplicates',
          actor: 'anonymous',
          mutations: [{ type: 'set_query', name: 'view', value: 'two' }],
        },
      ],
      proofCondition: { type: 'body_contains', marker: 'never' },
    }),
    /duplicate|HTTP\/2/i,
  );
  assert.equal(client.calls.length, 0);
});

test('service derives body, JSON, and persistent-state proof observations itself', async () => {
  const bodyHarness = harness({ burpResults: [response('{"marker":"different"}')] });
  const bodyOutcome = await bodyHarness.service.replay(replayCommand('act_body_false'));
  assert.equal(bodyOutcome.status, 'completed');
  assert.equal(bodyOutcome.observation.passed, false);
  assert.equal(bodyOutcome.observation.baselineExchangeId, 'ex_source');
  assert.equal(bodyOutcome.observation.baselinePassed, true);
  assert.deepEqual(bodyOutcome.observation.controlExchangeIds, ['ex_attacker_latest']);
  assert.equal(bodyOutcome.observation.controlPassed, false);
  assert.notEqual(
    bodyOutcome.observation.proofSourceRequestDigest,
    bodyOutcome.observation.proofSentRequestDigest,
  );

  const jsonHarness = harness({ burpResults: [response('{"result":{"owner":"victim"}}')] });
  const jsonOutcome = await jsonHarness.service.replay(
    replayCommand('act_json_proof', {
      proofCondition: { type: 'json_pointer_equals', pointer: '/result/owner', value: 'victim', passed: false },
    }),
  );
  assert.equal(jsonOutcome.status, 'completed');
  assert.equal(jsonOutcome.observation.passed, true);
  assert.equal(jsonOutcome.observation.baselineExchangeId, 'ex_source');
  assert.equal(jsonOutcome.observation.baselinePassed, false);
  assert.deepEqual(jsonOutcome.observation.controlExchangeIds, ['ex_attacker_latest']);
  assert.equal(jsonOutcome.observation.controlPassed, false);

  const identityOnly = harness();
  const identityOnlyOutcome = await identityOnly.service.replay(
    replayCommand('act_identity_only_proof', {
      steps: [{ ...replayCommand().steps[0], mutations: [] }],
    }),
  );
  assert.equal(identityOnlyOutcome.status, 'completed');
  assert.equal(identityOnlyOutcome.observation.passed, true);
  assert.match(identityOnlyOutcome.observation.proofSourceRequestDigest, /^[a-f0-9]{64}$/);
  assert.equal(
    identityOnlyOutcome.observation.proofSourceRequestDigest,
    identityOnlyOutcome.observation.proofSentRequestDigest,
  );

  const verifyRequest = 'GET /api/users/100 HTTP/1.1\r\nHost: api.target.example:8443\r\n\r\n';
  const persistent = harness({
    exchanges: [
      exchange('ex_source', 'victim'),
      exchange('ex_attacker_latest', 'attacker', 'route_users', { captureSequence: 9 }),
      exchange('ex_verify', 'anonymous', 'route_verify', { method: 'GET', path: '/api/users/{id}' }),
    ],
    records: new Map([
      ['ex_source', raw(SOURCE_REQUEST)],
      ['ex_attacker_latest', raw(ACTOR_REQUEST)],
      ['ex_verify', raw(verifyRequest)],
    ]),
    burpResults: [
      response('{"state":"absent"}'),
      response('{"changed":true}'),
      response('{"state":"persisted-marker"}'),
    ],
  });
  const persistentOutcome = await persistent.service.replay(
    replayCommand('act_persistent', {
      proofCondition: {
        type: 'persistent_state',
        verificationSourceExchangeId: 'ex_verify',
        marker: 'persisted-marker',
      },
    }),
  );
  assert.equal(persistentOutcome.status, 'completed');
  assert.equal(persistentOutcome.exchanges.length, 3);
  assert.equal(persistentOutcome.observation.passed, true);
  assert.equal(persistentOutcome.observation.baselineExchangeId, persistentOutcome.exchanges[0].exchangeId);
  assert.equal(persistentOutcome.observation.baselinePassed, false);
  assert.deepEqual(persistentOutcome.observation.controlExchangeIds, []);
  assert.equal(persistentOutcome.observation.controlPassed, false);
  assert.equal(persistentOutcome.observation.verificationExchangeId, persistentOutcome.exchanges[2].exchangeId);

  const alreadyChanged = harness({
    exchanges: [
      exchange('ex_source', 'victim'),
      exchange('ex_attacker_latest', 'attacker', 'route_users', { captureSequence: 9 }),
      exchange('ex_verify', 'anonymous', 'route_verify', { method: 'GET', path: '/api/users/{id}' }),
    ],
    records: new Map([
      ['ex_source', raw(SOURCE_REQUEST)],
      ['ex_attacker_latest', raw(ACTOR_REQUEST)],
      ['ex_verify', raw(verifyRequest)],
    ]),
    burpResults: [
      response('{"state":"persisted-marker"}'),
      response('{"changed":false}'),
      response('{"state":"persisted-marker"}'),
    ],
  });
  const alreadyChangedOutcome = await alreadyChanged.service.replay(
    replayCommand('act_persistent_preexisting', {
      proofCondition: {
        type: 'persistent_state',
        verificationSourceExchangeId: 'ex_verify',
        marker: 'persisted-marker',
      },
    }),
  );
  assert.equal(alreadyChangedOutcome.status, 'precondition_failed');
  assert.equal(alreadyChangedOutcome.exchanges.length, 1);
  assert.equal(alreadyChangedOutcome.observation.baselinePassed, true);
  assert.equal(alreadyChangedOutcome.observation.passed, false);
  assert.equal(alreadyChanged.client.calls.length, 1);
});

test('host marks a read proof as nondiscriminating when a captured cross-identity control also passes', async () => {
  const generic = response('Welcome');
  const { service } = harness({
    records: new Map([
      ['ex_source', raw(SOURCE_REQUEST, generic)],
      ['ex_attacker_latest', raw(ACTOR_REQUEST, generic)],
    ]),
    burpResults: [generic],
  });

  const outcome = await service.replay(
    replayCommand('act_generic_control', { proofCondition: { type: 'body_contains', marker: 'Welcome' } }),
  );

  assert.equal(outcome.status, 'completed');
  assert.equal(outcome.observation.passed, true);
  assert.equal(outcome.observation.baselinePassed, true);
  assert.deepEqual(outcome.observation.controlExchangeIds, ['ex_attacker_latest']);
  assert.equal(outcome.observation.controlPassed, true);
});

test('completed and uncertain actions are idempotent and invalid responses never become proof', async () => {
  const completed = harness();
  const command = replayCommand('act_idempotent');
  const first = await completed.service.replay(command);
  const second = await completed.service.replay(command);
  assert.deepEqual(second, first);
  assert.equal(completed.client.calls.length, 1);

  for (const [name, result] of [
    ['transport', new Error('transport failed after dispatch')],
    ['missing', '<no response>'],
    ['denied', 'Send HTTP request denied by Burp Suite'],
    ['malformed', 'not an HTTP response'],
    ['truncated', `${response('{"marker":"victim-private-marker"}')}... (truncated)`],
    [
      'redirect',
      ['HTTP/1.1 302 Found', 'Location: https://other.example/landing', 'Content-Length: 0', '', ''].join('\r\n'),
    ],
  ]) {
    const state = harness({ burpResults: [result] });
    const uncertainCommand = replayCommand(`act_${name}`);
    const outcome = await state.service.replay(uncertainCommand);
    assert.equal(outcome.status, 'delivery_unknown', name);
    assert.equal(state.client.calls.length, 1);
    assert.equal(state.rawStore.rawWrites.length, 1);
    assert.match(state.rawStore.rawWrites[0].exchangeId, /^attempt_/);
    assert.equal(state.rawStore.rawWrites[0].record.request, state.client.calls[0].arguments_.content);
    assert.equal(state.rawStore.rawWrites[0].record.response, result instanceof Error ? '<no response>' : result);
    assert.equal(state.rawStore.actionWrites.length, 1);
    assert.deepEqual(await state.service.replay(uncertainCommand), outcome);
    assert.equal(state.client.calls.length, 1, `${name} was resent`);
    assert.equal(state.rawStore.rawWrites.length, 1, `${name} raw evidence was rewritten`);
  }
});

test('transient post-dispatch persistence failures become terminal without replaying the request', async () => {
  for (const failure of ['exchange', 'action']) {
    const rawStore = new FailOnceRawStore(
      new Map([
        ['ex_source', raw(SOURCE_REQUEST)],
        ['ex_attacker_latest', raw(ACTOR_REQUEST)],
      ]),
      { [failure]: true },
    );
    const state = harness({ rawStore });
    const command = replayCommand(`act_persist_${failure}`);

    const outcome = await state.service.replay(command);
    assert.equal(outcome.status, 'delivery_unknown', failure);
    assert.equal(state.client.calls.length, 1, failure);
    assert.deepEqual(await state.service.replay(command), outcome);
    assert.equal(state.client.calls.length, 1, `${failure} persistence failure resent the request`);
  }
});

test('file raw store persists exact records and terminal action state under contained paths', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'shannon-replay-store-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = new FileReplayRawStore(path.join(root, '.shannon', 'blackbox', 'raw'));
  const record = raw('GET / HTTP/1.1\r\nHost: api.target.example:8443\r\n\r\n', response('{}'));
  await store.writeExchange('ex_safe', record);
  assert.deepEqual(await store.readExchange('ex_safe'), record);
  await assert.rejects(store.readExchange('../outside'), /reference|identifier/i);

  const action = {
    schemaVersion: 1,
    actionId: 'act_safe',
    commandDigest: 'a'.repeat(64),
    outcome: { status: 'delivery_unknown', reason: 'test terminal state' },
  };
  await store.writeAction(action);
  assert.deepEqual(await store.readAction('act_safe'), action);
  await assert.rejects(store.readAction('../outside'), /identifier/i);
});
