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

/** A queue entry the exploitation phase never returned a verdict for. */
export interface UnassessedQueueEntry {
  readonly id: string;
  readonly vulnerability_type?: string;
}

export interface ReportData {
  readonly report_meta: ReportMeta;
  readonly findings: readonly AddFindingInput[];
  // Vuln classes whose pipeline failed and were not assessed this run. Rendered as an explicit
  // caveat so an un-assessed class is never presented as a clean result.
  readonly not_assessed?: readonly VulnClass[];
  // Queue entries the exploitation phase left without a verdict. Rendered as an explicit coverage
  // gap so a vulnerability that was never examined is never absent from the report.
  readonly unassessed_queue_entries?: readonly UnassessedQueueEntry[];
}

type FindingStatus = NonNullable<AddFindingInput['status']>;

/**
 * The status a finding is presented under. `unstated` covers a record that carries no status of its
 * own: that is a fact about the record rather than a verdict about the finding, so it gets its own
 * value instead of borrowing the meaning of a status the run never stated.
 */
export type ReportedStatus = FindingStatus | 'unstated';

/**
 * How each status reads to the person holding the report. A finding no exploit confirmed must never
 * be presented in the same terms as one an exploit proved, and a finding the run chose not to pursue
 * must still say so rather than disappear.
 */
const STATUS_LABELS: Record<ReportedStatus, string> = {
  exploited: 'Exploited — confirmed by a working exploit',
  blocked_by_constraints: 'Not exploited — external constraints blocked validation',
  out_of_scope: 'Not exploited — outside the agreed attack scope',
  false_positive: 'Ruled out — investigated and determined not to be a vulnerability',
  unstated: 'Not confirmed — the record states no exploitation verdict for this finding',
};

/**
 * Short marker for the summary list, where the full status label would crowd the title. The
 * `false_positive` marker completes the vocabulary rather than serving that list: a rejected
 * candidate is held out of the vulnerability summary and reported in its own section.
 */
const STATUS_SUMMARY_MARKERS: Record<ReportedStatus, string> = {
  exploited: '',
  blocked_by_constraints: 'not exploited',
  out_of_scope: 'not exploited',
  false_positive: 'ruled out',
  unstated: 'verdict not recorded',
};

/**
 * The status a finding is reported under. A record stating no status resolves to `unstated`, never
 * to `exploited`: the report may claim only what the run established, and a silent record
 * establishes nothing — least of all a working exploit.
 */
export function findingStatus(finding: AddFindingInput): ReportedStatus {
  return finding.status ?? 'unstated';
}

/**
 * Whether the assessment investigated the candidate and rejected it. This holds in either run mode:
 * a rejected candidate is not a vulnerability, so no run mode may list it among them.
 */
function isRuledOut(finding: AddFindingInput): boolean {
  return findingStatus(finding) === 'false_positive';
}

/**
 * Whether a vulnerability reached the report without an exploit behind it. Only an exploitative run
 * draws this distinction: an analysis run demonstrates nothing at all, and says so in its own
 * disclaimer. Rejected candidates are not vulnerabilities and are reported on their own terms.
 */
function isUnproven(finding: AddFindingInput, exploitEnabled: boolean): boolean {
  if (!exploitEnabled) return false;
  if (isRuledOut(finding)) return false;
  return findingStatus(finding) !== 'exploited';
}

// Without this, an analysis-only report reads as though the impact was demonstrated.
const ANALYSIS_ONLY_DISCLAIMER = [
  '> Exploitation was not run for this assessment. Each finding documents a vulnerability',
  '> identified through analysis; impact is assessed rather than demonstrated, and no live',
  '> exploitation steps or proof of impact are included.',
].join('\n');

const UNEXPLOITED_SUBHEADING = 'Vulnerabilities Identified but Not Exploited';

const UNEXPLOITED_LEDE = [
  '> The vulnerabilities below were identified during exploitation but never confirmed by a working',
  '> exploit — an external constraint blocked validation, the run did not pursue them, or no verdict',
  '> was recorded for them. Impact is assessed rather than demonstrated, and the status line on each',
  '> finding says which case it is. None of them was shown to be safe.',
].join('\n');

const RULED_OUT_HEADING = 'Ruled Out — Investigated and Not Vulnerabilities';

const RULED_OUT_LEDE = [
  '> Each candidate below was investigated and rejected: the assessment determined it is not a',
  '> vulnerability. They are listed so the negative results can be audited, and they are excluded',
  '> from the vulnerability counts and findings above.',
].join('\n');

/** Customer-facing name for each vulnerability class, shared with the Typst adapter. */
export const NOT_ASSESSED_LABELS: Record<VulnClass, string> = {
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

const UNASSESSED_QUEUE_LEDE =
  'The exploitation phase returned no verdict for the queue entries below. They were neither confirmed ' +
  'nor ruled out, and their absence from the findings above is a gap in coverage rather than a clean ' +
  'result. Each one still needs triage:';

/**
 * Separates what an exploit proved from what it did not, names what was rejected, and names what was
 * never reached.
 *
 * The counts and the queue list belong in the document the customer reads: a vulnerability the run
 * declined to pursue, or never got to, is a fact about the assessment — and so is a candidate the run
 * examined and rejected.
 */
function renderCoverageSection(
  vulnerabilities: readonly AddFindingInput[],
  ruledOut: readonly AddFindingInput[],
  unassessed: readonly UnassessedQueueEntry[],
  exploitEnabled: boolean,
): string {
  const lines: string[] = ['## Assessment Coverage', ''];

  if (exploitEnabled) {
    const provenCount = vulnerabilities.filter((f) => findingStatus(f) === 'exploited').length;
    lines.push(`- Confirmed by a working exploit: ${provenCount}`);
    lines.push(`- Identified but not exploited: ${vulnerabilities.length - provenCount}`);
  }
  lines.push(`- Ruled out as not vulnerabilities: ${ruledOut.length}`);
  lines.push(`- Queue entries left without a verdict: ${unassessed.length}`);

  if (unassessed.length > 0) {
    lines.push('');
    lines.push(UNASSESSED_QUEUE_LEDE);
    lines.push('');
    for (const entry of unassessed) {
      const suffix = entry.vulnerability_type ? ` (${entry.vulnerability_type})` : '';
      lines.push(`- ${entry.id}${suffix}`);
    }
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
  // Every label below that would otherwise assert a demonstrated attack is restated as projected.
  const unproven = isUnproven(finding, exploitEnabled);

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
  // Always stated on an exploit run, including for a record that names no status: a reader cannot
  // audit a claim the report leaves off the page.
  if (exploitEnabled) {
    lines.push(`- **Status:** ${STATUS_LABELS[findingStatus(finding)]}`);
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
  lines.push(unproven ? '**Potential Impact:**' : '**Impact:**');
  lines.push(finding.impact);
  lines.push('');

  if (finding.exploitation_steps && finding.exploitation_steps.length > 0) {
    lines.push(unproven ? '**Projected Exploitation Path (not executed):**' : '**Exploitation Steps:**');
    lines.push('');
    for (let i = 0; i < finding.exploitation_steps.length; i++) {
      lines.push(renderStructuredStep(finding.exploitation_steps[i]!, i));
      lines.push('');
    }
  }

  if (finding.proof_of_impact && finding.proof_of_impact.length > 0) {
    lines.push(unproven ? '**Evidence of Vulnerability:**' : '**Proof of Impact:**');
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
// RULED-OUT RENDERING
// ============================================================================

/**
 * A rejected candidate is rendered as the negative result it is. It gets no impact, no remediation
 * and no exploitation path — those describe a vulnerability, and the assessment concluded this is
 * not one. What it does get is enough detail to check the rejection: what was examined, and what the
 * assessment concluded about it.
 */
function renderRuledOutFinding(finding: AddFindingInput): string {
  const lines: string[] = [];
  lines.push(`## ${finding.finding_id}: ${finding.title}`);
  lines.push('');
  lines.push(`- **Category:** ${finding.category}`);
  lines.push(`- **Location examined:** ${finding.vulnerable_location}`);
  lines.push(`- **Status:** ${STATUS_LABELS.false_positive}`);
  lines.push('');
  lines.push('**Assessment:**');
  lines.push(finding.overview);
  lines.push('');

  if (finding.notes && finding.notes.length > 0) {
    lines.push('**Notes:**');
    lines.push('');
    lines.push(renderStepItems(finding.notes));
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function renderRuledOutSection(ruledOut: readonly AddFindingInput[]): string {
  const sections: string[] = [`# ${RULED_OUT_HEADING}`, '', RULED_OUT_LEDE, ''];
  for (const finding of ruledOut) {
    sections.push(renderRuledOutFinding(finding));
    sections.push('');
  }
  return sections.join('\n').trimEnd();
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
  const { report_meta, findings, not_assessed = [], unassessed_queue_entries = [] } = data;
  const notAssessedClasses = [...new Set(not_assessed)];
  const exploitEnabled = report_meta.exploit ?? true;
  // A rejected candidate is not a vulnerability, so it is held out of every vulnerability list and
  // count below and reported in its own section instead — recorded, never counted as a finding.
  const ruledOut = findings.filter(isRuledOut);
  const vulnerabilities = findings.filter((f) => !isRuledOut(f));
  const unprovenCount = vulnerabilities.filter((f) => isUnproven(f, exploitEnabled)).length;
  const hasCoverageGap = unprovenCount > 0 || unassessed_queue_entries.length > 0 || ruledOut.length > 0;
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

  if (vulnerabilities.length === 0) {
    // Anything left unassessed makes a blanket "no vulnerabilities" statement a false clean bill of
    // health. Scope the clean statement to what completed and list every gap behind it.
    const nothingWasSkipped = notAssessedClasses.length === 0 && unassessed_queue_entries.length === 0;
    if (nothingWasSkipped) {
      sections.push('No vulnerabilities were identified during this assessment.');
    } else {
      sections.push('No vulnerabilities were identified in the parts of this assessment that completed.');
    }
    sections.push('');
    if (notAssessedClasses.length > 0) {
      sections.push(renderNotAssessedSection(notAssessedClasses));
      sections.push('');
    }
    if (hasCoverageGap) {
      sections.push(renderCoverageSection(vulnerabilities, ruledOut, unassessed_queue_entries, exploitEnabled));
      sections.push('');
    }
    // A run whose every candidate was rejected still owes the reader the rejections.
    if (ruledOut.length > 0) {
      sections.push(renderRuledOutSection(ruledOut));
    }
    return sections.join('\n').trimEnd() + '\n';
  }

  if (notAssessedClasses.length > 0) {
    sections.push(renderNotAssessedSection(notAssessedClasses));
    sections.push('');
  }

  if (hasCoverageGap) {
    sections.push(renderCoverageSection(vulnerabilities, ruledOut, unassessed_queue_entries, exploitEnabled));
    sections.push('');
  }

  // 2. Summary by Vulnerability Type
  const byCategory = new Map<string, AddFindingInput[]>();
  for (const f of vulnerabilities) {
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
      // A finding no exploit confirmed carries its marker here too, so the summary list cannot be
      // read as a list of proven exploits.
      const marker = exploitEnabled ? STATUS_SUMMARY_MARKERS[findingStatus(f)] : '';
      if (marker) {
        ratings.push(marker);
      }
      const suffix = ratings.length > 0 ? ` (${ratings.join(', ')})` : '';
      sections.push(`- **${f.finding_id}:** ${f.title}${suffix}`);
    }
    sections.push('');
  }

  // 3. Per-category finding sections
  const subheading = exploitEnabled ? 'Successfully Exploited Vulnerabilities' : 'Identified Vulnerabilities';

  for (const cat of sortedCategories) {
    const catFindings = byCategory.get(cat)!;
    const proven = catFindings.filter((f) => !isUnproven(f, exploitEnabled));
    const unproven = catFindings.filter((f) => isUnproven(f, exploitEnabled));
    // A category title claims exploitation only when something in it was actually exploited.
    const provenHeading = proven.length > 0 ? 'Exploitation Evidence' : 'Findings';
    const heading = exploitEnabled ? provenHeading : 'Findings';

    sections.push(`# ${cat} ${heading}`);
    sections.push('');

    if (proven.length > 0) {
      sections.push(`## ${subheading}`);
      sections.push('');
      for (const f of proven) {
        sections.push(renderFinding(f, exploitEnabled));
        sections.push('');
      }
    }

    // Kept apart from the proven set, and kept in the report: none of these was shown to be safe.
    if (unproven.length > 0) {
      sections.push(`## ${UNEXPLOITED_SUBHEADING}`);
      sections.push('');
      sections.push(UNEXPLOITED_LEDE);
      sections.push('');
      for (const f of unproven) {
        sections.push(renderFinding(f, exploitEnabled));
        sections.push('');
      }
    }
  }

  // 4. Ruled-out candidates
  if (ruledOut.length > 0) {
    sections.push(renderRuledOutSection(ruledOut));
    sections.push('');
  }

  return sections.join('\n').trimEnd() + '\n';
}
