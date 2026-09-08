// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { serializeAccessComparison } from './access-serialize.js';
import type { AccessComparison, AccessComparisonResult } from './access-types.js';
import type { SourceManifest } from './types.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const COMPARISON_ID = /^comparison-[0-9]{6}$/u;
const REQUEST_CLASS = /^request-class-[0-9]{4}$/u;
const ROUTE_SIGNATURE = /^[A-Za-z0-9][A-Za-z0-9._/:-]{0,127}$/u;
const ROUTE_PATH_PREFIX = /^\/(?:[A-Za-z][A-Za-z0-9._~-]{0,63}(?:\/[A-Za-z][A-Za-z0-9._~-]{0,63})?)?$/u;

/** Match a normalized URL path at a segment boundary under the digest-bound selector prefix. */
export function accessValidationPathMatchesPrefix(candidatePath: string, routePathPrefix: string): boolean {
  if (!ROUTE_PATH_PREFIX.test(routePathPrefix) || !candidatePath.startsWith('/')) return false;
  return (
    routePathPrefix === '/' || candidatePath === routePathPrefix || candidatePath.startsWith(`${routePathPrefix}/`)
  );
}

export type AccessValidationErrorCode =
  | 'invalid-selection'
  | 'comparison-mismatch'
  | 'corpus-mismatch'
  | 'scope-mismatch'
  | 'unsupported-selection';

export class AccessValidationError extends Error {
  constructor(readonly code: AccessValidationErrorCode = 'invalid-selection') {
    super('Black-box access validation selection is invalid.');
    this.name = 'AccessValidationError';
  }
}

export interface AccessValidationSelection {
  readonly schemaVersion: 1;
  readonly kind: 'blackbox-cross-identity-validation-selection';
  readonly comparisonSha256: string;
  readonly sourceManifestSha256: string;
  readonly comparisonId: string;
  readonly victimIdentityKey: string;
  readonly attackerIdentityKey: string;
}

/** Raw-free selector passed from offline validation into the live workflow. */
export interface ResolvedAccessValidation {
  readonly schemaVersion: 1;
  readonly kind: 'blackbox-cross-identity-validation';
  readonly comparisonSha256: string;
  readonly sourceManifestSha256: string;
  readonly selectionDigest: string;
  readonly comparisonId: string;
  readonly routeSignature: string;
  readonly method: 'GET';
  readonly origin: string;
  readonly routePathPrefix: string;
  readonly requestClass: string;
  readonly recordedRole: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string;
}

function invalid(code: AccessValidationErrorCode = 'invalid-selection'): never {
  throw new AccessValidationError(code);
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every((key) => expected.includes(key));
}

function namedIdentityValue(value: string): string | undefined {
  if (!value.startsWith('named:')) return undefined;
  const name = value.slice('named:'.length);
  if (name.length === 0 || name.length > 128 || name.includes(':')) return undefined;
  for (let index = 0; index < name.length; index += 1) {
    const code = name.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return undefined;
  }
  return name;
}

function canonicalSelection(selection: AccessValidationSelection): AccessValidationSelection {
  return {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation-selection',
    comparisonSha256: selection.comparisonSha256,
    sourceManifestSha256: selection.sourceManifestSha256,
    comparisonId: selection.comparisonId,
    victimIdentityKey: selection.victimIdentityKey,
    attackerIdentityKey: selection.attackerIdentityKey,
  };
}

type ResolvedAccessValidationPayload = Omit<ResolvedAccessValidation, 'selectionDigest'>;

function canonicalResolvedPayload(
  value: ResolvedAccessValidationPayload | ResolvedAccessValidation,
): ResolvedAccessValidationPayload {
  return {
    schemaVersion: value.schemaVersion,
    kind: value.kind,
    comparisonSha256: value.comparisonSha256,
    sourceManifestSha256: value.sourceManifestSha256,
    comparisonId: value.comparisonId,
    routeSignature: value.routeSignature,
    method: value.method,
    origin: value.origin,
    routePathPrefix: value.routePathPrefix,
    requestClass: value.requestClass,
    recordedRole: value.recordedRole,
    victimIdentity: value.victimIdentity,
    attackerIdentity: value.attackerIdentity,
  };
}

function resolvedSelectionDigest(value: ResolvedAccessValidationPayload | ResolvedAccessValidation): string {
  return digest(JSON.stringify(canonicalResolvedPayload(value)));
}

export function parseAccessValidationSelection(value: unknown): AccessValidationSelection {
  if (
    !record(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'kind',
      'comparisonSha256',
      'sourceManifestSha256',
      'comparisonId',
      'victimIdentityKey',
      'attackerIdentityKey',
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'blackbox-cross-identity-validation-selection' ||
    typeof value.comparisonSha256 !== 'string' ||
    !SHA256.test(value.comparisonSha256) ||
    typeof value.sourceManifestSha256 !== 'string' ||
    !SHA256.test(value.sourceManifestSha256) ||
    typeof value.comparisonId !== 'string' ||
    !COMPARISON_ID.test(value.comparisonId) ||
    typeof value.victimIdentityKey !== 'string' ||
    namedIdentityValue(value.victimIdentityKey) === undefined ||
    typeof value.attackerIdentityKey !== 'string' ||
    namedIdentityValue(value.attackerIdentityKey) === undefined ||
    value.victimIdentityKey === value.attackerIdentityKey
  ) {
    return invalid();
  }
  return canonicalSelection(value as unknown as AccessValidationSelection);
}

function canonicalManifest(sources: readonly SourceManifest[]): string {
  const rows = sources
    .map((source) => [
      source.source,
      source.exchangeId ?? null,
      source.file,
      source.availability,
      source.sha256,
      source.bytes,
    ])
    .sort((left, right) => {
      const leftJson = JSON.stringify(left);
      const rightJson = JSON.stringify(right);
      return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
    });
  return JSON.stringify(rows);
}

function canonicalReport(result: AccessComparisonResult): ReturnType<typeof serializeAccessComparison> {
  try {
    return serializeAccessComparison(result);
  } catch {
    return invalid();
  }
}

/** Digest of the canonical public comparison JSON, including its trailing line feed. */
export function accessValidationComparisonDigest(result: AccessComparisonResult): string {
  return digest(canonicalReport(result).json);
}

/** Digest binding the fixed source manifest independently of comparison ordering. */
export function accessValidationSourceManifestDigest(sources: readonly SourceManifest[]): string {
  return digest(canonicalManifest(sources));
}

/** Digest binding every normalized selector field and both immutable corpus digests. */
export function accessValidationSelectionDigest(selection: ResolvedAccessValidation): string {
  return resolvedSelectionDigest(selection);
}

/** Build the digest before attaching it to a normalized selector. */
export function accessValidationResolvedDigest(payload: Omit<ResolvedAccessValidation, 'selectionDigest'>): string {
  return resolvedSelectionDigest(payload);
}

interface OrientedComparison {
  readonly comparison: AccessComparison;
  readonly routeSignature: string;
  readonly method: 'GET';
  readonly origin: string;
  readonly path: string;
  readonly requestClass: string;
  readonly recordedRole: string;
  readonly victimIdentityKey: string;
  readonly attackerIdentityKey: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string;
}

function namedIdentity(key: string): string {
  const name = namedIdentityValue(key);
  if (name === undefined) return invalid('unsupported-selection');
  return name;
}

function safeRoutePathPrefix(
  sourcePath: string,
  victimIdentity: string,
  attackerIdentity: string,
  resourceId: string,
): string {
  const segments = sourcePath.split('/').filter(Boolean);
  const maximum = segments.length > 1 ? Math.min(2, segments.length - 1) : 1;
  const privateValues = new Set([victimIdentity, attackerIdentity, resourceId].map((value) => value.toLowerCase()));
  const safe: string[] = [];
  for (const segment of segments.slice(0, maximum)) {
    if (!/^[A-Za-z][A-Za-z0-9._~-]{0,63}$/u.test(segment) || privateValues.has(segment.toLowerCase())) break;
    safe.push(segment);
  }
  return safe.length === 0 ? '/' : `/${safe.join('/')}`;
}

function availableRawExchangeIds(
  comparison: AccessComparison,
  identityKey: string,
  sources: readonly SourceManifest[],
): Set<string> {
  const index = comparison.identityKeys.indexOf(identityKey);
  const values = index < 0 ? undefined : comparison.identityValues[index];
  if (
    !values ||
    values.identityKey !== identityKey ||
    values.state !== 'observed' ||
    values.records < 1 ||
    values.usableResponses !== values.records ||
    values.unavailableRawResponses !== 0 ||
    values.unavailableResponses !== 0 ||
    values.associatedRawRequests !== values.records ||
    values.usableRawResponses !== values.records
  ) {
    return invalid('unsupported-selection');
  }
  const ids = new Set(
    values.sources.flatMap((source) => (source.source === 'raw' && source.exchangeId ? [source.exchangeId] : [])),
  );
  if (ids.size !== values.records) return invalid('unsupported-selection');
  for (const exchangeId of ids) {
    const manifests = sources.filter((source) => source.source === 'raw' && source.exchangeId === exchangeId);
    const manifest = manifests.length === 1 ? manifests[0] : undefined;
    if (
      !manifest ||
      manifest.availability !== 'available' ||
      typeof manifest.sha256 !== 'string' ||
      !SHA256.test(manifest.sha256) ||
      typeof manifest.bytes !== 'number' ||
      !Number.isSafeInteger(manifest.bytes) ||
      manifest.bytes < 0
    ) {
      return invalid('unsupported-selection');
    }
  }
  return ids;
}

function orientComparison(result: AccessComparisonResult, comparisonId: string): OrientedComparison {
  if (result.status !== 'completed') return invalid('unsupported-selection');
  const matches = result.comparisons.filter((candidate) => candidate.comparisonId === comparisonId);
  const comparison = matches.length === 1 ? matches[0] : undefined;
  if (
    !comparison ||
    comparison.basis !== 'exact-saved-target-body' ||
    comparison.evidenceStrength !== 'exact-saved-target-body-with-response-evidence' ||
    comparison.eligibility !== 'eligible' ||
    comparison.completeness !== 'complete' ||
    typeof comparison.requestClass !== 'string' ||
    !REQUEST_CLASS.test(comparison.requestClass) ||
    comparison.identityKeys.length !== 2 ||
    comparison.identityKeys[0] === comparison.identityKeys[1] ||
    comparison.identityValues.length !== 2 ||
    comparison.signals.includes('insufficient-evidence') ||
    [
      comparison.statusRelation,
      comparison.fingerprintRelation,
      comparison.bodyRelation,
      comparison.contentTypeRelation,
    ].includes('unavailable') ||
    comparison.unknowns.some((unknown) => unknown !== 'recorded-owner-authenticity-unassessed')
  ) {
    return invalid('unsupported-selection');
  }

  const identityNames = new Map(comparison.identityKeys.map((key) => [key, namedIdentity(key)]));
  const identityRecords = comparison.identityKeys.map((key) => {
    const matches = result.identities.filter((identity) => identity.key === key);
    return matches.length === 1 ? matches[0] : undefined;
  });
  const recordedRole = identityRecords[0]?.role;
  if (
    identityRecords.some(
      (identity) =>
        !identity ||
        identity.kind !== 'named' ||
        identity.authenticated !== true ||
        identity.name !== identityNames.get(identity.key) ||
        typeof identity.role !== 'string' ||
        identity.role.length === 0,
    ) ||
    recordedRole !== identityRecords[1]?.role
  ) {
    return invalid('unsupported-selection');
  }

  for (const key of comparison.identityKeys) availableRawExchangeIds(comparison, key, result.sources);

  if (comparison.recordedOwnerContext.length !== 1) return invalid('unsupported-selection');
  const ownerContext = comparison.recordedOwnerContext[0];
  if (!ownerContext) return invalid('unsupported-selection');
  const owner = ownerContext.recordedOwnerIdentity;
  const victimIdentityKey = comparison.identityKeys.find((key) => identityNames.get(key) === owner);
  const attackerIdentityKey = comparison.identityKeys.find((key) => key !== victimIdentityKey);
  if (!victimIdentityKey || !attackerIdentityKey) return invalid('unsupported-selection');
  const victimRawIds = availableRawExchangeIds(comparison, victimIdentityKey, result.sources);
  if (!ownerContext.linkedExchangeIds.some((exchangeId) => victimRawIds.has(exchangeId))) {
    return invalid('unsupported-selection');
  }

  const groups = result.groups.filter((candidate) => candidate.groupId === comparison.groupId);
  const group = groups.length === 1 ? groups[0] : undefined;
  if (
    !group ||
    group.method !== 'GET' ||
    typeof group.routeSignature !== 'string' ||
    group.routeSignature.length === 0 ||
    typeof group.origin !== 'string' ||
    group.origin.length === 0 ||
    typeof group.path !== 'string' ||
    !group.path.startsWith('/')
  ) {
    return invalid('unsupported-selection');
  }
  try {
    const origin = new URL(group.origin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.origin !== group.origin
    )
      return invalid('unsupported-selection');
  } catch {
    return invalid('unsupported-selection');
  }

  return {
    comparison,
    routeSignature: group.routeSignature,
    method: 'GET',
    origin: group.origin,
    path: group.path,
    requestClass: comparison.requestClass,
    recordedRole: recordedRole as string,
    victimIdentityKey,
    attackerIdentityKey,
    victimIdentity: namedIdentity(victimIdentityKey),
    attackerIdentity: namedIdentity(attackerIdentityKey),
  };
}

export function createAccessValidationSelection(
  result: AccessComparisonResult,
  comparisonId: string,
): AccessValidationSelection {
  const canonical = canonicalReport(result).result;
  const oriented = orientComparison(canonical, comparisonId);
  return {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation-selection',
    comparisonSha256: digest(canonicalReport(canonical).json),
    sourceManifestSha256: accessValidationSourceManifestDigest(canonical.sources),
    comparisonId: oriented.comparison.comparisonId,
    victimIdentityKey: oriented.victimIdentityKey,
    attackerIdentityKey: oriented.attackerIdentityKey,
  };
}

export function resolveAccessValidationSelection(
  value: AccessValidationSelection,
  result: AccessComparisonResult,
): ResolvedAccessValidation {
  const selection = parseAccessValidationSelection(value);
  const canonical = canonicalReport(result);
  if (digest(canonical.json) !== selection.comparisonSha256) return invalid('comparison-mismatch');
  if (accessValidationSourceManifestDigest(canonical.result.sources) !== selection.sourceManifestSha256)
    return invalid('corpus-mismatch');
  const oriented = orientComparison(canonical.result, selection.comparisonId);
  if (
    oriented.victimIdentityKey !== selection.victimIdentityKey ||
    oriented.attackerIdentityKey !== selection.attackerIdentityKey
  ) {
    return invalid('invalid-selection');
  }
  const payload: ResolvedAccessValidationPayload = {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: selection.comparisonSha256,
    sourceManifestSha256: selection.sourceManifestSha256,
    comparisonId: selection.comparisonId,
    routeSignature: oriented.routeSignature,
    method: 'GET',
    origin: oriented.origin,
    routePathPrefix: safeRoutePathPrefix(
      oriented.path,
      oriented.victimIdentity,
      oriented.attackerIdentity,
      oriented.comparison.recordedOwnerContext[0]?.resourceId ?? '',
    ),
    requestClass: oriented.requestClass,
    recordedRole: oriented.recordedRole,
    victimIdentity: oriented.victimIdentity,
    attackerIdentity: oriented.attackerIdentity,
  };
  return {
    schemaVersion: payload.schemaVersion,
    kind: payload.kind,
    comparisonSha256: payload.comparisonSha256,
    sourceManifestSha256: payload.sourceManifestSha256,
    selectionDigest: resolvedSelectionDigest(payload),
    comparisonId: payload.comparisonId,
    routeSignature: payload.routeSignature,
    method: payload.method,
    origin: payload.origin,
    routePathPrefix: payload.routePathPrefix,
    requestClass: payload.requestClass,
    recordedRole: payload.recordedRole,
    victimIdentity: payload.victimIdentity,
    attackerIdentity: payload.attackerIdentity,
  };
}

export function parseResolvedAccessValidation(value: unknown): ResolvedAccessValidation {
  if (
    !record(value) ||
    !exactKeys(value, [
      'schemaVersion',
      'kind',
      'comparisonSha256',
      'sourceManifestSha256',
      'selectionDigest',
      'comparisonId',
      'routeSignature',
      'method',
      'origin',
      'routePathPrefix',
      'requestClass',
      'recordedRole',
      'victimIdentity',
      'attackerIdentity',
    ]) ||
    value.schemaVersion !== 1 ||
    value.kind !== 'blackbox-cross-identity-validation' ||
    typeof value.comparisonSha256 !== 'string' ||
    !SHA256.test(value.comparisonSha256) ||
    typeof value.sourceManifestSha256 !== 'string' ||
    !SHA256.test(value.sourceManifestSha256) ||
    typeof value.selectionDigest !== 'string' ||
    !SHA256.test(value.selectionDigest) ||
    typeof value.comparisonId !== 'string' ||
    !COMPARISON_ID.test(value.comparisonId) ||
    typeof value.routeSignature !== 'string' ||
    !ROUTE_SIGNATURE.test(value.routeSignature) ||
    value.method !== 'GET' ||
    typeof value.origin !== 'string' ||
    value.origin.length === 0 ||
    typeof value.routePathPrefix !== 'string' ||
    !ROUTE_PATH_PREFIX.test(value.routePathPrefix) ||
    typeof value.requestClass !== 'string' ||
    !REQUEST_CLASS.test(value.requestClass) ||
    typeof value.recordedRole !== 'string' ||
    value.recordedRole.length === 0 ||
    typeof value.victimIdentity !== 'string' ||
    value.victimIdentity.length === 0 ||
    typeof value.attackerIdentity !== 'string' ||
    value.attackerIdentity.length === 0 ||
    value.victimIdentity === value.attackerIdentity
  ) {
    return invalid();
  }
  try {
    const origin = new URL(value.origin);
    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      origin.origin !== value.origin
    )
      return invalid();
  } catch {
    return invalid();
  }
  const parsed: ResolvedAccessValidation = {
    schemaVersion: 1,
    kind: 'blackbox-cross-identity-validation',
    comparisonSha256: value.comparisonSha256,
    sourceManifestSha256: value.sourceManifestSha256,
    selectionDigest: value.selectionDigest,
    comparisonId: value.comparisonId,
    routeSignature: value.routeSignature,
    method: 'GET',
    origin: value.origin,
    routePathPrefix: value.routePathPrefix,
    requestClass: value.requestClass,
    recordedRole: value.recordedRole,
    victimIdentity: value.victimIdentity,
    attackerIdentity: value.attackerIdentity,
  };
  if (resolvedSelectionDigest(parsed) !== parsed.selectionDigest) return invalid();
  return parsed;
}

export function assertResolvedAccessValidationScope(
  value: unknown,
  targetOrigin: string,
  identities: readonly { readonly name: string; readonly role: string }[],
): ResolvedAccessValidation {
  const resolved = parseResolvedAccessValidation(value);
  if (targetOrigin !== resolved.origin || resolved.victimIdentity === resolved.attackerIdentity) {
    return invalid('scope-mismatch');
  }
  const victim = identities.filter(({ name }) => name === resolved.victimIdentity);
  const attacker = identities.filter(({ name }) => name === resolved.attackerIdentity);
  if (
    victim.length !== 1 ||
    attacker.length !== 1 ||
    victim[0]?.role !== resolved.recordedRole ||
    attacker[0]?.role !== resolved.recordedRole
  ) {
    return invalid('scope-mismatch');
  }
  return resolved;
}
