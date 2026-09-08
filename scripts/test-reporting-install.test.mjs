import assert from 'node:assert/strict';
import { link, lstat, mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  copyReportingInputs, createOwnedWorkspace, parseInstallArguments, removeOwnedWorkspace,
  reportingChildEnvironment, CROSS_IDENTITY_INPUTS, REPORTING_INPUTS, REVIEW_INPUTS, installTestCommands, runCommand,
  validateNpmrc,
} from './test-reporting-install.mjs';

async function owned(t) {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  return owner.directory;
}

async function fixture(root, inputs = REPORTING_INPUTS) {
  for (const entry of inputs) {
    if (entry === 'apps/worker/src' || entry.includes('/test/fixtures/')) {
      await mkdir(path.join(root, entry), { recursive: true });
      await writeFile(path.join(root, entry, 'safe.ts'), 'export const value = 1;');
    } else {
      await mkdir(path.dirname(path.join(root, entry)), { recursive: true });
      await writeFile(path.join(root, entry), entry === '.npmrc' ? 'ignore-scripts=true\n' : 'reviewed fixture');
    }
  }
}

test('clean copy includes only reviewed inputs and excludes private and prebuilt state', async t => {
  const source = await owned(t);
  const target = await owned(t);
  await fixture(source);
  for (const name of ['.env', '.git/config', 'configs/private.yml', 'node_modules/private.txt', 'apps/worker/dist/private.js', 'saved-runs/private.json']) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), 'private sentinel');
  }
  await copyReportingInputs(source, target);
  assert.equal(await readFile(path.join(target, 'apps/worker/src/safe.ts'), 'utf8'), 'export const value = 1;');
  assert.deepEqual((await readdir(target)).sort(), ['.npmrc', 'apps', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'scripts', 'tsconfig.base.json'].sort());
  for (const name of ['.env', '.git', 'configs', 'node_modules', 'apps/worker/dist', 'saved-runs']) {
    await assert.rejects(lstat(path.join(target, name)), { code: 'ENOENT' });
  }
  await assert.rejects(copyReportingInputs(source, target), /must start empty/);
});

test('copy rejects junctions or symbolic directory links and multiply linked files', async t => {
  const source = await owned(t);
  const target = await owned(t);
  const outside = await owned(t);
  await fixture(source);
  await symlink(outside, path.join(source, 'apps/worker/src/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyReportingInputs(source, target), /Linked reporting inputs/);
  const source2 = await owned(t);
  const target2 = await owned(t);
  await fixture(source2);
  await link(path.join(source2, 'apps/worker/src/safe.ts'), path.join(source2, 'apps/worker/src/alias.ts'));
  await assert.rejects(copyReportingInputs(source2, target2), /Linked reporting inputs/);
});

test('copy rejects accidental .env inputs inside the allowlisted source tree', async t => {
  const source = await owned(t);
  const target = await owned(t);
  await fixture(source);
  await writeFile(path.join(source, 'apps/worker/src/.env.local'), 'private sentinel');
  await assert.rejects(copyReportingInputs(source, target), /Private or generated/);
});

test('npm configuration rejects credentials, substitution and unreviewed settings', () => {
  assert.doesNotThrow(() => validateNpmrc('auto-install-peers=true\r\nstrict-peer-dependencies=false\r\nminimum-release-age=10080\r\nignore-scripts=true\r\n'));
  for (const value of ['//registry.npmjs.org/:_authToken=secret', 'registry=${PRIVATE_REGISTRY}', 'ignore-scripts=false', 'ignore-scripts=true\nignore-scripts=true']) {
    assert.throws(() => validateNpmrc(value), /credential-free/);
  }
});

test('child environment preserves runtime paths without provider, registry or shell injection settings', () => {
  const env = reportingChildEnvironment({ Path: 'runtime', SystemRoot: 'windows', HOME: 'user', TEMP: 'tmp',
    OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', NPM_TOKEN: 'secret', npm_config_registry: 'private',
    NODE_OPTIONS: '--import=private', npm_config_script_shell: 'private', CUSTOM_SECRET: 'secret' }, 'empty-config');
  assert.deepEqual(env, { Path: 'runtime', SystemRoot: 'windows', HOME: 'user', TEMP: 'tmp', CI: 'true',
    npm_config_ignore_scripts: 'true', npm_config_userconfig: 'empty-config', npm_config_globalconfig: 'empty-config' });
});

test('cleanup rejects changed owner identity and directory bounds without deleting contents', async t => {
  const owner = await createOwnedWorkspace();
  t.after(() => removeOwnedWorkspace(owner));
  await writeFile(path.join(owner.directory, 'marker'), 'keep');
  for (const invalid of [{ ...owner, ino: -1 }, { ...owner, parent: path.dirname(owner.parent) },
    { ...owner, prefix: 'shannon-reporting-install-' }, { ...owner, directory: owner.parent }]) {
    await assert.rejects(removeOwnedWorkspace(invalid), /unowned/);
    assert.equal(await readFile(path.join(owner.directory, 'marker'), 'utf8'), 'keep');
  }
});

test('bounded commands report failure, startup failure, interruption and timeout instead of passing', async () => {
  assert.equal((await runCommand(process.execPath, ['-e', 'process.stdout.write("passed")'], { capture: true })).trim(), 'passed');
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(3)'], { capture: true }), /exit 3/);
  await assert.rejects(runCommand('missing-reporting-executable-66c4', [], { capture: true }), /could not start/);
  await assert.rejects(runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { capture: true, timeoutMs: 100 }), /timed out/);
  const controller = new AbortController();
  const running = runCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { capture: true, signal: controller.signal });
  controller.abort();
  await assert.rejects(running, /interrupted/);
  await assert.rejects(runCommand(process.execPath, ['-e', 'process.exit(0)'], { signal: controller.signal }), /interrupted/);
});

test('offline and explicit cache options are parsed without accepting arbitrary pnpm commands', () => {
  assert.deepEqual(parseInstallArguments(['--offline', '--store-dir', './package cache']), { offline: true, storeDir: path.resolve('./package cache'), review: false });
  assert.deepEqual(parseInstallArguments([]), { offline: false, storeDir: undefined, review: false });
  for (const args of [['--offline', '--offline'], ['--store-dir'], ['--store-dir', '--offline'], ['--ignore-scripts=false'], ['publish'], ['--review', '--review'], ['--review', 'publish']]) {
    assert.throws(() => parseInstallArguments(args), /Usage:/);
  }
});

test('review clean-install profile selects fixed review cases and the existing reporting regression suite', () => {
  const options = parseInstallArguments(['--review', '--offline', '--store-dir', './package cache']);
  assert.deepEqual(options, { offline: true, storeDir: path.resolve('./package cache'), review: true });
  assert.deepEqual(installTestCommands(options.review), [['test:review:cases'], ['test:reporting:bundles']]);
  assert.deepEqual(installTestCommands(false), [['test:reporting:bundles']]);
});

test('review context copies explicit review tests and fixtures without broadening to arbitrary checkout tests', async t => {
  const source = await owned(t);
  const target = await owned(t);
  await fixture(source, REVIEW_INPUTS);
  for (const name of ['apps/worker/test/security-review-unreviewed.test.mjs', '.env', 'configs/private.yaml', 'workspaces/private/report.json']) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), 'private sentinel');
  }
  await copyReportingInputs(source, target, { review: true });
  for (const name of ['scripts/review.mjs', 'scripts/evaluate-security-review.mjs', 'scripts/security-review-cli.test.mjs',
    'apps/worker/test/security-review-input.test.mjs', 'apps/worker/test/security-review-evaluation.test.mjs',
    'apps/worker/test/security-review-openapi-review.test.mjs', 'apps/worker/test/security-review-compose-review.test.mjs',
    'apps/worker/test/report-bundle.test.mjs']) assert.equal(await readFile(path.join(target, name), 'utf8'), 'reviewed fixture');
  assert.equal(await readFile(path.join(target, 'apps/worker/test/fixtures/security-review/safe.ts'), 'utf8'), 'export const value = 1;');
  for (const name of ['apps/worker/test/security-review-unreviewed.test.mjs', '.env', 'configs', 'workspaces', 'node_modules', 'apps/worker/dist']) await assert.rejects(lstat(path.join(target, name)), { code: 'ENOENT' });
  const reportingOnly = await owned(t);
  await copyReportingInputs(source, reportingOnly);
  await assert.rejects(lstat(path.join(reportingOnly, 'scripts/review.mjs')), { code: 'ENOENT' });
  await assert.rejects(lstat(path.join(reportingOnly, 'apps/worker/test/fixtures/security-review')), { code: 'ENOENT' });
});

test('review fixture-tree copying preserves private-file and linked-directory rejection', async t => {
  const source = await owned(t);
  const target = await owned(t);
  await fixture(source, REVIEW_INPUTS);
  await writeFile(path.join(source, 'apps/worker/test/fixtures/security-review/.env.local'), 'private sentinel');
  await assert.rejects(copyReportingInputs(source, target, { review: true }), /Private or generated/);
  const linkedSource = await owned(t);
  const linkedTarget = await owned(t);
  const outside = await owned(t);
  await fixture(linkedSource, REVIEW_INPUTS);
  await symlink(outside, path.join(linkedSource, 'apps/worker/test/fixtures/security-review/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(copyReportingInputs(linkedSource, linkedTarget, { review: true }), /Linked reporting inputs/);
});

test('cross-identity context copies required black-box runtime assets without broadening the prompt allowlist', async t => {
  const source = await owned(t);
  const target = await owned(t);
  await fixture(source, CROSS_IDENTITY_INPUTS);
  const required = [
    'apps/worker/configs/config-schema.json',
    'apps/worker/prompts/blackbox-planner.txt',
    'apps/worker/prompts/blackbox-recon.txt',
    'apps/worker/prompts/blackbox-analysis.txt',
    'apps/worker/prompts/blackbox-action.txt',
    'apps/worker/prompts/blackbox-verifier.txt',
  ];
  await mkdir(path.join(source, 'apps/worker/prompts'), { recursive: true });
  await writeFile(path.join(source, 'apps/worker/prompts/recon.txt'), 'unreviewed prompt');

  await copyReportingInputs(source, target, { crossIdentity: true });

  for (const name of required) assert.equal(await readFile(path.join(target, name), 'utf8'), 'reviewed fixture');
  await assert.rejects(lstat(path.join(target, 'apps/worker/prompts/recon.txt')), { code: 'ENOENT' });
});
