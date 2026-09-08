import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createOwnedWorkspace, removeOwnedWorkspace } from '../../../scripts/test-reporting-install.mjs';
import { analyzeObservation, observeDirectory, serializeObservation } from '../dist/blackbox-observation/index.js';

const board = {
  schemaVersion: 1, revision: 1, targetOrigin: 'https://example.invalid',
  runStatus: 'incomplete', failure: null, identities: [], exchanges: [], resources: [],
  transitions: [], hypotheses: [], actions: [], candidateProofs: [], verifications: [], tasks: [], rejectedTasks: [],
};

test('independent review: public serialization cannot accept raised or nonfinite projection ceilings', () => {
  const result = analyzeObservation({ traffic: [], blackboard: board, findings: [] });
  assert.equal(result.status, 'completed');
  for (const maxOutputBytes of [16 * 1024 * 1024 + 1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => serializeObservation({ ...result, limits: { ...result.limits, maxOutputBytes } }),
      { message: 'Invalid observation limits.' });
  }
  assert.throws(() => serializeObservation({ ...result, limits: { ...result.limits, maxOutputBytes: 1 } }),
    { message: 'Observation output exceeds the enforced limit.' });
  assert.equal(JSON.parse(serializeObservation(result).json).status, 'completed');
});

test('independent review: aggregate bytes and nodes include all selected native documents', async t => {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  const input = path.join(owner.directory, 'aggregate inputs');
  await mkdir(input);
  await writeFile(path.join(input, 'traffic_inventory.json'), '[]');
  await writeFile(path.join(input, 'blackbox_blackboard.json'), JSON.stringify(board));
  await writeFile(path.join(input, 'blackbox_authz_findings.json'), '[]');
  const countNodes = value => value === null || typeof value !== 'object'
    ? 1 : 1 + Object.values(value).reduce((sum, child) => sum + countNodes(child), 0);
  // Each individual file fits these limits. Their aggregate does not.
  for (const limits of [
    { maxTotalBytes: Buffer.byteLength(JSON.stringify(board)) },
    { maxNodes: countNodes(board) },
  ]) {
    const report = await observeDirectory(input, { limits });
    assert.equal(report.result.status, 'failed');
    assert.ok(report.result.diagnostics.some(diagnostic => diagnostic.code === 'input-limit'));
  }
});

test('independent review: pure input byte limits charge serialized numeric data', () => {
  const input = { traffic: [], blackboard: { ...board, unusedNumbers: Array(400).fill(Number.MAX_SAFE_INTEGER) }, findings: [] };
  const selectedBytes = [input.traffic, input.blackboard, input.findings]
    .reduce((sum, document) => sum + Buffer.byteLength(JSON.stringify(document)), 0);
  assert.ok(selectedBytes > 5000);
  const result = analyzeObservation(input, { maxTotalBytes: 5000 });
  assert.equal(result.status, 'failed');
  assert.ok(result.diagnostics.some(diagnostic => ['resource-limit', 'input-limit'].includes(diagnostic.code)));
});

test('independent review: mirrored conflicting exchange copies count one logical conflicted ID', () => {
  const exchange = {
    exchangeId: `ex_${'a'.repeat(24)}`, routeSignature: `route_${'b'.repeat(24)}`, identity: 'alice',
    captureSequence: 1, method: 'GET', origin: 'https://example.invalid', path: '/items', queryKeys: [],
    bodyShape: 'empty', requestContentType: null, responseStatus: 200, responseContentType: null,
    responseFingerprint: `sha256:${'0'.repeat(64)}`, candidateObjectReferences: [],
    provenance: { actor: 'blackbox-recon', taskId: 'saved-task', baseRevision: 0 },
  };
  for (const conflictingCopy of [{ ...exchange, responseStatus: 403 }, { ...exchange, method: null }]) {
    const traffic = [exchange, conflictingCopy];
    const result = analyzeObservation({ traffic, blackboard: {
      ...board, identities: [{ name: 'alice', role: 'user', authenticated: true }], exchanges: traffic,
    }, findings: [] });
    assert.equal(result.status, 'partial');
    assert.equal(result.counts.conflicts, 1);
    assert.equal(result.exchanges.length, 0);
  }
});
