/** Type-only wire and artifact-body contracts for reconciliation stages. */

import type { SarifRef } from '../sast/types.js';
import type {
  ArtifactRef,
  ClassEvidence,
  Priority,
  ReconciliationObservation,
  ReconciliationTask,
  SastSourceLocation,
  ScanSource,
} from './contracts.js';

// "Positive" projection means this type is built by copying named fields in, never by taking the
// full observation and deleting fields out. A field that is not explicitly listed here (including
// `producer_id` and every other internal key) cannot appear on this type at all, so a future field
// added to `ReconciliationObservation` is model-invisible by default instead of leaking by default.
/** Positive model projection of one observation. */
export type ObservationView<E extends ClassEvidence = ClassEvidence> = E & {
  scan_source: ScanSource;
  priority?: Priority;
  sast_source_location?: SastSourceLocation;
};

export interface TaskFormationInput {
  queued_findings: Array<{ label: string; entry: ObservationView }>;
}

export interface TaskFormationOutput {
  groups: Array<{ queue_labels: string[]; reasoning: string }>;
}

// Identifies the exact committed producer queue a reconciliation run was prepared against. Publish
// re-reads this queue at commit time and compares both the Git blob SHA and the content digest, so
// a queue that changed in HEAD between preparation and commit is caught rather than silently
// published against stale tasks.
export interface ProducerQueueIdentity {
  path: string;
  blob_sha: string;
  digest: string;
}

export interface ProducerObservationsBody {
  observations: ReconciliationObservation[];
  producer_queue: ProducerQueueIdentity;
}

/** Optional adapter-facing provenance row. Standalone enrichment emits no rows. */
export interface SupplementalProvenanceRecord {
  producer_id: string;
  repository_id?: string;
  scan_run_id?: string;
  rule_id: string;
  file: string;
  line: number;
  column: number;
}

// Counts only, never identities: this is telemetry surfaced to the scan log, not a channel that
// carries any producer ID or SARIF content forward. See `dropped_findings` on the body below for
// the one place a dropped finding's identity is actually retained.
export interface SupplementalDropCounts {
  unknown_cwe: number;
  other_category: number;
  malformed: number;
  orphaned: number;
  duplicate_sast_id: number;
  enrichment_dropped: number;
}

/**
 * Identity of one finding that was sent for enrichment but never paired back.
 *
 * Recovered from the sent side, so it is always complete: a malformed response may
 * carry no usable `sastId`, which is precisely what makes it malformed.
 */
export interface SupplementalDroppedFinding {
  producer_id: string;
  sast_id: number;
  sast_source_location: SastSourceLocation;
}

export interface SupplementalObservationsBody {
  observations: ReconciliationObservation[];
  provenance: SupplementalProvenanceRecord[];
  sarif?: SarifRef;
  drops: SupplementalDropCounts;
  // Sibling of `drops`, never a member of it: `drops` is spread into the artifact envelope's
  // numeric `counts` map, which rejects any non-integer value.
  dropped_findings: SupplementalDroppedFinding[];
}

export interface AcceptedTaskGroup {
  producer_ids: string[];
  reasoning: string;
}

// `model_ran` is false for both the "fewer than two observations" skip and any future zero-request
// path; it lets a reader of this artifact tell a genuine empty result apart from a model call that
// simply produced no groups.
export interface TaskFormationBody {
  model_ran: boolean;
  groups: AcceptedTaskGroup[];
  rejected_group_count: number;
  dropped_unknown_label_count: number;
}

// `observation_to_task` is the complete forward index from every observation's producer ID to the
// task it was materialized into (whether as primary or as a merged member). Publication uses it to
// prove every observation was placed exactly once before anything is written.
export interface FixedTasksBody {
  tasks: ReconciliationTask[];
  observation_to_task: Record<string, string>;
}

export interface ArtifactBodyMap {
  'producer-observations': ProducerObservationsBody;
  'supplemental-observations': SupplementalObservationsBody;
  'task-formation': TaskFormationBody;
  'fixed-tasks': FixedTasksBody;
}

export interface PrepareAlreadyPublished {
  outcome: 'already_published';
  manifestSha256: string;
}

export interface PreparePending {
  outcome: 'pending';
  ref: ArtifactRef<'producer-observations'>;
}

export type PrepareResult = PrepareAlreadyPublished | PreparePending;

export interface StageMetrics {
  costUsd: number;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface EnrichSuccess {
  ref: ArtifactRef<'supplemental-observations'>;
  metrics: StageMetrics;
}

export interface FormSuccess {
  ref: ArtifactRef<'task-formation'>;
  metrics: StageMetrics;
}

// Sentinel result of task formation when the model stage exhausted its retries on an eligible
// failure. Materialization treats it as an instruction to skip grouping and give every observation
// its own task, so a reconciliation still completes without any formation artifact.
export const SINGLETON_FALLBACK = 'singleton_fallback' as const;
export type FormResult = FormSuccess | typeof SINGLETON_FALLBACK;

export interface MaterializeResult {
  ref: ArtifactRef<'fixed-tasks'>;
}
