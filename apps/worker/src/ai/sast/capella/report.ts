// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deterministic `report.md` rendering. There is no model call: the report is
 * built from the same structured records the SARIF is, keeping the LLM out of
 * the JSON-to-Markdown conversion.
 *
 * Unlike the SARIF, the report renders *every* finding, including those the
 * export gate drops, and surfaces the report-only calibration (`mantis_risk_score`,
 * `sanity_triage_applied`) so an operator can see what calibrate would have said.
 */

import type { CapellaFinding } from './finding-types.js';

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function riskLine(finding: CapellaFinding): string {
  if (finding.mantis_risk_score === undefined) return '';
  const caps = finding.sanity_triage_applied ? ` — caps: ${finding.sanity_triage_applied}` : '';
  const priority = finding.priority ? ` (${finding.priority})` : '';
  return `\n- **Calibrated risk:** ${finding.mantis_risk_score}/10${priority}${caps}`;
}

function renderFinding(finding: CapellaFinding): string {
  const location = finding.code_paths[0] ?? '(no location)'; // sink = primary location
  const viability = finding.production_viability ? ` · ${finding.production_viability}` : '';
  return [
    `### ${finding.title}`,
    '',
    `- **CWE:** ${finding.cwe}`,
    `- **Severity:** ${finding.severity}`,
    `- **Status:** ${finding.status}${viability}`,
    `- **Location:** \`${location}\``,
    `- **Code path:** ${[...finding.code_paths]
      .reverse()
      .map((p) => `\`${p}\``)
      .join(' → ')}`,
    riskLine(finding),
    '',
    finding.description,
    '',
    `**Impact:** ${finding.impact}`,
    '',
    `**Mitigation:** ${finding.mitigation}`,
    finding.reasoning ? `\n**Reviewer reasoning:** ${finding.reasoning}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/** Render the full report from every finding, partitioned by actual SARIF membership. */
export function renderCapellaReport(
  findings: readonly CapellaFinding[],
  exportedFindingIds: ReadonlySet<string>,
  repoPath: string,
): string {
  const ordered = [...findings].sort((left, right) => compareText(left.id, right.id));
  const exported = ordered.filter((finding) => exportedFindingIds.has(finding.id));
  const dropped = ordered.filter((finding) => !exportedFindingIds.has(finding.id));

  const sections: string[] = [
    '# Capella SAST Report',
    '',
    `Repository: \`${repoPath}\``,
    '',
    `- Exported to SARIF: **${exported.length}**`,
    `- Not exported to SARIF: **${dropped.length}**`,
    '',
    '## Exported findings',
    '',
    exported.length ? exported.map(renderFinding).join('\n\n---\n\n') : '_None._',
  ];

  if (dropped.length) {
    sections.push(
      '',
      '## Not exported',
      '',
      'These were filtered before SARIF export by status, viability, or code-path rules. Shown for context.',
      '',
      dropped.map(renderFinding).join('\n\n---\n\n'),
    );
  }

  return `${sections.join('\n')}\n`;
}
