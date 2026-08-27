// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Deterministic post-report compaction over one coherent mixed reference set. */

import { REF_PREFIX } from '../ai/reconciliation/refs.js';
import type { AddExploitInput } from '../collectors/exploit-collector.js';
import type { AddFindingInput } from '../collectors/finding-collector.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import type { ExactOutputCommit, ExactOutputFile } from './exact-output-commit.js';
import { RenumberError, writeAndCommitExactFiles } from './exact-output-commit.js';
import { readCommittedFile } from './git-manager.js';
import type { ExcludedEntry, SastProvenanceFile } from './renumber-core.js';
import {
  pad2,
  parseRefNumber,
  remapSastProvenance,
  remapTaskReferences,
  renumberedExploitCollectorPath,
  renumberedSastProvenancePath,
  renumberMapPath,
} from './renumber-core.js';
import type { ReportData } from './report-renderer.js';

const PREFIXES_LONGEST_FIRST = (Object.entries(REF_PREFIX) as [ReconciliationClass, string][])
  .map(([vulnerabilityClass, prefix]) => ({ vulnerabilityClass, prefix }))
  .sort((first, second) => second.prefix.length - first.prefix.length);

export function vulnerabilityClassOfReference(reference: string): ReconciliationClass | null {
  for (const { vulnerabilityClass, prefix } of PREFIXES_LONGEST_FIRST) {
    if (reference.startsWith(`${prefix}-`) && parseRefNumber(reference, vulnerabilityClass) !== null) {
      return vulnerabilityClass;
    }
  }
  return null;
}

export interface RenumberMapFile {
  readonly vulnerability_type: ReconciliationClass;
  readonly map: Record<string, string>;
  readonly order: readonly string[];
  readonly excluded: readonly ExcludedEntry[];
}

export interface ClassCompaction {
  readonly vulnerabilityClass: ReconciliationClass;
  /** Dense renumbered reference to its gapless replacement; the map applied to artifact text. */
  readonly gapMap: ReadonlyMap<string, string>;
  /** Original stable reference straight to the gapless reference, composed across both hops. */
  readonly composedMap: ReadonlyMap<string, string>;
  readonly excluded: readonly ExcludedEntry[];
  /** Replacement renumber-map artifact, so the committed map always records stable-to-current. */
  readonly renumberMapFile: RenumberMapFile;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isRenumberMapFile(value: unknown, vulnerabilityClass: ReconciliationClass): value is RenumberMapFile {
  if (!isRecord(value) || value.vulnerability_type !== vulnerabilityClass) return false;
  if (!isRecord(value.map) || !Array.isArray(value.order) || !Array.isArray(value.excluded)) return false;
  const map = value.map;
  const entries = Object.entries(map);
  if (
    !entries.every(
      ([stable, dense]) =>
        parseRefNumber(stable, vulnerabilityClass) !== null &&
        typeof dense === 'string' &&
        parseRefNumber(dense, vulnerabilityClass) !== null,
    )
  ) {
    return false;
  }
  if (new Set(entries.map(([, dense]) => dense)).size !== entries.length) return false;
  if (
    value.order.length !== entries.length ||
    new Set(value.order).size !== value.order.length ||
    !value.order.every((stable) => typeof stable === 'string' && Object.hasOwn(map, stable))
  ) {
    return false;
  }
  return value.excluded.every((entry) => {
    if (!isRecord(entry)) return false;
    return (
      typeof entry.source_ref === 'string' &&
      parseRefNumber(entry.source_ref, vulnerabilityClass) !== null &&
      entry.reason === 'validation_blocked'
    );
  });
}

export function buildClassCompaction(
  vulnerabilityClass: ReconciliationClass,
  keptReferences: readonly string[],
  renumberMap: RenumberMapFile,
): ClassCompaction {
  if (!isRenumberMapFile(renumberMap, vulnerabilityClass)) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-map-malformed' });
  }
  const mintedReferences = new Set(Object.values(renumberMap.map));
  const uniqueKept = [...new Set(keptReferences)];
  for (const reference of uniqueKept) {
    if (!mintedReferences.has(reference)) {
      throw new RenumberError('unmappable-survivor', false, {
        checkCode: 'compaction-kept-reference-not-minted',
        vulnerabilityClass,
      });
    }
  }
  uniqueKept.sort(
    (first, second) =>
      (parseRefNumber(first, vulnerabilityClass) as number) - (parseRefNumber(second, vulnerabilityClass) as number),
  );

  const gapMap = new Map<string, string>();
  for (const [index, reference] of uniqueKept.entries()) {
    gapMap.set(reference, `${REF_PREFIX[vulnerabilityClass]}-${pad2(index + 1)}`);
  }

  const stableByDense = new Map<string, string>();
  for (const [stable, dense] of Object.entries(renumberMap.map)) stableByDense.set(dense, stable);
  const composedMap = new Map<string, string>();
  const order: string[] = [];
  for (const dense of uniqueKept) {
    const stable = stableByDense.get(dense);
    if (stable === undefined) {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-reverse-map-missing' });
    }
    composedMap.set(stable, gapMap.get(dense) as string);
    order.push(stable);
  }
  return {
    vulnerabilityClass,
    gapMap,
    composedMap,
    excluded: renumberMap.excluded,
    renumberMapFile: {
      vulnerability_type: vulnerabilityClass,
      map: Object.fromEntries(composedMap),
      order,
      excluded: renumberMap.excluded,
    },
  };
}

export function deepRemapStrings(value: unknown, gapMap: ReadonlyMap<string, string>): unknown {
  if (gapMap.size === 0) return value;
  if (typeof value === 'string') return remapTaskReferences(value, gapMap);
  if (Array.isArray(value)) return value.map((entry) => deepRemapStrings(entry, gapMap));
  if (value !== null && typeof value === 'object') {
    const remapped: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) remapped[key] = deepRemapStrings(entry, gapMap);
    return remapped;
  }
  return value;
}

export function remapExploitCollector(
  entries: readonly AddExploitInput[],
  classGapMap: ReadonlyMap<string, string>,
  allGapMap: ReadonlyMap<string, string>,
): AddExploitInput[] {
  const remapped: AddExploitInput[] = [];
  for (const entry of entries) {
    const reference = (entry as unknown as { vulnerability_id?: unknown }).vulnerability_id;
    if (typeof reference !== 'string') {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-collector-reference-missing' });
    }
    const gapless = classGapMap.get(reference);
    // A collector entry with no gap mapping is one the final report did not keep, so the
    // compacted collector drops it too instead of carrying a reference the report no longer
    // contains.
    if (gapless === undefined) continue;
    const rewritten = deepRemapStrings(entry, allGapMap) as Record<string, unknown>;
    remapped.push({ ...rewritten, vulnerability_id: gapless } as unknown as AddExploitInput);
  }
  return remapped;
}

/** Findings from excluded failed classes are returned by identity, including their cross-references. */
export function remapReportFindings(
  findings: readonly AddFindingInput[],
  allGapMap: ReadonlyMap<string, string>,
  excludedClasses: ReadonlySet<ReconciliationClass> = new Set(),
): AddFindingInput[] {
  return findings.map((finding) => {
    const vulnerabilityClass = vulnerabilityClassOfReference(finding.finding_id);
    if (vulnerabilityClass !== null && excludedClasses.has(vulnerabilityClass)) return finding;
    return deepRemapStrings(finding, allGapMap) as AddFindingInput;
  });
}

export function plannedReportReferenceOperations(exploit: boolean): readonly ('renumber' | 'compact')[] {
  return exploit ? ['renumber', 'compact'] : [];
}

function arraysEqual<T>(first: readonly T[], second: readonly T[]): boolean {
  return first.length === second.length && first.every((entry, index) => entry === second[index]);
}

function parseJson<T>(contents: string, checkCode: string): T {
  try {
    return JSON.parse(contents) as T;
  } catch {
    throw new RenumberError('key-set-divergence', false, { checkCode });
  }
}

async function readRequiredCommittedJson<T>(dir: string, relPath: string, checkCode: string): Promise<T> {
  const read = await readCommittedFile(dir, relPath);
  if (read.state !== 'present') throw new RenumberError('key-set-divergence', false, { checkCode });
  return parseJson<T>(read.contents, checkCode);
}

function parseSastProvenance(value: unknown): SastProvenanceFile {
  if (!isRecord(value) || !Array.isArray(value.entries)) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-provenance-malformed' });
  }
  for (const entry of value.entries) {
    if (!isRecord(entry) || typeof entry.exploit_ref !== 'string') {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-provenance-entry-malformed' });
    }
  }
  return value as unknown as SastProvenanceFile;
}

export interface CompactionResult {
  readonly compactedClasses: number;
  readonly skipped: boolean;
  readonly commit?: ExactOutputCommit;
}

/**
 * Compact every eligible participating class as one exact-path transaction.
 * Failed classes are skipped before any of their collector, map, or provenance paths are read.
 */
export async function compactReportFindings(args: {
  readonly deliverablesDir: string;
  readonly participatingClasses: readonly ReconciliationClass[];
  readonly renumberFailedClasses: readonly ReconciliationClass[];
  readonly logger: ActivityLogger;
}): Promise<CompactionResult> {
  const reportRead = await readCommittedFile(args.deliverablesDir, 'report.json');
  if (reportRead.state === 'absent') return { compactedClasses: 0, skipped: true };
  if (reportRead.state !== 'present') {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-report-unreadable' });
  }
  const report = parseJson<ReportData>(reportRead.contents, 'compaction-report-not-json');
  if (!isRecord(report) || !Array.isArray(report.findings)) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-report-malformed' });
  }
  // The failed-class set is read from two independent sources (the committed report and the
  // caller's own record of what renumbering skipped); they must agree before any path is read,
  // since a mismatch means compaction and the report disagree about which classes are trustworthy.
  const reportFailedClasses = report.reconciliation_failed ?? [];
  if (!arraysEqual(reportFailedClasses, args.renumberFailedClasses)) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-failed-class-set-mismatch' });
  }

  const participating = new Set(args.participatingClasses);
  const failed = new Set(args.renumberFailedClasses);
  if (participating.size !== args.participatingClasses.length || failed.size !== args.renumberFailedClasses.length) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-class-set-duplicate' });
  }
  if ([...failed].some((vulnerabilityClass) => !participating.has(vulnerabilityClass))) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-failed-class-outside-scope' });
  }

  const keptByClass = new Map<ReconciliationClass, string[]>();
  const seenFindingReferences = new Set<string>();
  for (const finding of report.findings) {
    if (typeof finding.finding_id !== 'string' || seenFindingReferences.has(finding.finding_id)) {
      throw new RenumberError('unmappable-survivor', false, { checkCode: 'compaction-report-reference-duplicate' });
    }
    seenFindingReferences.add(finding.finding_id);
    const vulnerabilityClass = vulnerabilityClassOfReference(finding.finding_id);
    if (vulnerabilityClass === null || !participating.has(vulnerabilityClass)) continue;
    const references = keptByClass.get(vulnerabilityClass) ?? [];
    references.push(finding.finding_id);
    keptByClass.set(vulnerabilityClass, references);
  }

  const compactions: Array<{
    compaction: ClassCompaction;
    collector: AddExploitInput[];
    provenance?: SastProvenanceFile;
  }> = [];
  for (const vulnerabilityClass of args.participatingClasses) {
    if (failed.has(vulnerabilityClass)) continue;
    const keptReferences = keptByClass.get(vulnerabilityClass) ?? [];
    const mapRead = await readCommittedFile(args.deliverablesDir, renumberMapPath(vulnerabilityClass));
    if (mapRead.state === 'absent') {
      // A class with no renumber map means renumbering never ran for it, so there is no
      // stable-to-dense mapping to compact against. If the report still kept references from
      // that class, the two artifacts have drifted and compaction must fail rather than guess.
      if (keptReferences.length > 0) {
        throw new RenumberError('unmappable-survivor', false, { checkCode: 'compaction-map-absent-for-survivor' });
      }
      continue;
    }
    if (mapRead.state !== 'present') {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-map-unreadable' });
    }
    const renumberMap = parseJson<RenumberMapFile>(mapRead.contents, 'compaction-map-not-json');
    const compaction = buildClassCompaction(vulnerabilityClass, keptReferences, renumberMap);
    const collector = await readRequiredCommittedJson<AddExploitInput[]>(
      args.deliverablesDir,
      renumberedExploitCollectorPath(vulnerabilityClass),
      'compaction-collector-unreadable',
    );
    if (!Array.isArray(collector)) {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-collector-malformed' });
    }

    const provenanceRead = await readCommittedFile(
      args.deliverablesDir,
      renumberedSastProvenancePath(vulnerabilityClass),
    );
    let provenance: SastProvenanceFile | undefined;
    if (provenanceRead.state === 'corrupt') {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'compaction-provenance-unreadable' });
    }
    if (provenanceRead.state === 'present') {
      provenance = parseSastProvenance(parseJson<unknown>(provenanceRead.contents, 'compaction-provenance-not-json'));
    }
    compactions.push({ compaction, collector, ...(provenance !== undefined && { provenance }) });
  }

  if (compactions.length === 0) return { compactedClasses: 0, skipped: true };

  const allGapMap = new Map<string, string>();
  for (const { compaction } of compactions) {
    for (const [source, destination] of compaction.gapMap) allGapMap.set(source, destination);
  }

  const files: ExactOutputFile[] = [];
  for (const { compaction, collector, provenance } of compactions) {
    files.push({
      relPath: renumberedExploitCollectorPath(compaction.vulnerabilityClass),
      contents: `${JSON.stringify(remapExploitCollector(collector, compaction.gapMap, allGapMap), null, 2)}\n`,
    });
    files.push({
      relPath: renumberMapPath(compaction.vulnerabilityClass),
      contents: `${JSON.stringify(compaction.renumberMapFile, null, 2)}\n`,
    });
    if (provenance !== undefined) {
      files.push({
        relPath: renumberedSastProvenancePath(compaction.vulnerabilityClass),
        contents: `${JSON.stringify(remapSastProvenance(provenance, compaction.gapMap), null, 2)}\n`,
      });
    }
  }

  const compactedReport = deepRemapStrings(report, allGapMap) as ReportData;
  const findings = remapReportFindings(report.findings, allGapMap, failed);
  files.push({
    relPath: 'report.json',
    contents: JSON.stringify({ ...compactedReport, findings }, null, 2),
  });
  const commit = await writeAndCommitExactFiles(
    args.deliverablesDir,
    files,
    'Compact surviving report references to dense gapless',
    args.logger,
  );
  return { compactedClasses: compactions.length, skipped: false, commit };
}
