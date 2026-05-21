/**
 * SarifReportOutputProvider — converts Shannon's markdown security report
 * into SARIF 2.1.0 format for integration with GitHub Code Scanning,
 * VS Code SARIF Viewer, and other SARIF-consuming tools.
 *
 * Reads the assembled `comprehensive_security_assessment_report.md` and
 * maps markdown finding sections to SARIF result objects with appropriate
 * severity levels.
 */

import { fs, path } from 'zx';
import type { ActivityInput } from '../temporal/activities.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { ReportOutputProvider } from '../interfaces/report-output-provider.js';
import { deliverablesDir } from '../paths.js';

/** SARIF 2.1.0 severity level. */
type SarifLevel = 'error' | 'warning' | 'note' | 'none';

interface SarifResult {
  ruleId: string;
  level: SarifLevel;
  message: { text: string };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation: { uri: string };
    };
  }>;
}

interface SarifReport {
  $schema: string;
  version: string;
  runs: Array<{
    tool: {
      driver: {
        name: string;
        version: string;
        informationUri: string;
        rules: Array<{
          id: string;
          shortDescription: { text: string };
          defaultConfiguration: { level: SarifLevel };
        }>;
      };
    };
    results: SarifResult[];
  }>;
}

/** Map markdown severity headings to SARIF levels. */
function classifyLevel(heading: string): SarifLevel {
  const lower = heading.toLowerCase();
  if (lower.includes('critical') || lower.includes('high')) return 'error';
  if (lower.includes('medium') || lower.includes('moderate')) return 'warning';
  if (lower.includes('low') || lower.includes('info')) return 'note';
  return 'warning';
}

/** Derive a stable rule ID from a finding heading. */
function toRuleId(heading: string): string {
  return heading
    .replace(/[^a-zA-Z0-9\s]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 64);
}

/**
 * Parse markdown report into individual findings.
 *
 * Expects sections delimited by `## ` or `### ` headings.
 * Each section becomes a SARIF result.
 */
function parseFindings(markdown: string): Array<{ heading: string; body: string }> {
  const findings: Array<{ heading: string; body: string }> = [];
  const lines = markdown.split('\n');
  let currentHeading = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{2,3}\s+(.+)/);
    if (headingMatch) {
      if (currentHeading && currentBody.length > 0) {
        findings.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
      }
      currentHeading = headingMatch[1]!;
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }

  // Push final section
  if (currentHeading && currentBody.length > 0) {
    findings.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
  }

  return findings;
}

export class SarifReportOutputProvider implements ReportOutputProvider {
  async generate(input: ActivityInput, logger: ActivityLogger): Promise<{ outputPath?: string }> {
    const dir = deliverablesDir(input.repoPath, input.deliverablesSubdir);
    const reportPath = path.join(dir, 'comprehensive_security_assessment_report.md');

    if (!(await fs.pathExists(reportPath))) {
      logger.info('No markdown report found; skipping SARIF generation');
      return {};
    }

    const markdown = await fs.readFile(reportPath, 'utf8');
    const findings = parseFindings(markdown);

    if (findings.length === 0) {
      logger.info('No findings parsed from report; skipping SARIF generation');
      return {};
    }

    const rules = new Map<string, { id: string; shortDescription: { text: string }; defaultConfiguration: { level: SarifLevel } }>();
    const results: SarifResult[] = [];

    for (const finding of findings) {
      const ruleId = toRuleId(finding.heading);
      const level = classifyLevel(finding.heading);

      if (!rules.has(ruleId)) {
        rules.set(ruleId, {
          id: ruleId,
          shortDescription: { text: finding.heading },
          defaultConfiguration: { level },
        });
      }

      results.push({
        ruleId,
        level,
        message: { text: finding.body.slice(0, 2000) }, // SARIF recommends concise messages
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: input.url },
            },
          },
        ],
      });
    }

    const sarif: SarifReport = {
      $schema: 'https://docs.oasis-open.org/sarif/sarif/v2.1.0/cos02/schemas/sarif-schema-2.1.0.json',
      version: '2.1.0',
      runs: [
        {
          tool: {
            driver: {
              name: 'Shannon',
              version: '1.0.0',
              informationUri: 'https://github.com/KeygraphHQ/shannon',
              rules: [...rules.values()],
            },
          },
          results,
        },
      ],
    };

    const sarifPath = path.join(dir, 'report.sarif');
    await fs.writeFile(sarifPath, JSON.stringify(sarif, null, 2));
    logger.info(`SARIF report written to ${sarifPath} (${results.length} findings)`);

    return { outputPath: sarifPath };
  }
}
