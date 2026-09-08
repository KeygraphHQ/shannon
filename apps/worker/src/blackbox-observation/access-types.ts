// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { ObservationDiagnostic, ObservationLimits, ObservedIdentity, SourceManifest, SourceRef } from './types.js';

export type ValueRelation = 'same' | 'different' | 'overlapping-variable' | 'unavailable';
export type EvidenceCompleteness = 'complete' | 'partial' | 'unavailable';
export type ComparisonBasis = 'recorded-route-metadata' | 'exact-saved-target-body';
export type ComparisonEligibility = 'eligible' | 'ineligible';
export type EvidenceStrength =
  | 'recorded-route-metadata'
  | 'exact-saved-target-body-request-only'
  | 'exact-saved-target-body-with-response-evidence';
export type TriageSignal =
  | 'recorded-response-equivalence'
  | 'recorded-response-difference'
  | 'within-identity-variability'
  | 'insufficient-evidence';
export type AccessComparisonUnknown =
  | 'recorded-status-unavailable'
  | 'recorded-fingerprint-unavailable'
  | 'raw-request-not-supplied'
  | 'raw-request-unavailable'
  | 'shared-raw-source'
  | 'raw-response-unavailable'
  | 'captured-body-unavailable'
  | 'content-type-unavailable'
  | 'saved-body-framing-unknown'
  | 'recorded-owner-authenticity-unassessed';

export interface AccessComparisonLimits extends ObservationLimits {
  readonly maxComparisons: number;
  readonly maxSourcesPerComparison: number;
}

export interface AccessIdentityValues {
  readonly identityKey: string;
  readonly state: 'observed' | 'not-observed';
  readonly records: number;
  readonly usableResponses: number;
  readonly unavailableResponses: number;
  readonly associatedRawRequests: number;
  readonly usableRawResponses: number;
  readonly unavailableRawResponses: number;
  readonly statusValues: readonly number[];
  readonly fullResponseFingerprints: readonly string[];
  readonly variable: boolean;
  readonly sources: readonly SourceRef[];
}

export interface AccessComparisonGroup {
  readonly groupId: string;
  readonly routeSignature: string;
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly identityCells: readonly AccessIdentityValues[];
  readonly sources: readonly SourceRef[];
}

export interface RecordedOwnerContext {
  readonly resourceId: string;
  readonly recordedOwnerIdentity: string;
  readonly linkedExchangeIds: readonly string[];
  readonly sources: readonly SourceRef[];
}

export interface AccessComparison {
  readonly comparisonId: string;
  readonly groupId: string;
  readonly identityKeys: readonly [string, string];
  readonly basis: ComparisonBasis;
  readonly evidenceStrength: EvidenceStrength;
  readonly requestClass: string | null;
  readonly eligibility: ComparisonEligibility;
  readonly completeness: EvidenceCompleteness;
  readonly statusRelation: ValueRelation;
  readonly fingerprintRelation: ValueRelation;
  readonly bodyRelation: ValueRelation;
  readonly contentTypeRelation: ValueRelation;
  readonly identityValues: readonly [AccessIdentityValues, AccessIdentityValues];
  readonly signals: readonly TriageSignal[];
  readonly unknowns: readonly AccessComparisonUnknown[];
  readonly recordedOwnerContext: readonly RecordedOwnerContext[];
  readonly sources: readonly SourceRef[];
}

export interface AccessComparisonResult {
  readonly schemaVersion: 1;
  readonly kind: 'offline-blackbox-cross-identity-triage';
  readonly status: 'completed' | 'partial' | 'failed';
  readonly limits: AccessComparisonLimits;
  readonly sources: readonly SourceManifest[];
  readonly scope: {
    readonly basis: 'supplied-saved-records';
    readonly authorization: 'not-assessed';
    readonly sessionValidity: 'not-assessed';
    readonly expectedPolicy: 'unknown';
    readonly semanticEquivalence: 'not-established';
    readonly applicationCoverage: 'unknown';
  };
  readonly counts: {
    readonly groups: number;
    readonly comparisons: number;
    readonly recordedComparisons: number;
    readonly strongComparisons: number;
    readonly insufficientComparisons: number;
  };
  readonly identities: readonly ObservedIdentity[];
  readonly groups: readonly AccessComparisonGroup[];
  readonly comparisons: readonly AccessComparison[];
  readonly diagnostics: readonly ObservationDiagnostic[];
}
