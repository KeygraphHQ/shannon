// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Attach vuln-queue code locations to collected findings.
 *
 * The vuln agent authors `code_locations` once, into its queue. Every stage after that used to
 * re-transcribe them — the exploit agent into its evidence, the report agent into `add_finding` —
 * and each hop lost some: 100% in the queue, 98% in the evidence, 42-63% by the report. Nothing
 * about the copy is a judgement call, and `finding_id` matches the queue `ID` exactly, so the
 * locations are joined here instead of being asked for again.
 */

import { fs, path } from 'zx';
import type { QueueCodeLocation } from '../ai/queue-schemas.js';
import type { AddFindingInput } from '../collectors/finding-collector.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ALL_VULN_CLASSES } from '../types/config.js';

interface QueueEntry {
  ID?: string;
  code_locations?: QueueCodeLocation[];
}

/** Read every per-class queue in the deliverables dir into an ID-to-locations map. */
async function loadQueueLocations(
  deliverablesPath: string,
  logger: ActivityLogger,
): Promise<Map<string, QueueCodeLocation[]>> {
  const locations = new Map<string, QueueCodeLocation[]>();

  for (const vulnClass of ALL_VULN_CLASSES) {
    const queuePath = path.join(deliverablesPath, `${vulnClass}_exploitation_queue.json`);
    if (!(await fs.pathExists(queuePath))) continue;

    try {
      const doc = (await fs.readJson(queuePath)) as { vulnerabilities?: QueueEntry[] };
      for (const entry of doc.vulnerabilities ?? []) {
        if (entry.ID && entry.code_locations && entry.code_locations.length > 0) {
          locations.set(entry.ID, entry.code_locations);
        }
      }
    } catch (error) {
      logger.warn(`Could not read ${vulnClass} queue for code locations: ${(error as Error).message}`);
    }
  }

  return locations;
}

/**
 * Return the findings with `code_locations` filled in from the queue.
 *
 * A finding with no matching queue entry keeps none — the join never invents one. Findings are
 * copied rather than mutated so the collector's own state stays untouched.
 */
export async function attachQueueCodeLocations(
  findings: readonly AddFindingInput[],
  deliverablesPath: string,
  logger: ActivityLogger,
): Promise<AddFindingInput[]> {
  const byId = await loadQueueLocations(deliverablesPath, logger);
  if (byId.size === 0) return [...findings];

  let matched = 0;
  const joined = findings.map((finding) => {
    const locations = byId.get(finding.finding_id);
    if (!locations) return finding;
    matched += 1;
    return { ...finding, code_locations: locations };
  });

  logger.info(`Attached code locations to ${matched}/${findings.length} finding(s) from the vuln queues`);
  return joined;
}
