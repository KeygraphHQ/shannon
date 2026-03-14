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
import { getCredentialsDir, getCredentialsPath, getWorkspacesDir, initHome } from '../home.js';
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

export function start(args: StartArgs): void {
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
  ensureInfra(useRouter);

  // 7. Generate unique task queue and container name
  const suffix = randomSuffix();
  const taskQueue = `shannon-${suffix}`;
  const containerName = `shannon-worker-${suffix}`;

  // 8. Generate workspace name if not provided
  let workspace = args.workspace;
  if (!workspace) {
    const hostname = new URL(args.url).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
    workspace = `${hostname}_shannon-${Date.now()}`;
  }

  // 9. Resolve credentials
  const credentialsDir = getCredentialsDir();
  const credentialsPath = getCredentialsPath();
  const hasCredentials = !credentialsDir && fs.existsSync(credentialsPath);

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
    ...(credentialsDir && { credentialsDir }),
    ...(hasCredentials && { credentials: credentialsPath }),
    ...(promptsDir && { promptsDir }),
    ...(outputDir && { outputDir }),
    ...(workspace && { workspace }),
    ...(args.pipelineTesting && { pipelineTesting: true }),
  });

  // 14. Wait for workflow.log to appear, then display info
  const workflowLog = path.join(workspacesDir, workspace, 'workflow.log');

  proc.on('error', (err) => {
    console.error(`Failed to start worker: ${err.message}`);
    process.exit(1);
  });

  // Poll for workflow.log header
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
      const content = fs.readFileSync(workflowLog, 'utf-8');
      if (content.includes('====')) {
        clearInterval(pollInterval);
        started = true;

        // Extract workflow ID
        const match = /^Workflow ID: (.+)$/m.exec(content);
        if (match?.[1]) {
          workflowId = match[1];
        }

        // Clear waiting line and show info
        process.stdout.write('\r\x1b[K');
        printInfo(args, useRouter, workspace!, workflowId, repo.hostPath, workspacesDir);
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
