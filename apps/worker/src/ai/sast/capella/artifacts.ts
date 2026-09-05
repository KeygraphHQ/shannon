// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readFile, realpath, rename, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { isProviderFailureCategory } from '../../../types/errors.js';
import type { AgenticSastReduction, CapellaStage, CapellaUsage, SarifRef } from '../types.js';
import { InvalidInputError, SastContractError } from './errors.js';
import {
  type AtomicPublishOptions,
  type CapellaArtifactEnvelope,
  type CapellaArtifactRef,
  type CapellaRunFailure,
  type CapellaRunRecord,
  type CapellaStageInput,
  type StageArtifactValidator,
  type StageUsageSummary,
  usageAccountingWarning,
  ZERO_CAPELLA_USAGE,
} from './types.js';
import { isAgenticSastReduction } from './validation.js';

const execFileAsync = promisify(execFile);
const STAGE_ORDER: readonly CapellaStage[] = [
  'architecture',
  'threat-model',
  'plan',
  'research',
  'dedupe',
  'review',
  'critic',
  'confirm',
  'calibrate',
  'export',
];
const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

// A recorded failure code is either an internal SCREAMING_SNAKE_CASE code this module minted
// (ARTIFACT_PATH, SARIF_DIGEST, ...) or a provider failure category forwarded verbatim from the
// model harness; both are bounded, closed vocabularies safe to persist in run.json.
function isFailureCode(value: unknown): value is string {
  return typeof value === 'string' && (FAILURE_CODE_PATTERN.test(value) || isProviderFailureCategory(value));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of Object.keys(value).sort()) {
      const child = (value as Record<string, unknown>)[key];
      if (child !== undefined) output[key] = canonicalize(child);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new SastContractError('Capella artifacts cannot contain non-finite numbers', 'ARTIFACT_NON_FINITE');
  }
  return value;
}

/** Serialize a JSON value with recursively sorted object keys. */
export function stableJson(value: unknown): string {
  return `${JSON.stringify(canonicalize(value), null, 2)}\n`;
}

/** Lowercase SHA-256 over exact bytes. */
export function sha256Bytes(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Deterministic fingerprint over a closed set of named inputs. */
export function buildFingerprint(parts: Record<string, unknown>): string {
  return sha256Bytes(stableJson(parts));
}

/** Resolve the immutable repository commit used by all stage fingerprints. */
export async function repositoryIdentity(repoPath: string): Promise<string> {
  let realRepoPath: string;
  try {
    realRepoPath = await realpath(repoPath);
  } catch {
    throw new InvalidInputError('Capella repository root does not exist', 'REPOSITORY_UNAVAILABLE');
  }

  try {
    const { stdout } = await execFileAsync('git', ['-C', realRepoPath, 'rev-parse', '--verify', 'HEAD'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024,
    });
    const commit = stdout.trim().toLowerCase();
    if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('invalid commit');
    return commit;
  } catch {
    throw new InvalidInputError('Capella requires a repository with a valid HEAD commit', 'REPOSITORY_HEAD');
  }
}

/**
 * The run-level identity every stage fingerprint is built on top of. Changing any field here
 * (a different repository commit, model, format or prompt-set version, or code-path scope)
 * must invalidate every artifact from a prior run rather than let a resumed scan silently mix
 * outputs produced under different assumptions.
 */
export function buildRunInputFingerprint(input: CapellaStageInput, repoIdentity: string): string {
  return buildFingerprint({
    repositoryIdentity: repoIdentity,
    modelSpec: input.modelSpec,
    capellaFormatVersion: input.capellaFormatVersion,
    promptSetVersion: input.promptSetVersion,
    codePathAvoids: [...input.codePathAvoids].sort(),
    codePathFocus: [...input.codePathFocus].sort(),
    pipelineTestingMode: input.pipelineTestingMode,
  });
}

export function stageArtifactPath(artifactRoot: string, stage: CapellaStage): string {
  return resolve(artifactRoot, 'stages', `${stage}.json`);
}

/** Reject any publish target outside the artifact root, including the root itself. */
function assertOwnedPath(artifactRoot: string, targetPath: string): void {
  const root = resolve(artifactRoot);
  const target = resolve(targetPath);
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new InvalidInputError('Capella artifact path escapes its artifact root', 'ARTIFACT_PATH');
  }
}

/**
 * Publish exact bytes through a unique sibling and one atomic rename.
 *
 * The handle is fsynced before the rename so the visible path can never hold
 * partial bytes after a crash; on any failure the temporary sibling is removed
 * and the final path is untouched.
 */
export async function atomicPublishBytes(
  artifactRoot: string,
  finalPath: string,
  bytes: string | Uint8Array,
  options: AtomicPublishOptions = {},
): Promise<string> {
  assertOwnedPath(artifactRoot, finalPath);
  await mkdir(dirname(finalPath), { recursive: true });
  const temporaryPath = resolve(dirname(finalPath), `.${basename(finalPath)}.${process.pid}.${randomUUID()}.tmp`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(temporaryPath, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await options.beforeRename?.(temporaryPath, finalPath);
    await rename(temporaryPath, finalPath);
    return sha256Bytes(bytes);
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function atomicPublishJson(
  artifactRoot: string,
  finalPath: string,
  value: unknown,
  options: AtomicPublishOptions = {},
): Promise<{ readonly sha256: string; readonly bytes: string }> {
  const bytes = stableJson(value);
  const sha256 = await atomicPublishBytes(artifactRoot, finalPath, bytes, options);
  return { sha256, bytes };
}

function isUsage(value: unknown): value is CapellaUsage {
  if (!value || typeof value !== 'object') return false;
  const usage = value as Record<string, unknown>;
  const counters = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'turns'];
  return (
    counters.every((key) => Number.isSafeInteger(usage[key]) && Number(usage[key]) >= 0) &&
    typeof usage.costUsd === 'number' &&
    Number.isFinite(usage.costUsd) &&
    usage.costUsd >= 0
  );
}

function isEnvelope<T>(
  value: unknown,
  stage: CapellaStage,
  fingerprint: string,
  validate: StageArtifactValidator<T>,
): value is CapellaArtifactEnvelope<T> {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === 1 &&
    record.stage === stage &&
    record.fingerprint === fingerprint &&
    isUsage(record.usage) &&
    validate(record.value)
  );
}

export interface LoadedArtifact<T> {
  readonly ref: CapellaArtifactRef;
  readonly value: T;
  readonly usage: CapellaUsage;
}

/** Return only a schema-valid, fingerprint-matching completed artifact. */
export async function loadCompletedArtifact<T>(
  artifactRoot: string,
  finalPath: string,
  stage: CapellaStage,
  fingerprint: string,
  validate: StageArtifactValidator<T>,
): Promise<LoadedArtifact<T> | undefined> {
  assertOwnedPath(artifactRoot, finalPath);
  try {
    const bytes = await readFile(finalPath);
    const parsed: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isEnvelope(parsed, stage, fingerprint, validate)) return undefined;
    return {
      ref: { path: finalPath, sha256: sha256Bytes(bytes), fingerprint },
      value: parsed.value,
      usage: parsed.usage,
    };
  } catch {
    return undefined;
  }
}

/** Load and verify a stage artifact supplied by an earlier activity. */
export async function loadArtifactRef<T>(
  artifactRoot: string,
  ref: CapellaArtifactRef,
  stage: CapellaStage,
  validate: StageArtifactValidator<T>,
): Promise<LoadedArtifact<T>> {
  assertOwnedPath(artifactRoot, ref.path);
  if (resolve(ref.path) !== stageArtifactPath(artifactRoot, stage)) {
    throw new SastContractError(`${stage} artifact has an unexpected path`, 'ARTIFACT_PATH');
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(ref.path);
  } catch {
    throw new SastContractError(`${stage} artifact is missing`, 'ARTIFACT_MISSING');
  }
  if (sha256Bytes(bytes) !== ref.sha256) {
    throw new SastContractError(`${stage} artifact digest mismatch`, 'ARTIFACT_DIGEST');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new SastContractError(`${stage} artifact is not valid JSON`, 'ARTIFACT_JSON');
  }
  if (!isEnvelope(parsed, stage, ref.fingerprint, validate)) {
    throw new SastContractError(`${stage} artifact failed schema or fingerprint validation`, 'ARTIFACT_SCHEMA');
  }
  return { ref, value: parsed.value, usage: parsed.usage };
}

export async function publishStageArtifact<T>(
  artifactRoot: string,
  stage: CapellaStage,
  fingerprint: string,
  usage: CapellaUsage,
  value: T,
): Promise<CapellaArtifactRef> {
  const finalPath = stageArtifactPath(artifactRoot, stage);
  const envelope: CapellaArtifactEnvelope<T> = { schemaVersion: 1, stage, fingerprint, usage, value };
  const { sha256 } = await atomicPublishJson(artifactRoot, finalPath, envelope);
  return { path: finalPath, sha256, fingerprint };
}

/** Publish a fingerprinted checkpoint whose path is stage-owned but not the stage completion marker. */
export async function publishCheckpointArtifact<T>(
  artifactRoot: string,
  finalPath: string,
  stage: CapellaStage,
  fingerprint: string,
  usage: CapellaUsage,
  value: T,
): Promise<CapellaArtifactRef> {
  const envelope: CapellaArtifactEnvelope<T> = { schemaVersion: 1, stage, fingerprint, usage, value };
  const { sha256 } = await atomicPublishJson(artifactRoot, finalPath, envelope);
  return { path: finalPath, sha256, fingerprint };
}

export function addUsage(left: CapellaUsage, right: CapellaUsage): CapellaUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    costUsd: left.costUsd + right.costUsd,
    turns: left.turns + right.turns,
  };
}

function sumStageUsage(stageUsage: Partial<Record<CapellaStage, CapellaUsage>>): CapellaUsage {
  return STAGE_ORDER.reduce(
    (total, stage) => addUsage(total, stageUsage[stage] ?? ZERO_CAPELLA_USAGE),
    ZERO_CAPELLA_USAGE,
  );
}

/** A run's reduced-coverage set: valid members, at most one per stage, in stage order. */
function isReductionSet(value: unknown): value is readonly AgenticSastReduction[] {
  if (!Array.isArray(value) || !value.every(isAgenticSastReduction)) return false;
  const stages = value.map((reduction) => reduction.stage);
  if (new Set(stages).size !== stages.length) return false;
  const positions = stages.map((stage) => STAGE_ORDER.indexOf(stage));
  return positions.every((position, index) => index === 0 || position > (positions[index - 1] ?? -1));
}

/** Fold one reduction into a run's set, replacing any prior entry for the same stage, in stage order. */
function mergeReductions(
  existing: readonly AgenticSastReduction[],
  reduction: AgenticSastReduction,
): AgenticSastReduction[] {
  const byStage = new Map<CapellaStage, AgenticSastReduction>();
  for (const entry of existing) byStage.set(entry.stage, entry);
  byStage.set(reduction.stage, reduction);
  return STAGE_ORDER.filter((stage) => byStage.has(stage)).map((stage) => byStage.get(stage) as AgenticSastReduction);
}

// completedStages must read as a prefix of STAGE_ORDER with no gaps skipped backward, so a
// corrupted or hand-edited run.json cannot claim a later stage completed without its predecessors.
function stagesAreStrictlyOrdered(stages: readonly CapellaStage[]): boolean {
  for (let index = 1; index < stages.length; index += 1) {
    const previous = stages[index - 1];
    const current = stages[index];
    if (!previous || !current || STAGE_ORDER.indexOf(current) <= STAGE_ORDER.indexOf(previous)) return false;
  }
  return true;
}

// The 2,000-character error bound and the attempt/retryable shape keep a persisted failure record
// wire-sized and closed, so a provider or filesystem error cannot inflate run.json with unbounded text.
function isRunFailure(value: unknown): value is CapellaRunFailure {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const failure = value as Record<string, unknown>;
  return (
    (failure.stage === 'workflow' || STAGE_ORDER.includes(failure.stage as CapellaStage)) &&
    isFailureCode(failure.code) &&
    typeof failure.error === 'string' &&
    failure.error.length > 0 &&
    failure.error.length <= 2_000 &&
    Number.isSafeInteger(failure.attempt) &&
    Number(failure.attempt) >= 1 &&
    typeof failure.retryable === 'boolean'
  );
}

function isRunRecord(value: unknown): value is CapellaRunRecord {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== 1) return false;
  if (typeof record.capellaFormatVersion !== 'string' || typeof record.promptSetVersion !== 'string') return false;
  if (typeof record.inputFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(record.inputFingerprint)) return false;
  if (!Array.isArray(record.completedStages)) return false;
  if (!record.completedStages.every((stage) => STAGE_ORDER.includes(stage as CapellaStage))) return false;
  if (new Set(record.completedStages).size !== record.completedStages.length) return false;
  if (!Array.isArray(record.warnings)) return false;
  if (!record.warnings.every((warning) => typeof warning === 'string' && warning.length <= 2_000)) return false;
  if (!isUsage(record.usage)) return false;
  if (typeof record.usageAccountingComplete !== 'boolean') return false;
  if (!record.stageUsage || typeof record.stageUsage !== 'object' || Array.isArray(record.stageUsage)) return false;

  const completedStages = record.completedStages as CapellaStage[];
  if (!stagesAreStrictlyOrdered(completedStages)) return false;
  const stageUsage = record.stageUsage as Record<string, unknown>;
  if (
    Object.keys(stageUsage).some((stage) => !STAGE_ORDER.includes(stage as CapellaStage) || !isUsage(stageUsage[stage]))
  ) {
    return false;
  }

  if (record.reductions !== undefined && !isReductionSet(record.reductions)) return false;

  if (record.finalState === 'succeeded') {
    if (
      !completedStages.includes('export') ||
      !record.sarif ||
      typeof record.sarif !== 'object' ||
      record.failure !== undefined
    ) {
      return false;
    }
    const sarif = record.sarif as Record<string, unknown>;
    return typeof sarif.path === 'string' && typeof sarif.sha256 === 'string' && /^[0-9a-f]{64}$/.test(sarif.sha256);
  }
  if (record.finalState === 'failed') {
    return isRunFailure(record.failure) && record.sarif === undefined;
  }
  // A running record may carry a failure only while it is retryable: that is
  // an attempt in flight, not a terminal outcome.
  return (
    record.finalState === 'running' &&
    record.sarif === undefined &&
    (record.failure === undefined || (isRunFailure(record.failure) && record.failure.retryable))
  );
}

/**
 * Load only the current input's schema-valid Capella run record.
 *
 * Any mismatch (schema, fingerprint, version, or a succeeded record whose SARIF
 * is not the canonical `capella.sarif` path) reads as absent, so a resumed run
 * starts fresh instead of adopting progress it cannot trust.
 */
export async function loadRunRecord(
  input: CapellaStageInput,
  inputFingerprint: string,
): Promise<CapellaRunRecord | undefined> {
  try {
    const parsed: unknown = JSON.parse(await readFile(resolve(input.artifactRoot, 'run.json'), 'utf8'));
    if (!isRunRecord(parsed)) return undefined;
    if (parsed.inputFingerprint !== inputFingerprint) return undefined;
    if (parsed.capellaFormatVersion !== input.capellaFormatVersion) return undefined;
    if (parsed.promptSetVersion !== input.promptSetVersion) return undefined;
    if (parsed.finalState === 'succeeded' && parsed.sarif?.path !== resolve(input.artifactRoot, 'capella.sarif')) {
      return undefined;
    }
    return parsed;
  } catch {
    return undefined;
  }
}

export async function recordStageCompletion(
  input: CapellaStageInput,
  inputFingerprint: string,
  stage: CapellaStage,
  usage: CapellaUsage,
  warnings: readonly string[] = [],
  sarif?: SarifRef,
  reductions: readonly AgenticSastReduction[] = [],
): Promise<void> {
  const existing = await loadRunRecord(input, inputFingerprint);
  const stageUsage = { ...(existing?.stageUsage ?? {}), [stage]: usage };
  // Rebuilt from STAGE_ORDER so the list stays canonically ordered and
  // deduplicated no matter which stage reports first after a resume.
  const completedStages = STAGE_ORDER.filter(
    (candidate) => candidate === stage || existing?.completedStages.includes(candidate),
  );
  const mergedWarnings = [...new Set([...(existing?.warnings ?? []), ...warnings])].sort();
  const mergedReductions = reductions.reduce(
    (current, reduction) => mergeReductions(current, reduction),
    [...(existing?.reductions ?? [])],
  );
  const record: CapellaRunRecord = {
    schemaVersion: 1,
    capellaFormatVersion: input.capellaFormatVersion,
    promptSetVersion: input.promptSetVersion,
    inputFingerprint,
    completedStages,
    finalState: sarif ? 'succeeded' : 'running',
    warnings: mergedWarnings,
    usage: sumStageUsage(stageUsage),
    stageUsage,
    // Optimistic: this write carries only the successful attempt's spend. recordStageUsageAccounting
    // reconciles the figure against the full attempt ledger and downgrades this if the stage retried.
    usageAccountingComplete: existing?.usageAccountingComplete ?? true,
    ...(mergedReductions.length > 0 ? { reductions: mergedReductions } : {}),
    ...(sarif ? { sarif } : {}),
  };
  await atomicPublishJson(input.artifactRoot, resolve(input.artifactRoot, 'run.json'), record);
}

/**
 * Reconcile a completed stage's spend against its full per-attempt usage ledger.
 *
 * recordStageCompletion writes the successful attempt's usage as a crash-safe marker; this
 * heals that figure to the ledger aggregate (which includes failed attempts) once the activity
 * has folded the ledger. A retried or ledger-incomplete stage drives usageAccountingComplete
 * false and names the reason in warnings. Absent record: the completion write must run first,
 * so there is nothing to reconcile.
 */
export async function recordStageUsageAccounting(
  input: CapellaStageInput,
  inputFingerprint: string,
  stage: CapellaStage,
  summary: StageUsageSummary,
): Promise<void> {
  const existing = await loadRunRecord(input, inputFingerprint);
  if (!existing) return;
  const stageUsage = { ...existing.stageUsage, [stage]: summary.usage };
  const stageComplete = summary.complete && !summary.retried;
  const warnings = stageComplete
    ? existing.warnings
    : [...new Set([...existing.warnings, usageAccountingWarning(stage)])].sort();
  const record: CapellaRunRecord = {
    ...existing,
    warnings,
    usage: sumStageUsage(stageUsage),
    stageUsage,
    usageAccountingComplete: existing.usageAccountingComplete && stageComplete,
  };
  await atomicPublishJson(input.artifactRoot, resolve(input.artifactRoot, 'run.json'), record);
}

export interface RecordRunFailureOptions {
  /** Keep an original fallback-stage failure when its replacement export did not complete. */
  readonly preserveExistingFailure?: boolean;
  /** Keep a success that this activity invocation itself completed before later bookkeeping failed. */
  readonly preserveExistingSuccess?: boolean;
}

export async function recordRunFailure(
  input: CapellaStageInput,
  inputFingerprint: string,
  failure: CapellaRunFailure,
  terminal: boolean,
  stageUsageSummary?: StageUsageSummary,
  options: RecordRunFailureOptions = {},
): Promise<void> {
  const existing = await loadRunRecord(input, inputFingerprint);
  if (options.preserveExistingSuccess && existing?.finalState === 'succeeded') return;
  if (options.preserveExistingFailure && existing?.finalState === 'failed') return;
  const failureIsFinal = terminal || !failure.retryable;
  // A failing stage still spent tokens; fold its ledger aggregate in so the durable record
  // counts it. Verify accounting against the same ledger predicate every other ledger uses:
  // a stage whose spend reconciles (complete and un-retried) keeps the run trusted and clears
  // its warning; anything unverifiable stays incomplete and names the reason.
  const stageUsage =
    stageUsageSummary && failure.stage !== 'workflow'
      ? { ...(existing?.stageUsage ?? {}), [failure.stage]: stageUsageSummary.usage }
      : (existing?.stageUsage ?? {});
  const stageComplete =
    stageUsageSummary !== undefined &&
    failure.stage !== 'workflow' &&
    stageUsageSummary.complete &&
    !stageUsageSummary.retried;
  const usageAccountingComplete = (existing?.usageAccountingComplete ?? true) && stageComplete;
  const warnings = stageComplete
    ? (existing?.warnings ?? [])
    : [...new Set([...(existing?.warnings ?? []), usageAccountingWarning(failure.stage)])].sort();
  const record: CapellaRunRecord = {
    schemaVersion: 1,
    capellaFormatVersion: input.capellaFormatVersion,
    promptSetVersion: input.promptSetVersion,
    inputFingerprint,
    completedStages: existing?.completedStages ?? [],
    finalState: failureIsFinal ? 'failed' : 'running',
    warnings,
    usage: sumStageUsage(stageUsage),
    stageUsage,
    usageAccountingComplete,
    ...(existing?.reductions ? { reductions: existing.reductions } : {}),
    failure: {
      stage: failure.stage,
      code: isFailureCode(failure.code) ? failure.code : 'ACTIVITY_FAILURE',
      error: failure.error.slice(0, 2_000) || 'Capella run failed',
      attempt: failure.attempt,
      retryable: failure.retryable,
    },
  };
  await atomicPublishJson(input.artifactRoot, resolve(input.artifactRoot, 'run.json'), record);
}
