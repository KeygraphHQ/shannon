import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

const { analyzeObservation, selectRawExchangeIds } = await import(
  process.env.BLACKBOX_OBSERVATION_CORE_MODULE ?? '../dist/blackbox-observation/analyze.js'
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const raw = (response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nprivate-body') => ({
  request: 'GET /items HTTP/1.1\r\nHost: example.test\r\nAuthorization: private-header\r\n\r\n',
  response, notes: 'private-note', occurrence: 1,
});
function exchange(overrides = {}, record = raw()) {
  const identity = overrides.identity ?? 'alice';
  const captureSequence = overrides.captureSequence ?? 1;
  const provenance = { actor: 'blackbox-recon', taskId: 'capture-a', baseRevision: 0 };
  const unavailable = !record.response || record.response === '<no response>' || record.response.endsWith('... (truncated)');
  const parsedStatus = /^HTTP\/\S+ (\d{3})/.exec(record.response)?.[1];
  return {
    exchangeId: `ex_${hash(`${provenance.taskId}\0${identity}\0${captureSequence}\0${hash(`${record.request}\0${record.response}`)}`).slice(0, 24)}`,
    routeSignature: `route_${hash('/items').slice(0, 24)}`,
    identity, captureSequence, method: 'GET', origin: 'https://example.test', path: '/items',
    queryKeys: [], bodyShape: 'empty', requestContentType: null,
    responseStatus: unavailable || !parsedStatus ? 0 : Number(parsedStatus), responseContentType: null,
    responseFingerprint: `sha256:${hash(unavailable ? '<no response>' : record.response)}`,
    candidateObjectReferences: [], provenance,
    ...overrides,
  };
}
function input(exchanges = [], boardChanges = {}, extra = {}) {
  return {
    traffic: structuredClone(exchanges),
    blackboard: {
      schemaVersion: 1, revision: 1, targetOrigin: 'https://example.test', runStatus: 'complete', failure: null,
      identities: [{ name: 'alice', role: 'reader', authenticated: true }, { name: 'bob', role: 'reader', authenticated: true }],
      exchanges: structuredClone(exchanges), resources: [], transitions: [], hypotheses: [], actions: [],
      candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [], ...boardChanges,
    }, findings: [], ...extra,
  };
}
const codes = (items) => items.map(({ code }) => code);

test('multi-identity maps retain direct evidence and only describe supplied observations', () => {
  const first = exchange();
  const second = exchange({ identity: 'bob', captureSequence: 2, responseStatus: 403 });
  const value = input([first, second]);
  const original = JSON.stringify(value);
  const result = analyzeObservation(value);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.exchanges, 2);
  assert.equal(result.routes.length, 1);
  assert.deepEqual(result.routes[0].cells.map(({ counts }) => counts.requests), [1, 1]);
  assert.equal(result.exchanges[0].sources.length, 2);
  assert.ok(result.exchanges.every(({ sources }) => sources.some(({ source }) => source === 'traffic') && sources.some(({ source }) => source === 'blackboard')));
  assert.equal(result.scope.authorization, 'not-assessed');
  assert.equal(result.scope.sessionValidity, 'not-assessed');
  assert.equal(result.recorded.findings.count, 0);
  assert.ok(codes(result.reasons).includes('recorded-zero-findings'));
  assert.ok(codes(result.reasons).includes('unknown-empty-result-reason'));
  assert.equal(JSON.stringify(value), original);
  assert.deepEqual(analyzeObservation(value), result);
});

test('configured identities with absent route cells and anonymous/unattributed observations remain distinct', () => {
  const result = analyzeObservation(input([exchange({ identity: 'anonymous' }), exchange({ identity: 'unrecorded', captureSequence: 2 })]));
  assert.equal(result.status, 'partial');
  assert.deepEqual(new Set(result.identities.map(({ kind }) => kind)), new Set(['named', 'anonymous', 'unattributed']));
  assert.equal(result.routes[0].cells.find(({ identityKey }) => identityKey === 'named:bob').state, 'not-observed');
  assert.equal(result.exchanges.find(({ recordedIdentity }) => recordedIdentity === 'unrecorded').identityKey, 'unattributed');
  assert.ok(codes(result.diagnostics).includes('unattributed-identity'));
});

test('status zero without optional raw records does not invent a missing-response cause', () => {
  const result = analyzeObservation(input([exchange({}, raw('<no response>'))]));
  assert.equal(result.status, 'completed');
  assert.equal(result.exchanges[0].responseStatus, 0);
  assert.equal(result.exchanges[0].normalizedResponse, 'unavailable');
  assert.deepEqual(result.exchanges[0].raw, { availability: 'not-supplied', association: 'not-assessed', response: 'unknown', sources: [] });
  assert.ok(codes(result.reasons).includes('limited-response-evidence'));
});

test('associated native raw records distinguish absent, truncated, malformed and usable responses without content output', () => {
  for (const [response, expected] of [
    ['<no response>', 'absent'], ['HTTP/1.1 200 OK\r\n\r\nbody... (truncated)', 'truncated'],
    ['malformed private-response', 'malformed'], ['HTTP/1.1 204 No Content\r\n\r\n', 'usable'],
  ]) {
    const record = raw(response); const item = exchange({}, record);
    const result = analyzeObservation(input([item], {}, { rawRequested: true, rawRecords: [{ exchangeId: item.exchangeId, availability: 'available', document: record }] }));
    assert.equal(result.status, 'completed', expected);
    assert.equal(result.exchanges[0].raw.association, 'matched');
    assert.equal(result.exchanges[0].raw.response, expected);
    for (const secret of ['private-header', 'private-note', 'private-response']) assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test('raw association mismatch is partial while individual optional missing files preserve unknown evidence', () => {
  const item = exchange();
  const mismatch = analyzeObservation(input([item], {}, { rawRequested: true, rawRecords: [{ exchangeId: item.exchangeId, availability: 'available', document: raw('HTTP/1.1 201 Created\r\n\r\n') }] }));
  assert.equal(mismatch.status, 'partial');
  assert.equal(mismatch.exchanges[0].raw.association, 'mismatch');
  assert.equal(mismatch.exchanges[0].raw.response, 'unknown');
  assert.ok(codes(mismatch.diagnostics).includes('raw-association-mismatch'));
  const missing = analyzeObservation(input([item], {}, { rawRequested: true, rawRecords: [] }));
  assert.equal(missing.status, 'completed');
  assert.equal(missing.exchanges[0].raw.availability, 'missing');
});

test('exact duplicate copies do not inflate observations and conflicts isolate the whole exchange ID', () => {
  const item = exchange();
  const duplicated = input([item]); duplicated.traffic.push(structuredClone(item));
  const result = analyzeObservation(duplicated);
  assert.equal(result.status, 'completed');
  assert.equal(result.counts.exchanges, 1);
  assert.equal(result.counts.duplicates, 1);
  assert.equal(result.exchanges[0].sources.length, 3);
  const other = exchange({ identity: 'bob', captureSequence: 2 });
  const conflicted = input([item, other]); conflicted.blackboard.exchanges[0].identity = 'bob';
  const conflict = analyzeObservation(conflicted);
  assert.equal(conflict.status, 'partial');
  assert.equal(conflict.counts.conflicts, 1);
  assert.deepEqual(conflict.exchanges.map(({ exchangeId }) => exchangeId), [other.exchangeId]);
  assert.deepEqual(selectRawExchangeIds(conflicted.traffic, conflicted.blackboard), [other.exchangeId]);
});

test('required envelope failures, omitted findings and malformed optional findings are different outcomes', () => {
  assert.equal(analyzeObservation(input([], {}, { traffic: {} })).status, 'failed');
  assert.equal(analyzeObservation(input([], { schemaVersion: 99 })).status, 'failed');
  const omitted = input(); delete omitted.findings;
  const missing = analyzeObservation(omitted);
  assert.equal(missing.status, 'completed');
  assert.equal(missing.inputs.findings, 'not-supplied');
  assert.equal(missing.recorded.findings.count, null);
  assert.ok(codes(missing.reasons).includes('finding-count-unavailable'));
  const invalid = analyzeObservation(input([], {}, { findings: {} }));
  assert.equal(invalid.status, 'partial');
  assert.equal(invalid.recorded.findings.count, null);
  const unreadable = analyzeObservation(input([], {}, { findings: undefined, inputDiagnostics: [{ code: 'read-failed', source: { source: 'findings', pointer: '' } }] }));
  assert.equal(unreadable.status, 'partial');
  assert.equal(unreadable.recorded.findings.count, null);
});

test('recorded blocked and unresolved work can coexist with zero findings without emitting private prose', () => {
  const provenance = { actor: 'blackbox-analysis', taskId: 'analysis-a', baseRevision: 1 };
  const result = analyzeObservation(input([], {
    runStatus: 'incomplete', failure: 'private-failure-detail',
    hypotheses: [{ hypothesisId: 'hypothesis-a', kind: 'workflow', summary: 'private-summary', preconditions: [], attackerCapability: 'private-capability', evidence: [], priority: 'medium', status: 'blocked', provenance }],
    tasks: [{ taskId: 'task-a', kind: 'analysis', objective: 'private-objective', evidence: [], identityLease: null, hypothesisId: null, status: 'pending' }],
  }));
  assert.equal(result.status, 'completed');
  assert.equal(result.recorded.runStatus, 'incomplete');
  for (const code of ['recorded-zero-findings', 'recorded-blocked-work', 'recorded-unresolved-work', 'recorded-incomplete-run']) assert.ok(codes(result.reasons).includes(code), code);
  assert.equal(JSON.stringify(result).includes('private-'), false);
});

test('limits only tighten and bounded graph or collection exhaustion cannot look complete', () => {
  assert.throws(() => analyzeObservation(input(), { maxExchanges: 10001 }), { message: 'Invalid observation limits.' });
  const limited = analyzeObservation(input([exchange(), exchange({ captureSequence: 2 })]), { maxExchanges: 1 });
  assert.equal(limited.status, 'failed');
  assert.deepEqual(limited.exchanges, []);
  assert.ok(codes(limited.diagnostics).includes('resource-limit'));
  const nested = input(); nested.blackboard.extra = { child: { child: { child: {} } } };
  assert.equal(analyzeObservation(nested, { maxDepth: 2 }).status, 'failed');
  let invoked = false;
  const accessor = input(); Object.defineProperty(accessor.blackboard, 'extra', { enumerable: true, get() { invoked = true; return 'private'; } });
  assert.equal(analyzeObservation(accessor).status, 'failed');
  assert.equal(invoked, false);
});

test('shared raw source records expose attribution uncertainty without duplicating raw content', () => {
  const record = raw(); const first = exchange({}, record); const second = exchange({ identity: 'bob', captureSequence: 2 }, record);
  const result = analyzeObservation(input([first, second], {}, {
    rawRequested: true,
    rawRecords: [first, second].map(({ exchangeId }) => ({ exchangeId, availability: 'available', document: record })),
  }));
  assert.equal(result.status, 'partial');
  assert.ok(codes(result.diagnostics).includes('shared-raw-source'));
  assert.equal(result.counts.exchanges, 2);
  assert.equal(JSON.stringify(result).includes('private-header'), false);
});
