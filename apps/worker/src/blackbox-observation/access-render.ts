// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { AccessComparison, AccessComparisonResult } from './access-types.js';
import type { SourceManifest, SourceRef } from './types.js';

const RAW_EXCHANGE_ID = /^ex_[0-9a-f]{24}$/;

/** Keep private metadata inert in Markdown tables, lists and prose. */
function inline(value: unknown): string {
  if (value === null) return 'unavailable';
  const escaped = Array.from(String(value), (character) => {
    const code = character.charCodeAt(0);
    return character === '`' ||
      character === '|' ||
      code <= 31 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x2028 && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069)
      ? `\\u${code.toString(16).padStart(4, '0')}`
      : character;
  }).join('');
  return `\` ${escaped} \``;
}

function sourceFilename(reference: Pick<SourceRef, 'source' | 'exchangeId'> | SourceManifest): string {
  switch (reference.source) {
    case 'traffic':
      return 'traffic_inventory.json';
    case 'blackboard':
      return 'blackbox_blackboard.json';
    case 'findings':
      return 'blackbox_authz_findings.json';
    case 'raw':
      return reference.exchangeId !== undefined && RAW_EXCHANGE_ID.test(reference.exchangeId)
        ? `raw/${reference.exchangeId}.json`
        : 'raw/<unavailable>';
    default:
      return 'source/<unavailable>';
  }
}

function source(reference: SourceRef): string {
  return inline(`${sourceFilename(reference)}#${reference.pointer}`);
}

function sources(references: readonly SourceRef[]): string {
  return references.length === 0 ? 'unavailable' : references.map(source).join(', ');
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function allSourceReferences(result: AccessComparisonResult): SourceRef[] {
  const references: SourceRef[] = [];
  for (const identity of result.identities) references.push(...identity.sources);
  for (const group of result.groups) {
    references.push(...group.sources);
    for (const cell of group.identityCells) references.push(...cell.sources);
  }
  for (const comparison of result.comparisons) {
    references.push(...comparison.sources);
    for (const values of comparison.identityValues) references.push(...values.sources);
    for (const context of comparison.recordedOwnerContext) references.push(...context.sources);
  }
  for (const diagnostic of result.diagnostics) references.push(...diagnostic.sources);
  return [
    ...new Map(
      references.map((reference) => [
        `${reference.source}\0${reference.pointer}\0${reference.exchangeId ?? ''}`,
        reference,
      ]),
    ).values(),
  ].sort((left, right) =>
    compareText(
      `${left.source}\0${left.pointer}\0${left.exchangeId ?? ''}`,
      `${right.source}\0${right.pointer}\0${right.exchangeId ?? ''}`,
    ),
  );
}

function triageOrder(left: AccessComparison, right: AccessComparison): number {
  const leftRank = left.basis === 'exact-saved-target-body' ? 0 : 1;
  const rightRank = right.basis === 'exact-saved-target-body' ? 0 : 1;
  return leftRank - rightRank || compareText(left.comparisonId, right.comparisonId);
}

/** Render only the passive comparison projection, using fixed prose and headings. */
export function renderAccessComparisonMarkdown(result: AccessComparisonResult): string {
  const lines: string[] = [
    '# Offline black-box cross-identity triage',
    '',
    '## Input records',
    '',
    '| File | Availability | Bytes | SHA-256 |',
    '| --- | --- | ---: | --- |',
  ];
  for (const manifest of result.sources) {
    lines.push(
      `| ${inline(sourceFilename(manifest))} | ${inline(manifest.availability)} | ${inline(manifest.bytes)} | ${inline(manifest.sha256)} |`,
    );
  }
  if (result.sources.length === 0)
    lines.push('| No input manifests supplied | unavailable | unavailable | unavailable |');

  lines.push(
    '',
    '## Analysis and scope',
    '',
    `Analysis status: ${inline(result.status)}. Evidence basis: ${inline(result.scope.basis)}.`,
    '',
    `Authorization: ${inline(result.scope.authorization)}. Session validity: ${inline(result.scope.sessionValidity)}. Expected policy: ${inline(result.scope.expectedPolicy)}. Semantic equivalence: ${inline(result.scope.semanticEquivalence)}. Application coverage: ${inline(result.scope.applicationCoverage)}.`,
    '',
    'This report describes recorded equivalence, difference, variability, and insufficient evidence from supplied saved records.',
    '',
    '## Summary counts',
    '',
    '| Groups | Comparisons | Recorded comparisons | Strong comparisons | Insufficient comparisons |',
    '| ---: | ---: | ---: | ---: | ---: |',
    `| ${inline(result.counts.groups)} | ${inline(result.counts.comparisons)} | ${inline(result.counts.recordedComparisons)} | ${inline(result.counts.strongComparisons)} | ${inline(result.counts.insufficientComparisons)} |`,
    '',
    '## Identities',
    '',
    '| Identity | Kind | Recorded name | Recorded role | Saved authenticated flag | Sources |',
    '| --- | --- | --- | --- | --- | --- |',
  );
  for (const identity of result.identities) {
    lines.push(
      `| ${inline(identity.key)} | ${inline(identity.kind)} | ${inline(identity.name)} | ${inline(identity.role)} | ${inline(identity.authenticated)} | ${sources(identity.sources)} |`,
    );
  }
  if (result.identities.length === 0)
    lines.push('| No recorded identities | unavailable | unavailable | unavailable | unavailable | unavailable |');

  lines.push(
    '',
    '## Comparison groups',
    '',
    '| Group | Route signature | Method | Origin | Path | Identity cells | Sources |',
    '| --- | --- | --- | --- | --- | ---: | --- |',
  );
  for (const group of result.groups) {
    lines.push(
      `| ${inline(group.groupId)} | ${inline(group.routeSignature)} | ${inline(group.method)} | ${inline(group.origin)} | ${inline(group.path)} | ${inline(group.identityCells.length)} | ${sources(group.sources)} |`,
    );
  }
  if (result.groups.length === 0)
    lines.push(
      '| No comparison groups | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable |',
    );

  lines.push(
    '',
    '## Identity comparisons',
    '',
    '| Comparison | Identities | Evidence basis | Evidence strength | Eligibility | Completeness | Status relation | Fingerprint relation | Body relation | Content-type relation | Signals | Sources |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const comparison of result.comparisons) {
    lines.push(
      `| ${inline(comparison.comparisonId)} | ${comparison.identityKeys.map(inline).join(', ')} | ${inline(comparison.basis)} | ${inline(comparison.evidenceStrength)} | ${inline(comparison.eligibility)} | ${inline(comparison.completeness)} | ${inline(comparison.statusRelation)} | ${inline(comparison.fingerprintRelation)} | ${inline(comparison.bodyRelation)} | ${inline(comparison.contentTypeRelation)} | ${comparison.signals.map(inline).join(', ') || 'none'} | ${sources(comparison.sources)} |`,
    );
    for (const values of comparison.identityValues) {
      const fingerprints = values.fullResponseFingerprints.map(inline).join(', ') || 'none';
      lines.push(
        `Recorded values for ${inline(values.identityKey)}: statuses ${values.statusValues.map(inline).join(', ') || 'none'}; full saved-response fingerprint: ${fingerprints}.`,
        '',
      );
    }
  }
  if (result.comparisons.length === 0)
    lines.push(
      '| No identity comparisons | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable | unavailable |',
    );

  lines.push('', '## Prioritized triage', '');
  const prioritized = [...result.comparisons].sort(triageOrder);
  if (prioritized.length === 0) lines.push('No recorded comparisons are available for review.', '');
  for (const comparison of prioritized) {
    lines.push(
      `- ${inline(comparison.comparisonId)} uses ${inline(comparison.basis)} evidence with ${inline(comparison.completeness)} completeness. Recorded signals: ${comparison.signals.map(inline).join(', ') || 'none'}.`,
      '',
    );
  }

  lines.push('', '## Unknown reasons', '');
  let unknownCount = 0;
  for (const comparison of result.comparisons) {
    for (const unknown of comparison.unknowns) {
      unknownCount += 1;
      lines.push(`- ${inline(comparison.comparisonId)}: ${inline(unknown)}.`, '');
    }
  }
  if (unknownCount === 0) lines.push('No comparison-specific unknown reasons were recorded.', '');

  lines.push('', '## Recorded-owner context', '');
  let ownerCount = 0;
  for (const comparison of result.comparisons) {
    for (const context of comparison.recordedOwnerContext) {
      ownerCount += 1;
      lines.push(
        `- ${inline(comparison.comparisonId)} records resource ${inline(context.resourceId)}, recorded owner identity ${inline(context.recordedOwnerIdentity)}, linked exchanges ${context.linkedExchangeIds.map(inline).join(', ') || 'none'}. Sources: ${sources(context.sources)}.`,
        '',
      );
    }
  }
  if (ownerCount === 0) lines.push('No source-linked recorded-owner context is available.', '');

  lines.push('', '## Diagnostics', '');
  if (result.diagnostics.length === 0) lines.push('No diagnostics were recorded.', '');
  for (const diagnostic of result.diagnostics) {
    lines.push(
      `- ${inline(diagnostic.code)}: ${inline(diagnostic.message)} Sources: ${sources(diagnostic.sources)}.`,
      '',
    );
  }

  lines.push('', '## Source references', '');
  const references = allSourceReferences(result);
  if (references.length === 0) lines.push('No source references are available.', '');
  for (const reference of references) lines.push(`- ${source(reference)}.`, '');
  return `${lines.join('\n')}\n`;
}
