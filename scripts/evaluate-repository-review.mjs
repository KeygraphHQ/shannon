// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const corpusUrl = new URL('../apps/worker/test/fixtures/repository-review/', import.meta.url);
const states = ['new', 'unchanged', 'removed', 'unknown'];
const formats = ['compose', 'openapi'];
const ruleIds = new Set([
  'openapi/undeclared-security-scheme', 'openapi/undeclared-oauth-scope',
  'compose/privileged', 'compose/host-namespace', 'compose/unconfined-profile',
  'compose/expanded-capabilities',
]);
export const SCENARIOS = Object.freeze([
  'mixed-format discovery', 'explicit nonstandard filenames', 'excluded/generated content',
  'empty inventory', 'new observation', 'unchanged observation', 'supported removal',
  'equivalent reordering', 'deleted file/ambiguous rename', 'incomplete baseline',
  'incomplete candidate', 'incompatible or malformed snapshot', 'aggregate-limit exhaustion',
  'output/Unicode-path handling',
]);

const key = (value) => JSON.stringify(value);
const counts = (changes) => Object.fromEntries(states.map((state) => [state, changes.filter((change) => change.state === state).length]));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const isPortablePath = (value) => typeof value === 'string' && value.length > 0 && !/[:\\\u0000-\u001f]/u.test(value)
  && !value.startsWith('/') && value.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
const isPointer = (value) => typeof value === 'string' && (value === '' || value.startsWith('/')) && !/~(?:[^01]|$)/u.test(value);

function requireLabel(label) {
  if (!isObject(label) || !ruleIds.has(label.ruleId) || label.applicability !== 'declared'
    || label.classification !== (label.ruleId.startsWith('openapi/') ? 'contract-consistency' : 'configuration-risk')
    || !isPortablePath(label.file) || !isPointer(label.pointer)) throw new Error('invalid_corpus_label');
}

function validateSnapshotExpectation(expected) {
  if (!isObject(expected) || !Array.isArray(expected.statuses) || expected.statuses.length === 0
    || expected.statuses.some((status) => !['completed', 'partial', 'failed'].includes(status))
    || !['complete', 'incomplete'].includes(expected.discoveryState)) throw new Error('invalid_snapshot_expectation');
  if (expected.files !== undefined) {
    if (!Array.isArray(expected.files)) throw new Error('invalid_expected_inventory');
    const seen = new Set();
    for (const file of expected.files) {
      if (!isPortablePath(file.path) || seen.has(file.path) || !formats.includes(file.format)
        || !['completed', 'partial', 'failed'].includes(file.status) || !Array.isArray(file.observations)) throw new Error('invalid_expected_file');
      seen.add(file.path);
      for (const label of file.observations) {
        requireLabel(label);
        if (label.file !== file.path || !label.ruleId.startsWith(`${file.format}/`)) throw new Error('inconsistent_expected_file');
      }
    }
  }
}

/** Read only the fixed synthetic corpus. Primary-source URLs are documentation metadata. */
export async function loadRepositoryCorpus() {
  const manifest = JSON.parse(await readFile(new URL('expected-results.json', corpusUrl), 'utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) || manifest.cases.length > 64
    || !Array.isArray(manifest.coverage)) throw new Error('invalid_repository_corpus');
  const ids = new Set();
  for (const item of manifest.cases) {
    if (!/^[a-z0-9-]+$/u.test(item.caseId) || ids.has(item.caseId) || !SCENARIOS.includes(item.scenario)
      || !['repository', 'comparison', 'snapshot-mutation'].includes(item.kind)
      || typeof item.rationale !== 'string' || item.rationale.length < 20
      || !Array.isArray(item.primarySources) || !item.primarySources.includes('docs/goals/repository-review.md')) throw new Error('invalid_repository_case');
    ids.add(item.caseId);
    for (const source of item.primarySources) {
      if (!['docs/goals/repository-review.md', 'docs/repository-review-plan.md'].includes(source)
        && !/^https:\/\/(?:docs\.docker\.com|spec\.openapis\.org|www\.rfc-editor\.org)\//u.test(source)) throw new Error('invalid_primary_source');
    }
    const descriptors = item.kind === 'repository' ? [item] : [item.baseline, item.candidate];
    for (const descriptor of descriptors) {
      if (!isObject(descriptor) || !isPortablePath(descriptor.project) || !descriptor.project.startsWith('projects/')
        || !isObject(descriptor.options)) throw new Error('invalid_fixture_project');
      await projectPath(descriptor.project);
    }
    if (item.kind === 'repository') validateSnapshotExpectation(item.expected.snapshot);
    else {
      validateSnapshotExpectation(item.expected.baseline);
      validateSnapshotExpectation(item.expected.candidate);
      const comparison = item.expected.comparison;
      if (!isObject(comparison) || !['completed', 'partial', 'failed'].includes(comparison.status)
        || typeof comparison.compatible !== 'boolean' || !Array.isArray(comparison.changes)) throw new Error('invalid_comparison_expectation');
      for (const change of comparison.changes) {
        if (!states.includes(change.state) || (change.before === null && change.after === null)) throw new Error('invalid_expected_change');
        if (change.before !== null) requireLabel(change.before);
        if (change.after !== null) requireLabel(change.after);
      }
      if (states.some((state) => comparison.counts[state] !== counts(comparison.changes)[state])) throw new Error('inconsistent_expected_counts');
    }
    if (item.kind === 'snapshot-mutation' && (!['invalidate-id', 'change-policy', 'change-reviewer-digest'].includes(item.mutation?.kind)
      || !['baseline', 'candidate'].includes(item.mutation.side))) throw new Error('invalid_snapshot_mutation');
  }
  if (key(manifest.coverage.map((entry) => entry.scenario).sort()) !== key([...SCENARIOS].sort())) throw new Error('incomplete_scenario_coverage');
  for (const entry of manifest.coverage) {
    if (!Array.isArray(entry.caseIds) || entry.caseIds.length === 0 || entry.caseIds.some((id) => !ids.has(id))) throw new Error('invalid_scenario_mapping');
  }
  return manifest;
}

async function projectPath(relative) {
  if (!isPortablePath(relative) || !relative.startsWith('projects/')) throw new Error('unsafe_fixture_project');
  const root = await realpath(fileURLToPath(corpusUrl));
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const entry = await lstat(current);
    if (entry.isSymbolicLink() || !entry.isDirectory()) throw new Error('unsafe_fixture_directory');
  }
  const resolved = await realpath(current);
  const contained = path.relative(root, resolved);
  if (contained.startsWith('..') || path.isAbsolute(contained)) throw new Error('fixture_escape');
  return resolved;
}

async function fingerprintProject(project) {
  const root = await projectPath(project);
  const files = new Map();
  let entries = 0;
  let bytes = 0;
  async function visit(directory, prefix = '') {
    for (const name of (await readdir(directory)).sort()) {
      if (++entries > 256) throw new Error('fixture_inventory_limit');
      const file = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error('fixture_link');
      if (stat.isDirectory()) await visit(file, relative);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 2 * 1024 * 1024) throw new Error('fixture_byte_limit');
        const content = await readFile(file);
        files.set(relative, { bytes: content.length, sha256: createHash('sha256').update(content).digest('hex') });
      } else throw new Error('fixture_special_file');
    }
  }
  await visit(root);
  return { root, files };
}

export function issueLabel(issue) {
  return {
    ruleId: issue?.ruleId ?? null, classification: issue?.classification ?? null,
    applicability: issue?.applicability ?? null, file: issue?.evidence?.file ?? null,
    pointer: issue?.evidence?.pointer ?? null,
  };
}

export function changeLabel(change) {
  return {
    state: change?.state ?? null,
    before: change?.before === null ? null : issueLabel(change?.before?.issue),
    after: change?.after === null ? null : issueLabel(change?.after?.issue),
  };
}

/** Multisets retain duplicate mistakes; a wrong pointer or state is one miss and one unexpected record. */
export function labelDifference(expected, actual) {
  const remaining = actual.map((item) => ({ item, key: key(item) }));
  const missed = [];
  for (const item of expected) {
    const index = remaining.findIndex((candidate) => candidate.key === key(item));
    if (index < 0) missed.push(item);
    else remaining.splice(index, 1);
  }
  return { missed, unexpected: remaining.map(({ item }) => item) };
}

export function compareSnapshotExpectation(expected, snapshot, fingerprints) {
  const mismatches = [];
  if (!isObject(snapshot) || !Array.isArray(snapshot.files) || !isObject(snapshot.discovery)) return ['snapshot_shape'];
  if (snapshot.schemaVersion !== 1 || snapshot.kind !== 'offline-repository-review' || typeof snapshot.id !== 'string' || snapshot.id.length === 0) mismatches.push('snapshot_contract');
  if (!expected.statuses.includes(snapshot.status)) mismatches.push('snapshot_status');
  if (snapshot.discovery.state !== expected.discoveryState) mismatches.push('discovery_state');
  for (const counter of ['entriesVisited', 'selectedBytes', 'ignoredFiles']) {
    if (!Number.isSafeInteger(snapshot.discovery[counter]) || snapshot.discovery[counter] < 0) mismatches.push(`discovery_${counter}`);
  }
  if (!Array.isArray(snapshot.diagnostics)) mismatches.push('snapshot_diagnostics_shape');
  if (expected.diagnosticsRequired && !(snapshot.diagnostics?.length > 0)) mismatches.push('snapshot_diagnostics_missing');
  if (expected.ignoredFilesAtLeast !== undefined && snapshot.discovery.ignoredFiles < expected.ignoredFilesAtLeast) mismatches.push('ignored_inventory');
  if (expected.maxEntriesVisited !== undefined && snapshot.discovery.entriesVisited > expected.maxEntriesVisited) mismatches.push('entry_limit');
  if (expected.maxReviewedFiles !== undefined && snapshot.files.filter((file) => file.result?.status === 'completed').length > expected.maxReviewedFiles) mismatches.push('reviewed_file_limit');
  if (!Array.isArray(snapshot.discovery.skipped)) mismatches.push('skipped_inventory_shape');
  for (const prefix of expected.skippedPrefixes ?? []) {
    if (!snapshot.discovery.skipped?.some((entry) => entry.path === prefix || entry.path?.startsWith(`${prefix}/`))) mismatches.push(`skipped_inventory:${prefix}`);
  }
  if (expected.files) {
    const difference = labelDifference(expected.files.map((file) => file.path), snapshot.files.map((file) => file.path));
    if (difference.missed.length || difference.unexpected.length) mismatches.push('selected_file_inventory');
  }
  let knownBytes = 0;
  for (const file of snapshot.files) {
    if (!isPortablePath(file.path) || !formats.includes(file.format)) mismatches.push('file_path_or_format');
    if (!Array.isArray(file.observations) || !Array.isArray(file.result?.issues)) { mismatches.push('file_observations_shape'); continue; }
    if (file.result.source?.file !== file.path || file.result.format !== file.format) mismatches.push(`file_source:${file.path}`);
    if (file.result.scope?.basis !== 'local-declarations' || file.result.scope?.deployedState !== 'not-assessed') mismatches.push(`file_scope:${file.path}`);
    if (file.bytes !== null) {
      if (!Number.isSafeInteger(file.bytes) || file.bytes < 0) mismatches.push(`file_bytes:${file.path}`);
      else knownBytes += file.bytes;
    }
    if ((file.sha256 === null) !== (file.bytes === null)) mismatches.push(`file_fingerprint_pair:${file.path}`);
    if (file.sha256 !== null && !/^[a-f0-9]{64}$/u.test(file.sha256)) mismatches.push(`file_fingerprint:${file.path}`);
    const fingerprint = fingerprints?.get(file.path);
    if (fingerprints && (!fingerprint || (file.sha256 !== null && (file.sha256 !== fingerprint.sha256 || file.bytes !== fingerprint.bytes)))) mismatches.push(`file_content_association:${file.path}`);
    for (const observation of file.observations) {
      if (typeof observation.identity !== 'string' || observation.identity.length === 0) mismatches.push(`observation_identity:${file.path}`);
      if (observation.issue?.evidence?.file !== file.path || !isPointer(observation.issue?.evidence?.pointer)) mismatches.push(`evidence_path:${file.path}`);
    }
    const observed = file.observations.map((observation) => issueLabel(observation.issue));
    const associated = labelDifference(file.result.issues.map(issueLabel), observed);
    if (associated.missed.length || associated.unexpected.length) mismatches.push(`observation_issue_association:${file.path}`);
    const fileExpected = expected.files?.find((entry) => entry.path === file.path);
    if (fileExpected) {
      if (file.format !== fileExpected.format || file.result.status !== fileExpected.status) mismatches.push(`file_status_or_format:${file.path}`);
      const difference = labelDifference(fileExpected.observations, observed);
      if (difference.missed.length || difference.unexpected.length) mismatches.push(`file_observation_labels:${file.path}`);
      if (fileExpected.status === 'completed' && (file.sha256 === null || file.bytes === null)) mismatches.push(`completed_file_fingerprint:${file.path}`);
    }
  }
  if (snapshot.discovery.selectedBytes < knownBytes) mismatches.push('selected_byte_accounting');
  return mismatches;
}

export function compareComparisonExpectation(expected, comparison) {
  const mismatches = [];
  const changes = Array.isArray(comparison?.changes) ? comparison.changes.map(changeLabel) : [];
  if (!isObject(comparison) || comparison.schemaVersion !== 1 || comparison.kind !== 'offline-repository-comparison' || !Array.isArray(comparison.changes)) mismatches.push('comparison_contract');
  if (comparison?.status !== expected.status) mismatches.push('comparison_status');
  if (comparison?.compatible !== expected.compatible) mismatches.push('comparison_compatibility');
  const actualCounts = counts(changes);
  for (const state of states) {
    if (comparison?.counts?.[state] !== expected.counts[state]) mismatches.push(`expected_count:${state}`);
    if (comparison?.counts?.[state] !== actualCounts[state]) mismatches.push(`reported_count:${state}`);
  }
  if (!Array.isArray(comparison?.diagnostics)) mismatches.push('comparison_diagnostics_shape');
  if (expected.diagnosticsRequired && !(comparison?.diagnostics?.length > 0)) mismatches.push('comparison_diagnostics_missing');
  if (expected.status === 'completed' && comparison?.diagnostics?.length) mismatches.push('completed_comparison_diagnostics');
  for (const change of comparison?.changes ?? []) {
    if (typeof change.reason !== 'string' || change.reason.length === 0) mismatches.push('change_reason');
    if (change.state === 'unchanged' && (typeof change.before?.identity !== 'string' || change.before.identity !== change.after?.identity)) mismatches.push('unchanged_identity');
  }
  const difference = labelDifference(expected.changes, changes);
  if (difference.missed.length) mismatches.push('missed_changes');
  if (difference.unexpected.length) mismatches.push('unexpected_changes');
  return { mismatches, ...difference, actualCounts, changes };
}

export function mutateSnapshot(snapshot, mutation, sealSnapshot) {
  const cloned = structuredClone(snapshot);
  if (mutation.kind === 'invalidate-id') {
    cloned.id = `${cloned.id}x`;
    return cloned;
  }
  const { id: _id, ...body } = cloned;
  if (mutation.kind === 'change-policy') body.policy.excludes = [...body.policy.excludes, mutation.exclude];
  else if (mutation.kind === 'change-reviewer-digest') {
    const digest = body.reviewer.digest;
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/u.test(digest)) throw new Error('invalid_reviewer_digest');
    body.reviewer.digest = `${digest[0] === '0' ? '1' : '0'}${digest.slice(1)}`;
  } else throw new Error('unsupported_corpus_mutation');
  return sealSnapshot(body);
}

export async function runRepositoryCase(item, api, cache = new Map()) {
  const expectedChanges = item.expected.comparison?.changes ?? [];
  const record = {
    caseId: item.caseId, scenario: item.scenario, kind: item.kind, matched: false,
    expectedChangeCounts: counts(expectedChanges), actualChangeCounts: counts([]),
    missed: [], unexpected: [], snapshotMismatches: [], comparisonMismatches: [], executionErrors: [],
    inputsUnchanged: true,
  };
  const descriptors = item.kind === 'repository' ? [item] : [item.baseline, item.candidate];
  const captured = new Map();
  try {
    for (const descriptor of descriptors) if (!captured.has(descriptor.project)) captured.set(descriptor.project, await fingerprintProject(descriptor.project));
    async function review(descriptor) {
      const cacheKey = key([descriptor.project, descriptor.options]);
      if (!cache.has(cacheKey)) cache.set(cacheKey, Promise.resolve(api.reviewRepository(captured.get(descriptor.project).root, structuredClone(descriptor.options))));
      return structuredClone(await cache.get(cacheKey));
    }
    if (item.kind === 'repository') {
      const snapshot = await review(item);
      record.snapshotMismatches.push(...compareSnapshotExpectation(item.expected.snapshot, snapshot, captured.get(item.project).files));
    } else {
      let baseline = await review(item.baseline);
      let candidate = await review(item.candidate);
      record.snapshotMismatches.push(...compareSnapshotExpectation(item.expected.baseline, baseline, captured.get(item.baseline.project).files).map((mismatch) => `baseline:${mismatch}`));
      record.snapshotMismatches.push(...compareSnapshotExpectation(item.expected.candidate, candidate, captured.get(item.candidate.project).files).map((mismatch) => `candidate:${mismatch}`));
      if (item.mutation) {
        if (item.mutation.side === 'baseline') baseline = mutateSnapshot(baseline, item.mutation, api.sealSnapshot);
        else candidate = mutateSnapshot(candidate, item.mutation, api.sealSnapshot);
      }
      const beforeComparison = key([baseline, candidate]);
      const comparison = api.compareSnapshots(baseline, candidate);
      const compared = compareComparisonExpectation(item.expected.comparison, comparison);
      record.comparisonMismatches.push(...compared.mismatches);
      if (beforeComparison !== key([baseline, candidate])) record.comparisonMismatches.push('comparison_mutated_inputs');
      if (item.mutation?.kind !== 'invalidate-id' && (comparison.baselineId !== baseline.id || comparison.candidateId !== candidate.id)) record.comparisonMismatches.push('comparison_snapshot_ids');
      Object.assign(record, { missed: compared.missed, unexpected: compared.unexpected, actualChangeCounts: compared.actualCounts });
    }
  } catch {
    record.executionErrors.push('case_execution_failed');
    record.missed = expectedChanges;
  } finally {
    for (const [project, before] of captured) {
      try {
        const after = await fingerprintProject(project);
        if (key([...before.files]) !== key([...after.files])) record.inputsUnchanged = false;
      } catch { record.inputsUnchanged = false; }
    }
  }
  record.matched = record.snapshotMismatches.length === 0 && record.comparisonMismatches.length === 0
    && record.executionErrors.length === 0 && record.inputsUnchanged;
  return record;
}

export function summarizeRepositoryCases(cases) {
  const expected = counts([]);
  const actual = counts([]);
  for (const item of cases) for (const state of states) {
    expected[state] += item.expectedChangeCounts[state];
    actual[state] += item.actualChangeCounts[state];
  }
  return {
    cases: cases.length, matchedCases: cases.filter((item) => item.matched).length,
    repositoryCases: cases.filter((item) => item.kind === 'repository').length,
    comparisonCases: cases.filter((item) => item.kind !== 'repository').length,
    expectedChangeRecords: Object.values(expected).reduce((sum, value) => sum + value, 0),
    actualChangeRecords: Object.values(actual).reduce((sum, value) => sum + value, 0),
    expectedByState: expected, actualByState: actual,
    missedChanges: cases.reduce((sum, item) => sum + item.missed.filter((change) => change.state !== 'unknown').length, 0),
    unexpectedChanges: cases.reduce((sum, item) => sum + item.unexpected.filter((change) => change.state !== 'unknown').length, 0),
    unknown: {
      expected: expected.unknown, actual: actual.unknown,
      missed: cases.reduce((sum, item) => sum + item.missed.filter((change) => change.state === 'unknown').length, 0),
      unexpected: cases.reduce((sum, item) => sum + item.unexpected.filter((change) => change.state === 'unknown').length, 0),
    },
    snapshotMismatchCases: cases.filter((item) => item.snapshotMismatches.length > 0).length,
    executionErrorCases: cases.filter((item) => item.executionErrors.length > 0).length,
    mutatedInputCases: cases.filter((item) => !item.inputsUnchanged).length,
  };
}

export async function evaluateRepositoryCorpus(api) {
  const manifest = await loadRepositoryCorpus();
  const implementation = api ?? await import('../apps/worker/dist/security-review/index.js');
  const cache = new Map();
  const cases = [];
  for (const item of manifest.cases) cases.push(await runRepositoryCase(item, implementation, cache));
  const totals = summarizeRepositoryCases(cases);
  return {
    schemaVersion: 1, kind: 'repository-review-evaluation', corpusVersion: manifest.corpusVersion,
    status: totals.matchedCases === totals.cases ? 'passed' : 'failed',
    interpretation: 'Agreement with this finite synthetic corpus only. Change records and unknown outcomes have separate denominators; this is not field accuracy or complete repository coverage.',
    integrationOwnership: manifest.coverage.filter((item) => item.additionalIntegrationOwner).map((item) => item.additionalIntegrationOwner),
    totals, scenarios: manifest.coverage.map((entry) => ({
      scenario: entry.scenario,
      ...summarizeRepositoryCases(cases.filter((item) => entry.caseIds.includes(item.caseId))),
    })), cases,
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/evaluate-repository-review.mjs\nEvaluates the fixed, local synthetic repository corpus against the built public API. Emits JSON; exit 0 agreement, 1 mismatch/failure, 2 invalid arguments.\n');
    return 0;
  }
  if (args.length) { process.stderr.write('Invalid evaluation arguments. Use --help.\n'); return 2; }
  try {
    const report = await evaluateRepositoryCorpus();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === 'passed' ? 0 : 1;
  } catch {
    process.stderr.write('Repository evaluation failed. Verify the corpus and built public API.\n');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
