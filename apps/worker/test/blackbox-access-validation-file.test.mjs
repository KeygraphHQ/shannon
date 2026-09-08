import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareAccessDirectory } from '../dist/blackbox-observation/access-index.js';
import { createAccessValidationSelection } from '../dist/blackbox-observation/access-validation.js';
import {
  AccessValidationBundleError,
  loadAccessValidationBundle,
} from '../dist/blackbox-observation/access-validation-files.js';

const FIXTURE = path.resolve('apps/worker/test/fixtures/blackbox-cross-identity/sets/integration-boundaries');
const VALIDATOR = path.resolve('apps/worker/dist/scripts/validate-blackbox-bundle.js');

async function createBundle() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blackbox-access-validation-'));
  const bundle = path.join(root, 'bundle');
  const observation = path.join(bundle, 'observation');
  const raw = path.join(bundle, 'raw');
  await fs.cp(FIXTURE, observation, { recursive: true });
  await fs.rename(path.join(observation, 'raw'), raw);

  const blackboardPath = path.join(observation, 'blackbox_blackboard.json');
  const blackboard = JSON.parse(await fs.readFile(blackboardPath, 'utf8'));
  blackboard.resources.push({
    resourceId: 'resource-private-memo',
    resourceType: 'memo',
    objectReferences: [],
    ownerIdentity: 'alice',
    visibility: 'private',
    evidence: [{ kind: 'exchange', id: 'ex_2104ddfb786042f45c6baea1' }],
    provenance: { actor: 'blackbox-recon', taskId: 'integration-a', baseRevision: 1 },
  });
  await fs.writeFile(blackboardPath, JSON.stringify(blackboard));

  const report = await compareAccessDirectory(observation, { rawDirectory: raw });
  const strong = report.result.comparisons.find(({ basis }) => basis === 'exact-saved-target-body');
  assert.ok(strong);
  const selection = createAccessValidationSelection(report.result, strong.comparisonId);
  await fs.writeFile(path.join(bundle, 'comparison.json'), report.json);
  await fs.writeFile(path.join(bundle, 'selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
  return { root, bundle, observation, strong, selection };
}

test('loads a guarded bundle and emits only the normalized selector', async (t) => {
  const fixture = await createBundle();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  const resolved = await loadAccessValidationBundle(fixture.bundle);
  assert.deepEqual(resolved, {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: fixture.selection.comparisonSha256,
    sourceManifestSha256: fixture.selection.sourceManifestSha256,
    selectionDigest: resolved.selectionDigest,
    comparisonId: fixture.strong.comparisonId,
    routeSignature: 'route_790000000000000000000001',
    method: 'GET',
    origin: 'https://integration.invalid',
    routePathPrefix: '/private',
    requestClass: 'request-class-0001',
    recordedRole: 'reader',
    victimIdentity: 'alice',
    attackerIdentity: 'bob',
  });
  assert.match(resolved.selectionDigest, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(resolved).includes('PRIVATE_SENTINEL'), false);

  const run = spawnSync(process.execPath, [VALIDATOR, fixture.bundle], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  assert.deepEqual(JSON.parse(run.stdout), resolved);
  assert.equal(run.stdout, `${JSON.stringify(resolved)}\n`);
});

test('rejects a corpus that drifted after selection', async (t) => {
  const fixture = await createBundle();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));
  await fs.appendFile(path.join(fixture.observation, 'traffic_inventory.json'), '\n');

  await assert.rejects(
    loadAccessValidationBundle(fixture.bundle),
    (error) => error instanceof AccessValidationBundleError && error.code === 'corpus-mismatch',
  );
});

test('validator rejects invalid usage without stdout', () => {
  const run = spawnSync(process.execPath, [VALIDATOR], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.equal(run.stderr, 'Usage: validate-blackbox-bundle <directory>\n');
});
