// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const fixtureUrl = new URL('../apps/worker/test/fixtures/blackbox-observation/', import.meta.url);
export const CASE_IDS = Object.freeze([
  'multi-identity-linked-workflow', 'anonymous-and-unattributed', 'normalized-zero-without-raw',
  'associated-native-raw-quality', 'raw-association-mismatch', 'exact-duplicate-records',
  'conflicting-id-retains-independent-evidence', 'optional-findings-absent', 'optional-findings-invalid',
  'required-traffic-envelope-invalid', 'unsupported-blackboard-schema', 'transition-reference-problems',
  'local-counter-ties-and-gaps', 'exchange-sequence-without-transitions',
  'recorded-incomplete-and-blocked-work', 'unicode-inert-private-metadata',
  'empty-observed-inventory', 'aggregate-exchange-limit',
]);
const sourceKinds = new Set(['traffic', 'blackboard', 'findings', 'raw']);
const unknownFamilies = ['unavailableNormalizedResponses', 'unknownRawResponses', 'unattributedExchanges', 'unavailableFindingCounts', 'workflowUncertainties'];
const skippedExpectationKeys = new Set(['requiredReasonCodes', 'forbiddenReasonCodes', 'diagnosticCodes']);
const recordKeys = ['key', 'exchangeId', 'routeSignature', 'identityKey', 'transitionId', 'id', 'captureSequence', 'after'];
const plain = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = (value) => JSON.stringify(value, (_key, child) => plain(child) ? Object.fromEntries(Object.entries(child).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : child);
const same = (left, right) => canonical(left) === canonical(right);
const pointer = (value) => typeof value === 'string' && (value === '' || value.startsWith('/')) && !/~(?:[^01]|$)/u.test(value);

async function fixturePath(relative) {
  if (typeof relative !== 'string' || !relative.startsWith('sets/') || /[:\\\u0000-\u001f]/u.test(relative)
    || relative.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('invalid_fixture_path');
  const root = await realpath(fileURLToPath(fixtureUrl));
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const entry = await lstat(current);
    if (entry.isSymbolicLink()) throw new Error('linked_fixture_path');
  }
  const resolved = await realpath(current);
  const contained = path.relative(root, resolved);
  if (contained.startsWith('..') || path.isAbsolute(contained)) throw new Error('fixture_escape');
  return resolved;
}

async function readFixtureJson(file) {
  const entry = await lstat(file);
  if (!entry.isFile() || entry.isSymbolicLink() || entry.nlink !== 1 || entry.size > 1024 * 1024) throw new Error('invalid_fixture_file');
  const bytes = await readFile(file);
  return JSON.parse(bytes.toString('utf8'));
}

export async function loadObservationCorpus() {
  const bytes = await readFile(new URL('expected-results.json', fixtureUrl));
  if (bytes.length > 1024 * 1024) throw new Error('corpus_limit');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases) || !Array.isArray(manifest.coverage)) throw new Error('invalid_corpus');
  const ids = manifest.cases.map((item) => item.caseId);
  if (!same([...ids].sort(), [...CASE_IDS].sort()) || new Set(ids).size !== ids.length) throw new Error('changed_finite_case_set');
  const covered = new Set();
  const scenarios = new Set();
  for (const entry of manifest.coverage) {
    if (typeof entry.scenario !== 'string' || scenarios.has(entry.scenario) || !Array.isArray(entry.caseIds)
      || !entry.caseIds.length || entry.caseIds.some((id) => !ids.includes(id))) throw new Error('invalid_scenario_coverage');
    scenarios.add(entry.scenario);
    for (const id of entry.caseIds) covered.add(id);
  }
  if (scenarios.size !== 15 || covered.size !== ids.length) throw new Error('incomplete_finite_coverage');
  for (const item of manifest.cases) {
    if (!scenarios.has(item.scenario) || typeof item.rationale !== 'string' || item.rationale.length < 20
      || !Array.isArray(item.primarySources) || !item.primarySources.includes('docs/goals/blackbox-observation-coverage.md')
      || !['completed', 'partial', 'failed'].includes(item.expected?.status) || !Array.isArray(item.expected?.diagnosticCodes)) throw new Error('invalid_case_expectation');
    await fixturePath(item.set);
  }
  return { manifest, sha256: createHash('sha256').update(bytes).digest('hex') };
}

export async function loadObservationCaseInput(item) {
  const directory = await fixturePath(item.set);
  const traffic = await readFixtureJson(path.join(directory, 'traffic_inventory.json'));
  const blackboard = await readFixtureJson(path.join(directory, 'blackbox_blackboard.json'));
  let findings;
  try { findings = await readFixtureJson(path.join(directory, 'blackbox_authz_findings.json')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const input = { traffic, blackboard, ...(findings === undefined ? {} : { findings }) };
  if (item.rawRequested) {
    const rawDirectory = await fixturePath(`${item.set}/raw`);
    const files = (await readdir(rawDirectory)).sort();
    if (files.length > 32) throw new Error('fixture_raw_limit');
    input.rawRequested = true;
    input.rawRecords = [];
    for (const name of files) {
      if (!/^ex_[a-f0-9]{24}\.json$/u.test(name)) throw new Error('invalid_raw_fixture_name');
      input.rawRecords.push({ exchangeId: name.slice(0, -5), availability: 'available', document: await readFixtureJson(path.join(rawDirectory, name)) });
    }
  }
  return input;
}

function sourceKey(ref) {
  return canonical({ source: ref?.source, pointer: ref?.pointer, ...(ref?.exchangeId === undefined ? {} : { exchangeId: ref.exchangeId }) });
}

/** Compare the predeclared fields exactly; source requirements allow additional contextual references. */
export function compareExpectedProjection(expected, actual, location = '$') {
  const mismatches = [];
  function compare(wanted, observed, at) {
    if (Array.isArray(wanted)) {
      if (!Array.isArray(observed)) { mismatches.push({ code: 'array_shape', location: at }); return; }
      if (wanted.length !== observed.length) mismatches.push({ code: 'array_count', location: at, expected: wanted.length, actual: observed.length });
      const remaining = [...observed];
      for (let index = 0; index < wanted.length; index++) {
        const item = wanted[index];
        const identity = plain(item) ? recordKeys.find((field) => Object.hasOwn(item, field)) : undefined;
        const match = remaining.findIndex((entry) => identity ? plain(entry) && same(item[identity], entry[identity]) : same(item, entry));
        if (match < 0) { mismatches.push({ code: 'missing_array_record', location: `${at}[${index}]` }); continue; }
        const [entry] = remaining.splice(match, 1);
        compare(item, entry, `${at}[${index}]`);
      }
      if (remaining.length) mismatches.push({ code: 'unexpected_array_records', location: at, actual: remaining.length });
    } else if (plain(wanted)) {
      if (!plain(observed)) { mismatches.push({ code: 'object_shape', location: at }); return; }
      for (const [field, value] of Object.entries(wanted)) {
        if (skippedExpectationKeys.has(field)) continue;
        if (field === 'requiredSources') {
          const present = new Set((Array.isArray(observed.sources) ? observed.sources : []).map(sourceKey));
          for (const reference of value) if (!present.has(sourceKey(reference))) mismatches.push({ code: 'missing_source_reference', location: at, expected: reference });
        } else compare(value, observed[field], `${at}.${field}`);
      }
    } else if (!same(wanted, observed)) {
      mismatches.push({ code: 'value', location: at, expected: wanted, actual: observed ?? null });
    }
  }
  compare(expected, actual, location);
  return mismatches;
}

function resolves(document, reference) {
  if (!pointer(reference.pointer)) return false;
  if (reference.pointer === '') return document !== undefined;
  let current = document;
  for (const token of reference.pointer.slice(1).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
    if (current === null || typeof current !== 'object' || !Object.hasOwn(current, token)) return false;
    current = current[token];
  }
  return true;
}

export function validateObservationReferences(result, input) {
  const mismatches = [];
  const visited = new WeakSet();
  let count = 0;
  const raw = new Map((input.rawRecords ?? []).map((entry) => [entry.exchangeId, entry.document]));
  function visit(value) {
    if (value === null || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (++count > 100_000) throw new Error('evaluation_result_limit');
    if (Object.hasOwn(value, 'pointer') && Object.hasOwn(value, 'source')) {
      if (!sourceKinds.has(value.source) || !pointer(value.pointer)) mismatches.push({ code: 'invalid_source_reference' });
      else {
        const document = value.source === 'raw' ? raw.get(value.exchangeId) : input[value.source];
        if (!resolves(document, value)) mismatches.push({ code: 'unresolved_source_reference', reference: value });
      }
    }
    for (const child of Object.values(value)) visit(child);
  }
  visit(result);
  return mismatches;
}

export function compareObservationExpectation(expected, actual, input) {
  const mismatches = compareExpectedProjection(expected, actual);
  if (actual?.schemaVersion !== 1 || actual?.kind !== 'offline-blackbox-observation') mismatches.push({ code: 'result_contract' });
  if (!Array.isArray(actual?.reasons) || !Array.isArray(actual?.diagnostics)) mismatches.push({ code: 'diagnostic_shape' });
  const reasons = new Set((Array.isArray(actual?.reasons) ? actual.reasons : []).map((entry) => entry.code));
  for (const code of expected.requiredReasonCodes ?? []) if (!reasons.has(code)) mismatches.push({ code: 'missing_reason', expected: code });
  for (const code of expected.forbiddenReasonCodes ?? []) if (reasons.has(code)) mismatches.push({ code: 'unjustified_reason', actual: code });
  const diagnostics = [...new Set((Array.isArray(actual?.diagnostics) ? actual.diagnostics : []).map((entry) => entry.code))].sort();
  if (!same(diagnostics, [...expected.diagnosticCodes].sort())) mismatches.push({ code: 'diagnostic_codes', expected: expected.diagnosticCodes, actual: diagnostics });
  mismatches.push(...validateObservationReferences(actual, input));
  const encoded = JSON.stringify(actual);
  if (encoded?.includes('RAW_NOTES_SENTINEL') || encoded?.includes('Host: synthetic.example.invalid') || encoded?.includes('HTTP/1.1 200 Synthetic')) mismatches.push({ code: 'raw_content_exposed' });
  return mismatches;
}

export function unknownObservationUnits(result) {
  const units = Object.fromEntries(unknownFamilies.map((family) => [family, []]));
  if (result?.status === 'failed') return units;
  for (const exchange of Array.isArray(result?.exchanges) ? result.exchanges : []) {
    if (exchange.normalizedResponse === 'unavailable') units.unavailableNormalizedResponses.push(exchange.exchangeId);
    if (['unknown', 'conflicting'].includes(exchange.raw?.response)) units.unknownRawResponses.push(exchange.exchangeId);
    if (exchange.identityKey === 'unattributed') units.unattributedExchanges.push(exchange.exchangeId);
  }
  if (result?.recorded?.findings?.availability === 'unavailable') units.unavailableFindingCounts.push('recorded.findings');
  for (const workflow of Array.isArray(result?.workflows) ? result.workflows : []) for (const code of Array.isArray(workflow.uncertainties) ? workflow.uncertainties : []) units.workflowUncertainties.push(`${workflow.identityKey}:${code}`);
  return units;
}

function unitDifference(expected, actual) {
  const remaining = [...actual];
  let missed = 0;
  for (const item of expected) {
    const index = remaining.indexOf(item);
    if (index < 0) missed++;
    else remaining.splice(index, 1);
  }
  return { expected: expected.length, observed: actual.length, missed, unexpected: remaining.length };
}

export async function runObservationCase(item, analyzeObservation) {
  const record = {
    caseId: item.caseId, scenario: item.scenario, expectedStatus: item.expected.status,
    actualStatus: null, matched: false, executionError: null, inputMutated: false, mismatches: [],
    unknowns: Object.fromEntries(unknownFamilies.map((family) => [family, { expected: 0, observed: 0, missed: 0, unexpected: 0 }])),
  };
  const expectedUnknowns = unknownObservationUnits(item.expected);
  let actualUnknowns = unknownObservationUnits({});
  let actual;
  let input;
  let before;
  try {
    input = await loadObservationCaseInput(item);
    before = JSON.stringify(input);
    actual = analyzeObservation(input, item.limits);
    if (actual?.then instanceof Function) throw new Error('async_analysis_contract');
    record.actualStatus = actual?.status ?? null;
    record.mismatches = compareObservationExpectation(item.expected, actual, input);
    actualUnknowns = unknownObservationUnits(actual);
  } catch {
    record.executionError = 'case_execution_failed';
  } finally {
    if (input !== undefined) {
      try { record.inputMutated = JSON.stringify(input) !== before; }
      catch { record.inputMutated = true; }
    }
  }
  for (const family of unknownFamilies) record.unknowns[family] = unitDifference(expectedUnknowns[family], actualUnknowns[family]);
  record.matched = record.executionError === null && !record.inputMutated && record.mismatches.length === 0;
  return record;
}

/** The expected finite IDs are mandatory: omitted, repeated or additional case results cannot pass. */
export function summarizeObservationCases(cases, expectedIds = CASE_IDS) {
  const counts = new Map();
  for (const item of cases) counts.set(item.caseId, (counts.get(item.caseId) ?? 0) + 1);
  const missingCaseIds = expectedIds.filter((id) => !counts.has(id));
  const duplicateCaseIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
  const unexpectedCaseIds = [...counts.keys()].filter((id) => !expectedIds.includes(id));
  const totals = {
    expectedCases: expectedIds.length, observedCaseResults: cases.length,
    matchedCases: cases.filter((item) => item.matched && item.executionError === null && !item.inputMutated
      && item.mismatches.length === 0 && item.expectedStatus === item.actualStatus).length,
    expectedFailedCases: cases.filter((item) => item.expectedStatus === 'failed').length,
    observedFailedCases: cases.filter((item) => item.actualStatus === 'failed').length,
    unexpectedFailedCases: cases.filter((item) => item.actualStatus === 'failed' && item.expectedStatus !== 'failed').length,
    executionErrorCases: cases.filter((item) => item.executionError !== null).length,
    mismatchCases: cases.filter((item) => item.mismatches.length > 0).length,
    mutatedInputCases: cases.filter((item) => item.inputMutated).length,
    missingCaseIds, duplicateCaseIds, unexpectedCaseIds,
    unknowns: Object.fromEntries(unknownFamilies.map((family) => [family, {
      expected: cases.reduce((sum, item) => sum + item.unknowns[family].expected, 0),
      observed: cases.reduce((sum, item) => sum + item.unknowns[family].observed, 0),
      missed: cases.reduce((sum, item) => sum + item.unknowns[family].missed, 0),
      unexpected: cases.reduce((sum, item) => sum + item.unknowns[family].unexpected, 0),
    }])),
  };
  return { ...totals, passed: missingCaseIds.length === 0 && duplicateCaseIds.length === 0 && unexpectedCaseIds.length === 0
    && cases.length === expectedIds.length && totals.matchedCases === expectedIds.length };
}

export async function evaluateObservationCorpus(api) {
  const { manifest, sha256 } = await loadObservationCorpus();
  const implementation = api ?? await import('../apps/worker/dist/blackbox-observation/index.js');
  const cases = [];
  for (const item of manifest.cases) cases.push(await runObservationCase(item, implementation.analyzeObservation));
  const totals = summarizeObservationCases(cases);
  return {
    schemaVersion: 1, kind: 'blackbox-observation-evaluation', corpusVersion: manifest.corpusVersion,
    expectedManifestSha256: sha256, status: totals.passed ? 'passed' : 'failed',
    interpretation: 'Agreement with the fixed synthetic corpus only. Unknown categories overlap and retain separate denominators. Expected failed analyses are contract outcomes, not evaluator execution errors. Unspecified fields are not scored; no detection-accuracy or authorization-coverage claim.',
    integrationOwnership: manifest.coverage.filter((entry) => entry.additionalIntegrationOwner).map((entry) => entry.additionalIntegrationOwner),
    totals, scenarios: manifest.coverage.map((entry) => ({
      scenario: entry.scenario,
      ...summarizeObservationCases(cases.filter((item) => entry.caseIds.includes(item.caseId)), entry.caseIds),
    })), cases,
  };
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write('Usage: node scripts/evaluate-blackbox-observation.mjs\nEvaluate the fixed synthetic native-artifact corpus using the built passive API. JSON output; exit 0 agreement, 1 mismatch/execution failure, 2 invalid arguments. No live traffic, sessions or network access.\n');
    return 0;
  }
  if (args.length) { process.stderr.write('Invalid evaluation arguments. Use --help.\n'); return 2; }
  try {
    const report = await evaluateObservationCorpus();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return report.status === 'passed' ? 0 : 1;
  } catch {
    process.stderr.write('Observation evaluation failed. Verify the fixed corpus and built passive API.\n');
    return 1;
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) process.exitCode = await main(process.argv.slice(2));
