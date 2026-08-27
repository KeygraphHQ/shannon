// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Durable single-scan execution and report-progress contracts. */

import type { AgenticSastReduction, CapellaFailurePoint } from '../ai/sast/types.js';
import type { AgentName } from './agents.js';
import { ALL_VULN_CLASSES, type VulnClass } from './config.js';
import type { ReconciliationClass } from './reconciliation.js';

export const DURABLE_SCAN_STATE_SCHEMA_VERSION = 1 as const;

export const FIXED_ANALYSIS_CLASSES: readonly VulnClass[] = Object.freeze([...ALL_VULN_CLASSES]);

/**
 * What became of the internal `miscellaneous` class on this scan. `exploitation_disabled`
 * means the scan has `exploit: false`, checked before the queue is even inspected;
 * `not_actionable` means exploitation is enabled but reconciliation grouped no findings into
 * this class; `expected` means an exploit agent was admitted for this class and has not
 * finished; `completed` means that agent has finished.
 */
export type MiscellaneousOutcome = 'not_actionable' | 'exploitation_disabled' | 'expected' | 'completed';

// === Partial-reason contract ===

/** Closed degradation codes, in the locked presentation order. */
export const PARTIAL_REASON_CODES = Object.freeze([
  'agentic_sast_failed',
  'agentic_sast_reduced',
  'class_pipeline_failed',
  'class_reconciliation_failed',
  'report_renumber_failed',
  'report_compaction_failed',
  'report_class_omitted',
  'report_sarif_failed',
] as const);

export type PartialReasonCode = (typeof PARTIAL_REASON_CODES)[number];

export const AGENTIC_SAST_REDUCTION_REASONS = Object.freeze([
  'invalid_architecture_items',
  'invalid_investigations',
  'incomplete_research',
  'incomplete_dedupe',
  'incomplete_review',
  'incomplete_critic',
  'incomplete_confirm',
  'incomplete_calibrate',
  'failed_stage_fallback',
  'malformed_findings',
] as const);
export type AgenticSastReductionReason = (typeof AGENTIC_SAST_REDUCTION_REASONS)[number];

export const AGENTIC_SAST_OMISSION_REASONS = Object.freeze([
  'invalid_finding_record',
  'missing_code_path',
  'invalid_code_path',
] as const);
export type AgenticSastOmissionReason = (typeof AGENTIC_SAST_OMISSION_REASONS)[number];

export interface AgenticSastOmission {
  readonly findingId?: string;
  readonly displayName?: string;
  readonly reason: AgenticSastOmissionReason;
}

/** Codes whose durable identity carries a vulnerability-class context. */
const CLASS_CONTEXT_CODES: ReadonlySet<PartialReasonCode> = new Set([
  'class_pipeline_failed',
  'class_reconciliation_failed',
  'report_renumber_failed',
  'report_class_omitted',
]);

/**
 * Accepted `agentic_sast_failed` stage contexts. Mirrors `CapellaFailurePoint`; the
 * `satisfies` clause plus the exhaustiveness check below keep the two in sync at compile time.
 */
export const ACCEPTED_CAPELLA_FAILURE_STAGES = Object.freeze([
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
  'workflow',
] as const satisfies readonly CapellaFailurePoint[]);

type UnlistedCapellaStage = Exclude<CapellaFailurePoint, (typeof ACCEPTED_CAPELLA_FAILURE_STAGES)[number]>;
const _everyCapellaStageIsListed: UnlistedCapellaStage extends never ? true : never = true;
void _everyCapellaStageIsListed;

/** The fixed context order used after code order: the five analysis classes, then `miscellaneous`. */
const PARTIAL_REASON_CLASS_ORDER: readonly ReconciliationClass[] = Object.freeze([
  ...ALL_VULN_CLASSES,
  'miscellaneous',
]);

/**
 * One durable degradation record. The code plus its bounded context is the identity;
 * safe messages are derived for display and never participate in equality or resume.
 */
export interface PartialReason {
  readonly code: PartialReasonCode;
  readonly vulnerabilityClass?: ReconciliationClass;
  readonly stage?: CapellaFailurePoint;
  readonly reductionReason?: AgenticSastReductionReason;
  readonly omittedCount?: number;
  readonly consideredCount?: number;
  readonly omissions?: readonly AgenticSastOmission[];
  readonly classifiedCount?: number;
  readonly affectedBatchCount?: number;
  readonly entityCount?: number;
  readonly omittedEntityCount?: number;
  readonly dependencyCount?: number;
  readonly omittedDependencyCount?: number;
  readonly usableCount?: number;
  readonly triageConsideredCount?: number;
  readonly triageClassifiedCount?: number;
  readonly triageOmittedCount?: number;
  readonly affectedTriageBatchCount?: number;
  readonly auditUnitCount?: number;
  readonly salvagedAuditSessionCount?: number;
  readonly survivorCount?: number;
  readonly unreadableCount?: number;
  readonly salvagedTurnLimitCount?: number;
  readonly gradedCount?: number;
  readonly missingCount?: number;
  readonly rejectedUnexpectedCount?: number;
  readonly rejectedDuplicateCount?: number;
  readonly quarantinedCount?: number;
  readonly fallbackFindingCount?: number;
}

/** Derived presentation of one durable reason for status output. */
export interface PartialReasonView extends PartialReason {
  readonly message: string;
}

// === Display projection ===

/**
 * Reader-facing name of every accepted vulnerability class, in the capitalization an
 * accepted sentence starts with. The mid-sentence form is this name lowercased.
 * Durable records, JSON fields, and every stable machine value keep the slug instead.
 */
const CLASS_DISPLAY_NAMES: Readonly<Record<ReconciliationClass, string>> = Object.freeze({
  injection: 'Injection',
  xss: 'Cross-Site Scripting',
  auth: 'Authentication',
  authz: 'Authorization',
  ssrf: 'Server-Side Request Forgery',
  miscellaneous: 'Miscellaneous',
});

/** Reader-facing name of every accepted Agentic SAST stage, written to read mid-sentence. */
const CAPELLA_STAGE_DISPLAY_NAMES: Readonly<Record<CapellaFailurePoint, string>> = Object.freeze({
  architecture: 'architecture mapping',
  'threat-model': 'threat modelling',
  plan: 'review planning',
  research: 'deep code research',
  dedupe: 'duplicate merging',
  review: 'independent review',
  critic: 'viability critique',
  confirm: 'static confirmation',
  calibrate: 'risk calibration',
  export: 'findings export',
  workflow: 'orchestration',
});

/** Sentence-start display name for an accepted class slug, e.g. `xss` to `Cross-Site Scripting`. */
export function classDisplayName(vulnerabilityClass: ReconciliationClass): string {
  const name = CLASS_DISPLAY_NAMES[vulnerabilityClass];
  // The accepted slugs are a closed set that durable validation already enforced, so an
  // unmapped value is corruption. Fail closed rather than render a stored value verbatim.
  if (name === undefined) throw new RunStateError('CorruptedSessionError', 'class-display-name-unmapped');
  return name;
}

/** Display name for an accepted Agentic SAST stage slug, e.g. `threat-model` to `threat modelling`. */
export function capellaStageDisplayName(stage: CapellaFailurePoint): string {
  const name = CAPELLA_STAGE_DISPLAY_NAMES[stage];
  if (name === undefined) throw new RunStateError('CorruptedSessionError', 'stage-display-name-unmapped');
  return name;
}

/** Any template token that survives substitution, so a missing context can never ship. */
const SAFE_MESSAGE_TOKEN_PATTERN = /\{(?:Class|class|stage)\}/;

/** The bounded context a safe-message template may interpolate. */
export interface SafeMessageContext {
  readonly vulnerabilityClass?: ReconciliationClass;
  readonly stage?: CapellaFailurePoint;
}

/**
 * Substitute display names into one safe-message template. `{Class}` starts a sentence,
 * `{class}` sits mid-sentence, and `{stage}` names an Agentic SAST stage. A template whose
 * context is missing leaves a placeholder behind, which fails closed instead of shipping it.
 */
export function renderSafeMessage(template: string, context: SafeMessageContext): string {
  let rendered = template;
  if (context.vulnerabilityClass !== undefined) {
    const displayName = classDisplayName(context.vulnerabilityClass);
    rendered = rendered.replaceAll('{Class}', displayName).replaceAll('{class}', displayName.toLowerCase());
  }
  if (context.stage !== undefined) {
    rendered = rendered.replaceAll('{stage}', capellaStageDisplayName(context.stage));
  }
  if (SAFE_MESSAGE_TOKEN_PATTERN.test(rendered)) {
    throw new RunStateError('CorruptedSessionError', 'safe-message-context-missing');
  }
  return rendered;
}

/** The one safe-message map; every human or JSON surface renders reasons through it. */
export const PARTIAL_REASON_SAFE_MESSAGES: Readonly<Record<PartialReasonCode, string>> = Object.freeze({
  agentic_sast_failed: 'Agentic SAST failed, so the pentest continued without its findings.',
  agentic_sast_reduced:
    "Agentic SAST left some findings out of the pentest because they did not match Shannon's required finding format. This workspace does not contain the exact count.",
  class_pipeline_failed:
    '{Class} could not be fully assessed. The other classes completed. Re-running this workspace retries only the part that failed.',
  class_reconciliation_failed:
    '{Class} findings could not be grouped into test cases, so that class was not exploited. Its analysis results are still in the report.',
  report_renumber_failed:
    '{Class} findings kept their working reference numbers, so numbering in the report may have gaps. The findings themselves are complete.',
  report_compaction_failed:
    'Finding reference numbers in the report may have gaps. Every finding is present; only the numbering is affected.',
  report_class_omitted: '{Class} was assessed but could not be included in the final report.',
  report_sarif_failed: 'Report SARIF could not be generated. JSON and Markdown remain available.',
});

/** Used in place of the stageless `agentic_sast_failed` message once a stage is recorded. */
const AGENTIC_SAST_FAILED_WITH_STAGE =
  'Agentic SAST failed during {stage}, so the pentest continued without its findings.';

/** Validate one closed reason record: known code, exact keys, and code-appropriate context. */
export function isPartialReason(value: unknown): value is PartialReason {
  if (!isRecord(value)) return false;
  const code = value.code;
  if (typeof code !== 'string' || !(PARTIAL_REASON_CODES as readonly string[]).includes(code)) return false;
  const reasonCode = code as PartialReasonCode;

  if (CLASS_CONTEXT_CODES.has(reasonCode)) {
    return (
      hasExactKeys(value, ['code', 'vulnerabilityClass']) &&
      PARTIAL_REASON_CLASS_ORDER.includes(value.vulnerabilityClass as ReconciliationClass)
    );
  }
  if (reasonCode === 'agentic_sast_failed') {
    return (
      hasExactKeys(value, ['code'], ['stage']) &&
      (value.stage === undefined ||
        (ACCEPTED_CAPELLA_FAILURE_STAGES as readonly string[]).includes(value.stage as string))
    );
  }
  if (reasonCode === 'agentic_sast_reduced') {
    if (hasExactKeys(value, ['code'])) return true;
    if (value.reductionReason === 'failed_stage_fallback') {
      return (
        hasExactKeys(value, ['code', 'stage', 'reductionReason', 'fallbackFindingCount']) &&
        value.stage !== 'export' &&
        value.stage !== 'workflow' &&
        (ACCEPTED_CAPELLA_FAILURE_STAGES as readonly unknown[]).includes(value.stage) &&
        isBoundedPartialReasonCount(value.fallbackFindingCount)
      );
    }
    if (value.stage === 'architecture') {
      return (
        hasExactKeys(value, [
          'code',
          'stage',
          'reductionReason',
          'entityCount',
          'omittedEntityCount',
          'dependencyCount',
          'omittedDependencyCount',
        ]) &&
        value.reductionReason === 'invalid_architecture_items' &&
        countsAreBounded(value, ['entityCount', 'omittedEntityCount', 'dependencyCount', 'omittedDependencyCount']) &&
        Number(value.omittedEntityCount) + Number(value.omittedDependencyCount) >= 1 &&
        Number(value.omittedEntityCount) <= Number(value.entityCount) &&
        Number(value.omittedDependencyCount) <= Number(value.dependencyCount)
      );
    }
    if (value.stage === 'plan') {
      return (
        hasExactKeys(value, ['code', 'stage', 'reductionReason', 'consideredCount', 'usableCount', 'omittedCount']) &&
        value.reductionReason === 'invalid_investigations' &&
        countsAreBounded(value, ['consideredCount', 'usableCount', 'omittedCount']) &&
        Number(value.omittedCount) >= 1 &&
        Number(value.usableCount) + Number(value.omittedCount) === Number(value.consideredCount)
      );
    }
    if (value.stage === 'export') {
      return (
        hasExactKeys(value, ['code', 'stage', 'reductionReason', 'omittedCount', 'consideredCount', 'omissions']) &&
        value.reductionReason === 'malformed_findings' &&
        isBoundedPartialReasonCount(value.omittedCount) &&
        isBoundedPartialReasonCount(value.consideredCount) &&
        value.omittedCount >= 1 &&
        value.omittedCount <= value.consideredCount &&
        Array.isArray(value.omissions) &&
        value.omissions.length === value.omittedCount &&
        value.omissions.every(isAgenticSastOmission)
      );
    }
    if (value.stage === 'research') {
      return (
        hasExactKeys(value, [
          'code',
          'stage',
          'reductionReason',
          'triageConsideredCount',
          'triageClassifiedCount',
          'triageOmittedCount',
          'affectedTriageBatchCount',
          'auditUnitCount',
          'salvagedAuditSessionCount',
        ]) &&
        value.reductionReason === 'incomplete_research' &&
        countsAreBounded(value, [
          'triageConsideredCount',
          'triageClassifiedCount',
          'triageOmittedCount',
          'affectedTriageBatchCount',
          'auditUnitCount',
          'salvagedAuditSessionCount',
        ]) &&
        Number(value.triageClassifiedCount) + Number(value.triageOmittedCount) ===
          Number(value.triageConsideredCount) &&
        Number(value.triageOmittedCount) + Number(value.salvagedAuditSessionCount) >= 1
      );
    }
    if (value.stage === 'dedupe') {
      return (
        hasExactKeys(value, [
          'code',
          'stage',
          'reductionReason',
          'consideredCount',
          'survivorCount',
          'unreadableCount',
          'salvagedTurnLimitCount',
        ]) &&
        value.reductionReason === 'incomplete_dedupe' &&
        countsAreBounded(value, ['consideredCount', 'survivorCount', 'unreadableCount', 'salvagedTurnLimitCount']) &&
        Number(value.unreadableCount) + Number(value.salvagedTurnLimitCount) >= 1 &&
        Number(value.salvagedTurnLimitCount) <= 1
      );
    }
    if (['review', 'critic', 'confirm', 'calibrate'].includes(String(value.stage))) {
      const expectedReason = `incomplete_${String(value.stage)}`;
      const countFields = [
        'consideredCount',
        'gradedCount',
        'missingCount',
        'unreadableCount',
        'rejectedUnexpectedCount',
        'rejectedDuplicateCount',
        'salvagedTurnLimitCount',
      ];
      const requiredKeys = ['code', 'stage', 'reductionReason', ...countFields];
      if (
        value.stage === 'review' &&
        hasExactKeys(value, [...requiredKeys, 'quarantinedCount']) &&
        isBoundedPartialReasonCount(value.quarantinedCount) &&
        Number(value.quarantinedCount) <= Number(value.missingCount)
      ) {
        return verdictReductionIsValid(value, expectedReason, countFields);
      }
      return hasExactKeys(value, requiredKeys) && verdictReductionIsValid(value, expectedReason, countFields);
    }
    return false;
  }
  return hasExactKeys(value, ['code']);
}

function isBoundedPartialReasonCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000;
}

function countsAreBounded(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isBoundedPartialReasonCount(value[field]));
}

function verdictReductionIsValid(
  value: Record<string, unknown>,
  expectedReason: string,
  countFields: readonly string[],
): boolean {
  return (
    value.reductionReason === expectedReason &&
    countsAreBounded(value, countFields) &&
    Number(value.missingCount) <= Number(value.consideredCount) &&
    Number(value.salvagedTurnLimitCount) <= 2 &&
    Number(value.missingCount) + Number(value.unreadableCount) + Number(value.salvagedTurnLimitCount) >= 1
  );
}

function isAgenticSastOmission(value: unknown): value is AgenticSastOmission {
  if (!isRecord(value) || !(AGENTIC_SAST_OMISSION_REASONS as readonly unknown[]).includes(value.reason)) {
    return false;
  }
  const allowedKeys = ['reason'];
  if (value.findingId !== undefined) {
    if (typeof value.findingId !== 'string' || !/^[a-z0-9-]{1,256}$/.test(value.findingId)) return false;
    allowedKeys.push('findingId');
  }
  if (value.displayName !== undefined) {
    if (!isBoundedSafeText(value.displayName, 160)) return false;
    allowedKeys.push('displayName');
  }
  return hasExactKeys(value, allowedKeys);
}

function isBoundedSafeText(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength && !containsControlCharacter(value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}

function partialReasonRank(reason: PartialReason): readonly [number, number, number] {
  const codeIndex = PARTIAL_REASON_CODES.indexOf(reason.code);
  const classIndex =
    reason.vulnerabilityClass === undefined ? -1 : PARTIAL_REASON_CLASS_ORDER.indexOf(reason.vulnerabilityClass);
  const stageIndex =
    reason.stage === undefined ? -1 : (ACCEPTED_CAPELLA_FAILURE_STAGES as readonly string[]).indexOf(reason.stage);
  return [codeIndex, classIndex, stageIndex];
}

/** Locked ordering: table code order, then fixed class order, then stage order. */
export function comparePartialReasons(left: PartialReason, right: PartialReason): number {
  const leftRank = partialReasonRank(left);
  const rightRank = partialReasonRank(right);
  for (let index = 0; index < leftRank.length; index++) {
    const difference = (leftRank[index] ?? 0) - (rightRank[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function partialReasonKey(reason: PartialReason): string {
  // One reduction per stage. Legacy code-only records carried no stage but described the only
  // reduction that then existed (export), so they key as export — a detailed export reduction
  // does not create a second reason on resume, while a research reduction stays distinct.
  if (reason.code === 'agentic_sast_reduced') return `${reason.code}|${reason.stage ?? 'export'}`;
  return `${reason.code}|${reason.vulnerabilityClass ?? ''}|${reason.stage ?? ''}`;
}

function reasonsForClass(reasons: readonly PartialReason[], vulnerabilityClass: ReconciliationClass): PartialReason[] {
  return reasons.filter((reason) => reason.vulnerabilityClass === vulnerabilityClass);
}

/**
 * Enforce the one-failure-one-explanation rules inside one ordered set:
 * `class_reconciliation_failed` supersedes `class_pipeline_failed` for the same class, and
 * `report_class_omitted` is valid only when the class has no upstream reason.
 */
function hasConflictingClassReasons(reasons: readonly PartialReason[]): boolean {
  for (const vulnerabilityClass of PARTIAL_REASON_CLASS_ORDER) {
    const classCodes = new Set(reasonsForClass(reasons, vulnerabilityClass).map((reason) => reason.code));
    if (classCodes.has('class_pipeline_failed') && classCodes.has('class_reconciliation_failed')) return true;
    const hasUpstreamReason =
      classCodes.has('class_pipeline_failed') ||
      classCodes.has('class_reconciliation_failed') ||
      classCodes.has('report_renumber_failed');
    if (classCodes.has('report_class_omitted') && hasUpstreamReason) return true;
  }
  return false;
}

/** Validate a durable set: valid members, locked order, no duplicates, no conflicting pairs. */
export function isOrderedPartialReasonSet(value: unknown): value is readonly PartialReason[] {
  if (!Array.isArray(value) || !value.every(isPartialReason)) return false;
  const keys = new Set<string>();
  for (let index = 0; index < value.length; index++) {
    const reason = value[index] as PartialReason;
    const key = partialReasonKey(reason);
    if (keys.has(key)) return false;
    keys.add(key);
    const previous = value[index - 1] as PartialReason | undefined;
    if (previous !== undefined && comparePartialReasons(previous, reason) >= 0) return false;
  }
  return !hasConflictingClassReasons(value as readonly PartialReason[]);
}

/**
 * Append newly observed reasons to a durable set without removing or changing existing ones.
 * Deduplicates on the durable identity, applies the class precedence rules, and returns the
 * locked ordering. Invalid inputs and appends that would have to remove an existing reason
 * fail closed.
 */
export function appendPartialReasons(
  existing: readonly PartialReason[],
  observed: readonly PartialReason[],
): readonly PartialReason[] {
  if (!isOrderedPartialReasonSet(existing)) {
    throw new RunStateError('CorruptedSessionError', 'partial-reasons-existing-invalid');
  }
  if (!observed.every(isPartialReason)) {
    throw new RunStateError('DurableStateConflictError', 'partial-reasons-observed-invalid');
  }

  const merged = new Map<string, PartialReason>();
  for (const reason of existing) merged.set(partialReasonKey(reason), reason);
  for (const reason of observed) {
    const key = partialReasonKey(reason);
    if (merged.has(key)) continue;
    if (reason.code === 'class_pipeline_failed' || reason.code === 'report_class_omitted') {
      const vulnerabilityClass = reason.vulnerabilityClass as ReconciliationClass;
      const classCodes = new Set(reasonsForClass([...merged.values()], vulnerabilityClass).map((entry) => entry.code));
      if (reason.code === 'class_pipeline_failed' && classCodes.has('class_reconciliation_failed')) continue;
      if (
        reason.code === 'report_class_omitted' &&
        (classCodes.has('class_pipeline_failed') ||
          classCodes.has('class_reconciliation_failed') ||
          classCodes.has('report_renumber_failed'))
      ) {
        continue;
      }
    }
    merged.set(key, reason);
  }

  const result = [...merged.values()].sort(comparePartialReasons);
  if (!isOrderedPartialReasonSet(result)) {
    throw new RunStateError('DurableStateConflictError', 'partial-reasons-append-conflict');
  }
  for (const reason of existing) {
    if (!merged.has(partialReasonKey(reason))) {
      throw new RunStateError('DurableStateConflictError', 'partial-reasons-removed');
    }
  }
  return Object.freeze(result);
}

/** Resolve one durable reason's rendered sentence, including its bounded class or stage context. */
function safeMessageFor(reason: PartialReason): string {
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.reductionReason === 'failed_stage_fallback' &&
    reason.stage !== undefined &&
    reason.fallbackFindingCount !== undefined
  ) {
    // The count is what the last verified artifact held, not what was delivered: export applies
    // production-viability gating afterwards and can drop every one of them, so the sentence must
    // never read as a delivery claim.
    const stageName = capellaStageDisplayName(reason.stage);
    if (reason.fallbackFindingCount === 0) {
      return `Agentic SAST could not finish ${stageName}. No candidate findings were recovered from the last verified artifact, so static-analysis coverage was reduced.`;
    }
    const findingLabel = reason.fallbackFindingCount === 1 ? 'finding' : 'findings';
    return `Agentic SAST could not finish ${stageName}. It recovered ${String(reason.fallbackFindingCount)} candidate ${findingLabel} from the last verified artifact; later viability checks may exclude some or all of them from the exported results, so static-analysis coverage was reduced.`;
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.stage === 'architecture' &&
    reason.omittedEntityCount !== undefined &&
    reason.omittedDependencyCount !== undefined
  ) {
    const omitted = reason.omittedEntityCount + reason.omittedDependencyCount;
    return `Agentic SAST omitted ${String(omitted)} malformed architecture item${omitted === 1 ? '' : 's'} and continued with reduced static-analysis coverage.`;
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.stage === 'plan' &&
    reason.consideredCount !== undefined &&
    reason.omittedCount !== undefined
  ) {
    return `Agentic SAST kept ${String(reason.consideredCount - reason.omittedCount)} of ${String(reason.consideredCount)} planned investigations and continued with reduced static-analysis coverage.`;
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.stage === 'research' &&
    reason.reductionReason === 'incomplete_research' &&
    reason.triageConsideredCount !== undefined &&
    reason.triageOmittedCount !== undefined &&
    reason.salvagedAuditSessionCount !== undefined
  ) {
    return renderIncompleteResearchReduction(
      reason.triageConsideredCount,
      reason.triageOmittedCount,
      reason.salvagedAuditSessionCount,
    );
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.stage === 'dedupe' &&
    reason.unreadableCount !== undefined &&
    reason.salvagedTurnLimitCount !== undefined
  ) {
    if (reason.unreadableCount === 0) {
      return 'Agentic SAST preserved accepted duplicate decisions after the session reached its turn limit and continued with reduced static-analysis coverage.';
    }
    return `Agentic SAST completed duplicate merging with ${String(reason.unreadableCount)} unreadable finding file${reason.unreadableCount === 1 ? '' : 's'} and reduced static-analysis coverage.`;
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    ['review', 'critic', 'confirm', 'calibrate'].includes(String(reason.stage)) &&
    reason.stage !== undefined &&
    reason.consideredCount !== undefined &&
    reason.gradedCount !== undefined &&
    reason.salvagedTurnLimitCount !== undefined
  ) {
    if (reason.gradedCount === reason.consideredCount && reason.salvagedTurnLimitCount > 0) {
      return `Agentic SAST preserved accepted decisions after ${capellaStageDisplayName(reason.stage)} reached its turn limit and continued with reduced static-analysis coverage.`;
    }
    return `Agentic SAST graded ${String(reason.gradedCount)} of ${String(reason.consideredCount)} findings during ${capellaStageDisplayName(reason.stage)} and continued with reduced static-analysis coverage.`;
  }
  if (
    reason.code === 'agentic_sast_reduced' &&
    reason.stage === 'export' &&
    reason.reductionReason === 'malformed_findings' &&
    reason.omittedCount !== undefined &&
    reason.consideredCount !== undefined &&
    reason.omissions !== undefined
  ) {
    return renderAgenticSastReduction(reason.consideredCount, reason.omissions);
  }
  const template =
    reason.code === 'agentic_sast_failed' && reason.stage !== undefined
      ? AGENTIC_SAST_FAILED_WITH_STAGE
      : PARTIAL_REASON_SAFE_MESSAGES[reason.code];
  return renderSafeMessage(template, reason);
}

/** Deterministic reduced-coverage sentence for the aggregate research reduction. */
function renderIncompleteResearchReduction(
  consideredCount: number,
  omittedCount: number,
  salvagedAuditSessionCount: number,
): string {
  const fileLabel = consideredCount === 1 ? 'file' : 'files';
  const triageClause =
    omittedCount === 0
      ? 'Every assigned file was classified.'
      : `${omittedCount === 1 ? 'One was' : `${String(omittedCount)} were`} not classified.`;
  const salvagedClause =
    salvagedAuditSessionCount === 0
      ? ''
      : ` ${String(salvagedAuditSessionCount)} deep-audit session${salvagedAuditSessionCount === 1 ? '' : 's'} preserved accepted work after reaching the turn limit.`;
  return `Agentic SAST reviewed ${String(consideredCount)} planned ${fileLabel} during research. ${triageClause}${salvagedClause} The scan continued with reduced static-analysis coverage.`;
}

/** Build the durable partial reason for one Capella reduction. Export keeps bounded omission detail. */
export function partialReasonFromReduction(reduction: AgenticSastReduction): PartialReason {
  const { reason, ...details } = reduction;
  return {
    code: 'agentic_sast_reduced',
    ...details,
    reductionReason: reason,
  };
}

function renderAgenticSastReduction(consideredCount: number, omissions: readonly AgenticSastOmission[]): string {
  const findingLabel = consideredCount === 1 ? 'finding' : 'findings';
  if (omissions.length === 1) {
    const omission = omissions[0];
    if (omission === undefined) return PARTIAL_REASON_SAFE_MESSAGES.agentic_sast_reduced;
    const name = omission.displayName === undefined ? '.' : `: ${omission.displayName}.`;
    return `Agentic SAST reviewed ${String(consideredCount)} ${findingLabel}. One was left out during export because ${renderSingleOmissionReason(omission.reason)}${name}`;
  }

  const reasonCounts = new Map<AgenticSastOmissionReason, number>();
  for (const omission of omissions) {
    reasonCounts.set(omission.reason, (reasonCounts.get(omission.reason) ?? 0) + 1);
  }

  const reasonText = renderOmissionReasonCounts(reasonCounts);
  const names = omissions.flatMap((omission) => (omission.displayName === undefined ? [] : [omission.displayName]));
  const displayedNames = names.slice(0, 3);
  const remainingNameCount = names.length - displayedNames.length;
  const namedSuffix =
    displayedNames.length === 0
      ? ''
      : ` Omitted ${displayedNames.length === 1 ? 'finding' : 'findings'}: ${displayedNames.join('; ')}${remainingNameCount > 0 ? `; and ${String(remainingNameCount)} more` : ''}.`;

  return `Agentic SAST reviewed ${String(consideredCount)} ${findingLabel}. ${String(omissions.length)} were left out during export. ${reasonText}.${namedSuffix}`;
}

function renderSingleOmissionReason(reason: AgenticSastOmissionReason): string {
  const messages: Readonly<Record<AgenticSastOmissionReason, string>> = {
    invalid_finding_record: 'its finding record was invalid',
    missing_code_path: 'it did not include a code location',
    invalid_code_path: 'its code location was invalid',
  };
  return messages[reason];
}

function renderOmissionReasonCounts(counts: ReadonlyMap<AgenticSastOmissionReason, number>): string {
  const clauses: string[] = [];
  const labels: Readonly<Record<AgenticSastOmissionReason, readonly [string, string]>> = {
    invalid_finding_record: ['had an invalid finding record', 'had invalid finding records'],
    missing_code_path: ['did not include a code location', 'did not include code locations'],
    invalid_code_path: ['had an invalid code location', 'had invalid code locations'],
  };
  for (const reason of AGENTIC_SAST_OMISSION_REASONS) {
    const count = counts.get(reason) ?? 0;
    if (count === 0) continue;
    clauses.push(`${String(count)} ${labels[reason][count === 1 ? 0 : 1]}`);
  }
  if (clauses.length <= 1) return clauses[0] ?? 'their finding records were invalid';
  return `${clauses.slice(0, -1).join(', ')} and ${clauses.at(-1)}`;
}

/** Project durable reasons into display records using the one safe-message map. */
export function projectPartialReasons(reasons: readonly PartialReason[]): readonly PartialReasonView[] {
  return reasons.map((reason) => ({ ...reason, message: safeMessageFor(reason) }));
}

// === Report progress ===

export type ReportSarifDisposition = 'committed' | 'absent' | 'render_failed';

const REPORT_SARIF_DISPOSITIONS: readonly ReportSarifDisposition[] = Object.freeze([
  'committed',
  'absent',
  'render_failed',
]);

/**
 * Durable record of the last verified PDF publication. Structurally identical to the
 * renderer's `PdfProvenance`; kept dependency-free here so durable-state validation
 * never imports service code.
 */
export interface StoredPdfProvenance {
  readonly pdf_sha256: string;
  readonly canonical_report_sha256: string;
  readonly renderer_version: string;
  readonly template_version: string;
}

/** Validate the closed replaceable provenance record stored beside the finalized report. */
export function isStoredPdfProvenance(value: unknown): value is StoredPdfProvenance {
  if (!isRecord(value)) return false;
  return (
    hasExactKeys(value, ['pdf_sha256', 'canonical_report_sha256', 'renderer_version', 'template_version']) &&
    isSha256(value.pdf_sha256) &&
    isSha256(value.canonical_report_sha256) &&
    typeof value.renderer_version === 'string' &&
    value.renderer_version.length > 0 &&
    typeof value.template_version === 'string' &&
    value.template_version.length > 0
  );
}

export type ReportProgress =
  | {
      readonly stage: 'pending';
      readonly renumber_failed_classes: readonly ReconciliationClass[];
      readonly partial_reasons: readonly PartialReason[];
    }
  | {
      readonly stage: 'draft';
      readonly renumber_failed_classes: readonly ReconciliationClass[];
      readonly partial_reasons: readonly PartialReason[];
      readonly model_checkpoint: string;
      readonly canonical_checkpoint?: string;
    }
  | {
      readonly stage: 'finalized';
      readonly renumber_failed_classes: readonly ReconciliationClass[];
      readonly partial_reasons: readonly PartialReason[];
      readonly model_checkpoint: string;
      readonly canonical_checkpoint: string;
      readonly final_checkpoint: string;
      readonly finalization_manifest_sha256: string;
      readonly sarif_disposition: ReportSarifDisposition;
      /** Replaceable after finalization; excluded from the match-or-conflict comparison. */
      readonly pdf_provenance?: StoredPdfProvenance;
    };

/**
 * True once the report agent has committed a draft. From that point report.json is fixed at the
 * model checkpoint, so nothing the pentest phase could still produce can reach the deliverable:
 * a resumed run that re-ran that phase would only spend money and observe degradation reasons the
 * committed draft can never carry.
 */
export function reportIsAuthored(stage: ReportProgress['stage'] | undefined): boolean {
  return stage === 'draft' || stage === 'finalized';
}

export interface DurableScanState {
  readonly schema_version: typeof DURABLE_SCAN_STATE_SCHEMA_VERSION;
  readonly exploit: boolean;
  readonly participating_classes: readonly ReconciliationClass[];
  readonly expected_agents: readonly AgentName[];
  readonly miscellaneous_outcome?: MiscellaneousOutcome;
  readonly report?: ReportProgress;
}

export type RunStateFailureType = 'IncompatibleWorkspaceError' | 'CorruptedSessionError' | 'DurableStateConflictError';

/** One wording per durable-state refusal, shared by every layer that can refuse first. */
export const SAFE_RUN_STATE_MESSAGES: Readonly<Record<RunStateFailureType, string>> = Object.freeze({
  IncompatibleWorkspaceError: 'This workspace was created by a different version of Shannon and cannot be resumed.',
  CorruptedSessionError: "This workspace's scan state is missing or damaged, so it cannot be resumed.",
  DurableStateConflictError:
    "This workspace's saved progress does not match what the scan is trying to record. Start a new scan with a different -w name.",
});

/**
 * Resume refusal for a changed `exploit` setting. The sentence names the value the workspace
 * actually stores, which is one of two literals — never a value read back from free text.
 */
export function workspaceExploitMismatchMessage(storedExploit: boolean): string {
  const storedValue = storedExploit ? 'true' : 'false';
  return `This workspace was created with exploit set to "${storedValue}". A resume must use the same setting. Change the config back, or start a new scan with a different -w name.`;
}

export class RunStateError extends Error {
  readonly failureType: RunStateFailureType;
  readonly checkCode: string;

  constructor(failureType: RunStateFailureType, checkCode: string) {
    super(SAFE_RUN_STATE_MESSAGES[failureType]);
    this.name = 'RunStateError';
    this.failureType = failureType;
    this.checkCode = checkCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value).sort();
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && keys.every((key) => allowed.has(key));
}

function isCommitHash(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/.test(value);
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function isFixedAnalysisScope(value: unknown): value is readonly VulnClass[] {
  return Array.isArray(value) && arraysEqual(value, FIXED_ANALYSIS_CLASSES);
}

function isParticipatingClassSet(value: unknown): value is readonly ReconciliationClass[] {
  if (!Array.isArray(value)) return false;
  if (arraysEqual(value, FIXED_ANALYSIS_CLASSES)) return true;
  return arraysEqual(value, [...FIXED_ANALYSIS_CLASSES, 'miscellaneous']);
}

function expectedAgentsFor(exploit: boolean): AgentName[] {
  const expected: AgentName[] = ['pre-recon', 'recon'];
  for (const vulnerabilityClass of FIXED_ANALYSIS_CLASSES) {
    expected.push(`${vulnerabilityClass}-vuln` as AgentName);
  }
  if (exploit) {
    for (const vulnerabilityClass of FIXED_ANALYSIS_CLASSES) {
      expected.push(`${vulnerabilityClass}-exploit` as AgentName);
    }
  }
  expected.push('report');
  return expected;
}

function isExpectedAgentSet(value: unknown, exploit: boolean): value is readonly AgentName[] {
  if (!Array.isArray(value) || value.some((agent) => typeof agent !== 'string')) return false;
  const initial = expectedAgentsFor(exploit);
  return arraysEqual(value, initial) || arraysEqual(value, [...initial, 'miscellaneous-exploit']);
}

function isOrderedClassSubset(
  value: unknown,
  participatingClasses: readonly ReconciliationClass[],
): value is readonly ReconciliationClass[] {
  if (!Array.isArray(value)) return false;
  let previousIndex = -1;
  for (const vulnerabilityClass of value) {
    const currentIndex = participatingClasses.indexOf(vulnerabilityClass as ReconciliationClass);
    if (currentIndex <= previousIndex) return false;
    previousIndex = currentIndex;
  }
  return true;
}

/**
 * Every renumber-failed class must also carry its durable `report_renumber_failed` reason,
 * so the failed-class set and the reason set cannot silently disagree.
 */
function renumberFailuresHaveReasons(
  failedClasses: readonly ReconciliationClass[],
  reasons: readonly PartialReason[],
): boolean {
  return failedClasses.every((vulnerabilityClass) =>
    reasons.some(
      (reason) => reason.code === 'report_renumber_failed' && reason.vulnerabilityClass === vulnerabilityClass,
    ),
  );
}

/** Validate the closed pending/draft/finalized report state. */
export function isReportProgress(
  value: unknown,
  participatingClasses: readonly ReconciliationClass[],
): value is ReportProgress {
  if (!isRecord(value) || typeof value.stage !== 'string') return false;
  if (!isOrderedClassSubset(value.renumber_failed_classes, participatingClasses)) return false;
  if (!isOrderedPartialReasonSet(value.partial_reasons)) return false;
  if (!renumberFailuresHaveReasons(value.renumber_failed_classes, value.partial_reasons)) return false;

  if (value.stage === 'pending') {
    return hasExactKeys(value, ['stage', 'renumber_failed_classes', 'partial_reasons']);
  }
  if (value.stage === 'draft') {
    return (
      hasExactKeys(
        value,
        ['stage', 'renumber_failed_classes', 'partial_reasons', 'model_checkpoint'],
        ['canonical_checkpoint'],
      ) &&
      isCommitHash(value.model_checkpoint) &&
      (value.canonical_checkpoint === undefined || isCommitHash(value.canonical_checkpoint))
    );
  }
  if (value.stage === 'finalized') {
    const sarifDisposition = value.sarif_disposition;
    const sarifReasonRecorded = value.partial_reasons.some((reason) => reason.code === 'report_sarif_failed');
    return (
      hasExactKeys(
        value,
        [
          'stage',
          'renumber_failed_classes',
          'partial_reasons',
          'model_checkpoint',
          'canonical_checkpoint',
          'final_checkpoint',
          'finalization_manifest_sha256',
          'sarif_disposition',
        ],
        ['pdf_provenance'],
      ) &&
      isCommitHash(value.model_checkpoint) &&
      isCommitHash(value.canonical_checkpoint) &&
      isCommitHash(value.final_checkpoint) &&
      isSha256(value.finalization_manifest_sha256) &&
      (REPORT_SARIF_DISPOSITIONS as readonly unknown[]).includes(sarifDisposition) &&
      // The render_failed disposition and the report_sarif_failed reason are two sides of one
      // fact, so a finalized record with one but not the other is malformed. committed and
      // absent never carry the reason.
      sarifReasonRecorded === (sarifDisposition === 'render_failed') &&
      (value.pdf_provenance === undefined || isStoredPdfProvenance(value.pdf_provenance))
    );
  }
  return false;
}

/** Validate the closed schema-1 scan state and every cross-field invariant. */
export function isDurableScanState(value: unknown): value is DurableScanState {
  if (!isRecord(value)) return false;
  if (
    !hasExactKeys(
      value,
      ['schema_version', 'exploit', 'participating_classes', 'expected_agents'],
      ['miscellaneous_outcome', 'report'],
    ) ||
    value.schema_version !== DURABLE_SCAN_STATE_SCHEMA_VERSION ||
    typeof value.exploit !== 'boolean' ||
    !isParticipatingClassSet(value.participating_classes) ||
    !isExpectedAgentSet(value.expected_agents, value.exploit)
  ) {
    return false;
  }

  // The miscellaneous class's participation, its recorded outcome, and its exploit agent's
  // presence in expected_agents are three separate fields that must always imply each other.
  // A hand-edited or corrupted state file could set them inconsistently, so every direction of
  // that implication is checked explicitly below rather than trusting one field to infer another.
  const hasMiscellaneousClass = value.participating_classes.includes('miscellaneous');
  const hasMiscellaneousAgent = value.expected_agents.includes('miscellaneous-exploit');
  const outcome = value.miscellaneous_outcome;
  if (
    typeof outcome === 'string' &&
    !['not_actionable', 'exploitation_disabled', 'expected', 'completed'].includes(outcome)
  ) {
    return false;
  }
  if (outcome !== undefined && typeof outcome !== 'string') return false;
  // An outcome can only exist once the class has been admitted, and an admitted class must
  // eventually record one.
  if (outcome !== undefined && !hasMiscellaneousClass) return false;
  if (hasMiscellaneousClass && outcome === undefined) return false;
  // Only the two outcomes that follow from running the exploit agent may coexist with exploit
  // being enabled and the agent being expected.
  if ((outcome === 'expected' || outcome === 'completed') && (!value.exploit || !hasMiscellaneousAgent)) return false;
  if ((outcome === 'not_actionable' || outcome === 'exploitation_disabled') && hasMiscellaneousAgent) return false;
  if (outcome === 'exploitation_disabled' && value.exploit) return false;
  if (hasMiscellaneousAgent && outcome !== 'expected' && outcome !== 'completed') return false;

  return value.report === undefined || isReportProgress(value.report, value.participating_classes);
}

/** Create the byte-stable initial state written before the first required agent command. */
export function createInitialDurableScanState(exploit: boolean): DurableScanState {
  return {
    schema_version: DURABLE_SCAN_STATE_SCHEMA_VERSION,
    exploit,
    participating_classes: [...FIXED_ANALYSIS_CLASSES],
    expected_agents: expectedAgentsFor(exploit),
  };
}

/** Add the analysis-less class without changing any admitted agent. */
export function admitMiscellaneousParticipation(state: DurableScanState): DurableScanState {
  if (state.participating_classes.includes('miscellaneous')) return state;
  return { ...state, participating_classes: [...state.participating_classes, 'miscellaneous'] };
}

/**
 * The outcomes that settle the `miscellaneous` class for good: its exploit agent finished, or the
 * class was never actionable in the first place. A resumed run consults this before the lane runs
 * again, since re-deciding admission from scratch would contradict what durable state already
 * records and would rerun work a previous run already paid for.
 */
export function miscellaneousLaneIsSettled(outcome: MiscellaneousOutcome | undefined): boolean {
  return outcome === 'completed' || outcome === 'not_actionable' || outcome === 'exploitation_disabled';
}

/** Persist a `miscellaneous` queue outcome; expected admission is append-only and idempotent. */
export function recordMiscellaneousOutcome(state: DurableScanState, outcome: MiscellaneousOutcome): DurableScanState {
  const current = state.miscellaneous_outcome;
  // Re-recording the outcome already stored is the same fact twice, which a resumed run and a
  // lost-acknowledgement re-drive both reach routinely. Participation was admitted alongside it,
  // so nothing about the record moves.
  if (current === outcome) return state;
  // The one recognized forward transition: the class was queued for exploitation and its agent has
  // now finished. It leaves participating_classes and expected_agents exactly as they were, so
  // nothing a report already read changes and the promotion stays legal after reporting starts.
  if (current === 'expected' && outcome === 'completed') {
    return { ...state, miscellaneous_outcome: 'completed' };
  }
  // Every remaining pair moves backwards or sideways: re-admitting 'expected' over 'completed',
  // or re-recording 'not_actionable' after 'expected' already admitted the agent.
  if (current !== undefined) {
    throw new RunStateError('DurableStateConflictError', 'miscellaneous-outcome-transition-conflict');
  }
  // A first admission adds `miscellaneous` to participating_classes, and for an actionable queue
  // its agent to expected_agents. Once report progress exists the report has already read both, so
  // admitting now would leave durable state disagreeing with a report that may be on disk.
  if (state.report !== undefined) {
    throw new RunStateError('DurableStateConflictError', 'miscellaneous-outcome-after-report-start');
  }

  const withMiscellaneous = admitMiscellaneousParticipation(state);
  if (outcome === 'expected') {
    if (!withMiscellaneous.exploit) {
      throw new RunStateError('DurableStateConflictError', 'miscellaneous-exploit-disabled');
    }
    return {
      ...withMiscellaneous,
      expected_agents: [...withMiscellaneous.expected_agents, 'miscellaneous-exploit'],
      miscellaneous_outcome: outcome,
    };
  }
  if (outcome === 'completed') {
    throw new RunStateError('DurableStateConflictError', 'miscellaneous-completed-before-admission');
  }
  if (outcome === 'exploitation_disabled' && withMiscellaneous.exploit) {
    throw new RunStateError('DurableStateConflictError', 'miscellaneous-disabled-outcome-on-exploit-run');
  }
  return { ...withMiscellaneous, miscellaneous_outcome: outcome };
}

/** Return the exact expected-agent order for direct initialization verification. */
export function initialExpectedAgents(exploit: boolean): readonly AgentName[] {
  return expectedAgentsFor(exploit);
}

/** Assert that an externally supplied analysis scope is the fixed five-class scope. */
export function assertFixedAnalysisScope(value: readonly VulnClass[]): void {
  if (!isFixedAnalysisScope(value)) {
    throw new RunStateError('IncompatibleWorkspaceError', 'analysis-scope-not-fixed-five');
  }
}
