// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Programmatic adapter: report.json → Typst ReportData JSON.
 *
 * Converts the renderer-neutral structured report output (produced by the
 * finding-collector + set-report-meta CLI) into the Typst-specific schema that
 * report.typ consumes.
 *
 * All Typst-specific concepts (PascalCase enums, computed aggregations,
 * exploitedByType grouping) are confined to this file. The rest of the
 * pipeline knows nothing about the Typst shape.
 */

import type { AddFindingInput, AdditionalSection, StepItem, StructuredStep } from '../collectors/finding-collector.js';
import type { VulnClass } from '../types/config.js';
import type {
  ExploitsReportData,
  FindingsReportData,
  TypstCategory,
  TypstConfidence,
  ReportData as TypstReportData,
  TypstSeverity,
  TypstStatus,
  UnassessedEntry,
} from './report-output-schema.js';
import {
  findingStatus,
  NOT_ASSESSED_LABELS,
  type ReportData,
  type ReportedStatus,
  type UnassessedQueueEntry,
} from './report-renderer.js';

// ============================================================================
// COVERAGE PROJECTIONS
// ============================================================================

/**
 * An unassessed class is listed rather than dropped, so an incomplete assessment is never read as
 * a clean one.
 */
function toNotAssessedLabels(classes: readonly VulnClass[] | undefined): string[] {
  if (!classes || classes.length === 0) return [];
  return [...new Set(classes)].map((cls) => NOT_ASSESSED_LABELS[cls]);
}

/** Queue entries the exploitation phase never reached, carried into the customer-facing document. */
function toUnassessedEntries(entries: readonly UnassessedQueueEntry[] | undefined): UnassessedEntry[] {
  if (!entries) return [];
  return entries.map((entry) => ({
    id: entry.id,
    ...(entry.vulnerability_type && { vulnerabilityType: entry.vulnerability_type }),
  }));
}

// ============================================================================
// CASING TRANSFORMS
// ============================================================================

const SEVERITY_MAP: Record<string, TypstSeverity> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/**
 * Every status the document can present, including the absence of one. The map is total, so no
 * finding can reach the page under a verdict the run did not record.
 */
const STATUS_MAP: Record<ReportedStatus, TypstStatus> = {
  exploited: 'Exploited',
  out_of_scope: 'OutOfScope',
  blocked_by_constraints: 'BlockedByConstraints',
  false_positive: 'FalsePositive',
  unstated: 'Unstated',
};

const CONFIDENCE_MAP: Record<string, TypstConfidence> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const VALID_CATEGORIES = new Set<TypstCategory>([
  'Authentication',
  'Authorization',
  'XSS',
  'Injection',
  'SSRF',
  'Other',
]);

function toTypstSeverity(s: string): TypstSeverity {
  return SEVERITY_MAP[s] ?? 'Low';
}

function toTypstStatus(s: ReportedStatus): TypstStatus {
  return STATUS_MAP[s];
}

function toTypstConfidence(s: string): TypstConfidence {
  return CONFIDENCE_MAP[s] ?? 'Medium';
}

function toTypstCategory(s: string): TypstCategory {
  if (VALID_CATEGORIES.has(s as TypstCategory)) return s as TypstCategory;
  return 'Other';
}

// ============================================================================
// STEP / ITEM TRANSFORMS
// ============================================================================

function adaptStepItem(item: StepItem): StepItem {
  return item;
}

function adaptStep(step: StructuredStep, index: number): { number: number; title?: string; items: StepItem[] } {
  return {
    number: index + 1,
    ...(step.title && { title: step.title }),
    items: step.items.map(adaptStepItem),
  };
}

function adaptAdditionalSection(section: AdditionalSection): { heading: string; items: StepItem[] } {
  return {
    heading: section.heading,
    items: section.items.map(adaptStepItem),
  };
}

// ============================================================================
// STATUS PROJECTIONS
// ============================================================================

/**
 * Findings that still stand as vulnerabilities once the run is over. A false positive was
 * investigated and rejected, so it counts as neither a vulnerability nor an exploit and is kept out
 * of the aggregates the summary presents.
 */
function standingFindings(findings: readonly AddFindingInput[]): AddFindingInput[] {
  return findings.filter((finding) => findingStatus(finding) !== 'false_positive');
}

/**
 * Marker for a finding named on a single summary line, where the surrounding label cannot carry its
 * status. An exploited finding needs none.
 */
const STATUS_MARKERS: Record<ReportedStatus, string> = {
  exploited: '',
  blocked_by_constraints: 'not exploited — validation blocked',
  out_of_scope: 'not exploited — outside the agreed attack scope',
  false_positive: 'ruled out',
  unstated: 'not confirmed — no exploitation verdict recorded',
};

/**
 * Critical-severity findings for the summary enumeration. Each line states what the run established
 * about it, so the enumeration is never read as a list of proven exploits.
 */
function toCriticalFindingLines(findings: readonly AddFindingInput[]): string[] {
  return standingFindings(findings)
    .filter((finding) => finding.severity === 'critical')
    .map((finding) => {
      const marker = STATUS_MARKERS[findingStatus(finding)];
      if (marker === '') return `${finding.finding_id}: ${finding.title}`;
      return `${finding.finding_id}: ${finding.title} (${marker})`;
    });
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

interface CategoryGroup {
  category: TypstCategory;
  findings: AddFindingInput[];
}

function groupByCategory(findings: readonly AddFindingInput[]): CategoryGroup[] {
  const map = new Map<TypstCategory, AddFindingInput[]>();
  for (const f of findings) {
    const cat = toTypstCategory(f.category);
    const list = map.get(cat) ?? [];
    list.push(f);
    map.set(cat, list);
  }
  return Array.from(map.entries()).map(([category, fs]) => ({ category, findings: fs }));
}

function countBySeverity(findings: readonly AddFindingInput[]): Record<TypstSeverity, number> {
  const counts: Record<string, number> = {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
  };
  for (const f of findings) {
    const sev = toTypstSeverity(f.severity);
    counts[sev] = (counts[sev] ?? 0) + 1;
  }
  return counts as Record<TypstSeverity, number>;
}

// ============================================================================
// EXPLOIT MODE ADAPTER
// ============================================================================

function adaptExploitsMode(data: ReportData): ExploitsReportData {
  const { report_meta, findings, not_assessed, unassessed_queue_entries } = data;
  const groups = groupByCategory(findings);
  // Severity aggregates cover the vulnerabilities the run stands behind, so a rejected finding
  // inflates no severity card.
  const sevCounts = countBySeverity(standingFindings(findings));

  const statusCounts = { Exploited: 0, OutOfScope: 0, BlockedByConstraints: 0, FalsePositive: 0, Unstated: 0 };
  for (const f of findings) {
    const s = toTypstStatus(findingStatus(f));
    statusCounts[s]++;
  }

  const exploitedFindings = findings.filter((f) => findingStatus(f) === 'exploited');

  return {
    mode: 'exploits' as const,
    meta: {
      target: report_meta.target,
      assessmentDate: report_meta.assessment_date,
      classification: 'CONFIDENTIAL',
    },
    scope: report_meta.scope,
    executiveSummary: report_meta.executive_summary,
    notAssessed: toNotAssessedLabels(not_assessed),
    unassessedQueueEntries: toUnassessedEntries(unassessed_queue_entries),
    exploitedByType: groups.map((g) => {
      const exploited = g.findings.filter((f) => findingStatus(f) === 'exploited');
      if (exploited.length === 0) {
        return {
          category: g.category,
          narrative: `No ${g.category.toLowerCase()} vulnerabilities were successfully exploited during this assessment.`,
        };
      }
      return {
        category: g.category,
        bullets: exploited.map((f) => ({ id: f.finding_id, description: f.title })),
      };
    }),
    summary: {
      totalIdentified: standingFindings(findings).length,
      successfullyExploited: exploitedFindings.length,
      exploitedBreakdown: groups
        .map((g) => ({
          category: g.category,
          count: g.findings.filter((f) => findingStatus(f) === 'exploited').length,
        }))
        .filter((e) => e.count > 0),
      criticalFindings: toCriticalFindingLines(findings),
    },
    findings: findings.map((f) => ({
      id: f.finding_id,
      title: f.title,
      category: toTypstCategory(f.category),
      owaspCategory: f.owasp_category,
      severity: toTypstSeverity(f.severity),
      status: toTypstStatus(findingStatus(f)),
      ...(f.confidence && { confidence: toTypstConfidence(f.confidence) }),
      summary: {
        vulnerableLocation: f.vulnerable_location,
        overview: f.overview,
        impact: f.impact,
      },
      // This branch only runs for an exploitative report, where the schema made these
      // required. The fallbacks keep the superset type honest rather than assuming.
      prerequisites: f.prerequisites ?? '',
      exploitationSteps: (f.exploitation_steps ?? []).map(adaptStep),
      proofOfImpact: (f.proof_of_impact ?? []).map(adaptStepItem),
      remediation: f.remediation,
      ...(f.notes && f.notes.length > 0 && { notes: f.notes.map(adaptStepItem) }),
      ...(f.additional_sections &&
        f.additional_sections.length > 0 && {
          additionalSections: f.additional_sections.map(adaptAdditionalSection),
        }),
    })),
    derivedCounts: {
      bySeverity: sevCounts,
      byStatus: statusCounts,
    },
  };
}

// ============================================================================
// FINDINGS MODE ADAPTER
// ============================================================================

function adaptFindingsMode(data: ReportData): FindingsReportData {
  const { report_meta, findings, not_assessed, unassessed_queue_entries } = data;
  const groups = groupByCategory(findings);
  const sevCounts = countBySeverity(findings);

  const confidenceCounts = { High: 0, Medium: 0, Low: 0 };
  for (const f of findings) {
    const c = toTypstConfidence(f.confidence ?? 'medium');
    confidenceCounts[c]++;
  }

  return {
    mode: 'findings' as const,
    meta: {
      target: report_meta.target,
      assessmentDate: report_meta.assessment_date,
      classification: 'CONFIDENTIAL',
    },
    scope: report_meta.scope,
    executiveSummary: report_meta.executive_summary,
    notAssessed: toNotAssessedLabels(not_assessed),
    unassessedQueueEntries: toUnassessedEntries(unassessed_queue_entries),
    identifiedByType: groups.map((g) => {
      if (g.findings.length === 0) {
        return {
          category: g.category,
          narrative: `No ${g.category.toLowerCase()} vulnerabilities were identified during this assessment.`,
        };
      }
      return {
        category: g.category,
        bullets: g.findings.map((f) => ({ id: f.finding_id, description: f.title })),
      };
    }),
    summary: {
      totalIdentified: findings.length,
      identifiedBreakdown: groups.map((g) => ({
        category: g.category,
        count: g.findings.length,
      })),
      criticalFindings: findings.filter((f) => f.severity === 'critical').map((f) => `${f.finding_id}: ${f.title}`),
    },
    findings: findings.map((f) => ({
      id: f.finding_id,
      title: f.title,
      category: toTypstCategory(f.category),
      owaspCategory: f.owasp_category,
      severity: toTypstSeverity(f.severity),
      confidence: toTypstConfidence(f.confidence ?? 'medium'),
      summary: {
        vulnerableLocation: f.vulnerable_location,
        overview: f.overview,
        impact: f.impact,
      },
      remediation: f.remediation,
      ...(f.notes && f.notes.length > 0 && { notes: f.notes.map(adaptStepItem) }),
      ...(f.additional_sections &&
        f.additional_sections.length > 0 && {
          additionalSections: f.additional_sections.map(adaptAdditionalSection),
        }),
    })),
    derivedCounts: {
      bySeverity: sevCounts,
      byConfidence: confidenceCounts,
    },
  };
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function adaptReportToTypst(data: ReportData): TypstReportData {
  const exploitEnabled = data.report_meta.exploit ?? true;
  if (exploitEnabled) {
    return adaptExploitsMode(data);
  }
  return adaptFindingsMode(data);
}
