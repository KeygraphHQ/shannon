// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Shared neutral contracts for Capella execution and SARIF handoff. */

export interface SarifRef {
  path: string;
  sha256: string;
}

export const CAPELLA_STAGES = [
  'architecture',
  'threat-model',
  'plan',
  'research',
  'dedupe',
  'review',
  'critic',
  'confirm',
  'calibrate',
  'export',
] as const;

export type CapellaStage = (typeof CAPELLA_STAGES)[number];

const CAPELLA_STAGE_SET = new Set<string>(CAPELLA_STAGES);

export function isCapellaStage(value: string): value is CapellaStage {
  return CAPELLA_STAGE_SET.has(value);
}

export type CapellaFailurePoint = CapellaStage | 'workflow';

export interface CapellaUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  costUsd: number;
  turns: number;
}

/** Architecture-stage reduction: malformed model-authored KB items were dropped. */
export interface AgenticSastArchitectureReduction {
  readonly stage: 'architecture';
  readonly reason: 'invalid_architecture_items';
  readonly entityCount: number;
  readonly omittedEntityCount: number;
  readonly dependencyCount: number;
  readonly omittedDependencyCount: number;
}

/** Plan-stage reduction: malformed investigations were dropped before research. */
export interface AgenticSastPlanReduction {
  readonly stage: 'plan';
  readonly reason: 'invalid_investigations';
  readonly consideredCount: number;
  readonly usableCount: number;
  readonly omittedCount: number;
}

/** Aggregate research reduction across triage and deep-audit units. */
export interface AgenticSastResearchReduction {
  readonly stage: 'research';
  readonly reason: 'incomplete_research';
  readonly triageConsideredCount: number;
  readonly triageClassifiedCount: number;
  readonly triageOmittedCount: number;
  readonly affectedTriageBatchCount: number;
  readonly auditUnitCount: number;
  readonly salvagedAuditSessionCount: number;
}

/** Dedupe-stage reduction: invalid files or a salvaged turn-limit reduced coverage. */
export interface AgenticSastDedupeReduction {
  readonly stage: 'dedupe';
  readonly reason: 'incomplete_dedupe';
  readonly consideredCount: number;
  readonly survivorCount: number;
  readonly unreadableCount: number;
  readonly salvagedTurnLimitCount: number;
}

interface AgenticSastVerdictReductionBase {
  readonly consideredCount: number;
  readonly gradedCount: number;
  readonly missingCount: number;
  readonly unreadableCount: number;
  readonly rejectedUnexpectedCount: number;
  readonly rejectedDuplicateCount: number;
  readonly salvagedTurnLimitCount: number;
}

/** Review-stage reduction. Ungraded survivors are quarantined before publication. */
export interface AgenticSastReviewReduction extends AgenticSastVerdictReductionBase {
  readonly stage: 'review';
  readonly reason: 'incomplete_review';
  readonly quarantinedCount: number;
}

export interface AgenticSastCriticReduction extends AgenticSastVerdictReductionBase {
  readonly stage: 'critic';
  readonly reason: 'incomplete_critic';
}

export interface AgenticSastConfirmReduction extends AgenticSastVerdictReductionBase {
  readonly stage: 'confirm';
  readonly reason: 'incomplete_confirm';
}

export interface AgenticSastCalibrateReduction extends AgenticSastVerdictReductionBase {
  readonly stage: 'calibrate';
  readonly reason: 'incomplete_calibrate';
}

export type CapellaFallbackStage = Exclude<CapellaStage, 'export'>;

/** A failed stage completed from the last verified finding artifact instead. */
export interface AgenticSastFallbackReduction {
  readonly stage: CapellaFallbackStage;
  readonly reason: 'failed_stage_fallback';
  readonly fallbackFindingCount: number;
}

/** Export-stage reduction: findings dropped because their records were malformed. */
export interface AgenticSastExportReduction {
  readonly stage: 'export';
  readonly reason: 'malformed_findings';
  readonly omittedCount: number;
  readonly consideredCount: number;
  readonly omissions: readonly AgenticSastOmission[];
}

/**
 * One reduced-coverage fact. A run carries at most one member per stage, in stage order. New
 * reductions project bounded counts only. The pre-existing export reduction is the intentional
 * exception: it retains bounded, sanitized omission identity and display-name details.
 */
export type AgenticSastReduction =
  | AgenticSastArchitectureReduction
  | AgenticSastPlanReduction
  | AgenticSastResearchReduction
  | AgenticSastDedupeReduction
  | AgenticSastReviewReduction
  | AgenticSastCriticReduction
  | AgenticSastConfirmReduction
  | AgenticSastCalibrateReduction
  | AgenticSastFallbackReduction
  | AgenticSastExportReduction;

export interface AgenticSastOmission {
  readonly findingId?: string;
  readonly displayName?: string;
  readonly reason: 'invalid_finding_record' | 'missing_code_path' | 'invalid_code_path';
}

/** Original bounded failure retained when the child finishes from a last-good artifact. */
export interface CapellaRecoveredFailure {
  readonly failedStage: CapellaFallbackStage;
  readonly error: string;
  readonly errorCode?: string;
  readonly completedStages: readonly CapellaStage[];
}

export type CapellaRunResult =
  | {
      status: 'succeeded';
      sarif: SarifRef;
      findingCount: number;
      coverage: 'complete' | 'reduced';
      durationMs: number;
      usage: CapellaUsage;
      usageComplete: boolean;
      warnings: string[];
      reductions?: readonly AgenticSastReduction[];
      recoveredFailure?: CapellaRecoveredFailure;
    }
  | {
      status: 'failed';
      failedStage: CapellaFailurePoint;
      error: string;
      /** Bounded machine code from the failing activity's classified failure, when available. */
      errorCode?: string;
      durationMs: number;
      usage: CapellaUsage;
      usageComplete: boolean;
      completedStages: CapellaStage[];
      warnings: string[];
    };
