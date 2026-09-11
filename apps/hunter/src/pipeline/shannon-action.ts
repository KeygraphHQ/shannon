/**
 * Shared Shannon action execution.
 *
 * The one authoritative path that turns a "shannon"-kind `HuntAction` into
 * either a safe dry-run plan (the default) or a real, explicitly-confirmed
 * live execution — extracted here from `pipeline/adaptive-loop.ts` so
 * `pipeline/research-track.ts` can reuse the exact same logic instead of a
 * second implementation. Every rule this module enforces is unchanged from
 * the original: `shannon/eligibility.ts` (a real local repo must exist),
 * `shannon/config.ts`'s verified invocation builder, and `confirmed: true`
 * as the only thing that can make
 * `shannon/execution-adapter.ts:executeShannonAction` — the only function
 * in this entire package that can spawn a process — actually run.
 *
 * Neither caller ever sets `liveShannon.confirmed` on its own; it is always
 * threaded through from an explicit, top-level operator decision
 * (`AdaptiveHuntInput.liveShannon` for the primary loop,
 * `AdaptiveHuntInput.researchTrack.live.shannon` for the research track).
 */

import { readFile } from 'node:fs/promises';
import { ingestShannonOutput, parseShannonReport } from '../ingestion/shannon-output.js';
import { buildShannonInvocation } from '../shannon/config.js';
import { checkShannonEligibility } from '../shannon/eligibility.js';
import { executeShannonAction, type SpawnFn } from '../shannon/execution-adapter.js';
import { planInvocation } from '../shannon/invoke.js';
import type { ExecutionStatus, HuntAction, Observation, RawDiscovery } from '../types.js';

export interface LiveShannonOptions {
  readonly confirmed: boolean;
  readonly spawnImpl?: SpawnFn;
  readonly timeoutMs?: number;
}

export interface ShannonActionContext {
  readonly repoPath: string | undefined;
  readonly engagementId: string;
  readonly workspaceDir: string;
  /** assetRef -> path to a captured Shannon report.json-shaped file, ingested only when liveShannon is not confirmed. */
  readonly shannonOutputsByAsset: ReadonlyMap<string, string>;
  /** Explicit, separate confirmation required before Shannon executes for real instead of reading shannonOutputsByAsset. */
  readonly liveShannon: LiveShannonOptions | undefined;
}

export interface ShannonActionResult {
  readonly discoveries: readonly RawDiscovery[];
  readonly observations: readonly Observation[];
  readonly resultSummary: string;
  readonly skipped: boolean;
  readonly failed: boolean;
  readonly executionStatus: ExecutionStatus;
  readonly toolName: 'shannon';
}

/**
 * The single authoritative "shannon" action-execution path — never call
 * `shannon/execution-adapter.ts` directly from anywhere else. Two modes:
 *
 * - `ctx.liveShannon?.confirmed` -> real execution via
 *   `executeShannonAction`.
 * - otherwise -> a safe dry-run plan, optionally ingesting a
 *   caller-supplied captured `report.json`-shaped fixture for this asset
 *   from `ctx.shannonOutputsByAsset`.
 *
 * A failed or unavailable execution is always reported as such (`FAILED`/
 * `UNAVAILABLE`) and never produces an observation — there is no code path
 * here that can turn "Shannon didn't run" or "Shannon errored" into a
 * usable-looking result.
 */
export async function executeShannonHuntAction(
  action: HuntAction,
  ctx: ShannonActionContext,
): Promise<ShannonActionResult> {
  const eligibility = await checkShannonEligibility(ctx.repoPath);
  if (!eligibility.eligible) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: `Shannon skipped: ${eligibility.reason}`,
      skipped: true,
      failed: false,
      executionStatus: 'UNAVAILABLE',
      toolName: 'shannon',
    };
  }
  const built = buildShannonInvocation({ url: action.targetRef, repo: ctx.repoPath as string });
  if (!built.ok) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: `Shannon skipped: ${built.error}`,
      skipped: true,
      failed: false,
      executionStatus: 'UNAVAILABLE',
      toolName: 'shannon',
    };
  }
  const plan = planInvocation(built.value);

  if (ctx.liveShannon?.confirmed) {
    const execResult = await executeShannonAction(built.value, {
      confirmed: true,
      engagementId: ctx.engagementId,
      workspaceDir: ctx.workspaceDir,
      ...(ctx.liveShannon.spawnImpl !== undefined ? { spawnImpl: ctx.liveShannon.spawnImpl } : {}),
      ...(ctx.liveShannon.timeoutMs !== undefined ? { timeoutMs: ctx.liveShannon.timeoutMs } : {}),
    });
    if (!execResult.ok) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `Shannon live execution failed: ${execResult.error}`,
        skipped: false,
        failed: true,
        executionStatus: 'FAILED',
        toolName: 'shannon',
      };
    }
    const { exitCode, timedOut, observations } = execResult.value;
    const shannonExecutionStatus: ExecutionStatus =
      exitCode !== 0 ? 'FAILED' : observations.length > 0 ? 'EXECUTED_WITH_RESULTS' : 'EXECUTED_NO_RESULTS';
    return {
      discoveries: [],
      observations,
      resultSummary: `Shannon executed live (${plan.commandLine}); exit ${exitCode}${timedOut ? ' (timed out)' : ''}; ingested ${observations.length} observation(s)`,
      skipped: false,
      failed: exitCode !== 0,
      executionStatus: shannonExecutionStatus,
      toolName: 'shannon',
    };
  }

  const fixturePath = ctx.shannonOutputsByAsset.get(action.targetRef);
  if (!fixturePath) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: `planned Shannon invocation (dry-run, never executed): ${plan.commandLine}; no captured output available yet for this asset`,
      skipped: false,
      failed: false,
      executionStatus: 'UNAVAILABLE',
      toolName: 'shannon',
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(fixturePath, 'utf8'));
  } catch (error) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: `Shannon output ingestion failed: ${(error as Error).message}`,
      skipped: true,
      failed: false,
      executionStatus: 'FAILED',
      toolName: 'shannon',
    };
  }
  const parsed = parseShannonReport(raw);
  if (!parsed.ok) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: `Shannon output ingestion failed: ${parsed.error}`,
      skipped: true,
      failed: false,
      executionStatus: 'FAILED',
      toolName: 'shannon',
    };
  }
  const observations = ingestShannonOutput(parsed.value, ctx.engagementId);
  return {
    discoveries: [],
    observations,
    resultSummary: `planned Shannon invocation (dry-run, never executed): ${plan.commandLine}; ingested ${observations.length} observation(s) from captured output`,
    skipped: false,
    failed: false,
    executionStatus: 'MOCKED',
    toolName: 'shannon',
  };
}
