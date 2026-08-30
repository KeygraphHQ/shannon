// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { ApplicationFailure, defineQuery, isCancellation, proxyActivities, setHandler } from '@temporalio/workflow';
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
  | 'reserveBlackboxPlanningWave'
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
  heartbeatTimeout: '30 seconds',
  retry: { maximumAttempts: 3 },
});

const safeModelActivities = proxyActivities<BlackboxSafeModelActivities>({
  startToCloseTimeout: '45 minutes',
  heartbeatTimeout: '30 seconds',
  retry: { maximumAttempts: 2 },
});

const effectActivities = proxyActivities<BlackboxEffectActivities>({
  startToCloseTimeout: '45 minutes',
  heartbeatTimeout: '30 seconds',
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

function throwIfCancellation(error: unknown): void {
  if (isCancellation(error)) throw error;
}

function compareTaskIds(left: { readonly taskId: string }, right: { readonly taskId: string }): number {
  if (left.taskId < right.taskId) return -1;
  if (left.taskId > right.taskId) return 1;
  return 0;
}

type SettlementTask = Pick<PlannerTask, 'taskId' | 'kind' | 'hypothesisId' | 'replayPlan'>;

function deliveryUnknownContribution(task: SettlementTask, baseRevision: number): WorkerContribution {
  if (task.kind !== 'action' || !task.hypothesisId || !task.replayPlan) {
    throw new Error(`cannot record unknown delivery for malformed action task ${task.taskId}`);
  }
  return {
    taskId: task.taskId,
    role: 'blackbox-action',
    baseRevision,
    actions: [
      {
        actionId: task.taskId,
        hypothesisId: task.hypothesisId,
        sequence: { actionId: task.taskId, ...task.replayPlan },
        status: 'delivery_unknown',
        exchangeIds: [],
        observation: null,
        provenance: { actor: 'blackbox-action', taskId: task.taskId, baseRevision },
      },
    ],
  };
}

/** Convert ordered worker attempts into one deterministic, atomic settlement request. */
export function buildSettlement(
  input: BlackboxWorkflowInput,
  baseRevision: number,
  tasks: readonly SettlementTask[],
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
      if (task.kind === 'action') contributions.push(deliveryUnknownContribution(task, baseRevision));
      else failures.push({ taskId: task.taskId, reason: reasonFor(attempt.reason) });
      continue;
    }

    if (attempt.value.taskId !== task.taskId) {
      if (task.kind === 'action') contributions.push(deliveryUnknownContribution(task, baseRevision));
      else failures.push({ taskId: task.taskId, reason: 'worker contribution task ID does not match its registered task' });
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
      throwIfCancellation(error);
      if (!isStaleRevisionFailure(error)) throw error;

      const current = await controlActivities.readPlannerSnapshot(input);
      updateTaskState(current);
      const settled = await controlActivities.settleBlackboxTasks(
        buildSettlement(
          input,
          revision,
          tasks,
          tasks.map(() => ({
            status: 'rejected' as const,
            reason: new Error('stale revision; worker contribution discarded and task must be replanned'),
          })),
          operationKey,
        ),
      );
      updateTaskState(settled);
      return settled;
    }
  };

  const executePendingTasks = async (tasks: readonly PlannerTask[], waveNumber: number): Promise<void> => {
    const analysisTasks = tasks.filter(({ kind }) => kind === 'analysis').sort(compareTaskIds);
    if (analysisTasks.length > 0) {
      const started = await controlActivities.startBlackboxTasks({
        ...input,
        revision,
        taskIds: analysisTasks.map(({ taskId }) => taskId),
        operationKey: operationKeyFor(
          input.workflowId,
          waveNumber,
          'start',
          analysisTasks.map(({ taskId }) => taskId),
        ),
      });
      updateTaskState(started);
      const baseRevision = revision;
      const attempts = await Promise.allSettled(
        analysisTasks.map((task) =>
          safeModelActivities.runBlackboxAnalysis({ ...input, task, revision: baseRevision }),
        ),
      );
      const cancelled = attempts.find(
        (attempt): attempt is PromiseRejectedResult => attempt.status === 'rejected' && isCancellation(attempt.reason),
      );
      if (cancelled) throw cancelled.reason;
      await settleGroup(
        analysisTasks,
        attempts,
        operationKeyFor(
          input.workflowId,
          waveNumber,
          'settle',
          analysisTasks.map(({ taskId }) => taskId),
        ),
      );
    }

    const reconTasks = tasks.filter(({ kind }) => kind === 'recon').sort(compareTaskIds);
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
      if (attempt.status === 'rejected') throwIfCancellation(attempt.reason);
      await settleGroup([task], [attempt], operationKeyFor(input.workflowId, waveNumber, 'settle', [task.taskId]));
    }

    const actionTasks = tasks.filter(({ kind }) => kind === 'action').sort(compareTaskIds);
    for (const task of actionTasks) {
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
      if (actionAttempt.status === 'rejected') throwIfCancellation(actionAttempt.reason);
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
          throwIfCancellation(error);
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
  };

  const evaluateWave = async (
    waveNumber: number,
    plannerStop: boolean,
  ): Promise<BlackboxWorkflowResult | null> => {
    const evaluation = await controlActivities.evaluateBlackboxProgress({
      ...input,
      revision,
      waveNumber,
      plannerStop,
      operationKey: operationKeyFor(input.workflowId, waveNumber, 'evaluate', []),
    });
    setRevision(evaluation.revision);
    if (evaluation.decision === 'continue') return null;
    return finalize(evaluation.decision, waveNumber);
  };

  try {
    const preflight = await controlActivities.preflightBlackbox(input);
    setRevision(preflight.revision);
    progress = { ...progress, wave: preflight.consumedPlanningWaves };
    if (preflight.terminalResult) {
      progress = { ...progress, status: preflight.terminalResult.status };
      return preflight.terminalResult;
    }
    if (preflight.unresolvedCandidateIds.length > 0) {
      return await finalize(
        'incomplete',
        preflight.consumedPlanningWaves,
        'candidate verification outcome was not durably committed before resume',
      );
    }
    if (preflight.finalizationIntent) {
      return await finalize(preflight.finalizationIntent, preflight.consumedPlanningWaves);
    }

    const anonymousCapture = await effectActivities.captureAnonymous(input);
    setRevision(anonymousCapture.revision);

    const identityCaptures = [];
    for (const identity of preflight.identities) {
      const capture = await effectActivities.captureIdentity(input, identity.name);
      setRevision(capture.revision);
      identityCaptures.push(capture);
    }

    if (identityCaptures.filter((capture) => capture.authenticated).length < 2) {
      return await finalize(
        'incomplete',
        preflight.consumedPlanningWaves,
        'fewer than two identities authenticated successfully',
      );
    }

    await executePendingTasks(preflight.resumedTasks, preflight.consumedPlanningWaves);

    if (preflight.pendingPlanningEvaluation) {
      const terminal = await evaluateWave(
        preflight.pendingPlanningEvaluation.waveNumber,
        preflight.pendingPlanningEvaluation.plannerStop,
      );
      if (terminal) return terminal;
    }

    if (preflight.consumedPlanningWaves >= 8) return await finalize('incomplete', 8);

    for (let waveNumber = preflight.consumedPlanningWaves + 1; waveNumber <= 8; waveNumber += 1) {
      progress = { ...progress, wave: waveNumber };

      const reserved = await controlActivities.reserveBlackboxPlanningWave({
        ...input,
        revision,
        waveNumber,
        operationKey: operationKeyFor(input.workflowId, waveNumber, 'reserve', []),
      });
      updateTaskState(reserved);
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

      await executePendingTasks([...registered.wave.concurrent, ...registered.wave.actions], waveNumber);

      const terminal = await evaluateWave(waveNumber, batch.stop);
      if (terminal) return terminal;
    }

    return await finalize('incomplete', 8);
  } catch (error) {
    throwIfCancellation(error);
    const failure = `black-box workflow component failed (${error instanceof Error ? error.name : 'unknown error'})`;
    try {
      const current = await controlActivities.readPlannerSnapshot(input);
      updateTaskState(current);
      const runningTasks = current.tasks.filter(({ status }) => status === 'running');
      if (runningTasks.length > 0) {
        const settled = await controlActivities.settleBlackboxTasks(
          buildSettlement(
            input,
            revision,
            runningTasks,
            runningTasks.map(() => ({
              status: 'rejected' as const,
              reason: new Error('workflow component failed'),
            })),
            operationKeyFor(
              input.workflowId,
              progress.wave,
              'settle',
              runningTasks.map(({ taskId }) => taskId),
            ),
          ),
        );
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
