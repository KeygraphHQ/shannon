// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import type { FindingsReport, Finding } from './types.js';
import { OWASP_TOP10_2021, PCI_DSS_V4_REQUIREMENTS, SOC2_TSC_CATEGORIES } from '../compliance/mappings.js';

const severityOrder: Record<string, number> = {
  Critical: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Info: 1,
};

export const summarizeFindings = (findings: Finding[]): Record<string, number> => {
  return findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] || 0) + 1;
    return acc;
  }, {});
};

const escapeCsv = (value: string): string => {
  const needsQuotes = value.includes(',') || value.includes('"') || value.includes('\n');
  const escaped = value.replace(/"/g, '""');
  return needsQuotes ? `"${escaped}"` : escaped;
};

export const writeFindingsCsv = async (report: FindingsReport, outputDir: string): Promise<string> => {
  const header = [
    'id',
    'title',
    'category',
    'severity',
    'status',
    'cvss_v31_score',
    'cvss_v40_score',
    'affected_endpoints',
  ];

  const rows = report.findings
    .slice()
    .sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))
    .map((finding) => [
      finding.id,
      finding.title,
      finding.category,
      finding.severity,
      finding.status,
      finding.cvss_v31_score?.toString() ?? '',
      finding.cvss_v40_score?.toString() ?? '',
      finding.affected_endpoints.join(' | '),
    ].map(escapeCsv).join(','));

  const content = [header.join(','), ...rows].join('\n');
  const filePath = path.join(outputDir, 'findings.csv');
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
};

export const writeFindingsJson = async (report: FindingsReport, outputDir: string): Promise<string> => {
  const filePath = path.join(outputDir, 'findings.json');
  await fs.writeJson(filePath, report, { spaces: 2 });
  return filePath;
};

export const writeSarif = async (report: FindingsReport, outputDir: string): Promise<string> => {
  const results = report.findings.map((finding) => {
    const endpoint = finding.affected_endpoints[0] || finding.id;
    const level = finding.severity === 'Critical' || finding.severity === 'High'
      ? 'error'
      : finding.severity === 'Medium'
        ? 'warning'
        : 'note';

    return {
      ruleId: finding.id,
      message: { text: `${finding.title} - ${finding.summary}` },
      level,
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: endpoint },
          },
        },
      ],
      properties: {
        category: finding.category,
        severity: finding.severity,
        status: finding.status,
        cvss_v31_score: finding.cvss_v31_score,
        cvss_v40_score: finding.cvss_v40_score,
      },
    };
  });

  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Shannon',
            informationUri: 'https://github.com/KeygraphHQ/shannon',
            rules: report.findings.map((finding) => ({
              id: finding.id,
              shortDescription: { text: finding.title },
              fullDescription: { text: finding.summary },
              properties: {
                category: finding.category,
                severity: finding.severity,
              },
            })),
          },
        },
        results,
      },
    ],
  };

  const filePath = path.join(outputDir, 'findings.sarif');
  await fs.writeJson(filePath, sarif, { spaces: 2 });
  return filePath;
};

export const writeGitlabSast = async (report: FindingsReport, outputDir: string): Promise<string> => {
  const now = new Date().toISOString();
  const vulnerabilities = report.findings.map((finding) => ({
    id: finding.id,
    category: 'sast',
    name: finding.title,
    message: finding.summary,
    description: `${finding.summary}\n\nImpact: ${finding.impact}\n\nRemediation: ${finding.remediation}`,
    severity: finding.severity,
    scanner: {
      id: 'shannon',
      name: 'Shannon',
    },
    location: {
      file: finding.affected_endpoints[0] || 'unknown',
    },
    identifiers: [
      {
        type: 'shannon',
        name: finding.id,
        value: finding.id,
      },
    ],
  }));

  const reportJson = {
    version: '15.2.1',
    scan: {
      type: 'sast',
      status: 'success',
      start_time: now,
      end_time: now,
      analyzer: {
        id: 'shannon',
        name: 'Shannon',
        version: '1.0.0',
        vendor: { name: 'Keygraph' },
      },
      scanner: {
        id: 'shannon',
        name: 'Shannon',
        version: '1.0.0',
        vendor: { name: 'Keygraph' },
      },
    },
    vulnerabilities,
  };

  const filePath = path.join(outputDir, 'gl-sast-report.json');
  await fs.writeJson(filePath, reportJson, { spaces: 2 });
  return filePath;
};

export const writeComplianceReport = async (report: FindingsReport, outputDir: string): Promise<string> => {
  const findingsByFramework = {
    owasp_top10_2021: new Map<string, number>(),
    pci_dss_v4: new Map<string, number>(),
    soc2_tsc: new Map<string, number>(),
  };

  report.findings.forEach((finding) => {
    finding.compliance.owasp_top10_2021.forEach((id) => {
      findingsByFramework.owasp_top10_2021.set(id, (findingsByFramework.owasp_top10_2021.get(id) || 0) + 1);
    });
    finding.compliance.pci_dss_v4.forEach((id) => {
      findingsByFramework.pci_dss_v4.set(id, (findingsByFramework.pci_dss_v4.get(id) || 0) + 1);
    });
    finding.compliance.soc2_tsc.forEach((id) => {
      findingsByFramework.soc2_tsc.set(id, (findingsByFramework.soc2_tsc.get(id) || 0) + 1);
    });
  });

  const formatMap = (map: Map<string, number>, labelLookup: (id: string) => string | null): string[] => {
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, count]) => {
        const label = labelLookup(id);
        return label ? `- ${id} (${label}): ${count} finding(s)` : `- ${id}: ${count} finding(s)`;
      });
  };

  const owaspLookup = (id: string): string | null => OWASP_TOP10_2021.find((item) => item.id === id)?.name || null;
  const pciLookup = (id: string): string | null => PCI_DSS_V4_REQUIREMENTS.find((item) => item.id === id)?.name || null;
  const soc2Lookup = (id: string): string | null => SOC2_TSC_CATEGORIES.includes(id as typeof SOC2_TSC_CATEGORIES[number]) ? id : null;

  const content = [
    '# Compliance Mapping Summary',
    '',
    `Target: ${report.target.web_url}`,
    `Assessment Date: ${report.assessment_date}`,
    '',
    '## OWASP Top 10 (2021)',
    ...(formatMap(findingsByFramework.owasp_top10_2021, owaspLookup).length ? formatMap(findingsByFramework.owasp_top10_2021, owaspLookup) : ['- No mapped findings']),
    '',
    '## PCI DSS v4.0',
    ...(formatMap(findingsByFramework.pci_dss_v4, pciLookup).length ? formatMap(findingsByFramework.pci_dss_v4, pciLookup) : ['- No mapped findings']),
    '',
    '## SOC 2 TSC',
    ...(formatMap(findingsByFramework.soc2_tsc, soc2Lookup).length ? formatMap(findingsByFramework.soc2_tsc, soc2Lookup) : ['- No mapped findings']),
    '',
  ].join('\n');

  const filePath = path.join(outputDir, 'compliance_report.md');
  await fs.writeFile(filePath, content, 'utf8');
  return filePath;
};
