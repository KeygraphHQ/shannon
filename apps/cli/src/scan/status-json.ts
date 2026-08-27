/**
 * Machine-readable snapshot of one scan, for `shannon status --json`.
 *
 * A point-in-time view built from the same derivation the human progress tree uses
 * (derive.ts), so the JSON and the rendered tree can never disagree about an agent's
 * state. One invocation is one snapshot — callers that want to track progress poll it.
 */

import type { DerivedPhase } from './derive.js';
import { derivePipeline, isTerminal, scanElapsedMs } from './derive.js';
import type { PartialReasonView } from './pipeline.js';
import type { RenderInput } from './render.js';
import {
  safeAgenticSast,
  safeCliIdentifier,
  safePartialReasons,
  safeTemporalStatus,
  safeTerminalFailure,
} from './safe-fields.js';

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
  /** Ordered durable degradation reasons with safe messages; present only when non-empty. */
  readonly partialReasons?: readonly PartialReasonView[];
  /** Agentic SAST outcome, with the worker's sanitized failure sentence and bounded code. */
  readonly agenticSast?: { readonly status: string; readonly error?: string; readonly errorCode?: string };
  /** False when operational (Capella/reconciliation) spend is known to be incomplete. */
  readonly usageAccountingComplete?: boolean;
  readonly phases: readonly DerivedPhase[];
}

/** Map the raw Temporal status (and workflow status) onto the coarse machine token. */
function deriveStatus(input: RenderInput): ScanStatus {
  if (!isTerminal(input.temporalStatus)) return 'running';
  if (input.state?.status === 'partial') return 'partial';
  if (input.state?.status === 'cancelled') return 'cancelled';

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
  const partialReasons = safePartialReasons(input.state?.partialReasons ?? []);
  const agenticSast = safeAgenticSast(input.state?.agenticSast);
  const usageAccountingComplete = input.state?.summary?.usageAccountingComplete;
  const failureMessage = safeTerminalFailure(input.failureMessage !== undefined);

  return {
    workspace: safeCliIdentifier(input.workspace),
    ...(input.workflowId !== undefined && { workflowId: safeCliIdentifier(input.workflowId) }),
    status: deriveStatus(input),
    temporalStatus: safeTemporalStatus(input.temporalStatus),
    elapsedMs: elapsedMs ?? null,
    ...(input.startedAt !== undefined && { startedAt: new Date(input.startedAt).toISOString() }),
    ...(input.endedAt !== undefined && { endedAt: new Date(input.endedAt).toISOString() }),
    ...(failureMessage !== undefined && { failureMessage }),
    ...(partialReasons.length > 0 && { partialReasons }),
    // Present only when agentic SAST actually ran; a disabled scan omits the key entirely.
    ...(agenticSast !== undefined &&
      agenticSast.status !== 'disabled' && {
        agenticSast: {
          status: agenticSast.status,
          ...(agenticSast.error !== undefined && { error: agenticSast.error }),
          ...(agenticSast.errorCode !== undefined && { errorCode: agenticSast.errorCode }),
        },
      }),
    ...(usageAccountingComplete !== undefined && { usageAccountingComplete }),
    phases: derivePipeline(input, now),
  };
}
