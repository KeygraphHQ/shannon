/**
 * Machine-readable snapshot of one scan, for `shannon status --json`.
 *
 * A point-in-time view built from the same derivation the human progress tree uses
 * (derive.ts), so the JSON and the rendered tree can never disagree about an agent's
 * state. One invocation is one snapshot — callers that want to track progress poll it.
 */

import type { DerivedPhase } from './derive.js';
import { derivePipeline, isTerminal, scanElapsedMs } from './derive.js';
import type { RenderInput } from './render.js';
import { isBlackboxState } from './pipeline.js';

/** Coarse scan status token, mirroring the human status badge in machine-friendly form. */
export type ScanStatus = 'running' | 'completed' | 'partial' | 'failed' | 'stopped' | 'cancelled' | 'timed_out';

export interface StatusJson {
  readonly workspace: string;
  /** Temporal workflow id backing this scan (differs from workspace on a resume). */
  readonly workflowId?: string;
  /** Coarse outcome: `running` until the scan closes, then its terminal status. */
  readonly status: ScanStatus;
  /** Raw Temporal WorkflowExecutionStatusName, for callers that need the source status. */
  readonly temporalStatus: string;
  /** Wall-clock elapsed ms (live for a running scan, final for a closed one), or null when unknown. */
  readonly elapsedMs: number | null;
  readonly startedAt?: string;
  readonly endedAt?: string;
  /** Failure text when a failed scan left no readable state. */
  readonly failureMessage?: string;
  readonly phases: readonly DerivedPhase[];
  readonly blackbox?: {
    readonly revision: number;
    readonly status: string;
    readonly wave?: number;
    readonly taskCount?: number;
    readonly completedTaskCount?: number;
    readonly findingCount?: number;
    readonly failures?: readonly string[];
  };
}

/** Map the raw Temporal status (and workflow status) onto the coarse machine token. */
function deriveStatus(input: RenderInput): ScanStatus {
  if (!isTerminal(input.temporalStatus)) return 'running';
  if (isBlackboxState(input.state) && input.state.status === 'incomplete') return 'partial';
  if (input.state?.status === 'partial') return 'partial';

  switch (input.temporalStatus) {
    case 'COMPLETED':
      return 'completed';
    case 'TERMINATED':
      return 'stopped';
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled';
    case 'TIMED_OUT':
      return 'timed_out';
    default:
      return 'failed';
  }
}

/** Build the JSON snapshot for a scan at instant `now`. */
export function toStatusJson(input: RenderInput, now: number): StatusJson {
  const elapsedMs = scanElapsedMs(input, now);
  const blackbox = isBlackboxState(input.state)
    ? 'tasks' in input.state
      ? {
          revision: input.state.revision,
          status: input.state.status,
          wave: input.state.wave,
          taskCount: input.state.tasks.length,
          completedTaskCount: input.state.tasks.filter(({ status }) => status === 'completed').length,
        }
      : {
          revision: input.state.revision,
          status: input.state.status,
          findingCount: input.state.findingCount,
          failures: input.state.failures,
        }
    : undefined;

  return {
    workspace: input.workspace,
    ...(input.workflowId !== undefined && { workflowId: input.workflowId }),
    status: deriveStatus(input),
    temporalStatus: input.temporalStatus,
    elapsedMs: elapsedMs ?? null,
    ...(input.startedAt !== undefined && { startedAt: new Date(input.startedAt).toISOString() }),
    ...(input.endedAt !== undefined && { endedAt: new Date(input.endedAt).toISOString() }),
    ...(input.failureMessage !== undefined && { failureMessage: input.failureMessage }),
    phases: blackbox ? [] : derivePipeline(input, now),
    ...(blackbox ? { blackbox } : {}),
  };
}
