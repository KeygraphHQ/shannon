/**
 * `shannon start` command — launch a pentest scan.
 *
 * Handles both local mode (local build, ./workspaces/, mounted prompts)
 * and npx mode (Docker Hub pull, ~/.shannon/).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import * as p from '@clack/prompts';
import { ensureDocker, ensureImage, ensureInfra, randomSuffix, spawnWorker } from '../docker.js';
import { buildEnvFlags, loadEnv, resolveHostPiAuthPath, shouldUsePiAuth, validateCredentials } from '../env.js';
import { fail } from '../errors.js';
import { getWorkspacesDir, initHome } from '../home.js';
import { commandPrefix, isLocal } from '../mode.js';
import { resolveModelSpec } from '../model-spec.js';
import {
  expandHome,
  FINAL_REPORT_MD_FILENAME,
  FINAL_REPORT_PDF_FILENAME,
  INTERNAL_DIR,
  resolveConfig,
  resolveRepo,
  resolveRunFile,
} from '../paths.js';
import { indentFailureSegments } from '../scan/failure.js';
import { resolveWorkflowId } from '../session.js';
import { displaySplash } from '../splash.js';
import { getTerminalOutcome } from '../temporal-client.js';
import { stdoutIsTerminal } from '../tty.js';
import { tailUntilComplete } from './logs.js';

export interface StartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  keepContainer: boolean;
  follow: boolean;
  version: string;
}

const LAUNCH_STATE_SCHEMA_VERSION = 1 as const;
const LAUNCH_STATE_FILENAME = 'launch.json';
const FIXED_CLASSES = ['injection', 'xss', 'auth', 'authz', 'ssrf'] as const;

/**
 * CLI-owned launch record at INTERNAL_DIR/launch.json, written once when a workspace is
 * created and never rewritten. It pins the customer output destination so a resume with a
 * different -o cannot silently redirect the final report. The worker does not read it.
 */
interface LaunchState {
  readonly schema_version: typeof LAUNCH_STATE_SCHEMA_VERSION;
  readonly customer_output_path?: string;
}

export interface WorkspaceLaunchDecision {
  readonly isResume: boolean;
  readonly outputDir?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function arraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Hand-rolled twin of the worker's durable-state validator in
 * apps/worker/src/types/run-state.ts, which owns the session.json.durableScanState shape.
 * Each array check accepts two variants because the worker appends 'miscellaneous' and
 * 'miscellaneous-exploit' only after the miscellaneous pipeline admits findings. If the worker's shape
 * changes and this twin lags, resume fails fast as incompatible instead of launching a
 * worker against state it would misread.
 */
function isCurrentDurableState(value: unknown): boolean {
  if (!isRecord(value) || value.schema_version !== 1 || typeof value.exploit !== 'boolean') return false;
  if (!Array.isArray(value.participating_classes) || !Array.isArray(value.expected_agents)) return false;

  const participating = value.participating_classes;
  const validParticipation =
    arraysEqual(participating, FIXED_CLASSES) || arraysEqual(participating, [...FIXED_CLASSES, 'miscellaneous']);
  if (!validParticipation) return false;

  const baselineAgents = ['pre-recon', 'recon', ...FIXED_CLASSES.map((name) => `${name}-vuln`)];
  if (value.exploit) baselineAgents.push(...FIXED_CLASSES.map((name) => `${name}-exploit`));
  baselineAgents.push('report');
  const expected = value.expected_agents;
  return arraysEqual(expected, baselineAgents) || arraysEqual(expected, [...baselineAgents, 'miscellaneous-exploit']);
}

/** One refusal for damaged CLI-owned or worker-owned workspace records, whichever reads first. */
const DAMAGED_RECORDS_MESSAGE =
  "This workspace's internal records are damaged and it cannot be resumed. Its report files are untouched. Start a new scan with a different -w name.";

const NEWER_RELEASE_MESSAGE =
  'This workspace was created by a newer version of Shannon. Upgrade Shannon, or start a new scan with a different -w name.';

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    fail(DAMAGED_RECORDS_MESSAGE);
  }
}

function readLaunchState(filePath: string): LaunchState {
  if (!fs.existsSync(filePath)) {
    fail(
      'This workspace was created by an earlier version of Shannon and cannot be resumed. Its files and report are untouched. Start a new scan with a different -w name.',
    );
  }
  const value = readJsonFile(filePath);
  if (!isRecord(value)) fail(NEWER_RELEASE_MESSAGE);
  // Unknown keys mean a newer release wrote this workspace; refuse rather than half-read it.
  const keys = Object.keys(value).sort();
  const keysAreValid = keys.every((key) => key === 'customer_output_path' || key === 'schema_version');
  const customerPath = value.customer_output_path;
  const pathIsValid =
    customerPath === undefined ||
    (typeof customerPath === 'string' && path.isAbsolute(customerPath) && path.resolve(customerPath) === customerPath);
  if (value.schema_version !== LAUNCH_STATE_SCHEMA_VERSION || !keysAreValid || !pathIsValid) {
    fail(NEWER_RELEASE_MESSAGE);
  }
  return {
    schema_version: LAUNCH_STATE_SCHEMA_VERSION,
    ...(typeof customerPath === 'string' && { customer_output_path: customerPath }),
  };
}

/**
 * Decide fresh-versus-resume from on-disk state alone, before start() mutates anything.
 * A fresh launch requires the workspace directory to be absent or empty; a resume requires
 * current-release session state, a matching target URL, and a customer output path that
 * agrees with the recorded one. Every other combination fails the launch, so a typo in
 * -w or -o stops here instead of spawning a worker into the wrong workspace.
 */
export function classifyWorkspaceLaunch(
  workspacePath: string,
  expectedUrl: string,
  requestedOutputDir: string | undefined,
): WorkspaceLaunchDecision {
  const sessionPath = resolveRunFile(workspacePath, 'session.json');
  const sessionExists = fs.existsSync(sessionPath);
  if (!sessionExists) {
    if (fs.existsSync(workspacePath) && fs.readdirSync(workspacePath).length > 0) {
      fail(
        'This directory is not a Shannon workspace, or its scan state is missing. Start a new scan with a different -w name.',
      );
    }
    return { isResume: false, ...(requestedOutputDir !== undefined && { outputDir: requestedOutputDir }) };
  }

  const launchPath = path.join(workspacePath, INTERNAL_DIR, LAUNCH_STATE_FILENAME);
  const launch = readLaunchState(launchPath);
  const session = readJsonFile(sessionPath);
  if (!isRecord(session) || !isRecord(session.session) || session.session.webUrl !== expectedUrl) {
    fail(
      'This workspace was created for a different target URL, so it cannot be resumed against this one. Check -u, or start a new scan with a different -w name.',
    );
  }
  if (!isCurrentDurableState(session.durableScanState)) {
    fail(
      "This workspace's scan state cannot be read by this version. Its files are untouched. Start a new scan with a different -w name.",
    );
  }

  const storedOutputDir = launch.customer_output_path;
  if (requestedOutputDir !== undefined && requestedOutputDir !== storedOutputDir) {
    fail(
      'This workspace already copies its report to a different location than the -o path you passed. Re-run without -o to keep the original location, or start a new scan with a different -w name.',
    );
  }
  return { isResume: true, ...(storedOutputDir !== undefined && { outputDir: storedOutputDir }) };
}

/**
 * Crash-safe single write: exclusive temp file (pid plus random suffix keeps concurrent
 * starts apart), fsync, rename into place, then directory fsync so the entry survives a
 * host crash. Callers invoke this only for a fresh workspace; an existing launch.json is
 * the resume contract and must never be replaced.
 */
export function writeLaunchStateAtomically(internalPath: string, outputDir: string | undefined): void {
  const finalPath = path.join(internalPath, LAUNCH_STATE_FILENAME);
  const temporaryPath = path.join(internalPath, `${LAUNCH_STATE_FILENAME}.tmp-${process.pid}-${randomSuffix()}`);
  const launchState: LaunchState = {
    schema_version: LAUNCH_STATE_SCHEMA_VERSION,
    ...(outputDir !== undefined && { customer_output_path: outputDir }),
  };
  const descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(launchState, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    fs.renameSync(temporaryPath, finalPath);
    const directory = fs.openSync(internalPath, 'r');
    try {
      fs.fsyncSync(directory);
    } finally {
      fs.closeSync(directory);
    }
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export async function start(args: StartArgs): Promise<void> {
  // 1. Resolve non-mutating inputs and classify the workspace before changing it.
  initHome();
  loadEnv();
  const creds = validateCredentials();
  if (!creds.valid) {
    fail(creds.error ?? 'Invalid credentials');
  }
  const repo = resolveRepo(args.repo);
  const config = args.config ? resolveConfig(args.config) : undefined;
  const workspacesDir = getWorkspacesDir();
  const workspace =
    args.workspace ?? `${new URL(args.url).hostname.replace(/[^a-zA-Z0-9-]/g, '-')}_shannon-${Date.now()}`;
  const workspacePath = path.join(workspacesDir, workspace);
  const requestedOutputDir = args.output ? path.resolve(expandHome(args.output)) : undefined;
  const launchDecision = classifyWorkspaceLaunch(workspacePath, args.url, requestedOutputDir);

  // 2. Inputs are valid; initialize shared infrastructure.
  if (stdoutIsTerminal()) {
    displaySplash(isLocal() ? undefined : args.version);
  }
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.chmodSync(workspacesDir, 0o777);
  ensureDocker();
  ensureImage(args.version);
  const spinner = p.spinner();
  spinner.start('Starting scan');
  await ensureInfra(spinner);

  // 3. Generate the invocation identity.
  const suffix = randomSuffix();
  const taskQueue = `shannon-${suffix}`;
  const containerName = `shannon-worker-${suffix}`;

  // 4. Create writable overlay directories after resume validation has succeeded.
  // The run dir and its INTERNAL_DIR must be 0o777 so the container user can create audit
  // subdirs and the overlay backing dirs.
  const internalPath = path.join(workspacePath, INTERNAL_DIR);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.chmodSync(workspacePath, 0o777);
  fs.mkdirSync(internalPath, { recursive: true });
  fs.chmodSync(internalPath, 0o777);
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli', '.playwright']) {
    const dirPath = path.join(internalPath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.chmodSync(dirPath, 0o777);
  }
  if (!launchDecision.isResume) {
    writeLaunchStateAtomically(internalPath, launchDecision.outputDir);
  }

  // 5. Pre-create overlay mount points (:ro mounts cannot create them).
  const shannonDir = path.join(repo.hostPath, '.shannon');
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli']) {
    fs.mkdirSync(path.join(shannonDir, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(repo.hostPath, '.playwright'), { recursive: true });

  // 6. Create the validated customer-copy destination, if configured.
  const outputDir = launchDecision.outputDir;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 7. Resolve prompts and capture the pre-launch resume counter.
  const promptsDir = isLocal() ? path.resolve('apps/worker/prompts') : undefined;
  const sessionJson = resolveRunFile(workspacePath, 'session.json');
  const isResume = launchDecision.isResume;
  let initialResumeCount = 0;
  if (isResume) {
    // Docker and Temporal startup sit between this read and the classification that validated the
    // same file, so a file that changed in between is a workspace-state failure, not a CLI bug.
    const session = readJsonFile(sessionJson);
    const attempts = isRecord(session) && isRecord(session.session) ? session.session.resumeAttempts : undefined;
    initialResumeCount = Array.isArray(attempts) ? attempts.length : 0;
  }

  // 8. Spawn the worker container.
  const proc = spawnWorker({
    version: args.version,
    url: args.url,
    repo,
    workspacesDir,
    taskQueue,
    containerName,
    envFlags: buildEnvFlags(),
    ...(config && { config }),
    ...(promptsDir && { promptsDir }),
    ...(outputDir && { outputDir }),
    workspace,
    ...(args.pipelineTesting && { pipelineTesting: true }),
    ...(args.keepContainer && { keepContainer: true }),
    ...(shouldUsePiAuth() && { piAuthHostPath: resolveHostPiAuthPath() }),
  });

  // Bail if `docker run -d` itself fails (mount error, image missing, etc.)
  const dockerExitCode = await new Promise<number>((resolve) => {
    proc.once('exit', (code) => resolve(code ?? 1));
    proc.once('error', () => resolve(1));
  });

  if (dockerExitCode !== 0) {
    spinner.error('Could not start the scan');
    process.exit(1);
  }

  let started = false;

  // Set when the startup poll times out but session.json already holds durable state this
  // release understands: the workflow is executing, so the exit handler must not stop its
  // worker. An operator abort is a different intent and still stops it.
  let scanRunningUnconfirmed = false;

  // Stop the worker only if the scan hasn't registered yet (e.g. Ctrl-C mid-startup).
  let cleaned = false;
  const stopWorker = (): void => {
    if (cleaned || started) return;
    cleaned = true;
    spinner.stop('Stopping scan');
    try {
      execFileSync('docker', ['stop', containerName], { stdio: 'pipe' });
    } catch {
      // Container may have already exited
    }
    if (args.keepContainer) {
      printPreservedContainerHint(containerName);
    }
  };
  process.on('SIGINT', () => {
    stopWorker();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stopWorker();
    process.exit(0);
  });
  process.on('exit', () => {
    if (scanRunningUnconfirmed) return;
    stopWorker();
  });

  // Poll for the workflow to register in session.json; the spinner resolves once it does.
  spinner.message('Waiting for the scan to start');
  for (let attempts = 0; attempts < 60; attempts++) {
    try {
      const session = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'));
      const resumeAttempts: { workflowId: string }[] = session.session?.resumeAttempts ?? [];

      // Fresh: session.json appears with originalWorkflowId. Resume: new resumeAttempts entry.
      const ready = isResume ? resumeAttempts.length > initialResumeCount : !!session.session?.originalWorkflowId;

      if (ready) {
        started = true;
        spinner.stop(`Scan started — ${workspace}`);
        printInfo(args, workspace, repo.hostPath, workspacesDir);
        if (args.follow) {
          await followScan(workspace, workspacesDir);
        }
        return;
      }
    } catch {
      // File doesn't exist yet
    }
    await sleep(2000);
  }

  if (classifyStartupTimeout(sessionJson) === 'scan-running') {
    scanRunningUnconfirmed = true;
    spinner.error('The scan started, but this CLI could not confirm it');
    printUnconfirmedScanHint(workspace, taskQueue, containerName);
    process.exit(1);
  }

  spinner.error('Timed out waiting for the scan to start');
  process.exit(1);
}

/**
 * Read the startup timeout: 'scan-running' when session.json already holds durable state this
 * release understands, which only the worker writes and only after Temporal began executing the
 * workflow; 'unregistered' when nothing proves the scan started. The distinction decides whether
 * timing out may stop the worker container.
 */
export function classifyStartupTimeout(sessionJsonPath: string): 'unregistered' | 'scan-running' {
  let session: unknown;
  try {
    session = JSON.parse(fs.readFileSync(sessionJsonPath, 'utf-8'));
  } catch {
    return 'unregistered';
  }
  if (!isRecord(session) || !isCurrentDurableState(session.durableScanState)) {
    return 'unregistered';
  }
  return 'scan-running';
}

/** Point the operator at a scan that is running but whose startup this CLI could not confirm. */
function printUnconfirmedScanHint(workspace: string, taskQueue: string, containerName: string): void {
  console.log('');
  console.log('  The scan is running and was left alone; only its startup confirmation is missing.');
  console.log('');
  console.log(`  Workspace:  ${workspace}`);
  console.log(`  Task queue: ${taskQueue}`);
  console.log(`  Container:  ${containerName}`);
  console.log('');
  console.log('  Inspect it:');
  console.log(`    Live logs:   ${commandPrefix()} logs ${workspace}`);
  console.log(`    Worker logs: docker logs ${containerName}`);
  console.log('    Dashboard:   http://localhost:8233');
  console.log('');
}

/**
 * Follow a just-started scan (for `--follow`, aimed at CI): stream its log while Temporal drives
 * completion, then exit on the workflow outcome — 0 if the assessment ran, 1 if the scan failed.
 * That tracks whether the pipeline ran, not whether vulnerabilities were found. On failure the
 * root-cause message is printed so a red CI build says why.
 */
async function followScan(workspace: string, workspacesDir: string): Promise<never> {
  const logFile = resolveRunFile(path.join(workspacesDir, workspace), 'workflow.log');
  const workflowId = resolveWorkflowId(workspace);

  // The worker creates workflow.log as it starts; wait briefly so the first read doesn't
  // mistake a not-yet-created file for an already-finished scan.
  for (let attempts = 0; attempts < 30 && !fs.existsSync(logFile); attempts++) {
    await sleep(1000);
  }

  if (stdoutIsTerminal()) {
    console.error('\n  Following scan log (Ctrl-C to stop watching):\n');
  }

  let temporalUnreachable = false;
  const { sawFailure } = await tailUntilComplete(logFile, {
    ...(workflowId && { workflowId }),
    onUnreachable: () => {
      temporalUnreachable = true;
    },
  });

  // The tail already printed the diagnostic; reading the outcome would only fail the same way.
  if (temporalUnreachable) {
    process.exit(1);
  }

  if (!workflowId) {
    fail('Scan finished but its workflow id could not be resolved from session.json.');
  }

  try {
    const outcome = await getTerminalOutcome(workflowId);
    if (outcome.kind === 'failed') {
      // Print the reason only when the streamed log didn't already show the worker's failure
      // summary — otherwise the worker crashed before writing it, and this is the only report.
      if (!sawFailure) {
        console.error(`\nScan failed:\n${indentFailureSegments(outcome.message)}`);
      }
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    fail('Could not read the scan outcome from Temporal at 127.0.0.1:7233.', `  ${detail}`);
  }
}

function printPreservedContainerHint(containerName: string): void {
  console.log('');
  console.log(`  Worker container preserved: ${containerName}`);
  console.log(`    Inspect logs: docker logs ${containerName}`);
  console.log(`    Remove:       docker rm ${containerName}`);
  console.log('');
}

function printInfo(args: StartArgs, workspace: string, repoPath: string, workspacesDir: string): void {
  const interactive = stdoutIsTerminal();

  if (interactive && !args.follow) {
    console.log('  It runs in the background — you can close this terminal.');
    console.log('');
  }

  console.log(`  Target:     ${args.url}`);
  console.log(`  Repository: ${interactive ? repoPath : path.basename(repoPath)}`);
  console.log(`  Workspace:  ${workspace}`);
  if (args.config) {
    console.log(`  Config:     ${interactive ? path.resolve(args.config) : path.basename(args.config)}`);
  }
  if (args.pipelineTesting) {
    console.log('  Mode:       Pipeline Testing');
  }

  const spec = resolveModelSpec();
  if (typeof spec !== 'string') {
    console.log(`  Model:      ${spec.providerId}:${spec.modelId}`);
  }

  if (!interactive) {
    return;
  }

  const reportDir = path.join(workspacesDir, workspace);

  // When following, the scan log streams inline next, so the "run these to watch it" hints
  // would only contradict that.
  if (!args.follow) {
    const prefix = commandPrefix();
    console.log('');
    console.log('  Watch scan progress:');
    console.log(`    Live logs:  ${prefix} logs ${workspace}`);
    console.log(`    Progress:   ${prefix} status ${workspace}`);
  }

  console.log('');
  console.log('  Report (when the scan finishes):');
  console.log(`    ${reportDir}${path.sep}`);
  console.log(`      ${FINAL_REPORT_PDF_FILENAME}`);
  console.log(`      ${FINAL_REPORT_MD_FILENAME}`);
  console.log('');
}
