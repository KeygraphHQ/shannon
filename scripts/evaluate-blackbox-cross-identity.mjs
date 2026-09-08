import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const compare = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const corpusRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/worker/test/fixtures/blackbox-cross-identity');
const nativeRawId = /^ex_[a-f0-9]{24}$/u;
const reportKind = 'offline-blackbox-cross-identity-evaluation';

export const CASE_IDS = Object.freeze([
  'recorded-set-relations',
  'raw-request-classes-and-shared-occurrence',
  'raw-body-content-type-framing',
  'named-anonymous-unattributed-membership',
  'recorded-owner-context',
  'incomplete-and-raw-unavailable',
  'comparison-limit',
  'outer-key-collision',
  'duplicate-native-envelope',
  'reordered-native-input',
  'different-saved-request-body',
  'saved-body-values-and-unframed',
  'raw-response-states',
  'findings-empty',
  'findings-absent',
  'framing-rejections',
  'integration-boundaries',
]);

const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
const clone = value => structuredClone(value);

function pointerValue(document, pointer) {
  if (pointer === '') return document;
  if (typeof pointer !== 'string' || !pointer.startsWith('/')) return undefined;
  return pointer.slice(1).split('/').reduce((value, segment) => {
    if (value === undefined || value === null) return undefined;
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(value) && /^(?:0|[1-9][0-9]*)$/u.test(key)) return value[Number(key)];
    return Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }, document);
}

function mismatch(path, expected, actual, mismatches) {
  const shape = value => value === undefined
    ? 'missing'
    : value === null
      ? 'null'
      : Array.isArray(value)
        ? 'array'
        : typeof value;
  mismatches.push({ path, expectedType: shape(expected), actualType: shape(actual) });
}

function compareExact(actual, expected, path, mismatches) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return mismatch(path, expected, actual, mismatches);
    if (actual.length !== expected.length) mismatch(`${path}/length`, expected.length, actual.length, mismatches);
    for (let index = 0; index < expected.length; index += 1)
      compareExact(actual[index], expected[index], `${path}/${index}`, mismatches);
    return;
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return mismatch(path, expected, actual, mismatches);
    const expectedKeys = Object.keys(expected).sort(compare);
    const actualKeys = Object.keys(actual).sort(compare);
    if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) mismatch(`${path}/keys`, expectedKeys, actualKeys, mismatches);
    for (const key of expectedKeys) compareExact(actual[key], expected[key], `${path}/${key}`, mismatches);
    return;
  }
  if (!Object.is(actual, expected)) mismatch(path, expected, actual, mismatches);
}

/** Copy only fields named by the frozen expectation before comparing production output. */
export function projectCrossIdentityResult(actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return undefined;
    return actual.map((entry, index) => index < expected.length
      ? projectCrossIdentityResult(entry, expected[index])
      : null);
  }
  if (expected !== null && typeof expected === 'object') {
    if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return undefined;
    return Object.fromEntries(Object.keys(expected).map(key => [
      key,
      projectCrossIdentityResult(actual[key], expected[key]),
    ]));
  }
  if (Object.is(actual, expected)) return expected;
  if (expected === null) return actual === undefined ? undefined : {};
  return null;
}

/** Compare only the frozen projection; every projected array and source list is exact. */
export function compareExpectedCrossIdentityProjection(actual, expected) {
  const mismatches = [];
  compareExact(actual, expected, '', mismatches);
  const relationNames = ['statusRelation', 'fingerprintRelation', 'bodyRelation', 'contentTypeRelation'];
  const relationKeys = comparisons => {
    if (!Array.isArray(comparisons)) return [];
    return comparisons.flatMap(comparison => {
      if (comparison === null || typeof comparison !== 'object' || Array.isArray(comparison)) return [];
      return relationNames
        .filter(name => comparison[name] !== undefined && comparison[name] !== 'unavailable')
        .map(name => JSON.stringify([
          comparison.groupId, comparison.comparisonId, comparison.identityKeys,
          comparison.basis, comparison.requestClass, name, comparison[name],
        ]));
    }).sort(compare);
  };
  const expectedRelations = relationKeys(expected.comparisons);
  const actualRelations = relationKeys(actual?.comparisons);
  const subtract = (left, right) => {
    const remaining = [...right];
    return left.filter(value => {
      const index = remaining.indexOf(value);
      if (index < 0) return true;
      remaining.splice(index, 1);
      return false;
    });
  };
  const missedSupportedRelations = subtract(expectedRelations, actualRelations);
  const unexpectedRelations = subtract(actualRelations, expectedRelations);
  return { passed: mismatches.length === 0, mismatches, missedSupportedRelations, unexpectedRelations };
}

/** Validate source references against the four native fixture document kinds only. */
export function validateCrossIdentityReferences(references, documents) {
  const errors = [];
  for (const reference of references) {
    if (reference === null || typeof reference !== 'object') {
      errors.push({ reference, reason: 'invalid-reference' });
      continue;
    }
    const { source, pointer, exchangeId } = reference;
    if (!['traffic', 'blackboard', 'findings', 'raw'].includes(source)) {
      errors.push({ reference, reason: 'unsupported-source' });
      continue;
    }
    if (source === 'raw') {
      const selected = documents.rawRecords?.find(record => record.exchangeId === exchangeId);
      const selectionValid = selected?.availability === 'available'
        ? selected.document !== undefined
        : selected?.availability === 'missing' && selected.document === undefined && documents.rawRequested === true;
      if (!nativeRawId.test(exchangeId ?? '') || pointer !== '' || !selectionValid)
        errors.push({ reference, reason: 'invalid-raw-reference' });
      continue;
    }
    if (exchangeId !== undefined || pointerValue(documents[source], pointer) === undefined)
      errors.push({ reference, reason: 'unresolved-reference' });
  }
  return { passed: errors.length === 0, errors };
}

/** Validate every source pointer emitted by an actual projected group/comparison/context. */
export function validateProjectedCrossIdentityReferences(projection, documents) {
  const references = [];
  const visit = value => {
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (key === 'sources' || key === 'requiredSources') {
        if (Array.isArray(child)) references.push(...child);
        else references.push(null);
      } else visit(child);
    }
  };
  visit(projection);
  return validateCrossIdentityReferences(references, documents);
}

/** Summarize evaluation integrity independently from implementation agreement. */
export function summarizeCrossIdentityCases(results, caseIds) {
  const expected = new Set(caseIds);
  const seen = new Map();
  for (const result of results) seen.set(result.caseId, (seen.get(result.caseId) ?? 0) + 1);
  const missing = caseIds.filter(caseId => !seen.has(caseId));
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([caseId]) => caseId).sort(compare);
  const unexpected = [...seen.keys()].filter(caseId => !expected.has(caseId)).sort(compare);
  const expectedFailedAnalyses = results.filter(result => result.expectedStatus === 'failed' && result.actualStatus === 'failed').length;
  const unexpectedFailures = results.filter(result => result.actualStatus === 'failed' && result.expectedStatus !== 'failed').length;
  const executionErrors = results.filter(result => result.executionError !== null && result.executionError !== undefined).length;
  const mutations = results.filter(result => result.mutation?.passed === false).length;
  const missedSupportedRelations = results.reduce((total, result) => total + (result.comparison?.missedSupportedRelations?.length ?? 0), 0);
  const unexpectedSupportedRelations = results.reduce((total, result) => total + (result.comparison?.unexpectedRelations?.length ?? 0), 0);
  const invalidResult = results.some(result => result.comparison?.passed === false || result.references?.passed === false);
  return {
    passed: missing.length === 0 && duplicated.length === 0 && unexpected.length === 0 && !invalidResult && !unexpectedFailures && !executionErrors && !mutations && !missedSupportedRelations && !unexpectedSupportedRelations,
    caseCount: caseIds.length,
    missing,
    duplicated,
    unexpected,
    expectedFailedAnalyses,
    unexpectedFailures,
    executionErrors,
    mutations,
    missedSupportedRelations,
    unexpectedSupportedRelations,
  };
}

function selectedRawId(file) {
  if (typeof file !== 'string' || !/^raw\/ex_[a-f0-9]{24}\.json$/u.test(file))
    throw new Error('invalid selected raw fixture path');
  return file.replace(/^raw\//u, '').replace(/\.json$/u, '');
}

function nativeDocuments(root, set, indexEntry) {
  const directory = join(root, set);
  const load = name => {
    const file = join(directory, name);
    return existsSync(file) ? readJson(file) : undefined;
  };
  if (indexEntry === null || typeof indexEntry !== 'object' || typeof indexEntry.rawRequested !== 'boolean')
    throw new Error('fixture index must declare rawRequested');
  const available = (indexEntry.rawFiles ?? []).map(file => {
    const path = join(directory, file);
    if (!existsSync(path)) throw new Error('selected available raw fixture is missing');
    return { exchangeId: selectedRawId(file), availability: 'available', document: readJson(path) };
  });
  const missing = (indexEntry.missingRawFiles ?? []).map(file => {
    const path = join(directory, file);
    if (existsSync(path)) throw new Error('selected missing raw fixture exists');
    return { exchangeId: selectedRawId(file), availability: 'missing' };
  });
  if (!indexEntry.rawRequested && (available.length > 0 || missing.length > 0))
    throw new Error('omitted raw selection cannot contain records');
  const ids = [...available, ...missing].map(record => record.exchangeId);
  if (new Set(ids).size !== ids.length) throw new Error('selected raw fixture IDs must be unique');
  return {
    traffic: load('traffic_inventory.json'),
    blackboard: load('blackbox_blackboard.json'),
    findings: load('blackbox_authz_findings.json'),
    rawRequested: indexEntry.rawRequested,
    rawRecords: [...available, ...missing],
  };
}

/** Load the frozen manifest with the explicitly named native records for each case. */
export function loadCrossIdentityCorpus(root = corpusRoot) {
  const expected = readJson(join(root, 'expected-results.json'));
  const index = readJson(join(root, 'fixture-index.json'));
  if (JSON.stringify(expected.caseIds) !== JSON.stringify(CASE_IDS))
    throw new Error('frozen CASE_IDS do not match the manifest');
  if (JSON.stringify(expected.cases.map(entry => entry.caseId)) !== JSON.stringify(CASE_IDS))
    throw new Error('manifest case population does not match frozen CASE_IDS');
  const cases = expected.cases.map(entry => ({
    ...entry,
    documents: nativeDocuments(root, entry.set, index.sets?.[entry.set]),
  }));
  return { root, expected, index, cases };
}

/** Run a supplied comparison adapter while detecting input mutation and source-label drift. */
export async function evaluateCrossIdentityCorpus(compareResult, root = corpusRoot) {
  const corpus = loadCrossIdentityCorpus(root);
  const manifestSha256 = createHash('sha256')
    .update(readFileSync(join(root, 'expected-results.json')))
    .digest('hex');
  const results = [];
  for (const entry of corpus.cases) {
    const input = clone(entry.documents);
    const before = JSON.stringify(input);
    let actual;
    let executionError = null;
    try {
      actual = await compareResult(input, entry);
    } catch (error) {
      executionError = error instanceof Error ? error.name : 'execution-error';
    }
    const mutation = { passed: JSON.stringify(input) === before };
    const projection = actual === undefined ? undefined : actual.projection ?? actual;
    const comparison = executionError === null
      ? compareExpectedCrossIdentityProjection(projection, entry.expected)
      : compareExpectedCrossIdentityProjection(undefined, entry.expected);
    const frozenReferences = executionError === null
      ? validateProjectedCrossIdentityReferences(entry.expected, entry.documents)
      : { passed: false, errors: [{ reason: 'execution-error' }] };
    const actualReferences = executionError === null
      ? validateProjectedCrossIdentityReferences(projection, entry.documents)
      : { passed: false, errors: [{ reason: 'execution-error' }] };
    const references = {
      passed: frozenReferences.passed && actualReferences.passed,
      errors: [...frozenReferences.errors, ...actualReferences.errors],
    };
    results.push({
      caseId: entry.caseId,
      expectedStatus: entry.expected.status,
      actualStatus: projection?.status,
      comparison,
      references,
      mutation,
      executionError,
    });
  }
  const summary = summarizeCrossIdentityCases(results, corpus.expected.caseIds);
  const report = {
    schemaVersion: 1,
    kind: reportKind,
    manifestSha256,
    status: summary.passed ? 'passed' : 'failed',
    summary,
    cases: results,
  };
  return { corpus, results, summary, manifestSha256, report };
}

const help = `Usage: node scripts/evaluate-blackbox-cross-identity.mjs

Evaluate the frozen synthetic cross-identity corpus against the built worker.
`;

function fixedFailure(code) {
  return {
    schemaVersion: 1,
    kind: reportKind,
    status: 'failed',
    diagnostics: [{ code }],
  };
}

async function main(args) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    process.stdout.write(help);
    return;
  }
  if (args.length !== 0) {
    process.stdout.write(`${JSON.stringify(fixedFailure('invalid_usage'))}\n`);
    process.exitCode = 2;
    return;
  }

  let compareAccessObservation;
  try {
    ({ compareAccessObservation } = await import('../apps/worker/dist/blackbox-observation/access-index.js'));
    if (typeof compareAccessObservation !== 'function') throw new Error('missing comparison export');
  } catch {
    process.stdout.write(`${JSON.stringify(fixedFailure('setup_required'))}\n`);
    process.exitCode = 1;
    return;
  }

  try {
    const evaluation = await evaluateCrossIdentityCorpus((input, entry) => projectCrossIdentityResult(
      compareAccessObservation(input, entry.limits),
      entry.expected,
    ));
    process.stdout.write(`${JSON.stringify(evaluation.report, null, 2)}\n`);
    if (!evaluation.summary.passed) process.exitCode = 1;
  } catch {
    process.stdout.write(`${JSON.stringify(fixedFailure('evaluation_failed'))}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main(process.argv.slice(2));
}
