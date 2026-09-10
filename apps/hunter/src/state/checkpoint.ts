/**
 * Resumable hunt checkpoint.
 *
 * Everything the adaptive loop needs to pick back up after an interruption
 * — which round it was on, every hypothesis and action (queued, done, or
 * skipped), which (action-kind, target) pairs are already completed, and
 * which observations/findings have already been folded in — lives in one
 * JSON file per engagement. `pipeline/adaptive-loop.ts` loads this before
 * starting a round and saves it after every action, so a killed process
 * loses at most one in-flight action.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  err,
  type HuntAction,
  type HuntEvent,
  type Hypothesis,
  ok,
  type ReasoningDecision,
  type Result,
} from '../types.js';

export type HuntStatus = 'in-progress' | 'completed' | 'stopped';

export interface HuntCheckpoint {
  readonly engagementId: string;
  readonly round: number;
  readonly hypotheses: readonly Hypothesis[];
  readonly actions: readonly HuntAction[];
  readonly completedActionKeys: readonly string[];
  readonly observationIds: readonly string[];
  readonly findingIds: readonly string[];
  /** Every reasoning-provider proposal this hunt has made, accepted or not — the audit trail for section 9/10's "store this decision" requirement. */
  readonly decisions: readonly ReasoningDecision[];
  /** Structured, per-round observability log (see types.ts:HuntEvent). */
  readonly events: readonly HuntEvent[];
  readonly status: HuntStatus;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export function newCheckpoint(engagementId: string): HuntCheckpoint {
  const now = new Date().toISOString();
  return {
    engagementId,
    round: 0,
    hypotheses: [],
    actions: [],
    completedActionKeys: [],
    observationIds: [],
    findingIds: [],
    decisions: [],
    events: [],
    status: 'in-progress',
    startedAt: now,
    updatedAt: now,
  };
}

export function checkpointFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'checkpoint.json');
}

export async function saveCheckpoint(workspaceDir: string, checkpoint: HuntCheckpoint): Promise<void> {
  const filePath = checkpointFilePath(workspaceDir, checkpoint.engagementId);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
}

/** Returns a fresh checkpoint (not an error) when none exists yet — resuming a hunt that never started is just starting it. */
export async function loadCheckpoint(
  workspaceDir: string,
  engagementId: string,
): Promise<Result<HuntCheckpoint, string>> {
  const filePath = checkpointFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ok(newCheckpoint(engagementId));
    }
    return err(`could not read hunt checkpoint "${filePath}": ${(error as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw) as Partial<HuntCheckpoint>;
    // Defensive default-fill for a checkpoint written before decisions/events existed.
    return ok({ decisions: [], events: [], ...parsed } as HuntCheckpoint);
  } catch (error) {
    return err(`hunt checkpoint file "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}
