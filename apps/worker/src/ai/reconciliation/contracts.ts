/** Shared contracts for the single-scan reconciliation pipeline. */

import type { ReconciliationClass } from '../../types/reconciliation.js';
import type {
  AuthFinding,
  AuthzFinding,
  InjectionFinding,
  MiscellaneousFinding,
  SsrfFinding,
  XssFinding,
} from '../queue-schemas.js';

/** Which producer emitted an observation. */
export type ScanSource = 'vulnerability_analysis' | 'sast';

/** Internal primary-selection preference. Never exposed to a model or consumer queue. */
export type PrimaryPreference = 'default' | 'preferred';

/** Priority supplied by the SAST bridge. */
export type Priority = 'P1' | 'P2' | 'P3';

/**
 * Authoritative SAST source location copied from validated SARIF.
 *
 * This is the exact file/line/column the static analysis engine pinned its finding to, carried
 * through reconciliation unchanged so a task's reported location always traces back to real
 * evidence rather than something reconstructed or guessed downstream.
 */
export interface SastSourceLocation {
  file: string;
  line: number;
  column: number;
  rule_id: string;
}

// Widen each member of a union so the keys unique to its siblings are typed `never`. This lets one
// evidence value be discriminated by which class's fields it carries, and makes assigning a foreign
// class's field a compile error rather than a silently accepted extra property.
type ExclusiveUnion<T, TAll = T> = T extends unknown
  ? T & Partial<Record<Exclude<TAll extends unknown ? keyof TAll : never, keyof T>, never>>
  : never;

/** Class-specific evidence with the producer-owned `ID` removed. */
export type ClassEvidence = ExclusiveUnion<
  | Omit<InjectionFinding, 'ID'>
  | Omit<XssFinding, 'ID'>
  | Omit<AuthFinding, 'ID'>
  | Omit<AuthzFinding, 'ID'>
  | Omit<SsrfFinding, 'ID'>
  | Omit<MiscellaneousFinding, 'ID'>
>;

// A SAST-origin observation always declares `preferred`. This is the dedupe contract: when
// reconciliation merges a SAST finding with a pentest finding for the same underlying bug, the
// SAST evidence becomes the task's primary record (it carries an exact file/line/rule, while a
// pentest finding does not), and the pentest observation survives only as a merged member.
export interface SastProducerFields {
  producer_id: string;
  scan_source: 'sast';
  primary_preference: 'preferred';
  priority: Priority;
  sast_source_location: SastSourceLocation;
}

// Pentest-origin observations always declare `default`, the losing side of the preference above.
export interface VulnAnalysisProducerFields {
  producer_id: string;
  scan_source: 'vulnerability_analysis';
  primary_preference: 'default';
}

export type ProducerFields = SastProducerFields | VulnAnalysisProducerFields;

// Once a group is collapsed into a task the primary is already chosen, so `primary_preference`
// has done its job and is dropped. It must not survive into materialized tasks or published output.
export type MaterializedProducerFields =
  | Omit<SastProducerFields, 'primary_preference'>
  | Omit<VulnAnalysisProducerFields, 'primary_preference'>;

/** One current observation before task formation. */
export type ReconciliationObservation<E extends ClassEvidence = ClassEvidence> = E & ProducerFields;

/** One non-primary observation retained under a materialized task. */
export type MergedObservation<E extends ClassEvidence = ClassEvidence> = E & MaterializedProducerFields;

/** One stable exploitation task before publication removes internal producer fields. */
export type ReconciliationTask<E extends ClassEvidence = ClassEvidence> = E &
  MaterializedProducerFields & {
    ID: string;
    merged_from?: MergedObservation<E>[];
  };

/** The exact OSS intermediate artifact vocabulary, in stage order. */
export type ArtifactKind = 'producer-observations' | 'supplemental-observations' | 'task-formation' | 'fixed-tasks';

// One entry in an artifact's lineage: which prior-stage artifact (by kind and exact content
// digest) it was built from. A later stage checks these digests against the refs it was actually
// handed, so it can refuse to proceed if its inputs were regenerated or swapped out from under it.
export interface ArtifactInputDigest {
  artifactKind: ArtifactKind;
  sha256: string;
}

/** Safe content-addressed metadata carried through Temporal history. */
export interface ArtifactRef<TKind extends ArtifactKind = ArtifactKind> {
  path: string;
  artifactKind: TKind;
  vulnerabilityClass: ReconciliationClass;
  schemaVersion: 1;
  sha256: string;
  inputs: ArtifactInputDigest[];
  counts: Record<string, number>;
}

/** Exact durable output set for one class publication. */
export interface PublicationContract {
  publicationKind: 'class-reconciliation';
  schemaVersion: 1;
  manifestPath: string;
  requiredOutputPaths: readonly string[];
}

/** History-safe aggregate metrics for one reconciled class. */
export interface ReconciliationMetrics {
  alreadyPublished: boolean;
  durationMs: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  modelCalls: number;
}
