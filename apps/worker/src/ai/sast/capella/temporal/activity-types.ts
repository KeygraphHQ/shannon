// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Workflow-safe contracts shared by the Capella child and its activity registry. */

import type { ModelRole } from '../../../model-host.js';
import type {
  AgenticSastArchitectureReduction,
  AgenticSastCalibrateReduction,
  AgenticSastConfirmReduction,
  AgenticSastCriticReduction,
  AgenticSastDedupeReduction,
  AgenticSastFallbackReduction,
  AgenticSastPlanReduction,
  AgenticSastResearchReduction,
  AgenticSastReviewReduction,
  CapellaFallbackStage,
  CapellaStage,
  CapellaUsage,
  SarifRef,
} from '../../types.js';
import { CAPELLA_NON_RETRYABLE_ERROR_TYPES } from '../error-contract.js';
import type {
  ArchitectureValue,
  CalibrateValue,
  CapellaArtifactRef,
  ConfirmValue,
  CriticValue,
  DedupeValue,
  ExportValue,
  PlanValue,
  ResearchValue,
  ReviewValue,
  ThreatModelValue,
} from '../types.js';

export interface CapellaWorkflowInput {
  readonly repoPath: string;
  readonly artifactRoot: string;
  readonly workflowLogPath: string;
  readonly promptDir: string;
  readonly codePathAvoids: readonly string[];
  readonly codePathFocus: readonly string[];
  readonly modelSpec: string;
  readonly capellaFormatVersion: string;
  readonly promptSetVersion: string;
  readonly pipelineTestingMode: boolean;
}

export interface CapellaActivityInput extends CapellaWorkflowInput {
  readonly timeoutMs: number;
}

export interface CapellaThreatModelActivityInput extends CapellaActivityInput {
  readonly architectureArtifact: CapellaArtifactRef;
}

export interface CapellaPlanActivityInput extends CapellaActivityInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly threatModelArtifact: CapellaArtifactRef;
}

export interface CapellaResearchActivityInput extends CapellaActivityInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly planArtifact: CapellaArtifactRef;
}

export interface CapellaFindingActivityInput extends CapellaActivityInput {
  readonly findingsArtifact: CapellaArtifactRef;
}

export interface CapellaKnowledgeFindingActivityInput extends CapellaFindingActivityInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly threatModelArtifact: CapellaArtifactRef;
}

export type CapellaExportSourceStage = 'research' | 'dedupe' | 'review' | 'critic' | 'confirm' | 'calibrate';

export interface CapellaExportActivityInput extends CapellaActivityInput {
  readonly findingsArtifact?: CapellaArtifactRef;
  readonly findingsStage?: CapellaExportSourceStage;
  readonly fallbackReduction?: AgenticSastFallbackReduction;
  readonly fallbackFailure?: CapellaFallbackFailure;
}

export interface CapellaFallbackFailure {
  readonly stage: CapellaFallbackStage;
  readonly code: string;
  readonly error: string;
  readonly attempt: number;
  readonly retryable: boolean;
}

export interface CapellaActivityResult<T> {
  readonly status: 'completed';
  readonly durationMs: number;
  readonly reused: boolean;
  readonly artifact: CapellaArtifactRef;
  readonly value: T;
  readonly attempts: number;
  readonly usage: CapellaUsage;
  /** True only when the usage ledger accounts for every session and no retry occurred; false means usage is a lower bound. */
  readonly usageComplete: boolean;
}

export interface CapellaArchitectureActivityValue {
  readonly componentCount: ArchitectureValue['componentCount'];
  readonly reduction?: AgenticSastArchitectureReduction;
}

export interface CapellaThreatModelActivityValue {
  readonly intent: ThreatModelValue['intent'];
}

export interface CapellaPlanActivityValue {
  readonly investigationCount: PlanValue['investigationCount'];
  readonly reduction?: AgenticSastPlanReduction;
}

export interface CapellaResearchActivityValue {
  readonly findingCount: number;
  readonly flaggedFileCount: number;
  readonly dispatchedCount: ResearchValue['dispatchedCount'];
  readonly resumedCount: ResearchValue['resumedCount'];
  readonly coverage: ResearchValue['coverage'];
  // Present only when coverage is 'reduced'. Counts only — no assigned/missing file path crosses
  // this boundary, so nothing model-authored or path-bearing can reach a public surface.
  readonly reduction?: AgenticSastResearchReduction;
}

export interface CapellaDedupeActivityValue {
  readonly findingCount: number;
  readonly duplicateCount: DedupeValue['duplicateCount'];
  readonly survivorCount: DedupeValue['survivorCount'];
  readonly reduction?: AgenticSastDedupeReduction;
}

export interface CapellaReviewActivityValue {
  readonly findingCount: number;
  readonly validCount: ReviewValue['validCount'];
  readonly provisionalCount: ReviewValue['provisionalCount'];
  readonly falsePositiveCount: ReviewValue['falsePositiveCount'];
  readonly reduction?: AgenticSastReviewReduction;
}

export interface CapellaCriticActivityValue {
  readonly findingCount: number;
  readonly viableCount: CriticValue['viableCount'];
  readonly reduction?: AgenticSastCriticReduction;
}

export interface CapellaConfirmActivityValue {
  readonly findingCount: number;
  readonly confirmedCount: ConfirmValue['confirmedCount'];
  readonly reduction?: AgenticSastConfirmReduction;
}

export interface CapellaCalibrateActivityValue {
  readonly findingCount: number;
  readonly calibratedCount: CalibrateValue['calibratedCount'];
  readonly reduction?: AgenticSastCalibrateReduction;
}

export interface CapellaExportActivityValue {
  readonly sarif: SarifRef;
  readonly findingCount: ExportValue['findingCount'];
  readonly coverage: ExportValue['coverage'];
  readonly warnings: readonly string[];
  readonly reduction?: ExportValue['reduction'];
}

export type CapellaArchitectureActivityResult = CapellaActivityResult<CapellaArchitectureActivityValue>;
export type CapellaThreatModelActivityResult = CapellaActivityResult<CapellaThreatModelActivityValue>;
export type CapellaPlanActivityResult = CapellaActivityResult<CapellaPlanActivityValue>;
export type CapellaResearchActivityResult = CapellaActivityResult<CapellaResearchActivityValue>;
export type CapellaDedupeActivityResult = CapellaActivityResult<CapellaDedupeActivityValue>;
export type CapellaReviewActivityResult = CapellaActivityResult<CapellaReviewActivityValue>;
export type CapellaCriticActivityResult = CapellaActivityResult<CapellaCriticActivityValue>;
export type CapellaConfirmActivityResult = CapellaActivityResult<CapellaConfirmActivityValue>;
export type CapellaCalibrateActivityResult = CapellaActivityResult<CapellaCalibrateActivityValue>;
export type CapellaExportActivityResult = CapellaActivityResult<CapellaExportActivityValue>;

/**
 * Bounded failure payload carried as the first `details` entry of the activity's
 * ApplicationFailure. The child workflow revalidates the shape before trusting it,
 * so a field added here is ignored until that validator learns it.
 */
export interface CapellaActivityFailureDetails {
  readonly stage: CapellaStage;
  /** Bounded internal or provider-category machine code identifying the classified failure. */
  readonly code: string;
  readonly attempts: number;
  readonly usage: CapellaUsage;
  readonly usageComplete: boolean;
  /** Reasons the stage's usage accounting could not be trusted; empty when the ledger reconciled. */
  readonly warnings: readonly string[];
}

export interface CapellaActivityRegistry {
  readonly capellaArchitecture: (input: CapellaActivityInput) => Promise<CapellaArchitectureActivityResult>;
  readonly capellaThreatModel: (input: CapellaThreatModelActivityInput) => Promise<CapellaThreatModelActivityResult>;
  readonly capellaPlan: (input: CapellaPlanActivityInput) => Promise<CapellaPlanActivityResult>;
  readonly capellaResearch: (input: CapellaResearchActivityInput) => Promise<CapellaResearchActivityResult>;
  readonly capellaDedupe: (input: CapellaFindingActivityInput) => Promise<CapellaDedupeActivityResult>;
  readonly capellaReview: (input: CapellaFindingActivityInput) => Promise<CapellaReviewActivityResult>;
  readonly capellaCritic: (input: CapellaKnowledgeFindingActivityInput) => Promise<CapellaCriticActivityResult>;
  readonly capellaConfirm: (input: CapellaFindingActivityInput) => Promise<CapellaConfirmActivityResult>;
  readonly capellaCalibrate: (input: CapellaKnowledgeFindingActivityInput) => Promise<CapellaCalibrateActivityResult>;
  readonly capellaExport: (input: CapellaExportActivityInput) => Promise<CapellaExportActivityResult>;
}

/**
 * The ten Capella names inside the worker's frozen activity registry. Worker startup
 * asserts the registered set against this list, and running workflows refer to
 * activities by these strings, so a rename breaks resume of in-flight scans.
 */
export const CAPELLA_ACTIVITY_NAMES = Object.freeze([
  'capellaArchitecture',
  'capellaThreatModel',
  'capellaPlan',
  'capellaResearch',
  'capellaDedupe',
  'capellaReview',
  'capellaCritic',
  'capellaConfirm',
  'capellaCalibrate',
  'capellaExport',
] as const satisfies readonly (keyof CapellaActivityRegistry)[]);

export { CAPELLA_NON_RETRYABLE_ERROR_TYPES } from '../error-contract.js';

export interface CapellaActivityPolicy {
  readonly stage: CapellaStage;
  readonly startToCloseTimeoutMs: number;
  readonly scheduleToCloseTimeoutMs: number;
  /** Null disables heartbeating entirely, including the activity wrapper's background heartbeat loop. */
  readonly heartbeatTimeoutMs: number | null;
  readonly retry: {
    readonly initialIntervalMs: number;
    readonly maximumIntervalMs: number;
    readonly backoffCoefficient: number;
    readonly maximumAttempts: number;
    readonly nonRetryableErrorTypes: readonly string[];
  };
  readonly role: ModelRole | 'small + medium' | 'none';
}

const MINUTE_MS = 60 * 1_000;
const HOUR_MS = 60 * MINUTE_MS;

function policy(
  stage: CapellaStage,
  startToCloseTimeoutMs: number,
  scheduleToCloseTimeoutMs: number,
  heartbeatTimeoutMs: number | null,
  maximumAttempts: number,
  role: ModelRole | 'small + medium' | 'none',
): Readonly<CapellaActivityPolicy> {
  return Object.freeze({
    stage,
    startToCloseTimeoutMs,
    scheduleToCloseTimeoutMs,
    heartbeatTimeoutMs,
    retry: Object.freeze({
      initialIntervalMs: MINUTE_MS,
      maximumIntervalMs: 5 * MINUTE_MS,
      backoffCoefficient: 2,
      maximumAttempts,
      nonRetryableErrorTypes: CAPELLA_NON_RETRYABLE_ERROR_TYPES,
    }),
    role,
  });
}

export const CAPELLA_ACTIVITY_POLICIES = Object.freeze({
  capellaArchitecture: policy('architecture', 60 * MINUTE_MS, 60 * MINUTE_MS, 5 * MINUTE_MS, 3, 'large'),
  capellaThreatModel: policy('threat-model', 30 * MINUTE_MS, 30 * MINUTE_MS, 5 * MINUTE_MS, 2, 'medium'),
  capellaPlan: policy('plan', 30 * MINUTE_MS, 90 * MINUTE_MS, 5 * MINUTE_MS, 2, 'medium'),
  capellaResearch: policy('research', 3 * HOUR_MS, 4.5 * HOUR_MS, 5 * MINUTE_MS, 2, 'small + medium'),
  capellaDedupe: policy('dedupe', 30 * MINUTE_MS, 45 * MINUTE_MS, 5 * MINUTE_MS, 2, 'small'),
  capellaReview: policy('review', 2 * HOUR_MS, 2 * HOUR_MS, 5 * MINUTE_MS, 2, 'medium'),
  capellaCritic: policy('critic', 60 * MINUTE_MS, 60 * MINUTE_MS, 5 * MINUTE_MS, 2, 'medium'),
  capellaConfirm: policy('confirm', 60 * MINUTE_MS, 60 * MINUTE_MS, 5 * MINUTE_MS, 2, 'medium'),
  capellaCalibrate: policy('calibrate', 45 * MINUTE_MS, 45 * MINUTE_MS, 5 * MINUTE_MS, 2, 'small'),
  // Export runs no model but writes final artifacts; a heartbeat keeps it cancellable mid-run
  // instead of letting a cancelled scan keep materializing SARIF for up to its start-to-close.
  capellaExport: policy('export', 5 * MINUTE_MS, 10 * MINUTE_MS, MINUTE_MS, 2, 'none'),
} as const satisfies Readonly<Record<keyof CapellaActivityRegistry, Readonly<CapellaActivityPolicy>>>);

/** Bounds the whole child pipeline, including every stage's retries and backoff. */
export const CAPELLA_CHILD_WORKFLOW_TIMEOUT_MS = 15 * HOUR_MS;
