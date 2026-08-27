// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { resolve } from 'node:path';
import { Type } from 'typebox';
import type { AgenticSastResearchReduction } from '../../types.js';
import {
  addUsage,
  buildFingerprint,
  loadArtifactRef,
  loadCompletedArtifact,
  publishCheckpointArtifact,
  stableJson,
} from '../artifacts.js';
import { createFindingCollector } from '../collectors.js';
import type { CapellaFinding } from '../finding-types.js';
import { buildCodePathScopeSnippet, buildResearchAssignment, RESEARCH_TOOLS, TRIAGE_TOOLS } from '../prompt-context.js';
import { createCapellaPromptLoader } from '../prompt-loader.js';
import { type Investigation, TRIAGE_SCHEMA, type TriageResult } from '../schemas.js';
import {
  CAPELLA_AUDIT_CONCURRENCY,
  CAPELLA_TRIAGE_CONCURRENCY,
  type CapellaStageRuntime,
  type CompletedStage,
  type ResearchAuditCoverage,
  type ResearchCoverage,
  type ResearchStageInput,
  type ResearchValue,
  ZERO_CAPELLA_USAGE,
} from '../types.js';
import { isArchitectureValue, isFindingSetValue, isPlanValue, isResearchValue, isTriageResult } from '../validation.js';
import {
  artifactLineage,
  completeStage,
  maybeReuseStage,
  publishRawFindingAssets,
  resolveStageIdentity,
  runCollectorSession,
  withTemporaryFindings,
} from './shared.js';

const AUDIT_MAX_TURNS = 200;
const TRIAGE_MAX_TURNS = 100;
const TRIAGE_REPAIR_POLICY_VERSION = 1;

interface TriageCheckpoint {
  readonly batchId: string;
  readonly files: string[];
  readonly classifications: TriageResult['classifications'];
}

interface AuditCheckpoint {
  readonly investigationId: string;
  readonly title: string;
  readonly findings: CapellaFinding[];
  readonly salvagedTurnLimit: boolean;
}

interface ResearchConcurrency {
  readonly triage: number;
  readonly audit: number;
}

interface PoolItemResult<T> {
  readonly value: T;
  readonly reused: boolean;
}

interface PoolSuccess<T> {
  readonly status: 'succeeded';
  readonly value: T;
}

interface PoolFailure {
  readonly status: 'failed';
  readonly error: unknown;
}

type PoolOutcome<T> = PoolSuccess<T> | PoolFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTriageCheckpoint(value: unknown): value is TriageCheckpoint {
  if (
    !isRecord(value) ||
    typeof value.batchId !== 'string' ||
    !Array.isArray(value.files) ||
    !value.files.every((file) => typeof file === 'string') ||
    !isTriageResult({ classifications: value.classifications })
  ) {
    return false;
  }
  const classifications = value.classifications as TriageResult['classifications'];
  const assigned = new Set(value.files as string[]);
  const classified = classifications.map((classification) => classification.file);
  // Assigned files are unique, and every stored classification names a distinct assigned path.
  // The set may be incomplete (fewer classifications than assigned) but is never inflated by a
  // duplicate path or an unexpected path, so reusing it cannot overstate coverage.
  return (
    assigned.size === value.files.length &&
    new Set(classified).size === classified.length &&
    classified.every((file) => assigned.has(file))
  );
}

function isAuditCheckpoint(value: unknown): value is AuditCheckpoint {
  return (
    isRecord(value) &&
    /^[0-9a-f]{20}$/.test(String(value.investigationId)) &&
    typeof value.title === 'string' &&
    value.title.length > 0 &&
    typeof value.salvagedTurnLimit === 'boolean' &&
    isFindingSetValue({ findings: value.findings })
  );
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function batchFiles(files: readonly string[]): string[][] {
  if (files.length === 0) return [];
  // At most one batch per triage worker. Batch membership feeds the checkpoint
  // fingerprints, so for a given file set and concurrency the batches are stable.
  const size = Math.max(1, Math.ceil(files.length / CAPELLA_TRIAGE_CONCURRENCY));
  const batches: string[][] = [];
  for (let index = 0; index < files.length; index += size) batches.push(files.slice(index, index + size));
  return batches;
}

function missingAssignedFiles(
  assignedFiles: readonly string[],
  classifications: TriageResult['classifications'],
): string[] {
  const classified = new Set(classifications.map((classification) => classification.file));
  return assignedFiles.filter((file) => !classified.has(file));
}

/**
 * Fingerprint for the research stage. Concurrency is a real input: triage batch
 * membership derives from it, so a different concurrency yields different checkpoint
 * fingerprints and must invalidate the stage artifact rather than half-reuse it.
 */
export function buildResearchFingerprint(
  runInputFingerprint: string,
  renderedPromptsSha256: string,
  architectureLineage: Record<string, string>,
  planLineage: Record<string, string>,
  concurrency: ResearchConcurrency = {
    triage: CAPELLA_TRIAGE_CONCURRENCY,
    audit: CAPELLA_AUDIT_CONCURRENCY,
  },
): string {
  return buildFingerprint({
    stage: 'research',
    runInputFingerprint,
    renderedPromptsSha256,
    architecture: architectureLineage,
    plan: planLineage,
    concurrency,
    triageRepairPolicyVersion: TRIAGE_REPAIR_POLICY_VERSION,
  });
}

/**
 * Settle every unit and preserve input order. Callers decide which typed failures
 * are tolerable at their own stage boundary.
 */
export async function runSettledPool<T, R>(
  items: readonly T[],
  concurrency: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<Array<PoolOutcome<R>>> {
  const results: Array<PoolOutcome<R>> = [];
  let cursor = 0;
  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) return;
      try {
        results[index] = { status: 'succeeded', value: await run(item, index) };
      } catch (error) {
        results[index] = { status: 'failed', error };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function successfulPoolValues<T>(outcomes: readonly PoolOutcome<T>[]): T[] {
  return outcomes.flatMap((outcome) => (outcome.status === 'succeeded' ? [outcome.value] : []));
}

/**
 * Reduce a triage batch's raw classifications to the usable set: one classification per assigned
 * path, in first-seen order. Unexpected paths and duplicate classifications are dropped, so they
 * can never inflate coverage. A schema-valid batch that omits some assigned files yields fewer
 * usable classifications rather than a failure.
 */
export function usableClassifications(
  assignedFiles: readonly string[],
  classifications: TriageResult['classifications'],
): TriageResult['classifications'] {
  const assigned = new Set(assignedFiles);
  const seen = new Set<string>();
  const usable: TriageResult['classifications'] = [];
  for (const classification of classifications) {
    if (!assigned.has(classification.file) || seen.has(classification.file)) continue;
    seen.add(classification.file);
    usable.push(classification);
  }
  return usable;
}

/**
 * Compute the deterministic triage-coverage result once, from the exact assigned file set and the
 * usable classifications each batch produced. `missingFiles` (sorted) is the private evidence of
 * which assigned paths went unclassified.
 */
export function computeTriageCoverage(checkpoints: readonly TriageCheckpoint[]): ResearchCoverage {
  const consideredFiles = new Set<string>();
  const classifiedFiles = new Set<string>();
  let affectedBatchCount = 0;
  for (const checkpoint of checkpoints) {
    for (const file of checkpoint.files) consideredFiles.add(file);
    for (const classification of checkpoint.classifications) classifiedFiles.add(classification.file);
    if (checkpoint.classifications.length < checkpoint.files.length) affectedBatchCount += 1;
  }
  const consideredCount = consideredFiles.size;
  const classifiedCount = classifiedFiles.size;
  return {
    consideredCount,
    classifiedCount,
    omittedCount: consideredCount - classifiedCount,
    affectedBatchCount,
    missingFiles: [...consideredFiles].filter((file) => !classifiedFiles.has(file)).sort(compareText),
  };
}

/** Counts-only aggregate research reduction; carries no path, id, or model text. */
export function buildResearchReduction(
  triage: ResearchCoverage,
  audit: ResearchAuditCoverage,
): AgenticSastResearchReduction {
  return {
    stage: 'research',
    reason: 'incomplete_research',
    triageConsideredCount: triage.consideredCount,
    triageClassifiedCount: triage.classifiedCount,
    triageOmittedCount: triage.omittedCount,
    affectedTriageBatchCount: triage.affectedBatchCount,
    auditUnitCount: audit.consideredCount,
    salvagedAuditSessionCount: audit.salvagedSessionCount,
  };
}

function investigationId(investigation: Investigation): string {
  return buildFingerprint({ investigation }).slice(0, 20);
}

function combineFindings(checkpoints: readonly AuditCheckpoint[]): CapellaFinding[] {
  // Different investigations can report the same finding id. Ordering by id and then
  // serialized body before first-wins insertion makes the surviving body deterministic.
  const candidates = checkpoints
    .flatMap((checkpoint) => checkpoint.findings)
    .sort((left, right) => compareText(left.id, right.id) || compareText(stableJson(left), stableJson(right)));
  const byId = new Map<string, CapellaFinding>();
  for (const finding of candidates) {
    if (!byId.has(finding.id)) byId.set(finding.id, finding);
  }
  return [...byId.values()].sort((left, right) => compareText(left.id, right.id));
}

export async function runResearchStage(
  input: ResearchStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<ResearchValue>> {
  const startedAt = Date.now();
  const architecture = await loadArtifactRef(
    input.artifactRoot,
    input.architectureArtifact,
    'architecture',
    isArchitectureValue,
  );
  const plan = await loadArtifactRef(input.artifactRoot, input.planArtifact, 'plan', isPlanValue);
  const identity = await resolveStageIdentity(input);
  const loader = createCapellaPromptLoader(input.promptDir);
  const scope = buildCodePathScopeSnippet(input.codePathFocus, input.codePathAvoids);
  const triageBasePrompt = loader.render(
    'sast.capella.triage',
    { ...TRIAGE_TOOLS, LANGUAGE_CONTEXT: '', BOUNDARY_CONTEXT: scope, TARGET_FILES: '' },
    { pipelineTestingMode: input.pipelineTestingMode },
  );
  const auditBasePrompt = loader.render(
    'sast.capella.research',
    { ...RESEARCH_TOOLS, LANGUAGE_CONTEXT: '', BOUNDARY_CONTEXT: scope },
    { pipelineTestingMode: input.pipelineTestingMode },
  );
  const renderedPromptsSha256 = buildFingerprint({ triageBasePrompt, auditBasePrompt });
  const fingerprint = buildResearchFingerprint(
    identity.runInputFingerprint,
    renderedPromptsSha256,
    artifactLineage(input.architectureArtifact),
    artifactLineage(input.planArtifact),
  );
  const reused = await maybeReuseStage(input, 'research', fingerprint, isResearchValue, identity, startedAt);
  if (reused) return reused;

  const allFiles = [...new Set(plan.value.investigations.flatMap((investigation) => investigation.target_files))].sort(
    compareText,
  );
  const batches = batchFiles(allFiles).map((files) => ({
    files,
    batchId: buildFingerprint({ files }).slice(0, 20),
  }));

  const triageOutcomes = await runSettledPool(batches, CAPELLA_TRIAGE_CONCURRENCY, async (batch) => {
    const checkpointPath = resolve(input.artifactRoot, 'research', 'triage', `${batch.batchId}.json`);
    const checkpointFingerprint = buildFingerprint({ researchFingerprint: fingerprint, wave: 'triage', ...batch });
    const cached = await loadCompletedArtifact(
      input.artifactRoot,
      checkpointPath,
      'research',
      checkpointFingerprint,
      isTriageCheckpoint,
    );
    if (cached) return { value: cached.value, usage: cached.usage, reused: true };

    const userPrompt = `${triageBasePrompt}\n\nAssigned files:\n${batch.files.map((file) => `- ${file}`).join('\n')}`;
    const primaryResponse = await runtime.executor.run<TriageResult>({
      stage: 'research',
      role: 'small',
      cwd: input.repoPath,
      systemPrompt: 'You are a rapid triage auditor. Classify every assigned file and optimize for recall.',
      userPrompt,
      maxTurns: TRIAGE_MAX_TURNS,
      timeoutMs: input.timeoutMs,
      tools: runtime.repositoryTools,
      outputSchema: Type.Unsafe(TRIAGE_SCHEMA),
      signal: runtime.signal,
    });
    let usage = primaryResponse.usage;
    const primaryIsValid = isTriageResult(primaryResponse.output);
    let classifications = primaryIsValid
      ? usableClassifications(batch.files, primaryResponse.output.classifications)
      : [];
    const missingFiles = missingAssignedFiles(batch.files, classifications);
    if (missingFiles.length > 0) {
      const repairPrompt = [
        triageBasePrompt,
        'Repair pass: the previous session was invalid or omitted the assigned files below. Classify every listed file.',
        missingFiles.map((file) => `- ${file}`).join('\n'),
      ].join('\n\n');
      const repairResponse = await runtime.executor.run<TriageResult>({
        stage: 'research',
        role: 'small',
        cwd: input.repoPath,
        systemPrompt: 'You are a rapid triage repair auditor. Classify every assigned file and optimize for recall.',
        userPrompt: repairPrompt,
        maxTurns: TRIAGE_MAX_TURNS,
        timeoutMs: input.timeoutMs,
        tools: runtime.repositoryTools,
        outputSchema: Type.Unsafe(TRIAGE_SCHEMA),
        signal: runtime.signal,
      });
      if (isTriageResult(repairResponse.output)) {
        const repaired = usableClassifications(missingFiles, repairResponse.output.classifications);
        classifications = usableClassifications(batch.files, [...classifications, ...repaired]);
      }
      usage = addUsage(usage, repairResponse.usage);
    }

    // A primary or repair response can remain invalid or incomplete after the one repair session.
    // Publish only usable classifications and let the deterministic coverage summary disclose the
    // remaining reduction.
    const value: TriageCheckpoint = {
      batchId: batch.batchId,
      files: [...batch.files],
      classifications,
    };
    await publishCheckpointArtifact(
      input.artifactRoot,
      checkpointPath,
      'research',
      checkpointFingerprint,
      usage,
      value,
    );
    return { value, usage, reused: false };
  });

  const triageFailure = triageOutcomes.find((outcome) => outcome.status === 'failed');
  if (triageFailure?.status === 'failed') throw triageFailure.error;
  const triageResults = successfulPoolValues(triageOutcomes);

  const flaggedFiles = [
    ...new Set(
      triageResults.flatMap((result) =>
        result.value.classifications
          .filter((classification) => classification.potentially_flawed)
          .map((classification) => classification.file),
      ),
    ),
  ].sort(compareText);
  const flaggedSet = new Set(flaggedFiles);
  const audits = plan.value.investigations
    .map((investigation) => ({
      investigation,
      investigationId: investigationId(investigation),
      flaggedFiles: investigation.target_files.filter((file) => flaggedSet.has(file)),
    }))
    .filter((audit) => audit.flaggedFiles.length > 0);

  const auditOutcomes = await runSettledPool(audits, CAPELLA_AUDIT_CONCURRENCY, async (audit) => {
    const checkpointPath = resolve(input.artifactRoot, 'research', 'audit', `${audit.investigationId}.json`);
    const checkpointFingerprint = buildFingerprint({
      researchFingerprint: fingerprint,
      wave: 'audit',
      investigationId: audit.investigationId,
      flaggedFiles: [...audit.flaggedFiles].sort(compareText),
    });
    const cached = await loadCompletedArtifact(
      input.artifactRoot,
      checkpointPath,
      'research',
      checkpointFingerprint,
      isAuditCheckpoint,
    );
    if (cached) return { value: cached.value, usage: cached.usage, reused: true };

    const value = await withTemporaryFindings(input.artifactRoot, [], async (findingsDir) => {
      const collector = createFindingCollector({ findingsDir });
      const userPrompt = `${auditBasePrompt}\n\n${buildResearchAssignment(
        audit.investigation,
        audit.flaggedFiles,
        architecture.value.knowledgeBase,
      )}`;
      const session = await runCollectorSession(
        () =>
          runtime.executor.run<void>({
            stage: 'research',
            role: 'medium',
            cwd: input.repoPath,
            systemPrompt:
              'You are a deep security auditor. Audit the assigned hotspots and report each finding through ' +
              'report_finding. A finding without one bare CWE cannot be reported.',
            userPrompt,
            maxTurns: AUDIT_MAX_TURNS,
            timeoutMs: input.timeoutMs,
            tools: [...runtime.repositoryTools, ...collector.tools],
            signal: runtime.signal,
          }),
        () => collector.getFindings().length,
      );
      const checkpoint: AuditCheckpoint = {
        investigationId: audit.investigationId,
        title: audit.investigation.title,
        findings: collector.getFindings().sort((left, right) => compareText(left.id, right.id)),
        salvagedTurnLimit: session.salvagedTurnLimit,
      };
      return { checkpoint, usage: session.usage };
    });
    await publishCheckpointArtifact(
      input.artifactRoot,
      checkpointPath,
      'research',
      checkpointFingerprint,
      value.usage,
      value.checkpoint,
    );
    return { value: value.checkpoint, usage: value.usage, reused: false };
  });

  const auditFailure = auditOutcomes.find((outcome) => outcome.status === 'failed');
  if (auditFailure?.status === 'failed') throw auditFailure.error;
  const auditResults = successfulPoolValues(auditOutcomes);

  const findings = combineFindings(auditResults.map((result) => result.value));
  // Durable traces of what triage flagged and which investigations actually ran,
  // published for inspection of a finished or resumed scan.
  await publishCheckpointArtifact(
    input.artifactRoot,
    resolve(input.artifactRoot, 'research', 'flagged.json'),
    'research',
    buildFingerprint({ researchFingerprint: fingerprint, flaggedFiles }),
    ZERO_CAPELLA_USAGE,
    { flaggedFiles },
  );
  await publishCheckpointArtifact(
    input.artifactRoot,
    resolve(input.artifactRoot, 'research', 'audited.json'),
    'research',
    buildFingerprint({
      researchFingerprint: fingerprint,
      investigationIds: auditResults.map((result) => result.value.investigationId),
    }),
    ZERO_CAPELLA_USAGE,
    { investigationIds: auditResults.map((result) => result.value.investigationId).sort(compareText) },
  );
  await publishRawFindingAssets(input, findings);

  const allUnits: Array<PoolItemResult<unknown> & { usage: typeof ZERO_CAPELLA_USAGE }> = [
    ...triageResults,
    ...auditResults,
  ];
  const usage = allUnits.reduce((total, result) => addUsage(total, result.usage), ZERO_CAPELLA_USAGE);
  const triageCoverage = computeTriageCoverage(triageResults.map((result) => result.value));
  const auditCoverage: ResearchAuditCoverage = {
    consideredCount: audits.length,
    completedCount: auditResults.length,
    salvagedSessionCount: auditResults.filter((result) => result.value.salvagedTurnLimit).length,
  };
  const reduced = triageCoverage.omittedCount > 0 || auditCoverage.salvagedSessionCount > 0;
  const coverage = reduced ? 'reduced' : 'complete';
  const reduction = reduced ? buildResearchReduction(triageCoverage, auditCoverage) : undefined;
  const value: ResearchValue = {
    findings,
    flaggedFiles,
    dispatchedCount: auditResults.filter((result) => !result.reused).length,
    resumedCount: auditResults.filter((result) => result.reused).length,
    coverage,
    triageCoverage,
    auditCoverage,
    ...(reduction !== undefined && { reduction }),
  };
  return completeStage(input, 'research', fingerprint, usage, value, identity, startedAt);
}
