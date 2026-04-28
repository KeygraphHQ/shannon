// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * SarifReportOutputProvider — emits a SARIF 2.1.0 file alongside the
 * assembled markdown report.
 *
 * Activated by setting `SHANNON_REPORT_FORMAT=sarif` on the worker. The
 * provider runs via the standard `ReportOutputProvider` seam after the
 * markdown report has been written.
 *
 * Scope (v0.1):
 *   - Walks the five `*_exploitation_evidence.md` deliverables that
 *     `assembleFinalReport` consumes today.
 *   - Emits one SARIF `result` per non-empty evidence file, with the
 *     evidence body as the result message and the deliverable path as
 *     the artifact location.
 *   - Tool driver advertises the five built-in vulnerability rules.
 *
 * Out of scope for this version: per-finding line/column resolution
 * inside source files. That requires structured findings emitted by
 * the agents (a follow-up). The output is still valid SARIF 2.1.0 and
 * is consumed correctly by GitHub Code Scanning, GitLab CI, and
 * Defect Dojo today.
 */

import { fs, path } from 'zx';
import type { ReportOutputProvider } from '../interfaces/report-output-provider.js';
import { deliverablesDir } from '../paths.js';
import type { ActivityInput } from '../temporal/activities.js';
import type { ActivityLogger } from '../types/activity-logger.js';

interface VulnRule {
  id: string;
  name: string;
  cweId: string;
  shortDescription: string;
  helpUri: string;
  evidenceFile: string;
}

const VULN_RULES: VulnRule[] = [
  {
    id: 'shannon.injection',
    name: 'Injection',
    cweId: 'CWE-74',
    shortDescription: 'Injection (SQL, command, LDAP, NoSQL, template, etc.)',
    helpUri: 'https://owasp.org/Top10/A03_2021-Injection/',
    evidenceFile: 'injection_exploitation_evidence.md',
  },
  {
    id: 'shannon.xss',
    name: 'Cross-Site Scripting',
    cweId: 'CWE-79',
    shortDescription: 'Reflected, stored, or DOM-based cross-site scripting',
    helpUri: 'https://owasp.org/www-community/attacks/xss/',
    evidenceFile: 'xss_exploitation_evidence.md',
  },
  {
    id: 'shannon.auth',
    name: 'Broken Authentication',
    cweId: 'CWE-287',
    shortDescription: 'Authentication weakness, including credential and session-handling flaws',
    helpUri: 'https://owasp.org/Top10/A07_2021-Identification_and_Authentication_Failures/',
    evidenceFile: 'auth_exploitation_evidence.md',
  },
  {
    id: 'shannon.ssrf',
    name: 'Server-Side Request Forgery',
    cweId: 'CWE-918',
    shortDescription: 'Server-side request forgery against internal or external endpoints',
    helpUri: 'https://owasp.org/Top10/A10_2021-Server-Side_Request_Forgery_%28SSRF%29/',
    evidenceFile: 'ssrf_exploitation_evidence.md',
  },
  {
    id: 'shannon.authz',
    name: 'Broken Access Control',
    cweId: 'CWE-285',
    shortDescription: 'Authorization, IDOR, privilege escalation, or scope-violation flaws',
    helpUri: 'https://owasp.org/Top10/A01_2021-Broken_Access_Control/',
    evidenceFile: 'authz_exploitation_evidence.md',
  },
];

const MAX_RESULT_MESSAGE_BYTES = 16_384;

interface SarifResult {
  ruleId: string;
  level: 'error' | 'warning' | 'note';
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
    };
  }>;
}

interface SarifLog {
  $schema: string;
  version: '2.1.0';
  runs: Array<{
    tool: {
      driver: {
        name: string;
        informationUri: string;
        version?: string;
        rules: Array<{
          id: string;
          name: string;
          shortDescription: { text: string };
          helpUri: string;
          properties: { tags: string[] };
        }>;
      };
    };
    results: SarifResult[];
  }>;
}

function truncate(value: string, maxBytes: number): string {
  if (Buffer.byteLength(value, 'utf8') <= maxBytes) return value;
  // Coarse byte-clipping with a single "[truncated]" suffix is sufficient —
  // we lose tail content, not structure. SARIF allows long messages but
  // some consumers (notably GitHub) reject results above ~32KB.
  const head = value.slice(0, maxBytes);
  return `${head}\n[truncated]`;
}

async function readEvidenceIfPresent(
  evidenceDir: string,
  rule: VulnRule,
  logger: ActivityLogger,
): Promise<{ rule: VulnRule; body: string } | null> {
  const filePath = path.join(evidenceDir, rule.evidenceFile);
  if (!(await fs.pathExists(filePath))) {
    logger.info(`SARIF: skipping ${rule.name} — no evidence file`);
    return null;
  }
  const body = (await fs.readFile(filePath, 'utf8')).trim();
  if (!body) {
    logger.info(`SARIF: skipping ${rule.name} — evidence file empty`);
    return null;
  }
  return { rule, body };
}

function buildSarifLog(
  driverVersion: string | undefined,
  evidenceUriPrefix: string,
  findings: Array<{ rule: VulnRule; body: string }>,
): SarifLog {
  return {
    $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/cos02/schemas/sarif-schema-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'Shannon',
            informationUri: 'https://github.com/KeygraphHQ/shannon',
            ...(driverVersion && { version: driverVersion }),
            rules: VULN_RULES.map((r) => ({
              id: r.id,
              name: r.name,
              shortDescription: { text: r.shortDescription },
              helpUri: r.helpUri,
              properties: { tags: ['security', r.cweId] },
            })),
          },
        },
        results: findings.map(({ rule, body }) => ({
          ruleId: rule.id,
          level: 'error' as const,
          message: { text: truncate(body, MAX_RESULT_MESSAGE_BYTES) },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: `${evidenceUriPrefix}${rule.evidenceFile}`,
                },
              },
            },
          ],
        })),
      },
    ],
  };
}

export class SarifReportOutputProvider implements ReportOutputProvider {
  constructor(private readonly driverVersion?: string) {}

  async generate(input: ActivityInput, logger: ActivityLogger): Promise<{ outputPath?: string }> {
    const evidenceDir = deliverablesDir(input.repoPath, input.deliverablesSubdir);

    const evidenceFindings = await Promise.all(
      VULN_RULES.map((rule) => readEvidenceIfPresent(evidenceDir, rule, logger)),
    );
    const findings = evidenceFindings.filter((entry): entry is { rule: VulnRule; body: string } => entry !== null);

    const sarif = buildSarifLog(this.driverVersion, '', findings);

    // Sit alongside the markdown report under the deliverables dir so
    // CI runners that pin the workspace path find both artefacts.
    const outputPath = path.join(evidenceDir, 'comprehensive_security_assessment_report.sarif');
    await fs.writeFile(outputPath, JSON.stringify(sarif, null, 2), 'utf8');

    logger.info(`SARIF: wrote ${findings.length}/${VULN_RULES.length} result(s) to ${outputPath}`);
    return { outputPath };
  }
}
