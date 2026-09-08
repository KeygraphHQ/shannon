// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { rawRequestClasses } from './access-raw.js';
import type {
  AccessComparison,
  AccessComparisonGroup,
  AccessComparisonUnknown,
  AccessIdentityValues,
  EvidenceCompleteness,
  TriageSignal,
  ValueRelation,
} from './access-types.js';
import type { AssociatedRawEvidence } from './raw.js';
import type { ObservedExchange, ObservedIdentity, SourceRef } from './types.js';
import type { ValidatedResourceContext } from './validate.js';
import { compare, sourceRefs } from './validate.js';

export type AccessComparisonCandidate = Omit<AccessComparison, 'comparisonId'>;

interface BuiltPopulation {
  readonly groups: AccessComparisonGroup[];
  readonly comparisons: AccessComparisonCandidate[];
}

const sortedUnique = <T extends string | number>(values: readonly T[]): T[] =>
  [...new Set(values)].sort((left, right) =>
    typeof left === 'number' && typeof right === 'number' ? left - right : compare(String(left), String(right)),
  );

export function valueRelation<T extends string | number>(left: readonly T[], right: readonly T[]): ValueRelation {
  if (left.length === 0 || right.length === 0) return 'unavailable';
  const rightSet = new Set(right);
  const intersection = left.some((value) => rightSet.has(value));
  if (!intersection) return 'different';
  if (left.length === right.length && left.every((value, index) => value === right[index])) return 'same';
  return 'overlapping-variable';
}

function identityValues(identity: ObservedIdentity, exchanges: readonly ObservedExchange[]): AccessIdentityValues {
  const usable = exchanges.filter((exchange) => exchange.normalizedResponse === 'usable');
  const statusValues = sortedUnique(
    usable.flatMap((exchange) => (exchange.responseStatus === null ? [] : [exchange.responseStatus])),
  );
  const fullResponseFingerprints = sortedUnique(
    usable.flatMap((exchange) => (exchange.responseFingerprint === null ? [] : [exchange.responseFingerprint])),
  );
  const usableRawResponses = exchanges.filter((exchange) => exchange.raw.response === 'usable').length;
  return {
    identityKey: identity.key,
    state: exchanges.length === 0 ? 'not-observed' : 'observed',
    records: exchanges.length,
    usableResponses: usable.length,
    unavailableResponses: exchanges.length - usable.length,
    associatedRawRequests: exchanges.filter(
      (exchange) => exchange.raw.availability === 'available' && exchange.raw.association === 'matched',
    ).length,
    usableRawResponses,
    unavailableRawResponses: exchanges.length - usableRawResponses,
    statusValues,
    fullResponseFingerprints,
    variable: statusValues.length > 1 || fullResponseFingerprints.length > 1,
    sources: sourceRefs([
      ...identity.sources.filter(
        (source) =>
          source.source === 'blackboard' &&
          source.exchangeId === undefined &&
          /^\/identities\/(?:0|[1-9]\d*)$/.test(source.pointer),
      ),
      ...exchanges.flatMap((exchange) => [...exchange.sources, ...exchange.raw.sources]),
    ]),
  };
}

interface RawIdentityProfile {
  readonly bodyValues: readonly string[];
  readonly contentTypeValues: readonly string[];
  readonly unavailableBodies: number;
  readonly unavailableContentTypes: number;
  readonly bodyFramingUnknown: boolean;
  readonly variable: boolean;
}

function rawIdentityProfile(members: ReturnType<typeof rawRequestClasses>[number]['members']): RawIdentityProfile {
  const bodyValues = sortedUnique(
    members.flatMap(({ profile }) => (profile.bodyValue === null ? [] : [profile.bodyValue])),
  );
  const contentTypeValues = sortedUnique(
    members.flatMap(({ profile }) => (profile.contentTypeValue === null ? [] : [profile.contentTypeValue])),
  );
  return {
    bodyValues,
    contentTypeValues,
    unavailableBodies: members.filter(({ profile }) => profile.bodyValue === null).length,
    unavailableContentTypes: members.filter(({ profile }) => profile.contentTypeValue === null).length,
    bodyFramingUnknown: members.some(({ profile }) => profile.bodyFramingUnknown),
    variable: bodyValues.length > 1 || contentTypeValues.length > 1,
  };
}

function strongCompleteness(
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  leftRaw: RawIdentityProfile,
  rightRaw: RawIdentityProfile,
  relations: readonly ValueRelation[],
): EvidenceCompleteness {
  if (relations.every((relation) => relation === 'unavailable')) return 'unavailable';
  if (
    relations.includes('unavailable') ||
    left.unavailableResponses > 0 ||
    right.unavailableResponses > 0 ||
    leftRaw.unavailableBodies > 0 ||
    rightRaw.unavailableBodies > 0 ||
    leftRaw.unavailableContentTypes > 0 ||
    rightRaw.unavailableContentTypes > 0 ||
    leftRaw.bodyFramingUnknown ||
    rightRaw.bodyFramingUnknown
  )
    return 'partial';
  return 'complete';
}

function strongSignals(
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  leftRaw: RawIdentityProfile,
  rightRaw: RawIdentityProfile,
  relations: readonly ValueRelation[],
  evidenceCompleteness: EvidenceCompleteness,
): TriageSignal[] {
  const values: TriageSignal[] = [];
  if (relations.includes('same')) values.push('recorded-response-equivalence');
  if (relations.includes('different')) values.push('recorded-response-difference');
  if (
    left.variable ||
    right.variable ||
    leftRaw.variable ||
    rightRaw.variable ||
    relations.includes('overlapping-variable')
  )
    values.push('within-identity-variability');
  if (evidenceCompleteness !== 'complete' || relations.includes('unavailable')) values.push('insufficient-evidence');
  return sortedUnique(values);
}

function strongUnknowns(
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  leftRaw: RawIdentityProfile,
  rightRaw: RawIdentityProfile,
  statusRelation: ValueRelation,
  fingerprintRelation: ValueRelation,
  hasOwnerContext: boolean,
): AccessComparisonUnknown[] {
  const values: AccessComparisonUnknown[] = [];
  if (statusRelation === 'unavailable') values.push('recorded-status-unavailable');
  if (fingerprintRelation === 'unavailable') values.push('recorded-fingerprint-unavailable');
  if (left.unavailableRawResponses > 0 || right.unavailableRawResponses > 0) values.push('raw-response-unavailable');
  if (leftRaw.unavailableBodies > 0 || rightRaw.unavailableBodies > 0) values.push('captured-body-unavailable');
  if (leftRaw.unavailableContentTypes > 0 || rightRaw.unavailableContentTypes > 0)
    values.push('content-type-unavailable');
  if (leftRaw.bodyFramingUnknown || rightRaw.bodyFramingUnknown) values.push('saved-body-framing-unknown');
  if (hasOwnerContext) values.push('recorded-owner-authenticity-unassessed');
  return sortedUnique(values);
}

function ownerContexts(
  resourceContexts: readonly ValidatedResourceContext[],
  selectedExchangeIds: ReadonlySet<string>,
) {
  return resourceContexts
    .flatMap((context) => {
      const linkedExchangeIds = context.linkedExchangeIds.filter((exchangeId) => selectedExchangeIds.has(exchangeId));
      if (linkedExchangeIds.length === 0) return [];
      return [
        {
          resourceId: context.resourceId,
          recordedOwnerIdentity: context.ownerIdentity,
          linkedExchangeIds,
          sources: sourceRefs([
            ...context.resourceSources,
            ...context.exchangeSources
              .filter(({ exchangeId }) => selectedExchangeIds.has(exchangeId))
              .flatMap(({ sources }) => sources),
          ]),
        },
      ];
    })
    .sort(
      (left, right) =>
        compare(left.resourceId, right.resourceId) || compare(left.recordedOwnerIdentity, right.recordedOwnerIdentity),
    );
}

function completeness(
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  statusRelation: ValueRelation,
  fingerprintRelation: ValueRelation,
): EvidenceCompleteness {
  const usableDimension = statusRelation !== 'unavailable' || fingerprintRelation !== 'unavailable';
  if (!usableDimension) return 'unavailable';
  if (
    statusRelation === 'unavailable' ||
    fingerprintRelation === 'unavailable' ||
    left.unavailableResponses > 0 ||
    right.unavailableResponses > 0
  )
    return 'partial';
  return 'complete';
}

function signals(
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  statusRelation: ValueRelation,
  fingerprintRelation: ValueRelation,
  evidenceCompleteness: EvidenceCompleteness,
): TriageSignal[] {
  const relations = [statusRelation, fingerprintRelation];
  const values: TriageSignal[] = [];
  if (relations.includes('same')) values.push('recorded-response-equivalence');
  if (relations.includes('different')) values.push('recorded-response-difference');
  if (left.variable || right.variable || relations.includes('overlapping-variable'))
    values.push('within-identity-variability');
  if (evidenceCompleteness !== 'complete' || relations.includes('unavailable')) values.push('insufficient-evidence');
  return sortedUnique(values);
}

function unknowns(
  requestedRaw: boolean,
  left: AccessIdentityValues,
  right: AccessIdentityValues,
  statusRelation: ValueRelation,
  fingerprintRelation: ValueRelation,
  selectedSources: readonly SourceRef[],
  sharedRawSources: readonly SourceRef[],
): AccessComparisonUnknown[] {
  const values: AccessComparisonUnknown[] = [];
  if (statusRelation === 'unavailable') values.push('recorded-status-unavailable');
  if (fingerprintRelation === 'unavailable') values.push('recorded-fingerprint-unavailable');
  if (!requestedRaw) values.push('raw-request-not-supplied');
  else {
    if (left.associatedRawRequests < left.records || right.associatedRawRequests < right.records)
      values.push('raw-request-unavailable');
    if (left.associatedRawRequests > left.usableRawResponses || right.associatedRawRequests > right.usableRawResponses)
      values.push('raw-response-unavailable');
  }
  const selected = new Set(selectedSources.map((source) => JSON.stringify(source)));
  if (sharedRawSources.some((source) => selected.has(JSON.stringify(source)))) values.push('shared-raw-source');
  return sortedUnique(values);
}

export function buildRecordedPopulation(
  identities: readonly ObservedIdentity[],
  exchanges: readonly ObservedExchange[],
  resourceContexts: readonly ValidatedResourceContext[],
  requestedRaw: boolean,
  sharedRawSources: readonly SourceRef[],
): BuiltPopulation {
  const grouped = new Map<string, ObservedExchange[]>();
  for (const exchange of exchanges) {
    const key = JSON.stringify([exchange.routeSignature, exchange.method, exchange.origin, exchange.path]);
    const previous = grouped.get(key) ?? [];
    previous.push(exchange);
    grouped.set(key, previous);
  }
  const ordered = [...grouped.entries()].sort(([, left], [, right]) => {
    const firstLeft = left[0];
    const firstRight = right[0];
    if (!firstLeft || !firstRight) return left.length - right.length;
    return (
      compare(firstLeft.routeSignature, firstRight.routeSignature) ||
      compare(firstLeft.method, firstRight.method) ||
      compare(firstLeft.origin, firstRight.origin) ||
      compare(firstLeft.path, firstRight.path)
    );
  });
  const exchangesByGroup = new Map<string, readonly ObservedExchange[]>();
  const groups = ordered.map(([, selected], index): AccessComparisonGroup => {
    const first = selected[0];
    if (!first) throw new Error('Empty comparison group.');
    const orderedExchanges = [...selected].sort((left, right) => compare(left.exchangeId, right.exchangeId));
    const groupId = `group-${String(index + 1).padStart(4, '0')}`;
    exchangesByGroup.set(groupId, orderedExchanges);
    const identityCells = identities.map((identity) =>
      identityValues(
        identity,
        orderedExchanges.filter((exchange) => exchange.identityKey === identity.key),
      ),
    );
    return {
      groupId,
      routeSignature: first.routeSignature,
      method: first.method,
      origin: first.origin,
      path: first.path,
      identityCells,
      sources: sourceRefs(identityCells.flatMap((cell) => cell.sources)),
    };
  });
  const population: AccessComparisonCandidate[] = [];
  for (const group of groups) {
    const comparable = group.identityCells.filter((cell) => {
      const identity = identities.find((candidate) => candidate.key === cell.identityKey);
      return cell.state === 'observed' && identity !== undefined && identity.kind !== 'unattributed';
    });
    for (let leftIndex = 0; leftIndex < comparable.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < comparable.length; rightIndex++) {
        const left = comparable[leftIndex];
        const right = comparable[rightIndex];
        if (!left || !right) continue;
        const statusRelation = valueRelation(left.statusValues, right.statusValues);
        const fingerprintRelation = valueRelation(left.fullResponseFingerprints, right.fullResponseFingerprints);
        const evidenceCompleteness = completeness(left, right, statusRelation, fingerprintRelation);
        const selectedExchangeIds = new Set(
          (exchangesByGroup.get(group.groupId) ?? [])
            .filter((exchange) => [left.identityKey, right.identityKey].includes(exchange.identityKey))
            .map((exchange) => exchange.exchangeId),
        );
        const recordedOwnerContext = ownerContexts(resourceContexts, selectedExchangeIds);
        const selectedSources = sourceRefs([
          ...left.sources,
          ...right.sources,
          ...recordedOwnerContext.flatMap((context) => context.sources),
        ]);
        const comparisonUnknowns = unknowns(
          requestedRaw,
          left,
          right,
          statusRelation,
          fingerprintRelation,
          selectedSources,
          sharedRawSources,
        );
        population.push({
          groupId: group.groupId,
          identityKeys: [left.identityKey, right.identityKey],
          basis: 'recorded-route-metadata',
          evidenceStrength: 'recorded-route-metadata',
          requestClass: null,
          eligibility: 'eligible',
          completeness: evidenceCompleteness,
          statusRelation,
          fingerprintRelation,
          bodyRelation: 'unavailable',
          contentTypeRelation: 'unavailable',
          identityValues: [left, right],
          signals: signals(left, right, statusRelation, fingerprintRelation, evidenceCompleteness),
          unknowns: sortedUnique([
            ...comparisonUnknowns,
            ...(recordedOwnerContext.length === 0 ? [] : ['recorded-owner-authenticity-unassessed' as const]),
          ]),
          recordedOwnerContext,
          sources: selectedSources,
        });
      }
    }
  }
  return {
    groups,
    comparisons: population,
  };
}

export function buildStrongComparisons(
  identities: readonly ObservedIdentity[],
  exchanges: readonly ObservedExchange[],
  evidence: readonly AssociatedRawEvidence[],
  resourceContexts: readonly ValidatedResourceContext[],
  groups: readonly AccessComparisonGroup[],
): AccessComparisonCandidate[] {
  const exchangeById = new Map(exchanges.map((exchange) => [exchange.exchangeId, exchange]));
  const groupByKey = new Map(
    groups.map((group) => [JSON.stringify([group.routeSignature, group.method, group.origin, group.path]), group]),
  );
  const identityByKey = new Map(identities.map((identity) => [identity.key, identity]));
  const comparisons: AccessComparisonCandidate[] = [];

  for (const requestClass of rawRequestClasses(evidence, exchanges, groups)) {
    const membersByGroup = new Map<string, typeof requestClass.members>();
    for (const member of requestClass.members) {
      const exchange = exchangeById.get(member.evidence.exchangeId);
      if (!exchange) continue;
      const key = JSON.stringify([exchange.routeSignature, exchange.method, exchange.origin, exchange.path]);
      const previous = membersByGroup.get(key) ?? [];
      membersByGroup.set(key, [...previous, member]);
    }
    for (const [groupKey, groupedMembers] of membersByGroup) {
      const group = groupByKey.get(groupKey);
      if (!group) continue;
      const usableMembers = groupedMembers.filter(({ evidence: item }) => !item.sharedOccurrence);
      const byIdentity = new Map<string, typeof usableMembers>();
      for (const member of usableMembers) {
        const exchange = exchangeById.get(member.evidence.exchangeId);
        const identity = exchange ? identityByKey.get(exchange.identityKey) : undefined;
        if (!exchange || !identity || identity.kind === 'unattributed') continue;
        byIdentity.set(exchange.identityKey, [...(byIdentity.get(exchange.identityKey) ?? []), member]);
      }
      const identityKeys = [...byIdentity.keys()].sort(compare);
      for (let leftIndex = 0; leftIndex < identityKeys.length; leftIndex++) {
        for (let rightIndex = leftIndex + 1; rightIndex < identityKeys.length; rightIndex++) {
          const leftKey = identityKeys[leftIndex];
          const rightKey = identityKeys[rightIndex];
          const leftIdentity = leftKey ? identityByKey.get(leftKey) : undefined;
          const rightIdentity = rightKey ? identityByKey.get(rightKey) : undefined;
          const leftMembers = leftKey ? byIdentity.get(leftKey) : undefined;
          const rightMembers = rightKey ? byIdentity.get(rightKey) : undefined;
          if (!leftIdentity || !rightIdentity || !leftMembers?.length || !rightMembers?.length) continue;
          const leftExchanges = leftMembers
            .map(({ evidence: item }) => exchangeById.get(item.exchangeId))
            .filter((value): value is ObservedExchange => value !== undefined);
          const rightExchanges = rightMembers
            .map(({ evidence: item }) => exchangeById.get(item.exchangeId))
            .filter((value): value is ObservedExchange => value !== undefined);
          const left = identityValues(leftIdentity, leftExchanges);
          const right = identityValues(rightIdentity, rightExchanges);
          const leftRaw = rawIdentityProfile(leftMembers);
          const rightRaw = rawIdentityProfile(rightMembers);
          const statusRelation = valueRelation(left.statusValues, right.statusValues);
          const fingerprintRelation = valueRelation(left.fullResponseFingerprints, right.fullResponseFingerprints);
          const bodyRelation = valueRelation(leftRaw.bodyValues, rightRaw.bodyValues);
          const contentTypeRelation = valueRelation(leftRaw.contentTypeValues, rightRaw.contentTypeValues);
          const relations = [statusRelation, fingerprintRelation, bodyRelation, contentTypeRelation];
          const evidenceCompleteness = strongCompleteness(left, right, leftRaw, rightRaw, relations);
          const selectedExchangeIds = new Set(
            [...leftExchanges, ...rightExchanges].map((exchange) => exchange.exchangeId),
          );
          const recordedOwnerContext = ownerContexts(resourceContexts, selectedExchangeIds);
          const selectedSources = sourceRefs([
            ...left.sources,
            ...right.sources,
            ...recordedOwnerContext.flatMap((context) => context.sources),
          ]);
          comparisons.push({
            groupId: group.groupId,
            identityKeys: [left.identityKey, right.identityKey],
            basis: 'exact-saved-target-body',
            evidenceStrength: relations.some((relation) => relation !== 'unavailable')
              ? 'exact-saved-target-body-with-response-evidence'
              : 'exact-saved-target-body-request-only',
            requestClass: requestClass.requestClass,
            eligibility: 'eligible',
            completeness: evidenceCompleteness,
            statusRelation,
            fingerprintRelation,
            bodyRelation,
            contentTypeRelation,
            identityValues: [left, right],
            signals: strongSignals(left, right, leftRaw, rightRaw, relations, evidenceCompleteness),
            unknowns: strongUnknowns(
              left,
              right,
              leftRaw,
              rightRaw,
              statusRelation,
              fingerprintRelation,
              recordedOwnerContext.length > 0,
            ),
            recordedOwnerContext,
            sources: selectedSources,
          });
        }
      }
    }
  }
  return comparisons;
}

export function orderComparisons(comparisons: readonly AccessComparisonCandidate[]): AccessComparison[] {
  const requestClassOrder = (value: string | null): number =>
    value === null ? 0 : Number(value.slice('request-class-'.length));
  return [...comparisons]
    .sort(
      (left, right) =>
        compare(left.groupId, right.groupId) ||
        compare(left.identityKeys[0], right.identityKeys[0]) ||
        compare(left.identityKeys[1], right.identityKeys[1]) ||
        (left.basis === right.basis ? 0 : left.basis === 'recorded-route-metadata' ? -1 : 1) ||
        requestClassOrder(left.requestClass) - requestClassOrder(right.requestClass),
    )
    .map((comparison, index) => ({
      comparisonId: `comparison-${String(index + 1).padStart(6, '0')}`,
      ...comparison,
    }));
}
