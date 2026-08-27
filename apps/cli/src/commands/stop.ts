/**
 * `shannon stop` command — stop one scan by workspace, or every scan with --all.
 * Never touches infra or data; to wipe Temporal state entirely, use `shannon reset`.
 */

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
import { fail, failUsage, warn } from '../errors.js';
import { commandPrefix } from '../mode.js';
import { resolveWorkflowId } from '../session.js';
import { resolveDefaultWorkspace } from '../workspaces.js';

export interface StopOptions {
  all: boolean;
  yes: boolean;
  workspace?: string;
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
    console.error(`${stillRunning.length} container(s) did not stop. Retry: ${commandPrefix()} stop ${workspace}`);
    process.exit(1);
  }

  spinner.stop(`Stopped scan ${workspace}`);

  if (workflowId && temporalUp && isWorkflowRunning(workflowId)) {
    warn(`scan ${workspace} stopped, but its workflow is still Running in Temporal.`);
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
    console.error(`${stillRunning.length} container(s) did not stop. Retry: ${commandPrefix()} stop --all`);
    process.exit(1);
  }

  spinner.stop(`Stopped ${initial.length} scan${initial.length === 1 ? '' : 's'}`);

  if (temporalUp && anyRunningScanWorkflow()) {
    warn('some scan workflows are still Running in Temporal — check http://localhost:8233');
  }
}

/**
 * Infer which scan `stop` acts on when neither a workspace nor --all was given: the single
 * running scan, announced on stderr so it is never a silent guess. Zero or several running
 * scans exit with guidance — there is no most-recent fallback, since stopping a finished
 * scan is a no-op.
 */
function resolveStopTarget(): string {
  const target = resolveDefaultWorkspace({ allowFinished: false });
  if (target.kind === 'ok') {
    console.error(`No workspace given; stopping running scan "${target.workspace}".`);
    return target.workspace;
  }
  if (target.kind === 'ambiguous') {
    failUsage('Multiple scans are running — specify which one, or use --all:', `  ${target.running.join(', ')}`);
  }
  fail('No running scans to stop.', 'Pass a workspace name to stop a specific scan.');
}

export async function stop(opts: StopOptions): Promise<void> {
  ensureDocker();

  // Validate the target: exactly one of <workspace> or --all.
  if (opts.all && opts.workspace) {
    failUsage('Pass a workspace name or --all, not both.');
  }

  // With no explicit target and no --all, default to the single running scan.
  const workspace = opts.all ? undefined : (opts.workspace ?? resolveStopTarget());

  if (workspace) {
    await stopSingleScan(workspace, opts.yes);
  } else {
    await stopAllScans(opts.yes);
  }
}
