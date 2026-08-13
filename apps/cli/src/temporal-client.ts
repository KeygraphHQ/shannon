/**
 * Thin Temporal client for reading one scan's state.
 *
 * A running scan is queried live (getProgress) and read via pendingActivities for
 * the in-flight agents; a closed scan is read once from its result. Everything goes
 * straight to the frontend on 127.0.0.1:7233 — the gRPC port the compose file
 * publishes — so this needs Temporal up, but no worker of its own.
 */

import { Client, Connection, WorkflowFailedError, WorkflowNotFoundError } from '@temporalio/client';
import { ACTIVITY_TO_AGENT, type PipelineState } from './scan/pipeline.js';

const ADDRESS = '127.0.0.1:7233';
const NAMESPACE = 'default';

export interface RunningAgent {
  readonly agent: string;
  readonly attempt: number;
  readonly startedAt?: number;
  readonly lastFailure?: string;
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

let clientPromise: Promise<Client> | null = null;

function getClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = Connection.connect({ address: ADDRESS }).then(
      (connection) => new Client({ connection, namespace: NAMESPACE }),
    );
  }
  return clientPromise;
}

/** Describe a scan: status, timing, and the agents currently running (from pendingActivities). Null if not found. */
export async function describeScan(workflowId: string): Promise<ScanDescription | null> {
  const client = await getClient();
  try {
    const desc = await client.workflow.getHandle(workflowId).describe();

    const runningAgents: RunningAgent[] = [];
    for (const pending of desc.raw.pendingActivities ?? []) {
      const agent = ACTIVITY_TO_AGENT[pending.activityType?.name ?? ''];
      if (!agent) continue;
      const lastFailure = pending.lastFailure?.message;
      const startedAt = timestampMs(pending.scheduledTime ?? pending.lastStartedTime ?? null);
      runningAgents.push({
        agent,
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

/** Final state of a closed scan: success carries the full PipelineState, failure carries the message. */
export async function getTerminalOutcome(workflowId: string): Promise<TerminalOutcome> {
  const client = await getClient();
  try {
    const state = (await client.workflow.getHandle(workflowId).result()) as PipelineState;
    return { kind: 'success', state };
  } catch (err) {
    if (err instanceof WorkflowFailedError) {
      return { kind: 'failed', message: err.cause?.message ?? err.message };
    }
    throw err;
  }
}
