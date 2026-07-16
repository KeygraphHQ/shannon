/**
 * `shannon start` command — launch a pentest scan.
 *
 * Handles both local mode (local build, ./workspaces/, mounted prompts)
 * and npx mode (Docker Hub pull, ~/.shannon/).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ensureImage, ensureInfra, randomSuffix, spawnWorker } from '../docker.js';
import { buildEnvFlags, loadEnv, validateCredentials } from '../env.js';
import { getWorkspacesDir, initHome } from '../home.js';
import { isLocal } from '../mode.js';
import { FINAL_REPORT_FILENAME, INTERNAL_DIR, resolveConfig, resolveRepo, resolveRunFile } from '../paths.js';
import { displaySplash } from '../splash.js';
import { stdoutIsTerminal } from '../tty.js';

export interface StartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  debug: boolean;
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
    console.error(`ERROR: ${creds.error}`);
    process.exit(1);
  }

  // 3. Resolve paths
  const repo = resolveRepo(args.repo);
  const config = args.config ? resolveConfig(args.config) : undefined;

  // 4. Ensure workspaces dir is writable by container user (UID 1001)
  const workspacesDir = getWorkspacesDir();
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.chmodSync(workspacesDir, 0o777);

  // 5. Ensure image (auto-build in dev, pull in npx) and start infra
  ensureImage(args.version);
  await ensureInfra();

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
  const outputDir = args.output ? path.resolve(args.output) : undefined;
  if (outputDir) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // 11. Resolve prompts directory (local mode only)
  const promptsDir = isLocal() ? path.resolve('apps/worker/prompts') : undefined;

  // 12. Display splash screen
  displaySplash(isLocal() ? undefined : args.version);

  // 13. Spawn worker container
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
    ...(args.debug && { debug: true }),
  });

  // 14. Bail if `docker run -d` itself fails (mount error, image missing, etc.)
  const dockerExitCode = await new Promise<number>((resolve) => {
    proc.once('exit', (code) => resolve(code ?? 1));
    proc.once('error', (err) => {
      console.error(`Failed to start the scan: ${err.message}`);
      resolve(1);
    });
  });

  if (dockerExitCode !== 0) {
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

  // Poll for workflow to register in session.json. Off-TTY, skip the dots and
  // clear-line escape so redirected logs stay clean.
  const animate = stdoutIsTerminal();
  process.stdout.write('Waiting for the scan to start...');
  let workflowId = '';
  let started = false;
  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    if (attempts > 60) {
      clearInterval(pollInterval);
      process.stdout.write('\n');
      console.error('Timed out waiting for the scan to start');
      process.exit(1);
    }

    try {
      const session = JSON.parse(fs.readFileSync(sessionJson, 'utf-8'));
      const resumeAttempts: { workflowId: string }[] = session.session?.resumeAttempts ?? [];

      // Fresh: session.json appears with originalWorkflowId. Resume: new resumeAttempts entry.
      const ready = isResume ? resumeAttempts.length > initialResumeCount : !!session.session?.originalWorkflowId;

      if (ready) {
        clearInterval(pollInterval);
        started = true;

        // Latest workflow ID: last resume attempt, or originalWorkflowId for fresh scans
        workflowId = resumeAttempts.at(-1)?.workflowId ?? session.session?.originalWorkflowId ?? '';

        // Clear the waiting line, or just break it off-TTY
        process.stdout.write(animate ? '\r\x1b[K' : '\n');
        printInfo(args, workspace, workflowId, repo.hostPath, workspacesDir);
        return;
      }
    } catch {
      // File doesn't exist yet
    }
    if (animate) process.stdout.write('.');
  }, 2000);

  // Stop the worker container only if it hasn't started yet
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned || started) return;
    cleaned = true;
    clearInterval(pollInterval);
    console.log('\nStopping scan...');
    try {
      execFileSync('docker', ['stop', containerName], { stdio: 'pipe' });
    } catch {
      // Container may have already exited
    }
    if (args.debug) {
      printDebugHint(containerName);
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
}

function printDebugHint(containerName: string): void {
  console.log('');
  console.log(`  Worker container preserved: ${containerName}`);
  console.log(`    Inspect logs: docker logs ${containerName}`);
  console.log(`    Remove:       docker rm ${containerName}`);
  console.log('');
}

function printInfo(
  args: StartArgs,
  workspace: string,
  workflowId: string,
  repoPath: string,
  workspacesDir: string,
): void {
  const logsCmd = isLocal() ? `./shannon logs ${workspace}` : `npx @keygraph/shannon logs ${workspace}`;
  const reportPath = path.join(workspacesDir, workspace, FINAL_REPORT_FILENAME);

  console.log('  Scan started — it runs in the background, so you can close this terminal.');
  console.log('');
  console.log(`  Target:     ${args.url}`);
  console.log(`  Repository: ${repoPath}`);
  console.log(`  Workspace:  ${workspace}`);
  if (args.config) {
    console.log(`  Config:     ${path.resolve(args.config)}`);
  }
  if (args.pipelineTesting) {
    console.log('  Mode:       Pipeline Testing');
  }

  // Surface Fable usage: its safety classifiers route cybersecurity tasks to
  // Opus 4.8, so those phases run on Opus 4.8 regardless of the tier setting.
  const fableTiers = (
    [
      ['small', process.env.ANTHROPIC_SMALL_MODEL],
      ['medium', process.env.ANTHROPIC_MEDIUM_MODEL],
      ['large', process.env.ANTHROPIC_LARGE_MODEL],
    ] as const
  ).filter(([, model]) => model && /fable/i.test(model));
  if (fableTiers.length > 0) {
    const tierList = fableTiers.map(([tier, model]) => `${tier} (${model})`).join(', ');
    console.log(`  Note:       ${tierList} set to a Fable model. Fable's safety classifiers`);
    console.log('              route cybersecurity tasks to Opus 4.8, so those phases run on Opus 4.8.');
  }

  console.log('');
  console.log('  Watch scan progress:');
  console.log(`    Live logs:  ${logsCmd}`);
  if (workflowId) {
    console.log(`    Dashboard:  http://localhost:8233/namespaces/default/workflows/${workflowId}`);
  } else {
    console.log('    Dashboard:  http://localhost:8233');
  }
  console.log('');
  console.log('  Report (when the scan finishes):');
  console.log(`    ${reportPath}`);
  console.log('');
}
