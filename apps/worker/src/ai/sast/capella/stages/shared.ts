// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CapellaAgentError } from '../../../pi/capella-agent-executor.js';
import type { CapellaAgentResponse } from '../../../pi/capella-agent-types.js';
import type { AgenticSastReduction, CapellaStage, CapellaUsage, SarifRef } from '../../types.js';
import {
  atomicPublishBytes,
  buildFingerprint,
  buildRunInputFingerprint,
  loadCompletedArtifact,
  publishStageArtifact,
  recordStageCompletion,
  repositoryIdentity,
  sha256Bytes,
  stableJson,
  stageArtifactPath,
} from '../artifacts.js';
import { SastContractError } from '../errors.js';
import type { CapellaFinding } from '../finding-types.js';
import type { CapellaArtifactRef, CapellaStageInput, CompletedStage, StageArtifactValidator } from '../types.js';
import { isAgenticSastReduction, isCapellaFinding } from '../validation.js';

export interface StageIdentity {
  readonly repositoryIdentity: string;
  readonly runInputFingerprint: string;
}

function reductionFromStageValue(value: unknown, stage: CapellaStage): AgenticSastReduction | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('reduction' in value)) return undefined;
  const reduction = (value as { readonly reduction?: unknown }).reduction;
  if (reduction === undefined) return undefined;
  if (!isAgenticSastReduction(reduction) || reduction.stage !== stage) {
    throw new SastContractError('Capella stage value carried an invalid reduction', 'REDUCTION_SCHEMA');
  }
  return reduction;
}

function completionReductions(
  value: unknown,
  stage: CapellaStage,
  additionalReductions: readonly AgenticSastReduction[],
): readonly AgenticSastReduction[] {
  const stageReduction = reductionFromStageValue(value, stage);
  return stageReduction === undefined ? additionalReductions : [stageReduction, ...additionalReductions];
}

export async function resolveStageIdentity(input: CapellaStageInput): Promise<StageIdentity> {
  const identity = await repositoryIdentity(input.repoPath);
  return {
    repositoryIdentity: identity,
    runInputFingerprint: buildRunInputFingerprint(input, identity),
  };
}

/**
 * Fingerprint that decides artifact reuse for a stage. Everything that can change the
 * stage's model-visible behavior must flow in through the rendered prompt or stageInputs;
 * an input missing here lets a stale artifact be adopted on resume.
 */
export function buildStageFingerprint(
  stage: CapellaStage,
  identity: StageIdentity,
  prompt: string,
  stageInputs: Record<string, unknown>,
): string {
  return buildFingerprint({
    stage,
    runInputFingerprint: identity.runInputFingerprint,
    renderedPromptSha256: sha256Bytes(prompt),
    ...stageInputs,
  });
}

/**
 * Adopt a previously published stage artifact when its fingerprint matches. Returns
 * undefined on any miss: absent or corrupt artifact, fingerprint mismatch, or a
 * reuseGuard veto. The optional reuseGuard re-checks on-disk side effects that the
 * artifact envelope cannot see. A hit atomically re-records completion and its
 * reduction in run.json, which heals a crash that landed between artifact publication
 * and the run-record write.
 */
export async function maybeReuseStage<T>(
  input: CapellaStageInput,
  stage: CapellaStage,
  fingerprint: string,
  validate: StageArtifactValidator<T>,
  identity: StageIdentity,
  startedAt: number,
  reuseGuard?: (value: T) => Promise<boolean>,
): Promise<CompletedStage<T> | undefined> {
  const loaded = await loadCompletedArtifact(
    input.artifactRoot,
    stageArtifactPath(input.artifactRoot, stage),
    stage,
    fingerprint,
    validate,
  );
  if (!loaded) return undefined;
  if (reuseGuard && !(await reuseGuard(loaded.value))) return undefined;
  await recordStageCompletion(
    input,
    identity.runInputFingerprint,
    stage,
    loaded.usage,
    [],
    undefined,
    completionReductions(loaded.value, stage, []),
  );
  return {
    status: 'completed',
    durationMs: Date.now() - startedAt,
    reused: true,
    usage: loaded.usage,
    artifact: loaded.ref,
    value: loaded.value,
  };
}

/**
 * Publish the stage artifact, then atomically record completion and reductions in
 * run.json. The order matters: run.json must never name a stage whose artifact is
 * missing from disk, while the reverse gap (artifact without record) is healed by
 * maybeReuseStage on the next attempt.
 */
export async function completeStage<T>(
  input: CapellaStageInput,
  stage: CapellaStage,
  fingerprint: string,
  usage: CapellaUsage,
  value: T,
  identity: StageIdentity,
  startedAt: number,
  warnings: readonly string[] = [],
  sarif?: SarifRef,
  additionalReductions: readonly AgenticSastReduction[] = [],
): Promise<CompletedStage<T>> {
  const artifact = await publishStageArtifact(input.artifactRoot, stage, fingerprint, usage, value);
  await recordStageCompletion(
    input,
    identity.runInputFingerprint,
    stage,
    usage,
    warnings,
    sarif,
    completionReductions(value, stage, additionalReductions),
  );
  return {
    status: 'completed',
    durationMs: Date.now() - startedAt,
    reused: false,
    usage,
    artifact,
    value,
  };
}

export async function publishTextAsset(input: CapellaStageInput, relativePath: string, text: string): Promise<void> {
  await atomicPublishBytes(input.artifactRoot, resolve(input.artifactRoot, relativePath), text);
}

function safeFindingFilename(id: string): string {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..')) {
    throw new SastContractError('Capella finding id cannot be used as an artifact filename');
  }
  return `${id}.json`;
}

/** Publish readable raw finding files only after the complete research stage succeeds. */
export async function publishRawFindingAssets(
  input: CapellaStageInput,
  findings: readonly CapellaFinding[],
): Promise<void> {
  const findingsDir = resolve(input.artifactRoot, 'findings');
  const assets = [...findings]
    .sort((left, right) => {
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    })
    .map((finding) => ({ finding, path: resolve(findingsDir, safeFindingFilename(finding.id)) }));
  // A prior attempt may have published findings whose ids this run no longer produces;
  // clearing the directory keeps those orphans out of the published set.
  await rm(findingsDir, { recursive: true, force: true });
  for (const asset of assets) {
    await atomicPublishBytes(input.artifactRoot, asset.path, stableJson(asset.finding));
  }
}

/**
 * Run a stage against a private scratch copy of the findings so collector tools can
 * delete and rewrite files without touching published artifacts. Each attempt gets its
 * own directory under .attempts. Cleanup is best-effort: a leftover scratch directory
 * is harmless, while a thrown cleanup error would mask the stage result.
 */
export async function withTemporaryFindings<T>(
  artifactRoot: string,
  findings: readonly CapellaFinding[],
  run: (findingsDir: string) => Promise<T>,
): Promise<T> {
  const attemptsRoot = resolve(artifactRoot, '.attempts');
  await mkdir(attemptsRoot, { recursive: true });
  const attemptRoot = await mkdtemp(resolve(attemptsRoot, 'stage-'));
  const findingsDir = resolve(attemptRoot, 'findings');
  await mkdir(findingsDir, { recursive: true });
  try {
    for (const finding of findings) {
      await writeFile(resolve(findingsDir, safeFindingFilename(finding.id)), stableJson(finding), {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    return await run(findingsDir);
  } finally {
    await rm(attemptRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}

export interface CollectorSessionOutcome {
  readonly usage: CapellaUsage;
  readonly salvagedTurnLimit: boolean;
}

/** Preserve collector mutations only for a turn-limit that carries usage and accepted work. */
export async function runCollectorSession(
  run: () => Promise<CapellaAgentResponse<void>>,
  acceptedMutationCount: () => number,
): Promise<CollectorSessionOutcome> {
  const acceptedBefore = acceptedMutationCount();
  try {
    const response = await run();
    return { usage: response.usage, salvagedTurnLimit: false };
  } catch (error) {
    const acceptedAfter = acceptedMutationCount();
    const canSalvage =
      error instanceof CapellaAgentError &&
      error.code === 'TURN_LIMIT' &&
      error.usage !== undefined &&
      acceptedAfter > acceptedBefore;
    if (!canSalvage) throw error;
    return { usage: error.usage, salvagedTurnLimit: true };
  }
}

/**
 * Read the surviving findings back from a scratch findings directory. Collector tools
 * mutate that directory in place while the model works, so the files present after the
 * session, and not the collector return values, are the source of truth for survivors.
 * Sorted by id so downstream fingerprints stay deterministic.
 */
export interface ActiveFindingOmission {
  readonly filename: string;
  readonly reason: 'invalid_json' | 'invalid_schema';
}

export interface ActiveFindingsResult {
  readonly findings: CapellaFinding[];
  readonly omissions: ActiveFindingOmission[];
}

export async function readActiveFindings(findingsDir: string): Promise<ActiveFindingsResult> {
  const findings: CapellaFinding[] = [];
  const omissions: ActiveFindingOmission[] = [];
  for (const file of (await readdir(findingsDir)).filter((entry) => entry.endsWith('.json')).sort()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(resolve(findingsDir, file), 'utf8'));
    } catch {
      omissions.push({ filename: file, reason: 'invalid_json' });
      continue;
    }
    if (!isCapellaFinding(parsed)) {
      omissions.push({ filename: file, reason: 'invalid_schema' });
      continue;
    }
    findings.push(parsed);
  }
  return {
    findings: findings.sort((left, right) => {
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      return 0;
    }),
    omissions,
  };
}

export function artifactLineage(ref: CapellaArtifactRef): Record<string, string> {
  return { path: ref.path, sha256: ref.sha256, fingerprint: ref.fingerprint };
}
