// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { AccessComparisonGroup } from './access-types.js';
import type { AssociatedRawEvidence } from './raw.js';
import type { ObservedExchange } from './types.js';
import { compare } from './validate.js';

const CONTENT_LENGTH = /^(?:0|[1-9][0-9]*)$/u;
const MEDIA_TYPE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u;

export interface RawResponseProfile {
  readonly exchangeId: string;
  readonly bodyValue: string | null;
  readonly contentTypeValue: string | null;
  readonly bodyFramingUnknown: boolean;
}

export interface RawRequestClass {
  readonly groupId: string;
  readonly requestClass: string;
  readonly members: readonly {
    readonly evidence: AssociatedRawEvidence;
    readonly profile: RawResponseProfile;
  }[];
}

function headerValues(evidence: AssociatedRawEvidence, name: string): readonly string[] {
  const normalized = name.toLowerCase();
  return (
    evidence.response?.headers
      .filter((header) => header.name.toLowerCase() === normalized)
      .map((header) => header.value) ?? []
  );
}

function responseProfile(evidence: AssociatedRawEvidence): RawResponseProfile {
  if (!evidence.response)
    return { exchangeId: evidence.exchangeId, bodyValue: null, contentTypeValue: null, bodyFramingUnknown: false };

  const transferEncoding = headerValues(evidence, 'transfer-encoding');
  const contentEncoding = headerValues(evidence, 'content-encoding');
  const contentLength = headerValues(evidence, 'content-length');
  const bodyEligible =
    transferEncoding.length === 0 &&
    contentEncoding.length <= 1 &&
    (contentEncoding.length === 0 || contentEncoding[0]?.toLowerCase() === 'identity') &&
    contentLength.length <= 1 &&
    (contentLength.length === 0 ||
      (CONTENT_LENGTH.test(contentLength[0] ?? '') &&
        Number(contentLength[0]) === Buffer.byteLength(evidence.response.body, 'utf8')));

  const contentTypes = headerValues(evidence, 'content-type');
  let contentTypeValue: string | null = null;
  if (contentTypes.length === 0) contentTypeValue = 'absent';
  else if (contentTypes.length === 1) {
    const mediaType = (contentTypes[0]?.split(';', 1)[0] ?? '').trim().toLowerCase();
    if (MEDIA_TYPE.test(mediaType)) contentTypeValue = mediaType;
  }

  return {
    exchangeId: evidence.exchangeId,
    bodyValue: bodyEligible ? evidence.response.body : null,
    contentTypeValue,
    bodyFramingUnknown: bodyEligible && contentLength.length === 0,
  };
}

/** Build private exact request classes and discard their keys at the public result boundary. */
export function rawRequestClasses(
  evidence: readonly AssociatedRawEvidence[],
  exchanges: readonly ObservedExchange[],
  groups: readonly AccessComparisonGroup[],
): readonly RawRequestClass[] {
  interface PrivateClass {
    readonly groupId: string;
    readonly groupOrder: number;
    readonly method: string;
    readonly target: string;
    readonly body: string;
    readonly members: AssociatedRawEvidence[];
  }
  const exchangeById = new Map(exchanges.map((exchange) => [exchange.exchangeId, exchange]));
  const groupByKey = new Map(
    groups.map((group, groupOrder) => [
      JSON.stringify([group.routeSignature, group.method, group.origin, group.path]),
      { groupId: group.groupId, groupOrder },
    ]),
  );
  const grouped = new Map<string, PrivateClass>();
  for (const item of evidence) {
    const exchange = exchangeById.get(item.exchangeId);
    if (!exchange) continue;
    const group = groupByKey.get(
      JSON.stringify([exchange.routeSignature, exchange.method, exchange.origin, exchange.path]),
    );
    if (!group) continue;
    const privateKey = JSON.stringify([group.groupId, item.request.method, item.request.target, item.request.body]);
    const existing = grouped.get(privateKey);
    if (existing) existing.members.push(item);
    else
      grouped.set(privateKey, {
        ...group,
        method: item.request.method,
        target: item.request.target,
        body: item.request.body,
        members: [item],
      });
  }
  return [...grouped.values()]
    .sort(
      (left, right) =>
        left.groupOrder - right.groupOrder ||
        compare(left.method, right.method) ||
        compare(left.target, right.target) ||
        compare(left.body, right.body),
    )
    .map(({ groupId, members }, index) => ({
      groupId,
      requestClass: `request-class-${String(index + 1).padStart(4, '0')}`,
      members: [...members]
        .sort((left, right) => compare(left.exchangeId, right.exchangeId))
        .map((item) => ({ evidence: item, profile: responseProfile(item) })),
    }));
}
