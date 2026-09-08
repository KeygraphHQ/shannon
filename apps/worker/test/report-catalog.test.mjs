import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { renderBlackboxArtifacts } from '../dist/blackbox/artifacts.js';
import { PRIVATE_FILES } from '../dist/reporting/bundle-types.js';
import { BundleOperationError, checkReportBundle, exportReportBundle, inspectReportBundle } from '../dist/reporting/bundle.js';
import { buildReportCatalog, DEFAULT_CATALOG_LIMITS } from '../dist/reporting/report-catalog.js';

const SECRET = 'catalog-private-payload-83a3';
const BOARD = 'blackbox_blackboard.json';
const INVENTORY = 'traffic_inventory.json';

function fixture({ metadata = false, records = false, emptyRoute = false, outcome = 'incomplete' } = {}) {
  const provenance = { actor: 'blackbox-recon', taskId: SECRET, baseRevision: 0 };
  const snapshot = {
    schemaVersion: 1, revision: 0, targetOrigin: `https://${SECRET}.example`,
    identities: [], exchanges: [], resources: [], transitions: [], hypotheses: [],
    actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
    runStatus: outcome, operationReceipts: [],
  };
  if (records) {
    snapshot.identities = [{ name: SECRET, role: SECRET, authenticated: true, stateRef: SECRET }];
    snapshot.exchanges = [{
      exchangeId: SECRET, routeSignature: emptyRoute ? '' : `GET /${SECRET}`, identity: SECRET,
      captureSequence: 0, method: 'GET', origin: snapshot.targetOrigin, path: `/${SECRET}`,
      queryKeys: [], bodyShape: 'none', requestContentType: null, responseStatus: 200,
      responseContentType: null, responseFingerprint: SECRET, candidateObjectReferences: [],
      rawRecordRef: SECRET, provenance,
    }];
    snapshot.hypotheses = ['open', 'queued', 'tested', 'blocked', 'disproved'].map((status, index) => ({
      hypothesisId: `${SECRET}-${index}`, kind: 'horizontal', summary: SECRET, preconditions: [SECRET],
      attackerCapability: SECRET, evidence: [], priority: 'low', status, provenance,
    }));
    snapshot.tasks = ['pending', 'running', 'completed'].map((status, index) => ({
      taskId: `${SECRET}-${index}`, kind: 'analysis', objective: SECRET, evidence: [],
      identityLease: null, hypothesisId: null, status,
    }));
  }
  const runMetadata = {
    schemaVersion: 1, runId: SECRET, historyComplete: false, currentAttemptId: SECRET, resultAttemptId: SECRET,
    attempts: [{
      attemptId: SECRET, workflowId: SECRET, resumedFromAttemptId: null,
      startedAt: '2026-01-01T00:00:00.000Z', endedAt: '2026-01-01T00:01:00.000Z',
      code: { revision: 'a'.repeat(40), dirty: true, sha256: 'b'.repeat(64) }, configuredModel: SECRET,
      termination: { code: outcome === 'complete' ? 'completed' : 'limit_reached', source: 'workflow' },
    }],
  };
  return renderBlackboxArtifacts({ snapshot, findings: [], status: outcome, failure: null,
    ...(metadata ? { runMetadata } : {}) });
}

async function workspace(t) {
  const parent = await fs.realpath(tmpdir());
  const root = await fs.mkdtemp(path.join(parent, 'report-catalog-test-'));
  const identity = await fs.lstat(root, { bigint: true });
  t.after(async () => {
    const resolved = await fs.realpath(root);
    const current = await fs.lstat(root, { bigint: true });
    assert.equal(path.dirname(resolved), parent);
    assert.ok(path.basename(resolved).startsWith('report-catalog-test-'));
    assert.equal(current.ino, identity.ino);
    assert.equal(current.dev, identity.dev);
    await fs.rm(resolved, { recursive: true, force: true });
  });
  return root;
}

async function writeBundle(directory, files = fixture()) {
  await fs.mkdir(directory, { recursive: true });
  for (const name of PRIVATE_FILES) await fs.writeFile(path.join(directory, name), files[name]);
  return directory;
}

async function contents(directory) {
  const entries = (await fs.readdir(directory)).sort();
  return Object.fromEntries(await Promise.all(entries.map(async name => [name, await fs.readFile(path.join(directory, name))])));
}

test('inspection preserves the check contract and projects only allowed counts and flags', async t => {
  const root = await workspace(t);
  const source = await writeBundle(path.join(root, 'source'), fixture({ metadata: true, records: true }));
  const before = await contents(source);
  const inspected = await inspectReportBundle(source);
  assert.deepEqual(inspected.check, await checkReportBundle(source));
  assert.equal(inspected.check.valid, true, JSON.stringify(inspected.check.issues));
  assert.deepEqual(inspected.summary, {
    outcome: 'incomplete', findings: 0, trafficRecords: 1, unresolvedHypotheses: 4,
    pendingTasks: 2, blockedVerifications: 0, provenance: 'available', historyComplete: false,
    resultRecorded: true, attempts: 1,
  });
  assert.match(inspected.contentId, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(inspected).includes(SECRET), false);
  assert.deepEqual(await contents(source), before);
});

test('valid legacy empty route strings remain inspectable without sanitizer projection', async t => {
  const root = await workspace(t);
  const source = await writeBundle(path.join(root, 'source'), fixture({ records: true, emptyRoute: true }));
  const inspected = await inspectReportBundle(source);
  assert.equal(inspected.check.valid, true, JSON.stringify(inspected.check.issues));
  assert.equal(inspected.summary.trafficRecords, 1);
  assert.equal(inspected.summary.provenance, 'unavailable');
  assert.equal(inspected.summary.historyComplete, null);
  assert.equal(inspected.summary.resultRecorded, false);
});

test('catalog discovers hidden descendants and preserves invalid companions as unknown summaries', async t => {
  const root = await workspace(t);
  await writeBundle(path.join(root, '.shannon', 'complete'), fixture({ outcome: 'complete' }));
  const partial = path.join(root, 'partial');
  await fs.mkdir(partial);
  await fs.writeFile(path.join(partial, BOARD), `{ "secret": "${SECRET}" }`);
  await fs.writeFile(path.join(root, 'ordinary.txt'), SECRET);
  const catalog = await buildReportCatalog(root);
  assert.equal(catalog.complete, true);
  assert.deepEqual(catalog.limits, DEFAULT_CATALOG_LIMITS);
  assert.equal(catalog.directoriesVisited, 4);
  assert.deepEqual(catalog.entries.map(entry => entry.folder), [path.join('.shannon', 'complete'), 'partial']);
  assert.deepEqual(catalog.entries.map(entry => entry.id), ['bundle-1', 'bundle-2']);
  assert.equal(catalog.entries[1].check.valid, false);
  assert.ok(catalog.entries[1].check.issues.some(issue => issue.code === 'missing_file'));
  assert.equal(catalog.entries[1].summary, null);
  assert.equal(catalog.entries[1].contentId, null);
  assert.equal(catalog.totals.valid, 1);
  assert.equal(catalog.totals.invalid, 1);
  assert.equal(catalog.totals.provenanceUnknown, 1);
  assert.equal(JSON.stringify(catalog).includes(SECRET), false);
});

test('duplicate grouping ignores manifest bytes but distinguishes artifact formatting and profiles', async t => {
  const root = await workspace(t);
  const source = await writeBundle(path.join(root, 'b-original'), fixture({ metadata: true, records: true }));
  await exportReportBundle(source, path.join(root, 'a-archive'), 'private');
  await exportReportBundle(source, path.join(root, 'c-share'), 'sanitized');
  await fs.cp(path.join(root, 'c-share'), path.join(root, 'd-share-copy'), { recursive: true });
  await fs.cp(source, path.join(root, 'e-format'), { recursive: true });
  await fs.appendFile(path.join(root, 'e-format', INVENTORY), '\n');
  await fs.cp(source, path.join(root, 'f-invalid'), { recursive: true });
  await fs.writeFile(path.join(root, 'f-invalid', BOARD), '{');
  await fs.cp(path.join(root, 'f-invalid'), path.join(root, 'g-invalid-copy'), { recursive: true });
  const catalog = await buildReportCatalog(root);
  assert.equal(catalog.complete, true);
  assert.equal(catalog.totals.duplicateGroups, 2);
  assert.equal(catalog.totals.duplicateCopies, 2);
  assert.equal(catalog.totals.integrityMatched, 3);
  assert.equal(catalog.totals.provenanceAvailable, 5);
  assert.equal(catalog.totals.provenanceUnknown, 2);
  assert.equal(catalog.entries[0].duplicateGroup, catalog.entries[1].duplicateGroup);
  assert.equal(catalog.entries[2].duplicateGroup, catalog.entries[3].duplicateGroup);
  assert.notEqual(catalog.entries[0].duplicateGroup, catalog.entries[2].duplicateGroup);
  assert.deepEqual(catalog.entries[0].summary, catalog.entries[2].summary);
  assert.equal(catalog.entries[4].duplicateGroup, null);
  assert.equal(catalog.entries[4].check.valid, true);
  assert.equal(catalog.entries[5].duplicateGroup, null);
  assert.equal(catalog.entries[6].duplicateGroup, null);
  assert.deepEqual(catalog.entries, (await buildReportCatalog(root)).entries);
});

test('tampered manifests retain failed integrity and suppress counts and duplicate identity', async t => {
  const root = await workspace(t);
  const source = await writeBundle(path.join(root, 'source'));
  const archive = path.join(root, 'archive');
  await exportReportBundle(source, archive, 'private');
  await fs.appendFile(path.join(archive, INVENTORY), '\n');
  const catalog = await buildReportCatalog(root);
  assert.equal(catalog.totals.integrityFailed, 1);
  const invalid = catalog.entries.find(entry => entry.folder === 'archive');
  assert.equal(invalid.check.integrity, 'failed');
  assert.equal(invalid.summary, null);
  assert.equal(invalid.contentId, null);
  assert.equal(catalog.totals.duplicateGroups, 0);
});

test('depth, directory and bundle caps report incomplete inventory only when discovery is omitted', async t => {
  const root = await workspace(t);
  await writeBundle(path.join(root, 'a'));
  await writeBundle(path.join(root, 'b'));
  for (const [limits, code] of [
    [{ maxDepth: 0 }, 'depth_limit'], [{ maxDirectories: 1 }, 'directory_limit'], [{ maxBundles: 1 }, 'bundle_limit'],
  ]) {
    const catalog = await buildReportCatalog(root, limits);
    assert.equal(catalog.complete, false);
    assert.ok(catalog.traversalIssues.some(issue => issue.code === code));
    if (limits.maxBundles) assert.equal(catalog.entries.length, 1);
    if (limits.maxDirectories) assert.equal(catalog.directoriesVisited, 1);
  }
  const exact = await buildReportCatalog(root, { maxDepth: 1, maxDirectories: 3, maxBundles: 2, maxEntries: 10 });
  assert.equal(exact.complete, true);
  assert.equal(exact.entries.length, 2);
});

test('global entry cap bounds enumeration and does not inspect a partially listed candidate', async t => {
  const root = await workspace(t);
  await writeBundle(root);
  const bounded = await buildReportCatalog(root, { maxEntries: 3 });
  assert.equal(bounded.complete, false);
  assert.deepEqual(bounded.traversalIssues, [{ code: 'entry_limit', folder: '.' }]);
  assert.equal(bounded.entries.length, 0);
  const exact = await buildReportCatalog(root, { maxEntries: 4, maxDirectories: 1, maxDepth: 0, maxBundles: 1 });
  assert.equal(exact.complete, true);
  assert.equal(exact.entries.length, 1);
});

test('junctions and linked roots or ancestors are not traversed or treated as complete', async t => {
  const root = await workspace(t);
  const source = await writeBundle(path.join(root, 'outside', 'source'));
  const catalogRoot = path.join(root, 'catalog');
  await fs.mkdir(catalogRoot);
  const linked = path.join(catalogRoot, 'linked');
  await fs.symlink(path.dirname(source), linked, process.platform === 'win32' ? 'junction' : 'dir');
  const catalog = await buildReportCatalog(catalogRoot);
  assert.equal(catalog.complete, false);
  assert.equal(catalog.entries.length, 0);
  assert.deepEqual(catalog.traversalIssues, [{ code: 'linked_entry', folder: 'linked' }]);
  for (const input of [linked, path.join(linked, 'source')]) {
    const result = await buildReportCatalog(input);
    assert.equal(result.complete, false);
    assert.equal(result.entries.length, 0);
    assert.deepEqual(result.traversalIssues, [{ code: 'linked_directory', folder: '.' }]);
  }
  assert.equal((await checkReportBundle(source)).valid, true);
});

test('unreadable roots fail explicitly without leaking OS diagnostics or synthesizing results', async t => {
  const root = await workspace(t);
  const file = path.join(root, 'file');
  await fs.writeFile(file, SECRET);
  for (const [input, code] of [[path.join(root, 'missing'), 'directory_read_failed'], [file, 'not_directory']]) {
    const catalog = await buildReportCatalog(input);
    assert.equal(catalog.complete, false);
    assert.equal(catalog.entries.length, 0);
    assert.deepEqual(catalog.traversalIssues, [{ code, folder: '.' }]);
    assert.equal(JSON.stringify(catalog.traversalIssues).includes(SECRET), false);
  }
});

test('invalid parent bundles do not hide valid nested bundles', async t => {
  const root = await workspace(t);
  const parent = await writeBundle(path.join(root, 'parent'));
  await writeBundle(path.join(parent, 'child'));
  const catalog = await buildReportCatalog(root);
  assert.equal(catalog.complete, true);
  assert.equal(catalog.entries.length, 2);
  assert.equal(catalog.entries[0].check.valid, false);
  assert.ok(catalog.entries[0].check.issues.some(issue => issue.code === 'unexpected_file'));
  assert.equal(catalog.entries[1].check.valid, true);
});

test('inaccessible descendants are explicit incomplete inventory on POSIX', {
  skip: process.platform === 'win32' || process.getuid?.() === 0,
}, async t => {
  const root = await workspace(t);
  const closed = await writeBundle(path.join(root, 'closed'));
  await fs.chmod(closed, 0);
  try {
    const catalog = await buildReportCatalog(root);
    assert.equal(catalog.complete, false);
    assert.equal(catalog.entries.length, 0);
    assert.ok(catalog.traversalIssues.some(issue => issue.folder === 'closed' && issue.code === 'directory_read_failed'));
  } finally {
    await fs.chmod(closed, 0o700);
  }
});

test('empty roots are complete empty inventories and unsupported limits fail before reading', async t => {
  const root = await workspace(t);
  const empty = await buildReportCatalog(root);
  assert.equal(empty.complete, true);
  assert.equal(empty.directoriesVisited, 1);
  assert.equal(empty.totals.bundles, 0);
  for (const limits of [{ maxDepth: -1 }, { maxDirectories: 0 }, { maxEntries: Infinity }, { maxBundles: 1.5 }, { arbitrary: 1 }]) {
    await assert.rejects(buildReportCatalog(path.join(root, 'missing'), limits), error =>
      error instanceof BundleOperationError && error.issues[0].code === 'invalid_catalog_limits');
  }
});
