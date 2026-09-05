// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AgenticSastReduction } from '../types.js';
import { SastContractError } from './errors.js';
import {
  CAPELLA_ATTACKER_POSITIONS,
  CAPELLA_PRIVILEGES,
  CAPELLA_REPRO_STATUSES,
  CAPELLA_SEVERITIES,
  CAPELLA_STATUSES,
  CAPELLA_USER_INTERACTIONS,
  CAPELLA_VIABILITIES,
  type CapellaFinding,
} from './finding-types.js';
import { isNormalizedRepositoryPath } from './paths.js';
import type { KbResult, PlanResult, ThreatModelResult, TriageResult } from './schemas.js';
import type {
  ArchitectureValue,
  CalibrateValue,
  ConfirmValue,
  CriticValue,
  DedupeValue,
  ExportValue,
  PlanValue,
  ResearchValue,
  ReviewValue,
  ThreatModelValue,
} from './types.js';

const CWE_PATTERN = /^CWE-\d+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => isNonEmptyString(entry));
}

function isEnum<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** Validate the stage-to-stage finding record before it is reused or exported. */
export function isCapellaFinding(value: unknown): value is CapellaFinding {
  if (!isRecord(value)) return false;
  // Mirrors the collector's finding-id sanitizer: the id names findings/<id>.json,
  // so a separator or traversal here would escape the findings directory.
  if (!isNonEmptyString(value.id) || value.id.includes('/') || value.id.includes('\\') || value.id.includes('..')) {
    return false;
  }
  if (!isNonEmptyString(value.title) || !isNonEmptyString(value.description)) return false;
  if (!isStringArray(value.code_paths)) return false;
  if (!isNonEmptyString(value.impact) || !isNonEmptyString(value.mitigation)) return false;
  if (!isEnum(value.severity, CAPELLA_SEVERITIES)) return false;
  if (!isEnum(value.privileges_required, CAPELLA_PRIVILEGES)) return false;
  if (!isEnum(value.attacker_position, CAPELLA_ATTACKER_POSITIONS)) return false;
  if (!isEnum(value.user_interaction, CAPELLA_USER_INTERACTIONS)) return false;
  if (!isNonEmptyString(value.cwe) || !CWE_PATTERN.test(value.cwe)) return false;
  if (!isEnum(value.status, CAPELLA_STATUSES)) return false;
  if (!Array.isArray(value.history) || !value.history.every(isRecord)) return false;
  if (typeof value.recordedAt !== 'number' || !Number.isFinite(value.recordedAt)) return false;
  if (value.production_viability !== undefined && !isEnum(value.production_viability, CAPELLA_VIABILITIES))
    return false;
  if (value.repro_status !== undefined && !isEnum(value.repro_status, CAPELLA_REPRO_STATUSES)) return false;
  return true;
}

export function isFindingSetValue(value: unknown): value is { findings: CapellaFinding[] } {
  return isRecord(value) && Array.isArray(value.findings) && value.findings.every(isCapellaFinding);
}

export function isRawFindingSetValue(value: unknown): value is { findings: unknown[] } {
  return isRecord(value) && Array.isArray(value.findings);
}

export function assertFindingSet(value: unknown, source: string): asserts value is { findings: CapellaFinding[] } {
  if (!isFindingSetValue(value)) {
    throw new SastContractError(`${source} is not a valid Capella finding set`, 'FINDING_SET_SCHEMA');
  }
}

export interface VerdictSetDetails {
  readonly expectedCount: number;
  readonly receivedCount: number;
  readonly missingIds: readonly string[];
  readonly duplicateIds: readonly string[];
  readonly unexpectedIds: readonly string[];
}

/** Calculate exact-set completeness without mutating findings or throwing. */
export function calculateVerdictSetDetails(
  expectedIds: readonly string[],
  recordedIds: readonly string[],
): VerdictSetDetails {
  const expected = [...expectedIds].sort();
  const recorded = [...recordedIds].sort();
  const expectedSet = new Set(expected);
  const recordedSet = new Set(recorded);
  return {
    expectedCount: expected.length,
    receivedCount: recorded.length,
    missingIds: [...new Set(expected.filter((id) => !recordedSet.has(id)))],
    duplicateIds: [...new Set(recorded.filter((id, index) => index > 0 && id === recorded[index - 1]))],
    unexpectedIds: [...new Set(recorded.filter((id) => !expectedSet.has(id)))],
  };
}

export function isKbEntity(value: unknown): value is KbResult['entities'][number] {
  return isRecord(value) && isNonEmptyString(value.name) && isNonEmptyString(value.content);
}

export interface SalvagedKbResult {
  readonly value: KbResult;
  readonly consideredEntityCount: number;
  readonly omittedEntityCount: number;
  readonly consideredDependencyCount: number;
  readonly omittedDependencyCount: number;
}

/** Keep a valid KB core while dropping malformed entities and dependency edges. */
export function salvageKbResult(value: unknown): SalvagedKbResult | undefined {
  if (!isRecord(value)) return undefined;
  if (!isNonEmptyString(value.architecture) || !isNonEmptyString(value.index)) return undefined;
  if (!Array.isArray(value.entities) || !Array.isArray(value.vulnerabilities) || !isRecord(value.dependencies)) {
    return undefined;
  }

  const rawEntities = [...value.entities, ...value.vulnerabilities];
  const entities = value.entities.filter(isKbEntity);
  const vulnerabilities = value.vulnerabilities.filter(isKbEntity);
  const dependencyEntries = Object.entries(value.dependencies);
  const dependencies = Object.fromEntries(dependencyEntries.filter(([, targets]) => isStringArray(targets))) as Record<
    string,
    string[]
  >;
  return {
    value: {
      architecture: value.architecture,
      entities,
      vulnerabilities,
      index: value.index,
      dependencies,
    },
    consideredEntityCount: rawEntities.length,
    omittedEntityCount: rawEntities.length - entities.length - vulnerabilities.length,
    consideredDependencyCount: dependencyEntries.length,
    omittedDependencyCount: dependencyEntries.length - Object.keys(dependencies).length,
  };
}

export function isKbResult(value: unknown): value is KbResult {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.architecture) || !isNonEmptyString(value.index)) return false;
  if (!Array.isArray(value.entities) || !value.entities.every(isKbEntity)) return false;
  if (!Array.isArray(value.vulnerabilities) || !value.vulnerabilities.every(isKbEntity)) return false;
  if (!isRecord(value.dependencies)) return false;
  return Object.values(value.dependencies).every(isStringArray);
}

export function isArchitectureValue(value: unknown): value is ArchitectureValue {
  return (
    isRecord(value) &&
    isKbResult(value.knowledgeBase) &&
    Number.isSafeInteger(value.componentCount) &&
    (value.reduction === undefined ||
      (isAgenticSastReduction(value.reduction) &&
        value.reduction.stage === 'architecture' &&
        value.reduction.reason === 'invalid_architecture_items'))
  );
}

export function isThreatModelResult(value: unknown): value is ThreatModelResult {
  return (
    isRecord(value) &&
    isNonEmptyString(value.threatModel) &&
    (value.intent === 'PRODUCTION' || value.intent === 'SAMPLE_OR_TEST_ONLY')
  );
}

export function isThreatModelValue(value: unknown): value is ThreatModelValue {
  if (!isThreatModelResult(value)) return false;
  const record = value as ThreatModelResult & Record<string, unknown>;
  return isNonEmptyString(record.threatModelPath);
}

export function isInvestigation(value: unknown): value is PlanResult['investigations'][number] {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.title) &&
    isStringArray(value.target_files) &&
    value.target_files.every(isNormalizedRepositoryPath) &&
    Array.isArray(value.kb_references) &&
    value.kb_references.every((entry) => typeof entry === 'string') &&
    isNonEmptyString(value.question)
  );
}

export interface SalvagedPlanResult {
  readonly value: PlanResult;
  readonly consideredCount: number;
  readonly omittedCount: number;
}

/** Keep usable investigations while preserving root invalidity as an atomic failure. */
export function salvagePlanResult(value: unknown): SalvagedPlanResult | undefined {
  if (!isRecord(value) || !Array.isArray(value.investigations)) return undefined;
  const investigations = value.investigations.filter(isInvestigation);
  return {
    value: { investigations },
    consideredCount: value.investigations.length,
    omittedCount: value.investigations.length - investigations.length,
  };
}

export function isPlanResult(value: unknown): value is PlanResult {
  const salvaged = salvagePlanResult(value);
  return salvaged !== undefined && salvaged.omittedCount === 0;
}

export function isPlanValue(value: unknown): value is PlanValue {
  if (!isPlanResult(value)) return false;
  const record = value as PlanResult & Record<string, unknown>;
  const reduction = record.reduction;
  return (
    value.investigations.length > 0 &&
    record.investigationCount === value.investigations.length &&
    (reduction === undefined ||
      (isAgenticSastReduction(reduction) &&
        reduction.stage === 'plan' &&
        reduction.reason === 'invalid_investigations' &&
        reduction.usableCount === value.investigations.length))
  );
}

export function isTriageResult(value: unknown): value is TriageResult {
  return (
    isRecord(value) &&
    Array.isArray(value.classifications) &&
    value.classifications.every(
      (classification) =>
        isRecord(classification) &&
        isNormalizedRepositoryPath(String(classification.file)) &&
        typeof classification.potentially_flawed === 'boolean' &&
        typeof classification.reason === 'string',
    )
  );
}

function hasInteger(value: Record<string, unknown>, key: string): boolean {
  return Number.isSafeInteger(value[key]) && Number(value[key]) >= 0;
}

function isResearchCoverage(value: unknown): value is ResearchValue['triageCoverage'] {
  if (!isRecord(value)) return false;
  if (
    !hasInteger(value, 'consideredCount') ||
    !hasInteger(value, 'classifiedCount') ||
    !hasInteger(value, 'omittedCount') ||
    !hasInteger(value, 'affectedBatchCount')
  ) {
    return false;
  }
  if (Number(value.classifiedCount) + Number(value.omittedCount) !== Number(value.consideredCount)) return false;
  return (
    Array.isArray(value.missingFiles) &&
    value.missingFiles.every((file) => typeof file === 'string' && isNormalizedRepositoryPath(file)) &&
    value.missingFiles.length === Number(value.omittedCount)
  );
}

function isResearchAuditCoverage(value: unknown): value is ResearchValue['auditCoverage'] {
  if (!isRecord(value)) return false;
  if (
    !hasInteger(value, 'consideredCount') ||
    !hasInteger(value, 'completedCount') ||
    !hasInteger(value, 'salvagedSessionCount')
  ) {
    return false;
  }
  return Number(value.completedCount) === Number(value.consideredCount);
}

export function isResearchValue(value: unknown): value is ResearchValue {
  if (!isFindingSetValue(value)) return false;
  const record = value as { findings: CapellaFinding[] } & Record<string, unknown>;
  const reduction = record.reduction;
  const triageCoverage = record.triageCoverage;
  const auditCoverage = record.auditCoverage;
  const coverageIsValid = isResearchCoverage(triageCoverage) && isResearchAuditCoverage(auditCoverage);
  const reductionMatches =
    reduction === undefined ||
    (coverageIsValid &&
      isAgenticSastReduction(reduction) &&
      reduction.stage === 'research' &&
      reduction.reason === 'incomplete_research' &&
      reduction.triageConsideredCount === triageCoverage.consideredCount &&
      reduction.triageClassifiedCount === triageCoverage.classifiedCount &&
      reduction.triageOmittedCount === triageCoverage.omittedCount &&
      reduction.affectedTriageBatchCount === triageCoverage.affectedBatchCount &&
      reduction.auditUnitCount === auditCoverage.consideredCount &&
      reduction.salvagedAuditSessionCount === auditCoverage.salvagedSessionCount);
  return (
    Array.isArray(record.flaggedFiles) &&
    record.flaggedFiles.every((file) => typeof file === 'string' && isNormalizedRepositoryPath(file)) &&
    hasInteger(record, 'dispatchedCount') &&
    hasInteger(record, 'resumedCount') &&
    (record.coverage === 'complete' || record.coverage === 'reduced') &&
    coverageIsValid &&
    reductionMatches &&
    (record.coverage === 'reduced') === (reduction !== undefined)
  );
}

function hasValidOptionalReduction(
  value: unknown,
  stage: AgenticSastReduction['stage'],
  reason: AgenticSastReduction['reason'],
): boolean {
  const record = value as Record<string, unknown>;
  return (
    record.reduction === undefined ||
    (isAgenticSastReduction(record.reduction) && record.reduction.stage === stage && record.reduction.reason === reason)
  );
}

function hasPrivateVerdictDiagnostics(value: Record<string, unknown>): boolean {
  return hasInteger(value, 'rejectedUnexpectedCount') && hasInteger(value, 'rejectedDuplicateCount');
}

function hasMatchingVerdictReduction(
  value: Record<string, unknown>,
  stage: 'review' | 'critic' | 'confirm' | 'calibrate',
  reason: 'incomplete_review' | 'incomplete_critic' | 'incomplete_confirm' | 'incomplete_calibrate',
): boolean {
  if (!hasValidOptionalReduction(value, stage, reason)) return false;
  if (value.reduction === undefined) return true;
  const reduction = value.reduction;
  const reductionRecord = reduction as Record<string, unknown>;
  return (
    isAgenticSastReduction(reduction) &&
    reductionRecord.rejectedUnexpectedCount === value.rejectedUnexpectedCount &&
    reductionRecord.rejectedDuplicateCount === value.rejectedDuplicateCount
  );
}

export function isDedupeValue(value: unknown): value is DedupeValue {
  return (
    isFindingSetValue(value) &&
    hasInteger(value, 'duplicateCount') &&
    hasInteger(value, 'survivorCount') &&
    Number((value as Record<string, unknown>).survivorCount) === value.findings.length &&
    hasValidOptionalReduction(value, 'dedupe', 'incomplete_dedupe')
  );
}

export function isReviewValue(value: unknown): value is ReviewValue {
  return (
    isFindingSetValue(value) &&
    hasInteger(value, 'validCount') &&
    hasInteger(value, 'provisionalCount') &&
    hasInteger(value, 'falsePositiveCount') &&
    hasPrivateVerdictDiagnostics(value) &&
    hasMatchingVerdictReduction(value, 'review', 'incomplete_review')
  );
}

export function isCriticValue(value: unknown): value is CriticValue {
  return (
    isFindingSetValue(value) &&
    hasInteger(value, 'viableCount') &&
    hasPrivateVerdictDiagnostics(value) &&
    hasMatchingVerdictReduction(value, 'critic', 'incomplete_critic')
  );
}

export function isConfirmValue(value: unknown): value is ConfirmValue {
  return (
    isFindingSetValue(value) &&
    hasInteger(value, 'confirmedCount') &&
    hasPrivateVerdictDiagnostics(value) &&
    hasMatchingVerdictReduction(value, 'confirm', 'incomplete_confirm')
  );
}

export function isCalibrateValue(value: unknown): value is CalibrateValue {
  return (
    isFindingSetValue(value) &&
    hasInteger(value, 'calibratedCount') &&
    hasPrivateVerdictDiagnostics(value) &&
    hasMatchingVerdictReduction(value, 'calibrate', 'incomplete_calibrate')
  );
}

function isBoundedCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= 1_000_000;
}

// A reduction's shape is closed, not merely a superset check: every isAgenticSastReduction branch
// below calls this so a reduction cannot carry an extra field the schema does not name. Without it,
// something upstream could smuggle unbounded text or a path through a field this validator never
// inspects, since a subset check alone would not catch an addition.
function hasExactKeys(value: Record<string, unknown>, required: readonly string[]): boolean {
  return Object.keys(value).length === required.length && required.every((key) => key in value);
}

function hasBoundedCounts(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isBoundedCount(value[field]));
}

// 'export' is deliberately excluded: a failed export has no later stage to fall back to, so that
// failure is always the workflow's terminal outcome rather than something recoverable through
// the last-good-findings fallback path.
const FALLBACK_REDUCTION_STAGES = [
  'architecture',
  'threat-model',
  'plan',
  'research',
  'dedupe',
  'review',
  'critic',
  'confirm',
  'calibrate',
] as const;

/** Validate one reduction member. New members carry counts only; export keeps bounded omission detail. */
export function isAgenticSastReduction(value: unknown): value is AgenticSastReduction {
  if (!isRecord(value)) return false;
  if (value.reason === 'failed_stage_fallback') {
    return (
      (FALLBACK_REDUCTION_STAGES as readonly unknown[]).includes(value.stage) &&
      isBoundedCount(value.fallbackFindingCount) &&
      hasExactKeys(value, ['stage', 'reason', 'fallbackFindingCount'])
    );
  }
  if (value.stage === 'architecture') {
    return (
      value.reason === 'invalid_architecture_items' &&
      hasBoundedCounts(value, ['entityCount', 'omittedEntityCount', 'dependencyCount', 'omittedDependencyCount']) &&
      Number(value.omittedEntityCount) + Number(value.omittedDependencyCount) >= 1 &&
      Number(value.omittedEntityCount) <= Number(value.entityCount) &&
      Number(value.omittedDependencyCount) <= Number(value.dependencyCount) &&
      hasExactKeys(value, [
        'stage',
        'reason',
        'entityCount',
        'omittedEntityCount',
        'dependencyCount',
        'omittedDependencyCount',
      ])
    );
  }
  if (value.stage === 'plan') {
    return (
      value.reason === 'invalid_investigations' &&
      hasBoundedCounts(value, ['consideredCount', 'usableCount', 'omittedCount']) &&
      Number(value.omittedCount) >= 1 &&
      Number(value.usableCount) + Number(value.omittedCount) === Number(value.consideredCount) &&
      hasExactKeys(value, ['stage', 'reason', 'consideredCount', 'usableCount', 'omittedCount'])
    );
  }
  if (value.stage === 'export') {
    return (
      value.reason === 'malformed_findings' &&
      isBoundedCount(value.omittedCount) &&
      Number(value.omittedCount) >= 1 &&
      isBoundedCount(value.consideredCount) &&
      Number(value.consideredCount) >= Number(value.omittedCount) &&
      Array.isArray(value.omissions) &&
      value.omissions.length === Number(value.omittedCount) &&
      value.omissions.every(isAgenticSastOmission) &&
      hasExactKeys(value, ['stage', 'reason', 'omittedCount', 'consideredCount', 'omissions'])
    );
  }
  if (value.stage === 'research') {
    return (
      value.reason === 'incomplete_research' &&
      hasBoundedCounts(value, [
        'triageConsideredCount',
        'triageClassifiedCount',
        'triageOmittedCount',
        'affectedTriageBatchCount',
        'auditUnitCount',
        'salvagedAuditSessionCount',
      ]) &&
      Number(value.triageClassifiedCount) + Number(value.triageOmittedCount) === Number(value.triageConsideredCount) &&
      Number(value.triageOmittedCount) + Number(value.salvagedAuditSessionCount) >= 1 &&
      hasExactKeys(value, [
        'stage',
        'reason',
        'triageConsideredCount',
        'triageClassifiedCount',
        'triageOmittedCount',
        'affectedTriageBatchCount',
        'auditUnitCount',
        'salvagedAuditSessionCount',
      ])
    );
  }
  if (value.stage === 'dedupe') {
    return (
      value.reason === 'incomplete_dedupe' &&
      hasBoundedCounts(value, ['consideredCount', 'survivorCount', 'unreadableCount', 'salvagedTurnLimitCount']) &&
      Number(value.unreadableCount) + Number(value.salvagedTurnLimitCount) >= 1 &&
      Number(value.salvagedTurnLimitCount) <= 1 &&
      hasExactKeys(value, [
        'stage',
        'reason',
        'consideredCount',
        'survivorCount',
        'unreadableCount',
        'salvagedTurnLimitCount',
      ])
    );
  }
  if (['review', 'critic', 'confirm', 'calibrate'].includes(String(value.stage))) {
    const stage = value.stage as 'review' | 'critic' | 'confirm' | 'calibrate';
    const expectedReason = `incomplete_${stage}`;
    const countFields = [
      'consideredCount',
      'gradedCount',
      'missingCount',
      'unreadableCount',
      'rejectedUnexpectedCount',
      'rejectedDuplicateCount',
      'salvagedTurnLimitCount',
    ];
    if (
      value.reason !== expectedReason ||
      !hasBoundedCounts(value, countFields) ||
      Number(value.missingCount) > Number(value.consideredCount) ||
      Number(value.salvagedTurnLimitCount) > 2 ||
      Number(value.missingCount) + Number(value.unreadableCount) + Number(value.salvagedTurnLimitCount) < 1
    ) {
      return false;
    }
    if (stage === 'review') {
      return (
        isBoundedCount(value.quarantinedCount) &&
        Number(value.quarantinedCount) <= Number(value.missingCount) &&
        hasExactKeys(value, ['stage', 'reason', ...countFields, 'quarantinedCount'])
      );
    }
    return hasExactKeys(value, ['stage', 'reason', ...countFields]);
  }
  return false;
}

export function isExportValue(value: unknown): value is ExportValue {
  if (!isRecord(value) || !isRecord(value.sarif)) return false;
  const reduction = value.reduction;
  const reductionIsValid =
    reduction === undefined || (isAgenticSastReduction(reduction) && reduction.stage === 'export');
  return (
    isNonEmptyString(value.sarif.path) &&
    typeof value.sarif.sha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(value.sarif.sha256) &&
    hasInteger(value, 'findingCount') &&
    (value.coverage === 'complete' || value.coverage === 'reduced') &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => typeof warning === 'string') &&
    isNonEmptyString(value.reportPath) &&
    reductionIsValid
  );
}

function isAgenticSastOmission(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (
    typeof value.reason !== 'string' ||
    !['invalid_finding_record', 'missing_code_path', 'invalid_code_path'].includes(value.reason)
  ) {
    return false;
  }
  const allowedKeys = ['reason'];
  if (value.findingId !== undefined) {
    if (typeof value.findingId !== 'string' || !/^[a-z0-9-]{1,256}$/.test(value.findingId)) return false;
    allowedKeys.push('findingId');
  }
  if (value.displayName !== undefined) {
    if (
      typeof value.displayName !== 'string' ||
      value.displayName.length === 0 ||
      value.displayName.length > 160 ||
      containsControlCharacter(value.displayName)
    ) {
      return false;
    }
    allowedKeys.push('displayName');
  }
  return Object.keys(value).length === allowedKeys.length && allowedKeys.every((key) => key in value);
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
}
