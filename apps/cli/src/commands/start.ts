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
import { getCredentialsPath, getWorkspacesDir, initHome } from '../home.js';
import { isLocal } from '../mode.js';
import { resolveConfig, resolveRepo } from '../paths.js';
import { displaySplash } from '../splash.js';

export interface StartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  debug: boolean;
  reportFormat: 'md' | 'sarif';
  version: string;
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

  // 3a. Validate target URL up front. Without this, a malformed value or a
  // non-http scheme (file://, ftp://, javascript:) crashes the CLI mid-setup
  // with a raw TypeError or, worse, slips through to the worker which
  // assumes http/https semantics.
  let targetUrl: URL;
  try {
    targetUrl = new URL(args.url);
  } catch {
    console.error(`ERROR: Invalid URL: ${args.url}`);
    process.exit(1);
  }
  if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
    console.error(`ERROR: URL scheme must be http or https, got: ${targetUrl.protocol}`);
    process.exit(1);
  }

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
  const workspace = args.workspace ?? `${targetUrl.hostname.replace(/[^a-zA-Z0-9-]/g, '-')}_shannon-${Date.now()}`;

  // 8. Create writable overlay directories (mounted over :ro repo paths inside container)
  // Workspace dir must be 0o777 so the container user (UID 1001) can create audit subdirs
  const workspacePath = path.join(workspacesDir, workspace);
  fs.mkdirSync(workspacePath, { recursive: true });
  fs.chmodSync(workspacePath, 0o777);
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli']) {
    const dirPath = path.join(workspacePath, dir);
    fs.mkdirSync(dirPath, { recursive: true });
    fs.chmodSync(dirPath, 0o777);
  }

  // 9. Pre-create overlay mount points (:ro mounts can't auto-create them)
  const shannonDir = path.join(repo.hostPath, '.shannon');
  for (const dir of ['deliverables', 'scratchpad', '.playwright-cli']) {
    fs.mkdirSync(path.join(shannonDir, dir), { recursive: true });
  }

  const credentialsPath = getCredentialsPath();
  const hasCredentials = fs.existsSync(credentialsPath);

  if (hasCredentials) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = '/app/credentials/google-sa-key.json';
  }

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
    reportFormat: args.reportFormat,
    ...(config && { config }),
    ...(hasCredentials && { credentials: credentialsPath }),
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
      console.error(`Failed to start worker: ${err.message}`);
      resolve(1);
    });
  });

  if (dockerExitCode !== 0) {
    process.exit(1);
  }

  // Detect whether this is a fresh workspace or a resume by checking session.json existence
  const sessionJson = path.join(workspacesDir, workspace, 'session.json');
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

  // Poll for workflow to register in session.json
  process.stdout.write('Waiting for workflow to start...');
  let workflowId = '';
  let started = false;
  let attempts = 0;
  const pollInterval = setInterval(() => {
    attempts++;
    if (attempts > 60) {
      clearInterval(pollInterval);
      process.stdout.write('\n');
      console.error('Timeout waiting for workflow to start');
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

        // Clear waiting line and show info
        process.stdout.write('\r\x1b[K');
        printInfo(args, workspace, workflowId, repo.hostPath, workspacesDir);
        return;
      }
    } catch (error) {
      // ENOENT is the expected steady-state until the worker writes
      // session.json — keep polling. SyntaxError means the worker is
      // mid-write — also keep polling. Anything else (EACCES, EIO,
      // ENOTDIR) is a real problem we should not silently swallow.
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== 'ENOENT' && !(error instanceof SyntaxError)) {
        clearInterval(pollInterval);
        process.stdout.write('\n');
        console.error(`ERROR: Failed to read session file: ${(error as Error).message}`);
        process.exit(1);
      }
    }
    process.stdout.write('.');
  }, 2000);

  // Stop the worker container only if it hasn't started yet
  let cleaned = false;
  const cleanup = (): void => {
    if (cleaned || started) return;
    cleaned = true;
    clearInterval(pollInterval);
    console.log(`\nStopping worker ${containerName}...`);
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
  const reportsPath = path.join(workspacesDir, workspace);

  console.log(`  Target:     ${args.url}`);
  console.log(`  Repository: ${repoPath}`);
  console.log(`  Workspace:  ${workspace}`);
  if (args.config) {
    console.log(`  Config:     ${path.resolve(args.config)}`);
  }
  if (args.pipelineTesting) {
    console.log('  Mode:       Pipeline Testing');
  }
  console.log('');
  console.log('  Monitor:');
  if (workflowId) {
    console.log(`    Web UI:  http://localhost:8233/namespaces/default/workflows/${workflowId}`);
  } else {
    console.log('    Web UI:  http://localhost:8233');
  }
  console.log(`    Logs:    ${logsCmd}`);
  console.log('');
  console.log('  Output:');
  console.log(`    Reports: ${reportsPath}/`);
  console.log('');
}
