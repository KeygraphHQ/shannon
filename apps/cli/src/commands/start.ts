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

/**
 * Upgrade a pre-restructure workspace (flat layout, no INTERNAL_DIR) before it is mounted,
 * so resume finds the old deliverables and their git checkpoints instead of re-running every
 * agent. For a legacy run every top-level entry is internal, so move them all into INTERNAL_DIR
 * (a same-filesystem rename carries the deliverables .git along).
 */
function migrateLegacyWorkspaceLayout(workspacePath: string): void {
  const legacySessionJson = path.join(workspacePath, 'session.json');
  const internalPath = path.join(workspacePath, INTERNAL_DIR);
  if (!fs.existsSync(legacySessionJson) || fs.existsSync(internalPath)) {
    return;
  }

  fs.mkdirSync(internalPath, { recursive: true });
  for (const entry of fs.readdirSync(workspacePath)) {
    if (entry === INTERNAL_DIR) {
      continue;
    }
    fs.renameSync(path.join(workspacePath, entry), path.join(internalPath, entry));
  }
  console.log(`Migrated workspace to ${INTERNAL_DIR}/ layout: ${workspacePath}`);
}

export async function start(args: StartArgs): Promise<void> {
  // 1. Initialize state directories and load env
  initHome();
  loadEnv();

  // 2. Validate credentials
  const creds = validateCredentials();
  if (!creds.valid) {
    fail(creds.error ?? 'Invalid credentials');
  }

  // 3. Resolve paths
  const repo = resolveRepo(args.repo);
  const config = args.config ? resolveConfig(args.config) : undefined;

  // Inputs are valid — show the splash before the Docker/Temporal setup work.
  // Skip it off a real terminal (e.g. CI) so piped/logged output stays clean.
  if (stdoutIsTerminal()) {
    displaySplash(isLocal() ? undefined : args.version);
  }

  // 4. Ensure workspaces dir is writable by container user (UID 1001)
  const workspacesDir = getWorkspacesDir();
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.chmodSync(workspacesDir, 0o777);

  // 5. Ensure Docker and the worker image are available (pull/build prints its own progress).
  ensureDocker();
  ensureImage(args.version);

  // One spinner spans the whole launch: bringing up Temporal and registering the worker.
  const spinner = p.spinner();
  spinner.start('Starting scan');
  await ensureInfra(spinner);

  // 6. Generate unique task queue and container name
  const suffix = randomSuffix();
  const taskQueue = `shannon-${suffix}`;
  const containerName = `shannon-worker-${suffix}`;

  // 7. Generate workspace name if not provided
  const workspace =
    args.workspace ?? `${new URL(args.url).hostname.replace(/[^a-zA-Z0-9-]/g, '-')}_shannon-${Date.now()}`;

  // 8. Create writable overlay directories (mounted over :ro repo paths inside container)
  // The run dir and its INTERNAL_DIR must be 0o777 so the container user can create audit
  // subdirs and the overlay backing dirs.
  const workspacePath = path.join(workspacesDir, workspace);
  const internalPath = path.join(workspacePath, INTERNAL_DIR);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.chmodSync(workspacePath, 0o777);
  migrateLegacyWorkspaceLayout(workspacePath);
  fs.mkdirSync(internalPath, { recursive: true });
  fs.chmodSync(internalPath, 0o777);
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli', '.playwright']) {
    const dirPath = path.join(internalPath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.chmodSync(dirPath, 0o777);
  }

  // 9. Pre-create overlay mount points (:ro mounts can't auto-create them)
  const shannonDir = path.join(repo.hostPath, '.shannon');
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli']) {
    fs.mkdirSync(path.join(shannonDir, dir), { recursive: true });
  }
  fs.mkdirSync(path.join(repo.hostPath, '.playwright'), { recursive: true });

  // 10. Resolve output directory
  const outputDir = args.output ? path.resolve(expandHome(args.output)) : undefined;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 11. Resolve prompts directory (local mode only)
  const promptsDir = isLocal() ? path.resolve('apps/worker/prompts') : undefined;

  // 12. Spawn worker container
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

  // Detect whether this is a fresh workspace or a resume by checking session.json existence
  const sessionJson = resolveRunFile(path.join(workspacesDir, workspace), 'session.json');
  const isResume = fs.existsSync(sessionJson);
  let initialResumeCount = 0;
  if (isResume) {
    try {
      const session = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'));
      initialResumeCount = session.session?.resumeAttempts?.length ?? 0;
    } catch {
      // Corrupted file — worker will handle validation
    }
  }

  let started = false;

  // Stop the worker only if the scan hasn't registered yet (e.g. Ctrl-C mid-startup).
  let cleaned = false;
  const cleanup = (): void => {
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
    cleanup();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(0);
  });
  process.on('exit', cleanup);

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

  spinner.error('Timed out waiting for the scan to start');
  process.exit(1);
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

  const reportPath = path.join(workspacesDir, workspace, FINAL_REPORT_PDF_FILENAME);

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
  console.log(`    ${reportPath}`);
  console.log('');
}
