/**
 * Docker orchestration — compose lifecycle, network, image pull/build, worker spawning.
 *
 * Local mode: builds locally, uses docker-compose.yml from repo root, mounts prompts.
 * NPX mode: pulls from Docker Hub, uses bundled compose.yml.
 */

import { type ChildProcess, execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { envBool, PI_AUTH_CONTAINER_PATH } from './env.js';
import { getMode, isDevMode } from './mode.js';
import { INTERNAL_DIR } from './paths.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NPX_IMAGE_REPO = 'keygraph/shannon';
const DEV_IMAGE = 'shannon-worker';

/** Docker label stamped on each worker container, mapping it back to its workspace so a single scan can be stopped by name. */
const WORKSPACE_LABEL = 'shannon.workspace';

export function getWorkerImage(version: string): string {
  return getMode() === 'local' ? DEV_IMAGE : `${NPX_IMAGE_REPO}:${version}`;
}

/** True when the working directory supplies a Dockerfile and build context. */
export function canBuildImage(): boolean {
  if (getMode() === 'local') return true;
  if (!isDevMode()) return false;

  const hasDockerfile = fs.existsSync(path.resolve('Dockerfile'));
  const hasCompose = fs.existsSync(path.resolve('docker-compose.yml'));

  return hasDockerfile && hasCompose;
}

function getComposeFile(): string {
  return getMode() === 'local'
    ? path.resolve('docker-compose.yml')
    : path.resolve(__dirname, '..', 'infra', 'compose.yml');
}

/** Generate an 8-char random hex suffix for container/queue names. */
export function randomSuffix(): string {
  return crypto.randomBytes(4).toString('hex');
}

/** Run a command silently, return true if it succeeds. */
function runQuiet(cmd: string, args: string[]): boolean {
  try {
    execFileSync(cmd, args, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/** Run a command and return stdout, or empty string on failure. */
function runOutput(cmd: string, args: string[]): string {
  try {
    return execFileSync(cmd, args, { stdio: 'pipe', encoding: 'utf-8' }).trim();
  } catch {
    return '';
  }
}

/**
 * Verify Docker is installed and its daemon is running, exiting otherwise.
 * `docker info` succeeds only when both are true. Call this before any command
 * that shells out to Docker.
 */
export function ensureDocker(): void {
  try {
    execFileSync('docker', ['info'], { stdio: 'pipe' });
  } catch {
    console.error('ERROR: Docker must be installed and running. Start Docker and try again.');
    console.error('Install Docker: https://docs.docker.com/get-docker/');
    process.exit(1);
  }
}

/**
 * Check if Temporal is running and healthy.
 */
export function isTemporalReady(): boolean {
  const output = runOutput('docker', [
    'exec',
    'shannon-temporal',
    'temporal',
    'operator',
    'cluster',
    'health',
    '--address',
    'localhost:7233',
  ]);
  return output.includes('SERVING');
}

/**
 * Ensure Temporal is running via compose.
 */
export async function ensureInfra(): Promise<void> {
  if (isTemporalReady()) {
    return;
  }

  const composeFile = getComposeFile();
  console.log('Starting Shannon infrastructure...');
  execFileSync('docker', ['compose', '-f', composeFile, 'up', '-d'], { stdio: 'inherit' });

  console.log('Waiting for Temporal to be ready...');
  for (let i = 0; i < 30; i++) {
    if (isTemporalReady()) {
      console.log('Temporal is ready!');
      return;
    }
    await sleep(2000);
  }
  console.error('Timeout waiting for Temporal');
  process.exit(1);
}

/**
 * Build the worker image from the repository, tagged with the name this mode
 * resolves at run time.
 */
export function buildImage(noCache: boolean, version: string): void {
  const image = getWorkerImage(version);
  console.log(`Building ${image}...`);
  const args = ['build'];
  if (noCache) args.push('--no-cache');
  args.push('-t', image, '.');
  execFileSync('docker', args, { stdio: 'inherit' });
  console.log(`Build complete: ${image}`);
}

/**
 * Ensure the worker image is available.
 * Buildable checkout: auto-builds if missing. Otherwise: pulls from Docker Hub.
 */
export function ensureImage(version: string): void {
  const image = getWorkerImage(version);
  const exists = runQuiet('docker', ['image', 'inspect', image]);
  if (exists) return;

  if (canBuildImage()) {
    console.log('Shannon image not found, building...');
    buildImage(false, version);
  } else {
    console.log(`Pulling ${image}...`);
    try {
      execFileSync('docker', ['pull', image], { stdio: 'inherit' });
    } catch {
      console.error(`\nERROR: Failed to pull ${image}`);
      console.error('The image may not be available for your platform yet.');
      console.error('Check https://hub.docker.com/r/keygraph/shannon for available tags.');
      process.exit(1);
    }
    pruneOldImages(version);
  }
}

/**
 * Detect if --add-host is needed (Linux without Podman).
 * macOS has host.docker.internal built in.
 */
function addHostFlag(): string[] {
  if (os.platform() === 'linux') {
    const hasPodman = runQuiet('which', ['podman']);
    if (!hasPodman) {
      return ['--add-host', 'host.docker.internal:host-gateway'];
    }
  }
  return [];
}

/**
 * Names whose standard IPs aren't covered by `shouldSkipHostsIp`. Loopback names
 * stay because their IPs (127.x, ::1) get rewritten — not skipped. Others like
 * `broadcasthost` and `ip6-mcastprefix` are intentionally omitted: their IPs
 * (255.255.255.255, ff00::/8) are already dropped at the IP filter.
 */
const HOSTS_SKIP_NAMES = new Set([
  'localhost',
  'ip6-localhost',
  'ip6-loopback',
  'ip6-localnet',
  'host.docker.internal',
  'gateway.docker.internal',
  'kubernetes.docker.internal',
]);

function isLoopbackIp(ip: string): boolean {
  return ip.startsWith('127.') || ip === '::1';
}

function shouldSkipHostsIp(ip: string): boolean {
  if (ip === '0.0.0.0' || ip === '255.255.255.255') return true;
  // Cloud metadata range — consistent with Shannon's SSRF guard
  if (ip.startsWith('169.254.')) return true;
  const lower = ip.toLowerCase();
  if (lower.startsWith('fe80:') || lower.startsWith('ff')) return true;
  return false;
}

function shouldSkipHostsName(name: string, hostname: string): boolean {
  const lower = name.toLowerCase();
  if (HOSTS_SKIP_NAMES.has(lower)) return true;
  if (lower === hostname.toLowerCase()) return true;
  if (lower.endsWith('.localhost')) return true;
  return false;
}

/**
 * Read the host's /etc/hosts and emit --add-host flags so the worker resolves
 * user-added entries the same way. Loopback IPs (127.x, ::1) are rewritten to
 * `host-gateway` so they target the host's loopback instead of the container's.
 */
function forwardEtcHostsFlags(): string[] {
  if (!envBool('SHANNON_FORWARD_HOSTS', true)) return [];
  if (os.platform() === 'win32') return [];

  let content: string;
  try {
    content = fs.readFileSync('/etc/hosts', 'utf-8');
  } catch {
    return [];
  }

  const hostname = os.hostname();
  const flags: string[] = [];

  for (const rawLine of content.split('\n')) {
    const hashIdx = rawLine.indexOf('#');
    const line = (hashIdx >= 0 ? rawLine.slice(0, hashIdx) : rawLine).trim();
    if (!line) continue;

    const tokens = line
      .split(' ')
      .flatMap((t) => t.split('\t'))
      .filter(Boolean);
    const ip = tokens[0];
    const names = tokens.slice(1);
    if (!ip || names.length === 0) continue;
    if (shouldSkipHostsIp(ip)) continue;

    const targetIp = isLoopbackIp(ip) ? 'host-gateway' : ip;
    const formattedIp = targetIp.includes(':') ? `[${targetIp}]` : targetIp;
    for (const name of names) {
      if (shouldSkipHostsName(name, hostname)) continue;
      flags.push('--add-host', `${name}:${formattedIp}`);
    }
  }

  return flags;
}

export interface WorkerOptions {
  version: string;
  url: string;
  repo: { hostPath: string; containerPath: string };
  workspacesDir: string;
  taskQueue: string;
  containerName: string;
  envFlags: string[];
  config?: { hostPath: string; containerPath: string };
  promptsDir?: string;
  outputDir?: string;
  workspace: string;
  pipelineTesting?: boolean;
  debug?: boolean;
  piAuthHostPath?: string;
}

/**
 * Spawn the worker container in detached mode and return the process.
 * When `opts.debug` is true, omits `--rm` so the container persists for log inspection.
 */
export function spawnWorker(opts: WorkerOptions): ChildProcess {
  const args = ['run', '-d'];
  if (!opts.debug) {
    args.push('--rm');
  }
  args.push('--name', opts.containerName, '--network', 'shannon-net');

  // Tag with the workspace so `stop <workspace>` can target this scan's container
  args.push('--label', `${WORKSPACE_LABEL}=${opts.workspace}`);

  // Add host flag for Linux
  args.push(...addHostFlag());

  // Forward user-added /etc/hosts entries into the worker
  args.push(...forwardEtcHostsFlags());

  // UID remapping for Linux bind mounts
  if (os.platform() === 'linux' && process.getuid && process.getgid) {
    args.push('-e', `SHANNON_HOST_UID=${process.getuid()}`, '-e', `SHANNON_HOST_GID=${process.getgid()}`);
  }

  // Volume mounts
  args.push('-v', `${opts.workspacesDir}:/app/workspaces`);
  args.push('-v', `${opts.repo.hostPath}:${opts.repo.containerPath}:ro`);

  // Writable overlays: shadow .shannon/ and .playwright/ inside the :ro repo with workspace-backed
  // dirs, nested under the run's INTERNAL_DIR. Container paths are unchanged.
  const internalPath = path.join(opts.workspacesDir, opts.workspace, INTERNAL_DIR);
  args.push('-v', `${path.join(internalPath, 'deliverables')}:${opts.repo.containerPath}/.shannon/deliverables`);
  args.push('-v', `${path.join(internalPath, 'scratchpad')}:${opts.repo.containerPath}/.shannon/scratchpad`);
  args.push('-v', `${path.join(internalPath, '.playwright-cli')}:${opts.repo.containerPath}/.shannon/.playwright-cli`);
  args.push('-v', `${path.join(internalPath, '.playwright')}:${opts.repo.containerPath}/.playwright`);

  // Local mode: mount prompts for live editing
  if (opts.promptsDir) {
    args.push('-v', `${opts.promptsDir}:/app/apps/worker/prompts:ro`);
  }

  if (opts.config) {
    args.push('-v', `${opts.config.hostPath}:${opts.config.containerPath}:ro`);
  }

  // Output directory for deliverables copy
  if (opts.outputDir) {
    args.push('-v', `${opts.outputDir}:/app/output`);
  }

  // Reuse the host's pi credentials: mount only the auth file, allowing token refreshes to persist.
  if (opts.piAuthHostPath) {
    args.push('-v', `${opts.piAuthHostPath}:${PI_AUTH_CONTAINER_PATH}`);
  }

  // Environment
  args.push(...opts.envFlags);

  // Container settings
  args.push('--shm-size', '2gb', '--security-opt', 'seccomp=unconfined');

  // Image
  args.push(getWorkerImage(opts.version));

  // Worker command
  args.push('node', 'apps/worker/dist/temporal/worker.js', opts.url, opts.repo.containerPath);
  args.push('--task-queue', opts.taskQueue);
  if (opts.config) {
    args.push('--config', opts.config.containerPath);
  }
  if (opts.outputDir) {
    args.push('--output', '/app/output');
  }
  args.push('--workspace', opts.workspace);
  if (opts.pipelineTesting) {
    args.push('--pipeline-testing');
  }

  // Inherit stderr so `docker run` daemon errors surface to the user;
  // ignore stdin/stdout (the container ID is noise).
  return spawn('docker', args, {
    stdio: ['ignore', 'ignore', 'inherit'],
    // Prevent MSYS/Git Bash from converting Unix paths on Windows
    ...(os.platform() === 'win32' && { env: { ...process.env, MSYS_NO_PATHCONV: '1' } }),
  });
}

/**
 * Stop the worker container(s) for a single scan, matched by its workspace label.
 * Returns true if any were running. Only scans started with a labeled worker are
 * matchable, so this finds runs from this version onward.
 */
export function stopScanContainer(workspace: string): boolean {
  const output = runOutput('docker', ['ps', '-q', '--filter', `label=${WORKSPACE_LABEL}=${workspace}`]);
  const ids = output.split('\n').filter(Boolean);
  if (ids.length === 0) return false;

  // stdio 'pipe' swallows the container IDs `docker stop` echoes.
  execFileSync('docker', ['stop', ...ids], { stdio: 'pipe' });
  return true;
}

/**
 * Terminate a Temporal workflow so a stopped scan doesn't linger as a running
 * workflow with no worker. Best-effort: returns false if Temporal is unreachable
 * or the workflow already closed. Requires Temporal to be up (guard with isTemporalReady).
 */
export function terminateWorkflow(workflowId: string, reason: string): boolean {
  return runQuiet('docker', [
    'exec',
    'shannon-temporal',
    'temporal',
    'workflow',
    'terminate',
    '--workflow-id',
    workflowId,
    '--reason',
    reason,
    '--address',
    'localhost:7233',
  ]);
}

/**
 * Terminate every running pentest workflow in one batch, so `stop --all` doesn't
 * leave workflows running with no worker. Best-effort: returns false if Temporal
 * is unreachable. Requires Temporal to be up (guard with isTemporalReady).
 */
export function terminateAllWorkflows(reason: string): boolean {
  return runQuiet('docker', [
    'exec',
    'shannon-temporal',
    'temporal',
    'workflow',
    'terminate',
    '--query',
    "ExecutionStatus='Running' AND WorkflowType='pentestPipelineWorkflow'",
    '--reason',
    reason,
    '--address',
    'localhost:7233',
    '--yes',
  ]);
}

/**
 * Stop all running shannon-worker-* containers. Returns the number stopped.
 */
export function stopWorkers(): number {
  const workers = runOutput('docker', ['ps', '-q', '--filter', 'name=shannon-worker-']);
  if (!workers) return 0;

  const ids = workers.split('\n').filter(Boolean);
  console.log('Stopping running scans...');
  // stdio 'pipe' swallows the container IDs `docker stop` echoes.
  execFileSync('docker', ['stop', ...ids], { stdio: 'pipe' });
  return ids.length;
}

/**
 * Tear down the compose stack.
 */
export function stopInfra(clean: boolean): void {
  const composeFile = getComposeFile();
  const args = ['compose', '-f', composeFile, 'down'];
  if (clean) args.push('-v');
  execFileSync('docker', args, { stdio: 'inherit' });
}

/**
 * Remove old keygraph/shannon images that don't match the current version.
 */
function pruneOldImages(currentVersion: string): void {
  const output = runOutput('docker', ['images', NPX_IMAGE_REPO, '--format', '{{.Tag}}']);
  if (!output) return;

  const currentTag = currentVersion;
  const stale = output.split('\n').filter((tag) => tag && tag !== currentTag);
  for (const tag of stale) {
    runQuiet('docker', ['rmi', `${NPX_IMAGE_REPO}:${tag}`]);
  }
}

/**
 * List running worker containers.
 */
export function listRunningWorkers(): string {
  return runOutput('docker', [
    'ps',
    '--filter',
    'name=shannon-worker-',
    '--format',
    'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}',
  ]);
}
