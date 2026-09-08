import assert from 'node:assert/strict';
import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import * as install from './test-reporting-install.mjs';
import { reportingContextInputs, reportingTestProfile } from './test-reporting-runtime.mjs';

test('observation profiles select fixed passive tests plus review/reporting regressions', () => {
  const profile = reportingTestProfile(['--observation']);
  assert.deepEqual(profile, { name: 'observation', temporal: false, network: 'none',
    command: ['pnpm', 'test:blackbox-observation:regressions'] });
  const options = install.parseInstallArguments(['--observation', '--offline']);
  assert.deepEqual(options, { review: false, observation: true, offline: true, storeDir: undefined });
  assert.deepEqual(install.installTestCommands(false, true), [
    ['test:blackbox-observation:cases'], ['test:review:cases'], ['test:reporting:bundles'],
  ]);
  for (const args of [['--observation', '--review'], ['--observation', '--observation'], ['--observation', 'publish']]) {
    assert.throws(() => install.parseInstallArguments(args), /Usage:/);
    assert.throws(() => reportingTestProfile(args), /Usage:/);
  }
  const inputs = reportingContextInputs(profile);
  assert.deepEqual(inputs, [...install.OBSERVATION_INPUTS]);
  assert.equal(inputs.length, new Set(inputs).size);
  for (const name of ['scripts/blackbox-observe.mjs', 'scripts/blackbox-observe.test.mjs',
    'scripts/evaluate-blackbox-observation.mjs', 'apps/worker/test/fixtures/blackbox-observation',
    'apps/worker/test/blackbox-observation-core.test.mjs', 'apps/worker/test/blackbox-observation-workflow.test.mjs',
    'apps/worker/test/blackbox-observation-file.test.mjs', 'apps/worker/test/blackbox-observation-evaluation.test.mjs']) {
    assert.ok(inputs.includes(name), name);
  }
  for (const name of ['workspaces', 'configs', '.env', '.git', 'apps/worker/test', 'node_modules', 'output']) {
    assert.ok(!inputs.includes(name), name);
  }
});

test('observation context copies only the explicit synthetic corpus and test files', async t => {
  const source = await install.createOwnedWorkspace();
  const target = await install.createOwnedWorkspace();
  t.after(() => install.removeOwnedWorkspace(source));
  t.after(() => install.removeOwnedWorkspace(target));
  for (const entry of install.OBSERVATION_INPUTS) {
    const isDirectory = entry === 'apps/worker/src' || entry.startsWith('apps/worker/test/fixtures/');
    const file = path.join(source.directory, entry, ...(isDirectory ? ['safe.json'] : []));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, entry === '.npmrc' ? 'ignore-scripts=true\n' : 'fixture');
  }
  await mkdir(path.join(source.directory, 'workspaces'));
  await writeFile(path.join(source.directory, 'workspaces', 'private.json'), 'private sentinel');
  await writeFile(path.join(source.directory, 'apps/worker/test/unreviewed.test.mjs'), 'private sentinel');
  await install.copyReportingInputs(source.directory, target.directory, { observation: true });
  assert.equal(await readFile(path.join(target.directory, 'apps/worker/test/fixtures/blackbox-observation/safe.json'), 'utf8'), 'fixture');
  await assert.rejects(lstat(path.join(target.directory, 'workspaces')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(target.directory, 'apps/worker/test/unreviewed.test.mjs')), { code: 'ENOENT' });
});
