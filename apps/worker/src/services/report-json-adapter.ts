// Copyright (C) 2026 Keygraph, Inc.
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

import type {
  AddFindingInput,
  AdditionalSection,
  StepItem as CollectorStepItem,
  StructuredStep,
} from '../collectors/finding-collector.js';
import { orderFindings } from './finding-order.js';
import type {
  ExploitsReportData,
  FindingsReportData,
  TypstCategory,
  TypstConfidence,
  ReportData as TypstReportData,
  TypstSeverity,
  TypstStatus,
  StepItem as TypstStepItem,
} from './report-output-schema.js';
import type { ReportData } from './report-renderer.js';

const COMPLETE_COVERAGE = { status: 'complete' as const, limitations: [] as const };

// ============================================================================
// CASING TRANSFORMS
// ============================================================================

const SEVERITY_MAP: Record<string, TypstSeverity> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const STATUS_MAP: Record<string, TypstStatus> = {
  exploited: 'Exploited',
  out_of_scope: 'OutOfScope',
  blocked_by_constraints: 'BlockedByConstraints',
  false_positive: 'FalsePositive',
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
  'Miscellaneous',
]);

function toTypstSeverity(s: string): TypstSeverity {
  return SEVERITY_MAP[s] ?? 'Low';
}

function toTypstStatus(s: string): TypstStatus {
  return STATUS_MAP[s] ?? 'Exploited';
}

function toTypstConfidence(s: string): TypstConfidence {
  return CONFIDENCE_MAP[s] ?? 'Medium';
}

function toTypstCategory(s: string): TypstCategory {
  if (VALID_CATEGORIES.has(s as TypstCategory)) return s as TypstCategory;
  return 'Miscellaneous';
}

// ============================================================================
// STEP / ITEM TRANSFORMS
// ============================================================================

// Typst raw blocks do not wrap long lines. Keep the exact payload in `content` and derive a separate
// display-only projection with inserted line breaks for the PDF. Canonical JSON, Markdown, SARIF,
// and the exact Typst-side payload remain byte-for-byte intact.
const PDF_CODE_LINE_COLUMNS = 84;

function wrapCodeForPdf(content: string): string {
  return content
    .split('\n')
    .flatMap((line) => {
      const characters = Array.from(line);
      if (characters.length <= PDF_CODE_LINE_COLUMNS) return [line];

      const wrapped: string[] = [];
      for (let offset = 0; offset < characters.length; offset += PDF_CODE_LINE_COLUMNS) {
        wrapped.push(characters.slice(offset, offset + PDF_CODE_LINE_COLUMNS).join(''));
      }
      return wrapped;
    })
    .join('\n');
}

function adaptStepItem(item: CollectorStepItem): TypstStepItem {
  if (item.kind === 'prose') return item;
  return {
    kind: 'code',
    block: {
      language: item.block.language,
      content: item.block.content,
      displayContent: wrapCodeForPdf(item.block.content),
    },
  };
}

function adaptStep(step: StructuredStep, index: number): { number: number; title?: string; items: TypstStepItem[] } {
  return {
    number: index + 1,
    ...(step.title && { title: step.title }),
    items: step.items.map(adaptStepItem),
  };
}

function adaptAdditionalSection(section: AdditionalSection): { heading: string; items: TypstStepItem[] } {
  return {
    heading: section.heading,
    items: section.items.map(adaptStepItem),
  };
}

// ============================================================================
// AGGREGATION HELPERS
// ============================================================================

interface CategoryGroup {
  category: TypstCategory;
  findings: AddFindingInput[];
}

// Groups in insertion order, so callers must pass findings already ordered by category
// (orderFindings) for the resulting groups to come out in CATEGORY_ORDER: this function does
// not re-sort the groups it produces.
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
  const { report_meta } = data;
  const findings = orderFindings(data.findings);
  const groups = groupByCategory(findings);
  const sevCounts = countBySeverity(findings);

  const statusCounts = { Exploited: 0, OutOfScope: 0, BlockedByConstraints: 0, FalsePositive: 0 };
  for (const f of findings) {
    const s = toTypstStatus(f.status ?? 'exploited');
    statusCounts[s]++;
  }

  const exploitedFindings = findings.filter((f) => (f.status ?? 'exploited') === 'exploited');

  return {
    mode: 'exploits' as const,
    meta: {
      target: report_meta.target,
      assessmentDate: report_meta.assessment_date,
      classification: 'CONFIDENTIAL',
    },
    executiveSummary: report_meta.executive_summary,
    scope: report_meta.scope,
    coverage: report_meta.coverage ?? COMPLETE_COVERAGE,
    exploitedByType: groups.map((g) => {
      const exploited = g.findings.filter((f) => (f.status ?? 'exploited') === 'exploited');
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
      totalIdentified: findings.length,
      successfullyExploited: exploitedFindings.length,
      exploitedBreakdown: groups
        .map((g) => ({
          category: g.category,
          count: g.findings.filter((f) => (f.status ?? 'exploited') === 'exploited').length,
        }))
        .filter((e) => e.count > 0),
      criticalFindings: findings.filter((f) => f.severity === 'critical').map((f) => `${f.finding_id}: ${f.title}`),
    },
    findings: findings.map((f) => ({
      id: f.finding_id,
      title: f.title,
      category: toTypstCategory(f.category),
      severity: toTypstSeverity(f.severity),
      owaspCategory: f.owasp_category,
      ...(f.auth_state && { authState: f.auth_state }),
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
  const { report_meta } = data;
  const findings = orderFindings(data.findings);
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
    executiveSummary: report_meta.executive_summary,
    scope: report_meta.scope,
    coverage: report_meta.coverage ?? COMPLETE_COVERAGE,
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
      severity: toTypstSeverity(f.severity),
      confidence: toTypstConfidence(f.confidence ?? 'medium'),
      owaspCategory: f.owasp_category,
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
