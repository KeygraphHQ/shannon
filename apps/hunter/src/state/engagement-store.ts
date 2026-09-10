/**
 * Engagement/state persistence.
 *
 * An engagement is the durable record of one authorized hunt: which program,
 * which validated targets, which pipeline phase it has reached, and which
 * observations/findings/hypotheses belong to it. State lives as a single
 * JSON file per engagement under `<workspaceDir>/engagements/<id>/state.json`
 * so it can be inspected, diffed, and resumed without any database.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type Engagement,
  err,
  ok,
  PIPELINE_PHASES,
  type PipelinePhase,
  type Result,
  type ValidatedTarget,
} from '../types.js';

export function engagementFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'state.json');
}

export interface CreateEngagementInput {
  readonly id: string;
  readonly programId: string;
  readonly targets: readonly ValidatedTarget[];
}

export function newEngagement(input: CreateEngagementInput): Engagement {
  const now = new Date().toISOString();
  return {
    id: input.id,
    programId: input.programId,
    createdAt: now,
    updatedAt: now,
    phase: PIPELINE_PHASES[0],
    targets: input.targets,
    observationIds: [],
    findingIds: [],
    hypothesisIds: [],
  };
}

export async function saveEngagement(workspaceDir: string, engagement: Engagement): Promise<void> {
  const filePath = engagementFilePath(workspaceDir, engagement.id);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(engagement, null, 2)}\n`, 'utf8');
}

export async function loadEngagement(workspaceDir: string, engagementId: string): Promise<Result<Engagement, string>> {
  const filePath = engagementFilePath(workspaceDir, engagementId);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    return err(`could not read engagement state "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as Engagement);
  } catch (error) {
    return err(`engagement state "${filePath}" is not valid JSON: ${(error as Error).message}`);
  }
}

function phaseIndex(phase: PipelinePhase): number {
  return PIPELINE_PHASES.indexOf(phase);
}

/**
 * Advance an engagement to a new phase. Phases are monotonic — an engagement
 * can only move forward (or stay put to re-save the same phase), never
 * backward, matching the fixed workflow order in `PIPELINE_PHASES`.
 */
export function advancePhase(engagement: Engagement, nextPhase: PipelinePhase): Result<Engagement, string> {
  const currentIndex = phaseIndex(engagement.phase);
  const nextIndex = phaseIndex(nextPhase);
  if (nextIndex < currentIndex) {
    return err(`cannot move engagement "${engagement.id}" backward from phase "${engagement.phase}" to "${nextPhase}"`);
  }
  return ok({
    ...engagement,
    phase: nextPhase,
    updatedAt: new Date().toISOString(),
  });
}

function withUniqueIds(existing: readonly string[], added: readonly string[]): readonly string[] {
  return Array.from(new Set([...existing, ...added]));
}

export function withObservations(engagement: Engagement, observationIds: readonly string[]): Engagement {
  return {
    ...engagement,
    observationIds: withUniqueIds(engagement.observationIds, observationIds),
    updatedAt: new Date().toISOString(),
  };
}

export function withFindings(engagement: Engagement, findingIds: readonly string[]): Engagement {
  return {
    ...engagement,
    findingIds: withUniqueIds(engagement.findingIds, findingIds),
    updatedAt: new Date().toISOString(),
  };
}

export function withHypotheses(engagement: Engagement, hypothesisIds: readonly string[]): Engagement {
  return {
    ...engagement,
    hypothesisIds: withUniqueIds(engagement.hypothesisIds, hypothesisIds),
    updatedAt: new Date().toISOString(),
  };
}
