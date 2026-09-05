// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Deterministic exploitative renumbering and exact-path class publication. */

import { createHash } from 'node:crypto';
import { readPublishedManifest } from '../ai/reconciliation/manifest.js';
import { sastProvenancePath } from '../ai/reconciliation/prepare.js';
import { isProducerId, REF_PREFIX } from '../ai/reconciliation/refs.js';
import type { AddExploitInput, ExploitedExploit } from '../collectors/exploit-collector.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import type { ExactOutputCommit, ExactOutputFile } from './exact-output-commit.js';
import { RenumberError, writeAndCommitExactFiles } from './exact-output-commit.js';
import { renderExploitDeliverable } from './exploit-renderer.js';
import { severityRank } from './finding-order.js';
import { readCommittedFile } from './git-manager.js';

function divergence(checkCode: string, vulnerabilityClass: ReconciliationClass): never {
  throw new RenumberError('key-set-divergence', false, { checkCode, vulnerabilityClass });
}

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Internal producer-task tokens (VULN/SAST) that survive the reference remap have no meaning in
// customer-facing output, so scrubbing replaces them with neutral wording. This is the boundary
// between the internal reconciliation bookkeeping and the exact-path output an exploit agent and
// the final report both read: without this scrub, a producer/task tag would leak into text a
// downstream agent or the customer report can see, exposing reconciliation internals that should
// stay invisible outside this pipeline stage. Prefixes are tried longest first so one class
// prefix cannot match inside a longer sibling prefix.
const PRODUCER_TOKEN_PATTERN = new RegExp(
  `(?:${Object.values(REF_PREFIX)
    .slice()
    .sort((first, second) => second.length - first.length)
    .map(escapeForRegExp)
    .join('|')})-(?:VULN|SAST)-\\d+`,
  'g',
);

export function remapTaskReferences(text: string, oldToNew: ReadonlyMap<string, string>): string {
  const oldReferences = [...oldToNew.keys()].sort((first, second) => second.length - first.length);
  if (oldReferences.length === 0) return text;
  const alternation = oldReferences.map(escapeForRegExp).join('|');
  // Longest-first alternation plus the digit lookahead keep a shorter reference from matching
  // as a prefix of a longer one (INJ-1 inside INJ-10 would otherwise corrupt the longer ref).
  const referencePattern = new RegExp(`(?:${alternation})(?![0-9])`, 'g');
  return text.replace(referencePattern, (oldReference) => oldToNew.get(oldReference) as string);
}

// Walks an entire exploit entry (nested objects and arrays included) so the reference remap and
// producer-token scrub apply to every string field, not just the ones a caller happens to check.
function scrubEntryText(value: unknown, oldToNew: ReadonlyMap<string, string>): unknown {
  if (typeof value === 'string') {
    return remapTaskReferences(value, oldToNew).replace(PRODUCER_TOKEN_PATTERN, 'a related finding');
  }
  if (Array.isArray(value)) return value.map((entry) => scrubEntryText(entry, oldToNew));
  if (value !== null && typeof value === 'object') {
    const scrubbed: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) scrubbed[key] = scrubEntryText(entry, oldToNew);
    return scrubbed;
  }
  return value;
}

/** Accepts only the exact zero-padded form the pipeline mints (INJ-01, not INJ-1 or INJ-001). */
export function parseRefNumber(reference: string, vulnerabilityClass: ReconciliationClass): number | null {
  const prefix = REF_PREFIX[vulnerabilityClass];
  const match = new RegExp(`^${escapeForRegExp(prefix)}-(\\d+)$`).exec(reference);
  if (match === null) return null;
  const digits = match[1] as string;
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed) || parsed < 1 || digits !== pad2(parsed)) return null;
  return parsed;
}

export type ExclusionReason = 'validation_blocked';

export interface ExcludedEntry {
  readonly source_ref: string;
  readonly reason: ExclusionReason;
}

export interface RenumberMap {
  readonly oldToNew: Map<string, string>;
  readonly renumbered: AddExploitInput[];
  readonly order: string[];
  readonly excluded: ExcludedEntry[];
}

/** Validate the complete collector before partitioning and densely order only exploited survivors. */
export function buildRenumberMap(
  entries: readonly AddExploitInput[],
  vulnerabilityClass: ReconciliationClass,
): RenumberMap {
  const decorated = entries.map((entry) => {
    const record = entry as unknown as Record<string, unknown>;
    if (entry === null || typeof entry !== 'object' || typeof record.vulnerability_id !== 'string') {
      throw new RenumberError('unmappable-survivor', false);
    }
    const numericReference = parseRefNumber(record.vulnerability_id, vulnerabilityClass);
    if (numericReference === null || (record.status !== 'exploited' && record.status !== 'blocked')) {
      throw new RenumberError('unmappable-survivor', false);
    }
    return {
      entry,
      numericReference,
      oldReference: record.vulnerability_id,
      status: record.status,
    };
  });

  const seen = new Set<string>();
  for (const entry of decorated) {
    if (seen.has(entry.oldReference)) throw new RenumberError('unmappable-survivor', false);
    seen.add(entry.oldReference);
  }

  const exploited = decorated.filter((entry) => entry.status === 'exploited');
  const blocked = decorated.filter((entry) => entry.status === 'blocked');
  if (exploited.length + blocked.length !== decorated.length) {
    throw new RenumberError('unmappable-survivor', false);
  }

  exploited.sort((first, second) => {
    const severityDifference =
      severityRank((first.entry as ExploitedExploit).severity) -
      severityRank((second.entry as ExploitedExploit).severity);
    if (severityDifference !== 0) return severityDifference;
    if (first.numericReference !== second.numericReference) {
      return first.numericReference - second.numericReference;
    }
    if (first.oldReference < second.oldReference) return -1;
    if (first.oldReference > second.oldReference) return 1;
    return 0;
  });

  const oldToNew = new Map<string, string>();
  const order: string[] = [];
  for (const [index, entry] of exploited.entries()) {
    oldToNew.set(entry.oldReference, `${REF_PREFIX[vulnerabilityClass]}-${pad2(index + 1)}`);
    order.push(entry.oldReference);
  }

  const renumbered = exploited.map((entry) => {
    const scrubbed = scrubEntryText(entry.entry, oldToNew) as Record<string, unknown>;
    return {
      ...scrubbed,
      vulnerability_id: oldToNew.get(entry.oldReference) as string,
    } as unknown as AddExploitInput;
  });
  const excluded = blocked.map((entry) => ({
    source_ref: entry.oldReference,
    reason: 'validation_blocked' as const,
  }));
  return { oldToNew, renumbered, order, excluded };
}

export interface SastProvenanceEntry {
  readonly exploit_ref: string;
  readonly [key: string]: unknown;
}

export interface SastProvenanceFile {
  readonly entries: readonly SastProvenanceEntry[];
}

export function remapSastProvenance(
  provenance: SastProvenanceFile,
  oldToNew: ReadonlyMap<string, string>,
): SastProvenanceFile {
  const remapped: SastProvenanceEntry[] = [];
  const seen = new Set<string>();
  for (const entry of provenance.entries) {
    const nextReference = oldToNew.get(entry.exploit_ref);
    // Entries with no mapping belong to findings the remap dropped (blocked or filtered out),
    // so their provenance is dropped with them rather than kept pointing at a dead reference.
    if (nextReference === undefined) continue;
    if (seen.has(nextReference))
      throw new RenumberError('key-set-divergence', false, { checkCode: 'provenance-duplicate' });
    seen.add(nextReference);
    remapped.push({ ...entry, exploit_ref: nextReference });
  }
  return { entries: remapped };
}

function sha256(contents: string): string {
  return createHash('sha256').update(contents, 'utf8').digest('hex');
}

export function sparseExploitCollectorPath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_exploit_collector.json`;
}

export function renumberedExploitCollectorPath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_exploit_collector_renumbered.json`;
}

export function exploitationEvidencePath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_exploitation_evidence.md`;
}

export function renumberMapPath(vulnerabilityClass: ReconciliationClass): string {
  return `${vulnerabilityClass}_renumber_map.json`;
}

export function renumberedSastProvenancePath(vulnerabilityClass: ReconciliationClass): string {
  return `sast_provenance_${vulnerabilityClass}_renumbered.json`;
}

export interface RenumberProducts extends RenumberMap {
  readonly evidenceMarkdown: string;
  readonly provenance?: SastProvenanceFile;
}

function parseProvenance(value: unknown, vulnerabilityClass: ReconciliationClass): SastProvenanceFile {
  if (value === null || typeof value !== 'object' || !Array.isArray((value as { entries?: unknown }).entries)) {
    return divergence('provenance-malformed', vulnerabilityClass);
  }
  const entries = (value as { entries: unknown[] }).entries;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry === null || typeof entry !== 'object')
      return divergence('provenance-entry-malformed', vulnerabilityClass);
    const reference = (entry as { exploit_ref?: unknown }).exploit_ref;
    if (
      typeof reference !== 'string' ||
      parseRefNumber(reference, vulnerabilityClass) === null ||
      seen.has(reference)
    ) {
      return divergence('provenance-reference-invalid', vulnerabilityClass);
    }
    seen.add(reference);
  }
  return value as SastProvenanceFile;
}

/**
 * Trust SAST provenance only after proving the whole committed publication around it: the class
 * manifest is present, every consumer file matches its recorded digest, the queue's references
 * agree with the manifest lineage in order, the collector references all fall inside that
 * lineage, and every provenance entry points at a SAST-backed task. Returns undefined when the
 * class published no provenance file; any other gap is a divergence, since partial trust here
 * would let a stale or tampered file relabel findings in the customer report.
 */
async function loadAndValidateProvenance(
  dir: string,
  vulnerabilityClass: ReconciliationClass,
  collectorReferences: ReadonlySet<string>,
): Promise<SastProvenanceFile | undefined> {
  const manifestRead = await readPublishedManifest(dir, `${vulnerabilityClass}_reconciliation_manifest.json`);
  if (manifestRead.state !== 'present') return divergence('manifest-not-present', vulnerabilityClass);
  if (manifestRead.manifest.vulnerability_class !== vulnerabilityClass) {
    return divergence('manifest-class-mismatch', vulnerabilityClass);
  }

  const consumerContents = new Map<string, string>();
  for (const consumer of manifestRead.manifest.consumer_files) {
    const read = await readCommittedFile(dir, consumer.path);
    if (read.state !== 'present' || sha256(read.contents) !== consumer.sha256) {
      return divergence('manifest-consumer-digest-mismatch', vulnerabilityClass);
    }
    consumerContents.set(consumer.path, read.contents);
  }

  const taskUniverse = new Set(Object.keys(manifestRead.manifest.lineage));
  const queueContents = consumerContents.get(`${vulnerabilityClass}_exploitation_queue.json`);
  if (queueContents === undefined) return divergence('manifest-queue-consumer-missing', vulnerabilityClass);
  let queue: unknown;
  try {
    queue = JSON.parse(queueContents) as unknown;
  } catch {
    return divergence('manifest-queue-not-json', vulnerabilityClass);
  }
  if (
    queue === null ||
    typeof queue !== 'object' ||
    !Array.isArray((queue as { vulnerabilities?: unknown }).vulnerabilities)
  ) {
    return divergence('manifest-queue-malformed', vulnerabilityClass);
  }
  const lineageReferences = Object.keys(manifestRead.manifest.lineage);
  const queueReferences = (queue as { vulnerabilities: unknown[] }).vulnerabilities.map((entry) =>
    entry !== null && typeof entry === 'object' ? (entry as { ID?: unknown }).ID : undefined,
  );
  if (
    queueReferences.length !== lineageReferences.length ||
    queueReferences.some((reference, index) => reference !== lineageReferences[index])
  ) {
    return divergence('manifest-queue-lineage-mismatch', vulnerabilityClass);
  }
  for (const reference of collectorReferences) {
    if (!taskUniverse.has(reference)) return divergence('collector-reference-outside-publication', vulnerabilityClass);
  }

  const provenanceRelPath = sastProvenancePath(vulnerabilityClass);
  const manifestConsumer = manifestRead.manifest.consumer_files.find((consumer) => consumer.path === provenanceRelPath);
  if (manifestConsumer === undefined) return undefined;
  const provenanceContents = consumerContents.get(provenanceRelPath);
  if (provenanceContents === undefined) return divergence('provenance-digest-mismatch', vulnerabilityClass);
  let decoded: unknown;
  try {
    decoded = JSON.parse(provenanceContents);
  } catch {
    return divergence('provenance-not-json', vulnerabilityClass);
  }
  const provenance = parseProvenance(decoded, vulnerabilityClass);
  for (const entry of provenance.entries) {
    if (!taskUniverse.has(entry.exploit_ref))
      return divergence('provenance-reference-outside-publication', vulnerabilityClass);
    const lineage = manifestRead.manifest.lineage[entry.exploit_ref];
    if (
      lineage === undefined ||
      ![lineage.primary, ...lineage.absorbed].some((producerId) => isProducerId(producerId, vulnerabilityClass, 'SAST'))
    ) {
      return divergence('provenance-reference-not-sast-backed', vulnerabilityClass);
    }
  }
  return provenance;
}

export async function computeRenumber(
  dir: string,
  vulnerabilityClass: ReconciliationClass,
): Promise<RenumberProducts | null> {
  const collectorRead = await readCommittedFile(dir, sparseExploitCollectorPath(vulnerabilityClass));
  if (collectorRead.state === 'absent') return null;
  if (collectorRead.state === 'corrupt') throw new RenumberError('unmappable-survivor', false);

  let decoded: unknown;
  try {
    decoded = JSON.parse(collectorRead.contents);
  } catch {
    throw new RenumberError('unmappable-survivor', false);
  }
  if (!Array.isArray(decoded)) throw new RenumberError('unmappable-survivor', false);
  const map = buildRenumberMap(decoded as AddExploitInput[], vulnerabilityClass);
  const collectorReferences = new Set<string>([
    ...map.oldToNew.keys(),
    ...map.excluded.map((entry) => entry.source_ref),
  ]);
  const sparseProvenance = await loadAndValidateProvenance(dir, vulnerabilityClass, collectorReferences);
  // The renderer's empty-state banner describes an empty queue, but an empty renumbered set
  // means every queued finding failed exploitation, so the wording is corrected here.
  const evidenceMarkdown = renderExploitDeliverable(
    vulnerabilityClass,
    map.renumbered,
    new Map<string, string>(),
  ).replace(
    '*No vulnerabilities were available in the queue for exploitation.*',
    '*No vulnerabilities were confirmed during exploitation.*',
  );
  return {
    ...map,
    evidenceMarkdown,
    ...(sparseProvenance !== undefined && { provenance: remapSastProvenance(sparseProvenance, map.oldToNew) }),
  };
}

export function renumberOutputFiles(
  vulnerabilityClass: ReconciliationClass,
  products: RenumberProducts,
): ExactOutputFile[] {
  return [
    {
      relPath: renumberedExploitCollectorPath(vulnerabilityClass),
      contents: `${JSON.stringify(products.renumbered, null, 2)}\n`,
    },
    { relPath: exploitationEvidencePath(vulnerabilityClass), contents: products.evidenceMarkdown },
    {
      relPath: renumberMapPath(vulnerabilityClass),
      contents: `${JSON.stringify(
        {
          vulnerability_type: vulnerabilityClass,
          map: Object.fromEntries(products.oldToNew),
          order: products.order,
          excluded: products.excluded,
        },
        null,
        2,
      )}\n`,
    },
    ...(products.provenance === undefined
      ? []
      : [
          {
            relPath: renumberedSastProvenancePath(vulnerabilityClass),
            contents: `${JSON.stringify(products.provenance, null, 2)}\n`,
          },
        ]),
  ];
}

export interface RenumberClassResult {
  readonly vulnerabilityClass: ReconciliationClass;
  readonly renumberedCount: number;
  readonly skipped: boolean;
  readonly commit?: ExactOutputCommit;
}

/** Service boundary behind the Temporal activity wrapper. Skips when the class has no collector. */
export async function renumberClassFindings(args: {
  readonly deliverablesDir: string;
  readonly vulnerabilityClass: ReconciliationClass;
  readonly logger: ActivityLogger;
}): Promise<RenumberClassResult> {
  const products = await computeRenumber(args.deliverablesDir, args.vulnerabilityClass);
  if (products === null) {
    return { vulnerabilityClass: args.vulnerabilityClass, renumberedCount: 0, skipped: true };
  }
  const commit = await writeAndCommitExactFiles(
    args.deliverablesDir,
    renumberOutputFiles(args.vulnerabilityClass, products),
    `Renumber ${args.vulnerabilityClass} to dense report references`,
    args.logger,
  );
  return {
    vulnerabilityClass: args.vulnerabilityClass,
    renumberedCount: products.renumbered.length,
    skipped: false,
    commit,
  };
}
