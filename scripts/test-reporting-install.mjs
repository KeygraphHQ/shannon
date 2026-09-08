import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
export const REPORTING_INPUTS = Object.freeze([
  'package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', '.npmrc', 'tsconfig.base.json',
  'apps/worker/package.json', 'apps/cli/package.json', 'apps/worker/tsconfig.json',
  'apps/worker/src', 'scripts/reports.mjs', 'scripts/reporting-cli-smoke.test.mjs',
  'apps/worker/test/report-bundle.test.mjs',
  'apps/worker/test/report-bundle-validation.test.mjs',
  'apps/worker/test/report-bundle-sanitized.test.mjs',
  'apps/worker/test/report-catalog.test.mjs',
  'apps/worker/test/catalog-html.test.mjs',
  'apps/worker/test/report-library.test.mjs',
]);
export const REVIEW_INPUTS = Object.freeze([
  ...REPORTING_INPUTS,
  'apps/worker/test/fixtures/security-review',
  'apps/worker/test/fixtures/repository-review',
  'apps/worker/test/security-review-identity.test.mjs',
  'apps/worker/test/security-review-repository-file.test.mjs',
  'apps/worker/test/security-review-repository.test.mjs',
  'apps/worker/test/security-review-comparison.test.mjs',
  'apps/worker/test/security-review-repository-evaluation.test.mjs',
  'apps/worker/test/security-review-input.test.mjs',
  'apps/worker/test/security-review-openapi.test.mjs',
  'apps/worker/test/security-review-compose.test.mjs',
  'apps/worker/test/security-review-evaluation.test.mjs',
  'apps/worker/test/security-review-openapi-review.test.mjs',
  'apps/worker/test/security-review-compose-review.test.mjs',
  'apps/worker/test/security-review-boundaries-review.test.mjs',
  'scripts/security-review-cli.test.mjs',
  'scripts/repository-review-cli.test.mjs',
  'scripts/review.mjs',
  'scripts/evaluate-security-review.mjs',
  'scripts/evaluate-repository-review.mjs',
  'scripts/repository-review-ci-example.mjs',
]);
export const OBSERVATION_INPUTS = Object.freeze([
  ...REVIEW_INPUTS,
  'apps/worker/test/fixtures/blackbox-observation',
  'apps/worker/test/blackbox-observation-core.test.mjs',
  'apps/worker/test/blackbox-observation-core-review.test.mjs',
  'apps/worker/test/blackbox-observation-workflow.test.mjs',
  'apps/worker/test/blackbox-observation-file.test.mjs',
  'apps/worker/test/blackbox-observation-evaluation.test.mjs',
  'apps/worker/test/blackbox-observation-io-review.test.mjs',
  'apps/worker/test/blackbox-observation-raw.test.mjs',
  'scripts/blackbox-observe.mjs',
  'scripts/blackbox-observe.test.mjs',
  'scripts/evaluate-blackbox-observation.mjs',
  'scripts/test-reporting-install.mjs',
]);
export const CROSS_IDENTITY_INPUTS = Object.freeze([
  ...OBSERVATION_INPUTS,
  'apps/worker/configs/config-schema.json',
  'apps/worker/prompts/blackbox-action.txt',
  'apps/worker/prompts/blackbox-analysis.txt',
  'apps/worker/prompts/blackbox-planner.txt',
  'apps/worker/prompts/blackbox-recon.txt',
  'apps/worker/prompts/blackbox-verifier.txt',
  'apps/worker/test/fixtures/blackbox-cross-identity',
  'apps/worker/test/blackbox-cross-identity-core.test.mjs',
  'apps/worker/test/blackbox-cross-identity-raw.test.mjs',
  'apps/worker/test/blackbox-cross-identity-render.test.mjs',
  'apps/worker/test/blackbox-cross-identity-file.test.mjs',
  'apps/worker/test/blackbox-cross-identity-evaluation.test.mjs',
  'apps/worker/test/blackbox-access-validation.test.mjs',
  'apps/worker/test/blackbox-access-validation-file.test.mjs',
  'apps/worker/test/blackbox-agent-contracts.test.mjs',
  'apps/worker/test/blackbox-artifacts.test.mjs',
  'apps/worker/test/blackbox-attack-compiler.test.mjs',
  'apps/worker/test/blackbox-bash-guard.test.mjs',
  'apps/worker/test/blackbox-tool-policy.test.mjs',
  'apps/worker/test/blackbox-worker-entry.test.mjs',
  'apps/worker/test/blackbox-workflow.test.mjs',
  'apps/worker/test/blackbox-activities.test.mjs',
  'scripts/blackbox-compare.mjs',
  'scripts/blackbox-compare.test.mjs',
  'scripts/blackbox-validation-bundle.mjs',
  'scripts/blackbox-validation-bundle.test.mjs',
  'scripts/evaluate-blackbox-cross-identity.mjs',
  'scripts/blackbox-cross-identity-harness.test.mjs',
]);
const protectedInputs = REPORTING_INPUTS.filter(name => name.endsWith('package.json') || name.endsWith('.yaml'));
const forbiddenNames = new Set(['.git', '.codex', '.agents', '.env', '.npmrc', 'node_modules', 'dist']);
const pathKey = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;

export function validateNpmrc(text) {
  const allowed = new Set([
    'auto-install-peers=true', 'strict-peer-dependencies=false',
    'minimum-release-age=10080', 'ignore-scripts=true',
  ]);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.some(line => !allowed.has(line)) || new Set(lines).size !== lines.length ||
      !lines.includes('ignore-scripts=true')) {
    throw new Error('Reporting install requires the reviewed credential-free .npmrc settings');
  }
}

export async function copyReportingInputs(source, destination, {
  review = false,
  observation = false,
  crossIdentity = false,
} = {}) {
  if ((await lstat(source)).isSymbolicLink() || (await lstat(destination)).isSymbolicLink()) {
    throw new Error('Linked reporting inputs are not allowed');
  }
  const sourceRoot = await realpath(source);
  const destinationRoot = await realpath(destination);
  if ((await readdir(destinationRoot)).length !== 0) throw new Error('Reporting context must start empty');
  async function copy(relative) {
    const input = path.join(sourceRoot, relative);
    const output = path.join(destinationRoot, relative);
    const stat = await lstat(input);
    if (stat.isSymbolicLink() || pathKey(await realpath(input)) !== pathKey(input) ||
        (stat.isFile() && stat.nlink !== 1)) throw new Error('Linked reporting inputs are not allowed');
    if (stat.isDirectory()) {
      await mkdir(output, { recursive: true });
      for (const name of await readdir(input)) {
        const lowerName = name.toLowerCase();
        if (forbiddenNames.has(lowerName) || lowerName.startsWith('.env.')) throw new Error('Private or generated reporting inputs are not allowed');
        await copy(path.join(relative, name));
      }
    } else if (stat.isFile()) {
      if (relative === '.npmrc') validateNpmrc(await readFile(input, 'utf8'));
      await mkdir(path.dirname(output), { recursive: true });
      await copyFile(input, output, constants.COPYFILE_EXCL);
    } else throw new Error('Unsupported reporting input');
  }
  // This explicit list never reads saved runs, configs, user .npmrc or the checkout's .git.
  const inputs = crossIdentity
    ? CROSS_IDENTITY_INPUTS
    : observation
      ? OBSERVATION_INPUTS
      : review
        ? REVIEW_INPUTS
        : REPORTING_INPUTS;
  for (const entry of inputs) await copy(entry);
}

export async function createOwnedWorkspace() {
  const parent = await realpath(tmpdir());
  const prefix = `shannon-reporting-install-${randomUUID()}-`;
  const directory = await mkdtemp(path.join(parent, prefix));
  const stat = await lstat(directory, { bigint: true });
  return Object.freeze({ directory, parent, prefix, dev: stat.dev, ino: stat.ino });
}

export async function removeOwnedWorkspace(owner) {
  const stat = await lstat(owner.directory, { bigint: true });
  const resolved = await realpath(owner.directory);
  if (!path.isAbsolute(owner.directory) || stat.isSymbolicLink() || !stat.isDirectory() ||
      !sameEntry(stat, owner) || pathKey(resolved) !== pathKey(owner.directory) ||
      pathKey(path.dirname(resolved)) !== pathKey(owner.parent) ||
      !/^shannon-reporting-install-[0-9a-f-]{36}-$/.test(owner.prefix) ||
      !path.basename(resolved).startsWith(owner.prefix)) {
    throw new Error('Refusing cleanup of an unowned reporting install directory');
  }
  // The exact mkdtemp-owned absolute path and its inode have been checked above.
  await rm(resolved, { recursive: true, force: false });
}

export function reportingChildEnvironment(input = process.env, configFile) {
  const allowed = new Set(['path', 'systemroot', 'windir', 'comspec', 'pathext', 'temp', 'tmp', 'tmpdir',
    'home', 'userprofile', 'appdata', 'localappdata', 'programfiles', 'programfiles(x86)', 'pnpm_home']);
  const environment = Object.fromEntries(Object.entries(input).filter(([name]) => allowed.has(name.toLowerCase())));
  environment.CI = 'true';
  environment.npm_config_ignore_scripts = 'true';
  if (configFile) {
    environment.npm_config_userconfig = configFile;
    environment.npm_config_globalconfig = configFile;
  }
  return environment;
}

function stopChild(child) {
  if (!child.pid) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      shell: false, windowsHide: true, stdio: 'ignore',
    });
    killer.on('error', () => child.kill('SIGKILL'));
    const timer = setTimeout(() => { killer.kill('SIGKILL'); child.kill('SIGKILL'); }, 5_000);
    killer.on('close', () => { clearTimeout(timer); child.kill('SIGKILL'); });
  } else {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
  }
}

export async function runCommand(command, args, { cwd, env, timeoutMs = 60_000, signal, capture = false } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 900_000) throw new Error('Invalid reporting command timeout');
  if (signal?.aborted) throw new Error('Reporting install interrupted');
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32',
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
    });
    let output = '';
    let timedOut = false;
    let aborted = false;
    const collect = chunk => { output = (output + chunk.toString()).slice(-65_536); };
    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);
    const interrupt = () => { aborted = true; stopChild(child); };
    signal?.addEventListener('abort', interrupt, { once: true });
    const timer = setTimeout(() => { timedOut = true; stopChild(child); }, timeoutMs);
    const clear = () => { clearTimeout(timer); signal?.removeEventListener('abort', interrupt); };
    child.on('error', () => { clear(); reject(new Error('Reporting command could not start')); });
    child.on('close', code => {
      clear();
      if (aborted) reject(new Error('Reporting install interrupted'));
      else if (timedOut) reject(new Error('Reporting command timed out'));
      else if (code !== 0) reject(new Error(`Reporting command failed (exit ${code})`));
      else resolve(output);
    });
  });
}

export function parseInstallArguments(args) {
  let offline = false;
  let review = false;
  let observation = false;
  let crossIdentity = false;
  let storeDir;
  for (let index = 0; index < args.length; index++) {
    if (args[index] === '--offline' && !offline) offline = true;
    else if (args[index] === '--review' && !review && !observation && !crossIdentity) review = true;
    else if (args[index] === '--observation' && !observation && !review && !crossIdentity) observation = true;
    else if (args[index] === '--cross-identity' && !crossIdentity && !review && !observation) crossIdentity = true;
    else if (args[index] === '--store-dir' && storeDir === undefined && args[index + 1] && !args[index + 1].startsWith('--')) {
      storeDir = path.resolve(args[++index]);
    } else throw new Error('Usage: node scripts/test-reporting-install.mjs [--review|--observation|--cross-identity] [--offline] [--store-dir <cache-directory>]');
  }
  return {
    offline,
    storeDir,
    review,
    ...(observation ? { observation: true } : {}),
    ...(crossIdentity ? { crossIdentity: true } : {}),
  };
}

export function installTestCommands(review = false, observation = false, crossIdentity = false) {
  if (crossIdentity) return [['test:blackbox-cross-identity:regressions']];
  if (observation) return [['test:blackbox-observation:cases'], ['test:review:cases'], ['test:reporting:bundles']];
  return review ? [['test:review:cases'], ['test:reporting:bundles']] : [['test:reporting:bundles']];
}

async function main() {
  let owner;
  const controller = new AbortController();
  const interrupted = () => controller.abort();
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, interrupted);
  try {
    const {
      offline,
      storeDir,
      review,
      observation = false,
      crossIdentity = false,
    } = parseInstallArguments(process.argv.slice(2));
    const tag = crossIdentity
      ? 'cross-identity-install'
      : observation
        ? 'observation-install'
        : review
          ? 'review-install'
          : 'reporting-install';
    const pnpm = process.env.npm_execpath;
    if (!pnpm || !/\.(c?js|mjs)$/.test(pnpm) || !(await lstat(pnpm)).isFile()) {
      throw new Error('Run this check through a fixed reporting, review, observation or cross-identity install script');
    }
    owner = await createOwnedWorkspace();
    await copyReportingInputs(repository, owner.directory, { review, observation, crossIdentity });
    for (const entry of ['node_modules', 'apps/worker/dist', '.git']) {
      try { await lstat(path.join(owner.directory, entry)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      throw new Error('Reporting install context contains existing build state');
    }
    const original = await Promise.all(protectedInputs.map(name => readFile(path.join(owner.directory, name))));
    const configFile = path.join(owner.directory, 'empty-user.npmrc');
    await writeFile(configFile, '', { flag: 'wx', mode: 0o600 });
    const environment = reportingChildEnvironment(process.env, configFile);
    const run = (args, timeoutMs = 60_000, capture = false) => runCommand(process.execPath, [pnpm, ...args], {
      cwd: owner.directory, env: environment, timeoutMs, capture, signal: controller.signal,
    });
    const expected = JSON.parse(await readFile(path.join(owner.directory, 'package.json'), 'utf8')).packageManager;
    const version = (await run(['--version'], 30_000, true)).trim();
    if (`pnpm@${version}` !== expected) throw new Error('The active pnpm version does not match packageManager');
    console.log(`[${tag}] Fresh dependency tree; ${offline ? 'cache-only' : 'public registry'} install with frozen lockfile`);
    await run(['install', '--frozen-lockfile', '--ignore-scripts', '--registry=https://registry.npmjs.org',
      ...(offline ? ['--offline'] : []), ...(storeDir ? ['--store-dir', storeDir] : [])], 600_000);
    console.log(`[${tag}] Building worker in the clean context`);
    await run(['--filter', '@shannon/worker', 'build'], 180_000);
    for (const command of installTestCommands(review, observation, crossIdentity)) {
      console.log(`[${tag}] Running ${command[0]} in the clean context`);
      await run(command, 180_000);
    }
    for (let index = 0; index < protectedInputs.length; index++) {
      if (!(await readFile(path.join(owner.directory, protectedInputs[index]))).equals(original[index])) {
        throw new Error('Reporting install modified a package or lock manifest');
      }
    }
    const scope = crossIdentity
      ? 'cross-identity plus observation/review/reporting'
      : observation
        ? 'observation plus review/reporting'
        : review
          ? 'review plus reporting'
          : 'reporting';
    console.log(`[${tag}] Clean install, build and ${scope} commands passed on ${process.platform}/${process.arch}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    if (owner) await removeOwnedWorkspace(owner).catch(() => {
      console.error('[reporting-install] Owned temporary directory cleanup failed');
      process.exitCode = 1;
    });
    for (const signal of ['SIGINT', 'SIGTERM']) process.off(signal, interrupted);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
