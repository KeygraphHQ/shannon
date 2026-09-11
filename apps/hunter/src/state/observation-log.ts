/**
 * Observation persistence.
 *
 * Append-only JSON-lines log of every observation the hunt has ever
 * collected, across every recon layer and every round. This is what makes
 * the adaptive loop's finalization step (mapping a finding's
 * `observationIds` back to real observation content for evidence
 * descriptions and source-diversity checks) work after a resume, without
 * keeping anything only in memory.
 */

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { err, type Observation, ok, type Result } from '../types.js';

export function observationLogPath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'observations.jsonl');
}

export async function appendObservations(
  workspaceDir: string,
  engagementId: string,
  observations: readonly Observation[],
): Promise<void> {
  if (observations.length === 0) {
    return;
  }
  const filePath = observationLogPath(workspaceDir, engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  const lines = observations.map((o) => JSON.stringify(o)).join('\n');
  await appendFile(filePath, `${lines}\n`, 'utf8');
}

export async function listObservations(
  workspaceDir: string,
  engagementId: string,
): Promise<Result<readonly Observation[], string>> {
  const filePath = observationLogPath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(`could not read observation log "${filePath}": ${(error as Error).message}`);
  }
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const observations: Observation[] = [];
  for (const line of lines) {
    try {
      observations.push(JSON.parse(line) as Observation);
    } catch (error) {
      return err(`observation log "${filePath}" contains an invalid line: ${(error as Error).message}`);
    }
  }
  return ok(observations);
}
