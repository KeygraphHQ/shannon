// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { addUsage, loadArtifactRef } from '../artifacts.js';
import {
  createCalibrationCollector,
  createConfirmationCollector,
  createDuplicateCollector,
  createReviewCollector,
  createViabilityCollector,
  quarantineUngradedReviewFindings,
  type VerdictRejectionCounts,
} from '../collectors.js';
import type { CapellaFinding } from '../finding-types.js';
import {
  buildFindingsContext,
  buildKnowledgeBaseContext,
  CALIBRATE_TOOLS,
  CONFIRM_TOOLS,
  CRITIC_TOOLS,
  DEDUPE_TOOLS,
  REVIEW_TOOLS,
} from '../prompt-context.js';
import { type CapellaPromptId, createCapellaPromptLoader } from '../prompt-loader.js';
import type {
  CalibrateValue,
  CapellaStageRuntime,
  CompletedStage,
  ConfirmValue,
  CriticValue,
  DedupeValue,
  FindingStageInput,
  KnowledgeFindingStageInput,
  ResearchValue,
  ReviewValue,
} from '../types.js';
import {
  calculateVerdictSetDetails,
  isArchitectureValue,
  isCalibrateValue,
  isConfirmValue,
  isCriticValue,
  isDedupeValue,
  isResearchValue,
  isReviewValue,
  isThreatModelValue,
} from '../validation.js';
import {
  type ActiveFindingsResult,
  artifactLineage,
  buildStageFingerprint,
  completeStage,
  maybeReuseStage,
  readActiveFindings,
  resolveStageIdentity,
  runCollectorSession,
  withTemporaryFindings,
} from './shared.js';

const DEDUPE_MAX_TURNS = 200;
const REVIEW_MAX_TURNS = 400;
const CRITIC_MAX_TURNS = 300;
const CONFIRM_MAX_TURNS = 300;
const CALIBRATE_MAX_TURNS = 200;

interface VerdictReductionCounts {
  readonly consideredCount: number;
  readonly gradedCount: number;
  readonly missingCount: number;
  readonly unreadableCount: number;
  readonly rejectedUnexpectedCount: number;
  readonly rejectedDuplicateCount: number;
  readonly salvagedTurnLimitCount: number;
}

function verdictReductionCounts(
  expectedIds: readonly string[],
  acceptedIds: readonly string[],
  active: ActiveFindingsResult,
  rejected: VerdictRejectionCounts,
  salvagedTurnLimitCount: number,
): VerdictReductionCounts {
  const details = calculateVerdictSetDetails(expectedIds, acceptedIds);
  return {
    consideredCount: expectedIds.length,
    gradedCount: acceptedIds.length,
    missingCount: details.missingIds.length,
    unreadableCount: active.omissions.length,
    rejectedUnexpectedCount: rejected.unexpected,
    rejectedDuplicateCount: rejected.duplicate,
    salvagedTurnLimitCount,
  };
}

function verdictWasReduced(counts: VerdictReductionCounts): boolean {
  return counts.missingCount > 0 || counts.unreadableCount > 0 || counts.salvagedTurnLimitCount > 0;
}

function renderFindingsPrompt(
  input: FindingStageInput,
  promptId: CapellaPromptId,
  context: Readonly<Record<string, unknown>>,
  findings: readonly CapellaFinding[],
  extraContext = '',
): string {
  const loader = createCapellaPromptLoader(input.promptDir);
  return [
    loader.render(promptId, context, { pipelineTestingMode: input.pipelineTestingMode }),
    buildFindingsContext(findings),
    extraContext,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function renderVerdictRepairPrompt(
  input: FindingStageInput,
  promptId: CapellaPromptId,
  context: Readonly<Record<string, unknown>>,
  missingFindings: readonly CapellaFinding[],
  extraContext = '',
): string {
  return [
    'Repair pass: submit exactly one decision for every finding below. Do not submit any other finding ID.',
    renderFindingsPrompt(input, promptId, context, missingFindings, extraContext),
  ].join('\n\n');
}

function missingFindings(
  expectedFindings: readonly CapellaFinding[],
  acceptedIds: readonly string[],
): CapellaFinding[] {
  const expectedIds = expectedFindings.map((finding) => finding.id);
  const missingIds = new Set(calculateVerdictSetDetails(expectedIds, acceptedIds).missingIds);
  return expectedFindings.filter((finding) => missingIds.has(finding.id));
}

async function loadResearchFindings(input: FindingStageInput): Promise<ResearchValue> {
  return (await loadArtifactRef(input.artifactRoot, input.findingsArtifact, 'research', isResearchValue)).value;
}

async function loadDedupeFindings(input: FindingStageInput): Promise<DedupeValue> {
  return (await loadArtifactRef(input.artifactRoot, input.findingsArtifact, 'dedupe', isDedupeValue)).value;
}

async function loadReviewFindings(input: FindingStageInput): Promise<ReviewValue> {
  return (await loadArtifactRef(input.artifactRoot, input.findingsArtifact, 'review', isReviewValue)).value;
}

async function loadCriticFindings(input: FindingStageInput): Promise<CriticValue> {
  return (await loadArtifactRef(input.artifactRoot, input.findingsArtifact, 'critic', isCriticValue)).value;
}

async function loadConfirmFindings(input: FindingStageInput): Promise<ConfirmValue> {
  return (await loadArtifactRef(input.artifactRoot, input.findingsArtifact, 'confirm', isConfirmValue)).value;
}

async function knowledgeContext(input: KnowledgeFindingStageInput): Promise<string> {
  const architecture = await loadArtifactRef(
    input.artifactRoot,
    input.architectureArtifact,
    'architecture',
    isArchitectureValue,
  );
  const threatModel = await loadArtifactRef(
    input.artifactRoot,
    input.threatModelArtifact,
    'threat-model',
    isThreatModelValue,
  );
  return `${buildKnowledgeBaseContext(architecture.value.knowledgeBase)}\n\n<capella_threat_model>\n${threatModel.value.threatModel}\n</capella_threat_model>`;
}

export async function runDedupeStage(
  input: FindingStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<DedupeValue>> {
  const startedAt = Date.now();
  const source = await loadResearchFindings(input);
  const identity = await resolveStageIdentity(input);
  const prompt = renderFindingsPrompt(input, 'sast.capella.dedupe', DEDUPE_TOOLS, source.findings);
  const fingerprint = buildStageFingerprint('dedupe', identity, prompt, {
    findings: artifactLineage(input.findingsArtifact),
  });
  const reused = await maybeReuseStage(input, 'dedupe', fingerprint, isDedupeValue, identity, startedAt);
  if (reused) return reused;

  const outcome = await withTemporaryFindings(input.artifactRoot, source.findings, async (findingsDir) => {
    const collector = createDuplicateCollector({ findingsDir });
    const session = await runCollectorSession(
      () =>
        runtime.executor.run<void>({
          stage: 'dedupe',
          role: 'small',
          cwd: input.repoPath,
          systemPrompt:
            'You consolidate duplicate security findings. Findings at different lines in the same file are distinct.',
          userPrompt: prompt,
          maxTurns: DEDUPE_MAX_TURNS,
          timeoutMs: input.timeoutMs,
          tools: [...runtime.repositoryTools, ...collector.tools],
          signal: runtime.signal,
          sessionLabel: 'primary',
        }),
      () => collector.getDuplicates().length,
    );
    const active = await readActiveFindings(findingsDir);
    const salvagedTurnLimitCount = session.salvagedTurnLimit ? 1 : 0;
    const reduced = active.omissions.length > 0 || salvagedTurnLimitCount > 0;
    const value: DedupeValue = {
      findings: active.findings,
      duplicateCount: collector.getDuplicates().length,
      survivorCount: active.findings.length,
      ...(reduced && {
        reduction: {
          stage: 'dedupe',
          reason: 'incomplete_dedupe',
          consideredCount: source.findings.length,
          survivorCount: active.findings.length,
          unreadableCount: active.omissions.length,
          salvagedTurnLimitCount,
        },
      }),
    };
    return { usage: session.usage, value };
  });
  return completeStage(input, 'dedupe', fingerprint, outcome.usage, outcome.value, identity, startedAt);
}

export async function runReviewStage(
  input: FindingStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<ReviewValue>> {
  const startedAt = Date.now();
  const source = await loadDedupeFindings(input);
  const identity = await resolveStageIdentity(input);
  const prompt = renderFindingsPrompt(input, 'sast.capella.review', REVIEW_TOOLS, source.findings);
  const fingerprint = buildStageFingerprint('review', identity, prompt, {
    findings: artifactLineage(input.findingsArtifact),
  });
  const reused = await maybeReuseStage(input, 'review', fingerprint, isReviewValue, identity, startedAt);
  if (reused) return reused;
  const expectedIds = source.findings.map((finding) => finding.id);

  const outcome = await withTemporaryFindings(input.artifactRoot, source.findings, async (findingsDir) => {
    const collector = createReviewCollector({ findingsDir, expectedIds });
    const systemPrompt =
      "You are the independent validator. Assume every finding is false until the source disproves it. Ignore the finder's prose reasoning.";
    const primary = await runCollectorSession(
      () =>
        runtime.executor.run<void>({
          stage: 'review',
          role: 'medium',
          cwd: input.repoPath,
          systemPrompt,
          userPrompt: prompt,
          maxTurns: REVIEW_MAX_TURNS,
          timeoutMs: input.timeoutMs,
          tools: [...runtime.repositoryTools, ...collector.tools],
          signal: runtime.signal,
          sessionLabel: 'primary',
        }),
      () => collector.getAcceptedIds().length,
    );
    let usage = primary.usage;
    let salvagedTurnLimitCount = primary.salvagedTurnLimit ? 1 : 0;
    const missing = missingFindings(source.findings, collector.getAcceptedIds());
    if (missing.length > 0) {
      const repair = await runCollectorSession(
        () =>
          runtime.executor.run<void>({
            stage: 'review',
            role: 'medium',
            cwd: input.repoPath,
            systemPrompt,
            userPrompt: renderVerdictRepairPrompt(input, 'sast.capella.review', REVIEW_TOOLS, missing),
            maxTurns: REVIEW_MAX_TURNS,
            timeoutMs: input.timeoutMs,
            tools: [...runtime.repositoryTools, ...collector.tools],
            signal: runtime.signal,
            sessionLabel: 'repair',
          }),
        () => collector.getAcceptedIds().length,
      );
      usage = addUsage(usage, repair.usage);
      if (repair.salvagedTurnLimit) salvagedTurnLimitCount += 1;
    }
    const verdicts = collector.getVerdicts();
    const details = calculateVerdictSetDetails(expectedIds, collector.getAcceptedIds());
    const quarantinedCount = quarantineUngradedReviewFindings(findingsDir, details.missingIds);
    const active = await readActiveFindings(findingsDir);
    const rejected = collector.getRejectionCounts();
    const reductionCounts = verdictReductionCounts(
      expectedIds,
      collector.getAcceptedIds(),
      active,
      rejected,
      salvagedTurnLimitCount,
    );
    const value: ReviewValue = {
      findings: active.findings,
      validCount: verdicts.filter((verdict) => verdict.status === 'VALID').length,
      provisionalCount: verdicts.filter((verdict) => verdict.status === 'PROVISIONALLY_VALID').length,
      falsePositiveCount: verdicts.filter((verdict) => verdict.status === 'FALSE_POSITIVE').length,
      rejectedUnexpectedCount: rejected.unexpected,
      rejectedDuplicateCount: rejected.duplicate,
      ...(verdictWasReduced(reductionCounts) && {
        reduction: {
          stage: 'review',
          reason: 'incomplete_review',
          ...reductionCounts,
          quarantinedCount,
        },
      }),
    };
    return { usage, value };
  });
  return completeStage(input, 'review', fingerprint, outcome.usage, outcome.value, identity, startedAt);
}

export async function runCriticStage(
  input: KnowledgeFindingStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<CriticValue>> {
  const startedAt = Date.now();
  const source = await loadReviewFindings(input);
  const kbContext = await knowledgeContext(input);
  const identity = await resolveStageIdentity(input);
  const prompt = renderFindingsPrompt(
    input,
    'sast.capella.critic',
    { ...CRITIC_TOOLS, KB_DIR: 'the host-provided context below' },
    source.findings,
    kbContext,
  );
  const fingerprint = buildStageFingerprint('critic', identity, prompt, {
    findings: artifactLineage(input.findingsArtifact),
    architecture: artifactLineage(input.architectureArtifact),
    threatModel: artifactLineage(input.threatModelArtifact),
  });
  const reused = await maybeReuseStage(input, 'critic', fingerprint, isCriticValue, identity, startedAt);
  if (reused) return reused;
  // The model sees every finding for context, but a viability verdict is owed only
  // for the findings that survived review.
  const expected = source.findings.filter(
    (finding) => finding.status === 'VALID' || finding.status === 'PROVISIONALLY_VALID',
  );

  const outcome = await withTemporaryFindings(input.artifactRoot, source.findings, async (findingsDir) => {
    const expectedIds = expected.map((finding) => finding.id);
    const collector = createViabilityCollector({ findingsDir, expectedIds });
    const systemPrompt =
      'You are the production-viability expert. Adopt a skeptical stance and independently re-verify each survivor.';
    const primary = await runCollectorSession(
      () =>
        runtime.executor.run<void>({
          stage: 'critic',
          role: 'medium',
          cwd: input.repoPath,
          systemPrompt,
          userPrompt: prompt,
          maxTurns: CRITIC_MAX_TURNS,
          timeoutMs: input.timeoutMs,
          tools: [...runtime.repositoryTools, ...collector.tools],
          signal: runtime.signal,
          sessionLabel: 'primary',
        }),
      () => collector.getAcceptedIds().length,
    );
    let usage = primary.usage;
    let salvagedTurnLimitCount = primary.salvagedTurnLimit ? 1 : 0;
    const missing = missingFindings(expected, collector.getAcceptedIds());
    if (missing.length > 0) {
      const repair = await runCollectorSession(
        () =>
          runtime.executor.run<void>({
            stage: 'critic',
            role: 'medium',
            cwd: input.repoPath,
            systemPrompt,
            userPrompt: renderVerdictRepairPrompt(
              input,
              'sast.capella.critic',
              { ...CRITIC_TOOLS, KB_DIR: 'the host-provided context below' },
              missing,
              kbContext,
            ),
            maxTurns: CRITIC_MAX_TURNS,
            timeoutMs: input.timeoutMs,
            tools: [...runtime.repositoryTools, ...collector.tools],
            signal: runtime.signal,
            sessionLabel: 'repair',
          }),
        () => collector.getAcceptedIds().length,
      );
      usage = addUsage(usage, repair.usage);
      if (repair.salvagedTurnLimit) salvagedTurnLimitCount += 1;
    }
    const viabilities = collector.getViabilities();
    const active = await readActiveFindings(findingsDir);
    const rejected = collector.getRejectionCounts();
    const reductionCounts = verdictReductionCounts(
      expectedIds,
      collector.getAcceptedIds(),
      active,
      rejected,
      salvagedTurnLimitCount,
    );
    const value: CriticValue = {
      findings: active.findings,
      viableCount: viabilities.filter(
        (verdict) => verdict.viability === 'VIABLE' || verdict.viability === 'CONDITIONAL_VIABLE',
      ).length,
      rejectedUnexpectedCount: rejected.unexpected,
      rejectedDuplicateCount: rejected.duplicate,
      ...(verdictWasReduced(reductionCounts) && {
        reduction: { stage: 'critic', reason: 'incomplete_critic', ...reductionCounts },
      }),
    };
    return { usage, value };
  });
  return completeStage(input, 'critic', fingerprint, outcome.usage, outcome.value, identity, startedAt);
}

export async function runConfirmStage(
  input: FindingStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<ConfirmValue>> {
  const startedAt = Date.now();
  const source = await loadCriticFindings(input);
  const identity = await resolveStageIdentity(input);
  const prompt = renderFindingsPrompt(input, 'sast.capella.confirm', CONFIRM_TOOLS, source.findings);
  const fingerprint = buildStageFingerprint('confirm', identity, prompt, {
    findings: artifactLineage(input.findingsArtifact),
  });
  const reused = await maybeReuseStage(input, 'confirm', fingerprint, isConfirmValue, identity, startedAt);
  if (reused) return reused;
  // Critic assigns production viability without changing status, so the set owed a
  // confirmation verdict is still the review survivors.
  const expected = source.findings.filter(
    (finding) => finding.status === 'VALID' || finding.status === 'PROVISIONALLY_VALID',
  );

  const outcome = await withTemporaryFindings(input.artifactRoot, source.findings, async (findingsDir) => {
    const expectedIds = expected.map((finding) => finding.id);
    const collector = createConfirmationCollector({ findingsDir, expectedIds });
    const systemPrompt =
      'You statically confirm survivors against source. This engine has no execution sandbox, so reached-sink source evidence is required.';
    const primary = await runCollectorSession(
      () =>
        runtime.executor.run<void>({
          stage: 'confirm',
          role: 'medium',
          cwd: input.repoPath,
          systemPrompt,
          userPrompt: prompt,
          maxTurns: CONFIRM_MAX_TURNS,
          timeoutMs: input.timeoutMs,
          tools: [...runtime.repositoryTools, ...collector.tools],
          signal: runtime.signal,
          sessionLabel: 'primary',
        }),
      () => collector.getAcceptedIds().length,
    );
    let usage = primary.usage;
    let salvagedTurnLimitCount = primary.salvagedTurnLimit ? 1 : 0;
    const missing = missingFindings(expected, collector.getAcceptedIds());
    if (missing.length > 0) {
      const repair = await runCollectorSession(
        () =>
          runtime.executor.run<void>({
            stage: 'confirm',
            role: 'medium',
            cwd: input.repoPath,
            systemPrompt,
            userPrompt: renderVerdictRepairPrompt(input, 'sast.capella.confirm', CONFIRM_TOOLS, missing),
            maxTurns: CONFIRM_MAX_TURNS,
            timeoutMs: input.timeoutMs,
            tools: [...runtime.repositoryTools, ...collector.tools],
            signal: runtime.signal,
            sessionLabel: 'repair',
          }),
        () => collector.getAcceptedIds().length,
      );
      usage = addUsage(usage, repair.usage);
      if (repair.salvagedTurnLimit) salvagedTurnLimitCount += 1;
    }
    const confirmations = collector.getConfirmations();
    const active = await readActiveFindings(findingsDir);
    const rejected = collector.getRejectionCounts();
    const reductionCounts = verdictReductionCounts(
      expectedIds,
      collector.getAcceptedIds(),
      active,
      rejected,
      salvagedTurnLimitCount,
    );
    const value: ConfirmValue = {
      findings: active.findings,
      confirmedCount: confirmations.filter((confirmation) => confirmation.promoted).length,
      rejectedUnexpectedCount: rejected.unexpected,
      rejectedDuplicateCount: rejected.duplicate,
      ...(verdictWasReduced(reductionCounts) && {
        reduction: { stage: 'confirm', reason: 'incomplete_confirm', ...reductionCounts },
      }),
    };
    return { usage, value };
  });
  return completeStage(input, 'confirm', fingerprint, outcome.usage, outcome.value, identity, startedAt);
}

export async function runCalibrateStage(
  input: KnowledgeFindingStageInput,
  runtime: CapellaStageRuntime,
): Promise<CompletedStage<CalibrateValue>> {
  const startedAt = Date.now();
  const source = await loadConfirmFindings(input);
  const kbContext = await knowledgeContext(input);
  const identity = await resolveStageIdentity(input);
  const prompt = renderFindingsPrompt(
    input,
    'sast.capella.calibrate',
    { ...CALIBRATE_TOOLS, KB_DIR: 'the host-provided context below' },
    source.findings,
    kbContext,
  );
  const fingerprint = buildStageFingerprint('calibrate', identity, prompt, {
    findings: artifactLineage(input.findingsArtifact),
    architecture: artifactLineage(input.architectureArtifact),
    threatModel: artifactLineage(input.threatModelArtifact),
  });
  const reused = await maybeReuseStage(input, 'calibrate', fingerprint, isCalibrateValue, identity, startedAt);
  if (reused) return reused;
  // Calibration covers review survivors that remain viable in production. This allow-list
  // keeps future statuses out until they are explicitly made reportable.
  const expected = source.findings.filter(
    (finding) =>
      (finding.status === 'VALID' || finding.status === 'PROVISIONALLY_VALID') &&
      finding.production_viability !== 'NON_VIABLE',
  );

  const outcome = await withTemporaryFindings(input.artifactRoot, source.findings, async (findingsDir) => {
    const expectedIds = expected.map((finding) => finding.id);
    const collector = createCalibrationCollector({ findingsDir, expectedIds });
    const systemPrompt =
      'You calibrate report-only risk scores. Do not change exported severity, status, or export eligibility.';
    const primary = await runCollectorSession(
      () =>
        runtime.executor.run<void>({
          stage: 'calibrate',
          role: 'small',
          cwd: input.repoPath,
          systemPrompt,
          userPrompt: prompt,
          maxTurns: CALIBRATE_MAX_TURNS,
          timeoutMs: input.timeoutMs,
          tools: [...runtime.repositoryTools, ...collector.tools],
          signal: runtime.signal,
          sessionLabel: 'primary',
        }),
      () => collector.getAcceptedIds().length,
    );
    let usage = primary.usage;
    let salvagedTurnLimitCount = primary.salvagedTurnLimit ? 1 : 0;
    const missing = missingFindings(expected, collector.getAcceptedIds());
    if (missing.length > 0) {
      const repair = await runCollectorSession(
        () =>
          runtime.executor.run<void>({
            stage: 'calibrate',
            role: 'small',
            cwd: input.repoPath,
            systemPrompt,
            userPrompt: renderVerdictRepairPrompt(
              input,
              'sast.capella.calibrate',
              { ...CALIBRATE_TOOLS, KB_DIR: 'the host-provided context below' },
              missing,
              kbContext,
            ),
            maxTurns: CALIBRATE_MAX_TURNS,
            timeoutMs: input.timeoutMs,
            tools: [...runtime.repositoryTools, ...collector.tools],
            signal: runtime.signal,
            sessionLabel: 'repair',
          }),
        () => collector.getAcceptedIds().length,
      );
      usage = addUsage(usage, repair.usage);
      if (repair.salvagedTurnLimit) salvagedTurnLimitCount += 1;
    }
    const calibrations = collector.getCalibrations();
    const active = await readActiveFindings(findingsDir);
    const rejected = collector.getRejectionCounts();
    const reductionCounts = verdictReductionCounts(
      expectedIds,
      collector.getAcceptedIds(),
      active,
      rejected,
      salvagedTurnLimitCount,
    );
    const value: CalibrateValue = {
      findings: active.findings,
      calibratedCount: calibrations.length,
      rejectedUnexpectedCount: rejected.unexpected,
      rejectedDuplicateCount: rejected.duplicate,
      ...(verdictWasReduced(reductionCounts) && {
        reduction: { stage: 'calibrate', reason: 'incomplete_calibrate', ...reductionCounts },
      }),
    };
    return { usage, value };
  });
  return completeStage(input, 'calibrate', fingerprint, outcome.usage, outcome.value, identity, startedAt);
}
