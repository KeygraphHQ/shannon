// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Workflow-safe reconciliation activity signatures and scheduling policy. */

import type { ArtifactRef } from '../ai/reconciliation/contracts.js';
import type { StageMetrics } from '../ai/reconciliation/stage-contracts.js';
import type { SarifRef } from '../ai/sast/types.js';
import type { ReconciliationClass } from '../types/reconciliation.js';

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

export const RECONCILIATION_CLASS_BUDGET_MS = 12 * HOUR_MS;
export const RECONCILIATION_LATER_STAGE_RESERVE_MS = 5 * MINUTE_MS;

export interface ReconciliationActivityDeadline {
  /** Fixed workflow-derived deadline for this class, measured as Unix epoch milliseconds. */
  readonly classDeadlineMs: number;
}

export interface ReconciliationActivityBaseInput extends ReconciliationActivityDeadline {
  readonly sessionId: string;
  readonly vulnerabilityClass: ReconciliationClass;
}

export interface SeedEmptyProducerQueueActivityInput {
  readonly sessionId: string;
}

export interface PrepareClassReconciliationActivityInput extends ReconciliationActivityBaseInput {
  readonly includeSastProvenance: boolean;
}

export interface EnrichClassSastObservationsActivityInput extends ReconciliationActivityBaseInput {
  readonly sarif?: SarifRef;
}

export interface FormClassExploitTasksActivityInput extends ReconciliationActivityBaseInput {
  readonly producerRef: ArtifactRef<'producer-observations'>;
  readonly supplementalRef: ArtifactRef<'supplemental-observations'>;
}

export interface FormClassExploitTasksActivityResult {
  readonly ref: ArtifactRef<'task-formation'>;
  readonly metrics: StageMetrics;
}

export type MaterializationFormationResult = FormClassExploitTasksActivityResult | 'singleton_fallback';

export interface MaterializeClassExploitTasksActivityInput extends ReconciliationActivityBaseInput {
  readonly producerRef: ArtifactRef<'producer-observations'>;
  readonly supplementalRef: ArtifactRef<'supplemental-observations'>;
  readonly form: MaterializationFormationResult;
}

export interface PublishClassReconciliationActivityInput extends ReconciliationActivityBaseInput {
  readonly producerRef: ArtifactRef<'producer-observations'>;
  readonly supplementalRef: ArtifactRef<'supplemental-observations'>;
  readonly fixedTasksRef: ArtifactRef<'fixed-tasks'>;
}

export interface SeedEmptyProducerQueueActivityResult {
  readonly alreadySeeded: boolean;
  readonly alreadyPublished: boolean;
  readonly commitHash: string;
}

export type PrepareClassReconciliationActivityResult =
  | {
      readonly outcome: 'already_published';
      readonly manifestSha256: string;
    }
  | {
      readonly outcome: 'pending';
      readonly ref: ArtifactRef<'producer-observations'>;
    };

export interface EnrichClassSastObservationsActivityResult {
  readonly ref: ArtifactRef<'supplemental-observations'>;
  readonly metrics: StageMetrics;
}

export interface MaterializeClassExploitTasksActivityResult {
  readonly ref: ArtifactRef<'fixed-tasks'>;
}

export interface PublishClassReconciliationActivityResult {
  readonly alreadyPublished: boolean;
  readonly manifestSha256: string;
  readonly commitHash: string;
}

export interface ReconciliationActivityRegistry {
  readonly seedEmptyProducerQueue: (
    input: SeedEmptyProducerQueueActivityInput,
  ) => Promise<SeedEmptyProducerQueueActivityResult>;
  readonly prepareClassReconciliation: (
    input: PrepareClassReconciliationActivityInput,
  ) => Promise<PrepareClassReconciliationActivityResult>;
  readonly enrichClassSastObservations: (
    input: EnrichClassSastObservationsActivityInput,
  ) => Promise<EnrichClassSastObservationsActivityResult>;
  readonly formClassExploitTasks: (
    input: FormClassExploitTasksActivityInput,
  ) => Promise<FormClassExploitTasksActivityResult>;
  readonly materializeClassExploitTasks: (
    input: MaterializeClassExploitTasksActivityInput,
  ) => Promise<MaterializeClassExploitTasksActivityResult>;
  readonly publishClassReconciliationOss: (
    input: PublishClassReconciliationActivityInput,
  ) => Promise<PublishClassReconciliationActivityResult>;
}

export const RECONCILIATION_ACTIVITY_NAMES = Object.freeze([
  'seedEmptyProducerQueue',
  'prepareClassReconciliation',
  'enrichClassSastObservations',
  'formClassExploitTasks',
  'materializeClassExploitTasks',
  'publishClassReconciliationOss',
] as const satisfies readonly (keyof ReconciliationActivityRegistry)[]);

export type ReconciliationActivityName = (typeof RECONCILIATION_ACTIVITY_NAMES)[number];
export type ReconciliationClassActivityName = Exclude<ReconciliationActivityName, 'seedEmptyProducerQueue'>;

export type ReconciliationActivityProfileName = 'deterministic' | 'model';

export interface ReconciliationActivityProfile {
  readonly profile: ReconciliationActivityProfileName;
  readonly startToCloseTimeoutMs: number;
  readonly heartbeatTimeoutMs: number | null;
  readonly maximumAttempts: number;
  readonly retryInitialIntervalMs: number;
  readonly retryBackoffCoefficient: number;
}

function profile(
  name: ReconciliationActivityProfileName,
  startToCloseTimeoutMs: number,
  heartbeatTimeoutMs: number | null,
  maximumAttempts: number,
): Readonly<ReconciliationActivityProfile> {
  return Object.freeze({
    profile: name,
    startToCloseTimeoutMs,
    heartbeatTimeoutMs,
    maximumAttempts,
    retryInitialIntervalMs: 1_000,
    retryBackoffCoefficient: 2,
  });
}

// Deterministic stages (filesystem/git only) get a short timeout, no heartbeat, and more
// attempts, since a transient IO failure is cheap to retry. Model-backed stages get a long
// timeout, a heartbeat so a wedged model call is detected before the full timeout elapses, and
// fewer attempts, since each attempt can itself cost real time and money.
const DETERMINISTIC_PROFILE = profile('deterministic', 2 * MINUTE_MS, null, 5);
const MODEL_PROFILE = profile('model', 30 * MINUTE_MS, 5 * MINUTE_MS, 3);

export const RECONCILIATION_ACTIVITY_PROFILES = Object.freeze({
  seedEmptyProducerQueue: DETERMINISTIC_PROFILE,
  prepareClassReconciliation: DETERMINISTIC_PROFILE,
  enrichClassSastObservations: MODEL_PROFILE,
  formClassExploitTasks: MODEL_PROFILE,
  materializeClassExploitTasks: DETERMINISTIC_PROFILE,
  publishClassReconciliationOss: DETERMINISTIC_PROFILE,
} as const satisfies Readonly<Record<ReconciliationActivityName, Readonly<ReconciliationActivityProfile>>>);

export interface ReconciliationActivityBudget {
  /** False once the class's 12-hour deadline leaves no time for this stage; the caller must not schedule it. */
  readonly shouldSchedule: boolean;
  readonly remainingClassBudgetMs: number;
  readonly reservedForLaterStagesMs: number;
  readonly scheduleToCloseTimeoutMs: number;
  readonly startToCloseTimeoutMs: number;
  readonly heartbeatTimeoutMs: number | null;
  readonly heartbeatIntervalMs: number | null;
}

function assertEpochMilliseconds(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be non-negative safe-integer epoch milliseconds`);
  }
}

/** Derive the fixed per-class deadline immediately before the caller enters prepare. */
export function reconciliationClassDeadlineFrom(startedAtMs: number): number {
  assertEpochMilliseconds(startedAtMs, 'Reconciliation class start');
  const deadlineMs = startedAtMs + RECONCILIATION_CLASS_BUDGET_MS;
  assertEpochMilliseconds(deadlineMs, 'Reconciliation class deadline');
  return deadlineMs;
}

/**
 * Cap one activity's whole retry window, per-attempt timeout, and heartbeat against the class deadline.
 * A zero timeout means the caller must not schedule the activity.
 */
export function resolveReconciliationActivityBudget(
  activityName: ReconciliationClassActivityName,
  classDeadlineMs: number,
  nowMs: number,
): Readonly<ReconciliationActivityBudget> {
  assertEpochMilliseconds(classDeadlineMs, 'Reconciliation class deadline');
  assertEpochMilliseconds(nowMs, 'Reconciliation budget time');

  const profile = RECONCILIATION_ACTIVITY_PROFILES[activityName];
  const remainingClassBudgetMs = Math.max(0, classDeadlineMs - nowMs);
  const reservedForLaterStagesMs = Math.min(remainingClassBudgetMs, RECONCILIATION_LATER_STAGE_RESERVE_MS);
  const scheduleToCloseTimeoutMs = Math.max(0, remainingClassBudgetMs - RECONCILIATION_LATER_STAGE_RESERVE_MS);
  const startToCloseTimeoutMs = Math.min(profile.startToCloseTimeoutMs, scheduleToCloseTimeoutMs);
  const heartbeatTimeoutMs =
    profile.heartbeatTimeoutMs === null || startToCloseTimeoutMs === 0
      ? null
      : Math.min(profile.heartbeatTimeoutMs, startToCloseTimeoutMs);
  const heartbeatIntervalMs =
    heartbeatTimeoutMs === null ? null : Math.max(1, Math.min(100_000, Math.floor(heartbeatTimeoutMs / 3)));

  return Object.freeze({
    shouldSchedule: scheduleToCloseTimeoutMs > 0,
    remainingClassBudgetMs,
    reservedForLaterStagesMs,
    scheduleToCloseTimeoutMs,
    startToCloseTimeoutMs,
    heartbeatTimeoutMs,
    heartbeatIntervalMs,
  });
}

export const RECONCILIATION_STABLE_FAILURE_TYPES = Object.freeze([
  'TaskFormationModelError',
  'SastEnrichmentModelError',
  'ReconciliationArtifactNotFound',
  'ReconciliationIoError',
  'ConfigurationError',
  'SastEnrichmentInputError',
  'ArtifactIntegrityError',
  'PublicationConflict',
  'UnmappableSurvivor',
  'KeySetDivergence',
] as const);

export type ReconciliationStableFailureType = (typeof RECONCILIATION_STABLE_FAILURE_TYPES)[number];
