/**
 * `shannon stop` command: stop one scan by workspace, or every scan with --all.
 * Never touches infra or data; to wipe Temporal state entirely, use `shannon reset`.
 */

import path from 'node:path';
import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import {
  type CommandQueryResult,
  ensureDocker,
  type RunningScanContainer,
  runningContainersChecked,
  runningScanContainersChecked,
  scanFilter,
  stopContainers,
  WORKER_FILTER,
  WORKFLOW_ID_PROTOCOL,
} from '../docker.js';
import { fail, failUsage, warn } from '../errors.js';
import { getWorkspacesDir } from '../home.js';
import { commandPrefix } from '../mode.js';
import { resolveRunFile } from '../paths.js';
import {
  clearPendingWorkflowIdentity,
  type PendingWorkflowIdentity,
  readPendingWorkflowIdentities,
} from '../pending-workflow.js';
import { resolveWorkflowId } from '../session.js';
import {
  describeWorkflowLifecycle,
  listRunningScanWorkflows,
  type RunningScanWorkflow,
  refreshWorkflowLifecycleConnection,
  requestWorkflowCancellation,
  requestWorkflowTermination,
  type WorkflowLifecycleState,
} from '../temporal-client.js';
import { listWorkspaces, resolveScanIdentity } from '../workspaces.js';
import { appendCancellationFallback } from './logs.js';

export interface StopOptions {
  all: boolean;
  yes: boolean;
  workspace?: string;
}

const CANCELLATION_GRACE_MS = 10_000;
const CANCELLATION_POLL_MS = 250;
const TERMINATION_VERIFY_MS = 5_000;
const TERMINATION_ATTEMPTS = 2;
const TERMINATION_REASON = 'Stopped after cancellation grace period';
const CANDIDATE_REGISTRATION_SETTLE_MS = 3_000;
const VISIBILITY_SETTLE_MS = 1_000;
const VISIBILITY_MAX_SETTLE_MS = 5_000;

export type WorkflowStopOutcome =
  | { readonly kind: 'graceful' }
  | { readonly kind: 'forced' }
  | { readonly kind: 'already-closed' }
  | { readonly kind: 'unverified' };

export type ContainerStopOutcome =
  | { readonly kind: 'stopped'; readonly hadContainers: boolean }
  | { readonly kind: 'still-running'; readonly remaining: number }
  | { readonly kind: 'unverified' };

export interface StopLifecycle {
  readonly cancel: (workflowId: string) => Promise<'requested' | 'not-found'>;
  readonly describe: (workflowId: string) => Promise<WorkflowLifecycleState>;
  readonly refresh: () => Promise<void>;
  readonly terminate: (workflowId: string) => Promise<'requested' | 'not-found'>;
  readonly containers: (filter: readonly string[]) => CommandQueryResult<string[]>;
  readonly stopContainers: (ids: readonly string[]) => Promise<void>;
  readonly appendFallback: (workspace: string) => void;
  readonly wait: (milliseconds: number) => Promise<void>;
  readonly now: () => number;
}

export interface WorkflowStopTarget {
  readonly workflowId: string;
  readonly workspace?: string;
  readonly containerCandidate: boolean;
  /** Safe to synthesize a log marker when this CLI-owned launch never reached session registration. */
  readonly preRegistrationFallback?: boolean;
}

export interface WorkflowStopResult {
  readonly target: WorkflowStopTarget;
  readonly outcome: WorkflowStopOutcome;
}

export interface StopExecutionResult {
  readonly workflows: readonly WorkflowStopResult[];
  readonly containers: ContainerStopOutcome;
  readonly preRegistrationWorkspaces: readonly string[];
}

export interface WorkflowTargetPlan {
  readonly targets: readonly WorkflowStopTarget[];
  readonly containersWithoutVerifiedWorkflowId: readonly string[];
}

interface PendingWorkflowReference {
  readonly workspace: string;
  readonly identity: PendingWorkflowIdentity;
}

interface PendingWorkflowTargets {
  readonly byWorkspace: ReadonlyMap<string, readonly PendingWorkflowIdentity[]>;
  readonly references: readonly PendingWorkflowReference[];
  readonly unreadableCount: number;
}

const stopLifecycle: StopLifecycle = {
  cancel: requestWorkflowCancellation,
  describe: describeWorkflowLifecycle,
  refresh: refreshWorkflowLifecycleConnection,
  terminate: (workflowId) => requestWorkflowTermination(workflowId, TERMINATION_REASON),
  containers: runningContainersChecked,
  stopContainers: (ids) => stopContainers([...ids]),
  appendFallback: (workspace) => {
    const logFile = resolveRunFile(path.join(getWorkspacesDir(), workspace), 'workflow.log');
    appendCancellationFallback(logFile);
  },
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: Date.now,
};

function readPendingTargets(workspaces: readonly string[]): PendingWorkflowTargets {
  const byWorkspace = new Map<string, readonly PendingWorkflowIdentity[]>();
  const references: PendingWorkflowReference[] = [];
  let unreadableCount = 0;

  for (const workspace of new Set(workspaces)) {
    const workspacePath = path.join(getWorkspacesDir(), workspace);
    const result = readPendingWorkflowIdentities(workspacePath);
    unreadableCount += result.unreadableCount;
    if (result.identities.length === 0) continue;
    byWorkspace.set(workspace, result.identities);
    for (const identity of result.identities) references.push({ workspace, identity });
  }

  return { byWorkspace, references, unreadableCount };
}

function clearPendingTargets(references: readonly PendingWorkflowReference[]): number {
  let failures = 0;
  for (const reference of references) {
    try {
      clearPendingWorkflowIdentity(path.join(getWorkspacesDir(), reference.workspace), reference.identity.task_queue);
    } catch {
      failures++;
    }
  }
  return failures;
}

function workflowClosed(state: WorkflowLifecycleState): boolean {
  return state.kind === 'terminal' || state.kind === 'not-found';
}

/** Poll direct workflow state until Temporal positively confirms closure or the deadline expires. */
async function waitForWorkflowClosure(
  workflowId: string,
  lifecycle: StopLifecycle,
  deadline: number,
  pollMs: number,
): Promise<boolean> {
  while (true) {
    if (deadline - lifecycle.now() <= 0) return false;
    try {
      if (workflowClosed(await lifecycle.describe(workflowId))) return true;
    } catch {
      // An unavailable status is unknown, never evidence that the workflow closed.
    }

    const remaining = deadline - lifecycle.now();
    if (remaining <= 0) return false;
    await lifecycle.wait(Math.min(pollMs, remaining));
  }
}

/**
 * Request cooperative cancellation, then make at most two termination attempts when the
 * workflow does not close during its grace period. Every success is backed by direct state.
 */
export async function stopWorkflowCancelFirst(
  workflowId: string,
  lifecycle: StopLifecycle = stopLifecycle,
  graceMs: number = CANCELLATION_GRACE_MS,
  pollMs: number = CANCELLATION_POLL_MS,
  verifyMs: number = TERMINATION_VERIFY_MS,
): Promise<WorkflowStopOutcome> {
  try {
    if ((await lifecycle.cancel(workflowId)) === 'not-found') return { kind: 'already-closed' };
  } catch {
    // The request may have reached Temporal even when its acknowledgement was lost.
  }

  if (await waitForWorkflowClosure(workflowId, lifecycle, lifecycle.now() + graceMs, pollMs)) {
    return { kind: 'graceful' };
  }

  const verifyPerAttemptMs = Math.max(pollMs, Math.ceil(verifyMs / TERMINATION_ATTEMPTS));
  for (let attempt = 0; attempt < TERMINATION_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      try {
        await lifecycle.refresh();
      } catch {
        // The termination call below makes one final bounded connection attempt.
      }
    }

    try {
      if ((await lifecycle.terminate(workflowId)) === 'not-found') return { kind: 'already-closed' };
    } catch {
      // A lost acknowledgement is resolved by the direct verification below.
    }
    if (await waitForWorkflowClosure(workflowId, lifecycle, lifecycle.now() + verifyPerAttemptMs, pollMs)) {
      return { kind: 'forced' };
    }
  }

  return { kind: 'unverified' };
}

/** Apply the same bounded lifecycle concurrently to a captured set of workflow IDs. */
export async function stopWorkflowsCancelFirst(
  workflowIds: readonly string[],
  lifecycle: StopLifecycle = stopLifecycle,
  graceMs: number = CANCELLATION_GRACE_MS,
  pollMs: number = CANCELLATION_POLL_MS,
  verifyMs: number = TERMINATION_VERIFY_MS,
): Promise<readonly WorkflowStopOutcome[]> {
  const settlements = await Promise.allSettled(
    workflowIds.map((workflowId) => stopWorkflowCancelFirst(workflowId, lifecycle, graceMs, pollMs, verifyMs)),
  );
  return settlements.map((settlement) =>
    settlement.status === 'fulfilled' ? settlement.value : { kind: 'unverified' },
  );
}

/** Stop exactly the captured workers, then fail closed if any matching worker remains or appears. */
export async function stopContainersAndVerify(
  initialIds: readonly string[],
  filter: readonly string[],
  lifecycle: StopLifecycle = stopLifecycle,
): Promise<ContainerStopOutcome> {
  try {
    await lifecycle.stopContainers(initialIds);
  } catch {
    // The post-stop query below decides whether the operation actually succeeded.
  }

  let after: CommandQueryResult<string[]>;
  try {
    after = lifecycle.containers(filter);
  } catch {
    return { kind: 'unverified' };
  }
  if (after.kind === 'unavailable') return { kind: 'unverified' };
  if (after.value.length > 0) return { kind: 'still-running', remaining: after.value.length };
  return { kind: 'stopped', hadContainers: initialIds.length > 0 };
}

function addWorkflowTarget(targets: Map<string, WorkflowStopTarget>, candidate: WorkflowStopTarget): void {
  const current = targets.get(candidate.workflowId);
  if (current === undefined) {
    targets.set(candidate.workflowId, candidate);
    return;
  }
  const workspace = current.workspace ?? candidate.workspace;
  targets.set(candidate.workflowId, {
    workflowId: candidate.workflowId,
    ...(workspace !== undefined && { workspace }),
    containerCandidate: current.containerCandidate || candidate.containerCandidate,
    ...((current.preRegistrationFallback === true || candidate.preRegistrationFallback === true) && {
      preRegistrationFallback: true,
    }),
  });
}

/**
 * Build the stop union from immutable container candidates, recorded session IDs,
 * pre-registration launch records, and Temporal visibility. Visibility supplies positive
 * targets but never proves absence.
 */
function verifiedContainerWorkflowId(
  container: RunningScanContainer,
  visibleWorkflows: readonly RunningScanWorkflow[],
): string | undefined {
  if (container.workerProtocol === WORKFLOW_ID_PROTOCOL && container.workflowId !== undefined) {
    return container.workflowId;
  }
  if (container.taskQueue === undefined) return undefined;
  const matches = visibleWorkflows.filter((workflow) => workflow.taskQueue === container.taskQueue);
  return matches.length === 1 ? matches[0]?.workflowId : undefined;
}

export function buildWorkflowTargetPlan(
  containers: readonly RunningScanContainer[],
  recordedByWorkspace: ReadonlyMap<string, string>,
  visibleWorkflows: readonly RunningScanWorkflow[],
  pendingByWorkspace: ReadonlyMap<string, readonly PendingWorkflowIdentity[]> = new Map(),
): WorkflowTargetPlan {
  const targets = new Map<string, WorkflowStopTarget>();
  const containersWithoutVerifiedWorkflowId: string[] = [];

  for (const container of containers) {
    const verifiedWorkflowId = verifiedContainerWorkflowId(container, visibleWorkflows);
    if (verifiedWorkflowId === undefined) containersWithoutVerifiedWorkflowId.push(container.id);
    else {
      addWorkflowTarget(targets, {
        workflowId: verifiedWorkflowId,
        ...(container.workspace !== undefined && { workspace: container.workspace }),
        containerCandidate: true,
      });
    }
  }

  for (const [workspace, workflowId] of recordedByWorkspace) {
    addWorkflowTarget(targets, {
      workflowId,
      workspace,
      containerCandidate:
        containers.some((container) => verifiedContainerWorkflowId(container, visibleWorkflows) === workflowId) ||
        pendingByWorkspace.get(workspace)?.some((identity) => identity.workflow_id === workflowId) === true,
    });
  }

  for (const [workspace, identities] of pendingByWorkspace) {
    for (const identity of identities) {
      addWorkflowTarget(targets, {
        workflowId: identity.workflow_id,
        workspace,
        containerCandidate: true,
        ...(!recordedByWorkspace.has(workspace) && { preRegistrationFallback: true }),
      });
    }
  }

  for (const workflow of visibleWorkflows) {
    const matchingWorkspaces = new Set(
      containers
        .filter((container) => container.taskQueue === workflow.taskQueue && container.workspace !== undefined)
        .flatMap((container) => container.workspace ?? []),
    );
    for (const [workspace, identities] of pendingByWorkspace) {
      if (identities.some((identity) => identity.task_queue === workflow.taskQueue)) matchingWorkspaces.add(workspace);
    }
    const workspace = matchingWorkspaces.size === 1 ? [...matchingWorkspaces][0] : undefined;
    addWorkflowTarget(targets, {
      workflowId: workflow.workflowId,
      ...(workspace !== undefined && { workspace }),
      containerCandidate:
        containers.some((container) => container.taskQueue === workflow.taskQueue) ||
        [...pendingByWorkspace.values()].some((identities) =>
          identities.some((identity) => identity.task_queue === workflow.taskQueue),
        ),
    });
  }

  return { targets: [...targets.values()], containersWithoutVerifiedWorkflowId };
}

/**
 * Stop known workflows while their workers can finalize, stop the captured workers, then
 * re-describe every container candidate. The last pass closes a NotFound-to-started race.
 */
export async function executeStopPlan(
  targets: readonly WorkflowStopTarget[],
  containers: readonly RunningScanContainer[],
  filter: readonly string[],
  lifecycle: StopLifecycle = stopLifecycle,
  graceMs: number = CANCELLATION_GRACE_MS,
  pollMs: number = CANCELLATION_POLL_MS,
  verifyMs: number = TERMINATION_VERIFY_MS,
  candidateSettleMs: number = CANDIDATE_REGISTRATION_SETTLE_MS,
): Promise<StopExecutionResult> {
  const initialOutcomes = await stopWorkflowsCancelFirst(
    targets.map((target) => target.workflowId),
    lifecycle,
    graceMs,
    pollMs,
    verifyMs,
  );
  const outcomes = new Map<string, WorkflowStopOutcome>();
  for (let index = 0; index < targets.length; index++) {
    const target = targets[index];
    const outcome = initialOutcomes[index];
    if (target !== undefined && outcome !== undefined) outcomes.set(target.workflowId, outcome);
  }

  const containerOutcome = await stopContainersAndVerify(
    containers.map((container) => container.id),
    filter,
    lifecycle,
  );
  const preRegistrationWorkspaces = new Set<string>();

  if (containerOutcome.kind === 'stopped') {
    const candidates = targets.filter((target) => target.containerCandidate);

    for (const target of candidates) {
      const initialOutcome = outcomes.get(target.workflowId) ?? { kind: 'unverified' };
      const settleDeadline = lifecycle.now() + candidateSettleMs;
      let onlyObservedNotFound = initialOutcome.kind === 'already-closed' || initialOutcome.kind === 'unverified';

      while (true) {
        try {
          const state = await lifecycle.describe(target.workflowId);
          if (state.kind === 'open') {
            onlyObservedNotFound = false;
            const outcome = await stopWorkflowCancelFirst(target.workflowId, lifecycle, graceMs, pollMs, verifyMs);
            outcomes.set(target.workflowId, outcome);
            if (outcome.kind !== 'already-closed') break;
          }
          if (state.kind === 'terminal') {
            onlyObservedNotFound = false;
            if (initialOutcome.kind === 'unverified') outcomes.set(target.workflowId, { kind: 'already-closed' });
          }
          if (state.kind === 'unknown') {
            onlyObservedNotFound = false;
            outcomes.set(target.workflowId, { kind: 'unverified' });
            break;
          }
          if (initialOutcome.kind === 'unverified') outcomes.set(target.workflowId, { kind: 'already-closed' });
        } catch {
          onlyObservedNotFound = false;
          outcomes.set(target.workflowId, { kind: 'unverified' });
          break;
        }

        const remaining = settleDeadline - lifecycle.now();
        if (remaining <= 0) {
          if (onlyObservedNotFound && target.workspace !== undefined && target.preRegistrationFallback === true) {
            preRegistrationWorkspaces.add(target.workspace);
          }
          break;
        }
        try {
          await lifecycle.wait(Math.min(pollMs, remaining));
        } catch {
          outcomes.set(target.workflowId, { kind: 'unverified' });
          break;
        }
      }
    }
  }

  return {
    workflows: targets.map((target) => ({
      target,
      outcome: outcomes.get(target.workflowId) ?? { kind: 'unverified' },
    })),
    containers: containerOutcome,
    preRegistrationWorkspaces: [...preRegistrationWorkspaces],
  };
}

function appendFallback(workspace: string, lifecycle: StopLifecycle = stopLifecycle): void {
  try {
    lifecycle.appendFallback(workspace);
  } catch {
    warn(`scan ${workspace} stopped, but workflow.log could not be marked cancelled.`);
  }
}

function reportContainerFailure(workspace: string | undefined, outcome: ContainerStopOutcome): void {
  const target = workspace === undefined ? '--all' : workspace;
  if (outcome.kind === 'still-running') console.error(`${outcome.remaining} scan worker(s) did not stop.`);
  else console.error('Docker could not verify that every targeted scan worker stopped.');
  console.error(`Retry: ${commandPrefix()} stop ${target}`);
}

function withRecordedWorkflows(containers: readonly RunningScanContainer[]): Map<string, string> {
  const recorded = new Map<string, string>();
  for (const container of containers) {
    if (container.workspace === undefined || recorded.has(container.workspace)) continue;
    const workflowId = resolveWorkflowId(container.workspace);
    if (workflowId !== undefined) recorded.set(container.workspace, workflowId);
  }
  return recorded;
}

function resolveTargetWorkspaces(targets: readonly WorkflowStopTarget[]): readonly WorkflowStopTarget[] {
  return targets.map((target) => {
    if (target.workspace !== undefined) return target;
    const identity = resolveScanIdentity(target.workflowId);
    return identity.kind === 'ok' ? { ...target, workspace: identity.workspace } : target;
  });
}

function unverifiedWorkflowCount(results: readonly WorkflowStopResult[]): number {
  return results.filter((result) => result.outcome.kind === 'unverified').length;
}

function appendVerifiedFallbacks(result: StopExecutionResult): void {
  const workspaces = new Set(result.preRegistrationWorkspaces);
  for (const workflow of result.workflows) {
    if (workflow.outcome.kind === 'forced' && workflow.target.workspace !== undefined) {
      workspaces.add(workflow.target.workspace);
    }
  }
  for (const workspace of workspaces) appendFallback(workspace);
}

function visibleWorkflowsForWorkspace(
  workspace: string,
  containers: readonly RunningScanContainer[],
  pending: PendingWorkflowTargets,
  visible: readonly RunningScanWorkflow[],
): readonly RunningScanWorkflow[] {
  const taskQueues = new Set(containers.flatMap((container) => container.taskQueue ?? []));
  for (const identity of pending.byWorkspace.get(workspace) ?? []) taskQueues.add(identity.task_queue);

  return visible.filter((workflow) => {
    if (taskQueues.has(workflow.taskQueue)) return true;
    const identity = resolveScanIdentity(workflow.workflowId);
    return identity.kind === 'ok' && identity.workspace === workspace;
  });
}

/** Stop one scan while keeping its worker alive long enough to flush a graceful cancellation. */
async function stopSingleScan(workspace: string, yes: boolean): Promise<void> {
  const filter = scanFilter(workspace);
  const containerQuery = runningScanContainersChecked(filter);
  if (containerQuery.kind === 'unavailable') {
    fail(`Could not inspect the scan worker for ${workspace}.`, `Retry: ${commandPrefix()} stop ${workspace}`);
  }
  const containers = containerQuery.value.map((container) => ({ ...container, workspace }));
  const recordedWorkflowId = resolveWorkflowId(workspace);
  const recorded = new Map<string, string>();
  if (recordedWorkflowId !== undefined) recorded.set(workspace, recordedWorkflowId);
  const pending = readPendingTargets([workspace]);
  const discovery = await discoverRunningWorkflows();
  const visible =
    discovery.kind === 'ok' ? visibleWorkflowsForWorkspace(workspace, containers, pending, discovery.workflows) : [];
  const plan = buildWorkflowTargetPlan(containers, recorded, visible, pending.byWorkspace);

  if (containers.length === 0) {
    if (plan.targets.length === 0) {
      if (pending.unreadableCount > 0) {
        fail(
          `The launch records for ${workspace} could not be read safely.`,
          `Retry: ${commandPrefix()} stop ${workspace}`,
        );
      }
      if (discovery.kind === 'unavailable') {
        fail(
          `Could not verify whether scan ${workspace} is still running in Temporal.`,
          `Retry: ${commandPrefix()} stop ${workspace}`,
        );
      }
      fail(`No scan found for workspace: ${workspace}`);
    }

    const onlyRecordedTarget =
      recordedWorkflowId !== undefined &&
      pending.references.length === 0 &&
      pending.unreadableCount === 0 &&
      discovery.kind === 'ok' &&
      plan.targets.every((target) => target.workflowId === recordedWorkflowId);
    if (onlyRecordedTarget) {
      try {
        const state = await describeWorkflowLifecycle(recordedWorkflowId);
        if (state.kind === 'terminal' || state.kind === 'not-found') {
          console.log(`Nothing was running for ${workspace}.`);
          return;
        }
        if (state.kind === 'unknown') {
          fail(
            `Temporal returned an unknown lifecycle state for ${workspace}.`,
            `Retry: ${commandPrefix()} stop ${workspace}`,
          );
        }
      } catch {
        fail(
          `Could not verify whether scan ${workspace} is still running in Temporal.`,
          `Retry: ${commandPrefix()} stop ${workspace}`,
        );
      }
    }
  }

  await confirmOrExit('stop', `Stop the scan "${workspace}"?`, yes);
  const spinner = p.spinner();
  spinner.start(`Stopping scan ${workspace}`);

  const initialResult = await executeStopPlan(plan.targets, containers, filter);
  const visibilitySettle = await stopVisibleWorkflowsUntilSettled(
    initialResult.workflows,
    stopLifecycle,
    VISIBILITY_SETTLE_MS,
    VISIBILITY_MAX_SETTLE_MS,
    async () => {
      const current = await discoverRunningWorkflows();
      return current.kind === 'ok'
        ? {
            kind: 'ok',
            workflows: visibleWorkflowsForWorkspace(workspace, containers, pending, current.workflows),
          }
        : current;
    },
  );
  const result: StopExecutionResult = {
    workflows: visibilitySettle.results,
    containers: initialResult.containers,
    preRegistrationWorkspaces: initialResult.preRegistrationWorkspaces,
  };
  const unverified = unverifiedWorkflowCount(result.workflows);
  const finalPending = readPendingTargets([workspace]);
  const initialPendingKeys = new Set(
    pending.references.map((reference) => `${reference.identity.task_queue}\0${reference.identity.workflow_id}`),
  );
  const newPendingCount = finalPending.references.filter(
    (reference) => !initialPendingKeys.has(`${reference.identity.task_queue}\0${reference.identity.workflow_id}`),
  ).length;
  const unreadablePendingCount = Math.max(pending.unreadableCount, finalPending.unreadableCount);
  const incomplete =
    result.containers.kind !== 'stopped' ||
    plan.containersWithoutVerifiedWorkflowId.length > 0 ||
    discovery.kind === 'unavailable' ||
    visibilitySettle.kind !== 'settled' ||
    unreadablePendingCount > 0 ||
    newPendingCount > 0 ||
    unverified > 0;

  if (incomplete) {
    spinner.error(`Scan ${workspace} shutdown could not be fully verified`);
    if (result.containers.kind !== 'stopped') reportContainerFailure(workspace, result.containers);
    if (unverified > 0) console.error(`Temporal could not confirm closure for ${unverified} workflow(s).`);
    if (discovery.kind === 'unavailable') console.error('Temporal could not enumerate every running scan workflow.');
    if (visibilitySettle.kind === 'unavailable') {
      console.error('Temporal could not complete the final scan workflow check.');
    }
    if (visibilitySettle.kind === 'timed-out') {
      console.error('Temporal workflow discovery did not settle before its deadline.');
    }
    if (unreadablePendingCount > 0) {
      console.error(`${unreadablePendingCount} launch record(s) could not be read safely.`);
    }
    if (newPendingCount > 0) console.error('A new scan launch began while shutdown was running.');
    if (plan.containersWithoutVerifiedWorkflowId.length > 0) {
      console.error('A legacy scan worker could not prove its candidate workflow ID.');
    }
    console.error(`Retry: ${commandPrefix()} stop ${workspace}`);
    process.exit(1);
  }

  appendVerifiedFallbacks(result);
  const clearFailures = clearPendingTargets(pending.references);
  if (clearFailures > 0) {
    spinner.error(`Scan ${workspace} stopped, but its launch record could not be cleared`);
    console.error(`Retry: ${commandPrefix()} stop ${workspace}`);
    process.exit(1);
  }
  spinner.stop(`Stopped scan ${workspace}`);
}

export type WorkflowDiscoveryResult =
  | { readonly kind: 'ok'; readonly workflows: readonly RunningScanWorkflow[] }
  | { readonly kind: 'unavailable' };

async function discoverRunningWorkflows(): Promise<WorkflowDiscoveryResult> {
  try {
    return { kind: 'ok', workflows: await listRunningScanWorkflows() };
  } catch {
    return { kind: 'unavailable' };
  }
}

interface VisibilitySettleResult {
  readonly results: readonly WorkflowStopResult[];
  readonly kind: 'settled' | 'unavailable' | 'timed-out';
}

/** Re-enumerate visibility until no new open workflow appears during a bounded quiet horizon. */
export async function stopVisibleWorkflowsUntilSettled(
  seed: readonly WorkflowStopResult[],
  lifecycle: StopLifecycle = stopLifecycle,
  settleMs: number = VISIBILITY_SETTLE_MS,
  maxSettleMs: number = VISIBILITY_MAX_SETTLE_MS,
  discover: () => Promise<WorkflowDiscoveryResult> = discoverRunningWorkflows,
): Promise<VisibilitySettleResult> {
  const results = new Map(seed.map((result) => [result.target.workflowId, result]));
  const retriedUnverified = new Set<string>();
  const recheckedAlreadyClosed = new Set<string>();
  let quietSince = lifecycle.now();
  const maxDeadline = quietSince + maxSettleMs;

  while (true) {
    const discovery = await discover();
    if (discovery.kind === 'unavailable') return { kind: 'unavailable', results: [...results.values()] };

    const visibleTargets = resolveTargetWorkspaces(
      buildWorkflowTargetPlan([], new Map(), discovery.workflows).targets,
    ).map((target) => {
      const existingWorkspace = results.get(target.workflowId)?.target.workspace;
      return target.workspace === undefined && existingWorkspace !== undefined
        ? { ...target, workspace: existingWorkspace }
        : target;
    });
    const residualTargets = visibleTargets.filter((target) => {
      const current = results.get(target.workflowId);
      if (current === undefined) return true;
      if (current.outcome.kind === 'unverified') return !retriedUnverified.has(target.workflowId);
      return current.outcome.kind === 'already-closed' && !recheckedAlreadyClosed.has(target.workflowId);
    });
    if (residualTargets.length > 0) {
      for (const target of residualTargets) {
        if (results.get(target.workflowId)?.outcome.kind === 'unverified') {
          retriedUnverified.add(target.workflowId);
        }
        if (results.get(target.workflowId)?.outcome.kind === 'already-closed') {
          recheckedAlreadyClosed.add(target.workflowId);
        }
      }
      const outcomes = await stopWorkflowsCancelFirst(
        residualTargets.map((target) => target.workflowId),
        lifecycle,
      );
      for (let index = 0; index < residualTargets.length; index++) {
        const target = residualTargets[index];
        const outcome = outcomes[index];
        if (target !== undefined && outcome !== undefined) results.set(target.workflowId, { target, outcome });
      }
      quietSince = lifecycle.now();
    }

    const now = lifecycle.now();
    if (now - quietSince >= settleMs) return { kind: 'settled', results: [...results.values()] };
    if (now >= maxDeadline) return { kind: 'timed-out', results: [...results.values()] };
    try {
      await lifecycle.wait(Math.min(CANCELLATION_POLL_MS, settleMs - (now - quietSince)));
    } catch {
      return { kind: 'timed-out', results: [...results.values()] };
    }
  }
}

async function stopAllScans(yes: boolean): Promise<void> {
  const containerQuery = runningScanContainersChecked();
  if (containerQuery.kind === 'unavailable') {
    fail('Could not inspect running scan workers.', `Retry: ${commandPrefix()} stop --all`);
  }
  const containers = containerQuery.value;
  let pending = readPendingTargets(listWorkspaces().map((workspace) => workspace.name));
  const initialDiscovery = await discoverRunningWorkflows();
  let visible = initialDiscovery.kind === 'ok' ? initialDiscovery.workflows : [];
  let plan = buildWorkflowTargetPlan(containers, withRecordedWorkflows(containers), visible, pending.byWorkspace);
  let targets = resolveTargetWorkspaces(plan.targets);

  if (containers.length === 0 && targets.length === 0) {
    if (pending.unreadableCount > 0) {
      fail('One or more scan launch records could not be read safely.', `Retry: ${commandPrefix()} stop --all`);
    }
    if (initialDiscovery.kind === 'unavailable') {
      fail('Could not verify whether scan workflows are running in Temporal.', `Retry: ${commandPrefix()} stop --all`);
    }
    const emptySettleDeadline = stopLifecycle.now() + VISIBILITY_MAX_SETTLE_MS;
    while (targets.length === 0) {
      const remaining = emptySettleDeadline - stopLifecycle.now();
      if (remaining <= 0) {
        console.log('No running scans to stop.');
        return;
      }
      await stopLifecycle.wait(Math.min(CANCELLATION_POLL_MS, remaining));
      const confirmation = await discoverRunningWorkflows();
      if (confirmation.kind === 'unavailable') {
        fail(
          'Could not verify whether scan workflows are running in Temporal.',
          `Retry: ${commandPrefix()} stop --all`,
        );
      }
      visible = confirmation.workflows;
      pending = readPendingTargets(listWorkspaces().map((workspace) => workspace.name));
      if (pending.unreadableCount > 0) {
        fail('One or more scan launch records could not be read safely.', `Retry: ${commandPrefix()} stop --all`);
      }
      plan = buildWorkflowTargetPlan(containers, withRecordedWorkflows(containers), visible, pending.byWorkspace);
      targets = resolveTargetWorkspaces(plan.targets);
    }
  }

  await confirmOrExit('stop', 'This will stop all running scans. Continue?', yes);
  const spinner = p.spinner();
  spinner.start('Stopping all scans');

  const initialResult = await executeStopPlan(targets, containers, WORKER_FILTER);
  const visibilitySettle = await stopVisibleWorkflowsUntilSettled(initialResult.workflows);
  const results = visibilitySettle.results;

  const combinedResult: StopExecutionResult = {
    workflows: results,
    containers: initialResult.containers,
    preRegistrationWorkspaces: initialResult.preRegistrationWorkspaces,
  };
  const unverified = unverifiedWorkflowCount(results);
  const finalPending = readPendingTargets(listWorkspaces().map((workspace) => workspace.name));
  const initialPendingKeys = new Set(
    pending.references.map(
      (reference) => `${reference.workspace}\0${reference.identity.task_queue}\0${reference.identity.workflow_id}`,
    ),
  );
  const newPendingCount = finalPending.references.filter(
    (reference) =>
      !initialPendingKeys.has(
        `${reference.workspace}\0${reference.identity.task_queue}\0${reference.identity.workflow_id}`,
      ),
  ).length;
  const unreadablePendingCount = Math.max(pending.unreadableCount, finalPending.unreadableCount);
  const temporalDiscoveryFailed = initialDiscovery.kind === 'unavailable' || visibilitySettle.kind === 'unavailable';
  const temporalDiscoveryTimedOut = visibilitySettle.kind === 'timed-out';
  const incomplete =
    combinedResult.containers.kind !== 'stopped' ||
    plan.containersWithoutVerifiedWorkflowId.length > 0 ||
    temporalDiscoveryFailed ||
    temporalDiscoveryTimedOut ||
    unreadablePendingCount > 0 ||
    newPendingCount > 0 ||
    unverified > 0;

  if (incomplete) {
    spinner.error('Scan shutdown incomplete');
    if (combinedResult.containers.kind !== 'stopped') reportContainerFailure(undefined, combinedResult.containers);
    if (unverified > 0) console.error(`Temporal could not confirm closure for ${unverified} workflow(s).`);
    if (temporalDiscoveryFailed) console.error('Temporal could not enumerate every running scan workflow.');
    if (temporalDiscoveryTimedOut) console.error('Temporal workflow discovery did not settle before its deadline.');
    if (unreadablePendingCount > 0) {
      console.error(`${unreadablePendingCount} launch record(s) could not be read safely.`);
    }
    if (newPendingCount > 0) console.error(`${newPendingCount} scan launch(es) began while shutdown was running.`);
    if (plan.containersWithoutVerifiedWorkflowId.length > 0) {
      console.error(
        `${plan.containersWithoutVerifiedWorkflowId.length} legacy worker(s) could not prove a candidate workflow ID.`,
      );
    }
    console.error(`Retry: ${commandPrefix()} stop --all`);
    process.exit(1);
  }

  appendVerifiedFallbacks(combinedResult);
  const clearFailures = clearPendingTargets(pending.references);
  if (clearFailures > 0) {
    spinner.error('Scans stopped, but one or more launch records could not be cleared');
    console.error(`Retry: ${commandPrefix()} stop --all`);
    process.exit(1);
  }
  const stoppedCount = Math.max(containers.length, results.length);
  spinner.stop(`Stopped ${stoppedCount} scan${stoppedCount === 1 ? '' : 's'}`);
}

/** Resolve the omitted target from Docker without turning a failed query into an empty scan list. */
function resolveStopTarget(): string {
  const result = runningScanContainersChecked();
  if (result.kind === 'unavailable') {
    fail('Could not inspect running scan workers.', `Retry with a workspace: ${commandPrefix()} stop <workspace>`);
  }
  const running = [...new Set(result.value.flatMap((container) => container.workspace ?? []))];
  if (running.length === 1) {
    const workspace = running[0] as string;
    console.error(`No workspace given; stopping running scan "${workspace}".`);
    return workspace;
  }
  if (running.length > 1) {
    failUsage('Multiple scans are running: specify which one, or use --all:', `  ${running.join(', ')}`);
  }
  if (result.value.length > 0) {
    fail('A running scan worker has no workspace label.', `Use ${commandPrefix()} stop --all`);
  }
  fail('No running scans to stop.', 'Pass a workspace name to stop a specific scan.');
}

export async function stop(opts: StopOptions): Promise<void> {
  ensureDocker();
  if (opts.all && opts.workspace) failUsage('Pass a workspace name or --all, not both.');

  const workspace = opts.all ? undefined : (opts.workspace ?? resolveStopTarget());
  if (workspace) await stopSingleScan(workspace, opts.yes);
  else await stopAllScans(opts.yes);
}
