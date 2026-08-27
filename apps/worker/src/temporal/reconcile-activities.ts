// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Temporal boundary for the standalone reconciliation stages. */

import { ApplicationFailure, CancelledFailure, Context, heartbeat } from '@temporalio/activity';
import { type ModelHost, modelHost } from '../ai/model-host.js';
import { createPiStructuredGenerationPort } from '../ai/pi/structured-generation.js';
import {
  createTaskFormationExecutor,
  TaskFormationExecutorError,
  type TaskFormationFallbackReason,
} from '../ai/pi/task-formation-executor.js';
import { ReconciliationError } from '../ai/reconciliation/artifact-store.js';
import {
  createEnrichClassSastObservations,
  type EnrichClassSastObservationsInput,
  SastEnrichmentModelError,
} from '../ai/reconciliation/enrich.js';
import {
  createFormClassExploitTasks,
  type FormClassExploitTasksInput,
  TaskFormationModelError,
} from '../ai/reconciliation/form.js';
import {
  type MaterializeClassExploitTasksArgs,
  materializeClassExploitTasks as materializeClassExploitTasksStage,
} from '../ai/reconciliation/materialize.js';
import {
  type PrepareClassReconciliationArgs,
  prepareClassReconciliation as prepareClassReconciliationStage,
} from '../ai/reconciliation/prepare.js';
import {
  type PublishClassReconciliationOssArgs,
  publicationContractForClass,
  publishClassReconciliationOss as publishClassReconciliationOssStage,
} from '../ai/reconciliation/publish.js';
import {
  type SeedEmptyProducerQueueArgs,
  seedEmptyProducerQueue as seedEmptyProducerQueueStage,
} from '../ai/reconciliation/seed-miscellaneous.js';
import type {
  EnrichSuccess,
  FormSuccess,
  MaterializeResult,
  PrepareResult,
} from '../ai/reconciliation/stage-contracts.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { createActivityLogger } from './activity-logger.js';
import {
  type EnrichClassSastObservationsActivityInput,
  type FormClassExploitTasksActivityInput,
  type FormClassExploitTasksActivityResult,
  type MaterializeClassExploitTasksActivityInput,
  type PrepareClassReconciliationActivityInput,
  type PublishClassReconciliationActivityInput,
  RECONCILIATION_ACTIVITY_NAMES,
  RECONCILIATION_ACTIVITY_PROFILES,
  RECONCILIATION_STABLE_FAILURE_TYPES,
  type ReconciliationActivityName,
  type ReconciliationActivityRegistry,
  type ReconciliationClassActivityName,
  type ReconciliationStableFailureType,
  resolveReconciliationActivityBudget,
  type SeedEmptyProducerQueueActivityInput,
} from './reconcile-activity-types.js';

const STABLE_FAILURE_TYPES: ReadonlySet<string> = new Set(RECONCILIATION_STABLE_FAILURE_TYPES);

const DEFAULT_RETRYABILITY: Readonly<Record<ReconciliationStableFailureType, boolean>> = Object.freeze({
  TaskFormationModelError: true,
  SastEnrichmentModelError: true,
  ReconciliationArtifactNotFound: true,
  ReconciliationIoError: true,
  ConfigurationError: false,
  SastEnrichmentInputError: false,
  ArtifactIntegrityError: false,
  PublicationConflict: false,
  UnmappableSurvivor: false,
  KeySetDivergence: false,
});

const SAFE_FAILURE_MESSAGES: Readonly<Record<ReconciliationStableFailureType, string>> = Object.freeze({
  TaskFormationModelError: 'Task formation did not produce an accepted result.',
  SastEnrichmentModelError: 'SAST enrichment did not produce an accepted result.',
  ReconciliationArtifactNotFound: 'A reconciliation artifact is not currently visible.',
  ReconciliationIoError: 'A reconciliation filesystem or Git operation failed.',
  ConfigurationError: 'Reconciliation activity configuration is invalid.',
  SastEnrichmentInputError: 'The supplied SAST reference is invalid.',
  ArtifactIntegrityError: 'Reconciliation artifact integrity validation failed.',
  PublicationConflict: 'The durable class publication conflicts with committed state.',
  UnmappableSurvivor: 'A report-facing survivor cannot be mapped to the class task set.',
  KeySetDivergence: 'Reconciliation report-facing key sets disagree.',
});

interface ReconciliationHeartbeatDetails {
  readonly stage: ReconciliationActivityName;
  readonly attempt: number;
  readonly elapsedSeconds: number;
  readonly classDeadlineMs: number;
}

export interface ReconciliationActivityRuntime {
  readonly attempt: number;
  readonly cancellationSignal: AbortSignal;
  readonly logger: ActivityLogger;
  heartbeat(details: ReconciliationHeartbeatDetails): void;
}

interface ReconciliationStageRuntime {
  readonly signal: AbortSignal;
  readonly logger: ActivityLogger;
  readonly modelHost: ModelHost;
}

export interface ReconciliationStageBindings {
  seedEmptyProducerQueue(args: SeedEmptyProducerQueueArgs): Promise<{
    alreadySeeded: boolean;
    alreadyPublished: boolean;
    commitHash: string;
  }>;
  prepareClassReconciliation(args: PrepareClassReconciliationArgs): Promise<PrepareResult>;
  enrichClassSastObservations(
    input: EnrichClassSastObservationsInput,
    runtime: ReconciliationStageRuntime,
  ): Promise<EnrichSuccess>;
  formClassExploitTasks(input: FormClassExploitTasksInput, runtime: ReconciliationStageRuntime): Promise<FormSuccess>;
  materializeClassExploitTasks(args: MaterializeClassExploitTasksArgs): Promise<MaterializeResult>;
  publishClassReconciliationOss(args: PublishClassReconciliationOssArgs): Promise<{
    alreadyPublished: boolean;
    manifestSha256: string;
    commitHash: string;
  }>;
}

export interface ReconciliationActivityBindings {
  /** Worker-local paths are bound here and never enter Temporal activity arguments. */
  readonly repositoryPath: string;
  readonly deliverablesDir: string;
  readonly workspacesDir: string;
  readonly webUrl?: string;
  readonly modelHost?: ModelHost;
  readonly now?: () => number;
  readonly runtime?: () => ReconciliationActivityRuntime;
  readonly stages?: Partial<ReconciliationStageBindings>;
}

interface FailureMetrics {
  readonly costUsd: number;
  readonly modelCalls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

interface StableFailureDetails {
  readonly metrics?: FailureMetrics;
  readonly fallbackReason?: TaskFormationFallbackReason;
}

function defaultRuntime(): ReconciliationActivityRuntime {
  const context = Context.current();
  return {
    attempt: context.info.attempt,
    cancellationSignal: context.cancellationSignal,
    logger: createActivityLogger(),
    heartbeat,
  };
}

function isStableFailureType(value: string): value is ReconciliationStableFailureType {
  return STABLE_FAILURE_TYPES.has(value);
}

function failureMetrics(error: TaskFormationModelError | SastEnrichmentModelError): FailureMetrics {
  return {
    costUsd: error.metrics.costUsd,
    modelCalls: error.metrics.modelCalls,
    inputTokens: error.metrics.inputTokens,
    outputTokens: error.metrics.outputTokens,
  };
}

/** Build the one ApplicationFailure shape every reconciliation stage failure normalizes into. */
function applicationFailure(
  type: ReconciliationStableFailureType,
  retryable: boolean,
  stage: ReconciliationActivityName,
  details: StableFailureDetails = {},
): ApplicationFailure {
  return ApplicationFailure.create({
    message: SAFE_FAILURE_MESSAGES[type],
    type,
    nonRetryable: !retryable,
    details: [
      {
        stage,
        ...(details.metrics !== undefined && { metrics: details.metrics }),
        ...(details.fallbackReason !== undefined && { fallbackReason: details.fallbackReason }),
      },
    ],
  });
}

function cancellationFrom(error: unknown, signal: AbortSignal): CancelledFailure | undefined {
  if (error instanceof CancelledFailure) return error;

  const errorName = error instanceof Error ? error.name : undefined;
  const cancelledByName = errorName === 'CancelledFailure' || errorName === 'AbortError';
  if (!signal.aborted && !cancelledByName) return undefined;

  const reason = signal.reason;
  if (reason instanceof CancelledFailure) return reason;
  return new CancelledFailure('Reconciliation activity cancelled');
}

/**
 * Map every shape a reconciliation stage can throw (a model-call error, a wrapped executor
 * error, an artifact-store error, an already-classified ApplicationFailure, or an unrecognized
 * error) onto the closed set of stable failure types. Cancellation is checked first and
 * always wins, since a stage aborted for cancellation is not a stage that failed.
 */
function normalizeFailure(error: unknown, stage: ReconciliationActivityName, signal: AbortSignal): never {
  const cancellation = cancellationFrom(error, signal);
  if (cancellation !== undefined) throw cancellation;

  if (error instanceof TaskFormationModelError) {
    throw applicationFailure('TaskFormationModelError', error.retryable, stage, {
      metrics: failureMetrics(error),
      ...(error.fallbackReason !== undefined && { fallbackReason: error.fallbackReason }),
    });
  }
  if (error instanceof SastEnrichmentModelError) {
    throw applicationFailure('SastEnrichmentModelError', error.retryable, stage, {
      metrics: failureMetrics(error),
    });
  }
  if (error instanceof ReconciliationError) {
    throw applicationFailure(error.failureType, error.retryable, stage);
  }
  if (error instanceof TaskFormationExecutorError) {
    if (error.failureKind === 'model') {
      throw applicationFailure('TaskFormationModelError', error.retryable, stage, {
        metrics: {
          costUsd: error.usage.costUsd,
          modelCalls: error.modelCalls,
          inputTokens: error.usage.inputTokens,
          outputTokens: error.usage.outputTokens,
        },
        ...(error.fallbackReason !== undefined && { fallbackReason: error.fallbackReason }),
      });
    }
    const type = error.failureKind === 'confinement' ? 'ArtifactIntegrityError' : 'ConfigurationError';
    throw applicationFailure(type, error.retryable, stage);
  }
  if (error instanceof ApplicationFailure) {
    const errorType = error.type;
    if (typeof errorType === 'string' && isStableFailureType(errorType)) {
      throw applicationFailure(errorType, !error.nonRetryable, stage);
    }
    throw applicationFailure('ReconciliationIoError', true, stage);
  }
  if (error instanceof Error && isStableFailureType(error.name)) {
    const retryable =
      'retryable' in error && typeof error.retryable === 'boolean' ? error.retryable : DEFAULT_RETRYABILITY[error.name];
    throw applicationFailure(error.name, retryable, stage);
  }

  // Unknown failures remain retryable. A generic error name is not evidence that the fault is terminal.
  throw applicationFailure('ReconciliationIoError', true, stage);
}

/** Refuse to schedule a class's remaining reconciliation stages once its 12-hour budget is spent. */
function assertActivityCanRun(
  activityName: ReconciliationClassActivityName,
  classDeadlineMs: number,
  nowMs: number,
): ReturnType<typeof resolveReconciliationActivityBudget> {
  try {
    const budget = resolveReconciliationActivityBudget(activityName, classDeadlineMs, nowMs);
    if (!budget.shouldSchedule) {
      throw applicationFailure('ConfigurationError', false, activityName);
    }
    return budget;
  } catch (error) {
    if (error instanceof ApplicationFailure) throw error;
    throw applicationFailure('ConfigurationError', false, activityName);
  }
}

async function runReconciliationStage<T>(
  activityName: ReconciliationClassActivityName,
  classDeadlineMs: number,
  runtime: ReconciliationActivityRuntime,
  now: () => number,
  stage: (runtime: ReconciliationStageRuntime) => Promise<T>,
  activityModelHost: ModelHost,
): Promise<T> {
  const cancellation = cancellationFrom(undefined, runtime.cancellationSignal);
  if (cancellation !== undefined) throw cancellation;

  const budget = assertActivityCanRun(activityName, classDeadlineMs, now());
  const profile = RECONCILIATION_ACTIVITY_PROFILES[activityName];
  const startedAt = now();
  let heartbeatInterval: ReturnType<typeof setInterval> | undefined;

  if (profile.profile === 'model' && budget.heartbeatIntervalMs !== null) {
    runtime.heartbeat({ stage: activityName, attempt: runtime.attempt, elapsedSeconds: 0, classDeadlineMs });
    heartbeatInterval = setInterval(() => {
      runtime.heartbeat({
        stage: activityName,
        attempt: runtime.attempt,
        elapsedSeconds: Math.max(0, Math.floor((now() - startedAt) / 1_000)),
        classDeadlineMs,
      });
    }, budget.heartbeatIntervalMs);
  }

  try {
    return await stage({ signal: runtime.cancellationSignal, logger: runtime.logger, modelHost: activityModelHost });
  } catch (error) {
    return normalizeFailure(error, activityName, runtime.cancellationSignal);
  } finally {
    if (heartbeatInterval !== undefined) clearInterval(heartbeatInterval);
  }
}

async function runSeedStage<T>(runtime: ReconciliationActivityRuntime, stage: () => Promise<T>): Promise<T> {
  const cancellation = cancellationFrom(undefined, runtime.cancellationSignal);
  if (cancellation !== undefined) throw cancellation;

  try {
    return await stage();
  } catch (error) {
    return normalizeFailure(error, 'seedEmptyProducerQueue', runtime.cancellationSignal);
  }
}

function defaultStages(workspacesDir: string): ReconciliationStageBindings {
  return {
    seedEmptyProducerQueue: seedEmptyProducerQueueStage,
    prepareClassReconciliation: prepareClassReconciliationStage,
    enrichClassSastObservations: (input, runtime) =>
      createEnrichClassSastObservations({
        generation: createPiStructuredGenerationPort(runtime.modelHost),
        modelContextFor: () => undefined,
        workspacesDir,
        signalFor: () => runtime.signal,
        logger: runtime.logger,
      })(input),
    formClassExploitTasks: (input, runtime) =>
      createFormClassExploitTasks({
        executor: createTaskFormationExecutor(runtime.modelHost),
        workspacesDir,
        signalFor: () => runtime.signal,
        logger: runtime.logger,
      })(input),
    materializeClassExploitTasks: materializeClassExploitTasksStage,
    publishClassReconciliationOss: publishClassReconciliationOssStage,
  };
}

function bindStages(
  workspacesDir: string,
  overrides: Partial<ReconciliationStageBindings> | undefined,
): ReconciliationStageBindings {
  return { ...defaultStages(workspacesDir), ...overrides };
}

function assertRegistryNames(registry: ReconciliationActivityRegistry): void {
  const actualNames = Object.keys(registry).sort();
  const expectedNames = [...RECONCILIATION_ACTIVITY_NAMES].sort();
  const expectedNamesAreUnique = new Set(expectedNames).size === expectedNames.length;
  if (
    !expectedNamesAreUnique ||
    actualNames.length !== expectedNames.length ||
    actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    throw new Error('Reconciliation activity registry does not match its frozen six-name contract');
  }
}

/** Bind worker-local filesystem/model dependencies and return the frozen six-activity registry. */
export function createReconciliationActivityRegistry(
  bindings: ReconciliationActivityBindings,
): Readonly<ReconciliationActivityRegistry> {
  const now = bindings.now ?? Date.now;
  const runtimeFor = bindings.runtime ?? defaultRuntime;
  const activityModelHost = bindings.modelHost ?? modelHost;
  const stages = bindStages(bindings.workspacesDir, bindings.stages);

  async function seedEmptyProducerQueue(input: SeedEmptyProducerQueueActivityInput) {
    const runtime = runtimeFor();
    const result = await runSeedStage(runtime, () =>
      stages.seedEmptyProducerQueue({
        deliverablesDir: bindings.deliverablesDir,
        sessionId: input.sessionId,
        logger: runtime.logger,
      }),
    );
    return {
      alreadySeeded: result.alreadySeeded,
      alreadyPublished: result.alreadyPublished,
      commitHash: result.commitHash,
    };
  }

  async function prepareClassReconciliation(input: PrepareClassReconciliationActivityInput) {
    const runtime = runtimeFor();
    const result = await runReconciliationStage(
      'prepareClassReconciliation',
      input.classDeadlineMs,
      runtime,
      now,
      () =>
        stages.prepareClassReconciliation({
          deliverablesDir: bindings.deliverablesDir,
          sessionId: input.sessionId,
          vulnerabilityClass: input.vulnerabilityClass,
          // The contract fixes which fields the eventual published queue may carry for this
          // class. Passing it through unmodified is what keeps internal producer and
          // reconciliation identifiers out of the exploitation queue a downstream exploit
          // agent reads; widening it here would leak those identifiers into model-facing input.
          contract: publicationContractForClass(input.vulnerabilityClass, input.includeSastProvenance),
          workspacesDir: bindings.workspacesDir,
        }),
      activityModelHost,
    );
    if (result.outcome === 'already_published') {
      return { outcome: result.outcome, manifestSha256: result.manifestSha256 };
    }
    return { outcome: result.outcome, ref: result.ref };
  }

  async function enrichClassSastObservations(input: EnrichClassSastObservationsActivityInput) {
    const runtime = runtimeFor();
    const result = await runReconciliationStage(
      'enrichClassSastObservations',
      input.classDeadlineMs,
      runtime,
      now,
      (stageRuntime) =>
        stages.enrichClassSastObservations(
          {
            sessionId: input.sessionId,
            vulnerabilityClass: input.vulnerabilityClass,
            ...(input.sarif !== undefined && { sarif: input.sarif }),
          },
          stageRuntime,
        ),
      activityModelHost,
    );
    return { ref: result.ref, metrics: result.metrics };
  }

  async function formClassExploitTasks(
    input: FormClassExploitTasksActivityInput,
  ): Promise<FormClassExploitTasksActivityResult> {
    const runtime = runtimeFor();
    const result = await runReconciliationStage(
      'formClassExploitTasks',
      input.classDeadlineMs,
      runtime,
      now,
      (stageRuntime) =>
        stages.formClassExploitTasks(
          {
            sessionId: input.sessionId,
            vulnerabilityClass: input.vulnerabilityClass,
            repositoryPath: bindings.repositoryPath,
            producerRef: input.producerRef,
            supplementalRef: input.supplementalRef,
            ...(bindings.webUrl !== undefined && { webUrl: bindings.webUrl }),
          },
          stageRuntime,
        ),
      activityModelHost,
    );
    return { ref: result.ref, metrics: result.metrics };
  }

  async function materializeClassExploitTasks(input: MaterializeClassExploitTasksActivityInput) {
    const runtime = runtimeFor();
    const result = await runReconciliationStage(
      'materializeClassExploitTasks',
      input.classDeadlineMs,
      runtime,
      now,
      () =>
        stages.materializeClassExploitTasks({
          sessionId: input.sessionId,
          workspacesDir: bindings.workspacesDir,
          vulnerabilityClass: input.vulnerabilityClass,
          producerRef: input.producerRef,
          supplementalRef: input.supplementalRef,
          form: input.form,
        }),
      activityModelHost,
    );
    return { ref: result.ref };
  }

  async function publishClassReconciliationOss(input: PublishClassReconciliationActivityInput) {
    const runtime = runtimeFor();
    const result = await runReconciliationStage(
      'publishClassReconciliationOss',
      input.classDeadlineMs,
      runtime,
      now,
      () =>
        stages.publishClassReconciliationOss({
          deliverablesDir: bindings.deliverablesDir,
          sessionId: input.sessionId,
          workspacesDir: bindings.workspacesDir,
          vulnerabilityClass: input.vulnerabilityClass,
          producerRef: input.producerRef,
          supplementalRef: input.supplementalRef,
          fixedTasksRef: input.fixedTasksRef,
          logger: runtime.logger,
        }),
      activityModelHost,
    );
    return {
      alreadyPublished: result.alreadyPublished,
      manifestSha256: result.manifestSha256,
      commitHash: result.commitHash,
    };
  }

  const registry = {
    seedEmptyProducerQueue,
    prepareClassReconciliation,
    enrichClassSastObservations,
    formClassExploitTasks,
    materializeClassExploitTasks,
    publishClassReconciliationOss,
  } satisfies ReconciliationActivityRegistry;
  assertRegistryNames(registry);
  return Object.freeze(registry);
}
