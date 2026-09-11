/**
 * Hunt memory.
 *
 * A structured, provenance-tracked experience layer — never a claim that
 * any model here "learns" or retrains. Every entry is derived from a
 * concluded `Finding` (a terminal or near-terminal status only — never
 * from an unconfirmed "candidate"/"investigated" finding, so an unverified
 * guess can never become a remembered "fact") and carries its own
 * confidence and `Provenance`, exactly like every other record in this
 * package. `prioritizationMultiplier` is the only way memory is allowed to
 * influence a future hunt: a bounded nudge to scoring, never a hard
 * decision, and never a substitute for real evidence in the current
 * engagement.
 *
 * Persisted once per workspace (not per engagement) at
 * `<workspaceDir>/hunt-memory.jsonl`, append-only, mirroring
 * `evidence/store.ts`'s JSON-Lines convention.
 */

import { randomUUID } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { ActionKind, Finding, FindingStatus, Hypothesis, Provenance } from '../types.js';
import { err, ok, type Result } from '../types.js';

export type HuntMemoryKind =
  | 'successful-hypothesis-pattern'
  | 'failed-hypothesis-pattern'
  | 'false-positive-pattern'
  | 'validation-outcome'
  | 'tool-usefulness';

export type HuntMemoryOutcome = 'positive' | 'negative';

export interface HuntMemoryEntry {
  readonly id: string;
  readonly kind: HuntMemoryKind;
  readonly description: string;
  readonly vulnClass: string | undefined;
  readonly actionKind: ActionKind | undefined;
  readonly confidence: number;
  readonly provenance: Provenance;
  readonly outcome: HuntMemoryOutcome;
  readonly recordedAt: string;
}

export interface NewMemoryEntryInput {
  readonly kind: HuntMemoryKind;
  readonly description: string;
  readonly outcome: HuntMemoryOutcome;
  readonly confidence: number;
  readonly source: string;
  readonly vulnClass?: string;
  readonly actionKind?: ActionKind;
}

export function recordMemory(input: NewMemoryEntryInput): HuntMemoryEntry {
  const now = new Date().toISOString();
  return {
    id: `memory-${randomUUID()}`,
    kind: input.kind,
    description: input.description,
    vulnClass: input.vulnClass,
    actionKind: input.actionKind,
    confidence: input.confidence,
    provenance: { source: input.source, discoveredAt: now, confidence: input.confidence },
    outcome: input.outcome,
    recordedAt: now,
  };
}

export function huntMemoryFilePath(workspaceDir: string): string {
  return join(workspaceDir, 'hunt-memory.jsonl');
}

export async function appendMemory(workspaceDir: string, entry: HuntMemoryEntry): Promise<void> {
  const filePath = huntMemoryFilePath(workspaceDir);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
}

export async function loadMemory(workspaceDir: string): Promise<Result<readonly HuntMemoryEntry[], string>> {
  const filePath = huntMemoryFilePath(workspaceDir);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok([]);
    }
    return err(`could not read hunt memory "${filePath}": ${(error as Error).message}`);
  }
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const entries: HuntMemoryEntry[] = [];
  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as HuntMemoryEntry);
    } catch (error) {
      return err(`hunt memory file "${filePath}" contains an invalid line: ${(error as Error).message}`);
    }
  }
  return ok(entries);
}

/** Findings concluded enough that their outcome is safe to remember — never a still-open "candidate"/"investigated" finding. */
const TERMINAL_ENOUGH_STATUSES: ReadonlySet<FindingStatus> = new Set([
  'independently_validated',
  'impact_demonstrated',
  'deduplicated',
  'report_ready',
  'reported',
  'rejected',
  'duplicate',
]);

const POSITIVE_STATUSES: ReadonlySet<FindingStatus> = new Set([
  'independently_validated',
  'impact_demonstrated',
  'deduplicated',
  'report_ready',
  'reported',
]);

/**
 * Derives memory entries from one concluded finding and the hypothesis it
 * came from — a positive pattern for a finding that survived to
 * independent validation or further, a negative/false-positive pattern for
 * one that was ultimately rejected. Returns nothing for a finding that has
 * not concluded yet.
 */
export function memoryFromFinding(
  finding: Finding,
  hypothesis: Hypothesis,
  source: string,
): readonly HuntMemoryEntry[] {
  if (!TERMINAL_ENOUGH_STATUSES.has(finding.status)) {
    return [];
  }
  const positive = POSITIVE_STATUSES.has(finding.status);
  const entries: HuntMemoryEntry[] = [
    recordMemory({
      kind: positive ? 'successful-hypothesis-pattern' : 'failed-hypothesis-pattern',
      description: `hypothesis "${hypothesis.statement}" concluded as "${finding.status}"`,
      outcome: positive ? 'positive' : 'negative',
      confidence: finding.confidence,
      source,
      vulnClass: hypothesis.vulnClass,
    }),
  ];
  if (finding.status === 'rejected' && (hypothesis.structuredContradictions?.length ?? 0) > 0) {
    entries.push(
      recordMemory({
        kind: 'false-positive-pattern',
        description: `hypothesis "${hypothesis.statement}" was a false positive: ${hypothesis.structuredContradictions?.map((c) => c.note).join('; ')}`,
        outcome: 'negative',
        confidence: 0.6,
        source,
        vulnClass: hypothesis.vulnClass,
      }),
    );
  }
  return entries;
}

const MULTIPLIER_STEP = 0.1;
const MIN_MULTIPLIER = 0.5;
const MAX_MULTIPLIER = 1.5;

/**
 * A bounded prioritization nudge derived from prior experience with this
 * vulnClass (and, if supplied, this action kind) — never a hard include/
 * exclude decision, and clamped so memory can never dominate the current
 * engagement's own evidence.
 */
export function prioritizationMultiplier(
  memory: readonly HuntMemoryEntry[],
  vulnClass: string,
  actionKind?: ActionKind,
): number {
  const relevant = memory.filter(
    (m) =>
      m.vulnClass?.toLowerCase() === vulnClass.toLowerCase() &&
      (actionKind === undefined || m.actionKind === actionKind),
  );
  const positives = relevant.filter((m) => m.outcome === 'positive').length;
  const negatives = relevant.filter((m) => m.outcome === 'negative').length;
  const raw = 1 + MULTIPLIER_STEP * positives - MULTIPLIER_STEP * negatives;
  return Number(Math.min(MAX_MULTIPLIER, Math.max(MIN_MULTIPLIER, raw)).toFixed(4));
}
