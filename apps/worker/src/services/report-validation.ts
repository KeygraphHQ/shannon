// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { Value } from 'typebox/value';
import { fs, path } from 'zx';
import type { AddExploitInput, ExploitAuditDocument } from '../collectors/exploit-collector.js';
import { buildSchemas, exploitAuditFilename } from '../collectors/exploit-collector.js';
import type { Confidence, ReportConfig, Severity, VulnClass } from '../types/config.js';
import { ErrorCode } from '../types/errors.js';
import { PentestError } from './error-handling.js';

const SEVERITY_RANK: Record<Severity, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const CONFIDENCE_RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const REPORT_SECTION_ORDER: readonly VulnClass[] = ['injection', 'xss', 'auth', 'ssrf', 'authz'];
const EXPLOIT_SECTION_HEADINGS: Record<VulnClass, string> = {
  injection: 'Injection Exploitation Evidence',
  xss: 'Cross-Site Scripting (XSS) Exploitation Evidence',
  auth: 'Authentication Exploitation Evidence',
  ssrf: 'SSRF Exploitation Evidence',
  authz: 'Authorization Exploitation Evidence',
};
const FINDINGS_SECTION_HEADINGS: Record<VulnClass, string> = {
  injection: 'Injection Findings',
  xss: 'XSS Findings',
  auth: 'Authentication Findings',
  ssrf: 'SSRF Findings',
  authz: 'Authorization Findings',
};

/** Stable, non-secret identity for report settings that affect final-report semantics. */
export function fingerprintReportConfig(config: ReportConfig | undefined): string {
  const canonical = {
    minSeverity: config?.min_severity ?? null,
    minConfidence: config?.min_confidence ?? null,
    guidance: config?.guidance?.trim() || null,
  };
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

export interface ReportFindingExpectation {
  id: string;
  status: 'exploited' | 'blocked' | 'analysis';
  severity?: Severity;
  confidence?: Confidence;
}

export interface ReportExpectations {
  candidates: ReportFindingExpectation[];
  threshold_excluded_ids: string[];
  audit_only_ids: string[];
  section_headings: string[];
  unassessed_classes: VulnClass[];
  guidance?: string;
}

export interface ReportExclusion {
  vulnerability_id: string;
  reason: string;
}

export interface ReportExclusionDocument {
  schema_version: 1;
  guidance: string;
  exclusions: ReportExclusion[];
}

interface QueueEntry {
  ID?: unknown;
  confidence?: unknown;
  severity?: unknown;
}

interface QueueDocument {
  vulnerabilities?: unknown;
}

function validationFailure(message: string, context: Record<string, unknown>, retryable = false): never {
  throw new PentestError(
    message,
    'validation',
    retryable,
    context,
    retryable ? ErrorCode.OUTPUT_VALIDATION_FAILED : ErrorCode.AGENT_EXECUTION_FAILED,
  );
}

function isConfidence(value: unknown): value is Confidence {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isSeverity(value: unknown): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}

function passesThreshold(finding: ReportFindingExpectation, config: ReportConfig | undefined): boolean {
  if (finding.severity && config?.min_severity) {
    if (SEVERITY_RANK[finding.severity] < SEVERITY_RANK[config.min_severity]) return false;
  }
  if (finding.confidence && config?.min_confidence) {
    if (CONFIDENCE_RANK[finding.confidence] < CONFIDENCE_RANK[config.min_confidence]) return false;
  }
  return true;
}

function validateUniqueIds(ids: readonly string[], source: string, retryable = false): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  if (duplicates.size > 0) {
    validationFailure(`Duplicate vulnerability IDs in ${source}`, { source, duplicateIds: [...duplicates] }, retryable);
  }
}

function parseAuditDocument(value: unknown, source: string, expectedClass: VulnClass): ExploitAuditDocument {
  if (typeof value !== 'object' || value === null) {
    validationFailure(`Invalid exploitation audit: ${source}`, { source, reason: 'document is not an object' });
  }
  const doc = value as Partial<ExploitAuditDocument>;
  if (
    doc.schema_version !== 1 ||
    doc.vulnerability_class !== expectedClass ||
    !Array.isArray(doc.queue_ids) ||
    !Array.isArray(doc.verdicts)
  ) {
    validationFailure(`Invalid exploitation audit: ${source}`, { source, reason: 'missing schema fields' });
  }
  const queueIds = doc.queue_ids as unknown[];
  if (queueIds.some((id) => typeof id !== 'string' || id.trim() === '')) {
    validationFailure(`Invalid exploitation audit queue IDs: ${source}`, { source });
  }
  const verdicts = doc.verdicts as unknown[];
  if (
    verdicts.some(
      (entry) =>
        typeof entry !== 'object' ||
        entry === null ||
        !('vulnerability_id' in entry) ||
        typeof entry.vulnerability_id !== 'string' ||
        !('status' in entry) ||
        !['exploited', 'blocked', 'false_positive', 'out_of_scope'].includes(String(entry.status)),
    )
  ) {
    validationFailure(`Invalid exploitation audit verdicts: ${source}`, { source });
  }
  validateUniqueIds(queueIds as string[], source);
  validateUniqueIds(
    verdicts.map((entry) => (entry as AddExploitInput).vulnerability_id),
    source,
  );
  const queueSet = new Set(queueIds as string[]);
  const { StrictSchema } = buildSchemas(queueSet);
  for (const verdict of verdicts) {
    if (!Value.Check(StrictSchema, verdict)) {
      validationFailure(`Invalid per-status exploitation verdict in ${source}`, {
        source,
        vulnerabilityId: (verdict as Partial<AddExploitInput>).vulnerability_id,
      });
    }
  }
  const verdictIds = new Set(verdicts.map((entry) => (entry as AddExploitInput).vulnerability_id));
  const missingIds = [...queueSet].filter((id) => !verdictIds.has(id));
  const unexpectedIds = [...verdictIds].filter((id) => !queueSet.has(id));
  if (missingIds.length > 0 || unexpectedIds.length > 0) {
    validationFailure(`Incomplete exploitation audit: ${source}`, { source, missingIds, unexpectedIds });
  }
  return doc as ExploitAuditDocument;
}

async function readQueueEntries(dir: string, vulnClass: VulnClass): Promise<QueueEntry[]> {
  const queuePath = path.join(dir, `${vulnClass}_exploitation_queue.json`);
  if (!(await fs.pathExists(queuePath))) {
    validationFailure(`Missing selected-class exploitation queue: ${queuePath}`, { queuePath, vulnClass });
  }
  const doc = (await fs.readJson(queuePath)) as QueueDocument;
  if (!Array.isArray(doc.vulnerabilities)) {
    validationFailure(`Invalid exploitation queue: ${queuePath}`, {
      queuePath,
      reason: 'missing vulnerabilities array',
    });
  }
  const entries = doc.vulnerabilities as QueueEntry[];
  const ids: string[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || typeof entry.ID !== 'string' || entry.ID.trim() === '') {
      validationFailure(`Invalid vulnerability ID in ${queuePath}`, { queuePath });
    }
    if (!isConfidence(entry.confidence)) {
      validationFailure(`Invalid vulnerability confidence in ${queuePath}`, {
        queuePath,
        vulnerabilityId: entry.ID,
        confidence: entry.confidence,
      });
    }
    if (!isSeverity(entry.severity)) {
      validationFailure(`Invalid vulnerability severity in ${queuePath}`, {
        queuePath,
        vulnerabilityId: entry.ID,
        severity: entry.severity,
      });
    }
    ids.push(entry.ID);
  }
  validateUniqueIds(ids, queuePath);
  return entries;
}

async function readExploitExpectations(
  dir: string,
  vulnClasses: readonly VulnClass[],
): Promise<{ findings: ReportFindingExpectation[]; auditOnlyIds: string[] }> {
  const findings: ReportFindingExpectation[] = [];
  const auditOnlyIds: string[] = [];
  for (const vulnClass of vulnClasses) {
    const queueEntries = await readQueueEntries(dir, vulnClass);
    const queueIds = queueEntries.map((entry) => entry.ID as string);
    const queueRatings = new Map(
      queueEntries.map((entry) => [
        entry.ID as string,
        { severity: entry.severity as Severity, confidence: entry.confidence as Confidence },
      ]),
    );
    const auditPath = path.join(dir, exploitAuditFilename(vulnClass));
    if (!(await fs.pathExists(auditPath))) {
      if (queueIds.length === 0) continue;
      validationFailure(`Missing exploitation audit for nonempty selected-class queue: ${auditPath}`, {
        auditPath,
        vulnClass,
        queueIds,
      });
    }
    const document = parseAuditDocument(await fs.readJson(auditPath), auditPath, vulnClass);
    const auditQueueIds = new Set(document.queue_ids);
    const queueIdSet = new Set(queueIds);
    const missingAuditIds = queueIds.filter((id) => !auditQueueIds.has(id));
    const staleAuditIds = document.queue_ids.filter((id) => !queueIdSet.has(id));
    if (missingAuditIds.length > 0 || staleAuditIds.length > 0) {
      validationFailure(`Exploitation audit does not match queue for ${vulnClass}`, {
        vulnClass,
        missingAuditIds,
        staleAuditIds,
      });
    }
    for (const verdict of document.verdicts) {
      const queueRating = queueRatings.get(verdict.vulnerability_id);
      if (!queueRating) {
        validationFailure(`Missing queue rating for exploitation verdict ${verdict.vulnerability_id}`, {
          vulnClass,
          vulnerabilityId: verdict.vulnerability_id,
        });
      }
      if (verdict.status === 'exploited') {
        findings.push({
          id: verdict.vulnerability_id,
          status: 'exploited',
          severity: verdict.severity,
          confidence: queueRating.confidence,
        });
      } else if (verdict.status === 'blocked') {
        findings.push({
          id: verdict.vulnerability_id,
          status: 'blocked',
          severity: queueRating.severity,
          confidence: verdict.confidence,
        });
      } else {
        auditOnlyIds.push(verdict.vulnerability_id);
      }
    }
  }
  return { findings, auditOnlyIds };
}

async function readAnalysisExpectations(
  dir: string,
  vulnClasses: readonly VulnClass[],
): Promise<ReportFindingExpectation[]> {
  const findings: ReportFindingExpectation[] = [];
  for (const vulnClass of vulnClasses) {
    for (const entry of await readQueueEntries(dir, vulnClass)) {
      findings.push({
        id: entry.ID as string,
        status: 'analysis',
        confidence: entry.confidence as Confidence,
        severity: entry.severity as Severity,
      });
    }
  }
  return findings;
}

export async function buildReportExpectations(
  dir: string,
  vulnClasses: readonly VulnClass[],
  exploit: boolean,
  reportConfig: ReportConfig | undefined,
  unassessedClasses: readonly VulnClass[] = [],
): Promise<ReportExpectations> {
  const { findings, auditOnlyIds } = exploit
    ? await readExploitExpectations(dir, vulnClasses)
    : { findings: await readAnalysisExpectations(dir, vulnClasses), auditOnlyIds: [] };
  validateUniqueIds(
    findings.map((finding) => finding.id),
    'report expectations',
  );
  validateUniqueIds(auditOnlyIds, 'report audit-only expectations');

  const candidates: ReportFindingExpectation[] = [];
  const thresholdExcludedIds: string[] = [];
  for (const finding of findings) {
    if (passesThreshold(finding, reportConfig)) candidates.push(finding);
    else thresholdExcludedIds.push(finding.id);
  }

  const assembledPath = path.join(dir, 'comprehensive_security_assessment_report.md');
  if (!(await fs.pathExists(assembledPath))) {
    validationFailure('Assembled report is missing before executive cleanup', { assembledPath });
  }
  const assembledContent = await fs.readFile(assembledPath, 'utf8');
  const observedHeadings = topLevelHeadings(assembledContent);
  const selectedSet = new Set(vulnClasses);
  const sectionHeadings: string[] = [];
  for (const vulnClass of REPORT_SECTION_ORDER) {
    if (!selectedSet.has(vulnClass)) continue;
    sectionHeadings.push(exploit ? EXPLOIT_SECTION_HEADINGS[vulnClass] : FINDINGS_SECTION_HEADINGS[vulnClass]);
  }
  let priorIndex = -1;
  for (const heading of sectionHeadings) {
    const indices = observedHeadings
      .map((candidate, index) => (candidate === heading ? index : -1))
      .filter((index) => index >= 0);
    const firstIndex = indices[0];
    if (indices.length !== 1 || firstIndex === undefined || firstIndex <= priorIndex) {
      validationFailure('Assembled report is missing, duplicating, or reordering a canonical class section', {
        assembledPath,
        heading,
        observedHeadings,
      });
    }
    priorIndex = firstIndex;
  }
  if (sectionHeadings.length !== vulnClasses.length) {
    validationFailure('Report expectations do not cover every selected successful class', {
      assembledPath,
      expectedClassCount: vulnClasses.length,
      sectionHeadings,
    });
  }

  return {
    candidates,
    threshold_excluded_ids: thresholdExcludedIds,
    audit_only_ids: auditOnlyIds,
    section_headings: sectionHeadings,
    unassessed_classes: [...unassessedClasses],
    ...(reportConfig?.guidance?.trim() && { guidance: reportConfig.guidance.trim() }),
  };
}

function toolResult(payload: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], details: undefined };
}

function topLevelHeadings(content: string): string[] {
  const headings: string[] = [];
  let fenceMarker: string | null = null;
  for (const line of content.split(/\r?\n/)) {
    const fence = line.match(/^\s*(```+|~~~+)/);
    if (fence) {
      const marker = line.trimStart().charAt(0);
      if (fenceMarker === null) fenceMarker = marker;
      else if (fenceMarker === marker) fenceMarker = null;
      continue;
    }
    if (fenceMarker !== null) continue;
    const heading = line.match(/^#\s+(.+?)\s*$/);
    if (heading?.[1]) headings.push(heading[1].trim());
  }
  return headings;
}

export interface ReportExclusionCollector {
  tools: ToolDefinition[];
  getAll(): ReportExclusion[];
}

export function createReportExclusionCollector(validIds: ReadonlySet<string>): ReportExclusionCollector {
  const exclusions: ReportExclusion[] = [];
  const tool = defineTool({
    name: 'exclude_report_finding',
    label: 'Exclude Report Finding',
    description:
      'Record one finding intentionally omitted because it matches the user-supplied report guidance. ' +
      'Do not call for minimum-severity/minimum-confidence filtering or for false-positive/out-of-scope verdicts.',
    parameters: Type.Object({
      vulnerability_id: Type.String({ minLength: 1, description: 'Exact candidate vulnerability ID.' }),
      reason: Type.String({
        minLength: 1,
        description: 'Why the user-supplied report guidance requires this finding to be omitted.',
      }),
    }),
    async execute(_toolCallId, input) {
      if (!validIds.has(input.vulnerability_id)) {
        return toolResult({
          status: 'error',
          errorType: 'ValidationError',
          retryable: true,
          message: `Unknown or already threshold-filtered vulnerability ID: ${input.vulnerability_id}`,
        });
      }
      if (exclusions.some((entry) => entry.vulnerability_id === input.vulnerability_id)) {
        return toolResult({
          status: 'error',
          errorType: 'DuplicateError',
          retryable: false,
          message: `Finding ${input.vulnerability_id} already has an exclusion decision.`,
        });
      }
      exclusions.push({ vulnerability_id: input.vulnerability_id, reason: input.reason });
      return toolResult({ status: 'success', excluded: input.vulnerability_id });
    },
  });
  return { tools: [tool], getAll: () => [...exclusions] };
}

export function validateReportStructure(content: string): string[] {
  const issues: string[] = [];
  const normalized = content.replace(/^\uFEFF/, '').trimStart();
  if (!/^# Security Assessment Report(?:\r?\n|$)/.test(normalized)) {
    issues.push('report must start with `# Security Assessment Report`');
  }
  const summaryHeading = /^## Executive Summary\s*$/m.exec(normalized);
  let summaryBody = '';
  if (summaryHeading) {
    const beforeSummary = normalized
      .slice(0, summaryHeading.index)
      .replace(/^# Security Assessment Report\s*$/m, '')
      .trim();
    if (/^#{1,2}\s+/m.test(beforeSummary)) {
      issues.push('`## Executive Summary` must precede every other report section');
    }
    const remainder = normalized.slice(summaryHeading.index + summaryHeading[0].length);
    const nextSection = /^#{1,2}\s+/m.exec(remainder);
    summaryBody = remainder.slice(0, nextSection?.index ?? remainder.length).trim();
  }
  if (!summaryHeading || summaryBody === '') {
    issues.push('missing or empty `## Executive Summary` section');
  }
  if (/\[(?:section\s+\d+[^\]]*not provided|placeholder)[^\]]*\]/i.test(content)) {
    issues.push('contains a section placeholder marker');
  }
  if (/\b(?:TODO|TBD|PLACEHOLDER)\b/i.test(content)) {
    issues.push('contains an unresolved placeholder token');
  }
  return issues;
}

function headingCounts(content: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const match of content.matchAll(/^###\s+([^:\s]+)(?::|\s|$)/gm)) {
    const id = match[1];
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function assertReportComplete(
  content: string,
  expectations: ReportExpectations,
  exclusions: readonly ReportExclusion[],
): void {
  const issues = validateReportStructure(content);
  const counts = headingCounts(content);
  const candidateIds = new Set(expectations.candidates.map((finding) => finding.id));
  const exclusionIds = exclusions.map((entry) => entry.vulnerability_id);
  validateUniqueIds(exclusionIds, 'report exclusions', true);

  const invalidExclusions = exclusionIds.filter((id) => !candidateIds.has(id));
  if (invalidExclusions.length > 0) issues.push(`invalid exclusion IDs: ${invalidExclusions.join(', ')}`);
  if (exclusions.length > 0 && !expectations.guidance) {
    issues.push('finding exclusions were recorded without user-supplied report guidance');
  }

  const excludedSet = new Set(exclusionIds);
  for (const finding of expectations.candidates) {
    const headingCount = counts.get(finding.id) ?? 0;
    const exclusionCount = excludedSet.has(finding.id) ? 1 : 0;
    if (headingCount + exclusionCount !== 1) {
      issues.push(
        headingCount > 1
          ? `duplicate report heading for ${finding.id}`
          : headingCount === 1 && exclusionCount === 1
            ? `${finding.id} is both reported and excluded`
            : `lost reportable finding ${finding.id}`,
      );
    }
  }

  for (const id of [...expectations.threshold_excluded_ids, ...expectations.audit_only_ids]) {
    if ((counts.get(id) ?? 0) > 0) issues.push(`non-reportable finding ${id} appears in the report`);
  }

  const knownIds = new Set([...candidateIds, ...expectations.threshold_excluded_ids, ...expectations.audit_only_ids]);
  const hallucinatedIds = [...counts.keys()].filter((id) => /-VULN-\d+$/i.test(id) && !knownIds.has(id));
  if (hallucinatedIds.length > 0) issues.push(`unknown vulnerability headings: ${hallucinatedIds.join(', ')}`);

  const finalSectionHeadings = topLevelHeadings(content);
  const expectedSectionHeadings = ['Security Assessment Report', ...expectations.section_headings];
  if (
    finalSectionHeadings.length !== expectedSectionHeadings.length ||
    finalSectionHeadings.some((heading, index) => heading !== expectedSectionHeadings[index])
  ) {
    issues.push(
      `per-class section headings were lost, added, or reordered (expected: ${expectedSectionHeadings.join(' -> ')})`,
    );
  }

  if (expectations.unassessed_classes.length > 0) {
    const expectedDisclosure = `- Unassessed classes: ${expectations.unassessed_classes.join(', ')}`;
    if (!content.split(/\r?\n/).some((line) => line.trim() === expectedDisclosure)) {
      issues.push(`missing partial-assessment disclosure: ${expectedDisclosure}`);
    }
  }

  if (issues.length > 0) {
    validationFailure('Final report failed semantic validation', { issues }, true);
  }
}
