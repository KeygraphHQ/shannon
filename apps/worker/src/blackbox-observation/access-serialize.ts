// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { accessComparisonLimits } from './access-limits.js';
import { renderAccessComparisonMarkdown } from './access-render.js';
import type {
  AccessComparison,
  AccessComparisonGroup,
  AccessComparisonLimits,
  AccessComparisonResult,
  AccessIdentityValues,
  RecordedOwnerContext,
} from './access-types.js';
import type { ObservationDiagnostic, ObservedIdentity, SourceManifest, SourceRef } from './types.js';

const OUTPUT_ERROR = 'Comparison output exceeds the enforced limit.';

export interface AccessComparisonReport {
  readonly result: AccessComparisonResult;
  readonly json: string;
  readonly markdown: string;
}

export class AccessComparisonOutputError extends Error {}

function projectLimits(value: AccessComparisonLimits): AccessComparisonLimits {
  return {
    maxNativeBytes: value.maxNativeBytes,
    maxRawBytes: value.maxRawBytes,
    maxTotalBytes: value.maxTotalBytes,
    maxDepth: value.maxDepth,
    maxNodes: value.maxNodes,
    maxExchanges: value.maxExchanges,
    maxRoutes: value.maxRoutes,
    maxIdentities: value.maxIdentities,
    maxTransitions: value.maxTransitions,
    maxRecords: value.maxRecords,
    maxRawFiles: value.maxRawFiles,
    maxOutputBytes: value.maxOutputBytes,
    timeoutMs: value.timeoutMs,
    maxComparisons: value.maxComparisons,
    maxSourcesPerComparison: value.maxSourcesPerComparison,
  };
}

function revalidateLimits(value: AccessComparisonLimits): AccessComparisonLimits {
  return projectLimits(accessComparisonLimits(value));
}

function projectSourceRef(value: SourceRef): SourceRef {
  return {
    source: value.source,
    pointer: value.pointer,
    ...(value.exchangeId === undefined ? {} : { exchangeId: value.exchangeId }),
  };
}

function projectSourceManifest(value: SourceManifest): SourceManifest {
  return {
    source: value.source,
    file: value.file,
    availability: value.availability,
    sha256: value.sha256,
    bytes: value.bytes,
    ...(value.exchangeId === undefined ? {} : { exchangeId: value.exchangeId }),
  };
}

function projectIdentity(value: ObservedIdentity): ObservedIdentity {
  return {
    key: value.key,
    kind: value.kind,
    name: value.name,
    role: value.role,
    authenticated: value.authenticated,
    sources: value.sources.map(projectSourceRef),
  };
}

function projectIdentityValues(value: AccessIdentityValues): AccessIdentityValues {
  return {
    identityKey: value.identityKey,
    state: value.state,
    records: value.records,
    usableResponses: value.usableResponses,
    unavailableResponses: value.unavailableResponses,
    associatedRawRequests: value.associatedRawRequests,
    usableRawResponses: value.usableRawResponses,
    unavailableRawResponses: value.unavailableRawResponses,
    statusValues: [...value.statusValues],
    fullResponseFingerprints: [...value.fullResponseFingerprints],
    variable: value.variable,
    sources: value.sources.map(projectSourceRef),
  };
}

function projectGroup(value: AccessComparisonGroup): AccessComparisonGroup {
  return {
    groupId: value.groupId,
    routeSignature: value.routeSignature,
    method: value.method,
    origin: value.origin,
    path: value.path,
    identityCells: value.identityCells.map(projectIdentityValues),
    sources: value.sources.map(projectSourceRef),
  };
}

function projectOwnerContext(value: RecordedOwnerContext): RecordedOwnerContext {
  return {
    resourceId: value.resourceId,
    recordedOwnerIdentity: value.recordedOwnerIdentity,
    linkedExchangeIds: [...value.linkedExchangeIds],
    sources: value.sources.map(projectSourceRef),
  };
}

function projectComparison(value: AccessComparison): AccessComparison {
  return {
    comparisonId: value.comparisonId,
    groupId: value.groupId,
    identityKeys: [value.identityKeys[0], value.identityKeys[1]],
    basis: value.basis,
    evidenceStrength: value.evidenceStrength,
    requestClass: value.requestClass,
    eligibility: value.eligibility,
    completeness: value.completeness,
    statusRelation: value.statusRelation,
    fingerprintRelation: value.fingerprintRelation,
    bodyRelation: value.bodyRelation,
    contentTypeRelation: value.contentTypeRelation,
    identityValues: [projectIdentityValues(value.identityValues[0]), projectIdentityValues(value.identityValues[1])],
    signals: [...value.signals],
    unknowns: [...value.unknowns],
    recordedOwnerContext: value.recordedOwnerContext.map(projectOwnerContext),
    sources: value.sources.map(projectSourceRef),
  };
}

function projectDiagnostic(value: ObservationDiagnostic): ObservationDiagnostic {
  return {
    code: value.code,
    message: value.message,
    sources: value.sources.map(projectSourceRef),
  };
}

function canonicalResult(value: AccessComparisonResult, limits: AccessComparisonLimits): AccessComparisonResult {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    status: value.status,
    limits,
    sources: value.sources.map(projectSourceManifest),
    scope: {
      basis: value.scope.basis,
      authorization: value.scope.authorization,
      sessionValidity: value.scope.sessionValidity,
      expectedPolicy: value.scope.expectedPolicy,
      semanticEquivalence: value.scope.semanticEquivalence,
      applicationCoverage: value.scope.applicationCoverage,
    },
    counts: {
      groups: value.counts.groups,
      comparisons: value.counts.comparisons,
      recordedComparisons: value.counts.recordedComparisons,
      strongComparisons: value.counts.strongComparisons,
      insufficientComparisons: value.counts.insufficientComparisons,
    },
    identities: value.identities.map(projectIdentity),
    groups: value.groups.map(projectGroup),
    comparisons: value.comparisons.map(projectComparison),
    diagnostics: value.diagnostics.map(projectDiagnostic),
  };
}

/** Canonicalize and independently bound both public comparison artifacts. */
export function serializeAccessComparison(result: AccessComparisonResult): AccessComparisonReport {
  const limits = revalidateLimits(result.limits);
  const canonical = canonicalResult(result, limits);
  const json = `${JSON.stringify(canonical, null, 2)}\n`;
  if (Buffer.byteLength(json) > limits.maxOutputBytes) throw new AccessComparisonOutputError(OUTPUT_ERROR);
  const markdown = renderAccessComparisonMarkdown(canonical);
  if (Buffer.byteLength(markdown) > limits.maxOutputBytes) throw new AccessComparisonOutputError(OUTPUT_ERROR);
  return { result: canonical, json, markdown };
}
