import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const moduleUrl = process.env.BLACKBOX_OBSERVATION_RAW_MODULE
  ? pathToFileURL(process.env.BLACKBOX_OBSERVATION_RAW_MODULE).href
  : new URL('../dist/blackbox-observation/raw.js', import.meta.url).href;
const { associateRaw } = await import(moduleUrl);
const digest = value => createHash('sha256').update(value).digest('hex');
const limits = { maxRawFiles: 512, maxRawBytes: 1024 * 1024 };
const raw = (response = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\nPRIVATE_BODY') => ({
  request: 'GET /items HTTP/1.1\r\nHost: example.invalid\r\nAuthorization: PRIVATE_HEADER\r\n\r\n',
  response, notes: 'PRIVATE_NOTES', occurrence: 1,
});
function exchange(document, options = {}) {
  const recordedIdentity = options.recordedIdentity ?? 'alice';
  const captureSequence = options.captureSequence ?? 1;
  const taskId = options.taskId ?? 'saved-task';
  const unavailable = !document.response || document.response === '<no response>' || document.response.endsWith('... (truncated)');
  return {
    exchangeId: `ex_${digest(`${taskId}\0${recordedIdentity}\0${captureSequence}\0${digest(`${document.request}\0${document.response}`)}`).slice(0, 24)}`,
    recordedIdentity, identityKey: `named:${recordedIdentity}`, captureSequence,
    provenance: { taskId, actor: 'blackbox-recon', baseRevision: 0 },
    responseStatus: unavailable || !document.response.startsWith('HTTP/') ? 0 : 200,
    responseFingerprint: `sha256:${digest(unavailable ? '<no response>' : document.response)}`,
    sources: [{ source: 'traffic', pointer: '/0' }],
    raw: { availability: 'not-supplied', association: 'not-assessed', response: 'unknown', sources: [] },
    ...options,
  };
}
const selected = (value, document) => ({ exchangeId: value.exchangeId, availability: 'available', document });

test('raw response states follow native association and fingerprint semantics without exposing raw text', () => {
  const examples = [
    [raw(''), 'absent'], [raw('<no response>'), 'absent'],
    [raw('HTTP/1.1 200 OK\r\n\r\npart... (truncated)'), 'truncated'],
    [raw('malformed PRIVATE_BODY'), 'malformed'],
    [raw('HTTP/1.1 000 Unavailable\r\n\r\n'), 'malformed', { responseStatus: 0 }],
    [raw(), 'usable'],
  ];
  for (const [document, state, options] of examples) {
    const value = exchange(document, options);
    const result = associateRaw([value], [selected(value, document)], true, limits);
    assert.deepEqual(result.diagnostics, []);
    assert.deepEqual(result.exchanges[0].raw, {
      availability: 'available', association: 'matched', response: state,
      sources: [{ source: 'raw', pointer: '', exchangeId: value.exchangeId }],
    });
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_BODY|PRIVATE_HEADER|PRIVATE_NOTES/);
  }
});

test('absent, invalid and unavailable association are distinct from proven raw mismatch', () => {
  const document = raw();
  const value = exchange(document);
  assert.equal(associateRaw([value], undefined, false, limits).exchanges[0].raw.availability, 'not-supplied');
  const missing = associateRaw([value], [], true, limits);
  assert.equal(missing.exchanges[0].raw.availability, 'missing');
  assert.equal(missing.diagnostics[0].code, 'raw-missing');
  const invalid = associateRaw([value], [selected(value, { ...document, notes: 123 })], true, limits);
  assert.equal(invalid.exchanges[0].raw.availability, 'invalid');
  assert.equal(invalid.diagnostics[0].code, 'raw-invalid');
  const unavailable = associateRaw([{ ...value, captureSequence: null }], [selected(value, document)], true, limits);
  assert.equal(unavailable.exchanges[0].raw.association, 'not-assessed');
  assert.equal(unavailable.diagnostics[0].code, 'raw-association-unavailable');
  const mismatch = associateRaw([value], [selected(value, { ...document, request: document.request.replace('/items', '/other') })], true, limits);
  assert.equal(mismatch.exchanges[0].raw.association, 'mismatch');
  assert.equal(mismatch.exchanges[0].raw.response, 'unknown');
  assert.equal(mismatch.diagnostics[0].code, 'raw-association-mismatch');
});

test('saved fingerprint/status contradictions and conflicting raw copies remain explicit', () => {
  const document = raw();
  const value = exchange(document);
  for (const changed of [{ responseFingerprint: `sha256:${'0'.repeat(64)}` }, { responseStatus: 403 }]) {
    const result = associateRaw([{ ...value, ...changed }], [selected(value, document)], true, limits);
    assert.equal(result.exchanges[0].raw.response, 'conflicting');
    assert.equal(result.diagnostics[0].code, 'raw-response-conflict');
  }
  const unavailable = associateRaw([{ ...value, responseStatus: null, responseFingerprint: null }],
    [selected(value, document)], true, limits);
  assert.equal(unavailable.exchanges[0].raw.response, 'usable');
  assert.deepEqual(unavailable.diagnostics, []);
  const duplicate = selected(value, document);
  assert.equal(associateRaw([value], [duplicate, duplicate], true, limits).diagnostics.length, 0);
  const conflict = associateRaw([value], [duplicate, selected(value, { ...document, occurrence: 2 })], true, limits);
  assert.equal(conflict.exchanges[0].raw.availability, 'invalid');
  assert.ok(conflict.diagnostics.some(diagnostic => diagnostic.code === 'raw-record-conflict'));
});

test('shared saved source occurrence is visible without collapsing independent exchange identities', () => {
  const document = raw();
  const alice = exchange(document);
  const bob = exchange(document, { recordedIdentity: 'bob' });
  const result = associateRaw([alice, bob], [selected(alice, document), selected(bob, document)], true, limits);
  assert.equal(result.exchanges.length, 2);
  assert.ok(result.exchanges.every(value => value.raw.association === 'matched'));
  assert.deepEqual(result.diagnostics.map(value => value.code), ['shared-raw-source']);
  assert.equal(result.diagnostics[0].sources.filter(value => value.source === 'raw').length, 2);
});

test('raw request/source boundaries and pure API ceilings fail without reflecting input payloads', () => {
  const document = raw();
  const value = exchange(document);
  for (const request of ['', '<no request>', 'GET /... (truncated)', 'malformed PRIVATE_BODY']) {
    const broken = { ...document, request };
    const expected = exchange(broken);
    const result = associateRaw([expected], [selected(expected, broken)], true, limits);
    assert.equal(result.exchanges[0].raw.availability, 'invalid');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_BODY|PRIVATE_HEADER|PRIVATE_NOTES/);
  }
  const unsafe = associateRaw([value], [{ exchangeId: '../PRIVATE_NOTES', availability: 'available', document }], true, limits);
  assert.ok(unsafe.diagnostics.some(value => value.code === 'raw-unassociated'));
  assert.doesNotMatch(JSON.stringify(unsafe), /PRIVATE_BODY|PRIVATE_HEADER|PRIVATE_NOTES/);
  for (const tightened of [{ maxRawFiles: 1, maxRawBytes: 1 }, { maxRawFiles: 1, maxRawBytes: 1024 * 1024 }]) {
    const entries = tightened.maxRawBytes === 1 ? [selected(value, document)]
      : [selected(value, document), selected(exchange(document, { captureSequence: 2 }), document)];
    const result = associateRaw([value], entries, true, tightened);
    assert.deepEqual(result.exchanges, []);
    assert.deepEqual(result.diagnostics.map(value => value.code), ['input-limit']);
  }
});
