/**
 * `shannon stop` command — stop one scan by workspace, or every scan with --all.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import {
  ensureDocker,
  isTemporalReady,
  stopInfra,
  stopScanContainer,
  stopWorkers,
  terminateAllWorkflows,
  terminateWorkflow,
} from '../docker.js';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';
import { requireInteractive } from '../tty.js';

export interface StopOptions {
  all: boolean;
  clean: boolean;
  yes: boolean;
  workspace?: string;
}

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

/** The confirmation shown for a given stop target. */
function confirmationMessage(opts: StopOptions): string {
  if (opts.workspace) {
    return `Stop the scan "${opts.workspace}"?`;
  }
  if (opts.clean) {
    return 'This will stop all running scans and remove all Temporal data. Continue?';
  }
  return 'This will stop all running scans. Continue?';
}

/** Latest workflow ID recorded for a workspace: last resume attempt, else the original. */
function resolveWorkflowId(workspace: string): string | undefined {
  const sessionPath = resolveRunFile(path.join(getWorkspacesDir(), workspace), 'session.json');
  try {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    const resumeAttempts: { workflowId?: string }[] = session.session?.resumeAttempts ?? [];
    return resumeAttempts.at(-1)?.workflowId ?? session.session?.originalWorkflowId ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stop a single scan: kill its worker container and terminate its Temporal
 * workflow so it doesn't linger as a running workflow with no worker.
 */
function stopSingleScan(workspace: string): void {
  const stoppedContainer = stopScanContainer(workspace);
  const workflowId = resolveWorkflowId(workspace);

  // Nothing carried this workspace — neither a labeled container nor a recorded workflow.
  if (!stoppedContainer && !workflowId) {
    fail(`No scan found for workspace: ${workspace}\nList running scans with: docker ps --filter name=shannon-worker-`);
  }

  console.log(`Stopping scan: ${workspace}`);

  let terminatedWorkflow = false;
  if (workflowId && isTemporalReady()) {
    terminatedWorkflow = terminateWorkflow(workflowId, `Stopped via shannon stop ${workspace}`);
  }

  const done: string[] = [];
  if (stoppedContainer) done.push('container stopped');
  if (terminatedWorkflow) done.push('workflow terminated');
  console.log(done.length > 0 ? `  Done (${done.join(', ')}).` : '  Nothing was running for this workspace.');
}

export async function stop(opts: StopOptions): Promise<void> {
  ensureDocker();

  // 1. Validate the target: exactly one of <workspace> or --all, and --clean is --all-only.
  if (opts.all && opts.workspace) {
    fail('Pass a workspace name or --all, not both.');
  }
  if (!opts.all && !opts.workspace) {
    fail('Specify which scan to stop: `stop <workspace>`, or `stop --all` to stop every scan.');
  }
  if (opts.clean && !opts.all) {
    fail('--clean applies to --all only. Use `stop --all --clean` to remove everything.');
  }

  // 2. Confirm, unless --yes was passed.
  if (!opts.yes) {
    requireInteractive('stop', 'Re-run with --yes to skip this confirmation.');
    const confirmed = await p.confirm({ message: confirmationMessage(opts) });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Aborted.');
      process.exit(0);
    }
  }

  // 3. Execute.
  if (opts.workspace) {
    stopSingleScan(opts.workspace);
    return;
  }

  // --all kills the scans but leaves Temporal running; only --clean tears infra down and wipes its data.
  stopWorkers();

  if (opts.clean) {
    stopInfra(true);
    return;
  }

  // Terminate the now-orphaned workflows so they don't linger as running with no worker.
  if (isTemporalReady()) {
    terminateAllWorkflows('Stopped via shannon stop --all');
  }
}
