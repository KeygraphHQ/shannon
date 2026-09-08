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
import { fail } from './errors.js';
import { getMode, isDevMode } from './mode.js';
import { INTERNAL_DIR, type MountPair } from './paths.js';
import { runStep, spawnCaptured, surfaceOutput } from './ui.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const NPX_IMAGE_REPO = 'keygraph/shannon';
const DEV_IMAGE = 'shannon-worker';
const VALIDATION_BUNDLE_CONTAINER_PATH = '/validation-bundle';
const VALIDATION_SELECTION_CONTAINER_PATH = '/target/.shannon/blackbox/validation-selection.json';
const MAX_VALIDATION_SELECTION_BYTES = 64 * 1024;
const VALIDATION_SELECTION_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'comparisonSha256',
  'sourceManifestSha256',
  'selectionDigest',
  'comparisonId',
  'routeSignature',
  'method',
  'origin',
  'routePathPrefix',
  'requestClass',
  'recordedRole',
  'victimIdentity',
  'attackerIdentity',
] as const);
const VALIDATION_SHA256 = /^[a-f0-9]{64}$/u;

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

const SCAN_WORKFLOW_TYPES = ['pentestPipelineWorkflow', 'blackboxAuthzWorkflow'] as const;

function runningScanQuery(workflowType: (typeof SCAN_WORKFLOW_TYPES)[number]): string {
  return `ExecutionStatus = 'Running' AND WorkflowType = '${workflowType}'`;
}

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

/**
 * Ensure Temporal is running via compose.
 */
export async function ensureInfra(spinner: SpinnerResult): Promise<void> {
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
  readonly mode: 'whitebox' | 'blackbox';
  readonly version: string;
  readonly url: string;
  readonly repo?: { hostPath: string; containerPath: string };
  readonly targetRoot?: { hostPath: string; containerPath: '/target' };
  readonly workspacePath: string;
  readonly workspacesDir: string;
  readonly taskQueue: string;
  readonly containerName: string;
  readonly envFlags: string[];
  readonly config?: { hostPath: string; containerPath: string };
  readonly promptsDir?: string;
  readonly outputDir?: string;
  readonly workspace: string;
  readonly pipelineTesting?: boolean;
  readonly keepContainer?: boolean;
  readonly piAuthHostPath?: string;
  readonly validationSelectionPath?: string;
  readonly validationSelectionDigest?: string;
}

export interface ValidationSelectionMount extends MountPair {
  readonly selectionDigest: string;
}

export interface ValidationBundlePreprocessorOptions {
  readonly version: string;
  readonly bundlePath: string;
}

export interface PreprocessValidationBundleOptions extends ValidationBundlePreprocessorOptions {
  readonly targetRoot: string;
}

/**
 * Build a locked-down one-shot container invocation for reducing an evidence bundle
 * to the normalized selector that a live black-box run may consume.
 */
export function buildValidationBundleDockerArgs(opts: ValidationBundlePreprocessorOptions): string[] {
  const uid = process.getuid?.() ?? 1001;
  const gid = process.getgid?.() ?? 1001;

  return [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    '-v',
    `${opts.bundlePath}:${VALIDATION_BUNDLE_CONTAINER_PATH}:ro`,
    '--user',
    `${uid}:${gid}`,
    '--entrypoint',
    'node',
    getWorkerImage(opts.version),
    'apps/worker/dist/scripts/validate-blackbox-bundle.js',
    VALIDATION_BUNDLE_CONTAINER_PATH,
  ];
}

function invalidValidationSelection(): never {
  throw new Error('Validation bundle preprocessor must emit exactly one normalized selector');
}

function parseValidationSelection(output: string): Record<string, unknown> {
  if (Buffer.byteLength(output, 'utf8') > MAX_VALIDATION_SELECTION_BYTES) {
    return invalidValidationSelection();
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return invalidValidationSelection();
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return invalidValidationSelection();
  }
  const value = parsed as Record<string, unknown>;
  const keys = Object.keys(value);
  if (
    keys.length !== VALIDATION_SELECTION_KEYS.length ||
    keys.some((key) => !VALIDATION_SELECTION_KEYS.includes(key as (typeof VALIDATION_SELECTION_KEYS)[number])) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'blackbox-cross-identity-validation' ||
    typeof value.comparisonSha256 !== 'string' ||
    !VALIDATION_SHA256.test(value.comparisonSha256) ||
    typeof value.sourceManifestSha256 !== 'string' ||
    !VALIDATION_SHA256.test(value.sourceManifestSha256) ||
    typeof value.selectionDigest !== 'string' ||
    !VALIDATION_SHA256.test(value.selectionDigest) ||
    typeof value.comparisonId !== 'string' ||
    !/^comparison-[0-9]{6}$/u.test(value.comparisonId) ||
    typeof value.routeSignature !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9._/:-]{0,127}$/u.test(value.routeSignature) ||
    value.method !== 'GET' ||
    typeof value.origin !== 'string' ||
    value.origin.length === 0 ||
    typeof value.routePathPrefix !== 'string' ||
    !/^\/(?:[A-Za-z][A-Za-z0-9._~-]{0,63}(?:\/[A-Za-z][A-Za-z0-9._~-]{0,63})?)?$/u.test(value.routePathPrefix) ||
    typeof value.requestClass !== 'string' ||
    !/^request-class-[0-9]{4}$/u.test(value.requestClass) ||
    typeof value.recordedRole !== 'string' ||
    value.recordedRole.length === 0 ||
    typeof value.victimIdentity !== 'string' ||
    value.victimIdentity.length === 0 ||
    typeof value.attackerIdentity !== 'string' ||
    value.attackerIdentity.length === 0 ||
    value.victimIdentity === value.attackerIdentity
  ) {
    return invalidValidationSelection();
  }
  try {
    const origin = new URL(value.origin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.origin !== value.origin
    ) {
      return invalidValidationSelection();
    }
  } catch {
    return invalidValidationSelection();
  }
  const payload = {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: value.comparisonSha256,
    sourceManifestSha256: value.sourceManifestSha256,
    comparisonId: value.comparisonId,
    routeSignature: value.routeSignature,
    method: 'GET',
    origin: value.origin,
    routePathPrefix: value.routePathPrefix,
    requestClass: value.requestClass,
    recordedRole: value.recordedRole,
    victimIdentity: value.victimIdentity,
    attackerIdentity: value.attackerIdentity,
  };
  const selectionDigest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (selectionDigest !== value.selectionDigest) return invalidValidationSelection();
  return {
    schemaVersion: payload.schemaVersion,
    kind: payload.kind,
    comparisonSha256: payload.comparisonSha256,
    sourceManifestSha256: payload.sourceManifestSha256,
    selectionDigest,
    comparisonId: payload.comparisonId,
    routeSignature: payload.routeSignature,
    method: payload.method,
    origin: payload.origin,
    routePathPrefix: payload.routePathPrefix,
    requestClass: payload.requestClass,
    recordedRole: payload.recordedRole,
    victimIdentity: payload.victimIdentity,
    attackerIdentity: payload.attackerIdentity,
  };
}

/** Parse and persist only the normalized selector produced by the evidence preprocessor. */
export function writeValidationSelection(targetRoot: string, output: string): ValidationSelectionMount {
  const selection = parseValidationSelection(output);
  const hostPath = path.join(targetRoot, INTERNAL_DIR, 'blackbox', 'validation-selection.json');
  const parent = path.dirname(hostPath);
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  for (const directory of [targetRoot, path.join(targetRoot, INTERNAL_DIR), parent]) {
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error('Validation selection directory is unsafe');
    }
  }
  try {
    fs.unlinkSync(hostPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  fs.writeFileSync(hostPath, `${JSON.stringify(selection, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
    flag: 'wx',
  });
  const written = fs.lstatSync(hostPath);
  if (written.isSymbolicLink() || !written.isFile() || written.nlink !== 1) {
    fs.unlinkSync(hostPath);
    throw new Error('Validation selection file is unsafe');
  }

  return {
    hostPath,
    containerPath: VALIDATION_SELECTION_CONTAINER_PATH,
    selectionDigest: selection.selectionDigest as string,
  };
}

function validationPreprocessorDiagnostic(error: unknown): string | undefined {
  if (error === null || typeof error !== 'object' || !('stderr' in error)) return undefined;
  const stderr = (error as { stderr?: unknown }).stderr;
  if (typeof stderr === 'string') return stderr.trim() || undefined;
  if (Buffer.isBuffer(stderr)) return stderr.toString('utf8').trim() || undefined;
  return undefined;
}

/** Run the evidence preprocessor and write its selector into the synthetic target root. */
export function preprocessValidationBundle(opts: PreprocessValidationBundleOptions): ValidationSelectionMount {
  let output: string;
  try {
    output = execFileSync('docker', buildValidationBundleDockerArgs(opts), {
      encoding: 'utf8',
      maxBuffer: MAX_VALIDATION_SELECTION_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...(os.platform() === 'win32' && { env: { ...process.env, MSYS_NO_PATHCONV: '1' } }),
    });
  } catch (error) {
    const diagnostic = validationPreprocessorDiagnostic(error);
    throw new Error(
      diagnostic ? `Validation bundle rejected: ${diagnostic}` : 'Validation bundle preprocessing failed',
    );
  }

  return writeValidationSelection(opts.targetRoot, output);
}

/**
 * Build the worker's Docker argument vector without starting a process.
 */
export function buildWorkerDockerArgs(opts: WorkerOptions): string[] {
  const args = ['run', '-d'];
  if (Boolean(opts.validationSelectionPath) !== Boolean(opts.validationSelectionDigest)) {
    throw new Error('Validation selection path and digest must be supplied together');
  }
  if (opts.validationSelectionDigest && !VALIDATION_SHA256.test(opts.validationSelectionDigest)) {
    throw new Error('Validation selection digest must be a lowercase SHA-256 digest');
  }
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

  let targetPath: string;
  if (opts.mode === 'blackbox') {
    const targetRoot = opts.targetRoot;
    if (!targetRoot) {
      throw new Error('Blackbox worker options require a synthetic target root');
    }
    args.push('-v', `${opts.workspacePath}:/app/workspaces/${opts.workspace}`);
    args.push('-v', `${targetRoot.hostPath}:${targetRoot.containerPath}`);
    targetPath = targetRoot.containerPath;
  } else {
    const repo = opts.repo;
    if (!repo) {
      throw new Error('Whitebox worker options require a repository mount');
    }
    args.push('-v', `${opts.workspacesDir}:/app/workspaces`);
    args.push('-v', `${repo.hostPath}:${repo.containerPath}:ro`);

    // Writable overlays: shadow .shannon/ and .playwright/ inside the :ro repo with workspace-backed
    // dirs, nested under the run's INTERNAL_DIR. Container paths are unchanged.
    const internalPath = path.join(opts.workspacesDir, opts.workspace, INTERNAL_DIR);
    args.push('-v', `${path.join(internalPath, 'deliverables')}:${repo.containerPath}/.shannon/deliverables`);
    args.push('-v', `${path.join(internalPath, 'scratchpad')}:${repo.containerPath}/.shannon/scratchpad`);
    args.push('-v', `${path.join(internalPath, '.playwright-cli')}:${repo.containerPath}/.shannon/.playwright-cli`);
    args.push('-v', `${path.join(internalPath, '.playwright')}:${repo.containerPath}/.playwright`);
    targetPath = repo.containerPath;
  }

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
  args.push('node', 'apps/worker/dist/temporal/worker.js', opts.url, targetPath);
  if (opts.mode === 'blackbox') {
    args.push('--blackbox');
  }
  args.push('--task-queue', opts.taskQueue);
  if (opts.config) {
    args.push('--config', opts.config.containerPath);
  }
  if (opts.validationSelectionPath) {
    args.push('--validation-selection', opts.validationSelectionPath);
    args.push('--validation-selection-digest', opts.validationSelectionDigest as string);
  }
  if (opts.outputDir) {
    args.push('--output', '/app/output');
  }
  args.push('--workspace', opts.workspace);
  if (opts.pipelineTesting) {
    args.push('--pipeline-testing');
  }

  return args;
}

/**
 * Spawn the worker container in detached mode and return the process.
 * When `opts.keepContainer` is true, omits `--rm` so the container persists for log inspection.
 */
export function spawnWorker(opts: WorkerOptions): ChildProcess {
  const args = buildWorkerDockerArgs(opts);

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
  return SCAN_WORKFLOW_TYPES.map((workflowType) =>
    runQuiet(
      'docker',
      temporalCmd('workflow', 'terminate', '--query', runningScanQuery(workflowType), '--reason', reason, '--yes'),
    ),
  ).every(Boolean);
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
  return SCAN_WORKFLOW_TYPES.some((workflowType) => {
    const output = runOutput('docker', temporalCmd('workflow', 'list', '--query', runningScanQuery(workflowType)));
    return output.includes(workflowType);
  });
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
