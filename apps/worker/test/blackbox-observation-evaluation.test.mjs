// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CASE_IDS, compareExpectedProjection, evaluateObservationCorpus, loadObservationCorpus,
  runObservationCase, summarizeObservationCases, unknownObservationUnits, validateObservationReferences,
} from '../../../scripts/evaluate-blackbox-observation.mjs';

function record(caseId, overrides = {}) {
  return {
    caseId, expectedStatus: 'completed', actualStatus: 'completed', matched: true,
    executionError: null, inputMutated: false, mismatches: [],
    unknowns: Object.fromEntries(Object.keys(unknownObservationUnits({})).map((family) => [family, { expected: 0, observed: 0, missed: 0, unexpected: 0 }])),
    ...overrides,
  };
}

test('frozen observation manifest covers the finite goal scenarios and every required case ID', async () => {
  const { manifest, sha256 } = await loadObservationCorpus();
  assert.deepEqual(manifest.cases.map((item) => item.caseId).sort(), [...CASE_IDS].sort());
  assert.equal(manifest.coverage.length, 15);
  assert.match(sha256, /^[a-f0-9]{64}$/u);
  assert.match(manifest.labeling.basis, /No blackbox-observation implementation or output was read/u);
  assert.ok(manifest.coverage.some((item) => item.additionalIntegrationOwner?.includes('Root:')));
});

test('evaluator self-test: omitted, repeated or invented case results cannot pass', () => {
  assert.equal(summarizeObservationCases([record('a'), record('b')], ['a', 'b']).passed, true);
  const missing = summarizeObservationCases([record('a')], ['a', 'b']);
  assert.equal(missing.passed, false);
  assert.deepEqual(missing.missingCaseIds, ['b']);
  const repeated = summarizeObservationCases([record('a'), record('a')], ['a', 'b']);
  assert.equal(repeated.passed, false);
  assert.deepEqual(repeated.duplicateCaseIds, ['a']);
  assert.deepEqual(repeated.missingCaseIds, ['b']);
  const invented = summarizeObservationCases([record('a'), record('b'), record('extra')], ['a', 'b']);
  assert.equal(invented.passed, false);
  assert.deepEqual(invented.unexpectedCaseIds, ['extra']);
});

test('evaluator self-test: expected failed analysis differs from an execution error', async () => {
  const { manifest } = await loadObservationCorpus();
  const item = manifest.cases.find((entry) => entry.caseId === 'required-traffic-envelope-invalid');
  const outcome = await runObservationCase(item, () => ({
    schemaVersion: 1, kind: 'offline-blackbox-observation', status: 'failed',
    scope: item.expected.scope, counts: item.expected.counts,
    identities: [], exchanges: [], routes: [], workflows: [], reasons: [],
    diagnostics: [{ code: 'invalid-required-input', message: 'Synthetic bounded failure.', sources: [{ source: 'traffic', pointer: '' }] }],
  }));
  assert.equal(outcome.matched, true, JSON.stringify(outcome));
  assert.equal(outcome.executionError, null);
  const failedCall = await runObservationCase(item, () => { throw new Error('Synthetic execution exception.'); });
  assert.equal(failedCall.matched, false);
  assert.equal(failedCall.executionError, 'case_execution_failed');
  const malformedResult = await runObservationCase(item, () => ({ status: 'completed', exchanges: [null] }));
  assert.equal(malformedResult.matched, false);
  assert.equal(malformedResult.executionError, 'case_execution_failed');
  const summary = summarizeObservationCases([outcome], [item.caseId]);
  assert.equal(summary.expectedFailedCases, 1);
  assert.equal(summary.observedFailedCases, 1);
  assert.equal(summary.executionErrorCases, 0);
  assert.equal(summary.passed, true);
  assert.equal(summarizeObservationCases([record('a', { executionError: 'failure' })], ['a']).passed, false);
});

test('evaluator self-test: unchanged IDs cannot conceal wrong evidence states or source pointers', () => {
  const expected = { exchanges: [{ exchangeId: 'ex_synthetic', normalizedResponse: 'unavailable',
    requiredSources: [{ source: 'traffic', pointer: '/0' }] }] };
  const actual = { exchanges: [{ exchangeId: 'ex_synthetic', normalizedResponse: 'usable',
    sources: [{ source: 'traffic', pointer: '/1' }] }] };
  const mismatches = compareExpectedProjection(expected, actual);
  assert.ok(mismatches.some((entry) => entry.code === 'value' && entry.location.endsWith('.normalizedResponse')));
  assert.ok(mismatches.some((entry) => entry.code === 'missing_source_reference'));
  assert.ok(compareExpectedProjection(expected, { exchanges: [...actual.exchanges, ...actual.exchanges] }).some((entry) => entry.code === 'array_count'));
});

test('evaluator self-test: each unknown family retains its own denominator', () => {
  const units = unknownObservationUnits({
    status: 'completed', exchanges: [{ exchangeId: 'ex_synthetic', identityKey: 'unattributed',
      normalizedResponse: 'unavailable', raw: { response: 'unknown' } }],
    recorded: { findings: { availability: 'unavailable' } },
    workflows: [{ identityKey: 'unattributed', uncertainties: ['unknown-capture-sequence'] }],
  });
  assert.deepEqual(units.unavailableNormalizedResponses, ['ex_synthetic']);
  assert.deepEqual(units.unknownRawResponses, ['ex_synthetic']);
  assert.deepEqual(units.unattributedExchanges, ['ex_synthetic']);
  assert.deepEqual(units.unavailableFindingCounts, ['recorded.findings']);
  assert.deepEqual(units.workflowUncertainties, ['unattributed:unknown-capture-sequence']);
  assert.ok(Object.values(unknownObservationUnits({ status: 'failed', recorded: { findings: { availability: 'unavailable' } } })).every((entries) => entries.length === 0));
});

test('evaluator self-test: output references resolve against supplied native records only', () => {
  const input = { traffic: [{ exchangeId: 'ex_synthetic' }], blackboard: {}, rawRecords: [] };
  assert.deepEqual(validateObservationReferences({ sources: [{ source: 'traffic', pointer: '/0' }] }, input), []);
  assert.equal(validateObservationReferences({ sources: [{ source: 'traffic', pointer: '/1' }] }, input)[0].code, 'unresolved_source_reference');
  assert.equal(validateObservationReferences({ sources: [{ source: 'other', pointer: '/0' }] }, input)[0].code, 'invalid_source_reference');
});

test('passive observation API agrees with the independently frozen native corpus', { timeout: 120_000 }, async (context) => {
  const report = await evaluateObservationCorpus();
  for (const result of report.cases) await context.test(result.caseId, () => assert.equal(result.matched, true, JSON.stringify(result, null, 2)));
  assert.equal(report.status, 'passed');
  assert.equal(report.totals.expectedCases, CASE_IDS.length);
  assert.equal(report.totals.matchedCases, CASE_IDS.length);
  assert.equal(report.totals.executionErrorCases, 0);
  assert.equal(report.totals.mutatedInputCases, 0);
  assert.deepEqual(report.totals.missingCaseIds, []);
  assert.deepEqual(report.totals.duplicateCaseIds, []);
  for (const family of Object.values(report.totals.unknowns)) {
    assert.equal(family.missed, 0);
    assert.equal(family.unexpected, 0);
  }
});
