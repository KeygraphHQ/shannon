import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const { compareAccessObservation } = await import('../dist/blackbox-observation/access-index.js');
const { observationLimits } = await import('../dist/blackbox-observation/limits.js');
const { associateRaw } = await import('../dist/blackbox-observation/raw.js');
const { validateObservation } = await import('../dist/blackbox-observation/validate.js');

const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => `sha256:${hash(value)}`;
const provenance = { actor: 'blackbox-recon', taskId: 'capture-a', baseRevision: 0 };
const NO_RESPONSE = '<no response>';
const TRUNCATION = '... (truncated)';

function request(target, body = '', headers = []) {
  return `POST ${target} HTTP/1.1\r\nHost: example.test\r\n${headers.map(value => `${value}\r\n`).join('')}\r\n${body}`;
}

function response(body = '', headers = [], status = 200) {
  return `HTTP/1.1 ${status} Saved\r\n${headers.map(value => `${value}\r\n`).join('')}\r\n${body}`;
}

function rawExchange(identity, captureSequence, path, raw, overrides = {}) {
  const historyHash = hash(`${raw.request}\0${raw.response}`);
  const exchangeId = `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${historyHash}`).slice(0, 24)}`;
  const statusMatch = /^HTTP\/[^ ]+ (\d{3})/.exec(raw.response);
  const absentOrTruncated = raw.response === '' || raw.response === NO_RESPONSE || raw.response.endsWith(TRUNCATION);
  return {
    exchangeId,
    routeSignature: `route:${path}`,
    identity,
    captureSequence,
    method: 'POST',
    origin: 'https://example.test',
    path,
    queryKeys: [],
    bodyShape: 'saved',
    requestContentType: null,
    responseStatus: absentOrTruncated ? 0 : Number(statusMatch?.[1] ?? 0),
    responseContentType: null,
    responseFingerprint: fingerprint(absentOrTruncated ? NO_RESPONSE : raw.response),
    candidateObjectReferences: [],
    provenance,
    ...overrides,
  };
}

function nativeInput(items, resources = [], identities = ['alice', 'bob']) {
  const exchanges = items.map(item => item.exchange);
  return {
    traffic: structuredClone(exchanges),
    blackboard: {
      schemaVersion: 1,
      revision: 1,
      targetOrigin: 'https://example.test',
      runStatus: 'complete',
      failure: null,
      identities: identities.map(name => ({
        name,
        role: name === 'anonymous' ? '' : 'reader',
        authenticated: name !== 'anonymous',
      })),
      exchanges: structuredClone(exchanges),
      resources: structuredClone(resources),
      transitions: [],
      hypotheses: [],
      actions: [],
      candidateProofs: [],
      verifications: [],
      tasks: [],
      rejectedTasks: [],
    },
    findings: [],
    rawRequested: true,
    rawRecords: items.map(item => ({
      exchangeId: item.exchange.exchangeId,
      availability: item.availability ?? 'available',
      ...(item.availability === 'missing' ? {} : { document: item.raw }),
    })),
  };
}

function item(identity, captureSequence, path, raw, overrides) {
  return { raw, exchange: rawExchange(identity, captureSequence, path, raw, overrides) };
}

const strong = result => result.comparisons.filter(value => value.basis === 'exact-saved-target-body');
const route = result => result.comparisons.filter(value => value.basis === 'recorded-route-metadata');

test('exact method target and body form globally opaque classes while headers and cookies do not', () => {
  const pairs = [];
  let sequence = 1;
  const add = (path, leftRequest, rightRequest) => {
    const savedResponse = response(`response:${path}`, ['Content-Length: 15', 'Content-Type: text/plain']);
    for (const [identity, savedRequest, occurrence] of [
      ['alice', leftRequest, 1],
      ['bob', rightRequest, 2],
    ]) {
      const raw = { request: savedRequest, response: savedResponse, notes: 'PRIVATE_NOTE_SENTINEL', occurrence };
      pairs.push(item(identity, sequence++, path, raw));
    }
  };
  add(
    '/alpha',
    request('/alpha?PRIVATE_QUERY_SENTINEL', 'PRIVATE_BODY_ALPHA', ['Authorization: PRIVATE_AUTH_A']),
    request('/alpha?PRIVATE_QUERY_SENTINEL', 'PRIVATE_BODY_ALPHA', ['Cookie: PRIVATE_COOKIE_B']),
  );
  add('/body', request('/body', 'left-body'), request('/body', 'right-body'));
  add('/query', request('/query?a=left', ''), request('/query?a=right', ''));
  add(
    '/zeta',
    request('/zeta', 'PRIVATE_BODY_ZETA', ['Authorization: one']),
    request('/zeta', 'PRIVATE_BODY_ZETA', ['Authorization: two']),
  );

  const result = compareAccessObservation(nativeInput(pairs));
  const reordered = compareAccessObservation(nativeInput([...pairs].reverse()));
  assert.equal(route(result).length, 4);
  assert.equal(strong(result).length, 2);
  assert.deepEqual(strong(result).map(value => [value.comparisonId, value.requestClass]), [
    ['comparison-000002', 'request-class-0001'],
    ['comparison-000006', 'request-class-0006'],
  ]);
  assert.deepEqual(strong(reordered).map(value => value.requestClass), strong(result).map(value => value.requestClass));
  assert.deepEqual(strong(result).map(value => value.identityKeys), [
    ['named:alice', 'named:bob'],
    ['named:alice', 'named:bob'],
  ]);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /PRIVATE_(?:QUERY|BODY|AUTH|COOKIE|NOTE)_/);
  assert.doesNotMatch(serialized, /requestDigest|bodyDigest|targetDigest|requestHash|bodyHash/);
});

test('request classes are outer-group local, tuple ordered and retain non-output ordinals', () => {
  const savedResponse = response('same', ['Content-Length: 4', 'Content-Type: text/plain']);
  const items = [];
  let sequence = 1;
  const addPair = (path, target, occurrences) => {
    for (const [identity, occurrence] of [['alice', occurrences[0]], ['bob', occurrences[1]]]) {
      const raw = { request: request(target, 'same request'), response: savedResponse, notes: '', occurrence };
      items.push(item(identity, sequence++, path, raw));
    }
  };
  addPair('/group-a', '/identical-private-key', [1, 2]);
  addPair('/group-b', '/identical-private-key', [3, 4]);
  const result = compareAccessObservation(nativeInput(items));
  const reordered = compareAccessObservation(nativeInput([...items].reverse()));
  const classProjection = value => [
    result.groups.find(group => group.groupId === value.groupId).path,
    value.requestClass,
  ];
  assert.deepEqual(strong(result).map(classProjection), [
    ['/group-a', 'request-class-0001'],
    ['/group-b', 'request-class-0002'],
  ]);
  assert.deepEqual(strong(reordered).map(value => [
    reordered.groups.find(group => group.groupId === value.groupId).path,
    value.requestClass,
  ]), strong(result).map(classProjection));

  const tupleItems = [];
  sequence = 1;
  for (const [target, occurrences] of [['/"', [1, 2]], ['/0', [3, 4]]]) {
    for (const [identity, occurrence] of [['alice', occurrences[0]], ['bob', occurrences[1]]]) {
      const raw = { request: request(target, 'same request'), response: savedResponse, notes: '', occurrence };
      tupleItems.push(item(identity, sequence++, '/tuple', raw));
    }
  }
  const tupleResult = compareAccessObservation(nativeInput(tupleItems));
  const quoteIds = new Set(tupleItems.slice(0, 2).map(value => value.exchange.exchangeId));
  assert.deepEqual(strong(tupleResult).map(value => value.requestClass), [
    'request-class-0001',
    'request-class-0002',
  ]);
  assert.deepEqual(
    strong(tupleResult)[0].sources.filter(source => source.source === 'raw').map(source => source.exchangeId),
    [...quoteIds].sort(),
  );

  const ordinalItems = [];
  sequence = 1;
  const singleton = { request: request('/a-singleton'), response: savedResponse, notes: '', occurrence: 5 };
  ordinalItems.push(item('alice', sequence++, '/ordinal', singleton));
  for (const [identity, occurrence] of [['alice', 6], ['bob', 6]]) {
    const raw = { request: request('/b-shared'), response: savedResponse, notes: '', occurrence };
    ordinalItems.push(item(identity, sequence++, '/ordinal', raw));
  }
  for (const [identity, occurrence] of [['alice', 7], ['bob', 8]]) {
    const raw = { request: request('/c-strong'), response: savedResponse, notes: '', occurrence };
    ordinalItems.push(item(identity, sequence++, '/ordinal', raw));
  }
  const ordinalResult = compareAccessObservation(nativeInput(ordinalItems));
  assert.deepEqual(strong(ordinalResult).map(value => value.requestClass), ['request-class-0003']);
});

test('anonymous provenance stays local to the selected outer group and request class', () => {
  const savedResponse = response('same', ['Content-Length: 4', 'Content-Type: text/plain']);
  const items = [];
  let sequence = 1;
  for (const [path, target, occurrences] of [
    ['/group-a', '/class-a', [1, 2]],
    ['/group-b', '/class-b', [3, 4]],
  ]) {
    for (const [identity, occurrence] of [['anonymous', occurrences[0]], ['alice', occurrences[1]]]) {
      const raw = { request: request(target, 'same request'), response: savedResponse, notes: '', occurrence };
      items.push(item(identity, sequence++, path, raw));
    }
  }

  for (const identities of [['alice', 'anonymous'], ['alice']]) {
    const result = compareAccessObservation(nativeInput(items, [], identities));
    assert.equal(result.status, 'completed');
    assert.equal(result.groups.length, 2);
    assert.equal(route(result).length, 2);
    assert.equal(strong(result).length, 2);

    for (const group of result.groups) {
      const ownIndexes = group.path === '/group-a' ? [0, 1] : [2, 3];
      const otherIndexes = group.path === '/group-a' ? [2, 3] : [0, 1];
      const expectedGroupSources = new Set(group.identityCells.flatMap(cell => cell.sources).map(JSON.stringify));
      assert.equal(group.sources.length, expectedGroupSources.size);
      for (const source of group.sources) assert.ok(expectedGroupSources.has(JSON.stringify(source)));

      const anonymousCell = group.identityCells.find(cell => cell.identityKey === 'anonymous');
      assert.ok(anonymousCell);
      const anonymousIndex = ownIndexes[0];
      assert.ok(anonymousCell.sources.some(source => source.source === 'traffic' && source.pointer === `/${anonymousIndex}`));
      assert.ok(anonymousCell.sources.some(source => source.source === 'blackboard' && source.pointer === `/exchanges/${anonymousIndex}`));
      for (const index of otherIndexes) {
        assert.ok(!anonymousCell.sources.some(source => source.source === 'traffic' && source.pointer === `/${index}`));
        assert.ok(!anonymousCell.sources.some(source => source.source === 'blackboard' && source.pointer === `/exchanges/${index}`));
      }
      assert.equal(
        anonymousCell.sources.some(source => source.source === 'blackboard' && source.pointer === '/identities/1'),
        identities.includes('anonymous'),
      );

      for (const comparison of result.comparisons.filter(value => value.groupId === group.groupId)) {
        for (const index of otherIndexes) {
          assert.ok(!comparison.sources.some(source => source.source === 'traffic' && source.pointer === `/${index}`));
          assert.ok(!comparison.sources.some(source => source.source === 'blackboard' && source.pointer === `/exchanges/${index}`));
          assert.ok(!comparison.sources.some(source => source.source === 'raw' && source.exchangeId === items[index].exchange.exchangeId));
        }
      }
    }
  }
});

test('combined comparisons receive IDs after group pair basis and request-class sorting', () => {
  const savedResponse = response('same', ['Content-Length: 4', 'Content-Type: text/plain']);
  const items = [];
  let sequence = 1;
  for (const [path, target, identities] of [
    ['/group-a', '/group-a', ['alice', 'bob', 'carol']],
    ['/group-b', '/group-b', ['alice', 'bob']],
  ]) {
    let occurrence = 1;
    for (const identity of identities) {
      const raw = { request: request(target), response: savedResponse, notes: '', occurrence: occurrence++ };
      items.push(item(identity, sequence++, path, raw));
    }
  }
  const result = compareAccessObservation(nativeInput(items, [], ['alice', 'bob', 'carol']));
  assert.deepEqual(result.comparisons.map(value => [
    value.comparisonId,
    value.groupId,
    value.identityKeys.join('|'),
    value.basis,
    value.requestClass,
  ]), [
    ['comparison-000001', 'group-0001', 'named:alice|named:bob', 'recorded-route-metadata', null],
    ['comparison-000002', 'group-0001', 'named:alice|named:bob', 'exact-saved-target-body', 'request-class-0001'],
    ['comparison-000003', 'group-0001', 'named:alice|named:carol', 'recorded-route-metadata', null],
    ['comparison-000004', 'group-0001', 'named:alice|named:carol', 'exact-saved-target-body', 'request-class-0001'],
    ['comparison-000005', 'group-0001', 'named:bob|named:carol', 'recorded-route-metadata', null],
    ['comparison-000006', 'group-0001', 'named:bob|named:carol', 'exact-saved-target-body', 'request-class-0001'],
    ['comparison-000007', 'group-0002', 'named:alice|named:bob', 'recorded-route-metadata', null],
    ['comparison-000008', 'group-0002', 'named:alice|named:bob', 'exact-saved-target-body', 'request-class-0002'],
  ]);
});

test('shared occurrences stay route-level uncertainty and are fully excluded from a clean strong class', () => {
  const savedRequest = request('/shared', 'same request');
  const sharedResponse = response('shared-response', ['Content-Length: 15', 'Content-Type: text/plain'], 201);
  const cleanResponse = response('clean-response', ['Content-Length: 14', 'Content-Type: text/plain'], 200);
  const items = [
    item('alice', 1, '/shared', { request: savedRequest, response: sharedResponse, notes: '', occurrence: 1 }),
    item('bob', 2, '/shared', { request: savedRequest, response: sharedResponse, notes: '', occurrence: 1 }),
    item('alice', 3, '/shared', { request: savedRequest, response: cleanResponse, notes: '', occurrence: 2 }),
    item('bob', 4, '/shared', { request: savedRequest, response: cleanResponse, notes: '', occurrence: 3 }),
  ];
  const result = compareAccessObservation(nativeInput(items));
  const routeComparison = route(result)[0];
  const strongComparison = strong(result)[0];

  assert.equal(result.counts.strongComparisons, 1);
  assert.ok(routeComparison.unknowns.includes('shared-raw-source'));
  assert.ok(!strongComparison.unknowns.includes('shared-raw-source'));
  assert.deepEqual(strongComparison.identityValues.map(value => value.records), [1, 1]);
  assert.deepEqual(strongComparison.identityValues.map(value => value.statusValues), [[200], [200]]);
  for (const sharedItem of items.slice(0, 2)) {
    assert.ok(!strongComparison.sources.some(source => source.exchangeId === sharedItem.exchange.exchangeId));
    for (const source of sharedItem.exchange ? [
      { source: 'traffic', pointer: `/${items.indexOf(sharedItem)}` },
      { source: 'blackboard', pointer: `/exchanges/${items.indexOf(sharedItem)}` },
    ] : []) assert.ok(!strongComparison.sources.some(candidate => JSON.stringify(candidate) === JSON.stringify(source)));
  }

  const onlyShared = compareAccessObservation(nativeInput(items.slice(0, 2)));
  assert.equal(onlyShared.counts.strongComparisons, 0);
  assert.equal(strong(onlyShared).length, 0);
  assert.deepEqual(route(onlyShared)[0].unknowns, ['shared-raw-source']);
});

test('matched usable requests retain private evidence with null unavailable responses', () => {
  const cases = [
    ['usable', response('ok', ['Content-Length: 2'])],
    ['absent', NO_RESPONSE],
    ['truncated', `HTTP/1.1 200 OK\r\n\r\n${TRUNCATION}`],
    ['malformed', 'not an http response'],
  ];
  const items = cases.map(([name, savedResponse], index) => item(
    'alice',
    index + 1,
    `/${name}`,
    { request: request(`/${name}`), response: savedResponse, notes: '', occurrence: index + 1 },
  ));
  const conflictRaw = { request: request('/conflict'), response: response('body'), notes: '', occurrence: 5 };
  items.push(item('alice', 5, '/conflict', conflictRaw, { responseStatus: 201 }));
  const invalidRaw = { request: '<no request>', response: response('body'), notes: '', occurrence: 6 };
  items.push(item('alice', 6, '/invalid', invalidRaw));
  const mismatchRaw = { request: request('/mismatch'), response: response('body'), notes: '', occurrence: 7 };
  const mismatchItem = item('alice', 7, '/mismatch', mismatchRaw);
  mismatchItem.raw = { ...mismatchRaw, request: request('/different') };
  items.push(mismatchItem);

  const input = nativeInput(items, [], ['alice']);
  const validated = validateObservation(input, observationLimits());
  const associated = associateRaw(validated.exchanges, input.rawRecords, true, observationLimits());
  assert.equal(associated.evidence.length, 5);
  assert.deepEqual(associated.evidence.map(value => [
    value.exchangeId,
    value.response === null ? null : value.response.status,
  ]), [
    [items[0].exchange.exchangeId, 200],
    [items[1].exchange.exchangeId, null],
    [items[2].exchange.exchangeId, null],
    [items[3].exchange.exchangeId, null],
    [items[4].exchange.exchangeId, null],
  ].sort((left, right) => left[0].localeCompare(right[0])));
  for (const evidence of associated.evidence) {
    assert.deepEqual(evidence.sources, [
      { source: 'blackboard', pointer: `/exchanges/${items.findIndex(value => value.exchange.exchangeId === evidence.exchangeId)}` },
      { source: 'raw', pointer: '', exchangeId: evidence.exchangeId },
      { source: 'traffic', pointer: `/${items.findIndex(value => value.exchange.exchangeId === evidence.exchangeId)}` },
    ]);
  }
  assert.ok(!associated.evidence.some(value => value.exchangeId === items[5].exchange.exchangeId));
  assert.ok(!associated.evidence.some(value => value.exchangeId === items[6].exchange.exchangeId));
});

test('unavailable matched responses do not erase exact request comparisons', () => {
  const cases = [
    ['absent', NO_RESPONSE, {}],
    ['truncated', `HTTP/1.1 200 OK\r\n\r\n${TRUNCATION}`, {}],
    ['malformed', 'not an http response', {}],
    ['conflicting', response('body', ['Content-Length: 4', 'Content-Type: text/plain']), { responseStatus: 201 }],
  ];
  const items = [];
  let sequence = 1;
  for (const [name, savedResponse, overrides] of cases) {
    const savedRequest = request(`/${name}`, 'same request');
    for (const [identity, occurrence] of [['alice', 1], ['bob', 2]]) {
      const raw = { request: savedRequest, response: savedResponse, notes: '', occurrence };
      items.push(item(identity, sequence++, `/${name}`, raw, overrides));
    }
  }
  const result = compareAccessObservation(nativeInput(items));
  assert.equal(strong(result).length, cases.length);
  for (const comparison of strong(result)) {
    assert.equal(comparison.bodyRelation, 'unavailable');
    assert.equal(comparison.contentTypeRelation, 'unavailable');
    assert.ok(comparison.signals.includes('insufficient-evidence'));
    assert.ok(comparison.unknowns.includes('raw-response-unavailable'));
    assert.ok(comparison.unknowns.includes('captured-body-unavailable'));
    assert.ok(comparison.unknowns.includes('content-type-unavailable'));
  }
});

test('body framing and content type usability are independent and exact', () => {
  const table = [
    ['empty', '', ['Content-Length: 0', 'Content-Type: text/plain'], 'same', 'same', []],
    ['utf8', '€', ['Content-Length: 3', 'Content-Type: Text/Plain; Charset=UTF-8'], 'same', 'same', []],
    ['no-length', 'body', ['Content-Type: text/plain'], 'same', 'same', ['saved-body-framing-unknown']],
    ['transfer', 'body', ['Transfer-Encoding: chunked', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['encoding', 'body', ['Content-Encoding: gzip', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['duplicate-encoding', 'body', ['Content-Encoding: identity', 'Content-Encoding: identity', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['identity-encoding', 'body', ['Content-Encoding: IDENTITY', 'Content-Length: 4', 'Content-Type: text/plain'], 'same', 'same', []],
    ['invalid-length', 'body', ['Content-Length: 04', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['duplicate-length', 'body', ['Content-Length: 4', 'Content-Length: 4', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['mismatch-length', 'body', ['Content-Length: 5', 'Content-Type: text/plain'], 'unavailable', 'same', ['captured-body-unavailable']],
    ['absent-type', 'body', ['Content-Length: 4'], 'same', 'same', []],
    ['duplicate-type', 'body', ['Content-Length: 4', 'Content-Type: text/plain', 'Content-Type: text/plain'], 'same', 'unavailable', ['content-type-unavailable']],
    ['malformed-type', 'body', ['Content-Length: 4', 'Content-Type: not-a-media-type'], 'same', 'unavailable', ['content-type-unavailable']],
  ];
  const items = [];
  let sequence = 1;
  for (const [name, body, headers] of table) {
    const savedRequest = request(`/${name}`, 'same request');
    for (const [identity, occurrence] of [['alice', 1], ['bob', 2]]) {
      const raw = { request: savedRequest, response: response(body, headers), notes: '', occurrence };
      items.push(item(identity, sequence++, `/${name}`, raw));
    }
  }
  const result = compareAccessObservation(nativeInput(items));
  for (const [name, , , bodyRelation, contentTypeRelation, expectedUnknowns] of table) {
    const group = result.groups.find(value => value.path === `/${name}`);
    const comparison = strong(result).find(value => value.groupId === group.groupId);
    assert.equal(comparison.bodyRelation, bodyRelation, `${name} body`);
    assert.equal(comparison.contentTypeRelation, contentTypeRelation, `${name} content type`);
    for (const expected of expectedUnknowns) assert.ok(comparison.unknowns.includes(expected), `${name} ${expected}`);
  }
});

test('strong response profiles use set algebra and preserve usable partial subsets', () => {
  const items = [];
  let sequence = 1;
  const add = (path, identity, occurrence, status, body, type, extraHeaders = []) => {
    const savedRequest = request(path, 'same request');
    const headers = [`Content-Length: ${Buffer.byteLength(body)}`, `Content-Type: ${type}`, ...extraHeaders];
    const raw = { request: savedRequest, response: response(body, headers, status), notes: '', occurrence };
    items.push(item(identity, sequence++, path, raw));
  };
  add('/equal', 'alice', 1, 200, 'a', 'text/plain');
  add('/equal', 'alice', 2, 201, 'b', 'application/json');
  add('/equal', 'bob', 3, 201, 'b', 'application/json');
  add('/equal', 'bob', 4, 200, 'a', 'text/plain');
  add('/different', 'alice', 1, 200, 'left', 'text/plain');
  add('/different', 'bob', 2, 403, 'right', 'application/json');
  add('/overlap', 'alice', 1, 200, 'a', 'text/plain');
  add('/overlap', 'alice', 2, 201, 'b', 'application/json');
  add('/overlap', 'bob', 3, 201, 'b', 'application/json');
  add('/overlap', 'bob', 4, 202, 'c', 'image/png');
  add('/partial', 'alice', 1, 200, 'same', 'text/plain');
  add('/partial', 'alice', 2, 200, 'ignored', 'text/plain', ['Transfer-Encoding: chunked']);
  add('/partial', 'bob', 3, 200, 'same', 'text/plain');

  const result = compareAccessObservation(nativeInput(items));
  const byPath = Object.fromEntries(strong(result).map(comparison => [
    result.groups.find(group => group.groupId === comparison.groupId).path,
    comparison,
  ]));
  assert.deepEqual(
    ['statusRelation', 'bodyRelation', 'contentTypeRelation'].map(key => byPath['/equal'][key]),
    ['same', 'same', 'same'],
  );
  assert.deepEqual(
    ['statusRelation', 'bodyRelation', 'contentTypeRelation'].map(key => byPath['/different'][key]),
    ['different', 'different', 'different'],
  );
  assert.deepEqual(
    ['statusRelation', 'bodyRelation', 'contentTypeRelation'].map(key => byPath['/overlap'][key]),
    ['overlapping-variable', 'overlapping-variable', 'overlapping-variable'],
  );
  assert.equal(byPath['/partial'].bodyRelation, 'same');
  assert.equal(byPath['/partial'].completeness, 'partial');
  assert.ok(byPath['/partial'].signals.includes('insufficient-evidence'));
  assert.ok(byPath['/partial'].unknowns.includes('captured-body-unavailable'));
});

test('explicit validated exchange evidence attaches only intersecting owner context and sources', () => {
  const savedResponse = response('same', ['Content-Length: 4', 'Content-Type: text/plain']);
  const savedRequest = request('/owner', 'same request');
  const items = [
    item('alice', 1, '/owner', { request: savedRequest, response: savedResponse, notes: '', occurrence: 1 }),
    item('bob', 2, '/owner', { request: savedRequest, response: savedResponse, notes: '', occurrence: 2 }),
    item('alice', 3, '/owner', {
      request: request('/owner?outside', 'other request'), response: savedResponse, notes: '', occurrence: 3,
    }),
  ];
  const evidence = id => [{ kind: 'exchange', id }];
  const resource = (resourceId, ownerIdentity, refs, extra = {}) => ({
    resourceId,
    resourceType: 'item',
    objectReferences: ['OBJECT_LIKE_SENTINEL'],
    ownerIdentity,
    visibility: 'private',
    evidence: refs,
    provenance,
    ...extra,
  });
  const resources = [
    resource('accepted-anonymous', 'anonymous', evidence(items[1].exchange.exchangeId)),
    resource('accepted-named', 'alice', [
      ...evidence(items[0].exchange.exchangeId),
      ...evidence(items[2].exchange.exchangeId),
    ]),
    resource('null-owner', null, evidence(items[0].exchange.exchangeId)),
    resource('unknown-owner', 'mallory', evidence(items[0].exchange.exchangeId)),
    resource('unlinked', 'alice', []),
    resource('nonexchange', 'alice', [{ kind: 'resource', id: 'accepted-named' }]),
    resource('conflicted', 'alice', evidence(items[0].exchange.exchangeId)),
    resource('conflicted', 'bob', evidence(items[1].exchange.exchangeId)),
  ];
  const result = compareAccessObservation(nativeInput(items, resources, ['alice', 'bob', 'anonymous']));
  const comparison = strong(result)[0];
  assert.deepEqual(comparison.recordedOwnerContext.map(value => ({
    resourceId: value.resourceId,
    owner: value.recordedOwnerIdentity,
    ids: value.linkedExchangeIds,
  })), [
    { resourceId: 'accepted-anonymous', owner: 'anonymous', ids: [items[1].exchange.exchangeId] },
    { resourceId: 'accepted-named', owner: 'alice', ids: [items[0].exchange.exchangeId] },
  ]);
  assert.ok(comparison.unknowns.includes('recorded-owner-authenticity-unassessed'));
  assert.ok(comparison.sources.some(source => source.pointer === '/resources/0'));
  assert.ok(comparison.sources.some(source => source.pointer === '/resources/1'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/2'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/3'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/4'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/5'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/6'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/7'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/exchanges/2'));
  assert.doesNotMatch(JSON.stringify(result), /OBJECT_LIKE_SENTINEL/);
});
