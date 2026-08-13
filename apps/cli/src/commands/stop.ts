/**
 * `shannon stop` command — stop one scan by workspace, or every scan with --all.
 * Never touches infra or data; to wipe Temporal state entirely, use `shannon reset`.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import {
  ensureDocker,
  isTemporalReady,
  stopScanContainer,
  stopWorkers,
  terminateAllWorkflows,
  terminateWorkflow,
} from '../docker.js';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';

export interface StopOptions {
  all: boolean;
  yes: boolean;
  workspace?: string;
}

function fail(message: string): never {
  console.error(`ERROR: ${message}`);
  process.exit(1);
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
async function stopSingleScan(workspace: string): Promise<void> {
  const workflowId = resolveWorkflowId(workspace);
  const spinner = p.spinner();
  spinner.start(`Stopping scan ${workspace}`);

  const stoppedContainer = await stopScanContainer(workspace);
  let terminatedWorkflow = false;
  if (workflowId && isTemporalReady()) {
    terminatedWorkflow = terminateWorkflow(workflowId, `Stopped via shannon stop ${workspace}`);
  }

  // Nothing carried this workspace — neither a labeled container nor a recorded workflow.
  if (!stoppedContainer && !workflowId) {
    spinner.error(`No scan found for workspace: ${workspace}`);
    console.error('List running scans with: docker ps --filter name=shannon-worker-');
    process.exit(1);
  }

  const done: string[] = [];
  if (stoppedContainer) done.push('container stopped');
  if (terminatedWorkflow) done.push('workflow terminated');
  spinner.stop(
    done.length > 0 ? `Stopped scan ${workspace} (${done.join(', ')})` : `Nothing was running for ${workspace}`,
  );
}

export async function stop(opts: StopOptions): Promise<void> {
  ensureDocker();

  // 1. Validate the target: exactly one of <workspace> or --all.
  if (opts.all && opts.workspace) {
    fail('Pass a workspace name or --all, not both.');
  }
  if (!opts.all && !opts.workspace) {
    fail('Specify which scan to stop: `stop <workspace>`, or `stop --all` to stop every scan.');
  }

  // 2. Confirm, unless --yes was passed.
  const message = opts.workspace ? `Stop the scan "${opts.workspace}"?` : 'This will stop all running scans. Continue?';
  await confirmOrExit('stop', message, opts.yes);

  // 3. Execute.
  if (opts.workspace) {
    await stopSingleScan(opts.workspace);
    return;
  }

  // --all kills the scans but leaves Temporal running.
  const spinner = p.spinner();
  spinner.start('Stopping all scans');
  const stopped = await stopWorkers();

  // Terminate the now-orphaned workflows so they don't linger as running with no worker.
  if (isTemporalReady()) {
    terminateAllWorkflows('Stopped via shannon stop --all');
  }

  spinner.stop(stopped > 0 ? `Stopped ${stopped} scan${stopped === 1 ? '' : 's'}` : 'No running scans to stop');
}
