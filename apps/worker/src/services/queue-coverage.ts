// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Reads the exploitation deliverables back for the queue entries that never reached a verdict.
 *
 * The exploit renderer already names them, one class at a time, under `## Unprocessed
 * Vulnerabilities`. That list is read back here rather than recomputed from the report agent's
 * findings: a finding the report agent leaves out because the exploit phase ruled it out did
 * reach a verdict, and counting it as a coverage gap would misstate the assessment.
 */

import { fs, path } from 'zx';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ALL_VULN_CLASSES } from '../types/config.js';
import { UNPROCESSED_HEADING } from './exploit-renderer.js';
import type { UnassessedQueueEntry } from './report-renderer.js';

/** Matches `- {ID}` and `- {ID} ({vulnerability_type})`, the two shapes the renderer emits. */
const UNPROCESSED_ENTRY_PATTERN = /^-\s+(\S+?)(?:\s+\((.+)\))?$/;

function parseUnprocessedSection(markdown: string): UnassessedQueueEntry[] {
  const lines = markdown.split('\n');
  const headingIndex = lines.findIndex((line) => line.trim() === UNPROCESSED_HEADING);
  if (headingIndex === -1) return [];

  const entries: UnassessedQueueEntry[] = [];
  for (const line of lines.slice(headingIndex + 1)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('## ')) break;
    const match = UNPROCESSED_ENTRY_PATTERN.exec(trimmed);
    if (!match?.[1]) continue;
    entries.push({ id: match[1], ...(match[2] && { vulnerability_type: match[2] }) });
  }
  return entries;
}

/**
 * Collect every queue entry the exploitation phase left without a verdict, across all classes.
 *
 * A class with no exploitation evidence contributes nothing: either no exploit phase ran for it,
 * or the class failed outright and is already reported as not assessed.
 */
export async function collectUnassessedQueueEntries(
  deliverablesPath: string,
  logger: ActivityLogger,
): Promise<UnassessedQueueEntry[]> {
  const entries: UnassessedQueueEntry[] = [];

  for (const vulnClass of ALL_VULN_CLASSES) {
    const evidencePath = path.join(deliverablesPath, `${vulnClass}_exploitation_evidence.md`);
    if (!(await fs.pathExists(evidencePath))) continue;

    try {
      const markdown = await fs.readFile(evidencePath, 'utf8');
      entries.push(...parseUnprocessedSection(markdown));
    } catch (error) {
      const err = error as Error;
      logger.warn(`Could not read ${vulnClass} exploitation evidence for coverage: ${err.message}`);
    }
  }

  return entries;
}
