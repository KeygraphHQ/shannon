// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { IdentityWorkflow } from './workflow.js';

export type SourceKind = 'traffic' | 'blackboard' | 'findings' | 'raw';
export interface SourceRef {
  readonly source: SourceKind;
  readonly pointer: string;
  readonly exchangeId?: string;
}
export type InputAvailability = 'available' | 'missing' | 'invalid' | 'not-supplied';
export interface SourceManifest {
  readonly source: SourceKind;
  /** Fixed native basename or the validated native exchange basename; never an embedded path. */
  readonly file: string;
  readonly availability: InputAvailability;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly exchangeId?: string;
}
export interface InputReadDiagnostic {
  readonly code: 'missing-input' | 'invalid-input' | 'input-limit' | 'unsafe-input' | 'read-failed';
  readonly source: SourceRef;
}
export interface ObservationLimits {
  readonly maxNativeBytes: number;
  readonly maxRawBytes: number;
  readonly maxTotalBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxExchanges: number;
  readonly maxRoutes: number;
  readonly maxIdentities: number;
  readonly maxTransitions: number;
  readonly maxRecords: number;
  readonly maxRawFiles: number;
  readonly maxOutputBytes: number;
  readonly timeoutMs: number;
}
export interface RawRecordInput {
  readonly exchangeId: string;
  readonly availability: 'available' | 'missing' | 'invalid';
  readonly document?: unknown;
}
export interface ObservationInput {
  readonly traffic: unknown;
  readonly blackboard: unknown;
  readonly findings?: unknown;
  readonly rawRequested?: boolean;
  readonly rawRecords?: readonly RawRecordInput[];
  readonly sources?: readonly SourceManifest[];
  readonly inputDiagnostics?: readonly InputReadDiagnostic[];
}
export interface ObservationDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly sources: readonly SourceRef[];
}
export interface ObservedIdentity {
  readonly key: string;
  readonly kind: 'named' | 'anonymous' | 'unattributed';
  readonly name: string | null;
  readonly role: string | null;
  /** Saved assertion only; current session and attribution validity remain unassessed. */
  readonly authenticated: boolean | null;
  readonly sources: readonly SourceRef[];
}
export interface RawObservation {
  readonly availability: 'not-supplied' | 'missing' | 'invalid' | 'available';
  readonly association: 'not-assessed' | 'matched' | 'mismatch';
  readonly response: 'unknown' | 'absent' | 'truncated' | 'malformed' | 'usable' | 'conflicting';
  readonly sources: readonly SourceRef[];
}
export interface ObservedExchange {
  readonly exchangeId: string;
  readonly routeSignature: string;
  readonly identityKey: string;
  readonly recordedIdentity: string | null;
  readonly captureSequence: number | null;
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly responseStatus: number | null;
  readonly normalizedResponse: 'usable' | 'unavailable' | 'invalid';
  readonly responseFingerprint: string | null;
  readonly provenance: { readonly taskId: string; readonly actor: string; readonly baseRevision: number };
  readonly raw: RawObservation;
  readonly sources: readonly SourceRef[];
}
export interface ObservedResource {
  readonly resourceId: string;
  readonly ownerIdentity: string | null;
  readonly sources: readonly SourceRef[];
}
export interface RecordedTransition {
  readonly transitionId: string;
  readonly identityKey: string;
  readonly recordedIdentity: string | null;
  readonly fromState: string;
  readonly toState: string;
  readonly triggerExchangeId: string;
  readonly captureSequence: number | null;
  readonly resourceId: string | null;
  readonly sources: readonly SourceRef[];
}
export interface ObservationCounts {
  readonly requests: number;
  readonly usableNormalizedResponses: number;
  readonly unavailableNormalizedResponses: number;
  readonly invalidNormalizedResponses: number;
  readonly rawUsableResponses: number;
  readonly rawAbsentResponses: number;
  readonly rawTruncatedResponses: number;
  readonly rawMalformedResponses: number;
  readonly rawUnknownResponses: number;
}
export interface RouteCell {
  readonly identityKey: string;
  readonly state: 'observed' | 'not-observed';
  readonly counts: ObservationCounts;
  readonly exchangeIds: readonly string[];
  readonly sources: readonly SourceRef[];
}
export interface ObservedRoute {
  readonly routeSignature: string;
  readonly metadata: readonly {
    readonly method: string;
    readonly origin: string;
    readonly path: string;
    readonly sources: readonly SourceRef[];
  }[];
  readonly cells: readonly RouteCell[];
  readonly sources: readonly SourceRef[];
}
export interface RecordedCategoryItem {
  readonly id: string;
  readonly state: string;
  readonly sources: readonly SourceRef[];
}
export interface RecordedFacts {
  readonly runStatus: 'running' | 'complete' | 'incomplete' | 'failed' | 'unknown';
  readonly failureRecorded: boolean | null;
  readonly termination: {
    readonly state: 'recorded' | 'unavailable' | 'invalid';
    readonly code: string | null;
    readonly source: string | null;
    readonly sources: readonly SourceRef[];
  };
  readonly findings: {
    readonly availability: 'known' | 'unavailable';
    readonly count: number | null;
    readonly sources: readonly SourceRef[];
  };
  readonly hypotheses: readonly RecordedCategoryItem[];
  readonly candidates: readonly RecordedCategoryItem[];
  readonly verifications: readonly RecordedCategoryItem[];
  readonly tasks: readonly RecordedCategoryItem[];
  readonly rejectedTasks: readonly RecordedCategoryItem[];
}
export interface ObservationResult {
  readonly schemaVersion: 1;
  readonly kind: 'offline-blackbox-observation';
  readonly status: 'completed' | 'partial' | 'failed';
  readonly limits: ObservationLimits;
  readonly sources: readonly SourceManifest[];
  readonly inputs: {
    readonly traffic: InputAvailability;
    readonly blackboard: InputAvailability;
    readonly findings: InputAvailability;
    readonly rawRequested: boolean;
  };
  readonly scope: {
    readonly basis: 'supplied-saved-records';
    readonly authorization: 'not-assessed';
    readonly sessionValidity: 'not-assessed';
    readonly causality: 'not-established';
    readonly applicationCoverage: 'unknown';
  };
  readonly counts: {
    readonly exchanges: number;
    readonly routes: number;
    readonly identities: number;
    readonly duplicates: number;
    readonly conflicts: number;
    readonly rejectedRecords: number;
  };
  readonly identities: readonly ObservedIdentity[];
  readonly exchanges: readonly ObservedExchange[];
  readonly routes: readonly ObservedRoute[];
  readonly workflows: readonly IdentityWorkflow[];
  readonly recorded: RecordedFacts;
  readonly reasons: readonly ObservationDiagnostic[];
  readonly diagnostics: readonly ObservationDiagnostic[];
}
