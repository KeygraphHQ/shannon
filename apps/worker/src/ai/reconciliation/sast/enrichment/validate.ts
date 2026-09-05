/** Validate, pair, and positively project one enrichment response. */

import type { ReconciliationClass } from '../../../../types/reconciliation.js';
import { normalizeConfidence } from '../cwe-mapper.js';
import type { ClassifiedFinding, Confidence } from '../types.js';
import { sastEnrichmentFieldNames } from './schema.js';

export class EnrichmentAttemptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichmentAttemptError';
  }
}

export interface PairedVulnerability {
  finding: ClassifiedFinding;
  sastId: number;
  evidence: Record<string, unknown>;
}

export interface ValidationCounts {
  returned: number;
  malformed: number;
  orphaned: number;
  duplicate_sast_id: number;
}

export interface ValidationResult {
  paired: PairedVulnerability[];
  counts: ValidationCounts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeEnrichedConfidence(value: string): Confidence | undefined {
  const normalized = value.trim().toLowerCase();
  return normalizeConfidence(normalized === 'moderate' ? 'medium' : normalized);
}

/** Require the exact closed `{ vulnerabilities: [...] }` response envelope. */
export function extractVulnerabilities(toolArguments: unknown): unknown[] {
  if (!isRecord(toolArguments) || !Array.isArray(toolArguments.vulnerabilities)) {
    throw new EnrichmentAttemptError('submit_result did not return a vulnerabilities array');
  }
  if (Object.keys(toolArguments).length !== 1 || !Object.hasOwn(toolArguments, 'vulnerabilities')) {
    throw new EnrichmentAttemptError('submit_result returned unexpected envelope fields');
  }
  return toolArguments.vulnerabilities;
}

function toRequiredString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return undefined;
}

function toBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return undefined;
}

function toSastId(value: unknown): number | undefined {
  let parsed: number;
  if (typeof value === 'number') {
    parsed = value;
  } else if (typeof value === 'string' && value.trim().length > 0) {
    parsed = Number(value.trim());
  } else {
    return undefined;
  }
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

interface CoercedCommonFields {
  element: Record<string, unknown>;
  confidenceRaw: string;
  sastId: number | undefined;
}

function coerceCommonFields(element: Record<string, unknown>): CoercedCommonFields | undefined {
  const id = toRequiredString(element.ID);
  const vulnerabilityType = toRequiredString(element.vulnerability_type);
  const externallyExploitable = toBoolean(element.externally_exploitable);
  const notes = toRequiredString(element.notes);
  const confidencePresent = element.confidence !== undefined && element.confidence !== null;
  if (
    id === undefined ||
    vulnerabilityType === undefined ||
    externallyExploitable === undefined ||
    notes === undefined ||
    !confidencePresent
  ) {
    return undefined;
  }

  // Confidence is present but not a scalar (an object or array). Carry a sentinel that no confidence
  // vocabulary can normalize, so the caller rejects the whole response rather than guessing a value.
  const scalarConfidence = toRequiredString(element.confidence);
  const confidenceRaw = scalarConfidence ?? '[non-scalar]';
  const sastId = toSastId(element._sastId);
  return {
    element: {
      ...element,
      ID: id,
      vulnerability_type: vulnerabilityType,
      externally_exploitable: externallyExploitable,
      confidence: confidenceRaw,
      notes,
      ...(sastId !== undefined && { _sastId: sastId }),
    },
    confidenceRaw,
    sastId,
  };
}

function coerceEvidenceValue(key: string, value: unknown): unknown {
  if (key === 'externally_exploitable') return value;
  return toRequiredString(value) ?? JSON.stringify(value);
}

function buildEvidence(
  element: Record<string, unknown>,
  vulnerabilityClass: ReconciliationClass,
  confidence: Confidence,
): Record<string, unknown> {
  const evidence: Record<string, unknown> = {};
  for (const key of sastEnrichmentFieldNames(vulnerabilityClass)) {
    if (key === 'ID' || key === '_sastId' || key === 'confidence') continue;
    const value = element[key];
    if (value !== null && value !== undefined) evidence[key] = coerceEvidenceValue(key, value);
  }
  evidence.confidence = confidence;
  return evidence;
}

// The model's own `ID` field (a free-text string it invents) is carried through as evidence but is
// never trusted for identity: only `_sastId`, the small integer the code itself assigned before the
// request, is looked up in `findingsById`. A model cannot forge or guess its way into pairing with a
// finding it was not actually sent, since `_sastId` values outside the sent batch simply have no entry.
/** Pair by code-assigned `_sastId`; never by response order or model-supplied ID. */
export function pairEnrichedVulnerabilities(
  returned: readonly unknown[],
  findingsById: ReadonlyMap<number, ClassifiedFinding>,
  vulnerabilityClass: ReconciliationClass,
): ValidationResult {
  const paired: PairedVulnerability[] = [];
  const consumed = new Set<number>();
  let malformed = 0;
  let orphaned = 0;
  let duplicate = 0;
  const allowedFields = new Set(sastEnrichmentFieldNames(vulnerabilityClass));

  for (const value of returned) {
    if (!isRecord(value)) {
      malformed++;
      continue;
    }
    if (Object.keys(value).some((key) => !allowedFields.has(key))) {
      malformed++;
      continue;
    }
    const common = coerceCommonFields(value);
    if (common === undefined) {
      malformed++;
      continue;
    }
    const confidence = normalizeEnrichedConfidence(common.confidenceRaw);
    if (confidence === undefined) {
      throw new EnrichmentAttemptError('Response has an unrecognized confidence value');
    }
    const sastId = common.sastId;
    const finding = sastId === undefined ? undefined : findingsById.get(sastId);
    if (sastId === undefined || finding === undefined) {
      orphaned++;
      continue;
    }
    if (consumed.has(sastId)) {
      duplicate++;
      continue;
    }
    consumed.add(sastId);
    paired.push({
      finding,
      sastId,
      evidence: buildEvidence(common.element, vulnerabilityClass, confidence),
    });
  }

  return {
    paired,
    counts: {
      returned: returned.length,
      malformed,
      orphaned,
      duplicate_sast_id: duplicate,
    },
  };
}
