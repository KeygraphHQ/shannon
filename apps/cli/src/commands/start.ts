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
import { buildEnvFlags, isRouterConfigured, loadEnv, validateCredentials } from '../env.js';
import { getCredentialsPath, getWorkspacesDir, initHome } from '../home.js';
import { isLocal } from '../mode.js';
import { ensureDeliverables, resolveConfig, resolveRepo } from '../paths.js';
import { displaySplash } from '../splash.js';

export interface StartArgs {
  url: string;
  repo: string;
  config?: string;
  workspace?: string;
  output?: string;
  pipelineTesting: boolean;
  router: boolean;
  version: string;
}

export async function start(args: StartArgs): Promise<void> {
  // 1. Initialize state directories and load env
  initHome();
  loadEnv();

  // 2. Validate credentials and auto-detect router mode
  const creds = validateCredentials();
  if (!creds.valid) {
    console.error(`ERROR: ${creds.error}`);
    process.exit(1);
  }
  const useRouter = args.router || isRouterConfigured();

  // 3. Resolve paths
  const repo = resolveRepo(args.repo);
  const config = args.config ? resolveConfig(args.config) : undefined;
  ensureDeliverables(repo.hostPath);

  // 4. Ensure workspaces dir is writable by container user (UID 1001)
  const workspacesDir = getWorkspacesDir();
  fs.mkdirSync(workspacesDir, { recursive: true });
  fs.chmodSync(workspacesDir, 0o777);

  // 5. Handle router env
  if (useRouter) {
    process.env.ANTHROPIC_BASE_URL = 'http://shannon-router:3456';
    process.env.ANTHROPIC_AUTH_TOKEN = 'shannon-router-key';
  }

  // 6. Ensure image (auto-build in dev, pull in npx) and start infra
  ensureImage(args.version);
  await ensureInfra(useRouter);

  // 7. Generate unique task queue and container name
  const suffix = randomSuffix();
  const taskQueue = `shannon-${suffix}`;
  const containerName = `shannon-worker-${suffix}`;

  // 8. Generate workspace name if not provided
  const workspace =
    args.workspace ?? `${new URL(args.url).hostname.replace(/[^a-zA-Z0-9-]/g, '-')}_shannon-${Date.now()}`;

  // 9. Resolve credentials — mount single file to fixed container path
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
    ...(config && { config }),
    ...(hasCredentials && { credentials: credentialsPath }),
    ...(promptsDir && { promptsDir }),
    ...(outputDir && { outputDir }),
    ...(workspace && { workspace }),
    ...(args.pipelineTesting && { pipelineTesting: true }),
  });

  // 14. Wait for workflow to register, then display info
  proc.on('error', (err) => {
    console.error(`Failed to start worker: ${err.message}`);
    process.exit(1);
  });

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
        printInfo(args, useRouter, workspace, workflowId, repo.hostPath, workspacesDir);
        return;
      }
    } catch {
      // File doesn't exist yet
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

function printInfo(
  args: StartArgs,
  routerActive: boolean,
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
  if (routerActive) {
    console.log('  Router:     Enabled');
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
