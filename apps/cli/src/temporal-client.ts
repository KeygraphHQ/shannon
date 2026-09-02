/**
 * Thin Temporal client for reading scan state and controlling scan workflow lifecycle.
 *
 * A running scan is queried live (getProgress) and read via pendingActivities for
 * the in-flight agents; a closed scan is read once from its result. Everything goes
 * straight to the frontend on 127.0.0.1:7233 — the gRPC port the compose file
 * publishes — so this needs Temporal up, but no worker of its own.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { Client, Connection, WorkflowFailedError, WorkflowNotFoundError } from '@temporalio/client';
import { ACTIVITY_TO_PROGRESS, type PipelineState } from './scan/pipeline.js';

const ADDRESS = '127.0.0.1:7233';
const NAMESPACE = 'default';
const LIFECYCLE_RPC_DEADLINE_MS = 3_000;
const OPEN_SCAN_WORKFLOW_QUERY =
  "WorkflowType = 'pentestPipelineWorkflow' AND (ExecutionStatus = 'Running' OR ExecutionStatus = 'Paused')";

// WorkflowExecutionStatusName values that positively prove this execution has closed.
// PAUSED is open; UNSPECIFIED and UNKNOWN are not safe closure evidence.
const TERMINAL_STATUSES: ReadonlySet<string> = new Set([
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'TERMINATED',
  'CONTINUED_AS_NEW',
  'TIMED_OUT',
]);

export interface RunningAgent {
  readonly agent: string;
  readonly label: string;
  /** 'agent' rows join the static pipeline tree; 'operation' rows feed the background-work phase. */
  readonly kind: 'agent' | 'operation';
  /** Set when a persisted parent stage owns this row; the label then reads as that stage's step. */
  readonly parentKey?: string;
  readonly attempt: number;
  readonly startedAt?: number;
  readonly lastFailure?: string;
}

/**
 * The CLI's activity mirror does not know an activity type the running scan is using, so the
 * progress tree cannot be rendered completely. Distinct from a Temporal connection failure.
 */
export class ActivityMirrorError extends Error {
  override name = 'ActivityMirrorError' as const;

  constructor(activityType: string) {
    super(
      `This version of the Shannon command line does not recognise part of the running scan\n(${activityType}). Update Shannon, or watch the scan with: shannon logs <workspace>`,
    );
  }
}

/** Convert a proto ITimestamp (seconds is a Long) to epoch millis. */
function timestampMs(
  ts: { seconds?: { toString(): string } | number | null; nanos?: number | null } | null,
): number | undefined {
  const seconds = ts?.seconds;
  if (seconds == null) return undefined;
  const secNum = typeof seconds === 'number' ? seconds : Number(seconds.toString());
  return secNum * 1000 + (ts?.nanos ?? 0) / 1e6;
}

export interface ScanDescription {
  /** WorkflowExecutionStatusName: RUNNING | COMPLETED | FAILED | CANCELLED | TERMINATED | TIMED_OUT | … */
  readonly status: string;
  readonly startedAt?: number;
  readonly closedAt?: number;
  readonly runningAgents: readonly RunningAgent[];
}

export type TerminalOutcome =
  | { readonly kind: 'success'; readonly state: PipelineState }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * The authoritative Temporal state used by lifecycle commands. Transport failures deliberately
 * remain errors instead of being represented as a closed workflow: callers must not report a
 * scan stopped unless Temporal has positively confirmed it.
 */
export type WorkflowLifecycleState =
  | { readonly kind: 'open'; readonly status: 'RUNNING' | 'PAUSED' }
  | { readonly kind: 'terminal'; readonly status: string }
  | { readonly kind: 'unknown'; readonly status: string }
  | { readonly kind: 'not-found' };

/** A scan workflow returned by Temporal's eventually consistent open-workflow visibility query. */
export interface RunningScanWorkflow {
  readonly workflowId: string;
  readonly taskQueue: string;
}

let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (!clientPromise) {
    const pending = Connection.connect({ address: ADDRESS, connectTimeout: LIFECYCLE_RPC_DEADLINE_MS }).then(
      (connection) => new Client({ connection, namespace: NAMESPACE }),
    );
    // A rejected connect must not be cached forever: clear the memo so the next call rebuilds
    // instead of replaying the same failure. Scoped to `pending` so a later successful reconnect
    // that replaced the memo is left untouched.
    pending.catch(() => resetClient(pending));
    clientPromise = pending;
  }
  return clientPromise;
}

/**
 * Drop the memoized client so the next {@link getClient} builds a fresh Connection. The underlying
 * gRPC channel can wedge such that every reused call fails identically ("Unexpected error while
 * making gRPC request"), and only a new Connection recovers. Best-effort closes the old channel.
 * When `only` is given, the memo is cleared only if it still holds that exact promise.
 */
function resetClient(only?: Promise<Client>): void {
  if (only !== undefined && clientPromise !== only) return;
  const previous = clientPromise;
  clientPromise = null;
  previous?.then((client) => client.connection.close()).catch(() => {});
}

/** Close the current channel and establish another before a termination retry. */
export async function refreshWorkflowLifecycleConnection(): Promise<void> {
  const previous = clientPromise;
  if (previous !== null) {
    if (clientPromise === previous) clientPromise = null;
    try {
      const client = await previous;
      await client.connection.close();
    } catch {
      // A failed prior connection is already detached. The new connection below is authoritative.
    }
  }
  await getClient();
}

/**
 * Run a bounded lifecycle RPC and discard the connection when Temporal did not positively say
 * that the workflow is absent. A fresh connection is important after a gRPC timeout or transport
 * failure: reusing a wedged channel can turn a recoverable stop into an indefinitely ambiguous one.
 */
async function runLifecycleRpc<T>(operation: (client: Client) => Promise<T>): Promise<T> {
  const pending = getClient();
  try {
    const client = await pending;
    return await client.withDeadline(Date.now() + LIFECYCLE_RPC_DEADLINE_MS, () => operation(client));
  } catch (err) {
    if (!(err instanceof WorkflowNotFoundError)) resetClient(pending);
    throw err;
  }
}

/** Describe a workflow for lifecycle control without reading its progress or pending activities. */
export async function describeWorkflowLifecycle(workflowId: string): Promise<WorkflowLifecycleState> {
  try {
    const desc = await runLifecycleRpc((client) => client.workflow.getHandle(workflowId).describe());
    if (desc.status.name === 'RUNNING' || desc.status.name === 'PAUSED') {
      return { kind: 'open', status: desc.status.name };
    }
    if (TERMINAL_STATUSES.has(desc.status.name)) return { kind: 'terminal', status: desc.status.name };
    return { kind: 'unknown', status: desc.status.name };
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return { kind: 'not-found' };
    throw err;
  }
}

/** Request cooperative cancellation. This confirms request acceptance, not workflow closure. */
export async function requestWorkflowCancellation(workflowId: string): Promise<'requested' | 'not-found'> {
  try {
    await runLifecycleRpc((client) => client.workflow.getHandle(workflowId).cancel());
    return 'requested';
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return 'not-found';
    throw err;
  }
}

/** Request forced termination. This confirms request acceptance, not workflow closure. */
export async function requestWorkflowTermination(
  workflowId: string,
  reason: string,
): Promise<'requested' | 'not-found'> {
  try {
    await runLifecycleRpc((client) => client.workflow.getHandle(workflowId).terminate(reason));
    return 'requested';
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return 'not-found';
    throw err;
  }
}

/** List currently open Shannon scan workflows through Temporal visibility. */
export async function listRunningScanWorkflows(): Promise<readonly RunningScanWorkflow[]> {
  return runLifecycleRpc(async (client) => {
    const workflows: RunningScanWorkflow[] = [];
    for await (const execution of client.workflow.list({ query: OPEN_SCAN_WORKFLOW_QUERY })) {
      // Visibility is eventually consistent. Keep only the open scan rows returned by this page;
      // each discovered workflow is described directly before `stop` accepts its closure.
      if (
        (execution.status.name === 'RUNNING' || execution.status.name === 'PAUSED') &&
        execution.type === 'pentestPipelineWorkflow'
      ) {
        workflows.push({ workflowId: execution.workflowId, taskQueue: execution.taskQueue });
      }
    }
    return workflows;
  });
}

/** Describe a scan: status, timing, and the agents currently running (from pendingActivities). Null if not found. */
export async function describeScan(workflowId: string): Promise<ScanDescription | null> {
  const client = await getClient();
  try {
    const desc = await client.workflow.getHandle(workflowId).describe();

    const runningAgents: RunningAgent[] = [];
    for (const pending of desc.raw.pendingActivities ?? []) {
      const activityType = pending.activityType?.name ?? '';
      const progress = ACTIVITY_TO_PROGRESS[activityType];
      // Fail closed: skipping an unknown activity would render a quietly incomplete tree.
      if (!progress) {
        throw new ActivityMirrorError(activityType || 'unknown activity');
      }
      // Temporal's own failure message is never forwarded verbatim: it can carry raw
      // exception text from inside the activity, which this client has no way to vet
      // before painting it into a terminal. Only its presence is kept; the boolean feeds
      // a fixed sentence downstream (see safeFailureDetail), and the real detail stays
      // one `shannon logs` away.
      // NOTE: the proto decoder writes an absent lastFailure as null, not undefined, so a
      // loose check is what distinguishes a healthy attempt from a failed one.
      const lastFailure = pending.lastFailure == null ? undefined : 'This activity attempt failed.';
      const startedAt = timestampMs(pending.scheduledTime ?? pending.lastStartedTime ?? null);
      runningAgents.push({
        agent: progress.key,
        label: progress.label,
        kind: progress.kind,
        ...(progress.parentKey !== undefined ? { parentKey: progress.parentKey } : {}),
        attempt: pending.attempt ?? 1,
        ...(startedAt !== undefined ? { startedAt } : {}),
        ...(lastFailure ? { lastFailure } : {}),
      });
    }

    return {
      status: desc.status.name,
      runningAgents,
      ...(desc.startTime ? { startedAt: desc.startTime.getTime() } : {}),
      ...(desc.closeTime ? { closedAt: desc.closeTime.getTime() } : {}),
    };
  } catch (err) {
    if (err instanceof WorkflowNotFoundError) return null;
    throw err;
  }
}

/** Live progress of a running scan via the getProgress query. Null if the query can't be served (no worker). */
export async function queryProgress(workflowId: string): Promise<PipelineState | null> {
  const client = await getClient();
  try {
    return await client.workflow.getHandle(workflowId).query<PipelineState>('getProgress');
  } catch {
    // The query needs a live worker; a just-closed scan may have none. Caller falls back to the result.
    return null;
  }
}

/**
 * Deepest message in a Temporal failure's cause chain — the real reason nested under generic
 * wrappers (WorkflowFailedError → ActivityFailure → ApplicationFailure). Covers failed, cancelled,
 * and terminated alike. Mirrors the SDK's `rootCause` (only exported from @temporalio/common).
 */
function rootFailureMessage(err: WorkflowFailedError): string {
  let message = err.message;
  let cause: unknown = err.cause;
  while (cause instanceof Error && cause.message) {
    message = cause.message;
    cause = cause.cause;
  }
  return message;
}

/** How a {@link waitForWorkflowClose} watch ended. */
export type WatchEnd = { readonly reason: 'closed' } | { readonly reason: 'unreachable'; readonly lastError: string };

export interface WatchOptions {
  /** Poll interval in ms (default 3000). */
  readonly pollMs?: number;
  /** Consecutive connection failures before giving up (default 10 → ~30s at the default interval). */
  readonly maxConnectFailures?: number;
  /** Consecutive connection failures before {@link onConnectionTrouble} fires once (default 3). */
  readonly warnAfterFailures?: number;
  /** Abort the watch (the caller stopped for another reason, e.g. Ctrl-C). */
  readonly signal?: AbortSignal;
  /** Called once when contact is first lost, so a live follower's log isn't silent during the outage. */
  readonly onConnectionTrouble?: (lastError: string) => void;
  /** Called once when contact is regained after {@link onConnectionTrouble} fired. */
  readonly onReconnected?: () => void;
}

/**
 * Resolve once the scan is no longer running, using the workflow's Temporal status as the
 * completion signal. Ends on a terminal status, a not-found workflow (closed past retention), or
 * maxConnectFailures consecutive unreachable polls (a scan can't progress while its Temporal is
 * down, so sustained no-contact is a safe stop). Never rejects; connection errors surface via the
 * callbacks and the returned {@link WatchEnd}.
 */
export async function waitForWorkflowClose(workflowId: string, opts: WatchOptions = {}): Promise<WatchEnd> {
  const pollMs = opts.pollMs ?? 3000;
  const maxConnectFailures = opts.maxConnectFailures ?? 10;
  const warnAfterFailures = opts.warnAfterFailures ?? 3;
  const signal = opts.signal;

  let connectFailures = 0;
  let lastError = '';
  let warned = false;

  while (!signal?.aborted) {
    try {
      const client = await getClient();
      const desc = await client.workflow.getHandle(workflowId).describe();
      if (TERMINAL_STATUSES.has(desc.status.name)) {
        return { reason: 'closed' };
      }
      // Reachable and still RUNNING — reset the failure streak and note any recovery.
      if (warned) {
        warned = false;
        opts.onReconnected?.();
      }
      connectFailures = 0;
    } catch (err) {
      if (err instanceof WorkflowNotFoundError) {
        return { reason: 'closed' };
      }
      // Drop the wedged channel so the next poll dials a fresh one; a cached dead channel would
      // otherwise fail every retry identically and never recover.
      resetClient();
      connectFailures++;
      lastError = err instanceof Error ? err.message : String(err);
      if (!warned && connectFailures >= warnAfterFailures) {
        warned = true;
        opts.onConnectionTrouble?.(lastError);
      }
      if (connectFailures >= maxConnectFailures) {
        return { reason: 'unreachable', lastError };
      }
    }

    try {
      await sleep(pollMs, undefined, { signal });
    } catch {
      break; // Aborted mid-wait by the caller.
    }
  }

  return { reason: 'closed' };
}

/** Final state of a closed scan: success carries the full PipelineState, failure carries the message. */
export async function getTerminalOutcome(workflowId: string): Promise<TerminalOutcome> {
  const client = await getClient();
  try {
    const state = (await client.workflow.getHandle(workflowId).result()) as PipelineState;
    return { kind: 'success', state };
  } catch (err) {
    if (err instanceof WorkflowFailedError) {
      return { kind: 'failed', message: rootFailureMessage(err) };
    }
    throw err;
  }
}
