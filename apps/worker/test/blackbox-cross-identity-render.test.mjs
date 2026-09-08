import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const access = await import('../dist/blackbox-observation/access-index.js');
const {
  AccessComparisonOutputError,
  accessComparisonLimits,
  compareAccessObservation,
  renderAccessComparisonMarkdown,
  serializeAccessComparison,
} = access;

const sourceRefs = [
  { source: 'raw', pointer: '', exchangeId: 'ex_000000000000000000000001' },
];

function values(identityKey, fingerprint) {
  return {
    identityKey,
    state: 'observed',
    records: 1,
    usableResponses: 1,
    unavailableResponses: 0,
    associatedRawRequests: 1,
    usableRawResponses: 1,
    unavailableRawResponses: 0,
    statusValues: [200],
    fullResponseFingerprints: [fingerprint],
    variable: false,
    sources: structuredClone(sourceRefs),
  };
}

function comparison(comparisonId, basis, left, right) {
  const strong = basis === 'exact-saved-target-body';
  return {
    comparisonId,
    groupId: 'group-0001',
    identityKeys: ['named:alice', 'named:bob'],
    basis,
    evidenceStrength: strong
      ? 'exact-saved-target-body-with-response-evidence'
      : 'recorded-route-metadata',
    requestClass: strong ? 'request-class-0001' : null,
    eligibility: 'eligible',
    completeness: strong ? 'partial' : 'complete',
    statusRelation: 'same',
    fingerprintRelation: 'different',
    bodyRelation: strong ? 'overlapping-variable' : 'unavailable',
    contentTypeRelation: strong ? 'same' : 'unavailable',
    identityValues: [structuredClone(left), structuredClone(right)],
    signals: strong
      ? ['insufficient-evidence', 'recorded-response-difference', 'within-identity-variability']
      : ['recorded-response-difference'],
    unknowns: strong
      ? ['recorded-owner-authenticity-unassessed', 'saved-body-framing-unknown']
      : ['raw-request-not-supplied'],
    recordedOwnerContext: strong
      ? [{
          resourceId: 'resource-1',
          recordedOwnerIdentity: 'named:alice',
          linkedExchangeIds: ['ex_000000000000000000000001'],
          sources: structuredClone(sourceRefs),
        }]
      : [],
    sources: structuredClone(sourceRefs),
  };
}

function baseResult() {
  const alice = values('named:alice', 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const bob = values('named:bob', 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb');
  return {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'partial',
    limits: accessComparisonLimits(),
    sources: [
      { source: 'blackboard', file: 'blackbox_blackboard.json', availability: 'available', sha256: null, bytes: 2 },
      { source: 'findings', file: 'blackbox_authz_findings.json', availability: 'available', sha256: null, bytes: 2 },
      {
        source: 'raw',
        file: 'ex_000000000000000000000001.json',
        availability: 'available',
        sha256: null,
        bytes: 2,
        exchangeId: 'ex_000000000000000000000001',
      },
      { source: 'traffic', file: 'traffic_inventory.json', availability: 'available', sha256: null, bytes: 2 },
    ],
    scope: {
      basis: 'supplied-saved-records',
      authorization: 'not-assessed',
      sessionValidity: 'not-assessed',
      expectedPolicy: 'unknown',
      semanticEquivalence: 'not-established',
      applicationCoverage: 'unknown',
    },
    counts: {
      groups: 1,
      comparisons: 2,
      recordedComparisons: 1,
      strongComparisons: 1,
      insufficientComparisons: 1,
    },
    identities: [
      {
        key: 'named:alice',
        kind: 'named',
        name: 'alice',
        role: 'reader',
        authenticated: true,
        sources: structuredClone(sourceRefs),
      },
      {
        key: 'named:bob',
        kind: 'named',
        name: 'bob',
        role: 'reader',
        authenticated: true,
        sources: structuredClone(sourceRefs),
      },
    ],
    groups: [{
      groupId: 'group-0001',
      routeSignature: 'route-a',
      method: 'GET',
      origin: 'https://example.test',
      path: '/items',
      identityCells: [structuredClone(alice), structuredClone(bob)],
      sources: structuredClone(sourceRefs),
    }],
    comparisons: [
      comparison('comparison-000001', 'recorded-route-metadata', alice, bob),
      comparison('comparison-000002', 'exact-saved-target-body', alice, bob),
    ],
    diagnostics: [{ code: 'partial-evidence', message: 'Some saved evidence is unavailable.', sources: structuredClone(sourceRefs) }],
  };
}

function reverseObjectsWithExtras(value, path = 'root') {
  if (Array.isArray(value)) return value.map((item, index) => reverseObjectsWithExtras(item, `${path}-${index}`));
  if (!value || typeof value !== 'object') return value;
  const entries = Object.entries(value).reverse().map(([key, item]) => [key, reverseObjectsWithExtras(item, `${path}-${key}`)]);
  return Object.fromEntries(path === 'root-limits' ? entries : [['undeclaredSentinel', `EXTRA_${path}`], ...entries]);
}

const expectedOrders = {
  root: ['schemaVersion', 'kind', 'status', 'limits', 'sources', 'scope', 'counts', 'identities', 'groups', 'comparisons', 'diagnostics'],
  limits: ['maxNativeBytes', 'maxRawBytes', 'maxTotalBytes', 'maxDepth', 'maxNodes', 'maxExchanges', 'maxRoutes', 'maxIdentities', 'maxTransitions', 'maxRecords', 'maxRawFiles', 'maxOutputBytes', 'timeoutMs', 'maxComparisons', 'maxSourcesPerComparison'],
  manifest: ['source', 'file', 'availability', 'sha256', 'bytes', 'exchangeId'],
  scope: ['basis', 'authorization', 'sessionValidity', 'expectedPolicy', 'semanticEquivalence', 'applicationCoverage'],
  counts: ['groups', 'comparisons', 'recordedComparisons', 'strongComparisons', 'insufficientComparisons'],
  identity: ['key', 'kind', 'name', 'role', 'authenticated', 'sources'],
  group: ['groupId', 'routeSignature', 'method', 'origin', 'path', 'identityCells', 'sources'],
  values: ['identityKey', 'state', 'records', 'usableResponses', 'unavailableResponses', 'associatedRawRequests', 'usableRawResponses', 'unavailableRawResponses', 'statusValues', 'fullResponseFingerprints', 'variable', 'sources'],
  comparison: ['comparisonId', 'groupId', 'identityKeys', 'basis', 'evidenceStrength', 'requestClass', 'eligibility', 'completeness', 'statusRelation', 'fingerprintRelation', 'bodyRelation', 'contentTypeRelation', 'identityValues', 'signals', 'unknowns', 'recordedOwnerContext', 'sources'],
  owner: ['resourceId', 'recordedOwnerIdentity', 'linkedExchangeIds', 'sources'],
  diagnostic: ['code', 'message', 'sources'],
  ref: ['source', 'pointer', 'exchangeId'],
};

test('public comparison module exports the renderer and serializer contract', () => {
  assert.equal(typeof renderAccessComparisonMarkdown, 'function');
  assert.equal(typeof serializeAccessComparison, 'function');
  assert.equal(typeof AccessComparisonOutputError, 'function');
});

test('serialization recursively canonicalizes declared fields and emits stable two-space JSON with one LF', () => {
  const ordinary = serializeAccessComparison(baseResult());
  const reordered = serializeAccessComparison(reverseObjectsWithExtras(baseResult()));

  assert.equal(reordered.json, ordinary.json);
  assert.equal(reordered.markdown, ordinary.markdown);
  assert.deepEqual(JSON.parse(reordered.json), reordered.result);
  assert.match(reordered.json, /\n  "kind":/);
  assert.ok(reordered.json.endsWith('\n'));
  assert.ok(!reordered.json.endsWith('\n\n'));
  assert.doesNotMatch(reordered.json, /undeclaredSentinel|EXTRA_/);

  const result = reordered.result;
  assert.deepEqual(Object.keys(result), expectedOrders.root);
  assert.deepEqual(Object.keys(result.limits), expectedOrders.limits);
  assert.deepEqual(Object.keys(result.sources[2]), expectedOrders.manifest);
  assert.deepEqual(Object.keys(result.scope), expectedOrders.scope);
  assert.deepEqual(Object.keys(result.counts), expectedOrders.counts);
  assert.deepEqual(Object.keys(result.identities[0]), expectedOrders.identity);
  assert.deepEqual(Object.keys(result.groups[0]), expectedOrders.group);
  assert.deepEqual(Object.keys(result.groups[0].identityCells[0]), expectedOrders.values);
  assert.deepEqual(Object.keys(result.comparisons[1]), expectedOrders.comparison);
  assert.deepEqual(Object.keys(result.comparisons[1].recordedOwnerContext[0]), expectedOrders.owner);
  assert.deepEqual(Object.keys(result.diagnostics[0]), expectedOrders.diagnostic);
  assert.deepEqual(Object.keys(result.comparisons[0].sources[0]), expectedOrders.ref);
});

const headings = [
  '# Offline black-box cross-identity triage',
  '## Input records',
  '## Analysis and scope',
  '## Summary counts',
  '## Identities',
  '## Comparison groups',
  '## Identity comparisons',
  '## Prioritized triage',
  '## Unknown reasons',
  '## Recorded-owner context',
  '## Diagnostics',
  '## Source references',
];

function assertHeadings(markdown) {
  const actual = markdown.split('\n').filter(line => line.startsWith('#'));
  assert.deepEqual(actual, headings);
  for (const heading of headings) assert.equal(markdown.split(heading).length - 1, 1);
}

test('Markdown emits the exact heading vector for populated and empty results', () => {
  const populated = renderAccessComparisonMarkdown(baseResult());
  assertHeadings(populated);

  const empty = baseResult();
  empty.sources = [];
  empty.identities = [];
  empty.groups = [];
  empty.comparisons = [];
  empty.diagnostics = [];
  empty.counts = { groups: 0, comparisons: 0, recordedComparisons: 0, strongComparisons: 0, insufficientComparisons: 0 };
  assertHeadings(renderAccessComparisonMarkdown(empty));
});

test('Markdown distinguishes comparison bases, renders relations, and reviews strong evidence first', () => {
  const markdown = renderAccessComparisonMarkdown(baseResult());
  assert.match(markdown, /recorded-route-metadata/);
  assert.match(markdown, /exact-saved-target-body/);
  assert.match(markdown, /partial/);
  assert.match(markdown, /overlapping-variable/);
  assert.match(markdown, /recorded-response-difference/);
  assert.match(markdown, /full saved-response fingerprint/);
  const triage = markdown.slice(markdown.indexOf('## Prioritized triage'), markdown.indexOf('## Unknown reasons'));
  assert.ok(triage.indexOf('comparison-000002') < triage.indexOf('comparison-000001'));
  assert.doesNotMatch(markdown, /\b(?:allowed|denied|bypassed|vulnerable|safe|verified|exploitable)\b/i);
});

test('Markdown makes hostile metadata inert and uses only fixed source names and fallbacks', () => {
  const hostile = '`|\r\n\u0000\u001f\u007f\u0085\u009f\u2028\u2029\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069';
  const result = baseResult();
  result.identities[0].name = hostile;
  result.groups[0].routeSignature = hostile;
  result.groups[0].identityCells[0].identityKey = hostile;
  result.comparisons[1].recordedOwnerContext[0].resourceId = hostile;
  result.diagnostics[0].message = hostile;
  result.comparisons[1].sources = [
    { source: 'traffic', pointer: hostile },
    { source: 'blackboard', pointer: hostile },
    { source: 'findings', pointer: hostile },
    { source: 'raw', pointer: hostile, exchangeId: 'ex_000000000000000000000001' },
    { source: 'raw', pointer: hostile },
    { source: 'raw', pointer: hostile, exchangeId: 'PRIVATE_INVALID_RAW_ID' },
    { source: 'PRIVATE_FORGED_KIND', pointer: hostile, exchangeId: 'PRIVATE_CALLER_FILENAME' },
  ];
  const markdown = renderAccessComparisonMarkdown(result);

  for (const escaped of ['\\u0060', '\\u007c', '\\u000d', '\\u000a', '\\u0000', '\\u001f', '\\u007f', '\\u0085', '\\u009f', '\\u2028', '\\u2029', '\\u202a', '\\u202b', '\\u202c', '\\u202d', '\\u202e', '\\u2066', '\\u2067', '\\u2068', '\\u2069']) {
    assert.match(markdown, new RegExp(escaped.replace('\\', '\\\\')));
  }
  assert.match(markdown, /` traffic_inventory\.json#/);
  assert.match(markdown, /` blackbox_blackboard\.json#/);
  assert.match(markdown, /` blackbox_authz_findings\.json#/);
  assert.match(markdown, /` raw\/ex_000000000000000000000001\.json#/);
  assert.match(markdown, /` raw\/<unavailable>#/);
  assert.match(markdown, /` source\/<unavailable>#/);
  assert.doesNotMatch(markdown, /PRIVATE_(?:INVALID_RAW_ID|FORGED_KIND|CALLER_FILENAME)/);
  assert.doesNotMatch(markdown, /\r|\u0000|\u001f|\u007f|\u0085|\u009f|\u2028|\u2029|\u202a|\u202b|\u202c|\u202d|\u202e|\u2066|\u2067|\u2068|\u2069/);
});

const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = value => `sha256:${hash(value)}`;
const provenance = { actor: 'blackbox-recon', taskId: 'capture-a', baseRevision: 0 };

function rawSentinelInput() {
  const request = 'POST /PRIVATE_TARGET HTTP/1.1\r\nHost: example.test\r\nAuthorization: PRIVATE_HEADER\r\nCookie: PRIVATE_COOKIE\r\nContent-Length: 20\r\n\r\nPRIVATE_REQUEST_BODY';
  const response = 'HTTP/1.1 200 OK\r\nContent-Length: 21\r\nContent-Type: text/plain\r\n\r\nPRIVATE_RESPONSE_BODY';
  const identities = ['alice', 'bob'];
  const exchanges = identities.map((identity, index) => {
    const captureSequence = index + 1;
    const historyHash = hash(`${request}\0${response}`);
    return {
      exchangeId: `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${historyHash}`).slice(0, 24)}`,
      routeSignature: 'neutral-route',
      identity,
      captureSequence,
      method: 'POST',
      origin: 'https://example.test',
      path: '/neutral',
      queryKeys: [],
      bodyShape: 'object',
      requestContentType: 'text/plain',
      responseStatus: 200,
      responseContentType: 'text/plain',
      responseFingerprint: fingerprint(response),
      candidateObjectReferences: [],
      provenance,
    };
  });
  return {
    traffic: structuredClone(exchanges),
    blackboard: {
      schemaVersion: 1,
      revision: 1,
      targetOrigin: 'https://example.test',
      runStatus: 'complete',
      failure: null,
      identities: identities.map(name => ({ name, role: 'reader', authenticated: true })),
      exchanges: structuredClone(exchanges),
      resources: [], transitions: [], hypotheses: [], actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
    },
    findings: [],
    rawRequested: true,
    rawRecords: exchanges.map((exchange, index) => ({
      exchangeId: exchange.exchangeId,
      availability: 'available',
      document: { request, response, notes: 'PRIVATE_NOTE', occurrence: index + 1 },
    })),
  };
}

test('serialized comparison excludes private raw values, excerpts, and new request or body digests', () => {
  const report = serializeAccessComparison(compareAccessObservation(rawSentinelInput()));
  for (const output of [JSON.stringify(report.result), report.json, report.markdown]) {
    assert.doesNotMatch(output, /PRIVATE_(?:TARGET|HEADER|COOKIE|REQUEST_BODY|RESPONSE_BODY|NOTE)/);
    assert.doesNotMatch(output, /requestDigest|bodyDigest|targetDigest|requestHash|bodyHash/);
  }
});

test('serialization rejects an unknown embedded limit before canonical projection', () => {
  const result = baseResult();
  assert.throws(
    () => serializeAccessComparison({ ...result, limits: { ...result.limits, unknownLimit: 1 } }),
    error => error instanceof Error && error.message === 'Invalid access comparison limits.',
  );
});

test('serialization revalidates tightened limits and checks JSON before Markdown independently', () => {
  const result = baseResult();
  result.sources = [];
  result.identities = [];
  result.groups = [];
  result.comparisons = [];
  result.diagnostics = [];
  result.counts = { groups: 0, comparisons: 0, recordedComparisons: 0, strongComparisons: 0, insufficientComparisons: 0 };
  assert.throws(
    () => serializeAccessComparison({ ...result, limits: null }),
    error => error instanceof Error && error.message === 'Invalid access comparison limits.',
  );
  assert.throws(() => serializeAccessComparison({ ...result, limits: { ...result.limits, maxOutputBytes: result.limits.maxOutputBytes + 1 } }), /Invalid access comparison limits\./);
  assert.throws(() => serializeAccessComparison({ ...result, limits: { ...result.limits, maxComparisons: 5_001 } }), /Invalid access comparison limits\./);
  assert.throws(() => serializeAccessComparison({ ...result, limits: { ...result.limits, maxSourcesPerComparison: 257 } }), /Invalid access comparison limits\./);
  for (const value of [0, Number.POSITIVE_INFINITY]) {
    assert.throws(() => serializeAccessComparison({ ...result, limits: { ...result.limits, maxOutputBytes: value } }), /Invalid access comparison limits\./);
  }

  const ordinary = serializeAccessComparison(result);
  const jsonBytes = Buffer.byteLength(ordinary.json);
  const markdownBytes = Buffer.byteLength(ordinary.markdown);
  assert.ok(markdownBytes > jsonBytes, `markdown ${markdownBytes}; JSON ${jsonBytes}`);

  const jsonLimited = { ...result, limits: accessComparisonLimits({ maxOutputBytes: jsonBytes - 1 }) };
  assert.throws(
    () => serializeAccessComparison(jsonLimited),
    error => error instanceof AccessComparisonOutputError && error.message === 'Comparison output exceeds the enforced limit.',
  );

  const markdownLimited = { ...result, limits: accessComparisonLimits({ maxOutputBytes: markdownBytes - 1 }) };
  assert.ok(Buffer.byteLength(JSON.stringify(markdownLimited, null, 2) + '\n') <= markdownLimited.limits.maxOutputBytes);
  assert.throws(
    () => serializeAccessComparison(markdownLimited),
    error => error instanceof AccessComparisonOutputError && error.message === 'Comparison output exceeds the enforced limit.',
  );
});
