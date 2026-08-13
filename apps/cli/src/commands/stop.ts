/**
 * `shannon stop` command — stop one scan by workspace, or every scan with --all.
 * Never touches infra or data; to wipe Temporal state entirely, use `shannon reset`.
 */

import fs from 'node:fs';
import path from 'node:path';
import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import {
  anyRunningScanWorkflow,
  ensureDocker,
  isTemporalReady,
  isWorkflowRunning,
  runningContainers,
  scanFilter,
  stopContainers,
  terminateAllWorkflows,
  terminateWorkflow,
  WORKER_FILTER,
} from '../docker.js';
import { fail } from '../errors.js';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';

export interface StopOptions {
  all: boolean;
  yes: boolean;
  workspace?: string;
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
 * Stop a single scan. Terminating the workflow both clears Temporal's record and
 * brings the container down (the worker waits on the workflow result), so that runs
 * first; `docker stop` is the fallback for the pre-registration window and an
 * unreachable Temporal. The stop is then verified rather than assumed.
 */
async function stopSingleScan(workspace: string, yes: boolean): Promise<void> {
  const workflowId = resolveWorkflowId(workspace);
  const filter = scanFilter(workspace);
  const temporalUp = isTemporalReady();

  const initialContainers = runningContainers(filter);
  const workflowRunning = Boolean(workflowId && temporalUp && isWorkflowRunning(workflowId));

  // Resolve what is running before prompting, so we never confirm a no-op.
  if (initialContainers.length === 0 && !workflowRunning) {
    if (!workflowId) {
      fail(`No scan found for workspace: ${workspace}`);
    }
    console.log(`Nothing was running for ${workspace}.`);
    return;
  }

  await confirmOrExit('stop', `Stop the scan "${workspace}"?`, yes);

  const spinner = p.spinner();
  spinner.start(`Stopping scan ${workspace}`);

  if (workflowId && workflowRunning) {
    terminateWorkflow(workflowId, `Stopped via shannon stop ${workspace}`);
  }
  await stopContainers(runningContainers(filter));

  const stillRunning = runningContainers(filter);
  if (stillRunning.length > 0) {
    spinner.error(`Scan ${workspace} may still be running`);
    console.error(`${stillRunning.length} container(s) did not stop. Retry: ./shannon stop ${workspace}`);
    process.exit(1);
  }

  spinner.stop(`Stopped scan ${workspace}`);

  if (workflowId && temporalUp && isWorkflowRunning(workflowId)) {
    console.error(`WARNING: scan ${workspace} stopped, but its workflow is still Running in Temporal.`);
  }
}

async function stopAllScans(yes: boolean): Promise<void> {
  const temporalUp = isTemporalReady();
  const initial = runningContainers(WORKER_FILTER);

  // Resolve what is running before prompting, so we never confirm a no-op.
  if (initial.length === 0) {
    console.log('No running scans to stop.');
    return;
  }

  await confirmOrExit('stop', 'This will stop all running scans. Continue?', yes);

  const spinner = p.spinner();
  spinner.start('Stopping all scans');

  if (temporalUp) {
    terminateAllWorkflows('Stopped via shannon stop --all');
  }
  await stopContainers(runningContainers(WORKER_FILTER));

  const stillRunning = runningContainers(WORKER_FILTER);
  if (stillRunning.length > 0) {
    spinner.error(`Stopped ${initial.length - stillRunning.length} of ${initial.length} scans`);
    console.error(`${stillRunning.length} container(s) did not stop. Retry: ./shannon stop --all`);
    process.exit(1);
  }

  spinner.stop(`Stopped ${initial.length} scan${initial.length === 1 ? '' : 's'}`);

  if (temporalUp && anyRunningScanWorkflow()) {
    console.error('WARNING: some scan workflows are still Running in Temporal — check http://localhost:8233');
  }
}

export async function stop(opts: StopOptions): Promise<void> {
  ensureDocker();

  // Validate the target: exactly one of <workspace> or --all.
  if (opts.all && opts.workspace) {
    fail('Pass a workspace name or --all, not both.');
  }
  if (!opts.all && !opts.workspace) {
    fail('Specify which scan to stop: `stop <workspace>`, or `stop --all` to stop every scan.');
  }

  if (opts.workspace) {
    await stopSingleScan(opts.workspace, opts.yes);
  } else {
    await stopAllScans(opts.yes);
  }
}
