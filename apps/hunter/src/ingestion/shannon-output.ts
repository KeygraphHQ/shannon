/**
 * Shannon output ingestion.
 *
 * Normalizes Shannon's `report.json` into `Observation` records the rest of
 * the pipeline understands. The shape validated here matches the actual
 * structured output Shannon 1.9.0's report agent writes — not a guessed or
 * simplified stand-in:
 *
 *   - Top level: `apps/worker/src/services/report-renderer.ts:ReportData`
 *     (`report_meta`, `findings`, optional `not_assessed`).
 *   - Per finding: `apps/worker/src/collectors/finding-collector.ts`'s
 *     `AddFindingSupersetSchema` (the TypeBox schema the report agent's
 *     `add_finding` tool validates against) — `finding_id`, `title`,
 *     `category`, `owasp_category`, `severity`, `vulnerable_location`,
 *     `overview`, `impact`, `remediation`, plus exploit-only fields
 *     (`auth_state`, `prerequisites`, `exploitation_steps`,
 *     `proof_of_impact`, `status`) that only exist when the scan ran with
 *     `exploit: true`, and an analysis-only field (`confidence`) that only
 *     exists when it did not. A finding never carries both.
 *
 * Ingestion never contacts Shannon or the target itself: it only reads a
 * `report.json` already produced by a completed scan (or a local fixture
 * standing in for one, or one captured by `shannon/execution-adapter.ts`
 * after a real, explicitly-confirmed live run).
 *
 * A Shannon finding is never treated as an independently validated
 * vulnerability merely because Shannon reported it: `verified` below is
 * true only when Shannon's own exploitation phase recorded `status:
 * "exploited"` for that finding — a concrete, reproduced signal, not a
 * severity/confidence rating. An analysis-only finding (no `status` field
 * at all, because the scan never ran exploitation) is always unverified
 * here; the adaptive loop's own investigation is what may verify it later.
 */

import { err, type Observation, ok, type Result } from '../types.js';

const CATEGORY_VALUES = ['Injection', 'XSS', 'Authentication', 'SSRF', 'Authorization', 'Miscellaneous'] as const;
type ShannonCategory = (typeof CATEGORY_VALUES)[number];

const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low'] as const;
type ShannonSeverity = (typeof SEVERITY_VALUES)[number];

const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;
type ShannonConfidence = (typeof CONFIDENCE_VALUES)[number];

const STATUS_VALUES = ['exploited', 'out_of_scope', 'blocked_by_constraints', 'false_positive'] as const;
type ShannonFindingStatus = (typeof STATUS_VALUES)[number];

export interface ShannonHttpLocation {
  readonly method: string;
  readonly url: string;
  readonly parameter?: string | null;
}

/**
 * Superset of Shannon's exploit-mode and analysis-mode finding shapes (see
 * module docstring). `status`/exploit-only fields and `confidence` are
 * mutually exclusive in a real report.json, but both are optional here so
 * one type covers both modes — callers must check presence, never assume.
 */
export interface ShannonFindingRecord {
  readonly finding_id: string;
  readonly title: string;
  readonly category: ShannonCategory;
  readonly owasp_category: string;
  readonly severity: ShannonSeverity;
  readonly vulnerable_location: string;
  readonly overview: string;
  readonly impact: string;
  readonly remediation: string;
  readonly http_location?: ShannonHttpLocation | null;
  // Exploit-mode only.
  readonly auth_state?: string;
  readonly prerequisites?: string;
  readonly status?: ShannonFindingStatus | null;
  // Analysis-mode only.
  readonly confidence?: ShannonConfidence | null;
  // Everything else (exploitation_steps, proof_of_impact, code_locations,
  // sast_source_location, notes, additional_sections) is real report.json
  // content this package does not currently need field-by-field, but is
  // preserved verbatim via `raw` on the resulting Observation rather than
  // silently dropped.
}

export interface ShannonReportCoverage {
  readonly status: 'complete' | 'partial';
  readonly limitations: readonly { readonly code: string; readonly message: string }[];
}

export interface ShannonReportMeta {
  readonly target: string;
  readonly assessment_date: string;
  readonly scope: string;
  readonly executive_summary: string;
  readonly exploit?: boolean;
  readonly model?: string;
  readonly coverage?: ShannonReportCoverage;
}

export interface ShannonReport {
  readonly report_meta: ShannonReportMeta;
  readonly findings: readonly ShannonFindingRecord[];
  /** Vuln classes whose pipeline failed and were not assessed this run — an un-assessed class must never read as "clean". */
  readonly not_assessed?: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

function validateHttpLocation(value: unknown, findingId: string): Result<ShannonHttpLocation | undefined, string> {
  if (value === undefined || value === null) return ok(undefined);
  if (!isRecord(value)) return err(`finding "${findingId}": "http_location" must be an object or null`);
  if (!isNonEmptyString(value.method)) return err(`finding "${findingId}": "http_location.method" must be a string`);
  if (!isNonEmptyString(value.url)) return err(`finding "${findingId}": "http_location.url" must be a string`);
  if (value.parameter !== undefined && value.parameter !== null && typeof value.parameter !== 'string') {
    return err(`finding "${findingId}": "http_location.parameter" must be a string or null`);
  }
  return ok({
    method: value.method,
    url: value.url,
    ...(typeof value.parameter === 'string' ? { parameter: value.parameter } : {}),
  });
}

/** Validates one finding against the real report.json per-finding schema (see module docstring). Tolerates unknown extra fields (e.g. code_locations, sast_source_location) rather than rejecting the whole report over them. */
function validateFinding(value: unknown): Result<ShannonFindingRecord, string> {
  if (!isRecord(value)) return err('finding must be a JSON object');
  const id = isNonEmptyString(value.finding_id) ? value.finding_id : '(unknown finding_id)';

  if (!isNonEmptyString(value.finding_id)) return err(`finding is missing a non-empty "finding_id"`);
  if (!isNonEmptyString(value.title)) return err(`finding "${id}": missing a non-empty "title"`);
  if (!isOneOf(value.category, CATEGORY_VALUES)) {
    return err(`finding "${id}": "category" must be one of: ${CATEGORY_VALUES.join(', ')}`);
  }
  if (!isNonEmptyString(value.owasp_category)) return err(`finding "${id}": missing a non-empty "owasp_category"`);
  if (!isOneOf(value.severity, SEVERITY_VALUES)) {
    return err(`finding "${id}": "severity" must be one of: ${SEVERITY_VALUES.join(', ')}`);
  }
  if (!isNonEmptyString(value.vulnerable_location)) {
    return err(`finding "${id}": missing a non-empty "vulnerable_location"`);
  }
  if (!isNonEmptyString(value.overview)) return err(`finding "${id}": missing a non-empty "overview"`);
  if (!isNonEmptyString(value.impact)) return err(`finding "${id}": missing a non-empty "impact"`);
  if (!isNonEmptyString(value.remediation)) return err(`finding "${id}": missing a non-empty "remediation"`);

  if (value.status !== undefined && value.status !== null && !isOneOf(value.status, STATUS_VALUES)) {
    return err(`finding "${id}": "status" must be one of: ${STATUS_VALUES.join(', ')}, or null/absent`);
  }
  if (value.confidence !== undefined && value.confidence !== null && !isOneOf(value.confidence, CONFIDENCE_VALUES)) {
    return err(`finding "${id}": "confidence" must be one of: ${CONFIDENCE_VALUES.join(', ')}, or null/absent`);
  }
  if (value.auth_state !== undefined && typeof value.auth_state !== 'string') {
    return err(`finding "${id}": "auth_state" must be a string`);
  }
  if (value.prerequisites !== undefined && typeof value.prerequisites !== 'string') {
    return err(`finding "${id}": "prerequisites" must be a string`);
  }

  const httpLocation = validateHttpLocation(value.http_location, id);
  if (!httpLocation.ok) return err(httpLocation.error);

  return ok({
    finding_id: value.finding_id,
    title: value.title,
    category: value.category as ShannonCategory,
    owasp_category: value.owasp_category,
    severity: value.severity as ShannonSeverity,
    vulnerable_location: value.vulnerable_location,
    overview: value.overview,
    impact: value.impact,
    remediation: value.remediation,
    ...(httpLocation.value !== undefined ? { http_location: httpLocation.value } : {}),
    ...(typeof value.auth_state === 'string' ? { auth_state: value.auth_state } : {}),
    ...(typeof value.prerequisites === 'string' ? { prerequisites: value.prerequisites } : {}),
    ...(isOneOf(value.status, STATUS_VALUES) ? { status: value.status } : {}),
    ...(isOneOf(value.confidence, CONFIDENCE_VALUES) ? { confidence: value.confidence } : {}),
  });
}

function validateCoverage(value: unknown): Result<ShannonReportCoverage | undefined, string> {
  if (value === undefined) return ok(undefined);
  if (!isRecord(value)) return err('"report_meta.coverage" must be an object');
  if (value.status !== 'complete' && value.status !== 'partial') {
    return err('"report_meta.coverage.status" must be "complete" or "partial"');
  }
  if (!Array.isArray(value.limitations)) return err('"report_meta.coverage.limitations" must be an array');
  const limitations: { code: string; message: string }[] = [];
  for (const raw of value.limitations) {
    if (!isRecord(raw) || !isNonEmptyString(raw.code) || !isNonEmptyString(raw.message)) {
      return err('"report_meta.coverage.limitations" entries must have non-empty "code" and "message" strings');
    }
    limitations.push({ code: raw.code, message: raw.message });
  }
  return ok({ status: value.status, limitations });
}

function validateReportMeta(value: unknown): Result<ShannonReportMeta, string> {
  if (!isRecord(value)) return err('"report_meta" must be a JSON object');
  if (!isNonEmptyString(value.target)) return err('"report_meta.target" must be a non-empty string');
  if (!isNonEmptyString(value.assessment_date)) return err('"report_meta.assessment_date" must be a non-empty string');
  if (!isNonEmptyString(value.scope)) return err('"report_meta.scope" must be a non-empty string');
  if (typeof value.executive_summary !== 'string') return err('"report_meta.executive_summary" must be a string');
  if (value.exploit !== undefined && typeof value.exploit !== 'boolean') {
    return err('"report_meta.exploit" must be a boolean');
  }
  if (value.model !== undefined && typeof value.model !== 'string') {
    return err('"report_meta.model" must be a string');
  }
  const coverage = validateCoverage(value.coverage);
  if (!coverage.ok) return err(coverage.error);

  return ok({
    target: value.target,
    assessment_date: value.assessment_date,
    scope: value.scope,
    executive_summary: value.executive_summary,
    ...(typeof value.exploit === 'boolean' ? { exploit: value.exploit } : {}),
    ...(typeof value.model === 'string' ? { model: value.model } : {}),
    ...(coverage.value !== undefined ? { coverage: coverage.value } : {}),
  });
}

/**
 * Validates a raw parsed JSON value as a real Shannon 1.9.0 report.json.
 * Rejects: not an object, missing/malformed `report_meta`, `findings` not
 * an array, any finding failing its own schema. Accepts: an empty
 * `findings` array (a clean scan is a valid report, not an error), any
 * number of findings, a `not_assessed` list, unknown top-level or
 * per-finding fields it does not itself need.
 */
export function parseShannonReport(raw: unknown): Result<ShannonReport, string> {
  if (!isRecord(raw)) {
    return err('Shannon report must be a JSON object');
  }

  const reportMeta = validateReportMeta(raw.report_meta);
  if (!reportMeta.ok) return err(reportMeta.error);

  if (!Array.isArray(raw.findings)) {
    return err('Shannon report "findings" must be an array');
  }
  const findings: ShannonFindingRecord[] = [];
  for (const rawFinding of raw.findings) {
    const validated = validateFinding(rawFinding);
    if (!validated.ok) return err(validated.error);
    findings.push(validated.value);
  }

  if (
    raw.not_assessed !== undefined &&
    (!Array.isArray(raw.not_assessed) || !raw.not_assessed.every(isNonEmptyString))
  ) {
    return err('Shannon report "not_assessed", when present, must be an array of strings');
  }

  return ok({
    report_meta: reportMeta.value,
    findings,
    ...(raw.not_assessed !== undefined ? { not_assessed: raw.not_assessed as readonly string[] } : {}),
  });
}

const VULN_CLASS_BY_CATEGORY: Readonly<Record<ShannonCategory, string>> = {
  Injection: 'injection',
  XSS: 'xss',
  Authentication: 'auth',
  Authorization: 'authz',
  SSRF: 'ssrf',
  Miscellaneous: 'misc',
};

let observationCounter = 0;

function nextObservationId(findingId: string): string {
  observationCounter += 1;
  return `obs-shannon-${findingId}-${observationCounter}`;
}

/**
 * Maps a parsed Shannon report into normalized, engagement-scoped
 * observations. `verified` is true only for a finding Shannon's own
 * exploitation phase marked `status: "exploited"` — every other finding
 * (analysis-only, or exploit-mode but not exploited) is unverified,
 * regardless of the severity/confidence Shannon assigned it. The original
 * finding record is preserved on `Observation.raw` for provenance.
 */
export function ingestShannonOutput(report: ShannonReport, engagementId: string): readonly Observation[] {
  const collectedAt = new Date().toISOString();
  return report.findings.map((finding) => {
    const confidenceHint = finding.confidence ?? (finding.status === 'exploited' ? 'high' : 'unknown');
    const tags = ['shannon', finding.category.toLowerCase(), ...(finding.status ? [finding.status] : [])];
    return {
      id: nextObservationId(finding.finding_id),
      engagementId,
      source: 'shannon',
      assetRef: finding.http_location?.url ?? finding.vulnerable_location,
      vulnClass: VULN_CLASS_BY_CATEGORY[finding.category],
      title: finding.title,
      description: finding.overview,
      severityHint: finding.severity,
      confidenceHint,
      verified: finding.status === 'exploited',
      tags,
      collectedAt,
      raw: finding as unknown as Readonly<Record<string, unknown>>,
    };
  });
}
