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
import type { SpinnerResult } from '@clack/prompts';
import { envBool, PI_AUTH_CONTAINER_PATH } from './env.js';
import { fail, warn } from './errors.js';
import { getMode, isDevMode } from './mode.js';
import { INTERNAL_DIR } from './paths.js';
import { runStep, spawnCaptured, surfaceOutput } from './ui.js';

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

/** Run a command asynchronously, resolving true on success. Never rejects. */
function spawnQuiet(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

const TEMPORAL_CONTAINER = 'shannon-temporal';
const TEMPORAL_ADDRESS = 'localhost:7233';

/** Query matching every running pentest scan workflow. */
const RUNNING_SCAN_QUERY = "ExecutionStatus = 'Running' AND WorkflowType = 'pentestPipelineWorkflow'";

/** Build `docker exec` args for a `temporal` CLI command run inside the Temporal container. */
function temporalCmd(...args: string[]): string[] {
  return ['exec', TEMPORAL_CONTAINER, 'temporal', ...args, '--address', TEMPORAL_ADDRESS];
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
    fail(
      'Docker must be installed and running. Start Docker and try again.',
      'Install Docker: https://docs.docker.com/get-docker/',
    );
  }
}

/**
 * Check if Temporal is running and healthy.
 */
export function isTemporalReady(): boolean {
  const output = runOutput('docker', temporalCmd('operator', 'cluster', 'health'));
  return output.includes('SERVING');
}

/** Start (or find) Temporal via compose and wait until it serves; exits the process on failure. */
async function ensureTemporalHealthy(spinner: SpinnerResult): Promise<void> {
  if (isTemporalReady()) {
    return;
  }

  // Drive the caller's spinner — the whole "start" flow is one spinner, not several.
  spinner.message('Starting Temporal');
  const composeFile = getComposeFile();
  const result = await spawnCaptured('docker', ['compose', '-f', composeFile, 'up', '-d']);
  if (!result.ok) {
    spinner.error('Could not start Temporal');
    surfaceOutput(result.output);
    process.exit(1);
  }

  spinner.message('Waiting for Temporal to be ready');
  for (let i = 0; i < 30; i++) {
    if (isTemporalReady()) {
      return;
    }
    await sleep(2000);
  }

  spinner.error('Temporal did not become ready in time');
  process.exit(1);
}

const DEFAULT_RETENTION_HOURS = 168;
const RETENTION_ENV = 'SHANNON_TEMPORAL_RETENTION';
const RETENTION_NAMESPACE = 'default';

/**
 * Desired retention in whole hours: unset or empty env → 168 (7 days); a positive
 * whole-hour override like `72h`; anything else warns and returns null (leave unchanged).
 */
function desiredRetentionHours(): number | null {
  const raw = process.env[RETENTION_ENV];
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_RETENTION_HOURS;
  }
  const match = raw.trim().match(/^([1-9][0-9]*)h$/);
  if (!match) {
    warn(
      `Ignoring invalid ${RETENTION_ENV} "${raw}" — Temporal retention left unchanged.`,
      'Use a positive whole number of hours, e.g. "168h".',
    );
    return null;
  }
  return Number(match[1]);
}

/** Convert a Go duration such as "24h0m0s" or "168h" to whole seconds, or null when it doesn't parse. */
function parseGoDurationSeconds(text: string): number | null {
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!match || (match[1] === undefined && match[2] === undefined && match[3] === undefined)) {
    return null;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  const seconds = Number(match[3] ?? 0);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Current retention of the `default` namespace in seconds, or null when it can't be read.
 * `runOutput` returns '' on a failed describe, so a failed read and an unparseable one both
 * collapse to null — either way the live value is unknown, which the caller handles the same way.
 */
function readCurrentRetentionSeconds(): number | null {
  const output = runOutput('docker', temporalCmd('operator', 'namespace', 'describe', RETENTION_NAMESPACE));
  const match = output.match(/WorkflowExecutionRetentionTtl\s+(\S+)/);
  if (!match || match[1] === undefined) {
    return null;
  }
  return parseGoDurationSeconds(match[1]);
}

/**
 * Converge the `default` namespace's retention to the CLI-owned value after Temporal is
 * healthy. The CLI is the authority: a manual change is replaced on the next start unless
 * the operator sets the matching override. A describe or update failure warns once that the
 * requested value wasn't applied and never blocks the scan.
 */
function convergeNamespaceRetention(): void {
  const hours = desiredRetentionHours();
  if (hours === null) {
    return;
  }

  const currentSeconds = readCurrentRetentionSeconds();
  if (currentSeconds === null) {
    warn(
      `Could not read Temporal retention for namespace "${RETENTION_NAMESPACE}" — the requested value (${hours}h) was not applied.`,
    );
    return;
  }

  if (currentSeconds === hours * 3600) {
    return;
  }

  const updated = runQuiet(
    'docker',
    temporalCmd('operator', 'namespace', 'update', '--namespace', RETENTION_NAMESPACE, '--retention', `${hours}h`),
  );
  if (!updated) {
    warn(`Could not update Temporal retention to ${hours}h — the requested value was not applied.`);
  }
}

/**
 * Ensure Temporal is running via compose, then converge its scan-history retention.
 */
export async function ensureInfra(spinner: SpinnerResult): Promise<void> {
  await ensureTemporalHealthy(spinner);
  convergeNamespaceRetention();
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
      fail(
        `Failed to pull ${image}`,
        'The image may not be available for your platform yet.',
        'Check https://hub.docker.com/r/keygraph/shannon for available tags.',
      );
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
  keepContainer?: boolean;
  piAuthHostPath?: string;
}

/**
 * Spawn the worker container in detached mode and return the process.
 * When `opts.keepContainer` is true, omits `--rm` so the container persists for log inspection.
 */
export function spawnWorker(opts: WorkerOptions): ChildProcess {
  const args = ['run', '-d'];
  if (!opts.keepContainer) {
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

  // Customer-copy destination. The workflow surfaces only final report artifacts here.
  if (opts.outputDir) {
    args.push('-v', `${opts.outputDir}:/app/output`);
  }

  // Reuse the host's pi credentials: mount only the auth file, allowing token refreshes to persist.
  if (opts.piAuthHostPath) {
    args.push('-v', `${opts.piAuthHostPath}:${PI_AUTH_CONTAINER_PATH}`);
  }

  // Environment
  args.push(...opts.envFlags);

  // Container settings. Chromium's own sandbox needs syscalls Docker's default seccomp
  // profile blocks, so it is loosened for the in-container browser automation; the
  // worker process itself is not granted any extra privilege by this.
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

/** `docker ps --filter` args matching every running worker container. */
export const WORKER_FILTER: readonly string[] = ['--filter', 'name=shannon-worker-'];

/** `docker ps --filter` args matching one scan's worker container(s), by workspace label. */
export function scanFilter(workspace: string): readonly string[] {
  return ['--filter', `label=${WORKSPACE_LABEL}=${workspace}`];
}

/**
 * IDs of running containers matching the filter. Re-querying this after a stop is
 * the authoritative check for whether containers actually stopped — `docker stop`'s
 * exit code can't distinguish "already gone" from "failed to stop".
 */
export function runningContainers(filter: readonly string[]): string[] {
  const output = runOutput('docker', ['ps', '-q', ...filter]);
  return output.split('\n').filter(Boolean);
}

/**
 * Workspace names of every running worker container, read from the shannon.workspace
 * label each scan is stamped with at spawn. This is the authoritative running-scan →
 * workspace-name map. Best-effort: empty when Docker is unreachable, which is the
 * correct answer anyway (no scan can be running without the daemon).
 */
export function runningScanWorkspaces(): string[] {
  const output = runOutput('docker', ['ps', ...WORKER_FILTER, '--format', `{{ index .Labels "${WORKSPACE_LABEL}" }}`]);
  return output
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean);
}

/**
 * Stop containers by ID, tolerating any that vanished between being listed and
 * stopped (a `--rm` worker exiting is success, not an error). Async so a spinner
 * can animate during docker's graceful-shutdown wait.
 */
export async function stopContainers(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => spawnQuiet('docker', ['stop', id])));
}

/**
 * Terminate a Temporal workflow so a stopped scan doesn't linger as a running
 * workflow with no worker. Best-effort: returns false if Temporal is unreachable
 * or the workflow already closed. Requires Temporal to be up (guard with isTemporalReady).
 */
export function terminateWorkflow(workflowId: string, reason: string): boolean {
  return runQuiet('docker', temporalCmd('workflow', 'terminate', '--workflow-id', workflowId, '--reason', reason));
}

/**
 * Terminate every running pentest workflow in one batch, so `stop --all` doesn't
 * leave workflows running with no worker. Best-effort: returns false if Temporal
 * is unreachable. Requires Temporal to be up (guard with isTemporalReady).
 */
export function terminateAllWorkflows(reason: string): boolean {
  return runQuiet(
    'docker',
    temporalCmd('workflow', 'terminate', '--query', RUNNING_SCAN_QUERY, '--reason', reason, '--yes'),
  );
}

/**
 * Whether a specific workflow is still in the Running state. Re-querying this after
 * a terminate verifies it actually took effect, rather than trusting the terminate
 * command's exit code. Requires Temporal to be up (guard with isTemporalReady).
 */
export function isWorkflowRunning(workflowId: string): boolean {
  const query = `WorkflowId = '${workflowId}' AND ExecutionStatus = 'Running'`;
  const output = runOutput('docker', temporalCmd('workflow', 'list', '--query', query));
  return output.includes(workflowId);
}

/**
 * Whether any pentest scan workflow is still Running — the `stop --all` counterpart
 * to isWorkflowRunning. Requires Temporal to be up (guard with isTemporalReady).
 */
export function anyRunningScanWorkflow(): boolean {
  const output = runOutput('docker', temporalCmd('workflow', 'list', '--query', RUNNING_SCAN_QUERY));
  return output.includes('pentestPipelineWorkflow');
}

/**
 * Tear down the compose stack. When `clean` is set, volumes are removed too.
 */
export async function stopInfra(clean: boolean): Promise<void> {
  const composeFile = getComposeFile();
  const args = ['compose', '-f', composeFile, 'down'];
  if (clean) args.push('-v');
  const label = clean ? 'Removing Temporal data and volumes' : 'Stopping Temporal';
  const step = await runStep(label, 'docker', args);
  if (!step.ok) {
    fail(`${label} failed. See the output above.`);
  }
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
