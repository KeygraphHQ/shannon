// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Capella's structured collectors.
 *
 * Capella never parses markdown on the ingestion path. Each verdict stage
 * registers the one collector tool it needs; the agent supplies field values and
 * the handler supplies the path, applies the schema legality gate, and writes.
 * Two properties fall out of that: a file path cannot be hallucinated, and a
 * verdict the schema forbids is rejected while the agent is still running and can
 * fix it, rather than being dropped silently at export.
 *
 * Five of these six tools *mutate* an existing `findings/<id>.json`; the finding
 * evolves through the verdict ladder rather than being created whole.
 * `report_finding` is the only creator.
 *
 * Rejection is deliberate over coercion. `cwe` is component #1 of the SAST dedup
 * identity tuple, so a value this layer quietly "fixed" would re-key a canonical
 * finding with no way to tell afterwards, and the verdict-legality gates
 * (`assertReviewLegality`) become executable here rather than left to the model.
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
  CALIBRATION_RULE_KEYS,
  CAPELLA_ATTACKER_POSITIONS,
  CAPELLA_AVAILABILITY_TIERS,
  CAPELLA_CALIBRATION_OUTCOMES,
  CAPELLA_CONFIRM_STATUSES,
  CAPELLA_EXPOSURES,
  CAPELLA_PRIVILEGES,
  CAPELLA_REVIEW_STATUSES,
  CAPELLA_SEVERITIES,
  CAPELLA_TRIAGE_OUTCOMES,
  CAPELLA_USER_INTERACTIONS,
  CAPELLA_VIABILITIES,
  type CalibrationChecklist,
  type CalibrationRuleKey,
  type CapellaCalibrationOutcome,
  type CapellaConfirmStatus,
  type CapellaFinding,
  type CapellaHistoryEntry,
  type CapellaReviewStatus,
  type CapellaSeverity,
  type CapellaTriageOutcome,
  type CapellaViability,
  TRIAGE_RULE_KEYS,
  type TriageChecklist,
  type TriageRuleKey,
} from './finding-types.js';
import { isNormalizedRepositoryPath, parseCodePath } from './paths.js';

// === Result Helpers ===

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: undefined };
}

function accepted(payload: Record<string, unknown>) {
  return textResult(JSON.stringify({ success: true, ...payload }));
}

/**
 * A rejection the agent can act on. The message names the field and the rule,
 * because the agent's only route to a valid record is re-reading its own
 * evidence and calling again.
 */
function rejected(error: string) {
  return textResult(JSON.stringify({ success: false, error }));
}

interface VerdictCollectorConfig {
  readonly findingsDir: string;
  readonly expectedIds: readonly string[];
}

export interface VerdictRejectionCounts {
  readonly unexpected: number;
  readonly duplicate: number;
}

interface VerdictCollectorIntegrity {
  getAcceptedIds: () => string[];
  getRejectionCounts: () => VerdictRejectionCounts;
}

interface VerdictTracker extends VerdictCollectorIntegrity {
  check: (findingId: string) => string | undefined;
  accept: (findingId: string) => void;
}

function createVerdictTracker(expectedFindingIds: readonly string[]): VerdictTracker {
  const expectedIds = new Set(expectedFindingIds);
  const acceptedIds = new Set<string>();
  let unexpected = 0;
  let duplicate = 0;
  return {
    check(findingId: string): string | undefined {
      if (!expectedIds.has(findingId)) {
        unexpected += 1;
        return 'finding_id is not expected in this stage.';
      }
      if (acceptedIds.has(findingId)) {
        duplicate += 1;
        return 'finding_id already has an accepted verdict in this stage.';
      }
      return undefined;
    },
    accept(findingId: string): void {
      acceptedIds.add(findingId);
    },
    getAcceptedIds: () => [...acceptedIds],
    getRejectionCounts: () => ({ unexpected, duplicate }),
  };
}

// === Slugging ===

/**
 * Slugify one id component.
 *
 * Every component of a finding id is slugified because the id becomes a
 * filename: an un-slugged model-supplied value could carry a path separator or
 * `..` and write outside the findings directory.
 */
export function slugComponent(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Build a finding's id.
 *
 * Deterministic on purpose: the same defect reported twice (say, by a Temporal
 * retry re-discovering it) yields the same id and the same file, so the second
 * write is a no-op rather than a duplicate finding. The id is scan-local;
 * upstream's UUIDs are not used, and `ruleId` on the SARIF is the bare CWE.
 */
export function buildCapellaFindingId(args: { cwe: string; file: string; line: number; title: string }): string {
  const cwe = slugComponent(args.cwe) || 'cwe-unknown';
  const file = slugComponent(args.file.replace(/^.*\//, '').replace(/\.[^.]+$/, '')) || 'file';
  const title = slugComponent(args.title).split('-').slice(0, 6).join('-') || 'finding';
  return `${cwe}--${file}--l${args.line}--${title}`;
}

// === CWE validation ===

const CWE_PATTERN = /^CWE-\d+$/;

/**
 * The committed-secret CWE family, which this engine does not report: a
 * separate secret-scanning pipeline runs over the same commit and already
 * reports these, and because the two tools pick different CWEs for the same
 * literal the identity tuple differs and deduplication cannot collapse them.
 *
 * Only literals committed to source are excluded. What the code *does* with a
 * secret at runtime stays in scope, because a secret scanner cannot see a flow.
 */
export const SECRET_SCANNER_CWES = new Set([
  'CWE-798', // Use of Hard-coded Credentials
  'CWE-259', // Use of Hard-coded Password
  'CWE-321', // Use of Hard-coded Cryptographic Key
  'CWE-256', // Plaintext Storage of a Password
  'CWE-260', // Password in Configuration File
  'CWE-547', // Use of Hard-coded, Security-relevant Constants
]);

/**
 * Normalize a CWE id, or explain why it cannot be one.
 *
 * Upstream types `cwe` as optional and `["string","null"]`; Capella makes it
 * required and `^CWE-\d+$`, because it is component #1 of the dedup identity
 * tuple. Trimming and upper-casing is the whole of the tolerance.
 */
export function normalizeCwe(raw: unknown): { ok: true; cwe: string } | { ok: false; error: string } {
  const cwe = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!CWE_PATTERN.test(cwe)) {
    return {
      ok: false,
      error:
        `cwe must be a bare CWE identifier matching CWE-<number> (got ${JSON.stringify(raw)}). ` +
        'It keys deduplication across every scan of this repository, so it cannot carry a name, ' +
        'a description or more than one id, and — unlike upstream — it is required here. ' +
        'Re-read the sink and supply the single best CWE.',
    };
  }
  if (SECRET_SCANNER_CWES.has(cwe)) {
    return {
      ok: false,
      error:
        `${cwe} is a committed-secret finding, which this engine does not report — a dedicated ` +
        'secret-scanning pipeline already covers this commit, and a second report of the same ' +
        'literal under a different CWE is a duplicate deduplication cannot collapse. ' +
        'If the real defect is what the code DOES with the secret at runtime (logs it, writes it ' +
        'to web storage, puts it in a URL), report that flow at its sink with the CWE for that ' +
        'behaviour. Otherwise drop it.',
    };
  }
  return { ok: true, cwe };
}

// === Enum + field validation ===

function validateEnum<T extends string>(
  raw: unknown,
  allowed: readonly T[],
  field: string,
): { ok: true; value: T } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!(allowed as readonly string[]).includes(value)) {
    return { ok: false, error: `${field} must be one of ${allowed.join(', ')} (got ${JSON.stringify(raw)})` };
  }
  return { ok: true, value: value as T };
}

function requireNonEmpty(raw: unknown, field: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    return { ok: false, error: `${field} is required and must be non-empty` };
  }
  return { ok: true, value };
}

/**
 * Validate `code_paths` and resolve the primary location.
 *
 * `code_paths[0]` must be a sink locator `<path>:<line>`, never a URL or a
 * bare symbol: the SARIF exporter reads it as `locations[0]`, and a non-file
 * locator inserts with a NULL path and collapses with every other location-less
 * finding on the same CWE. Upstream findings legitimately carry such locators,
 * so this boundary is where they must be rejected.
 */
export function validateCodePaths(
  raw: unknown,
): { ok: true; codePaths: string[]; file: string; line: number } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) {
    return {
      ok: false,
      error: 'code_paths must have at least one entry, and code_paths[0] must be the sink location as "<path>:<line>".',
    };
  }
  const codePaths = raw.map((p) => String(p ?? '').trim()).filter((p) => p.length > 0);
  if (codePaths.length === 0) {
    return { ok: false, error: 'code_paths must contain at least one non-empty "<path>:<line>" entry.' };
  }
  const first = codePaths[0];
  if (!first) {
    return { ok: false, error: 'code_paths must contain at least one non-empty "<path>:<line>" entry.' };
  }
  if (first.includes('://')) {
    return {
      ok: false,
      error: `code_paths[0] must be a sink location "<path>:<line>", not a URL (got ${JSON.stringify(first)}).`,
    };
  }
  const parsed = parseCodePath(first);
  if (!parsed || !isNormalizedRepositoryPath(parsed.file)) {
    return {
      ok: false,
      error:
        `code_paths[0] must be a normalized repository-relative "<path>:<line>" with a positive line number ` +
        `(got ${JSON.stringify(first)}). It becomes the finding's SARIF location, so it cannot be absolute, ` +
        'contain traversal, be a bare file, a symbol or an offset.',
    };
  }
  return { ok: true, codePaths, file: parsed.file, line: parsed.line };
}

// === Checklist validation ===

/** Validate the 13-rule triage checklist: every rule present, reason where required. */
export function validateTriageChecklist(
  raw: unknown,
): { ok: true; checklist: TriageChecklist } | { ok: false; error: string } {
  const src = (raw ?? {}) as Record<string, unknown>;
  const checklist = {} as TriageChecklist;
  for (const key of TRIAGE_RULE_KEYS) {
    const entry = src[key] as { outcome?: unknown; reason?: unknown } | undefined;
    if (!entry || typeof entry !== 'object') {
      return {
        ok: false,
        error: `triage_checklist.${key} is required — all 13 negative constraints must be recorded.`,
      };
    }
    const outcome = typeof entry.outcome === 'string' ? entry.outcome.trim() : '';
    if (!(CAPELLA_TRIAGE_OUTCOMES as readonly string[]).includes(outcome)) {
      return {
        ok: false,
        error: `triage_checklist.${key}.outcome must be one of ${CAPELLA_TRIAGE_OUTCOMES.join(', ')} (got ${JSON.stringify(entry.outcome)}).`,
      };
    }
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const needsReason = outcome === 'FAIL' || outcome === 'UNKNOWN' || outcome === 'NOT_APPLICABLE';
    if (needsReason && !reason) {
      return { ok: false, error: `triage_checklist.${key}.reason is required when outcome is ${outcome}.` };
    }
    checklist[key as TriageRuleKey] = reason
      ? { outcome: outcome as CapellaTriageOutcome, reason }
      : { outcome: outcome as CapellaTriageOutcome };
  }
  return { ok: true, checklist };
}

/**
 * The verdict-legality gates, enforced in Node: a non-FALSE_POSITIVE verdict
 * may carry no `FAIL`, and a `VALID` verdict may additionally carry no
 * `UNKNOWN`.
 *
 * `FALSE_POSITIVE` is the only status a `FAIL` is legal alongside; that is the
 * asymmetry the whole ladder rests on.
 */
export function assertReviewLegality(status: CapellaReviewStatus, checklist: TriageChecklist): string | null {
  if (status !== 'FALSE_POSITIVE') {
    for (const key of TRIAGE_RULE_KEYS) {
      if (checklist[key].outcome === 'FAIL') {
        return (
          `a ${status} finding cannot have triage_checklist.${key} = FAIL. FALSE_POSITIVE is the only ` +
          'status a FAIL is legal alongside. If a rule looks failed but you are not marking the ' +
          'finding FALSE_POSITIVE, use UNKNOWN with a reason instead.'
        );
      }
    }
  }
  if (status === 'VALID') {
    for (const key of TRIAGE_RULE_KEYS) {
      if (checklist[key].outcome === 'UNKNOWN') {
        return (
          `a VALID finding cannot have triage_checklist.${key} = UNKNOWN — reaching VALID means every ` +
          'rule was affirmatively cleared (PASS or NOT_APPLICABLE). Use PROVISIONALLY_VALID if you are ' +
          'not certain of a rule.'
        );
      }
    }
  }
  return null;
}

/** Validate the 27-rule calibration checklist: every rule present, reason where required. */
export function validateCalibrationChecklist(
  raw: unknown,
): { ok: true; checklist: CalibrationChecklist } | { ok: false; error: string } {
  const src = (raw ?? {}) as Record<string, unknown>;
  const checklist = {} as CalibrationChecklist;
  for (const key of CALIBRATION_RULE_KEYS) {
    const entry = src[key] as { outcome?: unknown; reason?: unknown } | undefined;
    if (!entry || typeof entry !== 'object') {
      return {
        ok: false,
        error: `calibration_checklist.${key} is required — all 27 sanity-cap rules must be recorded.`,
      };
    }
    const outcome = typeof entry.outcome === 'string' ? entry.outcome.trim() : '';
    if (!(CAPELLA_CALIBRATION_OUTCOMES as readonly string[]).includes(outcome)) {
      return {
        ok: false,
        error: `calibration_checklist.${key}.outcome must be one of ${CAPELLA_CALIBRATION_OUTCOMES.join(', ')} (got ${JSON.stringify(entry.outcome)}).`,
      };
    }
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    const needsReason = outcome === 'APPLIES' || outcome === 'UNKNOWN';
    if (needsReason && !reason) {
      return { ok: false, error: `calibration_checklist.${key}.reason is required when outcome is ${outcome}.` };
    }
    checklist[key as CalibrationRuleKey] = reason
      ? { outcome: outcome as CapellaCalibrationOutcome, reason }
      : { outcome: outcome as CapellaCalibrationOutcome };
  }
  return { ok: true, checklist };
}

function validateScore(
  raw: unknown,
  field: string,
  min: number,
  max: number,
): { ok: true; value: number } | { ok: false; error: string } {
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) {
    return { ok: false, error: `${field} must be a number between ${min} and ${max} (got ${JSON.stringify(raw)}).` };
  }
  return { ok: true, value };
}

// === Finding I/O ===

/** Reject a finding id that could escape the findings directory. */
function sanitizeFindingId(raw: unknown): { ok: true; id: string } | { ok: false; error: string } {
  const id = String(raw ?? '').trim();
  if (!id) {
    return { ok: false, error: 'finding_id is required.' };
  }
  if (id.includes('/') || id.includes('\\') || id.includes('..')) {
    return {
      ok: false,
      error: `finding_id ${JSON.stringify(id)} is not a bare finding id — it must not contain a path separator or "..".`,
    };
  }
  return { ok: true, id };
}

function readFinding(
  findingsDir: string,
  id: string,
): { ok: true; finding: CapellaFinding } | { ok: false; error: string } {
  const path = join(findingsDir, `${id}.json`);
  if (!existsSync(path)) {
    return {
      ok: false,
      error: `no finding with id ${JSON.stringify(id)} exists. Read the findings directory and use an id from it.`,
    };
  }
  try {
    return { ok: true, finding: JSON.parse(readFileSync(path, 'utf-8')) as CapellaFinding };
  } catch (error) {
    return { ok: false, error: `finding ${JSON.stringify(id)} is corrupt: ${(error as Error).message}` };
  }
}

function writeFinding(findingsDir: string, finding: CapellaFinding): void {
  mkdirSync(findingsDir, { recursive: true });
  writeFileSync(join(findingsDir, `${finding.id}.json`), JSON.stringify(finding, null, 2), 'utf-8');
}

function historyEntry(stage: string, action: string, details: string): CapellaHistoryEntry {
  return { stage, action, details, timestamp: new Date().toISOString() };
}

function deterministicFindingTimestamp(finding: CapellaFinding): string {
  try {
    return new Date(finding.recordedAt).toISOString();
  } catch {
    return new Date(0).toISOString();
  }
}

/** Quarantine review survivors that received no accepted verdict. */
export function quarantineUngradedReviewFindings(findingsDir: string, findingIds: readonly string[]): number {
  let quarantined = 0;
  for (const findingId of [...new Set(findingIds)].sort()) {
    const existing = readFinding(findingsDir, findingId);
    if (!existing.ok) continue;
    const finding = existing.finding;
    const alreadyQuarantined = finding.history.some(
      (entry) => entry.stage === 'review' && entry.action === 'quarantined_ungraded',
    );
    if (alreadyQuarantined) continue;
    writeFinding(findingsDir, {
      ...finding,
      status: 'NEEDS_RESEARCH',
      history: [
        ...finding.history,
        {
          stage: 'review',
          action: 'quarantined_ungraded',
          details: 'No accepted review verdict was recorded.',
          timestamp: deterministicFindingTimestamp(finding),
        },
      ],
    });
    quarantined += 1;
  }
  return quarantined;
}

// === Shared schemas ===

const severitySchema = Type.Union(
  CAPELLA_SEVERITIES.map((s) => Type.Literal(s)),
  {
    description: 'Severity estimate.',
  },
);

const triageRuleSchema = Type.Object({
  outcome: Type.Union(CAPELLA_TRIAGE_OUTCOMES.map((o) => Type.Literal(o))),
  reason: Type.Optional(Type.String({ description: 'Required when outcome is FAIL, UNKNOWN or NOT_APPLICABLE.' })),
});

const triageChecklistSchema = Type.Object(Object.fromEntries(TRIAGE_RULE_KEYS.map((k) => [k, triageRuleSchema])), {
  description: 'All 13 negative constraints, each recorded PASS / FAIL / UNKNOWN / NOT_APPLICABLE.',
});

const calibrationRuleSchema = Type.Object({
  outcome: Type.Union(CAPELLA_CALIBRATION_OUTCOMES.map((o) => Type.Literal(o))),
  reason: Type.Optional(Type.String({ description: 'Required when outcome is APPLIES or UNKNOWN.' })),
});

const calibrationChecklistSchema = Type.Object(
  Object.fromEntries(CALIBRATION_RULE_KEYS.map((k) => [k, calibrationRuleSchema])),
  { description: 'All 27 sanity-cap rules, each recorded APPLIES / DOES_NOT_APPLY / UNKNOWN.' },
);

// === Report Finding Collector (research wave 2) ===

export interface FindingCollector {
  tools: ToolDefinition[];
  getFindings: () => CapellaFinding[];
}

/**
 * `report_finding`: one call per candidate vulnerability.
 *
 * Creates `findings/<id>.json` at `status: PROVISIONALLY_VALID`. Rejects a
 * malformed CWE, a non-locator `code_paths[0]`, a bad enum or an empty required
 * string, so a record that could not survive the verdict ladder never enters it.
 */
export function createFindingCollector(config: { findingsDir: string }): FindingCollector {
  const findings: CapellaFinding[] = [];

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'report_finding',
      label: 'Report Finding',
      description:
        'Record one candidate vulnerability. Call this once per finding you discover during the deep ' +
        'audit. The finding enters the pipeline at PROVISIONALLY_VALID and is validated downstream.',
      parameters: Type.Object({
        title: Type.String({ description: 'Concise summary of the vulnerability.' }),
        cwe: Type.String({ description: 'Bare CWE identifier, e.g. CWE-89. Required.' }),
        severity: severitySchema,
        code_paths: Type.Array(Type.String({ description: 'Source locator "<path>:<line>".' }), {
          description:
            'Exact locations of the flaw, sink to source. code_paths[0] is the sink and becomes the SARIF location.',
        }),
        description: Type.String({ description: 'Detailed explanation of the flaw and its mechanism.' }),
        impact: Type.String({ description: 'The potential consequence of the vulnerability.' }),
        mitigation: Type.String({ description: 'Recommended corrective modification.' }),
        attacker_position: Type.Union(CAPELLA_ATTACKER_POSITIONS.map((p) => Type.Literal(p))),
        privileges_required: Type.Union(CAPELLA_PRIVILEGES.map((p) => Type.Literal(p))),
        user_interaction: Type.Union(CAPELLA_USER_INTERACTIONS.map((u) => Type.Literal(u))),
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const cwe = normalizeCwe(p.cwe);
        if (!cwe.ok) return rejected(cwe.error);

        const severity = validateEnum(p.severity, CAPELLA_SEVERITIES, 'severity');
        if (!severity.ok) return rejected(severity.error);

        const location = validateCodePaths(p.code_paths);
        if (!location.ok) return rejected(location.error);

        const title = requireNonEmpty(p.title, 'title');
        if (!title.ok) return rejected(title.error);
        const description = requireNonEmpty(p.description, 'description');
        if (!description.ok) return rejected(description.error);
        const impact = requireNonEmpty(p.impact, 'impact');
        if (!impact.ok) return rejected(impact.error);
        const mitigation = requireNonEmpty(p.mitigation, 'mitigation');
        if (!mitigation.ok) return rejected(mitigation.error);

        const attackerPosition = validateEnum(p.attacker_position, CAPELLA_ATTACKER_POSITIONS, 'attacker_position');
        if (!attackerPosition.ok) return rejected(attackerPosition.error);
        const privileges = validateEnum(p.privileges_required, CAPELLA_PRIVILEGES, 'privileges_required');
        if (!privileges.ok) return rejected(privileges.error);
        const userInteraction = validateEnum(p.user_interaction, CAPELLA_USER_INTERACTIONS, 'user_interaction');
        if (!userInteraction.ok) return rejected(userInteraction.error);

        const id = buildCapellaFindingId({
          cwe: cwe.cwe,
          file: location.file,
          line: location.line,
          title: title.value,
        });
        if (findings.some((f) => f.id === id)) {
          return accepted({ findingId: id, duplicate: true, totalFindings: findings.length });
        }

        const finding: CapellaFinding = {
          id,
          title: title.value,
          description: description.value,
          code_paths: location.codePaths,
          impact: impact.value,
          severity: severity.value as CapellaSeverity,
          privileges_required: privileges.value,
          attacker_position: attackerPosition.value,
          user_interaction: userInteraction.value,
          mitigation: mitigation.value,
          cwe: cwe.cwe,
          history: [historyEntry('researcher', 'created', `Discovered at ${location.file}:${location.line}`)],
          status: 'PROVISIONALLY_VALID',
          recordedAt: Date.now(),
        };

        writeFinding(config.findingsDir, finding);
        findings.push(finding);
        return accepted({ findingId: id, totalFindings: findings.length });
      },
    }),
  ];

  return { tools, getFindings: () => [...findings] };
}

// === Record Duplicates Collector (dedupe) ===

export interface DuplicateRecord {
  id: string;
  duplicateOf: string;
}

export interface DuplicateCollector {
  tools: ToolDefinition[];
  getDuplicates: () => DuplicateRecord[];
}

/**
 * `record_duplicates`: mark one finding a duplicate of another.
 *
 * Sets `status: DUPLICATE` plus `duplicate_of` and moves the duplicate to
 * `.trash/`. Refuses a merge that would leave the survivor without a CWE,
 * because on a merge upstream copies `cwe` from the primary only, and a
 * CWE-less survivor breaks the identity tuple.
 *
 * NOTE: unlike upstream, this deliberately does NOT field-merge the duplicate
 * into the primary: no `code_paths` union, no `attacker_position`/
 * `privileges_required`/`user_interaction` max, no `description`/`impact`
 * concatenation. The primary survives byte-for-byte and the duplicate is trashed.
 * The collector has no way to rewrite the survivor's fields, and asking the agent
 * to reconcile them is the deterministic-work-in-an-agent anti-pattern. The
 * tradeoff: a trashed duplicate that carried a stricter `attacker_position` or an
 * extra sink loses that data. Accepted because the finder over-reports per
 * investigation and the prompt selects the more comprehensive record as primary.
 */
export function createDuplicateCollector(config: { findingsDir: string }): DuplicateCollector {
  const duplicates: DuplicateRecord[] = [];
  const trashDir = join(config.findingsDir, '.trash');

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'record_duplicates',
      label: 'Record Duplicate',
      description:
        'Mark one finding as a duplicate of another (the primary it survives under). Call this once ' +
        'per duplicate. Findings at different lines in the same file are DISTINCT — never merge them.',
      parameters: Type.Object({
        duplicate_id: Type.String({ description: 'The id of the finding to retire as a duplicate.' }),
        primary_id: Type.String({ description: 'The id of the primary finding it duplicates.' }),
        reason: Type.Optional(Type.String({ description: 'Why these are the same defect.' })),
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const dupId = sanitizeFindingId(p.duplicate_id);
        if (!dupId.ok) return rejected(`duplicate_id: ${dupId.error}`);
        const primId = sanitizeFindingId(p.primary_id);
        if (!primId.ok) return rejected(`primary_id: ${primId.error}`);
        if (dupId.id === primId.id) {
          return rejected('duplicate_id and primary_id must differ — a finding cannot be a duplicate of itself.');
        }

        const dup = readFinding(config.findingsDir, dupId.id);
        if (!dup.ok) return rejected(`duplicate_id: ${dup.error}`);
        const primary = readFinding(config.findingsDir, primId.id);
        if (!primary.ok) return rejected(`primary_id: ${primary.error}`);

        if (!CWE_PATTERN.test(String(primary.finding.cwe ?? '').toUpperCase())) {
          return rejected(
            `primary finding ${JSON.stringify(primId.id)} has no valid CWE, so merging into it would leave the ` +
              'survivor without one. Pick a primary that carries a CWE.',
          );
        }

        const reason = typeof p.reason === 'string' ? p.reason.trim() : '';
        const updated: CapellaFinding = {
          ...dup.finding,
          status: 'DUPLICATE',
          duplicate_of: primId.id,
          history: [
            ...dup.finding.history,
            historyEntry('dedupe', 'marked_duplicate', reason || `Duplicate of ${primId.id}`),
          ],
        };

        // Move to .trash: write the retired record there, then remove the original.
        mkdirSync(trashDir, { recursive: true });
        writeFileSync(join(trashDir, `${updated.id}.json`), JSON.stringify(updated, null, 2), 'utf-8');
        rmSync(join(config.findingsDir, `${updated.id}.json`), { force: true });

        duplicates.push({ id: dupId.id, duplicateOf: primId.id });
        return accepted({ findingId: dupId.id, duplicateOf: primId.id, totalDuplicates: duplicates.length });
      },
    }),
  ];

  return { tools, getDuplicates: () => [...duplicates] };
}

// === Record Review Verdict Collector (review) ===

export interface ReviewRecord {
  id: string;
  status: CapellaReviewStatus;
}

export interface ReviewCollector extends VerdictCollectorIntegrity {
  tools: ToolDefinition[];
  getVerdicts: () => ReviewRecord[];
}

/**
 * `record_review_verdict`: record the 13-rule verdict for one finding.
 *
 * Enforces the two verdict-legality gates in Node (`assertReviewLegality`): a
 * non-FALSE_POSITIVE verdict may carry no `FAIL`, and a `VALID` verdict may carry
 * no `UNKNOWN`. `DUPLICATE` is not assignable here; only dedupe assigns it.
 */
export function createReviewCollector(config: VerdictCollectorConfig): ReviewCollector {
  const verdicts: ReviewRecord[] = [];
  const guard = createVerdictTracker(config.expectedIds);

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'record_review_verdict',
      label: 'Record Review Verdict',
      description:
        'Record the adversarial review verdict for one finding: its status, your independent reasoning, ' +
        'and the 13-rule triage checklist. Assume the finding is a false positive until the code ' +
        'disproves it.',
      parameters: Type.Object({
        finding_id: Type.String({ description: 'The id of the finding being reviewed.' }),
        status: Type.Union(CAPELLA_REVIEW_STATUSES.map((s) => Type.Literal(s))),
        reasoning: Type.String({ description: 'Your independent rationale for the status, based only on the code.' }),
        triage_checklist: triageChecklistSchema,
        repro_hints: Type.Optional(
          Type.String({ description: 'How to trigger the bug, and the trust-boundary ingress point.' }),
        ),
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const findingId = sanitizeFindingId(p.finding_id);
        if (!findingId.ok) return rejected(`finding_id: ${findingId.error}`);

        const status = validateEnum(p.status, CAPELLA_REVIEW_STATUSES, 'status');
        if (!status.ok) return rejected(status.error);

        const reasoning = requireNonEmpty(p.reasoning, 'reasoning');
        if (!reasoning.ok) return rejected(reasoning.error);

        const checklist = validateTriageChecklist(p.triage_checklist);
        if (!checklist.ok) return rejected(checklist.error);

        const legalityError = assertReviewLegality(status.value, checklist.checklist);
        if (legalityError) return rejected(legalityError);

        const integrityError = guard.check(findingId.id);
        if (integrityError) return rejected(integrityError);

        const existing = readFinding(config.findingsDir, findingId.id);
        if (!existing.ok) return rejected(`finding_id: ${existing.error}`);

        const reproHints = typeof p.repro_hints === 'string' ? p.repro_hints.trim() : '';
        const updated: CapellaFinding = {
          ...existing.finding,
          status: status.value,
          reasoning: reasoning.value,
          triage_checklist: checklist.checklist,
          ...(reproHints ? { repro_hints: reproHints } : {}),
          history: [...existing.finding.history, historyEntry('reviewer', 'reviewed', `status=${status.value}`)],
        };

        writeFinding(config.findingsDir, updated);
        verdicts.push({ id: findingId.id, status: status.value });
        guard.accept(findingId.id);
        return accepted({ findingId: findingId.id, status: status.value, totalVerdicts: verdicts.length });
      },
    }),
  ];

  return {
    tools,
    getVerdicts: () => [...verdicts],
    getAcceptedIds: guard.getAcceptedIds,
    getRejectionCounts: guard.getRejectionCounts,
  };
}

// === Record Viability Collector (critic) ===

export interface ViabilityRecord {
  id: string;
  viability: CapellaViability;
}

export interface ViabilityCollector extends VerdictCollectorIntegrity {
  tools: ToolDefinition[];
  getViabilities: () => ViabilityRecord[];
}

/**
 * `record_viability`: record the production-viability verdict for one finding.
 *
 * On drift or a missing file the critic is *required* to return
 * `CONDITIONAL_VIABLE`, never `NON_VIABLE`; that discipline lives in the
 * prompt, and this tool only records the value.
 */
export function createViabilityCollector(config: VerdictCollectorConfig): ViabilityCollector {
  const viabilities: ViabilityRecord[] = [];
  const guard = createVerdictTracker(config.expectedIds);

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'record_viability',
      label: 'Record Viability',
      description:
        'Record whether a validated finding remains triggerable in a production release build. Call ' +
        'this once per finding you assess.',
      parameters: Type.Object({
        finding_id: Type.String({ description: 'The id of the finding being assessed.' }),
        production_viability: Type.Union(CAPELLA_VIABILITIES.map((v) => Type.Literal(v))),
        critic_reasoning: Type.String({ description: 'Rationale for the viability verdict.' }),
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const findingId = sanitizeFindingId(p.finding_id);
        if (!findingId.ok) return rejected(`finding_id: ${findingId.error}`);

        const viability = validateEnum(p.production_viability, CAPELLA_VIABILITIES, 'production_viability');
        if (!viability.ok) return rejected(viability.error);

        const reasoning = requireNonEmpty(p.critic_reasoning, 'critic_reasoning');
        if (!reasoning.ok) return rejected(reasoning.error);

        const integrityError = guard.check(findingId.id);
        if (integrityError) return rejected(integrityError);

        const existing = readFinding(config.findingsDir, findingId.id);
        if (!existing.ok) return rejected(`finding_id: ${existing.error}`);

        const updated: CapellaFinding = {
          ...existing.finding,
          production_viability: viability.value as CapellaViability,
          critic_reasoning: reasoning.value,
          history: [...existing.finding.history, historyEntry('critic', 'assessed', `viability=${viability.value}`)],
        };

        writeFinding(config.findingsDir, updated);
        viabilities.push({ id: findingId.id, viability: viability.value as CapellaViability });
        guard.accept(findingId.id);
        return accepted({ findingId: findingId.id, viability: viability.value, totalAssessed: viabilities.length });
      },
    }),
  ];

  return {
    tools,
    getViabilities: () => [...viabilities],
    getAcceptedIds: guard.getAcceptedIds,
    getRejectionCounts: guard.getRejectionCounts,
  };
}

// === Record Static Confirmation Collector (confirm) ===

export interface ConfirmationRecord {
  id: string;
  reproStatus: CapellaConfirmStatus;
  promoted: boolean;
}

export interface ConfirmationCollector extends VerdictCollectorIntegrity {
  tools: ToolDefinition[];
  getConfirmations: () => ConfirmationRecord[];
}

/**
 * `record_static_confirmation`: record the static confirmation for one finding
 * and apply the `PROVISIONALLY_VALID -> VALID` promotion.
 *
 * Capella has no execution sandbox, so the only classifications it can set are
 * `statically_confirmed` and `not_attempted`. A `statically_confirmed` finding
 * that is currently `PROVISIONALLY_VALID` is promoted to `VALID`, the export
 * gate, unless its review checklist carries an `UNKNOWN` or `FAIL`, which would
 * violate the rule that a VALID finding carries no UNKNOWN or FAIL.
 */
export function createConfirmationCollector(config: VerdictCollectorConfig): ConfirmationCollector {
  const confirmations: ConfirmationRecord[] = [];
  const guard = createVerdictTracker(config.expectedIds);

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'record_static_confirmation',
      label: 'Record Static Confirmation',
      description:
        'Record the static confirmation for one finding. Use "statically_confirmed" when the flaw is ' +
        'statically obvious from the source and the reached-sink evidence is present; use ' +
        '"not_attempted" otherwise. A statically-confirmed PROVISIONALLY_VALID finding is promoted to VALID.',
      parameters: Type.Object({
        finding_id: Type.String({ description: 'The id of the finding being confirmed.' }),
        repro_status: Type.Union(CAPELLA_CONFIRM_STATUSES.map((s) => Type.Literal(s))),
        repro_hints: Type.Optional(
          Type.String({ description: 'The reached-sink evidence supporting the confirmation.' }),
        ),
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const findingId = sanitizeFindingId(p.finding_id);
        if (!findingId.ok) return rejected(`finding_id: ${findingId.error}`);

        const reproStatus = validateEnum(p.repro_status, CAPELLA_CONFIRM_STATUSES, 'repro_status');
        if (!reproStatus.ok) return rejected(reproStatus.error);

        const integrityError = guard.check(findingId.id);
        if (integrityError) return rejected(integrityError);

        const existing = readFinding(config.findingsDir, findingId.id);
        if (!existing.ok) return rejected(`finding_id: ${existing.error}`);
        const finding = existing.finding;

        const checklist = finding.triage_checklist;
        const checklistBlocksPromotion =
          checklist !== undefined &&
          TRIAGE_RULE_KEYS.some((key) => checklist[key]?.outcome === 'UNKNOWN' || checklist[key]?.outcome === 'FAIL');

        const promoted =
          reproStatus.value === 'statically_confirmed' &&
          finding.status === 'PROVISIONALLY_VALID' &&
          !checklistBlocksPromotion;

        const reproHints = typeof p.repro_hints === 'string' ? p.repro_hints.trim() : '';
        const updated: CapellaFinding = {
          ...finding,
          repro_status: reproStatus.value,
          ...(reproHints ? { repro_hints: reproHints } : {}),
          ...(promoted ? { status: 'VALID' as const } : {}),
          history: [
            ...finding.history,
            historyEntry(
              'confirm',
              promoted ? 'promoted_to_valid' : 'confirmed',
              `repro_status=${reproStatus.value}${promoted ? ' (PROVISIONALLY_VALID -> VALID)' : ''}`,
            ),
          ],
        };

        writeFinding(config.findingsDir, updated);
        confirmations.push({ id: findingId.id, reproStatus: reproStatus.value, promoted });
        guard.accept(findingId.id);
        return accepted({
          findingId: findingId.id,
          reproStatus: reproStatus.value,
          promoted,
          totalConfirmed: confirmations.length,
        });
      },
    }),
  ];

  return {
    tools,
    getConfirmations: () => [...confirmations],
    getAcceptedIds: guard.getAcceptedIds,
    getRejectionCounts: guard.getRejectionCounts,
  };
}

// === Record Calibration Collector (calibrate, report-only) ===

export interface CalibrationRecord {
  id: string;
  riskScore: number;
}

export interface CalibrationCollector extends VerdictCollectorIntegrity {
  tools: ToolDefinition[];
  getCalibrations: () => CalibrationRecord[];
}

/**
 * `record_calibration`: record the report-only risk calibration for one finding.
 *
 * This never changes the finding's `status`, its exported `severity` or the
 * export gate: the score and the fired sanity caps are read only by `report.md`.
 * It exists so an operator can see what the calibration would have said.
 */
export function createCalibrationCollector(config: VerdictCollectorConfig): CalibrationCollector {
  const calibrations: CalibrationRecord[] = [];
  const guard = createVerdictTracker(config.expectedIds);

  const tools: ToolDefinition[] = [
    defineTool({
      name: 'record_calibration',
      label: 'Record Calibration',
      description:
        'Record the report-only risk calibration for one finding: its risk score, the sanity caps that ' +
        "fired, and the 27-rule calibration checklist. This does not change the finding's severity or " +
        'whether it is exported — it is shown in the report for operator context.',
      parameters: Type.Object({
        finding_id: Type.String({ description: 'The id of the finding being calibrated.' }),
        impact_score: Type.Number({ description: 'Technical impact on the CIA triad, 1-5.' }),
        likelihood_score: Type.Number({ description: 'Probability of occurrence, 1-5.' }),
        mantis_risk_score: Type.Number({ description: 'Final calculated risk score, 0.1-10.' }),
        priority: severitySchema,
        sanity_triage_applied: Type.Optional(
          Type.String({ description: 'Semicolon-separated list of caps/downgrades that fired, or empty.' }),
        ),
        availability_tier: Type.Optional(Type.Union(CAPELLA_AVAILABILITY_TIERS.map((t) => Type.Literal(t)))),
        inferred_exposure: Type.Optional(Type.Union(CAPELLA_EXPOSURES.map((e) => Type.Literal(e)))),
        calibration_checklist: calibrationChecklistSchema,
      }),
      async execute(_toolCallId, params) {
        const p = params as Record<string, unknown>;

        const findingId = sanitizeFindingId(p.finding_id);
        if (!findingId.ok) return rejected(`finding_id: ${findingId.error}`);

        const impactScore = validateScore(p.impact_score, 'impact_score', 1, 5);
        if (!impactScore.ok) return rejected(impactScore.error);
        const likelihoodScore = validateScore(p.likelihood_score, 'likelihood_score', 1, 5);
        if (!likelihoodScore.ok) return rejected(likelihoodScore.error);
        const riskScore = validateScore(p.mantis_risk_score, 'mantis_risk_score', 0.1, 10);
        if (!riskScore.ok) return rejected(riskScore.error);

        const priority = validateEnum(p.priority, CAPELLA_SEVERITIES, 'priority');
        if (!priority.ok) return rejected(priority.error);

        const checklist = validateCalibrationChecklist(p.calibration_checklist);
        if (!checklist.ok) return rejected(checklist.error);

        let availabilityTier: (typeof CAPELLA_AVAILABILITY_TIERS)[number] | undefined;
        if (p.availability_tier !== undefined && p.availability_tier !== null) {
          const tier = validateEnum(p.availability_tier, CAPELLA_AVAILABILITY_TIERS, 'availability_tier');
          if (!tier.ok) return rejected(tier.error);
          availabilityTier = tier.value;
        }
        let inferredExposure: (typeof CAPELLA_EXPOSURES)[number] | undefined;
        if (p.inferred_exposure !== undefined) {
          const exposure = validateEnum(p.inferred_exposure, CAPELLA_EXPOSURES, 'inferred_exposure');
          if (!exposure.ok) return rejected(exposure.error);
          inferredExposure = exposure.value;
        }

        const integrityError = guard.check(findingId.id);
        if (integrityError) return rejected(integrityError);

        const existing = readFinding(config.findingsDir, findingId.id);
        if (!existing.ok) return rejected(`finding_id: ${existing.error}`);

        const sanityApplied = typeof p.sanity_triage_applied === 'string' ? p.sanity_triage_applied.trim() : '';
        const updated: CapellaFinding = {
          ...existing.finding,
          impact_score: impactScore.value,
          likelihood_score: likelihoodScore.value,
          mantis_risk_score: riskScore.value,
          priority: priority.value as CapellaSeverity,
          sanity_triage_applied: sanityApplied || null,
          ...(availabilityTier ? { availability_tier: availabilityTier } : {}),
          ...(inferredExposure ? { inferred_exposure: inferredExposure } : {}),
          calibration_checklist: checklist.checklist,
          history: [...existing.finding.history, historyEntry('calibrate', 'calibrated', `risk=${riskScore.value}`)],
        };

        writeFinding(config.findingsDir, updated);
        calibrations.push({ id: findingId.id, riskScore: riskScore.value });
        guard.accept(findingId.id);
        return accepted({ findingId: findingId.id, riskScore: riskScore.value, totalCalibrated: calibrations.length });
      },
    }),
  ];

  return {
    tools,
    getCalibrations: () => [...calibrations],
    getAcceptedIds: guard.getAcceptedIds,
    getRejectionCounts: guard.getRejectionCounts,
  };
}
