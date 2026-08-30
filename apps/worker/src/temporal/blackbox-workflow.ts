// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { ApplicationFailure, defineQuery, proxyActivities, setHandler } from '@temporalio/workflow';
import type {
  BlackboxActivityApi,
  BlackboxTaskState,
  BlackboxWorkflowInput,
  BlackboxWorkflowResult,
  RegisteredWave,
  SettledTasksResult,
  SettleTasksInput,
  TaskTransitionResult,
} from '../blackbox/activities.js';
import { operationKeyFor, validateAndScheduleWave } from '../blackbox/scheduler.js';
import type { BlackboxVerificationAttempt, PlannerTask, WorkerContribution } from '../types/blackbox.js';

export type BlackboxControlActivities = Pick<
  BlackboxActivityApi,
  | 'preflightBlackbox'
  | 'readPlannerSnapshot'
  | 'registerPlannedWave'
  | 'startBlackboxTasks'
  | 'settleBlackboxTasks'
  | 'recordBlackboxVerification'
  | 'recordBlackboxVerificationFailure'
  | 'evaluateBlackboxProgress'
  | 'finalizeBlackboxRun'
>;

export type BlackboxSafeModelActivities = Pick<BlackboxActivityApi, 'runBlackboxPlanner' | 'runBlackboxAnalysis'>;

export type BlackboxEffectActivities = Pick<
  BlackboxActivityApi,
  'captureAnonymous' | 'captureIdentity' | 'runBlackboxRecon' | 'runBlackboxAction' | 'runBlackboxVerifier'
>;

const controlActivities = proxyActivities<BlackboxControlActivities>({
  startToCloseTimeout: '10 minutes',
  retry: { maximumAttempts: 3 },
});

const safeModelActivities = proxyActivities<BlackboxSafeModelActivities>({
  startToCloseTimeout: '45 minutes',
  retry: { maximumAttempts: 2 },
});

const effectActivities = proxyActivities<BlackboxEffectActivities>({
  startToCloseTimeout: '45 minutes',
  retry: { maximumAttempts: 1 },
});

export interface BlackboxWorkflowProgress {
  readonly mode: 'blackbox';
  readonly status: 'running' | BlackboxWorkflowResult['status'];
  readonly wave: number;
  readonly revision: number;
  readonly tasks: readonly BlackboxTaskState[];
  readonly identityLeases: readonly {
    readonly identity: string | 'anonymous';
    readonly taskId: string;
  }[];
}

const getBlackboxProgress = defineQuery<BlackboxWorkflowProgress>('getProgress');

type PersistedTaskTransition = Pick<RegisteredWave | TaskTransitionResult | SettledTasksResult, 'revision' | 'tasks'>;

function reasonFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isStaleRevisionFailure(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current !== null && typeof current === 'object'; depth += 1) {
    const failure = current as {
      readonly cause?: unknown;
      readonly message?: unknown;
      readonly name?: unknown;
      readonly type?: unknown;
    };
    const description = [failure.name, failure.type, failure.message]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
    if (description.includes('stale') && description.includes('revision')) return true;
    current = failure.cause;
  }
  return false;
}

function compareTaskIds(left: { readonly taskId: string }, right: { readonly taskId: string }): number {
  if (left.taskId < right.taskId) return -1;
  if (left.taskId > right.taskId) return 1;
  return 0;
}

/** Convert ordered worker attempts into one deterministic, atomic settlement request. */
export function buildSettlement(
  input: BlackboxWorkflowInput,
  baseRevision: number,
  tasks: readonly PlannerTask[],
  attempts: readonly PromiseSettledResult<WorkerContribution>[],
  operationKey: string,
): SettleTasksInput {
  if (tasks.length !== attempts.length) {
    throw new Error('blackbox settlement requires exactly one attempt per registered task');
  }

  const contributions: WorkerContribution[] = [];
  const failures: { taskId: string; reason: string }[] = [];

  for (let index = 0; index < tasks.length; index += 1) {
    const task = tasks[index];
    const attempt = attempts[index];
    if (!task || !attempt) throw new Error('blackbox settlement contains an unpaired task attempt');

    if (attempt.status === 'rejected') {
      failures.push({ taskId: task.taskId, reason: reasonFor(attempt.reason) });
      continue;
    }

    if (attempt.value.taskId !== task.taskId) {
      failures.push({ taskId: task.taskId, reason: 'worker contribution task ID does not match its registered task' });
      continue;
    }

    contributions.push(attempt.value);
  }

  contributions.sort(compareTaskIds);
  failures.sort(compareTaskIds);

  return {
    ...input,
    baseRevision,
    contributions,
    failures,
    operationKey,
  };
}

function revisionFromRecordResult(result: number | { readonly revision: number }): number {
  return typeof result === 'number' ? result : result.revision;
}

export async function blackboxAuthzWorkflow(input: BlackboxWorkflowInput): Promise<BlackboxWorkflowResult> {
  let progress: BlackboxWorkflowProgress = {
    mode: 'blackbox',
    status: 'running',
    wave: 0,
    revision: 0,
    tasks: [],
    identityLeases: [],
  };
  setHandler(getBlackboxProgress, () => progress);

  let revision = 0;

  const setRevision = (nextRevision: number): void => {
    if (!Number.isSafeInteger(nextRevision) || nextRevision < revision) {
      throw new Error(`invalid blackbox revision transition from ${revision} to ${nextRevision}`);
    }
    revision = nextRevision;
    progress = { ...progress, revision };
    if (progress.revision !== revision) throw new Error('blackbox workflow revision state diverged');
  };

  const updateTaskState = (transition: PersistedTaskTransition): void => {
    setRevision(transition.revision);
    const tasks = transition.tasks.map((task) => ({ ...task }));
    const identityLeases = tasks
      .filter(
        (task): task is BlackboxTaskState & { readonly identityLease: string | 'anonymous' } =>
          task.status === 'running' && task.identityLease !== null,
      )
      .map((task) => ({ identity: task.identityLease, taskId: task.taskId }));
    progress = { ...progress, tasks, identityLeases };
    if (progress.revision !== revision) throw new Error('blackbox workflow task state has the wrong revision');
  };

  const finalize = async (
    status: 'complete' | 'incomplete' | 'failed',
    waveNumber: number,
    failure: string | null = null,
  ): Promise<BlackboxWorkflowResult> => {
    const result = await controlActivities.finalizeBlackboxRun({
      ...input,
      revision,
      status,
      ...(failure === null ? {} : { failure }),
      operationKey: operationKeyFor(input.workflowId, waveNumber, 'finalize', []),
    });
    setRevision(result.revision);
    progress = { ...progress, status: result.status };
    return result;
  };

  const settleGroup = async (
    tasks: readonly PlannerTask[],
    attempts: readonly PromiseSettledResult<WorkerContribution>[],
    operationKey: string,
  ): Promise<SettledTasksResult> => {
    const baseRevision = revision;
    try {
      const settled = await controlActivities.settleBlackboxTasks(
        buildSettlement(input, baseRevision, tasks, attempts, operationKey),
      );
      updateTaskState(settled);
      return settled;
    } catch (error) {
      if (!isStaleRevisionFailure(error)) throw error;

      const current = await controlActivities.readPlannerSnapshot(input);
      updateTaskState(current);
      const settled = await controlActivities.settleBlackboxTasks({
        ...input,
        baseRevision: revision,
        contributions: [],
        failures: tasks.map((task) => ({
          taskId: task.taskId,
          reason: 'stale revision; worker contribution discarded and task must be replanned',
        })),
        operationKey,
      });
      updateTaskState(settled);
      return settled;
    }
  };

  try {
    const preflight = await controlActivities.preflightBlackbox(input);
    setRevision(preflight.revision);

    const anonymousCapture = await effectActivities.captureAnonymous(input);
    setRevision(anonymousCapture.revision);

    const identityCaptures = [];
    for (const identity of preflight.identities) {
      const capture = await effectActivities.captureIdentity(input, identity.name);
      setRevision(capture.revision);
      identityCaptures.push(capture);
    }

    if (identityCaptures.filter((capture) => capture.authenticated).length < 2) {
      return await finalize('incomplete', 0, 'fewer than two identities authenticated successfully');
    }

    for (let waveNumber = 1; waveNumber <= 8; waveNumber += 1) {
      progress = { ...progress, wave: waveNumber };

      const batch = await safeModelActivities.runBlackboxPlanner(input, revision);
      const snapshot = await controlActivities.readPlannerSnapshot(input);
      if (snapshot.revision !== revision) {
        setRevision(snapshot.revision);
        continue;
      }
      const wave = validateAndScheduleWave(batch, snapshot);
      const registered = await controlActivities.registerPlannedWave({
        ...input,
        revision,
        waveNumber,
        batch,
        wave,
        operationKey: operationKeyFor(input.workflowId, waveNumber, 'register', [
          ...wave.concurrent.map((task) => task.taskId),
          ...wave.actions.map((task) => task.taskId),
        ]),
      });
      updateTaskState(registered);

      const analysisTasks = registered.wave.concurrent.filter(({ kind }) => kind === 'analysis');
      if (analysisTasks.length > 0) {
        const started = await controlActivities.startBlackboxTasks({
          ...input,
          revision,
          taskIds: analysisTasks.map((task) => task.taskId),
          operationKey: operationKeyFor(
            input.workflowId,
            waveNumber,
            'start',
            analysisTasks.map((task) => task.taskId),
          ),
        });
        updateTaskState(started);
        const baseRevision = revision;
        const attempts = await Promise.allSettled(
          analysisTasks.map((task) =>
            safeModelActivities.runBlackboxAnalysis({ ...input, task, revision: baseRevision }),
          ),
        );
        await settleGroup(
          analysisTasks,
          attempts,
          operationKeyFor(
            input.workflowId,
            waveNumber,
            'settle',
            analysisTasks.map((task) => task.taskId),
          ),
        );
      }

      const reconTasks = registered.wave.concurrent.filter(({ kind }) => kind === 'recon');
      for (const task of reconTasks) {
        const started = await controlActivities.startBlackboxTasks({
          ...input,
          revision,
          taskIds: [task.taskId],
          operationKey: operationKeyFor(input.workflowId, waveNumber, 'start', [task.taskId]),
        });
        updateTaskState(started);
        const baseRevision = revision;
        const attempt: PromiseSettledResult<WorkerContribution> = await effectActivities
          .runBlackboxRecon({ ...input, task, revision: baseRevision })
          .then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          );
        await settleGroup([task], [attempt], operationKeyFor(input.workflowId, waveNumber, 'settle', [task.taskId]));
      }

      for (const task of registered.wave.actions) {
        const started = await controlActivities.startBlackboxTasks({
          ...input,
          revision,
          taskIds: [task.taskId],
          operationKey: operationKeyFor(input.workflowId, waveNumber, 'start', [task.taskId]),
        });
        updateTaskState(started);
        const baseRevision = revision;
        const actionAttempt: PromiseSettledResult<WorkerContribution> = await effectActivities
          .runBlackboxAction({ ...input, task, revision: baseRevision })
          .then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason: unknown) => ({ status: 'rejected' as const, reason }),
          );
        const settled = await settleGroup(
          [task],
          [actionAttempt],
          operationKeyFor(input.workflowId, waveNumber, 'settle', [task.taskId]),
        );

        for (const candidateId of [...settled.candidateIds].sort()) {
          let attempt: BlackboxVerificationAttempt;
          try {
            attempt = await effectActivities.runBlackboxVerifier({ ...input, candidateId, revision });
          } catch (error) {
            const recorded = await controlActivities.recordBlackboxVerificationFailure({
              ...input,
              revision,
              candidateId,
              reason: reasonFor(error),
              operationKey: operationKeyFor(input.workflowId, waveNumber, 'verify-failure', [candidateId]),
            });
            setRevision(revisionFromRecordResult(recorded));
            continue;
          }
          const recorded = await controlActivities.recordBlackboxVerification({
            ...input,
            revision,
            attempt,
            operationKey: operationKeyFor(input.workflowId, waveNumber, 'verify', [candidateId]),
          });
          setRevision(revisionFromRecordResult(recorded));
        }
      }

      const evaluation = await controlActivities.evaluateBlackboxProgress({
        ...input,
        revision,
        waveNumber,
        plannerStop: batch.stop,
      });
      setRevision(evaluation.revision);
      if (evaluation.decision !== 'continue') return await finalize(evaluation.decision, waveNumber);
    }

    return await finalize('incomplete', 8);
  } catch (error) {
    const failure = `black-box workflow component failed (${error instanceof Error ? error.name : 'unknown error'})`;
    try {
      const current = await controlActivities.readPlannerSnapshot(input);
      updateTaskState(current);
      const runningTasks = current.tasks.filter(({ status }) => status === 'running');
      if (runningTasks.length > 0) {
        const settled = await controlActivities.settleBlackboxTasks({
          ...input,
          baseRevision: revision,
          contributions: [],
          failures: runningTasks.map(({ taskId }) => ({ taskId, reason: 'workflow component failed' })),
          operationKey: operationKeyFor(
            input.workflowId,
            progress.wave,
            'settle',
            runningTasks.map(({ taskId }) => taskId),
          ),
        });
        updateTaskState(settled);
      }
      return await finalize('incomplete', progress.wave, failure);
    } catch {
      throw ApplicationFailure.nonRetryable(
        'Black-box workflow could not finalize after a component failure',
        'BlackboxWorkflowFailure',
      );
    }
  }
}
