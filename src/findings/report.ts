// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs } from 'zx';
import type { FindingsReport } from './types.js';
import { summarizeFindings } from './exporters.js';

const START_MARKER = '<!-- SHANNON_FINDINGS_ENRICHMENT_START -->';
const END_MARKER = '<!-- SHANNON_FINDINGS_ENRICHMENT_END -->';

const formatScore = (value?: number | null): string => (value === null || value === undefined ? 'N/A' : value.toFixed(1));

const buildSummaryTable = (report: FindingsReport): string => {
  const header = '| ID | Title | Severity | CVSS v3.1 | CVSS v4.0 |';
  const divider = '| --- | --- | --- | --- | --- |';
  const rows = report.findings.map((finding) => (
    `| ${finding.id} | ${finding.title} | ${finding.severity} | ${formatScore(finding.cvss_v31_score)} | ${formatScore(finding.cvss_v40_score)} |`
  ));
  return [header, divider, ...rows].join('\n');
};

const buildRemediationSection = (report: FindingsReport): string => {
  const blocks = report.findings.map((finding) => [
    `### ${finding.id}: ${finding.title}`,
    `- Severity: ${finding.severity}`,
    `- Status: ${finding.status}`,
    `- CVSS v3.1: ${finding.cvss_v31_vector || 'N/A'} (${formatScore(finding.cvss_v31_score)})`,
    `- CVSS v4.0: ${finding.cvss_v40_vector || 'N/A'} (${formatScore(finding.cvss_v40_score)})`,
    '',
    finding.remediation.trim(),
    '',
  ].join('\n'));

  return blocks.join('\n');
};

const buildComplianceSection = (report: FindingsReport): string => {
  const summary = summarizeFindings(report.findings);
  const rows = Object.entries(summary).map(([severity, count]) => `- ${severity}: ${count}`);

  const owasp = report.findings.flatMap((finding) => finding.compliance.owasp_top10_2021.map((id) => `${id} (${finding.id})`));
  const pci = report.findings.flatMap((finding) => finding.compliance.pci_dss_v4.map((id) => `${id} (${finding.id})`));
  const soc2 = report.findings.flatMap((finding) => finding.compliance.soc2_tsc.map((id) => `${id} (${finding.id})`));

  const listOrEmpty = (items: string[]): string[] => items.length ? items.map((item) => `- ${item}`) : ['- No mapped findings'];

  return [
    '## Compliance Mapping',
    '',
    '### Severity Overview',
    ...rows,
    '',
    '### OWASP Top 10 (2021)',
    ...listOrEmpty(owasp),
    '',
    '### PCI DSS v4.0',
    ...listOrEmpty(pci),
    '',
    '### SOC 2 TSC',
    ...listOrEmpty(soc2),
  ].join('\n');
};

export const appendFindingsToReport = async (reportPath: string, report: FindingsReport): Promise<void> => {
  const base = await fs.readFile(reportPath, 'utf8');
  const enrichment = [
    START_MARKER,
    '',
    '## Findings Summary (CVSS)',
    buildSummaryTable(report),
    '',
    '## Remediation Guidance',
    buildRemediationSection(report),
    '',
    buildComplianceSection(report),
    '',
    END_MARKER,
  ].join('\n');

  const existingStart = base.indexOf(START_MARKER);
  const existingEnd = base.indexOf(END_MARKER);

  let updated = base;
  if (existingStart !== -1 && existingEnd !== -1 && existingEnd > existingStart) {
    updated = `${base.slice(0, existingStart).trimEnd()}\n\n${enrichment}\n`;
  } else {
    updated = `${base.trimEnd()}\n\n${enrichment}\n`;
  }

  await fs.writeFile(reportPath, updated, 'utf8');
};
