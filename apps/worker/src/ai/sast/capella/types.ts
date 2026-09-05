// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { CapellaAgentExecutor, CapellaTool } from '../../pi/capella-agent-types.js';
import type {
  AgenticSastArchitectureReduction,
  AgenticSastCalibrateReduction,
  AgenticSastConfirmReduction,
  AgenticSastCriticReduction,
  AgenticSastDedupeReduction,
  AgenticSastFallbackReduction,
  AgenticSastPlanReduction,
  AgenticSastReduction,
  AgenticSastResearchReduction,
  AgenticSastReviewReduction,
  CapellaFallbackStage,
  CapellaStage,
  CapellaUsage,
  SarifRef,
} from '../types.js';
import type { CapellaFinding } from './finding-types.js';
import type { KbResult, PlanResult, ThreatModelResult } from './schemas.js';

// Both versions are identity fields of every run fingerprint and run.json record. Routine
// prompt edits are already covered by each stage's rendered-prompt digest; bump this global
// prompt contract only when a cross-stage change must invalidate every Capella artifact.
export const CAPELLA_FORMAT_VERSION = '1';
export const CAPELLA_PROMPT_SET_VERSION = 'capella-prompts.v1';
export const CAPELLA_TRIAGE_CONCURRENCY = 4;
export const CAPELLA_AUDIT_CONCURRENCY = 2;

export const ZERO_CAPELLA_USAGE: CapellaUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
  turns: 0,
};

/** Immutable reference to a completed, fingerprinted Capella artifact. */
export interface CapellaArtifactRef {
  readonly path: string;
  readonly sha256: string;
  readonly fingerprint: string;
}

/** Serializable inputs shared by every activity-side stage implementation. */
export interface CapellaStageInput {
  readonly repoPath: string;
  readonly artifactRoot: string;
  readonly workflowLogPath: string;
  readonly promptDir: string;
  readonly modelSpec: string;
  readonly capellaFormatVersion: string;
  readonly promptSetVersion: string;
  readonly codePathAvoids: readonly string[];
  readonly codePathFocus: readonly string[];
  readonly pipelineTestingMode: boolean;
  readonly timeoutMs: number;
}

/** Non-serializable activity dependencies supplied by the Temporal wrapper. */
export interface CapellaStageRuntime {
  readonly executor: CapellaAgentExecutor;
  readonly repositoryTools: readonly CapellaTool[];
  readonly signal: AbortSignal;
}

export interface CompletedStage<T> {
  readonly status: 'completed';
  readonly durationMs: number;
  readonly reused: boolean;
  readonly usage: CapellaUsage;
  readonly artifact: CapellaArtifactRef;
  readonly value: T;
}

export interface ArchitectureValue {
  readonly knowledgeBase: KbResult;
  readonly componentCount: number;
  readonly reduction?: AgenticSastArchitectureReduction;
}

export interface ThreatModelValue extends ThreatModelResult {
  readonly threatModelPath: string;
}

export interface PlanValue extends PlanResult {
  readonly investigationCount: number;
  readonly reduction?: AgenticSastPlanReduction;
}

export interface FindingSetValue {
  readonly findings: CapellaFinding[];
}

/**
 * Deterministic triage-coverage result for the research stage. `missingFiles` is the private
 * detailed evidence of which assigned paths were not classified; it stays in this artifact and
 * is never projected into a public surface (only the counts are).
 */
export interface ResearchCoverage {
  readonly consideredCount: number;
  readonly classifiedCount: number;
  readonly omittedCount: number;
  readonly affectedBatchCount: number;
  readonly missingFiles: readonly string[];
}

/** Private audit-unit evidence retained in the research artifact. */
export interface ResearchAuditCoverage {
  readonly consideredCount: number;
  readonly completedCount: number;
  readonly salvagedSessionCount: number;
}

export interface ResearchValue extends FindingSetValue {
  readonly flaggedFiles: string[];
  readonly dispatchedCount: number;
  readonly resumedCount: number;
  readonly coverage: 'complete' | 'reduced';
  readonly triageCoverage: ResearchCoverage;
  readonly auditCoverage: ResearchAuditCoverage;
  readonly reduction?: AgenticSastResearchReduction;
}

export interface DedupeValue extends FindingSetValue {
  readonly duplicateCount: number;
  readonly survivorCount: number;
  readonly reduction?: AgenticSastDedupeReduction;
}

interface VerdictStageDiagnostics {
  /** Private collector diagnostics; compact activity values omit these when coverage is complete. */
  readonly rejectedUnexpectedCount: number;
  readonly rejectedDuplicateCount: number;
}

export interface ReviewValue extends FindingSetValue, VerdictStageDiagnostics {
  readonly validCount: number;
  readonly provisionalCount: number;
  readonly falsePositiveCount: number;
  readonly reduction?: AgenticSastReviewReduction;
}

export interface CriticValue extends FindingSetValue, VerdictStageDiagnostics {
  readonly viableCount: number;
  readonly reduction?: AgenticSastCriticReduction;
}

export interface ConfirmValue extends FindingSetValue, VerdictStageDiagnostics {
  readonly confirmedCount: number;
  readonly reduction?: AgenticSastConfirmReduction;
}

export interface CalibrateValue extends FindingSetValue, VerdictStageDiagnostics {
  readonly calibratedCount: number;
  readonly reduction?: AgenticSastCalibrateReduction;
}

export interface ExportValue {
  readonly sarif: SarifRef;
  readonly findingCount: number;
  readonly coverage: 'complete' | 'reduced';
  readonly warnings: string[];
  readonly reportPath: string;
  readonly reduction?: AgenticSastReduction;
}

export interface FindingStageInput extends CapellaStageInput {
  readonly findingsArtifact: CapellaArtifactRef;
}

export interface KnowledgeFindingStageInput extends FindingStageInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly threatModelArtifact: CapellaArtifactRef;
}

export interface ThreatModelStageInput extends CapellaStageInput {
  readonly architectureArtifact: CapellaArtifactRef;
}

export interface PlanStageInput extends CapellaStageInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly threatModelArtifact: CapellaArtifactRef;
}

export interface ResearchStageInput extends CapellaStageInput {
  readonly architectureArtifact: CapellaArtifactRef;
  readonly planArtifact: CapellaArtifactRef;
}

export type ExportSourceStage = 'research' | 'dedupe' | 'review' | 'critic' | 'confirm' | 'calibrate';

export interface ExportStageInput extends CapellaStageInput {
  readonly findingsArtifact?: CapellaArtifactRef;
  readonly findingsStage?: ExportSourceStage;
  readonly repositoryLabel: string;
  readonly fallbackReduction?: AgenticSastFallbackReduction;
  readonly fallbackFailure?: CapellaFallbackFailure;
}

/** Bounded original failure sent back into a last-good export activity. */
export interface CapellaFallbackFailure {
  readonly stage: CapellaFallbackStage;
  readonly code: string;
  readonly error: string;
  readonly attempt: number;
  readonly retryable: boolean;
}

export interface CapellaArtifactEnvelope<T> {
  readonly schemaVersion: 1;
  readonly stage: CapellaStage;
  readonly fingerprint: string;
  readonly usage: CapellaUsage;
  readonly value: T;
}

export type StageArtifactValidator<T> = (value: unknown) => value is T;

export interface AtomicPublishOptions {
  readonly beforeRename?: (temporaryPath: string, finalPath: string) => Promise<void> | void;
}

export interface CapellaRunFailure {
  readonly stage: CapellaStage | 'workflow';
  readonly code: string;
  readonly error: string;
  readonly attempt: number;
  readonly retryable: boolean;
}

/**
 * A stage's spend folded from its per-attempt usage ledger. `complete` requires a matching
 * final record for every started session; `retried` reports whether more than one activity
 * attempt touched the stage. Usage accounting is trusted only when `complete && !retried`,
 * because an attempt that died mid-session cannot prove its spend was fully captured.
 */
export interface StageUsageSummary {
  readonly usage: CapellaUsage;
  readonly complete: boolean;
  readonly retried: boolean;
}

export interface CapellaRunRecord {
  readonly schemaVersion: 1;
  readonly capellaFormatVersion: string;
  readonly promptSetVersion: string;
  readonly inputFingerprint: string;
  readonly completedStages: CapellaStage[];
  readonly finalState: 'running' | 'succeeded' | 'failed';
  readonly warnings: string[];
  readonly usage: CapellaUsage;
  readonly stageUsage: Partial<Record<CapellaStage, CapellaUsage>>;
  // True only while every recorded stage's spend was captured from a clean, un-retried
  // ledger. A retried or terminally failed stage drives this false; the reason is named in
  // `warnings`. Consumers treating run.json as the billing record read this before trusting `usage`.
  readonly usageAccountingComplete: boolean;
  // Aggregate reduced-coverage summary, at most one entry per stage, in stage order. Stage
  // reductions are counts-only; export omissions may include bounded finding identity for private
  // diagnostics. Derived from the same structured facts the stage artifacts hold.
  readonly reductions?: readonly AgenticSastReduction[];
  readonly sarif?: SarifRef;
  readonly failure?: CapellaRunFailure;
}

/**
 * Human-readable reason a stage's usage accounting could not be fully trusted.
 *
 * The single source of the warning text: run.json (`recordRunFailure`,
 * `recordStageUsageAccounting`), the activity failure payload, and the workflow fold all
 * emit this string for a stage whose ledger did not reconcile (`complete && !retried`), so
 * every ledger surfaces the identical reason. Lives here because it is shared across the
 * activity side and the workflow isolate.
 */
export function usageAccountingWarning(stage: CapellaStage | 'workflow'): string {
  return `Usage accounting for stage "${stage}" is incomplete: the stage was retried or failed, so a failed attempt's spend may not be fully captured in run.json.`;
}
