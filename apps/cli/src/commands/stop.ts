/**
 * `shannon stop` command — stop one scan by workspace, or every scan with --all.
 * Never touches infra or data; to wipe Temporal state entirely, use `shannon reset`.
 */

import path from 'node:path';
import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import {
  anyRunningScanWorkflow,
  cancelWorkflow,
  ensureDocker,
  isTemporalReady,
  isWorkflowRunning,
  runningContainers,
  runningScanWorkspaces,
  scanFilter,
  stopContainers,
  terminateWorkflow,
  WORKER_FILTER,
} from '../docker.js';
import { fail, failUsage, warn } from '../errors.js';
import { getWorkspacesDir } from '../home.js';
import { commandPrefix } from '../mode.js';
import { resolveRunFile } from '../paths.js';
import { resolveWorkflowId } from '../session.js';
import { resolveDefaultWorkspace } from '../workspaces.js';
import { appendCancellationFallback } from './logs.js';

export interface StopOptions {
  all: boolean;
  yes: boolean;
  workspace?: string;
}

const CANCELLATION_GRACE_MS = 10_000;
const CANCELLATION_POLL_MS = 250;

export interface StopTarget {
  readonly workspace: string;
  readonly workflowId?: string;
  readonly workflowRunning: boolean;
}

export interface StopLifecycle {
  readonly cancel: (workflowId: string) => boolean;
  readonly isRunning: (workflowId: string) => boolean;
  readonly terminate: (workflowId: string) => boolean;
  readonly containers: (workspace: string) => string[];
  readonly stopContainers: (ids: string[]) => Promise<void>;
  readonly appendFallback: (workspace: string) => void;
  readonly wait: (milliseconds: number) => Promise<void>;
}

const stopLifecycle: StopLifecycle = {
  cancel: cancelWorkflow,
  isRunning: isWorkflowRunning,
  terminate: (workflowId) => terminateWorkflow(workflowId, 'Stopped after cancellation grace period'),
  containers: (workspace) => runningContainers(scanFilter(workspace)),
  stopContainers,
  appendFallback: (workspace) => {
    const logFile = resolveRunFile(path.join(getWorkspacesDir(), workspace), 'workflow.log');
    appendCancellationFallback(logFile);
  },
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

/** Cancel first; terminate and write the fallback heading only when graceful closure misses its deadline. */
export async function stopTargetCancelFirst(
  target: StopTarget,
  lifecycle: StopLifecycle = stopLifecycle,
  graceMs: number = CANCELLATION_GRACE_MS,
  pollMs: number = CANCELLATION_POLL_MS,
): Promise<'graceful' | 'forced'> {
  let forced = !target.workflowRunning || target.workflowId === undefined;
  if (!forced && target.workflowId !== undefined) {
    lifecycle.cancel(target.workflowId);
    const deadline = Date.now() + graceMs;
    while (lifecycle.isRunning(target.workflowId) && Date.now() < deadline) {
      await lifecycle.wait(pollMs);
    }
    forced = lifecycle.isRunning(target.workflowId);
    if (forced) lifecycle.terminate(target.workflowId);
  }

  await lifecycle.stopContainers(lifecycle.containers(target.workspace));
  if (forced && lifecycle.containers(target.workspace).length === 0) {
    lifecycle.appendFallback(target.workspace);
  }
  return forced ? 'forced' : 'graceful';
}

/** Apply the same captured-target lifecycle concurrently for `stop --all`. */
export function stopTargetsCancelFirst(
  targets: readonly StopTarget[],
  lifecycle: StopLifecycle = stopLifecycle,
  graceMs: number = CANCELLATION_GRACE_MS,
  pollMs: number = CANCELLATION_POLL_MS,
): Promise<readonly ('graceful' | 'forced')[]> {
  return Promise.all(targets.map((target) => stopTargetCancelFirst(target, lifecycle, graceMs, pollMs)));
}

/**
 * Stop a single scan. Cooperative cancellation gets the first ten seconds so the
 * workflow can flush its terminal log; termination and a host-written heading are
 * the fallback for the pre-registration window or an unavailable finalizer.
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

  await stopTargetCancelFirst({ workspace, ...(workflowId !== undefined && { workflowId }), workflowRunning });

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
  const targets = [...new Set(runningScanWorkspaces())].map((workspace): StopTarget => {
    const workflowId = resolveWorkflowId(workspace);
    return {
      workspace,
      ...(workflowId !== undefined && { workflowId }),
      workflowRunning: Boolean(workflowId && temporalUp && isWorkflowRunning(workflowId)),
    };
  });

  // Resolve what is running before prompting, so we never confirm a no-op.
  if (initial.length === 0) {
    console.log('No running scans to stop.');
    return;
  }

  await confirmOrExit('stop', 'This will stop all running scans. Continue?', yes);

  const spinner = p.spinner();
  spinner.start('Stopping all scans');

  await stopTargetsCancelFirst(targets);
  // Keep the legacy safety net for a worker whose workspace label was unavailable.
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
