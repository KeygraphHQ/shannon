/**
 * Finding lifecycle.
 *
 * A candidate finding moves through a strict state machine before it can
 * ever become a report draft: candidate -> investigated -> reproduced ->
 * independently_validated -> impact_demonstrated -> deduplicated ->
 * report_ready -> reported. A scanner hit or a hypothesis is never itself a
 * finding — `createFinding` always starts a finding at "candidate", and
 * every transition (including into "rejected") requires a non-empty reason,
 * appended to the finding's `transitionLog` so validation claims are never
 * unaccountable.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { err, type Finding, type FindingStatus, ok, type Result } from '../types.js';

export const ALLOWED_TRANSITIONS: Readonly<Record<FindingStatus, readonly FindingStatus[]>> = {
  candidate: ['investigated', 'rejected'],
  investigated: ['reproduced', 'rejected'],
  reproduced: ['independently_validated', 'rejected'],
  independently_validated: ['impact_demonstrated', 'rejected'],
  impact_demonstrated: ['duplicate', 'deduplicated', 'rejected'],
  duplicate: [],
  deduplicated: ['report_ready', 'rejected'],
  report_ready: ['reported', 'rejected'],
  reported: [],
  rejected: [],
};

export interface NewFindingInput {
  readonly engagementId: string;
  readonly title: string;
  readonly vulnClass: string;
  readonly assetRef: string;
  readonly confidence: number;
  readonly observationIds: readonly string[];
  readonly reason: string;
}

export function createFinding(input: NewFindingInput): Finding {
  const now = new Date().toISOString();
  return {
    id: `finding-${randomUUID()}`,
    engagementId: input.engagementId,
    title: input.title,
    vulnClass: input.vulnClass,
    assetRef: input.assetRef,
    status: 'candidate',
    confidence: input.confidence,
    observationIds: input.observationIds,
    evidenceIds: [],
    transitionLog: [{ status: 'candidate', at: now, reason: input.reason }],
    createdAt: now,
    updatedAt: now,
  };
}

export function canTransition(from: FindingStatus, to: FindingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function transitionFinding(finding: Finding, next: FindingStatus, reason: string): Result<Finding, string> {
  if (!canTransition(finding.status, next)) {
    return err(`finding "${finding.id}" cannot transition from "${finding.status}" to "${next}"`);
  }
  if (reason.trim().length === 0) {
    return err(`a non-empty reason is required to transition finding "${finding.id}" to "${next}"`);
  }
  const now = new Date().toISOString();
  return ok({
    ...finding,
    status: next,
    updatedAt: now,
    transitionLog: [...finding.transitionLog, { status: next, at: now, reason }],
  });
}

export function withEvidence(finding: Finding, evidenceIds: readonly string[]): Finding {
  return {
    ...finding,
    evidenceIds: Array.from(new Set([...finding.evidenceIds, ...evidenceIds])),
    updatedAt: new Date().toISOString(),
  };
}

export function isTerminal(status: FindingStatus): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}

export function findingFilePath(workspaceDir: string, engagementId: string, findingId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'findings', `${findingId}.json`);
}

export async function saveFinding(workspaceDir: string, finding: Finding): Promise<void> {
  const filePath = findingFilePath(workspaceDir, finding.engagementId, finding.id);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(finding, null, 2)}\n`, 'utf8');
}

export async function loadFinding(
  workspaceDir: string,
  engagementId: string,
  findingId: string,
): Promise<Result<Finding, string>> {
  const filePath = findingFilePath(workspaceDir, engagementId, findingId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    return err(`could not read finding "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as Finding);
  } catch (error) {
    return err(`finding file "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}

export async function listFindings(workspaceDir: string, engagementId: string): Promise<readonly Finding[]> {
  const dir = join(workspaceDir, 'engagements', engagementId, 'findings');
  const { readdir } = await import('node:fs/promises');
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }
  const findings: Finding[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const findingId = entry.slice(0, -'.json'.length);
    const loaded = await loadFinding(workspaceDir, engagementId, findingId);
    if (loaded.ok) {
      findings.push(loaded.value);
    }
  }
  return findings;
}
