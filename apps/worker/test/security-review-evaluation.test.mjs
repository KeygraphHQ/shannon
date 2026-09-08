import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { compareCase, evaluateCorpus, FAMILIES, loadCorpus } from '../../../scripts/evaluate-security-review.mjs';
import { reviewFile } from '../dist/security-review/index.js';

const corpus = await loadCorpus();

test('independent manifest binds two positive, negative, and ambiguous cases per family with source rationales', () => {
  assert.equal(corpus.manifest.cases.filter((item) => item.family !== 'parser').length, 36);
  assert.equal(corpus.manifest.cases.filter((item) => item.family === 'parser').length, 5);
  for (const family of FAMILIES) {
    for (const category of ['positive', 'negative', 'ambiguous']) assert.equal(corpus.manifest.cases.filter((item) => item.family === family && item.category === category).length, 2);
  }
  assert.ok(corpus.manifest.cases.some((item) => item.version === '3.0.4' && item.input.endsWith('.json')));
  assert.ok(corpus.manifest.cases.some((item) => item.version === '3.1.1' && item.input.endsWith('.yaml')));
  assert.match(corpus.manifest.labeling.basis, /outputs were not read/);
});

for (const item of corpus.manifest.cases) {
  test(`independent corpus: ${item.caseId} (${item.category})`, async () => {
    const file = path.resolve(corpus.root, item.input);
    const before = await readFile(file);
    const result = await reviewFile(item.format, file);
    const comparison = compareCase(item, result, file);
    assert.equal(comparison.matched, true, JSON.stringify(comparison, null, 2));
    assert.deepEqual(await readFile(file), before, 'input bytes changed');
  });
}

function syntheticResult(item, file, overrides = {}) {
  return {
    schemaVersion: 1, kind: 'offline-security-review', format: item.format, status: item.expected.status,
    source: { file },
    scope: { basis: 'local-declarations', deployedState: 'not-assessed', rules: FAMILIES.filter((ruleId) => ruleId.startsWith(`${item.format}/`)).map((ruleId) => ({ ruleId, state: item.expected.status === 'completed' ? 'assessed' : 'unknown' })) },
    issues: item.expected.issues.map(({ pointer, ...issue }) => ({ ...issue, evidence: { file, pointer }, message: 'Fixed observation.', remediation: 'Fixed remediation.' })),
    diagnostics: item.expected.status === 'completed' ? [] : [{ code: 'synthetic_incomplete', pointer: '', ruleIds: [item.family], message: 'Fixed diagnostic.' }],
    ...overrides,
  };
}

test('evaluator detects wrong rule, classification, applicability, pointer and duplicate issue labels', () => {
  const item = corpus.manifest.cases.find((candidate) => candidate.category === 'positive');
  const file = path.resolve(corpus.root, item.input);
  for (const mutate of [
    (issue) => { issue.ruleId = 'compose/privileged'; },
    (issue) => { issue.classification = 'configuration-risk'; },
    (issue) => { issue.applicability = 'deployed'; },
    (issue) => { issue.evidence.pointer = '/wrong'; },
  ]) {
    const result = syntheticResult(item, file); mutate(result.issues[0]);
    const compared = compareCase(item, result, file);
    assert.equal(compared.matched, false);
    assert.equal(compared.falsePositiveIssues, 1);
    assert.equal(compared.falseNegativeIssues, 1);
  }
  const duplicate = syntheticResult(item, file); duplicate.issues.push(structuredClone(duplicate.issues[0]));
  assert.equal(compareCase(item, duplicate, file).falsePositiveIssues, 1);
});

test('empty output cannot turn ambiguous or failed input into a clean corpus pass', () => {
  for (const item of corpus.manifest.cases.filter((candidate) => candidate.category === 'ambiguous')) {
    const file = path.resolve(corpus.root, item.input);
    const result = syntheticResult(item, file, { status: 'completed', issues: [], diagnostics: [] });
    assert.ok(compareCase(item, result, file).problems.includes('status_mismatch'));
  }
});

test('evaluation reports per-family denominators, exact-label errors, and abstentions separately', async () => {
  const report = await evaluateCorpus({ review: async (format, file) => {
    const item = corpus.manifest.cases.find((candidate) => path.resolve(corpus.root, candidate.input) === file);
    assert.equal(item.format, format);
    const result = syntheticResult(item, file);
    if (item.caseId === 'scheme-root-missing') result.issues = [];
    if (item.caseId === 'privileged-literal-false') result.issues = [{ ruleId: 'compose/privileged', classification: 'configuration-risk', applicability: 'declared', evidence: { file, pointer: '/services/worker/privileged' }, message: 'Fixed wrong observation.', remediation: 'Fixed remediation.' }];
    return result;
  } });
  assert.equal(report.passed, false);
  assert.equal(report.totals.denominators.cases, 41);
  assert.equal(report.totals.denominators.expectedIssues, 12);
  assert.equal(report.totals.falsePositiveIssues, 1);
  assert.equal(report.totals.falseNegativeIssues, 1);
  assert.equal(report.totals.abstainedCases, 17);
  assert.equal(report.totals.partialCases, 12);
  assert.equal(report.totals.failedCases, 5);
  assert.equal(report.mismatches.length, 2);
  for (const family of report.perFamily) {
    assert.deepEqual(family.denominators, { cases: 6, positiveCases: 2, negativeCases: 2, ambiguousCases: 2, expectedIssues: 2, emittedIssues: family.family === 'openapi/undeclared-security-scheme' ? 1 : family.family === 'compose/privileged' ? 3 : 2 });
    assert.equal(family.abstainedCases, 2);
  }
  assert.match(report.limitations, /not field accuracy/);
});
