import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

import * as install from './test-reporting-install.mjs';
import { reportingContextInputs, reportingTestProfile } from './test-reporting-runtime.mjs';

const addedInputs = [
  'apps/worker/test/fixtures/blackbox-cross-identity',
  'apps/worker/test/blackbox-cross-identity-core.test.mjs',
  'apps/worker/test/blackbox-cross-identity-raw.test.mjs',
  'apps/worker/test/blackbox-cross-identity-render.test.mjs',
  'apps/worker/test/blackbox-cross-identity-file.test.mjs',
  'apps/worker/test/blackbox-cross-identity-evaluation.test.mjs',
  'scripts/blackbox-compare.mjs',
  'scripts/blackbox-compare.test.mjs',
  'scripts/evaluate-blackbox-cross-identity.mjs',
  'scripts/blackbox-cross-identity-harness.test.mjs',
];

test('cross-identity clean profiles select the fixed regression command without network or Temporal', () => {
  const profile = reportingTestProfile(['--cross-identity']);
  assert.deepEqual(profile, {
    name: 'cross-identity',
    temporal: false,
    network: 'none',
    command: ['pnpm', 'test:blackbox-cross-identity:regressions'],
  });
  const options = install.parseInstallArguments(['--cross-identity', '--offline']);
  assert.deepEqual(options, {
    review: false,
    crossIdentity: true,
    offline: true,
    storeDir: undefined,
  });
  assert.deepEqual(install.installTestCommands(false, false, true), [
    ['test:blackbox-cross-identity:regressions'],
  ]);
  for (const args of [
    ['--cross-identity', '--review'],
    ['--cross-identity', '--observation'],
    ['--cross-identity', '--cross-identity'],
    ['--cross-identity', 'publish'],
  ]) {
    assert.throws(() => install.parseInstallArguments(args), /Usage:/u);
    assert.throws(() => reportingTestProfile(args), /Usage:/u);
  }
});

test('cross-identity context extends the exact observation allowlist only', () => {
  const inputs = reportingContextInputs(reportingTestProfile(['--cross-identity']));
  assert.deepEqual(inputs, [...install.CROSS_IDENTITY_INPUTS]);
  assert.deepEqual(inputs.slice(0, install.OBSERVATION_INPUTS.length), [...install.OBSERVATION_INPUTS]);
  assert.deepEqual(inputs.slice(install.OBSERVATION_INPUTS.length), addedInputs);
  assert.equal(inputs.length, new Set(inputs).size);
  for (const name of ['workspaces', 'configs', '.env', '.git', 'apps/worker/test', 'node_modules', 'output']) {
    assert.equal(inputs.includes(name), false, name);
  }
});

test('cross-identity copy includes only explicitly reviewed fixtures and test files', async t => {
  const source = await install.createOwnedWorkspace();
  const target = await install.createOwnedWorkspace();
  t.after(() => install.removeOwnedWorkspace(source));
  t.after(() => install.removeOwnedWorkspace(target));
  const directories = new Set([
    'apps/worker/src',
    'apps/worker/test/fixtures/security-review',
    'apps/worker/test/fixtures/repository-review',
    'apps/worker/test/fixtures/blackbox-observation',
    'apps/worker/test/fixtures/blackbox-cross-identity',
  ]);
  for (const entry of install.CROSS_IDENTITY_INPUTS) {
    const file = path.join(source.directory, entry, ...(directories.has(entry) ? ['safe.json'] : []));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, entry === '.npmrc' ? 'ignore-scripts=true\n' : 'fixture');
  }
  await mkdir(path.join(source.directory, 'workspaces'));
  await writeFile(path.join(source.directory, 'workspaces/private.json'), 'private sentinel');
  await writeFile(path.join(source.directory, 'apps/worker/test/cross-identity-unreviewed.test.mjs'), 'private sentinel');
  await install.copyReportingInputs(source.directory, target.directory, { crossIdentity: true });
  assert.equal(await readFile(path.join(target.directory,
    'apps/worker/test/fixtures/blackbox-cross-identity/safe.json'), 'utf8'), 'fixture');
  await assert.rejects(lstat(path.join(target.directory, 'workspaces')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(target.directory,
    'apps/worker/test/cross-identity-unreviewed.test.mjs')), { code: 'ENOENT' });
});
