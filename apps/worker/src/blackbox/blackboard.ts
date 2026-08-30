// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type {
  BlackboardInitialization,
  BlackboardStore,
  BlackboxActionResult,
  BlackboxDocument,
  BlackboxHypothesis,
  BlackboxResource,
  BlackboxRunStatus,
  BlackboxSnapshot,
  BlackboxWorkerRole,
  CandidateProof,
  ContributionBatch,
  DeterministicProofObservation,
  EvidenceProvenance,
  EvidenceRef,
  HypothesisStatus,
  NormalizedExchange,
  PlannerTask,
  ProofCondition,
  RejectedPlannerTask,
  TaskRegistrationBatch,
  VerificationResult,
  WorkerContribution,
  WorkflowTransition,
} from '../types/blackbox.js';
import { SessionMutex } from '../utils/concurrency.js';
import { atomicWrite, ensureDirectory, fileExists, readJson } from '../utils/file-io.js';

const blackboardMutex = new SessionMutex();

export class StaleBlackboardRevisionError extends Error {
  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number,
  ) {
    super(`Stale blackboard revision: expected ${expectedRevision}, current revision is ${actualRevision}`);
    this.name = 'StaleBlackboardRevisionError';
  }
}

export class BlackboardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BlackboardValidationError';
  }
}

type IdentifiedRecord =
  | NormalizedExchange
  | BlackboxResource
  | WorkflowTransition
  | BlackboxHypothesis
  | BlackboxActionResult
  | CandidateProof;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertNonEmptyId(id: string, kind: string): void {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new BlackboardValidationError(`${kind} ID must be a non-empty string`);
  }
}

function assertRevision(expected: number, document: BlackboxDocument): void {
  if (document.revision !== expected) {
    throw new StaleBlackboardRevisionError(expected, document.revision);
  }
}

function mergeRecords<T extends IdentifiedRecord>(
  kind: string,
  existing: readonly T[],
  incoming: readonly T[],
  idOf: (record: T) => string,
  provenance: EvidenceProvenance,
): T[] {
  const records = new Map<string, T>();
  for (const record of existing) records.set(idOf(record), record);

  for (const untrusted of incoming) {
    const record = { ...clone(untrusted), provenance } as T;
    const id = idOf(record);
    assertNonEmptyId(id, kind);
    const current = records.get(id);
    if (current) {
      if (!isDeepStrictEqual(current, record)) {
        throw new BlackboardValidationError(`Conflicting duplicate ${kind} ID ${id}`);
      }
      continue;
    }
    records.set(id, record);
  }

  return [...records.values()].sort((left, right) => idOf(left).localeCompare(idOf(right)));
}

function mergePlainRecords<T>(
  kind: string,
  existing: readonly T[],
  incoming: readonly T[],
  idOf: (record: T) => string,
): T[] {
  const records = new Map<string, T>();
  for (const record of existing) records.set(idOf(record), record);

  for (const untrusted of incoming) {
    const record = clone(untrusted);
    const id = idOf(record);
    assertNonEmptyId(id, kind);
    const current = records.get(id);
    if (current) {
      if (!isDeepStrictEqual(current, record)) {
        throw new BlackboardValidationError(`Conflicting duplicate ${kind} ID ${id}`);
      }
      continue;
    }
    records.set(id, record);
  }

  return [...records.values()].sort((left, right) => idOf(left).localeCompare(idOf(right)));
}

function expectedRole(kind: PlannerTask['kind']): BlackboxWorkerRole {
  switch (kind) {
    case 'recon':
      return 'blackbox-recon';
    case 'analysis':
      return 'blackbox-analysis';
    case 'action':
      return 'blackbox-action';
  }
}

function assertContributionPermission(document: BlackboxDocument, contribution: WorkerContribution): PlannerTask {
  const task = document.tasks.find(({ taskId }) => taskId === contribution.taskId);
  if (!task) throw new BlackboardValidationError(`Unknown task ${contribution.taskId}`);
  if (task.status !== 'running') {
    throw new BlackboardValidationError(`Task ${contribution.taskId} is ${task.status}, not running`);
  }

  const requiredRole = expectedRole(task.kind);
  if (contribution.role !== requiredRole) {
    throw new BlackboardValidationError(
      `Task ${contribution.taskId} requires ${requiredRole}, not ${contribution.role}`,
    );
  }

  const populated = (field: keyof WorkerContribution): boolean => {
    const value = contribution[field];
    return Array.isArray(value) && value.length > 0;
  };
  const incompatible: Readonly<Record<BlackboxWorkerRole, readonly (keyof WorkerContribution)[]>> = {
    'blackbox-recon': ['hypotheses', 'actions', 'candidateProofs'],
    'blackbox-analysis': ['exchanges', 'resources', 'transitions', 'actions', 'candidateProofs'],
    'blackbox-action': ['exchanges', 'resources', 'transitions', 'hypotheses'],
    'blackbox-verifier': ['exchanges', 'resources', 'transitions', 'hypotheses', 'actions', 'candidateProofs'],
  };
  const labels: Partial<Record<keyof WorkerContribution, string>> = {
    exchanges: 'exchanges',
    resources: 'resources',
    transitions: 'transitions',
    hypotheses: 'hypotheses',
    actions: 'action results',
    candidateProofs: 'candidate proofs',
  };
  for (const field of incompatible[contribution.role]) {
    if (populated(field)) {
      throw new BlackboardValidationError(`${contribution.role} cannot submit ${labels[field] ?? field}`);
    }
  }

  if ('verifications' in (contribution as unknown as Record<string, unknown>)) {
    throw new BlackboardValidationError('A worker cannot submit verification results');
  }
  return task;
}

function applyContribution(document: BlackboxDocument, contribution: WorkerContribution): BlackboxDocument {
  assertContributionPermission(document, contribution);
  if (contribution.baseRevision !== document.revision) {
    throw new StaleBlackboardRevisionError(contribution.baseRevision, document.revision);
  }

  const provenance: EvidenceProvenance = {
    actor: contribution.role,
    taskId: contribution.taskId,
    baseRevision: contribution.baseRevision,
  };

  return {
    ...document,
    exchanges: mergeRecords(
      'exchange',
      document.exchanges,
      contribution.exchanges ?? [],
      ({ exchangeId }) => exchangeId,
      provenance,
    ),
    resources: mergeRecords(
      'resource',
      document.resources,
      contribution.resources ?? [],
      ({ resourceId }) => resourceId,
      provenance,
    ),
    transitions: mergeRecords(
      'transition',
      document.transitions,
      contribution.transitions ?? [],
      ({ transitionId }) => transitionId,
      provenance,
    ),
    hypotheses: mergeRecords(
      'hypothesis',
      document.hypotheses,
      contribution.hypotheses ?? [],
      ({ hypothesisId }) => hypothesisId,
      provenance,
    ),
    actions: mergeRecords(
      'action',
      document.actions,
      contribution.actions ?? [],
      ({ actionId }) => actionId,
      provenance,
    ),
    candidateProofs: mergeRecords(
      'proof',
      document.candidateProofs,
      contribution.candidateProofs ?? [],
      ({ candidateId }) => candidateId,
      provenance,
    ),
  };
}

interface ReferenceIndexes {
  readonly exchange: ReadonlySet<string>;
  readonly resource: ReadonlySet<string>;
  readonly transition: ReadonlySet<string>;
  readonly action: ReadonlySet<string>;
  readonly proof: ReadonlySet<string>;
  readonly hypothesis: ReadonlySet<string>;
  readonly identity: ReadonlySet<string>;
}

function referenceIndexes(document: BlackboxDocument): ReferenceIndexes {
  return {
    exchange: new Set(document.exchanges.map(({ exchangeId }) => exchangeId)),
    resource: new Set(document.resources.map(({ resourceId }) => resourceId)),
    transition: new Set(document.transitions.map(({ transitionId }) => transitionId)),
    action: new Set(document.actions.map(({ actionId }) => actionId)),
    proof: new Set(document.candidateProofs.map(({ candidateId }) => candidateId)),
    hypothesis: new Set(document.hypotheses.map(({ hypothesisId }) => hypothesisId)),
    identity: new Set(['anonymous', ...document.identities.map(({ name }) => name)]),
  };
}

function assertKnown(set: ReadonlySet<string>, id: string, kind: string, context: string): void {
  if (!set.has(id)) throw new BlackboardValidationError(`Unknown ${kind} reference ${id} in ${context}`);
}

function validateEvidenceRefs(refs: readonly EvidenceRef[], indexes: ReferenceIndexes, context: string): void {
  for (const ref of refs) {
    assertKnown(indexes[ref.kind], ref.id, ref.kind, context);
  }
}

function validateProofCondition(condition: ProofCondition, indexes: ReferenceIndexes, context: string): void {
  if (condition.type === 'persistent_state') {
    assertKnown(indexes.exchange, condition.verificationSourceExchangeId, 'exchange', context);
  }
}

function validateObservation(
  observation: DeterministicProofObservation | null,
  indexes: ReferenceIndexes,
  context: string,
): void {
  if (!observation) return;
  validateProofCondition(observation.condition, indexes, context);
  if (observation.observedTransitionId) {
    assertKnown(indexes.transition, observation.observedTransitionId, 'transition', context);
  }
  if (observation.verificationExchangeId) {
    assertKnown(indexes.exchange, observation.verificationExchangeId, 'exchange', context);
  }
}

function assertUniqueIds<T>(records: readonly T[], idOf: (record: T) => string, kind: string): void {
  const seen = new Set<string>();
  for (const record of records) {
    const id = idOf(record);
    if (seen.has(id)) throw new BlackboardValidationError(`Duplicate ${kind} ID ${id} in blackboard`);
    seen.add(id);
  }
}

function validateReferences(document: BlackboxDocument): void {
  assertUniqueIds(document.identities, ({ name }) => name, 'identity');
  assertUniqueIds(document.exchanges, ({ exchangeId }) => exchangeId, 'exchange');
  assertUniqueIds(document.resources, ({ resourceId }) => resourceId, 'resource');
  assertUniqueIds(document.transitions, ({ transitionId }) => transitionId, 'transition');
  assertUniqueIds(document.hypotheses, ({ hypothesisId }) => hypothesisId, 'hypothesis');
  assertUniqueIds(document.actions, ({ actionId }) => actionId, 'action');
  assertUniqueIds(document.candidateProofs, ({ candidateId }) => candidateId, 'proof');
  assertUniqueIds(document.verifications, ({ verificationId }) => verificationId, 'verification');
  assertUniqueIds(document.tasks, ({ taskId }) => taskId, 'task');
  const taskIds = new Set(document.tasks.map(({ taskId }) => taskId));
  for (const { task } of document.rejectedTasks) {
    if (taskIds.has(task.taskId)) {
      throw new BlackboardValidationError(`Duplicate task ID ${task.taskId} across accepted and rejected tasks`);
    }
    taskIds.add(task.taskId);
  }

  const indexes = referenceIndexes(document);
  for (const exchange of document.exchanges) {
    assertKnown(indexes.identity, exchange.identity, 'identity', `exchange ${exchange.exchangeId}`);
    if (exchange.origin !== document.targetOrigin) {
      throw new BlackboardValidationError(`Exchange ${exchange.exchangeId} is outside target origin`);
    }
  }
  for (const resource of document.resources) {
    if (resource.ownerIdentity) {
      assertKnown(indexes.identity, resource.ownerIdentity, 'identity', `resource ${resource.resourceId}`);
    }
    validateEvidenceRefs(resource.evidence, indexes, `resource ${resource.resourceId}`);
  }
  for (const transition of document.transitions) {
    assertKnown(indexes.identity, transition.identity, 'identity', `transition ${transition.transitionId}`);
    assertKnown(indexes.exchange, transition.triggerExchangeId, 'exchange', `transition ${transition.transitionId}`);
    if (transition.resourceId) {
      assertKnown(indexes.resource, transition.resourceId, 'resource', `transition ${transition.transitionId}`);
    }
  }
  for (const hypothesis of document.hypotheses) {
    validateEvidenceRefs(hypothesis.evidence, indexes, `hypothesis ${hypothesis.hypothesisId}`);
  }
  for (const action of document.actions) {
    assertKnown(indexes.hypothesis, action.hypothesisId, 'hypothesis', `action ${action.actionId}`);
    if (action.sequence.actionId !== action.actionId) {
      throw new BlackboardValidationError(`Action ${action.actionId} has a mismatched replay sequence ID`);
    }
    for (const step of action.sequence.steps) {
      assertKnown(indexes.exchange, step.sourceExchangeId, 'exchange', `action ${action.actionId}`);
      assertKnown(indexes.identity, step.actor, 'identity', `action ${action.actionId}`);
    }
    for (const exchangeId of action.exchangeIds) {
      assertKnown(indexes.exchange, exchangeId, 'exchange', `action ${action.actionId}`);
    }
    validateProofCondition(action.sequence.proofCondition, indexes, `action ${action.actionId}`);
    validateObservation(action.observation, indexes, `action ${action.actionId}`);
  }
  for (const proof of document.candidateProofs) {
    assertKnown(indexes.hypothesis, proof.hypothesisId, 'hypothesis', `proof ${proof.candidateId}`);
    assertKnown(indexes.identity, proof.victimIdentity, 'identity', `proof ${proof.candidateId}`);
    assertKnown(indexes.identity, proof.attackerIdentity, 'identity', `proof ${proof.candidateId}`);
    assertKnown(indexes.resource, proof.victimResourceId, 'resource', `proof ${proof.candidateId}`);
    assertKnown(indexes.exchange, proof.baselineExchangeId, 'exchange', `proof ${proof.candidateId}`);
    assertKnown(indexes.action, proof.actionId, 'action', `proof ${proof.candidateId}`);
    assertKnown(indexes.exchange, proof.verificationSourceExchangeId, 'exchange', `proof ${proof.candidateId}`);
  }
  for (const verification of document.verifications) {
    assertKnown(indexes.proof, verification.candidateId, 'proof', `verification ${verification.verificationId}`);
    for (const { identity } of verification.freshStateRefs) {
      assertKnown(indexes.identity, identity, 'identity', `verification ${verification.verificationId}`);
    }
    for (const actionId of verification.replayActionIds) {
      assertKnown(indexes.action, actionId, 'action', `verification ${verification.verificationId}`);
    }
    for (const exchangeId of verification.replayExchangeIds) {
      assertKnown(indexes.exchange, exchangeId, 'exchange', `verification ${verification.verificationId}`);
    }
    validateObservation(verification.observation, indexes, `verification ${verification.verificationId}`);
  }
  for (const task of document.tasks) {
    validateEvidenceRefs(task.evidence, indexes, `task ${task.taskId}`);
    if (task.identityLease) {
      assertKnown(indexes.identity, task.identityLease, 'identity', `task ${task.taskId}`);
    }
    if (task.hypothesisId) {
      assertKnown(indexes.hypothesis, task.hypothesisId, 'hypothesis', `task ${task.taskId}`);
    }
  }
}

function validatePersistedDocument(value: unknown): asserts value is BlackboxDocument {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BlackboardValidationError('Blackboard document must be an object');
  }
  const document = value as Record<string, unknown>;
  if (document.schemaVersion !== 1 || !Number.isSafeInteger(document.revision) || Number(document.revision) < 0) {
    throw new BlackboardValidationError('Blackboard schema version or revision is invalid');
  }
  if (typeof document.targetOrigin !== 'string' || document.targetOrigin.length === 0) {
    throw new BlackboardValidationError('Blackboard targetOrigin is invalid');
  }
  if (!['running', 'complete', 'incomplete', 'failed'].includes(String(document.runStatus))) {
    throw new BlackboardValidationError('Blackboard runStatus is invalid');
  }
  for (const field of [
    'identities',
    'exchanges',
    'resources',
    'transitions',
    'hypotheses',
    'actions',
    'candidateProofs',
    'verifications',
    'tasks',
    'rejectedTasks',
  ]) {
    if (!Array.isArray(document[field])) {
      throw new BlackboardValidationError(`Blackboard field ${field} must be an array`);
    }
  }
}

export class FileBlackboardStore implements BlackboardStore {
  readonly blackboardPath: string;
  private configuredSecrets = new Set<string>();

  constructor(repoPath: string) {
    this.blackboardPath = path.resolve(repoPath, '.shannon', 'blackbox', 'blackboard.json');
  }

  async initialize(input: BlackboardInitialization): Promise<BlackboxSnapshot> {
    if (
      !Array.isArray(input.configuredSecrets) ||
      input.configuredSecrets.some((secret) => typeof secret !== 'string')
    ) {
      throw new BlackboardValidationError('Blackboard initialization requires configured secrets');
    }
    this.configuredSecrets = new Set(input.configuredSecrets.filter((secret) => secret.length > 0));
    const unlock = await blackboardMutex.lock(this.blackboardPath);
    try {
      await ensureDirectory(path.dirname(this.blackboardPath));
      if (await fileExists(this.blackboardPath)) {
        const existing = await this.readUnlocked();
        if (existing.targetOrigin !== input.targetOrigin) {
          throw new BlackboardValidationError('Existing blackboard target origin does not match initialization');
        }
        const existingNames = existing.identities.map(({ name }) => name);
        const inputNames = input.identities.map(({ name }) => name);
        if (!isDeepStrictEqual(existingNames, inputNames)) {
          throw new BlackboardValidationError('Existing blackboard identities do not match initialization');
        }
        this.assertNoConfiguredSecrets(existing);
        return clone(existing);
      }

      const document: BlackboxDocument = {
        schemaVersion: 1,
        revision: 0,
        targetOrigin: input.targetOrigin,
        identities: input.identities.map(({ name, role, authenticated, stateRef }) => ({
          name,
          role,
          authenticated,
          stateRef: stateRef ?? null,
        })),
        exchanges: [],
        resources: [],
        transitions: [],
        hypotheses: [],
        actions: [],
        candidateProofs: [],
        verifications: [],
        tasks: [],
        rejectedTasks: [],
        runStatus: 'running',
      };
      validateReferences(document);
      this.assertNoConfiguredSecrets(document);
      await atomicWrite(this.blackboardPath, document);
      return clone(document);
    } finally {
      unlock();
    }
  }

  async read(): Promise<BlackboxSnapshot> {
    return clone(await this.readUnlocked());
  }

  async merge(contribution: WorkerContribution): Promise<BlackboxSnapshot> {
    return this.compareAndSwap(contribution.baseRevision, (document) => {
      const next = applyContribution(document, contribution);
      validateReferences(next);
      return next;
    });
  }

  async registerTasks(baseRevision: number, batch: TaskRegistrationBatch): Promise<BlackboxSnapshot> {
    void batch.operationKey;
    return this.compareAndSwap(baseRevision, (document) => {
      const accepted = batch.accepted.map((task): PlannerTask => ({ ...clone(task), status: 'pending' }));
      const rejected = batch.rejected.map(
        ({ task, reason }): RejectedPlannerTask => ({ task: { ...clone(task), status: 'rejected' }, reason }),
      );
      const allNewIds = [...accepted.map(({ taskId }) => taskId), ...rejected.map(({ task }) => task.taskId)];
      if (new Set(allNewIds).size !== allNewIds.length) {
        throw new BlackboardValidationError('Conflicting duplicate task ID in registration batch');
      }

      const next: BlackboxDocument = {
        ...document,
        tasks: mergePlainRecords('task', document.tasks, accepted, ({ taskId }) => taskId),
        rejectedTasks: mergePlainRecords('rejected task', document.rejectedTasks, rejected, ({ task }) => task.taskId),
      };
      validateReferences(next);
      return next;
    });
  }

  async startTasks(baseRevision: number, operationKey: string, taskIds: readonly string[]): Promise<BlackboxSnapshot> {
    void operationKey;
    return this.compareAndSwap(baseRevision, (document) => {
      if (new Set(taskIds).size !== taskIds.length) {
        throw new BlackboardValidationError('Cannot start duplicate task IDs');
      }
      const selected = new Set(taskIds);
      const runningLeases = new Set(
        document.tasks
          .filter(({ status, identityLease }) => status === 'running' && identityLease !== null)
          .map(({ identityLease }) => identityLease),
      );
      for (const taskId of taskIds) {
        const task = document.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) throw new BlackboardValidationError(`Unknown task ${taskId}`);
        if (task.status !== 'pending') {
          throw new BlackboardValidationError(`Task ${taskId} is ${task.status}, not pending`);
        }
        if (task.identityLease && runningLeases.has(task.identityLease)) {
          throw new BlackboardValidationError(`Identity ${task.identityLease} is already leased`);
        }
        if (task.identityLease) runningLeases.add(task.identityLease);
      }

      return {
        ...document,
        tasks: document.tasks.map((task) =>
          selected.has(task.taskId) ? { ...task, status: 'running' as const } : task,
        ),
      };
    });
  }

  async settleTasks(batch: ContributionBatch): Promise<BlackboxSnapshot> {
    void batch.operationKey;
    return this.compareAndSwap(batch.baseRevision, (document) => {
      const contributions = [...batch.contributions].sort((left, right) => left.taskId.localeCompare(right.taskId));
      const failures = [...batch.failures].sort((left, right) => left.taskId.localeCompare(right.taskId));
      const taskIds = [...contributions.map(({ taskId }) => taskId), ...failures.map(({ taskId }) => taskId)];
      if (new Set(taskIds).size !== taskIds.length) {
        throw new BlackboardValidationError('A task cannot be settled more than once in one batch');
      }
      let next = document;
      for (const contribution of contributions) {
        if (contribution.baseRevision !== batch.baseRevision) {
          throw new StaleBlackboardRevisionError(contribution.baseRevision, batch.baseRevision);
        }
        next = applyContribution(next, contribution);
      }
      for (const { taskId } of failures) {
        const task = next.tasks.find((candidate) => candidate.taskId === taskId);
        if (!task) throw new BlackboardValidationError(`Unknown task ${taskId}`);
        if (task.status !== 'running') {
          throw new BlackboardValidationError(`Task ${taskId} is ${task.status}, not running`);
        }
      }

      const completed = new Set(contributions.map(({ taskId }) => taskId));
      const failed = new Set(failures.map(({ taskId }) => taskId));
      next = {
        ...next,
        tasks: next.tasks.map((task) => {
          if (completed.has(task.taskId)) return { ...task, status: 'completed' as const };
          if (failed.has(task.taskId)) return { ...task, status: 'failed' as const };
          return task;
        }),
      };
      validateReferences(next);
      return next;
    });
  }

  async recordVerification(
    baseRevision: number,
    operationKey: string,
    result: VerificationResult,
  ): Promise<BlackboxSnapshot> {
    void operationKey;
    return this.compareAndSwap(baseRevision, (document) => {
      const verifications = mergePlainRecords(
        'verification',
        document.verifications,
        [result],
        ({ verificationId }) => verificationId,
      );
      const candidate = document.candidateProofs.find(({ candidateId }) => candidateId === result.candidateId);
      const hypotheses = candidate
        ? document.hypotheses.map((hypothesis) => {
            if (hypothesis.hypothesisId !== candidate.hypothesisId) return hypothesis;
            const status: HypothesisStatus = result.verdict === 'verified' ? 'verified' : result.verdict;
            return { ...hypothesis, status };
          })
        : document.hypotheses;
      const next = { ...document, verifications, hypotheses };
      validateReferences(next);
      return next;
    });
  }

  async setRunStatus(baseRevision: number, operationKey: string, status: BlackboxRunStatus): Promise<BlackboxSnapshot> {
    void operationKey;
    return this.compareAndSwap(baseRevision, (document) => ({ ...document, runStatus: status }));
  }

  private async readUnlocked(): Promise<BlackboxDocument> {
    const value = await readJson<unknown>(this.blackboardPath);
    validatePersistedDocument(value);
    validateReferences(value);
    return value;
  }

  private async compareAndSwap(
    baseRevision: number,
    update: (document: BlackboxDocument) => BlackboxDocument,
  ): Promise<BlackboxSnapshot> {
    const observed = await this.readUnlocked();
    assertRevision(baseRevision, observed);
    const candidate = { ...update(clone(observed)), revision: baseRevision + 1 };
    validateReferences(candidate);
    this.assertNoConfiguredSecrets(candidate);

    const unlock = await blackboardMutex.lock(this.blackboardPath);
    try {
      const current = await this.readUnlocked();
      assertRevision(baseRevision, current);
      await atomicWrite(this.blackboardPath, candidate);
      return clone(candidate);
    } finally {
      unlock();
    }
  }

  private assertNoConfiguredSecrets(document: BlackboxDocument): void {
    const serialized = JSON.stringify(document);
    for (const secret of this.configuredSecrets) {
      if (serialized.includes(secret)) {
        throw new BlackboardValidationError('Blackboard contribution contains configured secret material');
      }
    }
  }
}
