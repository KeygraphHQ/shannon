import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const { accessComparisonLimits, compareAccessObservation } = await import(
  '../dist/blackbox-observation/access-index.js'
);

const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => `sha256:${hash(value)}`;
const provenance = { actor: 'blackbox-recon', taskId: 'capture-a', baseRevision: 0 };
const nativeId = number => `ex_${number.toString(16).padStart(24, '0')}`;

function exchange(number, identity, overrides = {}) {
  return {
    exchangeId: nativeId(number),
    routeSignature: 'route-a',
    identity,
    captureSequence: number,
    method: 'GET',
    origin: 'https://example.test',
    path: '/items',
    queryKeys: [],
    bodyShape: 'empty',
    requestContentType: null,
    responseStatus: 200,
    responseContentType: 'text/plain',
    responseFingerprint: fingerprint(`response-${number}`),
    candidateObjectReferences: [],
    provenance,
    ...overrides,
  };
}

function input(exchanges = [], identities = ['alice', 'bob'], extra = {}) {
  const identityRecords = identities.map(name => ({
    name,
    role: name === 'anonymous' ? '' : 'reader',
    authenticated: name === 'anonymous' ? false : true,
  }));
  return {
    traffic: structuredClone(exchanges),
    blackboard: {
      schemaVersion: 1,
      revision: 1,
      targetOrigin: 'https://example.test',
      runStatus: 'complete',
      failure: null,
      identities: identityRecords,
      exchanges: structuredClone(exchanges),
      resources: [],
      transitions: [],
      hypotheses: [],
      actions: [],
      candidateProofs: [],
      verifications: [],
      tasks: [],
      rejectedTasks: [],
    },
    findings: [],
    ...extra,
  };
}

const relationByPath = result => Object.fromEntries(result.comparisons.map(value => [
  result.groups.find(group => group.groupId === value.groupId).path,
  {
    status: value.statusRelation,
    fingerprint: value.fingerprintRelation,
    completeness: value.completeness,
    signals: value.signals,
    unknowns: value.unknowns,
  },
]));

function withoutSources(value) {
  if (Array.isArray(value)) return value.map(withoutSources);
  if (value && typeof value === 'object') return Object.fromEntries(
    Object.entries(value).filter(([key]) => key !== 'sources').map(([key, item]) => [key, withoutSources(item)]),
  );
  return value;
}

function resolveSource(nativeInput, source) {
  if (source.source === 'traffic') {
    const match = /^\/(\d+)$/.exec(source.pointer);
    return match ? nativeInput.traffic[Number(match[1])] : undefined;
  }
  if (source.source === 'blackboard') {
    const match = /^\/(identities|exchanges)\/(\d+)$/.exec(source.pointer);
    return match ? nativeInput.blackboard[match[1]][Number(match[2])] : undefined;
  }
  return source.source === 'raw' && source.pointer === '' ? { exchangeId: source.exchangeId } : undefined;
}

test('input reorder preserves semantic ordering and opaque IDs while positional sources resolve natively', () => {
  const exchanges = [
    exchange(1, 'alice', { responseFingerprint: fingerprint('same') }),
    exchange(2, 'bob', { responseFingerprint: fingerprint('same') }),
    exchange(3, 'alice', { routeSignature: 'route-b', path: '/z' }),
    exchange(4, 'bob', { routeSignature: 'route-b', path: '/z' }),
  ];
  const firstInput = input(exchanges);
  const reorderedInput = input([...exchanges].reverse());
  const first = compareAccessObservation(firstInput);
  const reordered = compareAccessObservation(reorderedInput);

  assert.deepEqual(withoutSources(reordered), withoutSources(first));
  assert.deepEqual(first.groups.map(({ groupId }) => groupId), ['group-0001', 'group-0002']);
  assert.deepEqual(first.comparisons.map(({ comparisonId }) => comparisonId), [
    'comparison-000001',
    'comparison-000002',
  ]);
  for (const result of [first, reordered]) {
    const selectedInput = result === first ? firstInput : reorderedInput;
    for (const comparison of result.comparisons) {
      for (const source of comparison.sources) assert.ok(resolveSource(selectedInput, source), JSON.stringify(source));
    }
  }
});

test('native duplicate reconciliation keeps one record and retains every traceable source', () => {
  const first = exchange(1, 'alice', { responseFingerprint: fingerprint('same') });
  const nativeInput = input([first, exchange(2, 'bob', { responseFingerprint: fingerprint('same') })]);
  nativeInput.traffic.push(structuredClone(first));
  const result = compareAccessObservation(nativeInput);

  assert.equal(result.status, 'completed');
  assert.deepEqual(result.groups[0].identityCells.map(cell => [cell.identityKey, cell.records]), [
    ['named:alice', 1],
    ['named:bob', 1],
  ]);
  assert.equal(result.comparisons[0].sources.length, 7);
  assert.equal(new Set(result.comparisons[0].sources.map(JSON.stringify)).size, 7);
});

test('outer groups split and sort on route signature, method, origin and exported path', () => {
  const records = [
    exchange(1, 'alice', { routeSignature: 'r', method: 'GET', origin: 'https://a.test', path: '/a' }),
    exchange(2, 'alice', { routeSignature: 'r', method: 'GET', origin: 'https://a.test', path: '/b' }),
    exchange(3, 'alice', { routeSignature: 'r', method: 'GET', origin: 'https://b.test', path: '/a' }),
    exchange(4, 'alice', { routeSignature: 'r', method: 'POST', origin: 'https://a.test', path: '/a' }),
    exchange(5, 'alice', { routeSignature: 's', method: 'GET', origin: 'https://a.test', path: '/a' }),
  ];
  const result = compareAccessObservation(input(records));

  assert.deepEqual(result.groups.map(group => [group.groupId, group.routeSignature, group.method, group.origin, group.path]), [
    ['group-0001', 'r', 'GET', 'https://a.test', '/a'],
    ['group-0002', 'r', 'GET', 'https://a.test', '/b'],
    ['group-0003', 'r', 'GET', 'https://b.test', '/a'],
    ['group-0004', 'r', 'POST', 'https://a.test', '/a'],
    ['group-0005', 's', 'GET', 'https://a.test', '/a'],
  ]);
  const limited = compareAccessObservation(input(records), { maxRoutes: 4 });
  assert.equal(limited.status, 'failed');
  assert.deepEqual(limited.groups, []);
  assert.deepEqual(limited.comparisons, []);
  assert.deepEqual(limited.diagnostics.map(({ code }) => code), ['resource-limit']);
});

test('groups expose missing identity cells while only observed named and anonymous buckets form pairs', () => {
  const records = [
    exchange(1, 'alice'),
    exchange(2, 'bob'),
    exchange(3, 'anonymous'),
    exchange(4, 'undeclared'),
  ];
  const result = compareAccessObservation(input(records, ['alice', 'bob', 'carol', 'anonymous']));

  assert.deepEqual(result.groups[0].identityCells.map(cell => [cell.identityKey, cell.state]), [
    ['anonymous', 'observed'],
    ['named:alice', 'observed'],
    ['named:bob', 'observed'],
    ['named:carol', 'not-observed'],
    ['unattributed', 'observed'],
  ]);
  assert.deepEqual(result.comparisons.map(({ identityKeys }) => identityKeys), [
    ['anonymous', 'named:alice'],
    ['anonymous', 'named:bob'],
    ['named:alice', 'named:bob'],
  ]);
  assert.equal(result.status, 'partial');
  assert.ok(result.diagnostics.some(({ code }) => code === 'unattributed-identity'));
});

test('recorded set algebra preserves equal, disjoint, overlapping and empty relations', () => {
  const values = [
    exchange(1, 'alice', { path: '/same', responseStatus: 200, responseFingerprint: fingerprint('a') }),
    exchange(2, 'bob', { path: '/same', responseStatus: 200, responseFingerprint: fingerprint('a') }),
    exchange(3, 'alice', { path: '/different', responseStatus: 200, responseFingerprint: fingerprint('a') }),
    exchange(4, 'bob', { path: '/different', responseStatus: 403, responseFingerprint: fingerprint('b') }),
    exchange(5, 'alice', { path: '/overlap', responseStatus: 200, responseFingerprint: fingerprint('a') }),
    exchange(6, 'alice', { path: '/overlap', responseStatus: 201, responseFingerprint: fingerprint('b') }),
    exchange(7, 'bob', { path: '/overlap', responseStatus: 201, responseFingerprint: fingerprint('b') }),
    exchange(8, 'bob', { path: '/overlap', responseStatus: 202, responseFingerprint: fingerprint('c') }),
    exchange(9, 'alice', { path: '/empty', responseStatus: 0, responseFingerprint: fingerprint('unavailable') }),
    exchange(10, 'bob', { path: '/empty', responseStatus: 200, responseFingerprint: fingerprint('a') }),
  ];
  const result = compareAccessObservation(input(values));
  const relations = relationByPath(result);

  assert.equal(result.status, 'completed');
  assert.deepEqual(relations['/same'], {
    status: 'same', fingerprint: 'same', completeness: 'complete',
    signals: ['recorded-response-equivalence'], unknowns: ['raw-request-not-supplied'],
  });
  assert.deepEqual(relations['/different'], {
    status: 'different', fingerprint: 'different', completeness: 'complete',
    signals: ['recorded-response-difference'], unknowns: ['raw-request-not-supplied'],
  });
  assert.deepEqual(relations['/overlap'], {
    status: 'overlapping-variable', fingerprint: 'overlapping-variable', completeness: 'complete',
    signals: ['within-identity-variability'], unknowns: ['raw-request-not-supplied'],
  });
  assert.deepEqual(relations['/empty'], {
    status: 'unavailable', fingerprint: 'unavailable', completeness: 'unavailable',
    signals: ['insufficient-evidence'],
    unknowns: ['raw-request-not-supplied', 'recorded-fingerprint-unavailable', 'recorded-status-unavailable'],
  });
});

test('status zero and invalid metadata are excluded while usable subsets retain supported relations', () => {
  const records = [
    exchange(1, 'alice', { responseStatus: 200, responseFingerprint: fingerprint('same') }),
    exchange(2, 'alice', { responseStatus: 0, responseFingerprint: fingerprint('ignored') }),
    exchange(3, 'alice', { responseStatus: 201, responseFingerprint: 'invalid' }),
    exchange(4, 'bob', { responseStatus: 200, responseFingerprint: fingerprint('same') }),
  ];
  const result = compareAccessObservation(input(records));
  const comparison = result.comparisons[0];

  assert.equal(result.status, 'partial');
  assert.deepEqual(comparison.identityValues.map(value => value.statusValues), [[200], [200]]);
  assert.deepEqual(comparison.identityValues.map(value => value.fullResponseFingerprints), [
    [fingerprint('same')],
    [fingerprint('same')],
  ]);
  assert.deepEqual(comparison.identityValues.map(value => value.unavailableResponses), [2, 0]);
  assert.equal(comparison.statusRelation, 'same');
  assert.equal(comparison.fingerprintRelation, 'same');
  assert.equal(comparison.completeness, 'partial');
  assert.deepEqual(comparison.signals, ['insufficient-evidence', 'recorded-response-equivalence']);
});

test('same status and different fingerprints emit both facts without selecting representative values', () => {
  const records = [
    exchange(1, 'alice', { responseStatus: 200, responseFingerprint: fingerprint('a') }),
    exchange(2, 'alice', { responseStatus: 201, responseFingerprint: fingerprint('b') }),
    exchange(3, 'bob', { responseStatus: 200, responseFingerprint: fingerprint('c') }),
    exchange(4, 'bob', { responseStatus: 201, responseFingerprint: fingerprint('d') }),
  ];
  const comparison = compareAccessObservation(input(records)).comparisons[0];

  assert.equal(comparison.statusRelation, 'same');
  assert.equal(comparison.fingerprintRelation, 'different');
  assert.deepEqual(comparison.identityValues.map(value => value.statusValues), [[200, 201], [200, 201]]);
  assert.deepEqual(comparison.signals, [
    'recorded-response-difference',
    'recorded-response-equivalence',
    'within-identity-variability',
  ]);
});

test('comparison provenance is complete, unique, sorted and sufficient to resolve identity/value membership', () => {
  const records = [
    exchange(1, 'alice', { responseFingerprint: fingerprint('same') }),
    exchange(2, 'bob', { responseFingerprint: fingerprint('same') }),
  ];
  const nativeInput = input(records);
  const comparison = compareAccessObservation(nativeInput).comparisons[0];
  const keys = comparison.sources.map(source => `${source.source}\0${source.pointer}\0${source.exchangeId ?? ''}`);

  assert.deepEqual(keys, [...keys].sort());
  assert.equal(new Set(keys).size, keys.length);
  assert.deepEqual(comparison.sources, [
    { source: 'blackboard', pointer: '/exchanges/0' },
    { source: 'blackboard', pointer: '/exchanges/1' },
    { source: 'blackboard', pointer: '/identities/0' },
    { source: 'blackboard', pointer: '/identities/1' },
    { source: 'traffic', pointer: '/0' },
    { source: 'traffic', pointer: '/1' },
  ]);
  for (const source of comparison.sources) assert.ok(resolveSource(nativeInput, source));
});

test('resource transitions alone never attach recorded owner context', () => {
  const records = [exchange(1, 'alice'), exchange(2, 'bob')];
  const nativeInput = input(records);
  nativeInput.blackboard.resources.push({
    resourceId: 'resource-a',
    resourceType: 'item',
    objectReferences: [],
    ownerIdentity: 'alice',
    visibility: 'private',
    evidence: [],
    provenance,
  });
  nativeInput.blackboard.transitions.push({
    transitionId: 'transition-a',
    identity: 'alice',
    captureSequence: 3,
    fromState: 'before',
    toState: 'after',
    triggerExchangeId: records[0].exchangeId,
    resourceId: 'resource-a',
    provenance,
  });
  const comparison = compareAccessObservation(nativeInput).comparisons[0];

  assert.deepEqual(comparison.recordedOwnerContext, []);
  assert.ok(!comparison.unknowns.includes('recorded-owner-authenticity-unassessed'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/0'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/transitions/0'));
});

test('route-only comparisons attach explicit owner contexts from intersecting exchange evidence', () => {
  const savedResponse = identity => `HTTP/1.1 200 OK\r\nContent-Length: 4\r\n\r\n${identity}`;
  const saved = [
    ['alice', 1, '/items?alice'],
    ['bob', 2, '/items?bobbb'],
    ['carol', 3, '/items?carol'],
  ].map(([identity, captureSequence, target], index) => {
    const request = `GET ${target} HTTP/1.1\r\nHost: example.test\r\n\r\n`;
    const response = savedResponse(index === 0 ? 'left' : index === 1 ? 'rght' : 'outs');
    const historyHash = hash(`${request}\0${response}`);
    const exchangeId = `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${historyHash}`).slice(0, 24)}`;
    return {
      exchange: exchange(captureSequence, identity, {
        exchangeId,
        responseFingerprint: fingerprint(response),
      }),
      raw: { request, response, notes: '', occurrence: index + 1 },
    };
  });
  const nativeInput = input(saved.map(value => value.exchange), ['alice', 'bob', 'carol'], {
    rawRequested: true,
    rawRecords: saved.map(value => ({
      exchangeId: value.exchange.exchangeId,
      availability: 'available',
      document: value.raw,
    })),
  });
  nativeInput.blackboard.resources.push(
    {
      resourceId: 'resource-anonymous',
      resourceType: 'item',
      objectReferences: [],
      ownerIdentity: 'anonymous',
      visibility: 'private',
      evidence: [{ kind: 'exchange', id: saved[1].exchange.exchangeId }],
      provenance,
    },
    {
      resourceId: 'resource-named',
      resourceType: 'item',
      objectReferences: [],
      ownerIdentity: 'alice',
      visibility: 'private',
      evidence: [{ kind: 'exchange', id: saved[0].exchange.exchangeId }],
      provenance,
    },
    {
      resourceId: 'resource-outside-pair',
      resourceType: 'item',
      objectReferences: [],
      ownerIdentity: 'carol',
      visibility: 'private',
      evidence: [{ kind: 'exchange', id: saved[2].exchange.exchangeId }],
      provenance,
    },
  );
  const result = compareAccessObservation(nativeInput);
  const comparison = result.comparisons.find(value =>
    value.basis === 'recorded-route-metadata' && value.identityKeys.join('|') === 'named:alice|named:bob'
  );

  assert.equal(result.counts.strongComparisons, 0);
  assert.deepEqual(comparison.recordedOwnerContext, [
    {
      resourceId: 'resource-anonymous',
      recordedOwnerIdentity: 'anonymous',
      linkedExchangeIds: [saved[1].exchange.exchangeId],
      sources: [
        { source: 'blackboard', pointer: '/exchanges/1' },
        { source: 'blackboard', pointer: '/resources/0' },
        { source: 'traffic', pointer: '/1' },
      ],
    },
    {
      resourceId: 'resource-named',
      recordedOwnerIdentity: 'alice',
      linkedExchangeIds: [saved[0].exchange.exchangeId],
      sources: [
        { source: 'blackboard', pointer: '/exchanges/0' },
        { source: 'blackboard', pointer: '/resources/1' },
        { source: 'traffic', pointer: '/0' },
      ],
    },
  ]);
  assert.ok(comparison.unknowns.includes('recorded-owner-authenticity-unassessed'));
  assert.ok(comparison.sources.some(source => source.pointer === '/resources/0'));
  assert.ok(comparison.sources.some(source => source.pointer === '/resources/1'));
  assert.ok(!comparison.sources.some(source => source.pointer === '/resources/2'));
  assert.ok(!comparison.recordedOwnerContext.some(value => value.resourceId === 'resource-outside-pair'));

  const limited = compareAccessObservation(nativeInput, { maxSourcesPerComparison: 9 });
  assert.equal(limited.status, 'failed');
  assert.deepEqual(limited.comparisons, []);
  assert.deepEqual(limited.diagnostics.map(({ code }) => code), ['comparison-limit']);
});

test('group sources may exceed the comparison bound but one oversized pair fails atomically', () => {
  const records = [];
  for (let index = 0; index < 45; index++) {
    records.push(exchange(index + 1, 'alice'));
    records.push(exchange(index + 101, 'bob'));
    records.push(exchange(index + 201, 'carol'));
  }
  const allowed = compareAccessObservation(input(records, ['alice', 'bob', 'carol']));
  assert.ok(allowed.groups[0].sources.length > 256);
  assert.equal(allowed.status, 'completed');
  assert.equal(allowed.comparisons.length, 3);
  assert.ok(allowed.comparisons.every(comparison => comparison.sources.length < 256));

  const oversizedRecords = [];
  for (let index = 0; index < 128; index++) {
    oversizedRecords.push(exchange(index + 1, 'alice'));
    oversizedRecords.push(exchange(index + 1001, 'bob'));
  }
  const oversized = compareAccessObservation(input(oversizedRecords));
  assert.equal(oversized.status, 'failed');
  assert.deepEqual(oversized.groups, []);
  assert.deepEqual(oversized.comparisons, []);
  assert.deepEqual(oversized.diagnostics.map(({ code }) => code), ['comparison-limit']);
});

test('comparison limits only tighten, reject malformed overrides and never emit a partial population', () => {
  assert.equal(accessComparisonLimits().maxComparisons, 5000);
  assert.equal(accessComparisonLimits().maxSourcesPerComparison, 256);
  for (const overrides of [
    { maxComparisons: 5001 },
    { maxSourcesPerComparison: 257 },
    { maxComparisons: 0 },
    { maxComparisons: 1.5 },
    { maxComparisons: Number.NaN },
    { maxComparisons: Number.POSITIVE_INFINITY },
    { maxUnknown: 1 },
    { maxRoutes: 2001 },
  ]) assert.throws(() => accessComparisonLimits(overrides), { message: 'Invalid access comparison limits.' });

  const records = [exchange(1, 'alice'), exchange(2, 'bob'), exchange(3, 'carol')];
  const limited = compareAccessObservation(input(records, ['alice', 'bob', 'carol']), { maxComparisons: 1 });
  assert.equal(limited.status, 'failed');
  assert.deepEqual(limited.counts, {
    groups: 0, comparisons: 0, recordedComparisons: 0, strongComparisons: 0, insufficientComparisons: 0,
  });
  assert.deepEqual(limited.identities, []);
  assert.deepEqual(limited.groups, []);
  assert.deepEqual(limited.comparisons, []);
  assert.deepEqual(limited.diagnostics.map(({ code }) => code), ['comparison-limit']);

  const exactSources = compareAccessObservation(input([exchange(1, 'alice'), exchange(2, 'bob')]), {
    maxSourcesPerComparison: 6,
  });
  assert.equal(exactSources.status, 'completed');
  const sourceLimited = compareAccessObservation(input([exchange(1, 'alice'), exchange(2, 'bob')]), {
    maxSourcesPerComparison: 5,
  });
  assert.equal(sourceLimited.status, 'failed');
  assert.deepEqual(sourceLimited.groups, []);
  assert.deepEqual(sourceLimited.comparisons, []);
});

test('pure comparison preserves semantic results below a serializer-only output ceiling', () => {
  const result = compareAccessObservation(input([
    exchange(1, 'alice', { responseFingerprint: fingerprint('same') }),
    exchange(2, 'bob', { responseFingerprint: fingerprint('same') }),
  ]), { maxOutputBytes: 1 });

  assert.equal(result.status, 'completed');
  assert.equal(result.counts.groups, 1);
  assert.equal(result.counts.comparisons, 1);
  assert.deepEqual(result.diagnostics, []);
});

test('the default 5000-record ceiling applies to the complete expanded route population', () => {
  const identities = Array.from({ length: 16 }, (_, index) => `identity-${index.toString().padStart(2, '0')}`);
  const records = [];
  let identifier = 1;
  for (let group = 0; group < 42; group++) {
    for (const identity of identities) {
      records.push(exchange(identifier++, identity, {
        routeSignature: 'expanded-route',
        path: `/group-${group.toString().padStart(2, '0')}`,
      }));
    }
  }
  const result = compareAccessObservation(input(records, identities));

  assert.equal(result.status, 'failed');
  assert.deepEqual(result.groups, []);
  assert.deepEqual(result.comparisons, []);
  assert.deepEqual(result.diagnostics.map(({ code }) => code), ['comparison-limit']);
});

test('raw omission remains completed and counts unavailable raw evidence without exposing values', () => {
  const records = [
    exchange(1, 'alice', { responseFingerprint: fingerprint('same') }),
    exchange(2, 'bob', { responseFingerprint: fingerprint('same') }),
  ];
  const result = compareAccessObservation(input(records));
  const comparison = result.comparisons[0];

  assert.equal(result.status, 'completed');
  assert.equal(comparison.completeness, 'complete');
  assert.deepEqual(comparison.identityValues.map(value => [
    value.associatedRawRequests, value.usableRawResponses, value.unavailableRawResponses,
  ]), [[0, 0, 1], [0, 0, 1]]);
  assert.deepEqual(comparison.unknowns, ['raw-request-not-supplied']);
  assert.equal(comparison.bodyRelation, 'unavailable');
  assert.equal(comparison.contentTypeRelation, 'unavailable');
});

test('safe raw association populates only counts and recoverable diagnostics control analysis status', () => {
  const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nPRIVATE_RESPONSE_SENTINEL';
  const request = 'GET /items HTTP/1.1\r\nHost: example.test\r\nAuthorization: PRIVATE_HEADER_SENTINEL\r\n\r\n';
  const rawRecord = { request, response, notes: 'PRIVATE_NOTE_SENTINEL', occurrence: 1 };
  const makeRawExchange = (identity, captureSequence) => {
    const historyHash = hash(`${request}\0${response}`);
    const exchangeId = `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${historyHash}`).slice(0, 24)}`;
    return exchange(captureSequence, identity, {
      exchangeId,
      captureSequence,
      responseFingerprint: fingerprint(response),
    });
  };
  const alice = makeRawExchange('alice', 1);
  const bob = makeRawExchange('bob', 2);
  const complete = compareAccessObservation(input([alice, bob], ['alice', 'bob'], {
    rawRequested: true,
    rawRecords: [
      { exchangeId: alice.exchangeId, availability: 'available', document: rawRecord },
      { exchangeId: bob.exchangeId, availability: 'available', document: { ...rawRecord, occurrence: 2 } },
    ],
  }));
  assert.equal(complete.status, 'completed');
  assert.deepEqual(complete.counts, {
    groups: 1, comparisons: 2, recordedComparisons: 1, strongComparisons: 1, insufficientComparisons: 1,
  });
  assert.deepEqual(complete.comparisons.map(value => value.basis), [
    'recorded-route-metadata',
    'exact-saved-target-body',
  ]);
  assert.deepEqual(complete.comparisons[0].identityValues.map(value => [
    value.associatedRawRequests, value.usableRawResponses, value.unavailableRawResponses,
  ]), [[1, 1, 0], [1, 1, 0]]);
  assert.doesNotMatch(JSON.stringify(complete), /PRIVATE_(?:RESPONSE|HEADER|NOTE)_SENTINEL/);

  const mismatch = compareAccessObservation(input([alice, bob], ['alice', 'bob'], {
    rawRequested: true,
    rawRecords: [
      { exchangeId: alice.exchangeId, availability: 'available', document: { ...rawRecord, request: `${request}x` } },
      { exchangeId: bob.exchangeId, availability: 'missing' },
    ],
  }));
  assert.equal(mismatch.status, 'partial');
  assert.ok(mismatch.diagnostics.some(({ code }) => code === 'raw-association-mismatch'));
  assert.deepEqual(mismatch.comparisons[0].identityValues.map(value => [
    value.associatedRawRequests, value.usableRawResponses, value.unavailableRawResponses,
  ]), [[0, 0, 1], [0, 0, 1]]);
  assert.deepEqual(mismatch.comparisons[0].unknowns, ['raw-request-unavailable']);
});

test('shared raw occurrence is an informational comparison unknown without changing recorded completeness', () => {
  const response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nshared';
  const request = 'GET /items HTTP/1.1\r\nHost: example.test\r\n\r\n';
  const rawRecord = { request, response, notes: '', occurrence: 1 };
  const makeRawExchange = (identity, captureSequence) => {
    const historyHash = hash(`${request}\0${response}`);
    return exchange(captureSequence, identity, {
      exchangeId: `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${historyHash}`).slice(0, 24)}`,
      captureSequence,
      responseFingerprint: fingerprint(response),
    });
  };
  const alice = makeRawExchange('alice', 1);
  const bob = makeRawExchange('bob', 2);
  const result = compareAccessObservation(input([alice, bob], ['alice', 'bob'], {
    rawRequested: true,
    rawRecords: [alice, bob].map(({ exchangeId }) => ({
      exchangeId,
      availability: 'available',
      document: rawRecord,
    })),
  }));

  assert.equal(result.status, 'partial');
  assert.equal(result.counts.strongComparisons, 0);
  assert.equal(result.comparisons.length, 1);
  assert.equal(result.comparisons[0].completeness, 'complete');
  assert.deepEqual(result.comparisons[0].unknowns, ['shared-raw-source']);
  assert.deepEqual(result.comparisons[0].signals, ['recorded-response-equivalence']);
});

test('status is failed only for fatal conditions and incomplete comparison evidence can still complete', () => {
  const unavailable = compareAccessObservation(input([
    exchange(1, 'alice', { responseStatus: 0 }),
    exchange(2, 'bob', { responseStatus: 0 }),
  ]));
  assert.equal(unavailable.status, 'completed');
  assert.equal(unavailable.comparisons[0].completeness, 'unavailable');

  const partialEvidence = compareAccessObservation(input([
    exchange(1, 'alice', { responseFingerprint: fingerprint('same') }),
    exchange(2, 'alice', { responseStatus: 0, responseFingerprint: fingerprint('ignored') }),
    exchange(3, 'bob', { responseFingerprint: fingerprint('same') }),
  ]));
  assert.equal(partialEvidence.status, 'completed');
  assert.equal(partialEvidence.comparisons[0].completeness, 'partial');

  const noPair = compareAccessObservation(input([exchange(1, 'alice')]));
  assert.equal(noPair.status, 'completed');
  assert.equal(noPair.comparisons.length, 0);

  const invalid = compareAccessObservation({ traffic: {}, blackboard: {} });
  assert.equal(invalid.status, 'failed');
  assert.deepEqual(invalid.groups, []);
  assert.deepEqual(invalid.comparisons, []);
  assert.deepEqual(invalid.diagnostics.map(({ code }) => code), ['invalid-required-input']);

  const rawLimited = compareAccessObservation(input(
    [exchange(1, 'alice'), exchange(2, 'bob')],
    ['alice', 'bob'],
    { rawRequested: true, rawRecords: [] },
  ), { maxRawFiles: 1 });
  assert.equal(rawLimited.status, 'failed');
  assert.deepEqual(rawLimited.groups, []);
  assert.deepEqual(rawLimited.comparisons, []);
  assert.deepEqual(rawLimited.diagnostics.map(({ code }) => code), ['resource-limit']);
});
