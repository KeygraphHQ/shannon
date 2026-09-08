// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SCENARIOS, changeLabel, compareComparisonExpectation, evaluateRepositoryCorpus,
  labelDifference, loadRepositoryCorpus, mutateSnapshot, summarizeRepositoryCases,
} from '../../../scripts/evaluate-repository-review.mjs';

const label = {
  ruleId: 'compose/privileged', classification: 'configuration-risk', applicability: 'declared',
  file: 'compose.yml', pointer: '/services/app/privileged',
};
const observation = {
  identity: 'synthetic-declaration', issue: {
    ruleId: label.ruleId, classification: label.classification, applicability: label.applicability,
    evidence: { file: label.file, pointer: label.pointer },
  },
};
const zero = { new: 0, unchanged: 0, removed: 0, unknown: 0 };

test('independent manifest covers the finite goal scenarios and keeps integration ownership explicit', async () => {
  const corpus = await loadRepositoryCorpus();
  assert.deepEqual(corpus.coverage.map((entry) => entry.scenario).sort(), [...SCENARIOS].sort());
  assert.match(corpus.labeling.basis, /implementations and outputs were not read/u);
  assert.match(corpus.coverage.find((entry) => entry.scenario === 'output/Unicode-path handling').additionalIntegrationOwner, /CLI/u);
  const comparisons = corpus.cases.filter((item) => item.kind !== 'repository');
  assert.ok(comparisons.some((item) => item.expected.comparison.counts.new > 0));
  assert.ok(comparisons.some((item) => item.expected.comparison.counts.removed > 0));
  assert.ok(comparisons.some((item) => item.expected.comparison.counts.unknown > 0));
});

test('evaluator self-test: multiset matching preserves duplicated and incorrectly located evidence', () => {
  const movedPointer = { ...label, pointer: '/services/other/privileged' };
  assert.deepEqual(labelDifference([label], [label, label]), { missed: [], unexpected: [label] });
  assert.deepEqual(labelDifference([label], [movedPointer]), { missed: [label], unexpected: [movedPointer] });
});

test('evaluator self-test: an unjustified new result cannot pass an expected unknown result', () => {
  const expected = {
    status: 'partial', compatible: true, counts: { ...zero, unknown: 1 }, diagnosticsRequired: true,
    changes: [{ state: 'unknown', before: null, after: label }],
  };
  const actual = {
    schemaVersion: 1, kind: 'offline-repository-comparison', status: 'completed', compatible: true,
    counts: { ...zero, new: 1 }, diagnostics: [],
    changes: [{ state: 'new', reason: 'synthetic_reason', before: null, after: observation }],
  };
  const result = compareComparisonExpectation(expected, actual);
  assert.deepEqual(result.missed, expected.changes);
  assert.deepEqual(result.unexpected, actual.changes.map(changeLabel));
  const summary = summarizeRepositoryCases([{
    kind: 'comparison', matched: false, expectedChangeCounts: expected.counts, actualChangeCounts: result.actualCounts,
    ...result, snapshotMismatches: [], executionErrors: [], inputsUnchanged: true,
  }]);
  assert.equal(summary.expectedChangeRecords, 1);
  assert.equal(summary.actualChangeRecords, 1);
  assert.equal(summary.missedChanges, 0);
  assert.equal(summary.unexpectedChanges, 1);
  assert.deepEqual(summary.unknown, { expected: 1, actual: 0, missed: 1, unexpected: 0 });
});

test('evaluator self-test: compatible matches require equal opaque identities and honest totals', () => {
  const expected = {
    status: 'completed', compatible: true, counts: { ...zero, unchanged: 1 },
    changes: [{ state: 'unchanged', before: label, after: label }],
  };
  const actual = {
    schemaVersion: 1, kind: 'offline-repository-comparison', status: 'completed', compatible: true,
    counts: { ...zero, unchanged: 2 }, diagnostics: [],
    changes: [{ state: 'unchanged', reason: 'synthetic_reason', before: observation, after: { ...observation, identity: 'different-declaration' } }],
  };
  const result = compareComparisonExpectation(expected, actual);
  assert.ok(result.mismatches.includes('unchanged_identity'));
  assert.ok(result.mismatches.includes('reported_count:unchanged'));
  assert.equal(result.missed.length, 0);
  assert.equal(result.unexpected.length, 0);
});

test('evaluator self-test: incompatibility mutations reseal without copying a stale snapshot ID', () => {
  const snapshot = { id: 'synthetic-id', reviewer: { digest: 'a'.repeat(64) }, policy: { excludes: ['build'] } };
  let received;
  const sealed = mutateSnapshot(snapshot, { kind: 'change-policy', exclude: 'other' }, (body) => {
    received = body;
    return { ...body, id: 'replacement-id' };
  });
  assert.equal(Object.hasOwn(received, 'id'), false);
  assert.deepEqual(sealed.policy.excludes, ['build', 'other']);
  assert.deepEqual(snapshot.policy.excludes, ['build']);
  assert.equal(snapshot.id, 'synthetic-id');
  const invalid = mutateSnapshot(snapshot, { kind: 'invalidate-id' }, () => assert.fail('invalid ID must not be resealed'));
  assert.notEqual(invalid.id, snapshot.id);
  assert.deepEqual(invalid.policy, snapshot.policy);
});

test('repository and comparison API agree with independent project fixtures', { timeout: 180_000 }, async (context) => {
  const report = await evaluateRepositoryCorpus();
  for (const result of report.cases) {
    await context.test(result.caseId, () => assert.equal(result.matched, true, JSON.stringify(result, null, 2)));
  }
  assert.equal(report.status, 'passed');
  assert.equal(report.totals.matchedCases, report.totals.cases);
  assert.equal(report.totals.missedChanges, 0);
  assert.equal(report.totals.unexpectedChanges, 0);
  assert.equal(report.totals.unknown.missed, 0);
  assert.equal(report.totals.unknown.unexpected, 0);
  assert.equal(report.totals.mutatedInputCases, 0);
});
