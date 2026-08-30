// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import type {
  BlackboardInitialization,
  BlackboardStore,
  BlackboxActionResult,
  BlackboxDocument,
  BlackboxHypothesis,
  BlackboxOperationReceipt,
  BlackboxPlanningWave,
  BlackboxResource,
  BlackboxRunStatus,
  BlackboxSnapshot,
  BlackboxVerificationAttempt,
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
  WorkerContribution,
  WorkflowTransition,
} from '../types/blackbox.js';
import { SessionMutex } from '../utils/concurrency.js';
import { atomicWrite, ensureDirectory, fileExists, readJson } from '../utils/file-io.js';
import { assertSameBlackboxRunScope } from './scope-guard.js';
import { replayPlansShareDispatchedStep } from './scheduler.js';

const blackboardMutex = new SessionMutex();
const SAFE_RECORD_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

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

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, canonicalize(record[key])]),
    );
  }
  return value;
}

function digestRequest(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value));
  if (serialized === undefined) throw new BlackboardValidationError('Operation request cannot be serialized');
  return `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
}

function assertNonEmptyId(id: string, kind: string): void {
  if (typeof id !== 'string' || id.trim() === '') {
    throw new BlackboardValidationError(`${kind} ID must be a non-empty string`);
  }
}

function assertSafeRecordId(id: string, kind: string): void {
  if (typeof id !== 'string' || !SAFE_RECORD_IDENTIFIER.test(id)) {
    throw new BlackboardValidationError(`${kind} ID must be a safe identifier`);
  }
}

function assertRevision(expected: number, document: BlackboxDocument): void {
  if (document.revision !== expected) {
    throw new StaleBlackboardRevisionError(expected, document.revision);
  }
}

function assertMutable(document: BlackboxDocument): void {
  if (document.runStatus !== 'running') {
    throw new BlackboardValidationError(`Blackboard is terminal with status ${document.runStatus}`);
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
    assertSafeRecordId(id, kind);
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
    assertSafeRecordId(id, kind);
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
    'blackbox-action': ['resources', 'transitions', 'hypotheses'],
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
  if ((contribution.hypotheses ?? []).some(({ status }) => status !== 'open')) {
    throw new BlackboardValidationError('Analysis hypotheses must enter the orchestrator lifecycle as open');
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

function assertActionContributionBinding(task: PlannerTask, contribution: WorkerContribution): void {
  if (task.kind !== 'action') return;
  if (contribution.actions?.length !== 1) {
    throw new BlackboardValidationError(`Action task ${task.taskId} must submit exactly one action result`);
  }
  if (!task.hypothesisId || !task.replayPlan) {
    throw new BlackboardValidationError(`Action task ${task.taskId} has no registered hypothesis or replay plan`);
  }

  const result = contribution.actions[0];
  if (!result) throw new BlackboardValidationError(`Action task ${task.taskId} has no action result`);
  if (result.actionId !== task.taskId) {
    throw new BlackboardValidationError(`Action result ${result.actionId} is not bound to task ${task.taskId}`);
  }
  if (result.hypothesisId !== task.hypothesisId) {
    throw new BlackboardValidationError(`Action result ${result.actionId} is not bound to its task hypothesis`);
  }
  const submittedPlan = {
    steps: result.sequence.steps,
    proofCondition: result.sequence.proofCondition,
  };
  if (!isDeepStrictEqual(submittedPlan, task.replayPlan)) {
    throw new BlackboardValidationError(`Action result ${result.actionId} does not match its approved replay plan`);
  }
  if (result.observation && !isDeepStrictEqual(result.observation.condition, task.replayPlan.proofCondition)) {
    throw new BlackboardValidationError(
      `Action result ${result.actionId} observation does not match its approved proof`,
    );
  }
  if (
    (contribution.candidateProofs?.length ?? 0) > 0 &&
    (result.status !== 'completed' || !result.observation?.passed)
  ) {
    throw new BlackboardValidationError(
      `Action result ${result.actionId} cannot produce a candidate without a passed proof`,
    );
  }
  for (const candidate of contribution.candidateProofs ?? []) {
    if (candidate.actionId !== result.actionId) {
      throw new BlackboardValidationError(`Candidate ${candidate.candidateId} is not bound to its action result`);
    }
    if (candidate.hypothesisId !== task.hypothesisId) {
      throw new BlackboardValidationError(`Candidate ${candidate.candidateId} is not bound to its action hypothesis`);
    }
  }
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
  if (observation.baselineExchangeId) {
    assertKnown(indexes.exchange, observation.baselineExchangeId, 'exchange', context);
  }
  for (const exchangeId of observation.controlExchangeIds ?? []) {
    assertKnown(indexes.exchange, exchangeId, 'exchange', context);
  }
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
  assertUniqueIds(document.operationReceipts ?? [], ({ operationKey }) => operationKey, 'operation key');
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
    const action = document.actions.find(({ actionId }) => actionId === proof.actionId);
    if (action && action.hypothesisId !== proof.hypothesisId) {
      throw new BlackboardValidationError(`Candidate ${proof.candidateId} action and hypothesis do not match`);
    }
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
  for (const receipt of document.operationReceipts ?? []) {
    assertNonEmptyId(receipt.operationKey, 'operation key');
    if (!/^sha256:[a-f0-9]{64}$/.test(receipt.requestDigest)) {
      throw new BlackboardValidationError(`Operation ${receipt.operationKey} request digest is invalid`);
    }
    if (!Number.isSafeInteger(receipt.revision) || receipt.revision < 1 || receipt.revision > document.revision) {
      throw new BlackboardValidationError(`Operation ${receipt.operationKey} revision is invalid`);
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
  const runScope = document.runScope as Record<string, unknown> | undefined;
  if (
    !runScope ||
    runScope.mode !== 'blackbox' ||
    runScope.targetOrigin !== document.targetOrigin ||
    !Array.isArray(runScope.identities) ||
    runScope.identities.some((identity) => typeof identity !== 'string' || identity.length === 0) ||
    typeof runScope.burpMcpUrl !== 'string' ||
    typeof runScope.burpMcpHostHeader !== 'string' ||
    typeof runScope.burpProxyUrl !== 'string'
  ) {
    throw new BlackboardValidationError('Blackboard runScope is invalid');
  }
  if (!['running', 'complete', 'incomplete', 'failed'].includes(String(document.runStatus))) {
    throw new BlackboardValidationError('Blackboard runStatus is invalid');
  }
  if (document.planningDecision !== undefined && document.planningDecision !== null) {
    const planningDecision = document.planningDecision as Record<string, unknown>;
    if (
      typeof document.planningDecision !== 'object' ||
      !Number.isSafeInteger(planningDecision.waveNumber) ||
      Number(planningDecision.waveNumber) < 1 ||
      Number(planningDecision.waveNumber) > 8 ||
      !['continue', 'complete', 'incomplete'].includes(String(planningDecision.decision))
    ) {
      throw new BlackboardValidationError('Blackboard planningDecision is invalid');
    }
  }
  if (document.planningWave !== undefined && document.planningWave !== null) {
    const planningWave = document.planningWave as Record<string, unknown>;
    if (
      typeof document.planningWave !== 'object' ||
      !Number.isSafeInteger(planningWave.waveNumber) ||
      Number(planningWave.waveNumber) < 1 ||
      Number(planningWave.waveNumber) > 8 ||
      !['reserved', 'registered'].includes(String(planningWave.phase)) ||
      (planningWave.phase === 'reserved' && planningWave.plannerStop !== null) ||
      (planningWave.phase === 'registered' && typeof planningWave.plannerStop !== 'boolean')
    ) {
      throw new BlackboardValidationError('Blackboard planningWave is invalid');
    }
    const planningDecision = document.planningDecision as Record<string, unknown> | null | undefined;
    if (
      planningDecision &&
      (planningDecision.decision !== 'continue' || Number(planningWave.waveNumber) <= Number(planningDecision.waveNumber))
    ) {
      throw new BlackboardValidationError('Blackboard planningWave does not advance its planning decision');
    }
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
  if (document.operationReceipts !== undefined && !Array.isArray(document.operationReceipts)) {
    throw new BlackboardValidationError('Blackboard field operationReceipts must be an array');
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
    const runScope = {
      ...clone(input.runScope),
      identities: [...input.runScope.identities].sort((left, right) => left.localeCompare(right)),
    };
    if (runScope.targetOrigin !== input.targetOrigin) {
      throw new BlackboardValidationError('Blackboard target origin and run scope do not match');
    }
    const inputNames = input.identities.map(({ name }) => name).sort((left, right) => left.localeCompare(right));
    if (!isDeepStrictEqual(inputNames, runScope.identities)) {
      throw new BlackboardValidationError('Blackboard identities and run scope do not match');
    }
    const unlock = await blackboardMutex.lock(this.blackboardPath);
    try {
      await ensureDirectory(path.dirname(this.blackboardPath));
      if (await fileExists(this.blackboardPath)) {
        const existing = await this.readUnlocked();
        if (existing.targetOrigin !== input.targetOrigin) {
          throw new BlackboardValidationError('Existing blackboard target origin does not match initialization');
        }
        const existingNames = existing.identities.map(({ name }) => name).sort((left, right) => left.localeCompare(right));
        if (!isDeepStrictEqual(existingNames, inputNames)) {
          throw new BlackboardValidationError('Existing blackboard identities do not match initialization');
        }
        try {
          assertSameBlackboxRunScope(existing.runScope, runScope);
        } catch (error) {
          throw new BlackboardValidationError(error instanceof Error ? error.message : String(error));
        }
        this.assertNoConfiguredSecrets(existing);
        return clone(existing);
      }

      const document: BlackboxDocument = {
        schemaVersion: 1,
        revision: 0,
        targetOrigin: input.targetOrigin,
        runScope,
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
        planningDecision: null,
        planningWave: null,
        operationReceipts: [],
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

  async reservePlanningWave(
    baseRevision: number,
    operationKey: string,
    waveNumber: number,
  ): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'reservePlanningWave', waveNumber },
      (document) => {
        if (!Number.isSafeInteger(waveNumber) || waveNumber < 1 || waveNumber > 8) {
          throw new BlackboardValidationError('Planning wave must be between 1 and 8');
        }
        if (document.planningDecision && document.planningDecision.decision !== 'continue') {
          throw new BlackboardValidationError('A terminal finalization decision is already pending');
        }
        if (document.planningWave?.phase === 'registered') {
          throw new BlackboardValidationError('Registered planning wave must be evaluated before reserving another');
        }
        const previousWave = Math.max(
          document.planningDecision?.waveNumber ?? 0,
          document.planningWave?.waveNumber ?? 0,
        );
        if (waveNumber !== previousWave + 1) {
          throw new BlackboardValidationError('Planning wave reservation must advance by one');
        }
        return {
          ...document,
          planningWave: { waveNumber, phase: 'reserved', plannerStop: null },
        };
      },
    );
  }

  async registerTasks(baseRevision: number, batch: TaskRegistrationBatch): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      batch.operationKey,
      {
        operation: 'registerTasks',
        baseRevision,
        accepted: batch.accepted,
        rejected: batch.rejected,
        closedHypothesisIds: batch.closedHypothesisIds,
        planningWave: batch.planningWave,
      },
      (document) => {
        let planningWave: BlackboxPlanningWave | null = document.planningWave ?? null;
        if (batch.planningWave) {
          if (
            !Number.isSafeInteger(batch.planningWave.waveNumber) ||
            batch.planningWave.waveNumber < 1 ||
            batch.planningWave.waveNumber > 8 ||
            typeof batch.planningWave.plannerStop !== 'boolean'
          ) {
            throw new BlackboardValidationError('Registered planning wave is invalid');
          }
          if (
            !planningWave ||
            planningWave.phase !== 'reserved' ||
            planningWave.waveNumber !== batch.planningWave.waveNumber
          ) {
            throw new BlackboardValidationError('Planning wave was not durably reserved before registration');
          }
          planningWave = {
            waveNumber: batch.planningWave.waveNumber,
            phase: 'registered',
            plannerStop: batch.planningWave.plannerStop,
          };
        }
        const accepted = batch.accepted.map((task): PlannerTask => ({ ...clone(task), status: 'pending' }));
        const rejected = batch.rejected.map(
          ({ task, reason }): RejectedPlannerTask => ({ task: { ...clone(task), status: 'rejected' }, reason }),
        );
        const allNewIds = [...accepted.map(({ taskId }) => taskId), ...rejected.map(({ task }) => task.taskId)];
        if (new Set(allNewIds).size !== allNewIds.length) {
          throw new BlackboardValidationError('Conflicting duplicate task ID in registration batch');
        }

        const closedHypothesisIds = batch.closedHypothesisIds ?? [];
        if (new Set(closedHypothesisIds).size !== closedHypothesisIds.length) {
          throw new BlackboardValidationError('Cannot close duplicate hypothesis IDs');
        }
        const queuedHypothesisIds = new Set(
          accepted
            .filter(
              (task): task is PlannerTask & { readonly hypothesisId: string } =>
                task.kind === 'action' && task.hypothesisId !== null,
            )
            .map(({ hypothesisId }) => hypothesisId),
        );
        for (const hypothesisId of closedHypothesisIds) {
          const hypothesis = document.hypotheses.find((candidate) => candidate.hypothesisId === hypothesisId);
          if (!hypothesis) throw new BlackboardValidationError(`Unknown hypothesis ${hypothesisId}`);
          if (!['open', 'queued', 'tested', 'blocked'].includes(hypothesis.status)) {
            throw new BlackboardValidationError(
              `Cannot close hypothesis ${hypothesisId} while it is ${hypothesis.status}`,
            );
          }
          if (queuedHypothesisIds.has(hypothesisId)) {
            throw new BlackboardValidationError(`Hypothesis ${hypothesisId} cannot be queued and closed together`);
          }
        }
        for (const hypothesisId of queuedHypothesisIds) {
          const hypothesis = document.hypotheses.find((candidate) => candidate.hypothesisId === hypothesisId);
          if (!hypothesis) throw new BlackboardValidationError(`Unknown hypothesis ${hypothesisId}`);
          if (!['open', 'queued', 'tested', 'blocked'].includes(hypothesis.status)) {
            throw new BlackboardValidationError(
              `Cannot queue hypothesis ${hypothesisId} while it is ${hypothesis.status}`,
            );
          }
        }

        const closed = new Set(closedHypothesisIds);

        const next: BlackboxDocument = {
          ...document,
          planningWave,
          hypotheses: document.hypotheses.map((hypothesis) => {
            if (closed.has(hypothesis.hypothesisId)) {
              return { ...hypothesis, status: 'no_demonstrated_impact' as const };
            }
            if (queuedHypothesisIds.has(hypothesis.hypothesisId)) {
              return { ...hypothesis, status: 'queued' as const };
            }
            return hypothesis;
          }),
          tasks: mergePlainRecords('task', document.tasks, accepted, ({ taskId }) => taskId),
          rejectedTasks: mergePlainRecords(
            'rejected task',
            document.rejectedTasks,
            rejected,
            ({ task }) => task.taskId,
          ),
        };
        validateReferences(next);
        return next;
      },
    );
  }

  async startTasks(baseRevision: number, operationKey: string, taskIds: readonly string[]): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'startTasks', baseRevision, taskIds },
      (document) => {
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
      },
    );
  }

  async recoverInterruptedTasks(baseRevision: number, operationKey: string): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'recoverInterruptedTasks' },
      (document) => {
        const running = document.tasks.filter(({ status }) => status === 'running');
        let actions = [...document.actions];
        const interruptedActionHypotheses = new Set<string>();

        for (const task of running) {
          if (task.kind !== 'action') continue;
          if (!task.hypothesisId || !task.replayPlan) {
            throw new BlackboardValidationError(`Interrupted action task ${task.taskId} has no approved replay plan`);
          }
          const provenance: EvidenceProvenance = {
            actor: 'blackbox-action',
            taskId: task.taskId,
            baseRevision,
          };
          actions = mergeRecords(
            'action',
            actions,
            [{
              actionId: task.taskId,
              hypothesisId: task.hypothesisId,
              sequence: { actionId: task.taskId, ...clone(task.replayPlan) },
              status: 'delivery_unknown',
              exchangeIds: [],
              observation: null,
              provenance,
            }],
            ({ actionId }) => actionId,
            provenance,
          );
          interruptedActionHypotheses.add(task.hypothesisId);
        }

        const bootstrapTaskIds = new Set([
          'bootstrap-anonymous',
          ...document.identities.map(({ name }) => `bootstrap-${name}`),
        ]);
        const unknownDeliveries = actions.filter(({ status }) => status === 'delivery_unknown');
        const next = {
          ...document,
          actions,
          tasks: document.tasks.map((task): PlannerTask => {
            const bootstrap =
              task.kind === 'recon' &&
              bootstrapTaskIds.has(task.taskId) &&
              task.hypothesisId === null;
            if (task.status === 'running') {
              if (task.kind === 'analysis' || bootstrap) return { ...task, status: 'pending' };
              return { ...task, status: 'failed' };
            }
            if (
              task.status === 'pending' &&
              task.kind === 'action' &&
              task.hypothesisId !== null &&
              task.replayPlan !== undefined &&
              unknownDeliveries.some(
                (action) =>
                  action.hypothesisId === task.hypothesisId ||
                  replayPlansShareDispatchedStep(
                    action.sequence,
                    task.replayPlan as NonNullable<PlannerTask['replayPlan']>,
                    new Map(document.exchanges.map(({ exchangeId, routeSignature }) => [exchangeId, routeSignature])),
                  ),
              )
            ) {
              return { ...task, status: 'failed' };
            }
            return task;
          }),
          hypotheses: document.hypotheses.map((hypothesis): BlackboxHypothesis => {
            if (!interruptedActionHypotheses.has(hypothesis.hypothesisId)) return hypothesis;
            if (['verified', 'disproved', 'no_demonstrated_impact'].includes(hypothesis.status)) return hypothesis;
            return { ...hypothesis, status: 'tested' };
          }),
        };
        validateReferences(next);
        return next;
      },
    );
  }

  async refreshIdentityCapture(
    baseRevision: number,
    operationKey: string,
    identity: string,
  ): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'refreshIdentityCapture', identity },
      (document) => {
        const configuredIdentity = document.identities.find(({ name }) => name === identity);
        if (!configuredIdentity) throw new BlackboardValidationError(`Unknown identity ${identity}`);
        const taskId = `bootstrap-${identity}`;
        const task = document.tasks.find((candidate) => candidate.taskId === taskId);
        if (
          !task ||
          task.kind !== 'recon' ||
          task.identityLease !== identity ||
          task.hypothesisId !== null ||
          task.status !== 'completed'
        ) {
          throw new BlackboardValidationError(`Identity ${identity} has no completed bootstrap capture to refresh`);
        }
        const next = {
          ...document,
          identities: document.identities.map((entry) =>
            entry.name === identity ? { ...entry, authenticated: false } : entry),
          tasks: document.tasks.map((entry): PlannerTask =>
            entry.taskId === taskId ? { ...entry, status: 'pending' } : entry),
        };
        validateReferences(next);
        return next;
      },
    );
  }

  async settleTasks(batch: ContributionBatch): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      batch.baseRevision,
      batch.operationKey,
      {
        operation: 'settleTasks',
        baseRevision: batch.baseRevision,
        contributions: batch.contributions,
        failures: batch.failures,
        identityCaptures: batch.identityCaptures,
      },
      (document) => {
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
          const task = next.tasks.find(({ taskId }) => taskId === contribution.taskId);
          if (task) assertActionContributionBinding(task, contribution);
          next = applyContribution(next, contribution);
        }
        for (const { taskId } of failures) {
          const task = next.tasks.find((candidate) => candidate.taskId === taskId);
          if (!task) throw new BlackboardValidationError(`Unknown task ${taskId}`);
          if (task.status !== 'running') {
            throw new BlackboardValidationError(`Task ${taskId} is ${task.status}, not running`);
          }
        }

        const failedActionTasks = new Set(
          contributions.flatMap((contribution) => {
            const task = next.tasks.find(({ taskId }) => taskId === contribution.taskId);
            return task?.kind === 'action' && contribution.actions?.[0]?.status !== 'completed'
              ? [contribution.taskId]
              : [];
          }),
        );
        const completed = new Set(
          contributions.map(({ taskId }) => taskId).filter((taskId) => !failedActionTasks.has(taskId)),
        );
        const failed = new Set([...failures.map(({ taskId }) => taskId), ...failedActionTasks]);
        const identityCaptures = batch.identityCaptures ?? [];
        if (new Set(identityCaptures.map(({ identity }) => identity)).size !== identityCaptures.length) {
          throw new BlackboardValidationError('An identity cannot be captured more than once in one batch');
        }
        for (const { identity, stateRef } of identityCaptures) {
          const expectedStateRef = `.shannon/blackbox/identities/${identity}/storage-state.json`;
          if (stateRef !== expectedStateRef) {
            throw new BlackboardValidationError(`Invalid state reference for identity ${identity}`);
          }
          if (!next.identities.some(({ name }) => name === identity)) {
            throw new BlackboardValidationError(`Unknown identity ${identity}`);
          }
          const bootstrapTaskId = `bootstrap-${identity}`;
          const bootstrapTask = next.tasks.find(({ taskId }) => taskId === bootstrapTaskId);
          if (
            !completed.has(bootstrapTaskId) ||
            !bootstrapTask ||
            bootstrapTask.kind !== 'recon' ||
            bootstrapTask.identityLease !== identity ||
            bootstrapTask.hypothesisId !== null
          ) {
            throw new BlackboardValidationError(
              `Identity ${identity} capture requires its matching bootstrap identity lease`,
            );
          }
        }
        const capturedIdentities = new Map(identityCaptures.map(({ identity, stateRef }) => [identity, stateRef]));
        const testedActionHypotheses = new Set(
          contributions
            .map(({ taskId }) => next.tasks.find((task) => task.taskId === taskId))
            .filter((task): task is PlannerTask => task?.kind === 'action' && task.hypothesisId !== null)
            .map(({ hypothesisId }) => hypothesisId),
        );
        next = {
          ...next,
          identities: next.identities.map((identity) => {
            const stateRef = capturedIdentities.get(identity.name);
            return stateRef ? { ...identity, authenticated: true, stateRef } : identity;
          }),
          tasks: next.tasks.map((task) => {
            if (completed.has(task.taskId)) return { ...task, status: 'completed' as const };
            if (failed.has(task.taskId)) return { ...task, status: 'failed' as const };
            return task;
          }),
          hypotheses: next.hypotheses.map((hypothesis) => {
            if (!testedActionHypotheses.has(hypothesis.hypothesisId)) return hypothesis;
            if (['verified', 'disproved', 'no_demonstrated_impact'].includes(hypothesis.status)) return hypothesis;
            return { ...hypothesis, status: 'tested' as const };
          }),
        };
        validateReferences(next);
        return next;
      },
    );
  }

  async recordVerification(
    baseRevision: number,
    operationKey: string,
    attempt: BlackboxVerificationAttempt,
  ): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'recordVerification', baseRevision, attempt },
      (document) => {
        const result = attempt.verification;
        const candidate = document.candidateProofs.find(({ candidateId }) => candidateId === result.candidateId);
        if (!candidate) throw new BlackboardValidationError(`Unknown candidate ${result.candidateId}`);
        const action = document.actions.find(({ actionId }) => actionId === candidate.actionId);
        if (!action) throw new BlackboardValidationError(`Unknown original action ${candidate.actionId}`);

        if (result.verdict === 'verified') {
          if (!result.observation?.passed) {
            throw new BlackboardValidationError('A verified result requires a passed observation');
          }
          if (!result.replayActionIds.includes(candidate.actionId)) {
            throw new BlackboardValidationError(`Verified result must link the original action ${candidate.actionId}`);
          }
          if (!isDeepStrictEqual(result.observation.condition, action.sequence.proofCondition)) {
            throw new BlackboardValidationError(
              'Verified result observation does not match the approved proof condition',
            );
          }

          const stateRefs = new Map<string, string>();
          for (const { identity, stateRef } of result.freshStateRefs) {
            if (stateRefs.has(identity)) {
              throw new BlackboardValidationError(`Verified result has duplicate fresh state for ${identity}`);
            }
            if (typeof stateRef !== 'string' || stateRef.length === 0) {
              throw new BlackboardValidationError(`Verified result has invalid fresh state for ${identity}`);
            }
            stateRefs.set(identity, stateRef);
          }
          const capturedStateRefs = new Set(
            document.identities.flatMap(({ stateRef }) => (stateRef === null ? [] : [stateRef])),
          );
          const namedActors = new Set(
            action.sequence.steps.map(({ actor }) => actor).filter((actor) => actor !== 'anonymous'),
          );
          const proofCondition = action.sequence.proofCondition;
          if (proofCondition.type === 'persistent_state') {
            const verificationSource = document.exchanges.find(
              ({ exchangeId }) => exchangeId === proofCondition.verificationSourceExchangeId,
            );
            if (verificationSource?.identity && verificationSource.identity !== 'anonymous') {
              namedActors.add(verificationSource.identity);
            }
          }
          for (const actor of namedActors) {
            const stateRef = stateRefs.get(actor);
            if (!stateRef)
              throw new BlackboardValidationError(`Verified result requires fresh state for actor ${actor}`);
            if (capturedStateRefs.has(stateRef)) {
              throw new BlackboardValidationError(`Verified result fresh state for ${actor} reuses capture state`);
            }
          }

          const freshExchangeIds = new Set(attempt.exchanges.map(({ exchangeId }) => exchangeId));
          if (
            result.replayExchangeIds.length === 0 ||
            result.replayExchangeIds.some((exchangeId) => !freshExchangeIds.has(exchangeId))
          ) {
            throw new BlackboardValidationError('Verified result must reference its fresh replay exchanges');
          }
          if (
            !result.observation.verificationExchangeId ||
            !result.replayExchangeIds.includes(result.observation.verificationExchangeId)
          ) {
            throw new BlackboardValidationError('Verified result observation must link a fresh replay exchange');
          }
        }

        const provenance: EvidenceProvenance = {
          actor: 'blackbox-verifier',
          taskId: result.verificationId,
          baseRevision,
        };
        const exchanges = mergeRecords(
          'exchange',
          document.exchanges,
          attempt.exchanges,
          ({ exchangeId }) => exchangeId,
          provenance,
        );
        const verifications = mergePlainRecords(
          'verification',
          document.verifications,
          [result],
          ({ verificationId }) => verificationId,
        );
        const hypotheses = document.hypotheses.map((hypothesis) => {
          if (hypothesis.hypothesisId !== candidate.hypothesisId) return hypothesis;
          if (hypothesis.status === 'verified') return hypothesis;
          if (hypothesis.status === 'disproved' && result.verdict !== 'verified') return hypothesis;
          if (hypothesis.status === 'no_demonstrated_impact') return hypothesis;
          const status: HypothesisStatus = result.verdict === 'verified' ? 'verified' : result.verdict;
          return { ...hypothesis, status };
        });
        const next = { ...document, exchanges, verifications, hypotheses };
        validateReferences(next);
        return next;
      },
    );
  }

  async recordPlanningDecision(
    baseRevision: number,
    operationKey: string,
    waveNumber: number,
    decision: 'continue' | 'complete' | 'incomplete',
  ): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'recordPlanningDecision', waveNumber, decision },
      (document) => {
        if (!Number.isSafeInteger(waveNumber) || waveNumber < 1 || waveNumber > 8) {
          throw new BlackboardValidationError('Planning wave must be between 1 and 8');
        }
        if (!['continue', 'complete', 'incomplete'].includes(decision)) {
          throw new BlackboardValidationError('Planning decision is invalid');
        }
        const previous = document.planningDecision;
        if (previous && previous.decision !== 'continue') {
          throw new BlackboardValidationError('A terminal finalization decision is already pending');
        }
        if (previous && waveNumber <= previous.waveNumber) {
          throw new BlackboardValidationError('Planning wave must advance monotonically');
        }
        if (
          document.planningWave &&
          (document.planningWave.phase !== 'registered' || document.planningWave.waveNumber !== waveNumber)
        ) {
          throw new BlackboardValidationError('Planning decision does not match the registered wave');
        }
        return { ...document, planningDecision: { waveNumber, decision }, planningWave: null };
      },
    );
  }

  async setRunStatus(baseRevision: number, operationKey: string, status: BlackboxRunStatus): Promise<BlackboxSnapshot> {
    return this.keyedCompareAndSwap(
      baseRevision,
      operationKey,
      { operation: 'setRunStatus', baseRevision, status },
      (document) => ({ ...document, runStatus: status }),
    );
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
    assertMutable(observed);
    const candidate = { ...update(clone(observed)), revision: baseRevision + 1 };
    validateReferences(candidate);
    this.assertNoConfiguredSecrets(candidate);

    const unlock = await blackboardMutex.lock(this.blackboardPath);
    try {
      const current = await this.readUnlocked();
      assertRevision(baseRevision, current);
      assertMutable(current);
      await atomicWrite(this.blackboardPath, candidate);
      return clone(candidate);
    } finally {
      unlock();
    }
  }

  private async keyedCompareAndSwap(
    baseRevision: number,
    operationKey: string,
    request: unknown,
    update: (document: BlackboxDocument) => BlackboxDocument,
  ): Promise<BlackboxSnapshot> {
    assertNonEmptyId(operationKey, 'operation key');
    const requestDigest = digestRequest(request);
    const unlock = await blackboardMutex.lock(this.blackboardPath);
    try {
      const current = await this.readUnlocked();
      const receipt = (current.operationReceipts ?? []).find((candidate) => candidate.operationKey === operationKey);
      if (receipt) {
        if (receipt.requestDigest !== requestDigest) {
          throw new BlackboardValidationError(`Operation key ${operationKey} was already used with different content`);
        }
        return clone(current);
      }

      assertRevision(baseRevision, current);
      assertMutable(current);
      const revision = baseRevision + 1;
      const operationReceipt: BlackboxOperationReceipt = { operationKey, requestDigest, revision };
      const candidate = {
        ...update(clone(current)),
        revision,
        operationReceipts: [...(current.operationReceipts ?? []), operationReceipt],
      };
      validateReferences(candidate);
      this.assertNoConfiguredSecrets(candidate);
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
