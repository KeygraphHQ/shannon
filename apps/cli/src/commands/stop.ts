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
 * Stop a single scan. Terminating the workflow both clears Temporal's record and
 * brings the container down (the worker waits on the workflow result), so that runs
 * first; `docker stop` is the fallback for the pre-registration window and an
 * unreachable Temporal. The stop is then verified rather than assumed.
 */
async function stopSingleScan(workspace: string): Promise<void> {
  const workflowId = resolveWorkflowId(workspace);
  const filter = scanFilter(workspace);

  // Nothing carried this workspace — no labeled container and no recorded workflow.
  if (runningContainers(filter).length === 0 && !workflowId) {
    fail(`No scan found for workspace: ${workspace}\nList running scans with: docker ps --filter name=shannon-worker-`);
  }

  const spinner = p.spinner();
  spinner.start(`Stopping scan ${workspace}`);

  const temporalUp = isTemporalReady();
  if (workflowId && temporalUp) {
    terminateWorkflow(workflowId, `Stopped via shannon stop ${workspace}`);
  }
  await stopContainers(runningContainers(filter));

  // Verify the container is actually gone, rather than trusting the stop worked.
  const stillRunning = runningContainers(filter);
  if (stillRunning.length > 0) {
    spinner.error(`Scan ${workspace} may still be running`);
    console.error(`${stillRunning.length} container(s) did not stop. Retry: ./shannon stop ${workspace}`);
    process.exit(1);
  }

  spinner.stop(`Stopped scan ${workspace}`);

  // The container is down; warn if Temporal still tracks the workflow as running.
  if (workflowId && temporalUp && isWorkflowRunning(workflowId)) {
    console.error(`WARNING: scan ${workspace} stopped, but its workflow is still Running in Temporal.`);
  }
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

  // --all leaves Temporal running. Terminate first (clears state + brings containers
  // down), then stop any container still standing, then verify.
  const spinner = p.spinner();
  spinner.start('Stopping all scans');

  const temporalUp = isTemporalReady();
  const initial = runningContainers(WORKER_FILTER);
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

  spinner.stop(
    initial.length > 0
      ? `Stopped ${initial.length} scan${initial.length === 1 ? '' : 's'}`
      : 'No running scans to stop',
  );

  if (temporalUp && anyRunningScanWorkflow()) {
    console.error('WARNING: some scan workflows are still Running in Temporal — check http://localhost:8233');
  }
}
