import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CASE_IDS,
  loadCrossIdentityCorpus,
  evaluateCrossIdentityCorpus,
  projectCrossIdentityResult,
  compareExpectedCrossIdentityProjection,
  summarizeCrossIdentityCases,
  validateCrossIdentityReferences,
  validateProjectedCrossIdentityReferences,
} from '../../../scripts/evaluate-blackbox-cross-identity.mjs';

const record = caseId => ({
  caseId,
  expectedStatus: 'completed',
  actualStatus: 'completed',
  comparison: { passed: true, mismatches: [], missedSupportedRelations: [], unexpectedRelations: [] },
  references: { passed: true, errors: [] },
  mutation: { passed: true },
  executionError: null,
});

const digest = value => createHash('sha256').update(value).digest('hex');

function nativeResponseMetadataValid(exchange) {
  return Number.isSafeInteger(exchange.responseStatus)
    && (exchange.responseStatus === 0 || (exchange.responseStatus >= 100 && exchange.responseStatus <= 599))
    && typeof exchange.responseFingerprint === 'string'
    && /^sha256:[a-f0-9]{64}$/u.test(exchange.responseFingerprint)
    && (exchange.responseContentType === null || typeof exchange.responseContentType === 'string');
}

function parsedSavedResponseStatus(response) {
  if (!response || response === '<no response>' || response.endsWith('... (truncated)')) return null;
  const separator = response.indexOf('\r\n\r\n');
  if (separator < 0) return null;
  const lines = response.slice(0, separator).split('\r\n');
  const status = /^HTTP\/(?:\d+\.\d+|2) (\d{3})(?: .*)?$/u.exec(lines.shift() ?? '');
  if (!status || lines.some(line => !/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+:[^\r\n]*$/u.test(line))) return null;
  const value = Number(status[1]);
  return value >= 100 && value <= 599 ? value : null;
}

function nativeMetadataFromRawResponse(response) {
  const absent = response.length === 0 || response === '<no response>';
  const truncated = !absent && response.endsWith('... (truncated)');
  return {
    status: absent || truncated ? 0 : (parsedSavedResponseStatus(response) ?? 0),
    fingerprint: `sha256:${digest(absent || truncated ? '<no response>' : response)}`,
  };
}

test('omitted, repeated or invented comparison case results cannot pass', () => {
  assert.equal(summarizeCrossIdentityCases([record('a'), record('b')], ['a', 'b']).passed, true);
  assert.equal(summarizeCrossIdentityCases([record('a')], ['a', 'b']).passed, false);
  assert.equal(summarizeCrossIdentityCases([record('a'), record('a')], ['a', 'b']).passed, false);
  assert.equal(summarizeCrossIdentityCases([record('a'), record('b'), record('extra')], ['a', 'b']).passed, false);
});

test('the frozen corpus names each literal case exactly once', () => {
  assert.equal(new Set(CASE_IDS).size, CASE_IDS.length);
  assert.equal(CASE_IDS.length, 17);
});

test('native traffic and blackboard exchange envelopes overlap exactly in every case', () => {
  const { cases } = loadCrossIdentityCorpus();
  let rows = 0;
  let uniqueIds = 0;
  for (const { caseId, documents } of cases) {
    const traffic = documents.traffic.map(value => JSON.stringify(value)).sort();
    const blackboard = documents.blackboard.exchanges.map(value => JSON.stringify(value)).sort();
    assert.deepEqual(blackboard, traffic, caseId);
    rows += traffic.length;
    uniqueIds += new Set(documents.traffic.map(value => value.exchangeId)).size;
  }
  assert.equal(rows, 98);
  assert.equal(uniqueIds, 97);
});

test('every native exchange has valid normalized response metadata', () => {
  const { cases } = loadCrossIdentityCorpus();
  for (const { caseId, documents } of cases) {
    for (const [index, exchange] of documents.traffic.entries()) {
      assert.equal(nativeResponseMetadataValid(exchange), true, `${caseId}/traffic/${index}`);
    }
  }
});

test('every formula-matched raw response has native saved metadata except explicit conflicts', () => {
  const expectedConflicts = new Set([
    'ex_14f54fe516cc1fd57e6b752e',
    'ex_20ecf2a1d9387e9a29243bb3',
  ]);
  const observedConflicts = new Set();
  let available = 0;
  let formulaMatches = 0;
  let checked = 0;
  let agreements = 0;
  const { cases } = loadCrossIdentityCorpus();
  for (const { caseId, documents } of cases) {
    for (const record of documents.rawRecords.filter(value => value.availability === 'available')) {
      available += 1;
      const exchange = documents.traffic.find(value => value.exchangeId === record.exchangeId);
      assert.ok(exchange, `${caseId}/${record.exchangeId}`);
      const raw = record.document;
      const history = digest(`${raw.request}\0${raw.response}`);
      const formulaId = `ex_${digest(`${exchange.provenance.taskId}\0${exchange.identity}\0${exchange.captureSequence}\0${history}`).slice(0, 24)}`;
      if (formulaId !== exchange.exchangeId) continue;
      formulaMatches += 1;
      checked += 1;
      const metadata = nativeMetadataFromRawResponse(raw.response);
      const agrees = exchange.responseStatus === metadata.status
        && exchange.responseFingerprint === metadata.fingerprint;
      if (expectedConflicts.has(exchange.exchangeId)) {
        assert.equal(agrees, false, `${caseId}/${exchange.exchangeId}`);
        observedConflicts.add(exchange.exchangeId);
      }
      else {
        assert.equal(agrees, true, `${caseId}/${exchange.exchangeId}`);
        agreements += 1;
      }
    }
  }
  assert.deepEqual(observedConflicts, expectedConflicts);
  assert.deepEqual({ available, formulaMatches, checked, agreements }, {
    available: 61,
    formulaMatches: 60,
    checked: 60,
    agreements: 58,
  });
});

test('projection comparison rejects omitted, invented, and mismatched prescribed entries', () => {
  const expected = {
    status: 'completed',
    groups: [{ group: 'group-0001', identities: ['named:alice', 'named:bob'] }],
    comparisons: [{
      comparison: 'comparison-000001',
      basis: 'recorded-route-metadata',
      requiredSources: [{ source: 'traffic', pointer: '/0' }],
    }],
  };
  const actual = structuredClone(expected);
  assert.deepEqual(compareExpectedCrossIdentityProjection(actual, expected), {
    passed: true, mismatches: [], missedSupportedRelations: [], unexpectedRelations: [],
  });
  assert.equal(compareExpectedCrossIdentityProjection({ ...actual, groups: [] }, expected).passed, false);
  assert.equal(compareExpectedCrossIdentityProjection({ ...actual, status: 'partial' }, expected).passed, false);
  assert.equal(compareExpectedCrossIdentityProjection({ ...actual, comparisons: [...actual.comparisons, actual.comparisons[0]] }, expected).passed, false);
  for (const comparisons of [{}, null, 'not-an-array', [null]]) {
    assert.doesNotThrow(() => compareExpectedCrossIdentityProjection({ ...actual, comparisons }, expected));
    assert.equal(compareExpectedCrossIdentityProjection({ ...actual, comparisons }, expected).passed, false);
  }
});

test('coverage maps every frozen case exactly once in literal case order', () => {
  const { expected } = loadCrossIdentityCorpus();
  assert.ok(expected.coverage.every(entry => entry.caseIds.length === 1));
  assert.deepEqual(expected.coverage.map(entry => entry.caseIds[0]), CASE_IDS);
  assert.equal(new Set(expected.coverage.flatMap(entry => entry.caseIds)).size, CASE_IDS.length);
  assert.match(expected.coverage[0].scenario, /public\/static-looking route without inferred policy/u);
  const recorded = expected.cases.find(entry => entry.caseId === 'recorded-set-relations');
  assert.equal(recorded.expected.groups.some(group => group.path === '/assets/public.js'), true);
  assert.match(expected.labeling.scope, /no authorization, policy/u);
});

test('reference validation accepts only selected native JSON source pointers', () => {
  const documents = {
    traffic: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa' }],
    blackboard: { exchanges: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa' }], identities: [] },
    findings: [],
    rawRequested: true,
    rawRecords: [{
      exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa',
      availability: 'available',
      document: { request: 'GET / HTTP/1.1', response: '', notes: '', occurrence: 1 },
    }],
  };
  const valid = [
    { source: 'traffic', pointer: '/0' },
    { source: 'blackboard', pointer: '/exchanges/0' },
    { source: 'findings', pointer: '' },
    { source: 'raw', pointer: '', exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa' },
  ];
  assert.deepEqual(validateCrossIdentityReferences(valid, documents), { passed: true, errors: [] });
  assert.equal(validateCrossIdentityReferences([{ source: 'raw', pointer: '/request' }], documents).passed, false);
  assert.equal(validateCrossIdentityReferences([{ source: 'other', pointer: '' }], documents).passed, false);
  const rawReference = [{ source: 'raw', pointer: '', exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa' }];
  assert.equal(validateCrossIdentityReferences(rawReference, {
    ...documents,
    rawRecords: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa', availability: 'available' }],
  }).passed, false);
  assert.equal(validateCrossIdentityReferences(rawReference, {
    ...documents,
    rawRecords: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa', availability: 'missing' }],
  }).passed, true);
  assert.equal(validateCrossIdentityReferences(rawReference, {
    ...documents,
    rawRequested: false,
    rawRecords: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa', availability: 'missing' }],
  }).passed, false);
  assert.equal(validateCrossIdentityReferences(rawReference, {
    ...documents,
    rawRecords: [{
      exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa',
      availability: 'missing',
      document: documents.rawRecords[0].document,
    }],
  }).passed, false);
});

test('projection comparison counts missing and invented supported relations separately', () => {
  const expected = { comparisons: [{ comparisonId: 'comparison-000001', statusRelation: 'same' }] };
  const actual = { comparisons: [{ comparisonId: 'comparison-000002', statusRelation: 'different' }] };
  const verdict = compareExpectedCrossIdentityProjection(actual, expected);
  assert.deepEqual(verdict.missedSupportedRelations.map(JSON.parse), [[null, 'comparison-000001', null, null, null, 'statusRelation', 'same']]);
  assert.deepEqual(verdict.unexpectedRelations.map(JSON.parse), [[null, 'comparison-000002', null, null, null, 'statusRelation', 'different']]);
});

test('actual projected source pointers cannot bypass native reference validation', () => {
  const documents = {
    traffic: [{ exchangeId: 'ex_aaaaaaaaaaaaaaaaaaaaaaaa' }],
    blackboard: {},
    findings: [],
    rawRequested: false,
    rawRecords: [],
  };
  const projection = { groups: [], comparisons: [{ sources: [{ source: 'traffic', pointer: '/99' }] }] };
  assert.equal(validateProjectedCrossIdentityReferences(projection, documents).passed, false);
});

test('all hand-labeled populations include exact groups, cells, and route pairs', () => {
  const { cases } = loadCrossIdentityCorpus();
  assert.deepEqual(cases.slice(0, 7).map(entry => [
    entry.expected.groups.length,
    entry.expected.groups.reduce((sum, group) => sum + group.identityCells.length, 0),
    entry.expected.comparisons.filter(value => value.basis === 'recorded-route-metadata').length,
    entry.expected.comparisons.filter(value => value.basis === 'exact-saved-target-body').length,
  ]), [[4, 8, 4, 0], [2, 6, 4, 1], [3, 18, 3, 3], [1, 4, 1, 0], [1, 2, 1, 0], [1, 2, 1, 0], [0, 0, 0, 0]]);
  const populations = Object.fromEntries(cases.map(entry => [entry.caseId, [
    entry.expected.groups.length,
    entry.expected.groups.reduce((sum, group) => sum + group.identityCells.length, 0),
    entry.expected.comparisons.filter(value => value.basis === 'recorded-route-metadata').length,
    entry.expected.comparisons.filter(value => value.basis === 'exact-saved-target-body').length,
  ]]));
  assert.deepEqual(populations['raw-response-states'], [5, 10, 5, 4]);
  assert.deepEqual(populations['integration-boundaries'], [1, 2, 1, 1]);
  assert.deepEqual(Object.values(populations).reduce((totals, value) =>
    totals.map((total, index) => total + value[index]), [0, 0, 0, 0]), [29, 74, 31, 27]);
  let sourceReferences = 0;
  const countSources = value => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) return void value.forEach(countSources);
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'sources' || key === 'requiredSources') && Array.isArray(child))
        sourceReferences += child.length;
      else countSources(child);
    }
  };
  for (const { expected } of cases) countSources(expected);
  assert.equal(sourceReferences, 1728);
  for (const { expected } of cases) {
    for (const group of expected.groups) {
      const eligible = group.identityCells.filter(cell => cell.state === 'observed' && cell.identityKey !== 'unattributed');
      for (let left = 0; left < eligible.length; left += 1) {
        for (let right = left + 1; right < eligible.length; right += 1) {
          assert.equal(expected.comparisons.filter(value => value.groupId === group.groupId && value.basis === 'recorded-route-metadata'
            && value.identityKeys[0] === eligible[left].identityKey && value.identityKeys[1] === eligible[right].identityKey).length, 1);
        }
      }
      for (const cell of group.identityCells) {
        assert.equal(cell.usableResponses + cell.unavailableResponses, cell.records);
        assert.equal(cell.usableRawResponses + cell.unavailableRawResponses, cell.records);
      }
    }
  }
});

test('missing or extra groups, identity cells, comparison pairs, request classes and value entries cannot pass', () => {
  const { expected } = loadCrossIdentityCorpus().cases[2];
  const edits = [
    value => value.groups.pop(),
    value => value.groups.push(structuredClone(value.groups[0])),
    value => value.groups[0].identityCells.pop(),
    value => value.groups[0].identityCells.push(structuredClone(value.groups[0].identityCells[0])),
    value => value.comparisons.splice(0, 1),
    value => value.comparisons.splice(1, 1),
    value => value.comparisons.push(structuredClone(value.comparisons[1])),
    value => { value.comparisons[1].requestClass = 'request-class-9999'; },
    value => { value.comparisons[1].groupId = 'group-9999'; },
    value => value.comparisons[1].identityValues.pop(),
    value => value.groups[0].identityCells[0].statusValues.push(201),
    value => value.groups[0].identityCells[0].fullResponseFingerprints.pop(),
    value => value.comparisons[0].sources.pop(),
  ];
  for (const edit of edits) {
    const actual = structuredClone(expected);
    edit(actual);
    assert.equal(compareExpectedCrossIdentityProjection(actual, expected).passed, false);
  }
});

test('opaque class membership retains the unpaired query class and excluded shared occurrence', () => {
  const { cases } = loadCrossIdentityCorpus();
  assert.deepEqual(cases.slice(0, 7).map(entry => entry.requestClassMembership.length), [0, 3, 3, 0, 0, 0, 0]);
  for (const entry of cases) {
    const expectedStrong = entry.requestClassMembership.filter(value => value.strongEligible).flatMap(value => {
      const pairs = [];
      for (let left = 0; left < value.members.length; left += 1) {
        for (let right = left + 1; right < value.members.length; right += 1) {
          pairs.push([value.groupId, value.requestClass, [value.members[left].identityKey, value.members[right].identityKey]]);
        }
      }
      return pairs;
    });
    assert.deepEqual(entry.expected.comparisons.filter(value => value.basis === 'exact-saved-target-body')
      .map(value => [value.groupId, value.requestClass, value.identityKeys]), expectedStrong);
    for (const requestClass of entry.requestClassMembership) {
      for (const member of requestClass.members) {
        for (const exchangeId of member.exchangeIds) {
          assert.ok(entry.documents.rawRecords.some(record =>
            record.exchangeId === exchangeId && record.availability === 'available'));
          assert.ok(entry.documents.traffic.some(value => value.exchangeId === exchangeId));
        }
      }
    }
  }
});

test('supported relation deltas count duplicate populations and changed group or identity membership', () => {
  const expected = loadCrossIdentityCorpus().cases[0].expected;
  const duplicate = structuredClone(expected);
  duplicate.comparisons.push(structuredClone(duplicate.comparisons[0]));
  assert.equal(compareExpectedCrossIdentityProjection(duplicate, expected).unexpectedRelations.length, 2);
  for (const field of ['groupId', 'identityKeys']) {
    const changed = structuredClone(expected);
    changed.comparisons[0][field] = field === 'groupId' ? 'group-9999' : ['named:alice', 'named:carol'];
    const verdict = compareExpectedCrossIdentityProjection(changed, expected);
    assert.equal(verdict.missedSupportedRelations.length, 2);
    assert.equal(verdict.unexpectedRelations.length, 2);
  }
});

test('every nested frozen and actual source resolves, including identity cells, values and owner context', async () => {
  const { cases } = loadCrossIdentityCorpus();
  for (const entry of cases) assert.deepEqual(validateProjectedCrossIdentityReferences(entry.expected, entry.documents), { passed: true, errors: [] });
  const { expected, documents } = cases[4];
  for (const select of [
    value => value.groups[0].identityCells[0],
    value => value.comparisons[0].identityValues[0],
    value => value.comparisons[0].recordedOwnerContext[0],
  ]) {
    const actual = structuredClone(expected);
    select(actual).sources.push({ source: 'traffic', pointer: '/999' });
    assert.equal(validateProjectedCrossIdentityReferences(actual, documents).passed, false);
  }
  assert.equal(validateProjectedCrossIdentityReferences({ requiredSources: [{ source: 'traffic', pointer: '/999' }] }, documents).passed, false);
  const identityRun = await evaluateCrossIdentityCorpus((_input, entry) => structuredClone(entry.expected));
  assert.equal(identityRun.summary.passed, true);
  assert.equal(identityRun.summary.caseCount, 17);
  assert.equal(identityRun.manifestSha256, 'fc1b04135d95a38f9ff6e27f238c7cd86f20e4f575683a709f28e5ba5f52eacc');
  assert.deepEqual(Object.keys(identityRun.report), [
    'schemaVersion', 'kind', 'manifestSha256', 'status', 'summary', 'cases',
  ]);
  assert.equal(identityRun.report.kind, 'offline-blackbox-cross-identity-evaluation');
  assert.equal(identityRun.report.status, 'passed');
  assert.equal(Object.hasOwn(identityRun.report, 'corpus'), false);
});

test('production projection copies only frozen fields and retains extra array cardinality', () => {
  const expected = { status: 'completed', groups: [{ groupId: 'group-0001' }] };
  const actual = {
    status: 'completed',
    groups: [
      { groupId: 'group-0001', rawPrivateValue: 'PRIVATE_SENTINEL' },
      { groupId: 'group-0002', rawPrivateValue: 'PRIVATE_SENTINEL' },
    ],
    rawPrivateValue: 'PRIVATE_SENTINEL',
  };
  const projected = projectCrossIdentityResult(actual, expected);
  assert.deepEqual(projected, {
    status: 'completed',
    groups: [{ groupId: 'group-0001' }, null],
  });
  assert.equal(JSON.stringify(projected).includes('PRIVATE_SENTINEL'), false);
  assert.equal(compareExpectedCrossIdentityProjection(projected, expected).passed, false);

  const nullExpected = { requestClass: null };
  for (const wrong of [{ requestClass: 'PRIVATE_SENTINEL' }, {}]) {
    const nullProjection = projectCrossIdentityResult(wrong, nullExpected);
    assert.equal(compareExpectedCrossIdentityProjection(nullProjection, nullExpected).passed, false);
    assert.equal(JSON.stringify(nullProjection).includes('PRIVATE_SENTINEL'), false);
  }
});

test('evaluation mismatches expose locations without echoing production scalar values', () => {
  const verdict = compareExpectedCrossIdentityProjection(
    { status: 'PRIVATE_SENTINEL-body-or-header' },
    { status: 'completed' },
  );
  assert.equal(verdict.passed, false);
  assert.equal(JSON.stringify(verdict).includes('PRIVATE_SENTINEL'), false);
  assert.deepEqual(verdict.mismatches.map(value => value.path), ['/status']);
});

test('evaluator help and invalid usage stay dependency-free and deterministic', () => {
  const script = fileURLToPath(new URL('../../../scripts/evaluate-blackbox-cross-identity.mjs', import.meta.url));
  for (const flag of ['--help', '-h']) {
    const result = spawnSync(process.execPath, [script, flag], { encoding: 'utf8' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /^Usage: node scripts\/evaluate-blackbox-cross-identity\.mjs/u);
    assert.equal(result.stderr, '');
  }
  const invalid = spawnSync(process.execPath, [script, '--unexpected'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.deepEqual(JSON.parse(invalid.stdout), {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-evaluation',
    status: 'failed',
    diagnostics: [{ code: 'invalid_usage' }],
  });
  assert.equal(invalid.stderr, '');
});

test('every projected exchange source retains all native envelope locations', () => {
  const { cases } = loadCrossIdentityCorpus();
  for (const { caseId, expected, documents } of cases) {
    const visit = value => {
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const child of value) visit(child);
        return;
      }
      for (const [key, child] of Object.entries(value)) {
        if ((key === 'sources' || key === 'requiredSources') && Array.isArray(child)) {
          const referencedIds = new Set();
          for (const source of child) {
            if (source.source === 'traffic' && /^\/(?:0|[1-9][0-9]*)$/u.test(source.pointer))
              referencedIds.add(documents.traffic[Number(source.pointer.slice(1))]?.exchangeId);
            const board = /^\/exchanges\/(?:0|[1-9][0-9]*)$/u.exec(source.pointer);
            if (source.source === 'blackboard' && board)
              referencedIds.add(documents.blackboard.exchanges[Number(source.pointer.slice('/exchanges/'.length))]?.exchangeId);
          }
          referencedIds.delete(undefined);
          for (const exchangeId of referencedIds) {
            for (const [index, exchange] of documents.traffic.entries()) {
              if (exchange.exchangeId === exchangeId) assert.ok(child.some(source =>
                source.source === 'traffic' && source.pointer === `/${index}`), `${caseId}/${exchangeId}/traffic/${index}`);
            }
            for (const [index, exchange] of documents.blackboard.exchanges.entries()) {
              if (exchange.exchangeId === exchangeId) assert.ok(child.some(source =>
                source.source === 'blackboard' && source.pointer === `/exchanges/${index}`), `${caseId}/${exchangeId}/blackboard/${index}`);
            }
            if (documents.rawRequested) assert.ok(child.some(source =>
              source.source === 'raw' && source.pointer === '' && source.exchangeId === exchangeId),
            `${caseId}/${exchangeId}/raw`);
          }
        } else visit(child);
      }
    };
    visit(expected);
  }
});

test('raw association formula matches every indexed record except the documented mismatch', () => {
  const hash = text => createHash('sha256').update(text).digest('hex');
  const matches = [];
  const mismatches = [];
  const corpus = loadCrossIdentityCorpus();
  for (const { caseId, documents } of corpus.cases) {
    for (const { exchangeId, document: raw } of documents.rawRecords.filter(record => record.availability === 'available')) {
      const exchange = documents.traffic.find(value => value.exchangeId === exchangeId);
      assert.ok(exchange);
      const history = hash(`${raw.request}\0${raw.response}`);
      const calculated = `ex_${hash(`${exchange.provenance.taskId}\0${exchange.identity}\0${exchange.captureSequence}\0${history}`).slice(0, 24)}`;
      (calculated === exchangeId ? matches : mismatches).push([caseId, exchangeId]);
    }
  }
  const indexedRawRecords = Object.values(corpus.index.sets)
    .reduce((total, entry) => total + entry.rawFiles.length, 0);
  assert.equal(matches.length + mismatches.length, indexedRawRecords);
  assert.equal(matches.length, indexedRawRecords - 1);
  assert.deepEqual(mismatches, [['incomplete-and-raw-unavailable', 'ex_c41ce130ea0f1df84ae5b592']]);
});

test('raw selection distinguishes omitted, available, and selected-missing records', () => {
  const { index, cases, root } = loadCrossIdentityCorpus();
  for (const [set, entry] of Object.entries(index.sets)) {
    assert.equal(typeof entry.rawRequested, 'boolean', set);
    assert.ok(Array.isArray(entry.rawFiles), set);
    assert.ok(Array.isArray(entry.missingRawFiles), set);
    const fixture = cases.find(value => value.set === set);
    assert.ok(fixture, set);
    const selectedIds = fixture.documents.rawRecords.map(value => value.exchangeId).sort();
    const exchangeIds = [...new Set(fixture.documents.traffic.map(value => value.exchangeId))].sort();
    if (entry.rawRequested) assert.deepEqual(selectedIds, exchangeIds, set);
    else assert.deepEqual(selectedIds, [], set);
  }
  assert.equal(cases.flatMap(entry => entry.documents.rawRecords)
    .filter(record => record.availability === 'missing').length, 2);
  const rawStates = cases.find(entry => entry.caseId === 'raw-response-states');
  assert.equal(rawStates.documents.rawRequested, true);
  assert.equal(rawStates.documents.rawRecords.filter(record => record.availability === 'available').length, 9);
  assert.deepEqual(rawStates.documents.rawRecords.filter(record => record.availability === 'missing'), [{
    exchangeId: 'ex_c4c9aceca14eae088bf46e32',
    availability: 'missing',
  }]);
  assert.ok(rawStates.documents.traffic.some(record =>
    record.exchangeId === 'ex_c4c9aceca14eae088bf46e32'));
  const hash = text => createHash('sha256').update(text).digest('hex');
  const missingRequest = 'GET /request-unavailable HTTP/1.1\r\n'
    + 'Host: raw-states.invalid\r\n'
    + 'Authorization: PRIVATE_SENTINEL-request-a\r\n\r\n';
  const missingResponse = 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n'
    + 'Content-Length: 2\r\n\r\nok';
  const history = hash(`${missingRequest}\0${missingResponse}`);
  assert.equal(
    `ex_${hash(`states-request-a\0alice\0${3}\0${history}`).slice(0, 24)}`,
    'ex_c4c9aceca14eae088bf46e32',
  );
  const missingPath = new URL(
    `./fixtures/blackbox-cross-identity/sets/raw-response-states/raw/ex_c4c9aceca14eae088bf46e32.json`,
    import.meta.url,
  );
  assert.equal(root.endsWith('blackbox-cross-identity'), true);
  assert.equal(rawStates.documents.rawRecords[9].document, undefined);
  assert.equal(validateCrossIdentityReferences([
    { source: 'raw', pointer: '', exchangeId: 'ex_c4c9aceca14eae088bf46e32' },
  ], rawStates.documents).passed, true);
  assert.equal(validateCrossIdentityReferences([
    { source: 'raw', pointer: '', exchangeId: 'ex_ffffffffffffffffffffffff' },
  ], rawStates.documents).passed, false);
  assert.equal(existsSync(missingPath), false);
});

test('frozen statuses and variability signals follow their independent contract rules', () => {
  const { cases } = loadCrossIdentityCorpus();
  const framing = cases.find(entry => entry.caseId === 'raw-body-content-type-framing');
  assert.equal(framing.expected.status, 'completed');
  for (const { caseId, expected } of cases) {
    for (const comparison of expected.comparisons) {
      const variable = comparison.identityValues.some(value => value.variable)
        || ['statusRelation', 'fingerprintRelation', 'bodyRelation', 'contentTypeRelation']
          .some(field => comparison[field] === 'overlapping-variable');
      if (variable) assert.ok(comparison.signals.includes('within-identity-variability'),
        `${caseId}/${comparison.comparisonId}`);
    }
  }
});

test('truncated raw responses remain unavailable throughout the frozen projection', () => {
  const entry = loadCrossIdentityCorpus().cases.find(value => value.caseId === 'raw-response-states');
  const group = entry.expected.groups.find(value => value.path === '/truncated');
  assert.ok(group);
  for (const values of group.identityCells) {
    assert.deepEqual([
      values.usableResponses,
      values.unavailableResponses,
      values.statusValues,
      values.fullResponseFingerprints,
    ], [0, 1, [], []]);
  }
  const comparisons = entry.expected.comparisons.filter(value => value.groupId === group.groupId);
  assert.equal(comparisons.length, 2);
  for (const comparison of comparisons) {
    assert.equal(comparison.completeness, 'unavailable');
    assert.equal(comparison.statusRelation, 'unavailable');
    assert.equal(comparison.fingerprintRelation, 'unavailable');
    assert.ok(comparison.unknowns.includes('recorded-status-unavailable'));
    assert.ok(comparison.unknowns.includes('recorded-fingerprint-unavailable'));
  }
  assert.equal(comparisons.find(value => value.basis === 'exact-saved-target-body').evidenceStrength,
    'exact-saved-target-body-request-only');
});

test('usable requests retain strong classes across unusable response states', () => {
  const entry = loadCrossIdentityCorpus().cases.find(value => value.caseId === 'raw-response-states');
  assert.equal(entry.requestClassMembership.length, 4);
  assert.deepEqual(entry.requestClassMembership.map(value => value.groupId), [
    'group-0001', 'group-0002', 'group-0004', 'group-0005',
  ]);
  assert.ok(entry.requestClassMembership.every(value => value.strongEligible));
  const requestUnavailable = entry.expected.comparisons.find(value => value.groupId === 'group-0003');
  assert.deepEqual(requestUnavailable.unknowns, ['raw-request-unavailable']);
  assert.equal(entry.expected.comparisons.some(value =>
    value.groupId === 'group-0003' && value.basis === 'exact-saved-target-body'), false);
  const strong = entry.expected.comparisons.filter(value => value.basis === 'exact-saved-target-body');
  assert.equal(strong.length, 4);
  assert.ok(strong.every(value => value.unknowns.includes('raw-response-unavailable')));
  assert.ok(strong.every(value => value.unknowns.includes('captured-body-unavailable')));
  assert.ok(strong.every(value => value.unknowns.includes('content-type-unavailable')));
});

test('raw fixture HTTP strings decode to CRLF rather than literal backslash bytes', () => {
  const { cases } = loadCrossIdentityCorpus();
  let messages = 0;
  let crlfMessages = 0;
  for (const { documents } of cases) {
    for (const { document } of documents.rawRecords.filter(record => record.availability === 'available')) {
      for (const value of [document.request, document.response]) {
        messages += 1;
        if (/^(?:[!#$%&'*+\-.^_`|~0-9A-Za-z]+ \S+ HTTP\/|HTTP\/)/u.test(value)) {
          assert.ok(value.includes('\r\n'));
          crlfMessages += 1;
        }
        assert.equal(value.includes('\\r\\n'), false);
      }
    }
  }
  assert.deepEqual({ messages, crlfMessages }, { messages: 122, crlfMessages: 119 });
});

test('summary separates failed analyses, relation loss, execution errors and mutations', () => {
  const results = [record('expected-failure'), record('unexpected-failure'), record('error'), record('mutation'), record('relations')];
  Object.assign(results[0], { expectedStatus: 'failed', actualStatus: 'failed' });
  results[1].actualStatus = 'failed';
  results[2].executionError = 'Error';
  results[3].mutation.passed = false;
  results[4].comparison.missedSupportedRelations = ['a', 'b'];
  results[4].comparison.unexpectedRelations = ['c'];
  const summary = summarizeCrossIdentityCases(results, results.map(value => value.caseId));
  assert.equal(summary.passed, false);
  assert.deepEqual([summary.expectedFailedAnalyses, summary.unexpectedFailures, summary.executionErrors, summary.mutations, summary.missedSupportedRelations, summary.unexpectedSupportedRelations], [1, 1, 1, 1, 2, 1]);
});
