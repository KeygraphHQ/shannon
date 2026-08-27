// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow-safe Capella child.
 *
 * Everything reachable as a value import from this module must remain safe for
 * the Temporal workflow isolate. Activity implementations are imported as types.
 */

import type { ActivityOptions, ChildWorkflowOptions } from '@temporalio/workflow';
import {
  ActivityCancellationType,
  ApplicationFailure,
  ChildWorkflowCancellationType,
  isCancellation,
  proxyActivities,
} from '@temporalio/workflow';
import { isProviderFailureCategory } from '../../../../types/errors.js';
import type {
  AgenticSastFallbackReduction,
  AgenticSastReduction,
  CapellaRecoveredFailure,
  CapellaRunResult,
  CapellaStage,
  CapellaUsage,
} from '../../types.js';
import { capellaSafeFailureMessage } from '../safe-failures.js';
import { usageAccountingWarning } from '../types.js';
import {
  CAPELLA_ACTIVITY_POLICIES,
  CAPELLA_CHILD_WORKFLOW_TIMEOUT_MS,
  type CapellaActivityFailureDetails,
  type CapellaActivityInput,
  type CapellaActivityPolicy,
  type CapellaActivityRegistry,
  type CapellaActivityResult,
  type CapellaExportActivityInput,
  type CapellaExportActivityResult,
  type CapellaExportSourceStage,
  type CapellaFallbackFailure,
  type CapellaFindingActivityInput,
  type CapellaKnowledgeFindingActivityInput,
  type CapellaPlanActivityInput,
  type CapellaResearchActivityInput,
  type CapellaThreatModelActivityInput,
  type CapellaWorkflowInput,
} from './activity-types.js';

const ZERO_USAGE: CapellaUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  turns: 0,
};

export const CAPELLA_CHILD_WORKFLOW_OPTIONS = Object.freeze({
  workflowExecutionTimeout: CAPELLA_CHILD_WORKFLOW_TIMEOUT_MS,
  cancellationType: ChildWorkflowCancellationType.WAIT_CANCELLATION_COMPLETED,
} as const satisfies Pick<ChildWorkflowOptions, 'workflowExecutionTimeout' | 'cancellationType'>);

function activityOptions(policy: CapellaActivityPolicy): ActivityOptions {
  return {
    startToCloseTimeout: policy.startToCloseTimeoutMs,
    scheduleToCloseTimeout: policy.scheduleToCloseTimeoutMs,
    ...(policy.heartbeatTimeoutMs === null ? {} : { heartbeatTimeout: policy.heartbeatTimeoutMs }),
    retry: {
      initialInterval: policy.retry.initialIntervalMs,
      maximumInterval: policy.retry.maximumIntervalMs,
      backoffCoefficient: policy.retry.backoffCoefficient,
      maximumAttempts: policy.retry.maximumAttempts,
      nonRetryableErrorTypes: [...policy.retry.nonRetryableErrorTypes],
    },
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  };
}

// One proxy per activity: options bind at proxy creation, and every stage carries
// its own timeout and retry policy.
const architectureActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaArchitecture'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaArchitecture),
);
const threatModelActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaThreatModel'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaThreatModel),
);
const planActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaPlan'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaPlan),
);
const researchActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaResearch'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaResearch),
);
const dedupeActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaDedupe'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaDedupe),
);
const reviewActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaReview'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaReview),
);
const criticActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaCritic'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaCritic),
);
const confirmActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaConfirm'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaConfirm),
);
const calibrateActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaCalibrate'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaCalibrate),
);
const exportActivities = proxyActivities<Pick<CapellaActivityRegistry, 'capellaExport'>>(
  activityOptions(CAPELLA_ACTIVITY_POLICIES.capellaExport),
);

// addUsage and isUsage are duplicated from the activity side on purpose: this module
// must stay importable inside the workflow isolate, which rules out sharing a module
// that reaches Node APIs. Keep the twins in sync.
function addUsage(left: CapellaUsage, right: CapellaUsage): CapellaUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    costUsd: left.costUsd + right.costUsd,
    turns: left.turns + right.turns,
  };
}

function isUsage(value: unknown): value is CapellaUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const integerFields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'turns'];
  return (
    integerFields.every((field) => Number.isSafeInteger(record[field]) && Number(record[field]) >= 0) &&
    typeof record.costUsd === 'number' &&
    Number.isFinite(record.costUsd) &&
    record.costUsd >= 0
  );
}

const FAILURE_CODE_PATTERN = /^[A-Z][A-Z0-9_]{0,63}$/;

function isFailureCode(value: unknown): value is string {
  return typeof value === 'string' && (FAILURE_CODE_PATTERN.test(value) || isProviderFailureCategory(value));
}

// Details cross the wire through the payload converter; revalidate the shape rather
// than trust the activity's typing.
function isActivityFailureDetails(value: unknown): value is CapellaActivityFailureDetails {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.stage === 'string' &&
    isFailureCode(record.code) &&
    Number.isSafeInteger(record.attempts) &&
    Number(record.attempts) >= 1 &&
    typeof record.usageComplete === 'boolean' &&
    Array.isArray(record.warnings) &&
    record.warnings.every((warning) => typeof warning === 'string') &&
    isUsage(record.usage)
  );
}

function applicationFailure(error: unknown): ApplicationFailure | undefined {
  let current = error;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    if (current instanceof ApplicationFailure) return current;
    seen.add(current);
    current = 'cause' in current ? (current as { readonly cause?: unknown }).cause : undefined;
  }
  return undefined;
}

function hasCancellationInCauseChain(error: unknown): boolean {
  let current = error;
  const seen = new Set<unknown>();
  let depth = 0;
  while (current instanceof Error && !seen.has(current) && depth < 20) {
    if (isCancellation(current)) return true;
    seen.add(current);
    current = current.cause;
    depth += 1;
  }
  return false;
}

function failureDetails(error: unknown): CapellaActivityFailureDetails | undefined {
  const details = applicationFailure(error)?.details;
  const first = details?.[0];
  return isActivityFailureDetails(first) ? first : undefined;
}

function baseInput(input: CapellaWorkflowInput, policy: CapellaActivityPolicy): CapellaActivityInput {
  return { ...input, timeoutMs: policy.startToCloseTimeoutMs };
}

interface WorkflowAccumulator {
  usage: CapellaUsage;
  usageComplete: boolean;
  readonly completedStages: CapellaStage[];
  readonly warnings: string[];
  // Reduced-coverage summaries in the order stages produce them (research before export).
  readonly reductions: AgenticSastReduction[];
}

function acceptStage<T>(accumulator: WorkflowAccumulator, stage: CapellaStage, result: CapellaActivityResult<T>): void {
  accumulator.usage = addUsage(accumulator.usage, result.usage);
  accumulator.usageComplete &&= result.usageComplete;
  // A stage that retried or whose ledger was incomplete drives the same warning run.json records
  // in recordStageUsageAccounting, so a retried-then-succeeded stage names its reason in every
  // downstream ledger too. succeededResult and the failed result both dedupe and sort warnings.
  if (!result.usageComplete) {
    accumulator.warnings.push(usageAccountingWarning(stage));
  }
  accumulator.completedStages.push(stage);
  if (result.value && typeof result.value === 'object' && 'reduction' in result.value) {
    const reduction = (result.value as { readonly reduction?: AgenticSastReduction }).reduction;
    if (reduction !== undefined) {
      const existingIndex = accumulator.reductions.findIndex((entry) => entry.stage === reduction.stage);
      if (existingIndex >= 0) accumulator.reductions[existingIndex] = reduction;
      else accumulator.reductions.push(reduction);
    }
  }
}

function exportInput(
  input: CapellaWorkflowInput,
  findingsArtifact?: CapellaExportActivityInput['findingsArtifact'],
  findingsStage?: CapellaExportSourceStage,
  fallbackReduction?: AgenticSastFallbackReduction,
  fallbackFailure?: CapellaFallbackFailure,
): CapellaExportActivityInput {
  return {
    ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaExport),
    ...(findingsArtifact && findingsStage ? { findingsArtifact, findingsStage } : {}),
    ...(fallbackReduction !== undefined && { fallbackReduction }),
    ...(fallbackFailure !== undefined && { fallbackFailure }),
  };
}

function succeededResult(
  startedAt: number,
  accumulator: WorkflowAccumulator,
  result: CapellaExportActivityResult,
  recoveredFailure?: CapellaRecoveredFailure,
): CapellaRunResult {
  accumulator.warnings.push(...result.value.warnings);
  const reductions = [...accumulator.reductions];
  return {
    status: 'succeeded',
    sarif: result.value.sarif,
    findingCount: result.value.findingCount,
    // Any reduction (research or export) means the run's static-analysis coverage was reduced.
    coverage: reductions.length > 0 ? 'reduced' : result.value.coverage,
    durationMs: Date.now() - startedAt,
    usage: accumulator.usage,
    usageComplete: accumulator.usageComplete,
    warnings: [...new Set(accumulator.warnings)].sort(),
    ...(reductions.length > 0 && { reductions }),
    ...(recoveredFailure !== undefined && { recoveredFailure }),
  };
}

function acceptFailureDetails(
  accumulator: WorkflowAccumulator,
  error: unknown,
): CapellaActivityFailureDetails | undefined {
  const details = failureDetails(error);
  if (details) {
    accumulator.usage = addUsage(accumulator.usage, details.usage);
    accumulator.usageComplete &&= details.usageComplete;
    accumulator.warnings.push(...details.warnings);
  } else {
    accumulator.usageComplete = false;
  }
  return details;
}

function failedResult(
  startedAt: number,
  accumulator: WorkflowAccumulator,
  stage: CapellaStage,
  error: string,
  errorCode?: string,
): CapellaRunResult {
  return {
    status: 'failed',
    failedStage: stage,
    error,
    ...(errorCode !== undefined && { errorCode }),
    durationMs: Date.now() - startedAt,
    usage: accumulator.usage,
    usageComplete: accumulator.usageComplete,
    completedStages: [...accumulator.completedStages],
    warnings: [...new Set(accumulator.warnings)].sort(),
  };
}

/** Run the isolated ten-stage Capella pipeline and return its bounded result. */
export async function capellaWorkflow(input: CapellaWorkflowInput): Promise<CapellaRunResult> {
  const startedAt = Date.now();
  const accumulator: WorkflowAccumulator = {
    usage: ZERO_USAGE,
    usageComplete: true,
    completedStages: [],
    warnings: [],
    reductions: [],
  };
  let currentStage: CapellaStage = 'architecture';
  let lastGoodFindings:
    | {
        readonly artifact: CapellaFindingActivityInput['findingsArtifact'];
        readonly stage: CapellaExportSourceStage;
        readonly findingCount: number;
      }
    | undefined;

  try {
    const architecture = await architectureActivities.capellaArchitecture(
      baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaArchitecture),
    );
    acceptStage(accumulator, 'architecture', architecture);

    currentStage = 'threat-model';
    const threatModelInput: CapellaThreatModelActivityInput = {
      ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaThreatModel),
      architectureArtifact: architecture.artifact,
    };
    const threatModel = await threatModelActivities.capellaThreatModel(threatModelInput);
    acceptStage(accumulator, 'threat-model', threatModel);

    currentStage = 'plan';
    const planInput: CapellaPlanActivityInput = {
      ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaPlan),
      architectureArtifact: architecture.artifact,
      threatModelArtifact: threatModel.artifact,
    };
    const plan = await planActivities.capellaPlan(planInput);
    acceptStage(accumulator, 'plan', plan);

    if (plan.value.investigationCount === 0) {
      // Nothing to research: still run export so the scan always ends with a valid,
      // empty SARIF artifact rather than an absent one.
      currentStage = 'export';
      const exported = await exportActivities.capellaExport(exportInput(input));
      acceptStage(accumulator, 'export', exported);
      return succeededResult(startedAt, accumulator, exported);
    }

    currentStage = 'research';
    const researchInput: CapellaResearchActivityInput = {
      ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaResearch),
      architectureArtifact: architecture.artifact,
      planArtifact: plan.artifact,
    };
    const research = await researchActivities.capellaResearch(researchInput);
    acceptStage(accumulator, 'research', research);
    lastGoodFindings = { artifact: research.artifact, stage: 'research', findingCount: research.value.findingCount };

    if (research.value.findingCount === 0) {
      currentStage = 'export';
      const exported = await exportActivities.capellaExport(exportInput(input));
      acceptStage(accumulator, 'export', exported);
      return succeededResult(startedAt, accumulator, exported);
    }

    currentStage = 'dedupe';
    const dedupeInput: CapellaFindingActivityInput = {
      ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaDedupe),
      findingsArtifact: research.artifact,
    };
    const dedupe = await dedupeActivities.capellaDedupe(dedupeInput);
    acceptStage(accumulator, 'dedupe', dedupe);
    lastGoodFindings = { artifact: dedupe.artifact, stage: 'dedupe', findingCount: dedupe.value.findingCount };

    currentStage = 'review';
    const reviewInput: CapellaFindingActivityInput = {
      ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaReview),
      findingsArtifact: dedupe.artifact,
    };
    const review = await reviewActivities.capellaReview(reviewInput);
    acceptStage(accumulator, 'review', review);
    lastGoodFindings = { artifact: review.artifact, stage: 'review', findingCount: review.value.findingCount };

    let exportArtifact = review.artifact;
    let exportStage: CapellaExportSourceStage = 'review';
    const reviewedSurvivors = review.value.validCount + review.value.provisionalCount;
    if (reviewedSurvivors > 0) {
      currentStage = 'critic';
      const criticInput: CapellaKnowledgeFindingActivityInput = {
        ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaCritic),
        findingsArtifact: review.artifact,
        architectureArtifact: architecture.artifact,
        threatModelArtifact: threatModel.artifact,
      };
      const critic = await criticActivities.capellaCritic(criticInput);
      acceptStage(accumulator, 'critic', critic);
      lastGoodFindings = { artifact: critic.artifact, stage: 'critic', findingCount: critic.value.findingCount };

      currentStage = 'confirm';
      const confirmInput: CapellaFindingActivityInput = {
        ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaConfirm),
        findingsArtifact: critic.artifact,
      };
      const confirm = await confirmActivities.capellaConfirm(confirmInput);
      acceptStage(accumulator, 'confirm', confirm);
      lastGoodFindings = { artifact: confirm.artifact, stage: 'confirm', findingCount: confirm.value.findingCount };

      currentStage = 'calibrate';
      const calibrateInput: CapellaKnowledgeFindingActivityInput = {
        ...baseInput(input, CAPELLA_ACTIVITY_POLICIES.capellaCalibrate),
        findingsArtifact: confirm.artifact,
        architectureArtifact: architecture.artifact,
        threatModelArtifact: threatModel.artifact,
      };
      const calibrate = await calibrateActivities.capellaCalibrate(calibrateInput);
      acceptStage(accumulator, 'calibrate', calibrate);
      lastGoodFindings = {
        artifact: calibrate.artifact,
        stage: 'calibrate',
        findingCount: calibrate.value.findingCount,
      };
      exportArtifact = calibrate.artifact;
      exportStage = 'calibrate';
    }

    currentStage = 'export';
    const exported = await exportActivities.capellaExport(exportInput(input, exportArtifact, exportStage));
    acceptStage(accumulator, 'export', exported);
    return succeededResult(startedAt, accumulator, exported);
  } catch (error) {
    // Cancellation must escape: absorbing it into a failed result would make a
    // cancelled scan look like an accepted Capella failure. Everything else becomes a
    // bounded failed result so the parent can continue the pentest without Capella
    // findings.
    if (hasCancellationInCauseChain(error)) throw error;

    const failedStage = currentStage;
    const details = acceptFailureDetails(accumulator, error);
    const safeError = capellaSafeFailureMessage(applicationFailure(error)?.type);
    if (failedStage === 'export') {
      return failedResult(startedAt, accumulator, failedStage, safeError, details?.code);
    }

    const completedBeforeFallback = [...accumulator.completedStages];
    const fallbackReduction: AgenticSastFallbackReduction = {
      stage: failedStage,
      reason: 'failed_stage_fallback',
      fallbackFindingCount: lastGoodFindings?.findingCount ?? 0,
    };
    const failedApplication = applicationFailure(error);
    const fallbackFailure: CapellaFallbackFailure = {
      stage: failedStage,
      code: details?.code ?? 'ACTIVITY_FAILURE',
      error: safeError,
      attempt: details?.attempts ?? 1,
      retryable: failedApplication === undefined || !failedApplication.nonRetryable,
    };
    accumulator.reductions.push(fallbackReduction);

    try {
      const fallbackExport = await exportActivities.capellaExport(
        exportInput(input, lastGoodFindings?.artifact, lastGoodFindings?.stage, fallbackReduction, fallbackFailure),
      );
      acceptStage(accumulator, 'export', fallbackExport);
      const recoveredFailure: CapellaRecoveredFailure = {
        failedStage,
        error: safeError,
        ...(details !== undefined && { errorCode: details.code }),
        completedStages: completedBeforeFallback,
      };
      return succeededResult(startedAt, accumulator, fallbackExport, recoveredFailure);
    } catch (fallbackError) {
      if (hasCancellationInCauseChain(fallbackError)) throw fallbackError;
      acceptFailureDetails(accumulator, fallbackError);
      return failedResult(startedAt, accumulator, failedStage, safeError, details?.code);
    }
  }
}
