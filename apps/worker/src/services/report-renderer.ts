// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic report.json → markdown renderer.
 *
 * Converts the structured report output (produced by the finding-collector
 * tool + set-report-meta CLI) into the same markdown format that the
 * report agent previously wrote by hand. No LLM in the loop.
 */

import { BRAND_LOCKUP } from '../branding.js';
import type { AddFindingInput, AdditionalSection, StepItem, StructuredStep } from '../collectors/finding-collector.js';
import type { VulnClass } from '../types/config.js';

// ============================================================================
// TYPES
// ============================================================================

export interface ReportMeta {
  readonly target: string;
  readonly assessment_date: string;
  readonly scope: string;
  readonly executive_summary: string;
  readonly exploit?: boolean;
  readonly model?: string;
}

export interface ReportData {
  readonly report_meta: ReportMeta;
  readonly findings: readonly AddFindingInput[];
  // Vuln classes whose pipeline failed and were not assessed this run. Rendered as an explicit
  // caveat so an un-assessed class is never presented as a clean result.
  readonly not_assessed?: readonly VulnClass[];
}

// Without this, an analysis-only report reads as though the impact was demonstrated.
const ANALYSIS_ONLY_DISCLAIMER = [
  '> Exploitation was not run for this assessment. Each finding documents a vulnerability',
  '> identified through analysis; impact is assessed rather than demonstrated, and no live',
  '> exploitation steps or proof of impact are included.',
].join('\n');

const NOT_ASSESSED_LABELS: Record<VulnClass, string> = {
  auth: 'Authentication',
  authz: 'Authorization',
  xss: 'Cross-Site Scripting (XSS)',
  injection: 'SQL/Command Injection',
  ssrf: 'Server-Side Request Forgery (SSRF)',
};

function renderNotAssessedSection(notAssessed: readonly VulnClass[]): string {
  const lines: string[] = ['## Not Assessed', ''];
  lines.push(
    'The following vulnerability classes were NOT assessed in this run because their analysis did ' +
      'not complete. Absence of findings for these classes does not indicate they are clean — re-run ' +
      'to assess them:',
  );
  lines.push('');
  for (const cls of notAssessed) {
    lines.push(`- ${NOT_ASSESSED_LABELS[cls]} — analysis did not complete; not assessed.`);
  }
  return lines.join('\n');
}

// ============================================================================
// STEP ITEM RENDERING
// ============================================================================

function renderStepItem(item: StepItem): string {
  if (item.kind === 'prose') {
    return item.text;
  }
  const lang = item.block.language || '';
  return `\`\`\`${lang}\n${item.block.content}\n\`\`\``;
}

function renderStepItems(items: readonly StepItem[]): string {
  return items.map(renderStepItem).join('\n\n');
}

function renderStructuredStep(step: StructuredStep, index: number): string {
  const lines: string[] = [];
  const title = step.title ? `**Step ${index + 1}: ${step.title}**` : `**Step ${index + 1}**`;
  lines.push(title);
  lines.push('');
  lines.push(renderStepItems(step.items));
  return lines.join('\n');
}

function renderAdditionalSection(section: AdditionalSection): string {
  const lines: string[] = [];
  lines.push(`#### ${section.heading}`);
  lines.push('');
  lines.push(renderStepItems(section.items));
  return lines.join('\n');
}

// ============================================================================
// FINDING RENDERING
// ============================================================================

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function renderFinding(finding: AddFindingInput, exploitEnabled: boolean): string {
  const lines: string[] = [];

  // Heading
  lines.push(`### ${finding.finding_id}: ${finding.title}`);
  lines.push('');

  // Each row is emitted only when the mode that produced the finding supplied its field.
  lines.push('**Summary:**');
  if (finding.severity) {
    lines.push(`- **Severity:** ${titleCase(finding.severity)}`);
  }
  if (finding.confidence) {
    lines.push(`- **Confidence:** ${titleCase(finding.confidence)}`);
  }
  lines.push(`- **OWASP:** ${finding.owasp_category}`);
  lines.push(`- **Vulnerable location:** ${finding.vulnerable_location}`);
  if (finding.auth_state) {
    lines.push(`- **Auth state:** ${finding.auth_state}`);
  }
  if (exploitEnabled && finding.status) {
    lines.push(`- **Status:** ${titleCase(finding.status)}`);
  }
  if (finding.prerequisites) {
    lines.push(`- **Prerequisites:** ${finding.prerequisites}`);
  }
  lines.push('');

  // Overview
  lines.push('**Overview:**');
  lines.push(finding.overview);
  lines.push('');

  // Impact
  lines.push('**Impact:**');
  lines.push(finding.impact);
  lines.push('');

  if (finding.exploitation_steps && finding.exploitation_steps.length > 0) {
    lines.push('**Exploitation Steps:**');
    lines.push('');
    for (let i = 0; i < finding.exploitation_steps.length; i++) {
      lines.push(renderStructuredStep(finding.exploitation_steps[i]!, i));
      lines.push('');
    }
  }

  if (finding.proof_of_impact && finding.proof_of_impact.length > 0) {
    lines.push('**Proof of Impact:**');
    lines.push('');
    lines.push(renderStepItems(finding.proof_of_impact));
    lines.push('');
  }

  // Remediation
  lines.push('**Remediation:**');
  lines.push(finding.remediation);
  lines.push('');

  // Notes
  if (finding.notes && finding.notes.length > 0) {
    lines.push('**Notes:**');
    lines.push('');
    lines.push(renderStepItems(finding.notes));
    lines.push('');
  }

  // Additional sections
  if (finding.additional_sections && finding.additional_sections.length > 0) {
    for (const section of finding.additional_sections) {
      lines.push(renderAdditionalSection(section));
      lines.push('');
    }
  }

  return lines.join('\n').trimEnd();
}

// ============================================================================
// CATEGORY GROUPING
// ============================================================================

const CATEGORY_ORDER: readonly string[] = ['Injection', 'XSS', 'Authentication', 'SSRF', 'Authorization'];

function categorySort(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(a);
  const bi = CATEGORY_ORDER.indexOf(b);
  if (ai !== -1 && bi !== -1) return ai - bi;
  if (ai !== -1) return -1;
  if (bi !== -1) return 1;
  return a.localeCompare(b);
}

// ============================================================================
// REPORT RENDERING
// ============================================================================

export function renderReport(data: ReportData): string {
  const { report_meta, findings, not_assessed = [] } = data;
  const notAssessedClasses = [...new Set(not_assessed)];
  const exploitEnabled = report_meta.exploit ?? true;
  const sections: string[] = [];

  // 1. Executive Summary
  sections.push('# Security Assessment Report');
  sections.push('');
  sections.push(`*${BRAND_LOCKUP}*`);
  sections.push('');
  sections.push('## Executive Summary');
  sections.push(`- Target: ${report_meta.target}`);
  sections.push(`- Assessment Date: ${report_meta.assessment_date}`);
  sections.push(`- Scope: ${report_meta.scope}`);
  sections.push(`- Exploitation: ${exploitEnabled ? 'enabled' : 'disabled'}`);
  if (report_meta.model) {
    sections.push(`- Model: ${report_meta.model}`);
  }
  sections.push('');
  sections.push(report_meta.executive_summary);
  sections.push('');
  if (!exploitEnabled) {
    sections.push(ANALYSIS_ONLY_DISCLAIMER);
    sections.push('');
  }

  if (findings.length === 0) {
    if (notAssessedClasses.length > 0) {
      // Some classes were not assessed — a blanket "no vulnerabilities" statement would be a false
      // clean bill of health. Scope the clean statement to assessed classes and list the gaps.
      sections.push('No vulnerabilities were identified in the classes that were assessed.');
      sections.push('');
      sections.push(renderNotAssessedSection(notAssessedClasses));
    } else {
      sections.push('No vulnerabilities were identified during this assessment.');
    }
    return sections.join('\n').trimEnd() + '\n';
  }

  if (notAssessedClasses.length > 0) {
    sections.push(renderNotAssessedSection(notAssessedClasses));
    sections.push('');
  }

  // 2. Summary by Vulnerability Type
  const byCategory = new Map<string, AddFindingInput[]>();
  for (const f of findings) {
    const list = byCategory.get(f.category) ?? [];
    list.push(f);
    byCategory.set(f.category, list);
  }

  const sortedCategories = [...byCategory.keys()].sort(categorySort);

  sections.push('## Summary by Vulnerability Type');
  sections.push('');
  for (const cat of sortedCategories) {
    const catFindings = byCategory.get(cat)!;
    sections.push(`### ${cat}`);
    sections.push('');
    for (const f of catFindings) {
      // Both ratings when the mode produced both. Confidence is labelled so it is never
      // read as a severity in the position where a severity usually sits.
      const ratings: string[] = [];
      if (f.severity) {
        ratings.push(titleCase(f.severity));
      }
      if (f.confidence) {
        ratings.push(`${titleCase(f.confidence)} confidence`);
      }
      const suffix = ratings.length > 0 ? ` (${ratings.join(', ')})` : '';
      sections.push(`- **${f.finding_id}:** ${f.title}${suffix}`);
    }
    sections.push('');
  }

  // 3. Per-category finding sections
  const subheading = exploitEnabled ? 'Successfully Exploited Vulnerabilities' : 'Identified Vulnerabilities';
  const heading = exploitEnabled ? 'Exploitation Evidence' : 'Findings';

  for (const cat of sortedCategories) {
    const catFindings = byCategory.get(cat)!;
    sections.push(`# ${cat} ${heading}`);
    sections.push('');
    sections.push(`## ${subheading}`);
    sections.push('');
    for (const f of catFindings) {
      sections.push(renderFinding(f, exploitEnabled));
      sections.push('');
    }
  }

  return sections.join('\n').trimEnd() + '\n';
}
