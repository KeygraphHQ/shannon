// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import assert from 'node:assert/strict';
import { readFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const DEFAULT_MANIFEST = fileURLToPath(new URL('../apps/worker/test/fixtures/security-review/expected-results.json', import.meta.url));
export const FAMILIES = Object.freeze([
  'openapi/undeclared-security-scheme', 'openapi/undeclared-oauth-scope',
  'compose/privileged', 'compose/host-namespace', 'compose/unconfined-profile', 'compose/expanded-capabilities',
]);
const CATEGORIES = ['positive', 'negative', 'ambiguous'];
const STATUSES = ['completed', 'partial', 'failed'];

/** Validate expected labels without importing or running a rule implementation. */
export async function loadCorpus(manifestPath = DEFAULT_MANIFEST) {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(manifest.schemaVersion, 1, 'unsupported corpus schema');
  assert.equal(typeof manifest.corpusVersion, 'string', 'missing corpus version');
  assert.deepEqual([...manifest.families].sort(), [...FAMILIES].sort(), 'corpus family contract changed');
  assert.ok(Array.isArray(manifest.cases) && manifest.cases.length >= 36, 'at least 36 labeled cases are required');
  const root = await realpath(path.dirname(manifestPath));
  const ids = new Set();
  const inputs = new Set();
  for (const item of manifest.cases) {
    assert.match(item.caseId, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'invalid case id');
    assert.ok(!ids.has(item.caseId), 'duplicate case id'); ids.add(item.caseId);
    assert.ok(!inputs.has(item.input), 'each case must have a separate input'); inputs.add(item.input);
    assert.ok(FAMILIES.includes(item.family) || item.family === 'parser', 'unknown labeled family');
    assert.ok(CATEGORIES.includes(item.category), 'invalid category');
    assert.ok(['openapi', 'compose'].includes(item.format), 'invalid format');
    assert.ok(typeof item.version === 'string' && item.version.length > 0, 'missing input version');
    assert.ok(typeof item.rationale === 'string' && item.rationale.length > 20, 'missing independent rationale');
    assert.ok(Array.isArray(item.primarySources) && item.primarySources.length > 0, 'missing primary sources');
    for (const source of item.primarySources) assert.match(source, /^https:\/\/(?:spec\.openapis\.org|docs\.docker\.com|raw\.githubusercontent\.com|www\.rfc-editor\.org|yaml\.org)\//, 'unexpected source authority');
    assert.ok(STATUSES.includes(item.expected.status), 'invalid expected status');
    assert.ok(Array.isArray(item.expected.issues), 'missing issue labels');
    if (item.category === 'positive') assert.ok(item.expected.issues.some((issue) => issue.ruleId === item.family), 'positive case requires a corresponding issue');
    if (item.category === 'negative') assert.equal(item.expected.issues.filter((issue) => issue.ruleId === item.family).length, 0, 'negative case cannot label a corresponding issue');
    if (item.category === 'ambiguous') assert.notEqual(item.expected.status, 'completed', 'unsupported input cannot be a completed clean pass');
    for (const issue of item.expected.issues) {
      assert.ok(FAMILIES.includes(issue.ruleId), 'unknown expected issue id');
      assert.equal(issue.classification, issue.ruleId.startsWith('openapi/') ? 'contract-consistency' : 'configuration-risk', 'incorrect classification contract');
      assert.equal(issue.applicability, 'declared', 'unexpected applicability');
      assert.ok(typeof issue.pointer === 'string' && (issue.pointer === '' || issue.pointer.startsWith('/')), 'invalid expected JSON pointer');
      assert.doesNotMatch(issue.pointer, /~(?![01])/, 'unescaped JSON pointer token');
    }
    const file = path.resolve(root, item.input);
    const relative = path.relative(root, file);
    assert.ok(relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative), 'input escapes corpus root');
    assert.ok((await lstat(file)).isFile(), 'fixture must be a regular file');
    const resolved = await realpath(file);
    const resolvedRelative = path.relative(root, resolved);
    assert.ok(resolvedRelative !== '..' && !resolvedRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(resolvedRelative), 'linked fixture escapes corpus root');
  }
  for (const family of FAMILIES) {
    for (const category of CATEGORIES) assert.ok(manifest.cases.filter((item) => item.family === family && item.category === category).length >= 2, `missing two ${category} labels for ${family}`);
  }
  return { manifest, root };
}

function issueLabel(issue) {
  return { ruleId: issue.ruleId, classification: issue.classification, applicability: issue.applicability, pointer: issue.evidence?.pointer ?? issue.pointer };
}
const key = (issue) => JSON.stringify(issueLabel(issue));
function difference(left, right) {
  const available = right.map(key);
  return left.filter((issue) => {
    const index = available.indexOf(key(issue));
    if (index < 0) return true;
    available.splice(index, 1); return false;
  }).map(issueLabel);
}

/** Exact multiset comparison; a wrong pointer/classification is both a missing and an unexpected label. */
export function compareCase(item, result, expectedFile) {
  const missing = difference(item.expected.issues, result.issues);
  const unexpected = difference(result.issues, item.expected.issues);
  const problems = [];
  if (result.schemaVersion !== 1 || result.kind !== 'offline-security-review' || result.format !== item.format) problems.push('result_contract_mismatch');
  if (result.status !== item.expected.status) problems.push('status_mismatch');
  if (result.source?.file !== expectedFile || result.issues.some((issue) => issue.evidence?.file !== expectedFile)) problems.push('evidence_file_mismatch');
  if (missing.length) problems.push('missing_expected_issues');
  if (unexpected.length) problems.push('unexpected_issues');
  if (result.status === 'completed' && result.diagnostics.length) problems.push('completed_with_diagnostics');
  if (result.status !== 'completed' && result.diagnostics.length === 0) problems.push('incomplete_without_diagnostics');
  if (result.scope?.basis !== 'local-declarations' || result.scope?.deployedState !== 'not-assessed') problems.push('scope_basis_mismatch');
  const expectedRules = FAMILIES.filter((ruleId) => ruleId.startsWith(`${item.format}/`)).sort();
  const rules = result.scope?.rules;
  if (!Array.isArray(rules) || JSON.stringify(rules.map((rule) => rule.ruleId).sort()) !== JSON.stringify(expectedRules)
    || rules.some((rule) => !['assessed', 'partial', 'unknown'].includes(rule.state))) problems.push('rule_scope_mismatch');
  if (result.status === 'completed' && rules?.some((rule) => rule.state !== 'assessed')) problems.push('completed_with_unknown_scope');
  if (result.issues.some((issue) => typeof issue.message !== 'string' || !issue.message.trim() || typeof issue.remediation !== 'string' || !issue.remediation.trim())) problems.push('missing_issue_guidance');
  if (item.expected.diagnosticCodes) {
    const codes = result.diagnostics.map((diagnostic) => diagnostic.code).sort();
    if (JSON.stringify(codes) !== JSON.stringify([...item.expected.diagnosticCodes].sort())) problems.push('diagnostic_code_mismatch');
  }
  const state = rules?.find((rule) => rule.ruleId === item.family)?.state;
  const abstained = result.status !== 'completed' || state === 'partial' || state === 'unknown';
  return {
    caseId: item.caseId, family: item.family, category: item.category,
    matched: problems.length === 0, expectedStatus: item.expected.status, actualStatus: result.status,
    expectedIssues: item.expected.issues.length, actualIssues: result.issues.length,
    falsePositiveIssues: unexpected.length, falseNegativeIssues: missing.length,
    abstained, missing, unexpected, problems,
    diagnosticCodes: result.diagnostics.map((diagnostic) => diagnostic.code).sort(),
  };
}

function metrics(results) {
  return {
    denominators: {
      cases: results.length,
      positiveCases: results.filter((item) => item.category === 'positive').length,
      negativeCases: results.filter((item) => item.category === 'negative').length,
      ambiguousCases: results.filter((item) => item.category === 'ambiguous').length,
      expectedIssues: results.reduce((sum, item) => sum + item.expectedIssues, 0),
      emittedIssues: results.reduce((sum, item) => sum + item.actualIssues, 0),
    },
    matchedCases: results.filter((item) => item.matched).length,
    falsePositiveIssues: results.reduce((sum, item) => sum + item.falsePositiveIssues, 0),
    falseNegativeIssues: results.reduce((sum, item) => sum + item.falseNegativeIssues, 0),
    abstainedCases: results.filter((item) => item.abstained).length,
    completedCases: results.filter((item) => item.actualStatus === 'completed').length,
    partialCases: results.filter((item) => item.actualStatus === 'partial').length,
    failedCases: results.filter((item) => item.actualStatus === 'failed').length,
    unexpectedCompletedAmbiguousCases: results.filter((item) => item.category === 'ambiguous' && item.actualStatus === 'completed').length,
  };
}

export async function evaluateCorpus({ manifestPath = DEFAULT_MANIFEST, review } = {}) {
  const { manifest, root } = await loadCorpus(manifestPath);
  const reviewFile = review ?? (await import('../apps/worker/dist/security-review/index.js')).reviewFile;
  const caseResults = [];
  for (const item of manifest.cases) {
    const file = path.resolve(root, item.input);
    const before = await readFile(file);
    const result = await reviewFile(item.format, file);
    const compared = compareCase(item, result, file);
    if (!before.equals(await readFile(file))) { compared.problems.push('input_bytes_changed'); compared.matched = false; }
    caseResults.push(compared);
  }
  return {
    schemaVersion: 1, kind: 'security-review-corpus-evaluation', corpusVersion: manifest.corpusVersion,
    basis: 'independently-labeled-synthetic-fixtures',
    limitations: 'Fixture agreement is not field accuracy, complete coverage, or evidence of deployed vulnerability. False-positive and false-negative counts compare exact issue labels; abstentions count incomplete analysis separately.',
    passed: caseResults.every((item) => item.matched),
    totals: metrics(caseResults),
    perFamily: FAMILIES.map((family) => ({ family, ...metrics(caseResults.filter((item) => item.family === family)) })),
    parsing: metrics(caseResults.filter((item) => item.family === 'parser')),
    mismatches: caseResults.filter((item) => !item.matched),
    cases: caseResults,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
    process.stdout.write('Usage: node scripts/evaluate-security-review.mjs\n\nCompare the retained independent corpus with the compiled offline reviewer.\nEmits JSON; exits 0 for exact fixture agreement, 1 for mismatches or execution failure, 2 for usage.\n');
    return;
  }
  if (args.length) { process.stdout.write('{"error":"invalid_evaluation_arguments"}\n'); process.exitCode = 2; return; }
  try {
    const report = await evaluateCorpus();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    process.exitCode = report.passed ? 0 : 1;
  } catch {
    process.stdout.write('{"error":"evaluation_failed","passed":false}\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) await main();
