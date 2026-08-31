// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type {
  BlackboxHypothesis,
  EvidenceRef,
  HypothesisStatus,
  PlannerTask,
  ReplayPlan,
  ReplaySequence,
} from '../types/blackbox.js';
import type { Rules } from '../types/config.js';
import type { PlannerBatch } from './agents.js';

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const TASK_KINDS = new Set(['recon', 'analysis', 'action']);
const TASK_STATUSES = new Set(['pending', 'running', 'completed', 'failed', 'rejected']);
const TERMINAL_HYPOTHESIS_STATUSES = new Set<HypothesisStatus>(['verified', 'disproved', 'no_demonstrated_impact']);
const TRANSITIONS = new Set(['reserve', 'register', 'start', 'settle', 'verify', 'verify-failure', 'evaluate', 'finalize']);

export type BlackboxControlTransition =
  | 'reserve'
  | 'register'
  | 'start'
  | 'settle'
  | 'verify'
  | 'verify-failure'
  | 'evaluate'
  | 'finalize';

export interface BlackboxSchedulerSnapshot {
  readonly revision: number;
  readonly targetOrigin: string;
  readonly rules: Rules;
  readonly identities: readonly {
    readonly name: string;
    readonly authenticated: boolean;
  }[];
  readonly exchanges: readonly {
    readonly exchangeId: string;
    readonly routeSignature: string;
    readonly origin: string;
    readonly path: string;
    readonly identity: string | 'anonymous';
    readonly inScope: boolean;
  }[];
  readonly references: readonly EvidenceRef[];
  readonly hypotheses: readonly {
    readonly hypothesisId: string;
    readonly status: HypothesisStatus;
  }[];
  readonly tasks: readonly {
    readonly taskId: string;
    readonly kind: PlannerTask['kind'];
    readonly status: PlannerTask['status'];
    readonly identityLease: PlannerTask['identityLease'];
    readonly hypothesisId: string | null;
    readonly replayPlan?: ReplayPlan;
  }[];
  readonly deliveryUnknownActions: readonly {
    readonly hypothesisId: string;
    readonly replayPlan: ReplayPlan;
  }[];
  readonly rejectedTaskIds: readonly string[];
}

export interface ScheduledWave {
  readonly concurrent: readonly PlannerTask[];
  readonly actions: readonly PlannerTask[];
  readonly rejected: readonly { readonly taskId: string; readonly reason: string }[];
  readonly closedHypothesisIds: readonly string[];
  readonly compiledHypotheses?: readonly BlackboxHypothesis[];
}

function validatedCompiledHypotheses(
  batch: PlannerBatch,
  snapshot: BlackboxSchedulerSnapshot,
): readonly BlackboxHypothesis[] {
  const hypotheses: readonly BlackboxHypothesis[] = batch.compiledHypotheses ?? [];
  if (!Array.isArray(hypotheses) || hypotheses.length > 6) {
    throw new BlackboxSchedulerValidationError('Compiled hypothesis batch must contain zero to six hypotheses');
  }
  const existing = new Set(snapshot.hypotheses.map(({ hypothesisId }) => hypothesisId));
  const seen = new Set<string>();
  for (const rawHypothesis of hypotheses as readonly unknown[]) {
    if (!isRecord(rawHypothesis)) {
      throw new BlackboxSchedulerValidationError('Compiled hypothesis is invalid');
    }
    const hypothesis = rawHypothesis as unknown as BlackboxHypothesis;
    if (!isSafeIdentifier(hypothesis.hypothesisId)) {
      throw new BlackboxSchedulerValidationError('Compiled hypothesis has an invalid identifier');
    }
    if (seen.has(hypothesis.hypothesisId) || existing.has(hypothesis.hypothesisId)) {
      throw new BlackboxSchedulerValidationError(`Duplicate compiled hypothesis ${hypothesis.hypothesisId}`);
    }
    seen.add(hypothesis.hypothesisId);
    if (
      !['horizontal', 'vertical', 'workflow'].includes(hypothesis.kind) ||
      typeof hypothesis.summary !== 'string' ||
      hypothesis.summary.trim().length === 0 ||
      !Array.isArray(hypothesis.preconditions) ||
      !hypothesis.preconditions.every((value: unknown) => typeof value === 'string' && value.trim().length > 0) ||
      typeof hypothesis.attackerCapability !== 'string' ||
      hypothesis.attackerCapability.trim().length === 0 ||
      !['high', 'medium', 'low'].includes(hypothesis.priority) ||
      hypothesis.status !== 'open'
    ) {
      throw new BlackboxSchedulerValidationError(`Compiled hypothesis ${hypothesis.hypothesisId} is invalid`);
    }
    if (
      hypothesis.provenance.actor !== 'orchestrator' ||
      hypothesis.provenance.taskId !== 'authorization-compiler' ||
      hypothesis.provenance.baseRevision !== snapshot.revision
    ) {
      throw new BlackboxSchedulerValidationError(
        `Compiled hypothesis ${hypothesis.hypothesisId} has invalid provenance`,
      );
    }
    const evidenceFailure = evidenceReason(
      {
        taskId: hypothesis.hypothesisId,
        kind: 'analysis',
        objective: hypothesis.summary,
        evidence: hypothesis.evidence,
        identityLease: null,
        hypothesisId: null,
        status: 'pending',
      },
      snapshot,
    );
    if (evidenceFailure) {
      throw new BlackboxSchedulerValidationError(`Compiled hypothesis ${hypothesis.hypothesisId}: ${evidenceFailure}`);
    }
    const action = batch.tasks.find(
      (task) => isRecord(task) && task.kind === 'action' && task.hypothesisId === hypothesis.hypothesisId,
    );
    if (!action) {
      throw new BlackboxSchedulerValidationError(
        `Compiled hypothesis ${hypothesis.hypothesisId} requires a paired action`,
      );
    }
    if (!isDeeplyEqual(hypothesis.evidence, action.evidence)) {
      throw new BlackboxSchedulerValidationError(
        `Compiled hypothesis ${hypothesis.hypothesisId} evidence must match its paired action`,
      );
    }
  }
  return hypotheses;
}

export class BlackboxSchedulerValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlackboxSchedulerValidationError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isDeeplyEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => isDeeplyEqual(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort(compareText);
  const rightKeys = Object.keys(right).sort(compareText);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key, index) => key === rightKeys[index] && isDeeplyEqual(left[key], right[key]))
  );
}

export function replayPlansShareDispatchedStep(
  left: ReplayPlan,
  right: ReplayPlan,
  sourceRouteSignatures?: ReadonlyMap<string, string>,
): boolean {
  const sourceKey = (exchangeId: string): string => sourceRouteSignatures?.get(exchangeId) ?? `exchange:${exchangeId}`;
  return left.steps.some((leftStep) =>
    right.steps.some(
      (rightStep) =>
        sourceKey(leftStep.sourceExchangeId) === sourceKey(rightStep.sourceExchangeId) &&
        leftStep.actor === rightStep.actor &&
        isDeeplyEqual(leftStep.mutations, rightStep.mutations),
    ),
  );
}

function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_IDENTIFIER.test(value);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function normalizedOrigin(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function wildcardMatch(value: string, pattern: string): boolean {
  let valueIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let starValueIndex = -1;

  while (valueIndex < value.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === value[valueIndex]) {
      valueIndex += 1;
      patternIndex += 1;
      continue;
    }
    if (patternIndex < pattern.length && pattern[patternIndex] === '*') {
      starIndex = patternIndex;
      patternIndex += 1;
      starValueIndex = valueIndex;
      continue;
    }
    if (starIndex >= 0) {
      patternIndex = starIndex + 1;
      starValueIndex += 1;
      valueIndex = starValueIndex;
      continue;
    }
    return false;
  }
  while (patternIndex < pattern.length && pattern[patternIndex] === '*') patternIndex += 1;
  return patternIndex === pattern.length;
}

function pathMatches(path: string, rawPattern: string): boolean {
  const pattern = rawPattern.trim();
  if (!pattern.startsWith('/') || pattern.includes('\0')) return false;
  if (pattern.includes('*')) return wildcardMatch(path, pattern);
  const prefix = pattern.endsWith('/') ? pattern : `${pattern}/`;
  return path === pattern || path.startsWith(prefix);
}

function pathIsValid(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !/[?#\r\n\0]/.test(path) &&
    !/^https?:/i.test(path)
  );
}

function pathIsAllowed(path: string, rules: Rules): boolean {
  const avoid = (rules.avoid ?? []).filter(({ type }) => type === 'url_path');
  if (avoid.some(({ value }) => pathMatches(path, value))) return false;
  const focus = (rules.focus ?? []).filter(({ type }) => type === 'url_path');
  return focus.length === 0 || focus.some(({ value }) => pathMatches(path, value));
}

function referenceKey(reference: { readonly id: string; readonly kind: string }): string {
  return `${reference.kind}\0${reference.id}`;
}

function exchangeScopeReason(exchangeId: string, snapshot: BlackboxSchedulerSnapshot): string | null {
  const exchange = snapshot.exchanges.find((candidate) => candidate.exchangeId === exchangeId);
  if (!exchange) return `Unknown source exchange ${exchangeId}`;
  const expectedOrigin = normalizedOrigin(snapshot.targetOrigin);
  const observedOrigin = normalizedOrigin(exchange.origin);
  if (!expectedOrigin || observedOrigin !== expectedOrigin) {
    return `Exchange ${exchangeId} is outside the configured target origin`;
  }
  if (!exchange.inScope || !pathIsValid(exchange.path) || !pathIsAllowed(exchange.path, snapshot.rules)) {
    return `Exchange ${exchangeId} is outside the configured target scope`;
  }
  return null;
}

function identityReason(identity: unknown, snapshot: BlackboxSchedulerSnapshot, context: string): string | null {
  if (identity === 'anonymous') return null;
  if (!isSafeIdentifier(identity)) return `${context} has an invalid identity identifier`;
  const configured = snapshot.identities.find(({ name }) => name === identity);
  if (!configured) return `${context} uses unknown identity ${identity}`;
  if (!configured.authenticated) return `${context} requires authenticated identity ${identity}`;
  return null;
}

function evidenceReason(task: PlannerTask, snapshot: BlackboxSchedulerSnapshot): string | null {
  if (!Array.isArray(task.evidence) || task.evidence.length === 0) return 'Task requires evidence';
  const known = new Set(snapshot.references.map(referenceKey));
  const seen = new Set<string>();
  for (const evidence of task.evidence) {
    if (!isRecord(evidence) || !isSafeIdentifier(evidence.id) || typeof evidence.kind !== 'string') {
      return 'Task contains an invalid evidence reference';
    }
    const key = referenceKey({ id: evidence.id, kind: evidence.kind });
    if (seen.has(key)) return `Task contains duplicate evidence ${evidence.id}`;
    seen.add(key);
    if (!known.has(key)) return `Task contains unknown evidence ${evidence.id}`;
    if (evidence.kind === 'exchange') {
      const reason = exchangeScopeReason(evidence.id, snapshot);
      if (reason) return reason;
    }
  }
  return null;
}

function proofConditionReason(
  condition: unknown,
  taskEvidence: ReadonlySet<string>,
  snapshot: BlackboxSchedulerSnapshot,
): string | null {
  if (!isRecord(condition) || typeof condition.type !== 'string') return 'Action requires a proof condition';
  switch (condition.type) {
    case 'body_contains':
      return typeof condition.marker === 'string' && condition.marker.length > 0 && condition.marker.length <= 512
        ? null
        : 'Action body proof requires a bounded marker';
    case 'json_pointer_equals':
      return typeof condition.pointer === 'string' ? null : 'Action JSON proof requires a pointer';
    case 'persistent_state': {
      const source = condition.verificationSourceExchangeId;
      if (!isSafeIdentifier(source)) return 'Action persistent proof requires a source exchange';
      if (typeof condition.marker !== 'string' || condition.marker.length === 0 || condition.marker.length > 512) {
        return 'Action persistent proof requires a bounded marker';
      }
      if (!taskEvidence.has(source)) return `Action proof source ${source} must be cited as exchange evidence`;
      return exchangeScopeReason(source, snapshot);
    }
    default:
      return `Unsupported action proof condition ${condition.type}`;
  }
}

function mutationReason(mutation: unknown, rules: Rules): string | null {
  if (!isRecord(mutation) || typeof mutation.type !== 'string') return 'Action has an invalid mutation';
  switch (mutation.type) {
    case 'set_path':
      if (!pathIsValid(mutation.path)) return 'Action set_path mutation has an invalid same-origin path';
      if (!pathIsAllowed(mutation.path, rules)) return 'Action set_path mutation is outside configured scope';
      return null;
    case 'set_query':
    case 'set_header':
    case 'set_form_field':
      return typeof mutation.name === 'string' && typeof mutation.value === 'string'
        ? null
        : `Action ${mutation.type} mutation requires string fields`;
    case 'remove_query':
    case 'remove_header':
      return typeof mutation.name === 'string' ? null : `Action ${mutation.type} mutation requires a name`;
    case 'set_json_pointer':
      return typeof mutation.pointer === 'string' ? null : 'Action JSON mutation requires a pointer';
    default:
      return `Unsupported action mutation ${mutation.type}`;
  }
}

function replayPlanReason(task: PlannerTask, snapshot: BlackboxSchedulerSnapshot): string | null {
  if (!isRecord(task.replayPlan)) return 'Action requires an approved replay plan and proof condition';
  if (!Array.isArray(task.replayPlan.steps) || task.replayPlan.steps.length < 1 || task.replayPlan.steps.length > 4) {
    return 'Action replay plan requires one to four steps';
  }

  const taskEvidence = new Set(task.evidence.filter(({ kind }) => kind === 'exchange').map(({ id }) => id));
  const stepIds = new Set<string>();
  for (const step of task.replayPlan.steps) {
    if (!isRecord(step) || !isSafeIdentifier(step.stepId)) return 'Action step has an invalid identifier';
    if (stepIds.has(step.stepId)) return `Action has duplicate step ${step.stepId}`;
    stepIds.add(step.stepId);
    if (!isSafeIdentifier(step.sourceExchangeId)) return `Action step ${step.stepId} has an invalid source exchange`;
    if (!taskEvidence.has(step.sourceExchangeId)) {
      return `Action source ${step.sourceExchangeId} must be cited as exchange evidence`;
    }
    const sourceReason = exchangeScopeReason(step.sourceExchangeId, snapshot);
    if (sourceReason) return sourceReason;
    const actorReason = identityReason(step.actor, snapshot, `Action step ${step.stepId}`);
    if (actorReason) return actorReason;
    if (!Array.isArray(step.mutations) || step.mutations.length > 8) {
      return `Action step ${step.stepId} allows zero to eight explicit mutations`;
    }
    const source = snapshot.exchanges.find(({ exchangeId }) => exchangeId === step.sourceExchangeId);
    if (step.mutations.length === 0 && source?.identity === step.actor) {
      return `Action step ${step.stepId} requires an identity change or an explicit mutation`;
    }
    for (const mutation of step.mutations) {
      const reason = mutationReason(mutation, snapshot.rules);
      if (reason) return reason;
    }
  }
  return proofConditionReason(task.replayPlan.proofCondition, taskEvidence, snapshot);
}

function taskReason(task: PlannerTask, snapshot: BlackboxSchedulerSnapshot): string | null {
  if (!isRecord(task) || !isSafeIdentifier(task.taskId)) return 'Task has an invalid identifier';
  if (!TASK_KINDS.has(task.kind)) return `Unsupported task kind ${String(task.kind)}`;
  if (!TASK_STATUSES.has(task.status) || task.status !== 'pending') return 'Planner task must be pending';
  if (typeof task.objective !== 'string' || task.objective.trim().length === 0) return 'Task requires an objective';

  const evidenceFailure = evidenceReason(task, snapshot);
  if (evidenceFailure) return evidenceFailure;

  if (task.identityLease !== null) {
    const leaseFailure = identityReason(task.identityLease, snapshot, `Task ${task.taskId}`);
    if (leaseFailure) return leaseFailure;
  }
  if (task.kind === 'recon' && task.identityLease === null) return 'Recon task requires an identity lease';

  if (task.hypothesisId !== null) {
    if (!isSafeIdentifier(task.hypothesisId)) return 'Task has an invalid hypothesis identifier';
    const hypothesis = snapshot.hypotheses.find(({ hypothesisId }) => hypothesisId === task.hypothesisId);
    if (!hypothesis) return `Task uses unknown hypothesis ${task.hypothesisId}`;
    if (TERMINAL_HYPOTHESIS_STATUSES.has(hypothesis.status)) {
      return `Task uses terminal hypothesis ${task.hypothesisId}`;
    }
  }

  if (task.kind === 'action') {
    if (task.hypothesisId === null) return 'Action task requires a hypothesis';
    const planFailure = replayPlanReason(task, snapshot);
    if (planFailure) return planFailure;
    const priorUnknownDelivery = snapshot.deliveryUnknownActions.find(
      ({ hypothesisId, replayPlan }) =>
        hypothesisId === task.hypothesisId ||
        (task.replayPlan !== undefined &&
          replayPlansShareDispatchedStep(
            replayPlan,
            task.replayPlan,
            new Map(snapshot.exchanges.map(({ exchangeId, routeSignature }) => [exchangeId, routeSignature])),
          )),
    );
    if (priorUnknownDelivery) {
      return 'Action cannot be resent because a prior action delivery is unknown';
    }
    return null;
  }
  if (task.replayPlan !== undefined) return 'Only action tasks may contain a replay plan';
  return null;
}

function closeHypotheses(batch: PlannerBatch, snapshot: BlackboxSchedulerSnapshot): string[] {
  const requested = batch.closeHypothesisIds ?? [];
  if (requested.length === 0) return [];
  if (!batch.stop || batch.tasks.length !== 0) {
    throw new BlackboxSchedulerValidationError('Hypotheses may close only when the planner stops with no tasks');
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const hypothesisId of requested) {
    if (!isSafeIdentifier(hypothesisId)) {
      throw new BlackboxSchedulerValidationError('Closure contains an invalid hypothesis identifier');
    }
    if (seen.has(hypothesisId)) continue;
    seen.add(hypothesisId);
    const hypothesis = snapshot.hypotheses.find((candidate) => candidate.hypothesisId === hypothesisId);
    if (!hypothesis) throw new BlackboxSchedulerValidationError(`Unknown hypothesis ${hypothesisId}`);
    if (TERMINAL_HYPOTHESIS_STATUSES.has(hypothesis.status)) {
      throw new BlackboxSchedulerValidationError(`Cannot close terminal hypothesis ${hypothesisId}`);
    }
    if (snapshot.deliveryUnknownActions.some((action) => action.hypothesisId === hypothesisId)) {
      throw new BlackboxSchedulerValidationError(`Cannot close hypothesis ${hypothesisId} with an unknown delivery`);
    }
    if (
      snapshot.tasks.some(
        (task) => task.hypothesisId === hypothesisId && (task.status === 'pending' || task.status === 'running'),
      )
    ) {
      throw new BlackboxSchedulerValidationError(`Cannot close hypothesis ${hypothesisId} with active tasks`);
    }
    result.push(hypothesisId);
  }
  return result;
}

export function validateAndScheduleWave(batch: PlannerBatch, snapshot: BlackboxSchedulerSnapshot): ScheduledWave {
  if (!Number.isSafeInteger(batch.baseRevision) || batch.baseRevision !== snapshot.revision) {
    throw new BlackboxSchedulerValidationError(
      `Stale planner revision ${String(batch.baseRevision)}; current revision is ${snapshot.revision}`,
    );
  }
  if (!Array.isArray(batch.tasks) || batch.tasks.length > 6) {
    throw new BlackboxSchedulerValidationError('Planner batch must contain zero to six tasks');
  }

  const compiledHypotheses = validatedCompiledHypotheses(batch, snapshot);
  const validationSnapshot: BlackboxSchedulerSnapshot = {
    ...snapshot,
    hypotheses: [
      ...snapshot.hypotheses,
      ...compiledHypotheses.map(({ hypothesisId, status }) => ({ hypothesisId, status })),
    ],
  };
  const closedHypothesisIds = closeHypotheses(batch, validationSnapshot);
  const existingTaskIds = new Set([...snapshot.tasks.map(({ taskId }) => taskId), ...snapshot.rejectedTaskIds]);
  const counts = new Map<string, number>();
  for (const task of batch.tasks) {
    if (isRecord(task) && typeof task.taskId === 'string') {
      counts.set(task.taskId, (counts.get(task.taskId) ?? 0) + 1);
    }
  }
  const duplicateIds = new Set([...counts.entries()].filter(([, count]) => count > 1).map(([taskId]) => taskId));
  const reportedDuplicates = new Set<string>();
  const preexistingRunningLeases = new Set(
    snapshot.tasks
      .filter(({ status, identityLease }) => status === 'running' && identityLease !== null)
      .map(({ identityLease }) => identityLease as string),
  );
  const reservedConcurrentLeases = new Set(
    snapshot.tasks
      .filter(({ status, identityLease }) => (status === 'pending' || status === 'running') && identityLease !== null)
      .map(({ identityLease }) => identityLease as string),
  );
  const concurrent: PlannerTask[] = [];
  const actions: PlannerTask[] = [];
  const rejected: { taskId: string; reason: string }[] = [];

  for (const task of batch.tasks) {
    const taskId = isRecord(task) && typeof task.taskId === 'string' ? task.taskId : '<invalid-task-id>';
    if (duplicateIds.has(taskId)) {
      if (!reportedDuplicates.has(taskId)) {
        rejected.push({ taskId, reason: `Duplicate task identifier ${taskId}` });
        reportedDuplicates.add(taskId);
      }
      continue;
    }
    if (existingTaskIds.has(taskId)) {
      rejected.push({ taskId, reason: `Task identifier ${taskId} was used by a prior task` });
      continue;
    }
    const reason = taskReason(task, validationSnapshot);
    if (reason) {
      rejected.push({ taskId, reason });
      continue;
    }
    if (task.kind === 'action') {
      const sameWaveAction = actions.find(
        (action) =>
          action.hypothesisId === task.hypothesisId ||
          (action.replayPlan !== undefined &&
            task.replayPlan !== undefined &&
            replayPlansShareDispatchedStep(
              action.replayPlan,
              task.replayPlan,
              new Map(
                validationSnapshot.exchanges.map(({ exchangeId, routeSignature }) => [exchangeId, routeSignature]),
              ),
            )),
      );
      if (sameWaveAction) {
        rejected.push({
          taskId,
          reason: `Action conflicts with same-wave action ${sameWaveAction.taskId} and could resend an unknown delivery`,
        });
        continue;
      }
      const actionIdentities = new Set<string>();
      if (task.identityLease !== null) actionIdentities.add(task.identityLease);
      for (const step of task.replayPlan?.steps ?? []) actionIdentities.add(step.actor);
      const leasedIdentity = [...actionIdentities].find((identity) => preexistingRunningLeases.has(identity));
      if (leasedIdentity) {
        rejected.push({ taskId, reason: `Identity ${leasedIdentity} is leased by running work` });
        continue;
      }
      actions.push(task);
      continue;
    }
    if (task.identityLease !== null) {
      if (reservedConcurrentLeases.has(task.identityLease)) {
        rejected.push({ taskId, reason: `Identity lease ${task.identityLease} conflicts with concurrent work` });
        continue;
      }
      reservedConcurrentLeases.add(task.identityLease);
    }
    concurrent.push(task);
  }

  const acceptedHypothesisIds = new Set(
    actions.flatMap(({ hypothesisId }) => (hypothesisId === null ? [] : [hypothesisId])),
  );
  const acceptedCompiledHypotheses = compiledHypotheses.filter(({ hypothesisId }) =>
    acceptedHypothesisIds.has(hypothesisId),
  );
  return {
    concurrent,
    actions,
    rejected,
    closedHypothesisIds,
    ...(acceptedCompiledHypotheses.length > 0 ? { compiledHypotheses: acceptedCompiledHypotheses } : {}),
  };
}

export function commandForActionTask(task: PlannerTask, executionId = task.taskId): ReplaySequence {
  if (task.kind !== 'action' || !task.replayPlan) {
    throw new BlackboxSchedulerValidationError('Only an action task with an approved replay plan can become a command');
  }
  if (!isSafeIdentifier(executionId)) {
    throw new BlackboxSchedulerValidationError('Action execution has an invalid identifier');
  }
  return {
    actionId: executionId,
    steps: task.replayPlan.steps,
    proofCondition: task.replayPlan.proofCondition,
  };
}

export function decideRunCompletion(input: {
  readonly wave: number;
  readonly plannerStop: boolean;
  readonly pendingTasks: number;
  readonly openImpactHypotheses: number;
  readonly unknownDeliveries?: number;
  readonly hitSafetyLimit: boolean;
}): 'continue' | 'complete' | 'incomplete' {
  if (
    !Number.isSafeInteger(input.wave) ||
    input.wave < 0 ||
    !Number.isSafeInteger(input.pendingTasks) ||
    input.pendingTasks < 0 ||
    !Number.isSafeInteger(input.openImpactHypotheses) ||
    input.openImpactHypotheses < 0 ||
    !Number.isSafeInteger(input.unknownDeliveries ?? 0) ||
    (input.unknownDeliveries ?? 0) < 0
  ) {
    throw new BlackboxSchedulerValidationError('Progress counters must be non-negative safe integers');
  }
  if (input.plannerStop && input.pendingTasks === 0 && (input.unknownDeliveries ?? 0) > 0) return 'incomplete';
  if (input.plannerStop && input.pendingTasks === 0 && input.openImpactHypotheses === 0) return 'complete';
  if (input.hitSafetyLimit || input.wave >= 8) return 'incomplete';
  return 'continue';
}

export function operationKeyFor(
  workflowId: string,
  wave: number,
  transition: BlackboxControlTransition,
  recordIds: readonly string[],
): string {
  if (!isSafeIdentifier(workflowId)) {
    throw new BlackboxSchedulerValidationError('Workflow has an invalid identifier');
  }
  if (!Number.isSafeInteger(wave) || wave < 0) {
    throw new BlackboxSchedulerValidationError('Wave must be a non-negative safe integer');
  }
  if (!TRANSITIONS.has(transition)) {
    throw new BlackboxSchedulerValidationError(`Unsupported control transition ${String(transition)}`);
  }
  const unique = new Set<string>();
  for (const recordId of recordIds) {
    if (!isSafeIdentifier(recordId)) {
      throw new BlackboxSchedulerValidationError('Operation record has an invalid identifier');
    }
    if (unique.has(recordId)) {
      throw new BlackboxSchedulerValidationError(`Duplicate operation record ${recordId}`);
    }
    unique.add(recordId);
  }
  return `${workflowId}:${wave}:${transition}:${[...unique].sort(compareText).join(',')}`;
}
