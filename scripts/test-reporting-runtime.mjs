import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import {
  copyReportingInputs,
  CROSS_IDENTITY_INPUTS,
  OBSERVATION_INPUTS,
  REPORTING_INPUTS,
  REVIEW_INPUTS,
} from './test-reporting-install.mjs';

const repository = fileURLToPath(new URL('../', import.meta.url));
const runId = randomUUID();
const prefix = `shannon-reporting-${runId}`;
const network = `${prefix}-net`;
const server = `${prefix}-temporal`;
const worker = `${prefix}-worker`;
const image = `shannon-reporting-runtime:${runId}`;
const temporalImage = 'temporalio/temporal:1.7.0';
const label = `com.shannon.reporting-test=${runId}`;
const attemptedContainers = [];
let attemptedNetwork = false;
let attemptedImage = false;
let context;
let temporaryDirectory;
let activeProcess;
let interrupted = false;

// Docker receives only these files, never the checkout's .git, .env, saved runs,
// configs, credential stores, or host node_modules. Worker sources are compiled,
// but the container command starts only synthetic reporting or local review tests.
const runtimeInputs = [
  'apps/worker/test/reporting-runtime.test.mjs',
  'apps/worker/test/fixtures/reporting-runtime',
];

export function reportingTestProfile(args) {
  if (args.length === 0) return { name: 'runtime', temporal: true, network, command: [] };
  if (args.length === 1 && args[0] === '--bundles')
    return { name: 'bundles', temporal: false, network: 'none', command: ['pnpm', 'test:reporting:bundles'] };
  if (args.length === 1 && args[0] === '--review')
    return { name: 'review', temporal: false, network: 'none', command: ['pnpm', 'test:review:cases'] };
  if (args.length === 1 && args[0] === '--observation')
    return { name: 'observation', temporal: false, network: 'none', command: ['pnpm', 'test:blackbox-observation:regressions'] };
  if (args.length === 1 && args[0] === '--cross-identity')
    return { name: 'cross-identity', temporal: false, network: 'none', command: ['pnpm', 'test:blackbox-cross-identity:regressions'] };
  throw new Error('Usage: node scripts/test-reporting-runtime.mjs [--bundles|--review|--observation|--cross-identity]');
}

export function reportingContextInputs(profile) {
  if (profile.name === 'cross-identity') return [...CROSS_IDENTITY_INPUTS];
  if (profile.name === 'observation') return [...OBSERVATION_INPUTS];
  if (profile.name === 'review') return [...REVIEW_INPUTS];
  if (profile.name === 'runtime' || profile.name === 'bundles') return [...REPORTING_INPUTS, ...runtimeInputs];
  throw new Error('Unsupported reporting context profile');
}

function docker(args, { timeout = 30_000, capture = false, allowFailure = false, cleanup = false } = {}) {
  if (interrupted && !cleanup) throw new Error('Reporting runtime check interrupted');
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: repository,
      shell: false,
      windowsHide: true,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    });
    activeProcess = child;
    let output = '';
    let timedOut = false;
    const collect = chunk => { output = (output + chunk.toString()).slice(-65_536); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeout);
    child.on('error', error => {
      clearTimeout(timer);
      if (activeProcess === child) activeProcess = undefined;
      reject(error);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (activeProcess === child) activeProcess = undefined;
      const result = { code, output, timedOut };
      if (allowFailure || (code === 0 && !timedOut)) resolve(result);
      else reject(new Error(`docker ${args[0]} ${timedOut ? `timed out after ${timeout / 1000}s` : `failed (${code})`}${output ? `\n${output.trim()}` : ''}`));
    });
  });
}

async function copyContextEntry(source, destination) {
  const stat = await lstat(source);
  if (stat.isSymbolicLink()) throw new Error(`Symlinks are not allowed in the reporting build context: ${source}`);
  if (stat.isDirectory()) {
    await mkdir(destination, { recursive: true });
    for (const entry of await readdir(source)) {
      await copyContextEntry(path.join(source, entry), path.join(destination, entry));
    }
  } else if (stat.isFile()) {
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
  } else {
    throw new Error(`Unsupported reporting build input: ${source}`);
  }
}

async function waitForTemporal() {
  const deadline = Date.now() + 60_000;
  let lastOutput = '';
  do {
    const result = await docker(['exec', server, 'temporal', 'operator', 'cluster', 'health', '--address', '127.0.0.1:7233'], {
      capture: true, allowFailure: true, timeout: 5_000,
    });
    if (result.code === 0 && !result.timedOut) return;
    lastOutput = result.output;
    await delay(1_000);
  } while (Date.now() < deadline);
  throw new Error(`The isolated Temporal server did not become healthy within 60s.\n${lastOutput}`);
}

// Creation responses can be lost after Docker creates a resource. Inspect every
// attempted UUID-scoped name and prove ownership before removing anything.
export async function removeOwnedResource(run, kind, name, owner) {
  const labels = kind === 'network' ? '.Labels' : '.Config.Labels';
  const options = { capture: true, allowFailure: true, cleanup: true, timeout: 15_000 };
  const inspected = await run([kind, 'inspect', '--format', `{{ index ${labels} "com.shannon.reporting-test" }}`, name], options);
  if (inspected.code !== 0 || inspected.timedOut) {
    if (!inspected.timedOut && /No such (container|image|network|object)\b/i.test(inspected.output)) return;
    throw new Error(`Could not inspect test ${kind} ${name}: ${inspected.output.trim()}`);
  }
  if (inspected.output.trim() !== owner) throw new Error(`Refusing to remove ${kind} ${name}: ownership label does not match`);
  const result = await run([kind, 'rm', ...(kind === 'container' ? ['--force'] : []), name], options);
  if (result.code !== 0 || result.timedOut) throw new Error(`Could not remove test ${kind} ${name}: ${result.output.trim()}`);
}

export function assertSuccessfulContainer(state) {
  if (state.Status !== 'exited' || state.Running !== false || state.ExitCode !== 0) {
    throw new Error(`Reporting test container did not exit successfully: ${JSON.stringify(state)}`);
  }
}

async function cleanup() {
  let failed = false;
  const resources = [
    ...attemptedContainers.reverse().map(name => ['container', name]),
    ...(attemptedNetwork ? [['network', network]] : []),
    ...(attemptedImage ? [['image', image]] : []),
  ];
  for (const [kind, name] of resources) {
    try {
      await removeOwnedResource(docker, kind, name, runId);
    } catch (error) {
      console.error(error.message);
      failed = true;
    }
  }
  if (context) {
    // Verify the absolute mkdtemp-owned path before recursive deletion on Windows.
    const resolved = await realpath(context);
    if (path.dirname(resolved) !== temporaryDirectory || !path.basename(resolved).startsWith(`${prefix}-`)) {
      throw new Error(`Refusing to remove an unexpected temporary path: ${resolved}`);
    }
    await rm(resolved, { recursive: true, force: true });
  }
  if (failed) throw new Error('Reporting runtime resource cleanup failed; resource names are listed above');
}

async function main() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      interrupted = true;
      activeProcess?.kill('SIGKILL');
    });
  }

  try {
    const profile = reportingTestProfile(process.argv.slice(2));
    console.log(`[reporting-${profile.name}] Run ${runId}`);
    console.log('[reporting-runtime] Checking Docker Linux engine');
    const version = await docker(['info', '--format', '{{.OSType}}'], { capture: true, timeout: 15_000 });
    if (version.output.trim() !== 'linux') throw new Error('Reporting runtime checks require a working Linux Docker engine');

    temporaryDirectory = await realpath(tmpdir());
    context = await mkdtemp(path.join(temporaryDirectory, `${prefix}-`));
    // Reuse the reviewed empty-context copy guards for all shared inputs.
    await copyReportingInputs(repository, context, {
      review: profile.name === 'review',
      observation: profile.name === 'observation',
      crossIdentity: profile.name === 'cross-identity',
    });
    if (profile.temporal || profile.name === 'bundles') {
      for (const entry of runtimeInputs) await copyContextEntry(path.join(repository, entry), path.join(context, entry));
    }
    await copyContextEntry(path.join(repository, 'scripts/reporting-runtime.Dockerfile'), path.join(context, 'Dockerfile'));

    console.log('[reporting-runtime] Building the test-only worker package from allowlisted inputs');
    attemptedImage = true;
    await docker(['build', '--label', label, '--tag', image, context], { timeout: 600_000 });
    if (profile.temporal) {
      // Pull before creating the internal network. Tests cannot reach external hosts.
      const available = await docker(['image', 'inspect', temporalImage], { capture: true, allowFailure: true });
      if (available.code !== 0) await docker(['pull', temporalImage], { timeout: 180_000 });

      attemptedNetwork = true;
      await docker(['network', 'create', '--internal', '--label', label, network], { capture: true });
      attemptedContainers.push(server);
      await docker(['create', '--name', server, '--label', label, '--network', network, '--network-alias', 'temporal', temporalImage,
        'server', 'start-dev', '--ip', '0.0.0.0', '--headless'], { capture: true });
      await docker(['start', server], { capture: true });
      console.log('[reporting-runtime] Waiting for the isolated Temporal server');
      await waitForTemporal();
    }

    attemptedContainers.push(worker);
    await docker(['create', '--name', worker, '--label', label, '--network', profile.network,
      '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
      ...(profile.temporal ? ['--env', 'REPORTING_TEMPORAL_ADDRESS=temporal:7233'] : []), image, ...profile.command], { capture: true });
    console.log(`[reporting-${profile.name}] Running isolated ${profile.name} tests`);
    await docker(['start', '--attach', worker], { timeout: 180_000 });
    const result = await docker(['inspect', '--format', '{{json .State}}', worker], { capture: true });
    assertSuccessfulContainer(JSON.parse(result.output));
    console.log(`[reporting-${profile.name}] Isolated ${profile.name} tests passed`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
    if (attemptedContainers.includes(server)) {
      await docker(['logs', '--tail', '40', server], { allowFailure: true, cleanup: true, timeout: 10_000 }).catch(() => {});
    }
  } finally {
    await cleanup().catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
