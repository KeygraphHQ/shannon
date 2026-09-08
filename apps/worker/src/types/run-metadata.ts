// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

export type RunTerminationReason =
  | 'completed'
  | 'limit_reached'
  | 'uncertain_execution'
  | 'prerequisite_failed'
  | 'verification_state_missing'
  | 'component_error'
  | 'interrupted'
  | 'execution_error'
  | 'unknown';

export interface RunCodeIdentity {
  readonly revision: string | null;
  readonly dirty: boolean | null;
  /** Digest of the installed worker JavaScript; excludes dependencies and prompts. */
  readonly sha256: string | null;
}

export interface RunAttempt {
  readonly attemptId: string;
  readonly workflowId: string;
  readonly resumedFromAttemptId: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly code: RunCodeIdentity;
  readonly configuredModel: string | null;
  readonly termination: {
    readonly code: RunTerminationReason;
    readonly source: 'workflow' | 'temporal' | 'worker';
  } | null;
}

export interface RunMetadata {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly historyComplete: boolean;
  readonly currentAttemptId: string;
  /** Attempt that finalized the assessment; later publication repair does not replace it. */
  readonly resultAttemptId: string | null;
  readonly attempts: readonly RunAttempt[];
}

export interface RecordedRunTermination {
  readonly reason: RunTerminationReason;
  /** Time the workflow selected finalization, recorded before the activity is dispatched. */
  readonly endedAt: string;
}
