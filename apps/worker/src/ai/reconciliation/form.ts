// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Pass 1 task formation over current observations only. */

import path from 'node:path';
import { DEFAULT_DELIVERABLES_SUBDIR, WORKSPACES_DIR } from '../../paths.js';
import { loadPrompt } from '../../services/prompt-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import type { ReconciliationClass } from '../../types/reconciliation.js';
import { materializeSourceJail } from '../pi/source-jail.js';
import {
  isTaskFormationFallbackReason,
  type TaskFormationExecutionContext,
  type TaskFormationExecutor,
  TaskFormationExecutorError,
  type TaskFormationExecutorResult,
  type TaskFormationFallbackReason,
  type TaskFormationUsage,
  taskFormationExecutor,
} from '../pi/task-formation-executor.js';
import { ArtifactIntegrityError, ReconciliationIoError, readArtifact, writeArtifact } from './artifact-store.js';
import type { ArtifactRef, ReconciliationObservation } from './contracts.js';
import { mintLabels } from './labels.js';
import { findLeakedProducerIds, toObservationView } from './observation-view.js';
import { combineObservations } from './observations.js';
import type { FormSuccess, StageMetrics, TaskFormationBody, TaskFormationInput } from './stage-contracts.js';
import { SINGLETON_FALLBACK } from './stage-contracts.js';
import { createValidatingSubmitTool } from './submit-validation.js';
import { acceptTaskGroups, buildTaskFormationSchema, findTaskFormationProblems } from './task-formation-schema.js';

// Two copies of the same pattern, not one shared regex: the global-flagged one is used with
// .replace() below, while the non-global one is used with .test(). A global regex carries a
// stateful lastIndex across calls to .test(), so reusing one instance for both would make a later
// leak check silently start scanning mid-string instead of from the beginning.
const INTERNAL_REFERENCE_PATTERN = /\b(?:AUTHZ|MISC|AUTH|INJ|XSS|SSRF)(?:-(?:VULN|SAST))?-[0-9]+\b/gu;
const INTERNAL_REFERENCE_LEAK_PATTERN = /\b(?:AUTHZ|MISC|AUTH|INJ|XSS|SSRF)(?:-(?:VULN|SAST))?-[0-9]+\b/u;
const TRANSIENT_IO_CODE_PATTERN = /\b(?:EAGAIN|EBUSY|EIO|EMFILE|ENFILE|ENOMEM|ENOSPC|EROFS|ETIMEDOUT)\b/u;
// The model-facing forbidden-key set for the task-formation boundary. It is a sibling of, but not
// identical to, `FORBIDDEN_PUBLISHED_KEYS` in publish.ts and prepare.ts: this one guards the
// pre-grouping observation view (which can still carry an `ID` or `merged_from` from an earlier
// stage's shape), while the published-queue set guards the post-materialization task shape. Each
// must independently list every internal-only key for its own boundary; neither can be derived from
// the other.
const FORBIDDEN_MODEL_KEYS = new Set([
  'ID',
  '_sastId',
  'merged_from',
  'novelty',
  'observation_key',
  'primary_preference',
  'producer_id',
]);

export interface FormClassExploitTasksInput {
  readonly sessionId: string;
  readonly vulnerabilityClass: ReconciliationClass;
  readonly repositoryPath: string;
  readonly producerRef: ArtifactRef<'producer-observations'>;
  readonly supplementalRef: ArtifactRef<'supplemental-observations'>;
  readonly deliverablesSubdir?: string;
  readonly webUrl?: string;
}

export interface FormClassExploitTasksResult extends FormSuccess {
  readonly model?: string;
}

export interface FormClassExploitTasksDeps {
  readonly executor?: TaskFormationExecutor;
  readonly workspacesDir?: string;
  readonly signalFor?: () => AbortSignal | undefined;
  readonly executionContextFor?: () => TaskFormationExecutionContext | undefined;
  readonly executorTimeoutMsFor?: () => number | undefined;
  readonly onMetrics?: (metrics: StageMetrics) => void;
  readonly logger?: ActivityLogger;
}

/** Failure that Temporal may retry and, only after exhaustion, classify for singleton fallback. */
export class TaskFormationModelError extends Error {
  override readonly name = 'TaskFormationModelError';
  readonly failureType = 'TaskFormationModelError' as const;
  readonly retryable: boolean;
  readonly fallbackReason: TaskFormationFallbackReason | undefined;
  readonly metrics: StageMetrics;

  constructor(options: {
    message: string;
    retryable: boolean;
    fallbackReason?: TaskFormationFallbackReason;
    metrics: StageMetrics;
  }) {
    super(options.message);
    this.retryable = options.retryable;
    this.fallbackReason = options.fallbackReason;
    this.metrics = options.metrics;
  }
}

const NOOP_LOGGER: ActivityLogger = {
  info() {},
  warn() {},
  error() {},
};

function zeroMetrics(): StageMetrics {
  return { costUsd: 0, modelCalls: 0, inputTokens: 0, outputTokens: 0 };
}

function metricsFromUsage(usage: TaskFormationUsage, modelCalls: number): StageMetrics {
  return {
    costUsd: usage.costUsd,
    modelCalls,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
  };
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('Task formation was cancelled.', 'AbortError');
}

function checkCancellation(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw cancellationError(signal);
}

// The depth cap bounds how far this walks an error's `cause`/`context`/`originalError` chain
// looking for a transient I/O code. It exists only to stop a pathological or circular chain from
// recursing forever; ordinary wrapped errors are a handful of layers deep at most.
function isTransientPromptIoFailure(error: unknown, depth = 0): boolean {
  if (depth > 4) return false;
  if (typeof error === 'string') return TRANSIENT_IO_CODE_PATTERN.test(error);
  if (typeof error !== 'object' || error === null) return false;

  if ('code' in error && typeof error.code === 'string' && TRANSIENT_IO_CODE_PATTERN.test(error.code)) return true;
  if ('cause' in error && isTransientPromptIoFailure(error.cause, depth + 1)) return true;
  if ('context' in error && isTransientPromptIoFailure(error.context, depth + 1)) return true;
  if ('originalError' in error && isTransientPromptIoFailure(error.originalError, depth + 1)) return true;
  return false;
}

// This is a distinct pass from the producer-ID redaction in observation-view.ts: that one redacts
// producer IDs it already knows about (because they were passed in), while this one redacts any
// string that merely looks like an internal class/reference token (e.g. an INJ-VULN-03-shaped
// substring), including one that might appear inside free-text evidence rather than as an ID field.
function scrubInternalReferences(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(INTERNAL_REFERENCE_PATTERN, '[redacted]');
  if (Array.isArray(value)) return value.map(scrubInternalReferences);
  if (value !== null && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) output[key] = scrubInternalReferences(item);
    return output;
  }
  return value;
}

function findForbiddenKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) findForbiddenKeys(item, found);
    return found;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_MODEL_KEYS.has(key)) found.add(key);
      findForbiddenKeys(item, found);
    }
  }
  return found;
}

function taskFormationPromptName(vulnerabilityClass: ReconciliationClass): string {
  return `task-formation-${vulnerabilityClass}`;
}

// A filesystem fault reading the prompt is retryable (the prompt file is expected to exist and a
// transient read failure should not fail the class outright), while any other failure means the
// prompt itself is missing or unreadable content, which Temporal should not spend retries on.
async function loadClassPolicy(
  vulnerabilityClass: ReconciliationClass,
  jailPath: string,
  webUrl: string,
  logger: ActivityLogger,
): Promise<string> {
  try {
    return await loadPrompt(
      taskFormationPromptName(vulnerabilityClass),
      { webUrl, repoPath: jailPath, AUTH_STATE_FILE: '' },
      null,
      false,
      logger,
    );
  } catch (error) {
    if (isTransientPromptIoFailure(error)) {
      throw new ReconciliationIoError('The fixed task-formation class policy prompt could not be read');
    }
    throw new ArtifactIntegrityError('The fixed task-formation class policy prompt is unavailable');
  }
}

/**
 * Build the exact prompt-facing input for task formation, so that the model that groups
 * observations into exploitation tasks never sees a producer ID or other internal identity.
 *
 * Each observation gets a short opaque label (minted disjoint from every producer ID in this
 * batch) that the model uses to refer to it instead of its real identity; the label-to-ID mapping
 * stays code-side. This is the point in the pipeline where the internal-identity boundary is
 * actually built, not merely checked: if this function stopped minting labels and passed producer
 * IDs through instead, a downstream exploit agent reading the eventual published queue would learn
 * exactly which scan producer (and by extension, which internal class/source combination) found
 * each vulnerability, which the reconciliation contract exists to prevent.
 */
function buildModelInput(
  observations: readonly ReconciliationObservation[],
  vulnerabilityClass: ReconciliationClass,
): {
  readonly input: TaskFormationInput;
  readonly labelToProducerId: ReadonlyMap<string, string>;
  readonly serialized: string;
} {
  const producerIds = observations.map((observation) => observation.producer_id);
  const labels = mintLabels(observations.length, { taken: new Set(producerIds) });
  const labelToProducerId = new Map<string, string>();
  const queued_findings = observations.map((observation, index) => {
    const label = labels[index] as string;
    labelToProducerId.set(label, observation.producer_id);
    const projected = toObservationView(observation, vulnerabilityClass, producerIds);
    return { label, entry: scrubInternalReferences(projected) };
  }) as TaskFormationInput['queued_findings'];
  const input: TaskFormationInput = { queued_findings };

  // First gate: a structural check that no forbidden key name made it into the projected shape at
  // all. The serialized-string check below is the second, independent gate against the same
  // failure mode, catching a producer ID or reference token that leaked as a value rather than a key.
  const forbiddenKeys = findForbiddenKeys(input);
  if (forbiddenKeys.size > 0) {
    throw new ArtifactIntegrityError('An internal key survived the task-formation positive projection');
  }

  // Final gate before the prompt bytes are built: fail closed if any producer ID or internal
  // reference token survived projection and scrubbing, so the model never sees internal identity.
  const serialized = JSON.stringify(input, null, 2);
  if (findLeakedProducerIds(serialized, producerIds).length > 0 || INTERNAL_REFERENCE_LEAK_PATTERN.test(serialized)) {
    throw new ArtifactIntegrityError('An internal reference survived the task-formation positive projection');
  }
  return { input, labelToProducerId, serialized };
}

function validateInputRefs(input: FormClassExploitTasksInput): void {
  if (
    input.producerRef.vulnerabilityClass !== input.vulnerabilityClass ||
    input.supplementalRef.vulnerabilityClass !== input.vulnerabilityClass
  ) {
    throw new ArtifactIntegrityError('Task formation received a cross-class artifact reference');
  }
}

async function writeFormationArtifact(
  input: FormClassExploitTasksInput,
  workspacesDir: string,
  body: TaskFormationBody,
): Promise<ArtifactRef<'task-formation'>> {
  return writeArtifact({
    sessionId: input.sessionId,
    workspacesDir,
    artifactKind: 'task-formation',
    vulnerabilityClass: input.vulnerabilityClass,
    body,
    inputs: [
      { artifactKind: 'producer-observations', sha256: input.producerRef.sha256 },
      { artifactKind: 'supplemental-observations', sha256: input.supplementalRef.sha256 },
    ],
    counts: {
      accepted_groups: body.groups.length,
      rejected_groups: body.rejected_group_count,
      dropped_unknown_labels: body.dropped_unknown_label_count,
    },
  });
}

/** Whether an exhausted error is one of the three locked semantic-fallback cases. */
export function isSingletonFallbackEligible(error: unknown): error is TaskFormationModelError {
  return (
    error instanceof TaskFormationModelError && error.retryable && isTaskFormationFallbackReason(error.fallbackReason)
  );
}

/** Return the sentinel only for an exhausted eligible model-stage failure; otherwise rethrow. */
export function singletonFallbackAfterExhaustion(error: unknown): typeof SINGLETON_FALLBACK {
  if (isSingletonFallbackEligible(error)) return SINGLETON_FALLBACK;
  throw error;
}

/** Build the Pass 1 stage with explicit executor, workspace, cancellation, and metric bindings. */
export function createFormClassExploitTasks(
  deps: FormClassExploitTasksDeps = {},
): (input: FormClassExploitTasksInput) => Promise<FormClassExploitTasksResult> {
  const executor = deps.executor ?? taskFormationExecutor;
  const workspacesDir = deps.workspacesDir ?? WORKSPACES_DIR;
  const logger = deps.logger ?? NOOP_LOGGER;

  return async function formClassExploitTasks(input: FormClassExploitTasksInput): Promise<FormClassExploitTasksResult> {
    validateInputRefs(input);
    const signal = deps.signalFor?.();
    checkCancellation(signal);

    const producer = await readArtifact(input.producerRef, input.sessionId, workspacesDir);
    const supplemental = await readArtifact(input.supplementalRef, input.sessionId, workspacesDir);
    checkCancellation(signal);
    const observations = combineObservations(producer.observations, supplemental.observations);

    // Fewer than two observations can form no group, so skip the model entirely and write an empty
    // formation with zero cost. This is one of the paths that leaves `model_ran` false.
    if (observations.length < 2) {
      const body: TaskFormationBody = {
        model_ran: false,
        groups: [],
        rejected_group_count: 0,
        dropped_unknown_label_count: 0,
      };
      const metrics = zeroMetrics();
      const ref = await writeFormationArtifact(input, workspacesDir, body);
      deps.onMetrics?.(metrics);
      return { ref, metrics };
    }

    const modelInput = buildModelInput(observations, input.vulnerabilityClass);
    const labelSet = new Set(modelInput.input.queued_findings.map(({ label }) => label));
    const submitTool = createValidatingSubmitTool(buildTaskFormationSchema([...labelSet]), (parameters) =>
      findTaskFormationProblems(parameters, labelSet),
    );
    const deliverablesPath = path.resolve(
      input.repositoryPath,
      input.deliverablesSubdir ?? DEFAULT_DELIVERABLES_SUBDIR,
    );
    const reconciliationWorkspacePath = path.resolve(workspacesDir, input.sessionId, '.shannon', 'reconciliation');
    // Task formation runs against a disposable copy of the source tree rather than the live
    // repository or the deliverables directory, so the model's tool calls during this stage cannot
    // read or modify anything outside what it was actually given to reason about.
    const jail = await materializeSourceJail({
      sourceRoot: input.repositoryPath,
      deliverablesPath,
      reconciliationWorkspacePath,
      ...(signal !== undefined && { signal }),
    });

    let formation: FormClassExploitTasksResult;
    try {
      const classPolicy = await loadClassPolicy(
        input.vulnerabilityClass,
        jail.dir,
        input.webUrl ?? 'https://not-applicable.invalid',
        logger,
      );
      checkCancellation(signal);

      let modelResult: TaskFormationExecutorResult;
      try {
        const executorTimeoutMs = deps.executorTimeoutMsFor?.();
        modelResult = await executor.run({
          cwd: jail.dir,
          systemPrompt: classPolicy,
          modelContext: modelInput.serialized,
          deniedPaths: jail.deniedPaths,
          submitTool,
          signal: signal ?? new AbortController().signal,
          ...(executorTimeoutMs !== undefined && { timeoutMs: executorTimeoutMs }),
          correlation: {
            ...deps.executionContextFor?.(),
            stage: 'task-formation',
            vulnerabilityClass: input.vulnerabilityClass,
          },
        });
      } catch (error) {
        if (!(error instanceof TaskFormationExecutorError)) throw error;
        if (error.failureKind === 'infrastructure') {
          throw new ReconciliationIoError(
            'Task-formation executor setup encountered a retryable infrastructure failure',
          );
        }
        if (error.failureKind !== 'model') throw error;
        const metrics = metricsFromUsage(error.usage, error.modelCalls);
        deps.onMetrics?.(metrics);
        throw new TaskFormationModelError({
          message: error.message,
          retryable: error.retryable,
          ...(error.fallbackReason !== undefined && { fallbackReason: error.fallbackReason }),
          metrics,
        });
      }

      const metrics = metricsFromUsage(modelResult.usage, modelResult.modelCalls);
      deps.onMetrics?.(metrics);
      checkCancellation(signal);
      const accepted = acceptTaskGroups(modelResult.output, labelSet);
      const groups = accepted.groups.map((group) => ({
        producer_ids: group.queue_labels.map((label) => {
          const producerId = modelInput.labelToProducerId.get(label);
          if (producerId === undefined) {
            throw new ArtifactIntegrityError('An accepted task-formation label has no observation mapping');
          }
          return producerId;
        }),
        reasoning: group.reasoning,
      }));
      const body: TaskFormationBody = {
        model_ran: true,
        groups,
        rejected_group_count: accepted.rejectedGroupCount,
        dropped_unknown_label_count: accepted.droppedUnknownLabelCount,
      };
      const ref = await writeFormationArtifact(input, workspacesDir, body);
      formation = { ref, metrics, model: `${modelResult.providerId}:${modelResult.modelId}` };
    } catch (error) {
      // A primary error — including cancellation — already owns the outcome, so a cleanup failure
      // is logged and swallowed rather than replacing that error's type or cause chain.
      try {
        await jail.cleanup();
      } catch {
        logger.error(
          'A temporary copy of your source code could not be removed after analysis. It is inside the scan workspace and is safe to delete.',
          {
            stage: 'task-formation',
            vulnerabilityClass: input.vulnerabilityClass,
          },
        );
      }
      throw error;
    }

    // Nothing else is in flight after a successful formation, so an unremoved or unverifiable jail
    // is the stage's outcome: it leaves a full copy of the scanned tree on disk and fails here.
    await jail.cleanup();
    return formation;
  };
}

export const formClassExploitTasks = createFormClassExploitTasks();
