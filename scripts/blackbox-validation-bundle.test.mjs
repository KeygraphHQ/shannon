import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { compareAccessDirectory } from '../apps/worker/dist/blackbox-observation/access-index.js';
import {
  AccessValidationBundleCreateError,
  createAccessValidationBundle,
} from '../apps/worker/dist/blackbox-observation/access-validation-bundle.js';
import { loadAccessValidationBundle } from '../apps/worker/dist/blackbox-observation/access-validation-files.js';

const FIXTURES = path.resolve('apps/worker/test/fixtures/blackbox-cross-identity/sets');
const SCRIPT = path.resolve('scripts/blackbox-validation-bundle.mjs');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

async function waitFor(file, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (!(await exists(file))) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for bundle entry.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function makeEligibleSource({ findings = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'blackbox-validation-bundle-'));
  const observation = path.join(root, 'source observation');
  const raw = path.join(root, 'source raw');
  await fs.cp(path.join(FIXTURES, 'integration-boundaries'), observation, { recursive: true });
  await fs.rename(path.join(observation, 'raw'), raw);
  if (findings) await fs.writeFile(path.join(observation, 'blackbox_authz_findings.json'), '[]\n');

  const blackboardFile = path.join(observation, 'blackbox_blackboard.json');
  const blackboard = JSON.parse(await fs.readFile(blackboardFile, 'utf8'));
  blackboard.resources.push({
    resourceId: 'resource-private-memo',
    resourceType: 'memo',
    objectReferences: [],
    ownerIdentity: 'alice',
    visibility: 'private',
    evidence: [{ kind: 'exchange', id: 'ex_2104ddfb786042f45c6baea1' }],
    provenance: { actor: 'blackbox-recon', taskId: 'integration-a', baseRevision: 1 },
  });
  await fs.writeFile(blackboardFile, `${JSON.stringify(blackboard)}\n`);

  const report = await compareAccessDirectory(observation, { rawDirectory: raw });
  assert.equal(report.result.status, 'completed');
  const strong = report.result.comparisons.find(
    ({ basis, evidenceStrength }) =>
      basis === 'exact-saved-target-body' && evidenceStrength === 'exact-saved-target-body-with-response-evidence',
  );
  assert.ok(strong);
  return { root, observation, raw, report, comparisonId: strong.comparisonId };
}

async function removeRoot(root) {
  await fs.rm(root, { recursive: true, force: true });
}

test('creates an exact exclusive bundle and resolves it from copied evidence', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'new validation bundle');

  const resolved = await createAccessValidationBundle(source.observation, source.comparisonId, {
    rawDirectory: source.raw,
    outputDirectory: output,
  });

  assert.deepEqual((await fs.readdir(output)).sort(), ['comparison.json', 'observation', 'raw', 'selection.json']);
  assert.deepEqual((await fs.readdir(path.join(output, 'observation'))).sort(), [
    'blackbox_authz_findings.json',
    'blackbox_blackboard.json',
    'traffic_inventory.json',
  ]);
  const rawNames = source.report.result.sources
    .filter(({ source: kind, availability }) => kind === 'raw' && availability === 'available')
    .map(({ file }) => file)
    .sort();
  assert.deepEqual((await fs.readdir(path.join(output, 'raw'))).sort(), rawNames);
  assert.equal(await fs.readFile(path.join(output, 'comparison.json'), 'utf8'), source.report.json);

  for (const name of ['traffic_inventory.json', 'blackbox_blackboard.json', 'blackbox_authz_findings.json']) {
    const original = await fs.readFile(path.join(source.observation, name));
    const copied = await fs.readFile(path.join(output, 'observation', name));
    assert.equal(sha256(copied), sha256(original));
  }
  for (const name of rawNames) {
    assert.equal(
      sha256(await fs.readFile(path.join(output, 'raw', name))),
      sha256(await fs.readFile(path.join(source.raw, name))),
    );
  }

  assert.deepEqual(await loadAccessValidationBundle(output), resolved);
  const selection = JSON.parse(await fs.readFile(path.join(output, 'selection.json'), 'utf8'));
  assert.equal(selection.comparisonId, source.comparisonId);
  assert.equal(selection.comparisonSha256, sha256(Buffer.from(source.report.json)));
});

test('omits absent optional findings and rejects existing or overlapping destinations', async (t) => {
  const source = await makeEligibleSource({ findings: false });
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'bundle');
  await fs.mkdir(output);
  await fs.writeFile(path.join(output, 'sentinel.txt'), 'preserve');

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: output,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'unsafe-output',
  );
  assert.equal(await fs.readFile(path.join(output, 'sentinel.txt'), 'utf8'), 'preserve');

  for (const overlapping of [
    path.join(source.observation, 'bundle'),
    path.join(source.raw, 'bundle'),
    source.root,
  ]) {
    await assert.rejects(
      createAccessValidationBundle(source.observation, source.comparisonId, {
        rawDirectory: source.raw,
        outputDirectory: overlapping,
      }),
      (error) => error instanceof AccessValidationBundleCreateError && error.code === 'unsafe-output',
    );
  }
});

test('rejects missing raw and partial comparisons without retaining a partial bundle', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const rawName = source.report.result.sources.find(({ source: kind }) => kind === 'raw')?.file;
  assert.ok(rawName);
  await fs.rm(path.join(source.raw, rawName));
  const output = path.join(source.root, 'missing raw bundle');

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: output,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'missing-raw',
  );
  assert.equal(await exists(output), false);

  const partialRoot = await fs.mkdtemp(path.join(source.root, 'partial-'));
  const partialObservation = path.join(partialRoot, 'observation');
  const partialRaw = path.join(partialRoot, 'raw');
  await fs.cp(path.join(FIXTURES, 'raw-comparability'), partialObservation, { recursive: true });
  await fs.rename(path.join(partialObservation, 'raw'), partialRaw);
  const partialOutput = path.join(partialRoot, 'bundle');
  await assert.rejects(
    createAccessValidationBundle(partialObservation, 'comparison-000001', {
      rawDirectory: partialRaw,
      outputDirectory: partialOutput,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'partial-comparison',
  );
  assert.equal(await exists(partialOutput), false);
});

test('rejects nonregular and linked selected sources', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const rawName = source.report.result.sources.find(({ source: kind }) => kind === 'raw')?.file;
  assert.ok(rawName);
  const rawFile = path.join(source.raw, rawName);
  await fs.rm(rawFile);
  await fs.mkdir(rawFile);

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: path.join(source.root, 'nonregular bundle'),
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'unsafe-input',
  );

  await fs.rm(rawFile, { recursive: true });
  const target = path.join(source.root, 'linked-source.json');
  await fs.writeFile(target, '{}');
  try {
    await fs.symlink(target, rawFile, 'file');
  } catch (error) {
    if (error?.code === 'EPERM') return;
    throw error;
  }
  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: path.join(source.root, 'linked bundle'),
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'unsafe-input',
  );
});

test('detects copied-bundle tampering and removes the newly created leaf', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'tampered bundle');
  let done = false;
  const tamper = (async () => {
    const selectionFile = path.join(output, 'selection.json');
    await waitFor(selectionFile);
    await fs.appendFile(path.join(output, 'observation', 'traffic_inventory.json'), '\n');
    done = true;
  })();

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: output,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'verification-failed',
  );
  await tamper;
  assert.equal(done, true);
  assert.equal(await exists(output), false);
});

test('detects source mutation during copying and removes only its owned entries', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'source-mutated bundle');
  const mutate = (async () => {
    await waitFor(path.join(output, 'observation', 'blackbox_blackboard.json'));
    await fs.appendFile(path.join(source.observation, 'blackbox_blackboard.json'), '\n');
  })();

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: output,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'source-changed',
  );
  await mutate;
  assert.equal(await exists(output), false);
});

test('rejects unexpected output entries without deleting the concurrent writer entry', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'contended bundle');
  const foreignFile = path.join(output, 'observation', 'foreign.txt');
  const inject = (async () => {
    await waitFor(path.join(output, 'selection.json'));
    await fs.writeFile(foreignFile, 'preserve');
  })();

  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: output,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'cleanup-failed',
  );
  await inject;
  assert.equal(await fs.readFile(foreignFile, 'utf8'), 'preserve');
  assert.deepEqual(await fs.readdir(output), ['observation']);
  assert.deepEqual(await fs.readdir(path.join(output, 'observation')), ['foreign.txt']);
});

test('uses typed failures for a missing raw directory, abort, and elapsed timeout', async (t) => {
  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const missingOutput = path.join(source.root, 'missing-directory bundle');
  await fs.rm(source.raw, { recursive: true });
  await assert.rejects(
    createAccessValidationBundle(source.observation, source.comparisonId, {
      rawDirectory: source.raw,
      outputDirectory: missingOutput,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'missing-raw',
  );
  assert.equal(await exists(missingOutput), false);

  const restored = await makeEligibleSource();
  t.after(() => removeRoot(restored.root));
  const controller = new AbortController();
  controller.abort();
  const abortedOutput = path.join(restored.root, 'aborted bundle');
  await assert.rejects(
    createAccessValidationBundle(restored.observation, restored.comparisonId, {
      rawDirectory: restored.raw,
      outputDirectory: abortedOutput,
      signal: controller.signal,
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'aborted',
  );
  assert.equal(await exists(abortedOutput), false);

  const timeoutOutput = path.join(restored.root, 'timed-out bundle');
  await assert.rejects(
    createAccessValidationBundle(restored.observation, restored.comparisonId, {
      rawDirectory: restored.raw,
      outputDirectory: timeoutOutput,
      limits: { timeoutMs: 1 },
    }),
    (error) => error instanceof AccessValidationBundleCreateError && error.code === 'processing-timeout',
  );
  assert.equal(await exists(timeoutOutput), false);
});

test('source launcher has static help, fixed invalid diagnostics, and creates a loadable bundle', async (t) => {
  const help = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /^Usage: blackbox-validation-bundle /);
  assert.equal(help.stderr, '');

  const invalid = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(invalid.status, 2);
  assert.equal(invalid.stderr, '');
  assert.deepEqual(JSON.parse(invalid.stdout), {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation-bundle',
    status: 'failed',
    diagnostics: [
      {
        code: 'invalid_usage',
        message: 'Unsupported arguments. Run blackbox-validation-bundle --help for usage.',
      },
    ],
  });

  const source = await makeEligibleSource();
  t.after(() => removeRoot(source.root));
  const output = path.join(source.root, 'cli bundle');
  const run = spawnSync(
    process.execPath,
    [
      SCRIPT,
      source.observation,
      '--raw-dir',
      source.raw,
      '--comparison',
      source.comparisonId,
      '--output',
      output,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stdout);
  assert.equal(run.stderr, '');
  const resolved = JSON.parse(run.stdout);
  assert.deepEqual(await loadAccessValidationBundle(output), resolved);
});
