// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Join analysis and SAST locations from committed report-facing tasks without mixing location lanes. */

import type { QueueCodeLocation } from '../ai/queue-schemas.js';
import type { SastSourceLocation } from '../ai/reconciliation/contracts.js';
import type { AddFindingInput } from '../collectors/finding-collector.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ALL_VULN_CLASSES } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import { readCommittedFile } from './git-manager.js';
import { renumberMapPath } from './renumber-core.js';

interface QueueEntry {
  ID?: string;
  code_locations?: QueueCodeLocation[];
  sast_source_location?: SastSourceLocation;
}

interface JoinedLocations {
  readonly codeLocations?: QueueCodeLocation[];
  readonly sastSourceLocation?: SastSourceLocation;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSastSourceLocation(value: unknown): value is SastSourceLocation {
  if (!isRecord(value)) return false;
  return (
    typeof value.file === 'string' &&
    value.file.length > 0 &&
    Number.isInteger(value.line) &&
    (value.line as number) > 0 &&
    Number.isInteger(value.column) &&
    (value.column as number) >= 0 &&
    typeof value.rule_id === 'string' &&
    value.rule_id.length > 0
  );
}

function parseJson(contents: string, description: string): unknown {
  try {
    return JSON.parse(contents) as unknown;
  } catch {
    throw new Error(`${description} is not valid JSON`);
  }
}

async function currentReferenceMap(
  deliverablesPath: string,
  vulnerabilityClass: ReconciliationClass,
): Promise<ReadonlyMap<string, string>> {
  const mapRead = await readCommittedFile(deliverablesPath, renumberMapPath(vulnerabilityClass));
  if (mapRead.state === 'absent') return new Map();
  if (mapRead.state !== 'present') throw new Error(`${vulnerabilityClass} report-reference map is unreadable`);
  const decoded = parseJson(mapRead.contents, `${vulnerabilityClass} report-reference map`);
  if (!isRecord(decoded) || !isRecord(decoded.map)) {
    throw new Error(`${vulnerabilityClass} report-reference map is malformed`);
  }
  const references = new Map<string, string>();
  for (const [stable, current] of Object.entries(decoded.map)) {
    if (typeof current !== 'string') throw new Error(`${vulnerabilityClass} report-reference map is malformed`);
    references.set(stable, current);
  }
  return references;
}

async function loadQueueLocations(
  deliverablesPath: string,
  participatingClasses: readonly ReconciliationClass[],
): Promise<Map<string, JoinedLocations>> {
  const locations = new Map<string, JoinedLocations>();
  for (const vulnerabilityClass of participatingClasses) {
    const queueRead = await readCommittedFile(deliverablesPath, `${vulnerabilityClass}_exploitation_queue.json`);
    if (queueRead.state === 'absent') continue;
    if (queueRead.state !== 'present') throw new Error(`${vulnerabilityClass} queue is unreadable`);
    const decoded = parseJson(queueRead.contents, `${vulnerabilityClass} queue`);
    if (!isRecord(decoded) || !Array.isArray(decoded.vulnerabilities)) {
      throw new Error(`${vulnerabilityClass} queue is malformed`);
    }
    const referenceMap = await currentReferenceMap(deliverablesPath, vulnerabilityClass);
    for (const rawEntry of decoded.vulnerabilities) {
      if (!isRecord(rawEntry) || typeof rawEntry.ID !== 'string') continue;
      const stableReference = rawEntry.ID;
      const entry = rawEntry as QueueEntry;
      const bundle: JoinedLocations = {
        ...(Array.isArray(entry.code_locations) && entry.code_locations.length > 0
          ? { codeLocations: entry.code_locations }
          : {}),
        ...(isSastSourceLocation(entry.sast_source_location) ? { sastSourceLocation: entry.sast_source_location } : {}),
      };
      if (bundle.codeLocations === undefined && bundle.sastSourceLocation === undefined) continue;
      locations.set(stableReference, bundle);
      const currentReference = referenceMap.get(stableReference);
      if (currentReference !== undefined) locations.set(currentReference, bundle);
    }
  }
  return locations;
}

/** Attach the two independent location fields without consulting exploit-inspection locations. */
export async function attachQueueCodeLocations(
  findings: readonly AddFindingInput[],
  deliverablesPath: string,
  logger: ActivityLogger,
  participatingClasses: readonly ReconciliationClass[] = ALL_VULN_CLASSES,
): Promise<AddFindingInput[]> {
  const byReference = await loadQueueLocations(deliverablesPath, participatingClasses);
  let analysisMatches = 0;
  let sastMatches = 0;
  const joined = findings.map((finding) => {
    const locations = byReference.get(finding.finding_id);
    if (locations === undefined) return finding;
    if (locations.codeLocations !== undefined) analysisMatches++;
    if (locations.sastSourceLocation !== undefined) sastMatches++;
    return {
      ...finding,
      ...(locations.codeLocations !== undefined && { code_locations: locations.codeLocations }),
      ...(locations.sastSourceLocation !== undefined && { sast_source_location: locations.sastSourceLocation }),
    };
  });
  logger.info('Attached committed report-task locations', {
    findings: findings.length,
    analysisMatches,
    sastMatches,
  });
  return joined;
}
