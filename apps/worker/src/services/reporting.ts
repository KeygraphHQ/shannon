// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import {
  ASSEMBLED_REPORT_FILENAME,
  ASSEMBLED_REPORT_PDF_FILENAME,
  deliverablesDir,
  FINAL_REPORT_MD_FILENAME,
  FINAL_REPORT_PDF_FILENAME,
  resolveSessionJsonPath,
  SARIF_FILENAME,
} from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import { PentestError } from './error-handling.js';

interface DeliverableFile {
  name: string;
  /** Candidate filenames in priority order. First one that exists wins. */
  paths: readonly string[];
  /** The vuln agent's analysis deliverable, which holds the out-of-scope section. */
  analysisPath: string;
  required: boolean;
}

/** Heading the vuln renderer gives the out-of-scope section, and the heading it carries here. */
const OUT_OF_SCOPE_SOURCE_HEADING = '## 5. Confirmed Findings Outside Attack Scope';
const OUT_OF_SCOPE_REPORT_HEADING = '## Confirmed Findings Outside Attack Scope';

/**
 * Pull the out-of-scope section out of an analysis deliverable, or null when it holds no findings.
 *
 * These vulnerabilities were confirmed and then deliberately kept out of the exploitation queue, so
 * no exploitation evidence mentions them. The section number is dropped: it means nothing once the
 * section sits beside the other per-class material.
 */
function extractOutOfScopeSection(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === OUT_OF_SCOPE_SOURCE_HEADING);
  if (headingIndex === -1) return null;

  const rest = lines.slice(headingIndex + 1);
  const nextHeadingOffset = rest.findIndex((line) => line.startsWith('## '));
  const body = nextHeadingOffset === -1 ? rest : rest.slice(0, nextHeadingOffset);
  const hasFindings = body.some((line) => line.startsWith('### '));
  if (!hasFindings) return null;

  return [OUT_OF_SCOPE_REPORT_HEADING, '', body.join('\n').trim()].join('\n');
}

async function readOutOfScopeSection(
  dir: string,
  file: DeliverableFile,
  logger: ActivityLogger,
): Promise<string | null> {
  const analysisPath = path.join(dir, file.analysisPath);
  try {
    if (!(await fs.pathExists(analysisPath))) return null;
    return extractOutOfScopeSection(await fs.readFile(analysisPath, 'utf8'));
  } catch (error) {
    const err = error as Error;
    logger.warn(`Could not read ${file.analysisPath}: ${err.message}`);
    return null;
  }
}

// Pure function: Assemble final report from specialist deliverables.
// Per class, prefer the exploit-agent's evidence file; fall back to renderer-produced findings.
// Both never coexist for a workspace because scope (exploit flag) is locked. Each class's
// out-of-scope findings are appended from its analysis deliverable, since neither of those two
// files carries them and this assembly is the report agent's only input.
export async function assembleFinalReport(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
): Promise<string> {
  const deliverableFiles: readonly DeliverableFile[] = [
    {
      name: 'Injection',
      paths: ['injection_exploitation_evidence.md', 'injection_findings.md'],
      analysisPath: 'injection_analysis_deliverable.md',
      required: false,
    },
    {
      name: 'XSS',
      paths: ['xss_exploitation_evidence.md', 'xss_findings.md'],
      analysisPath: 'xss_analysis_deliverable.md',
      required: false,
    },
    {
      name: 'Authentication',
      paths: ['auth_exploitation_evidence.md', 'auth_findings.md'],
      analysisPath: 'auth_analysis_deliverable.md',
      required: false,
    },
    {
      name: 'SSRF',
      paths: ['ssrf_exploitation_evidence.md', 'ssrf_findings.md'],
      analysisPath: 'ssrf_analysis_deliverable.md',
      required: false,
    },
    {
      name: 'Authorization',
      paths: ['authz_exploitation_evidence.md', 'authz_findings.md'],
      analysisPath: 'authz_analysis_deliverable.md',
      required: false,
    },
  ];

  const dir = deliverablesDir(sourceDir, deliverablesSubdir);
  const sections: string[] = [];

  for (const file of deliverableFiles) {
    let added = false;
    for (const candidate of file.paths) {
      const filePath = path.join(dir, candidate);
      try {
        if (await fs.pathExists(filePath)) {
          const content = await fs.readFile(filePath, 'utf8');
          sections.push(content);
          logger.info(`Added ${file.name} section from ${candidate}`);
          added = true;
          break;
        }
      } catch (error) {
        const err = error as Error;
        logger.warn(`Could not read ${candidate}: ${err.message}`);
      }
    }
    if (!added) {
      if (file.required) {
        throw new PentestError(
          `Required deliverable file not found: ${file.paths.join(' or ')}`,
          'filesystem',
          false,
          { deliverableFile: file.paths, sourceDir },
          ErrorCode.DELIVERABLE_NOT_FOUND,
        );
      }
      logger.info(`No ${file.name} deliverable found`);
    }

    const outOfScope = await readOutOfScopeSection(dir, file, logger);
    if (outOfScope) {
      // Without a class section above it, the block would read as belonging to the previous class.
      sections.push(added ? outOfScope : `# ${file.name}\n\n${outOfScope}`);
      logger.info(`Added ${file.name} out-of-scope findings from ${file.analysisPath}`);
    }
  }

  const finalContent = sections.join('\n\n');
  const finalReportPath = path.join(dir, ASSEMBLED_REPORT_FILENAME);

  try {
    await fs.ensureDir(dir);
    await fs.writeFile(finalReportPath, finalContent);
    logger.info(`Final report assembled at ${finalReportPath}`);
  } catch (error) {
    const err = error as Error;
    throw new PentestError(`Failed to write final report: ${err.message}`, 'filesystem', false, {
      finalReportPath,
      originalError: err.message,
    });
  }

  return finalContent;
}

/**
 * Inject model information into the final security report.
 * Reads session.json to get the model(s) used, then injects a "Model:" line
 * into the Executive Summary section of the report.
 */
export async function injectModelIntoReport(
  repoPath: string,
  deliverablesSubdir: string | undefined,
  outputPath: string,
  logger: ActivityLogger,
): Promise<void> {
  // 1. Read session.json to get model information
  const sessionJsonPath = resolveSessionJsonPath(outputPath);

  if (!(await fs.pathExists(sessionJsonPath))) {
    logger.warn('session.json not found, skipping model injection');
    return;
  }

  interface SessionData {
    metrics: {
      agents: Record<string, { model?: string }>;
    };
  }

  const sessionData: SessionData = await fs.readJson(sessionJsonPath);

  // 2. Extract unique models from all agents
  const models = new Set<string>();
  for (const agent of Object.values(sessionData.metrics.agents)) {
    if (agent.model) {
      models.add(agent.model);
    }
  }

  if (models.size === 0) {
    logger.warn('No model information found in session.json');
    return;
  }

  const modelStr = Array.from(models).join(', ');
  logger.info(`Injecting model info into report: ${modelStr}`);

  // 3. Read the final report
  const reportPath = path.join(deliverablesDir(repoPath, deliverablesSubdir), ASSEMBLED_REPORT_FILENAME);

  if (!(await fs.pathExists(reportPath))) {
    logger.warn('Final report not found, skipping model injection');
    return;
  }

  let reportContent = await fs.readFile(reportPath, 'utf8');

  // 4. Find and inject model line after "Assessment Date" in Executive Summary
  // Pattern: "- Assessment Date: <date>" followed by a newline
  const assessmentDatePattern = /^(- Assessment Date: .+)$/m;
  const match = reportContent.match(assessmentDatePattern);

  if (match) {
    // Inject model line after Assessment Date
    const modelLine = `- Model: ${modelStr}`;
    reportContent = reportContent.replace(assessmentDatePattern, `$1\n${modelLine}`);
    logger.info('Model info injected into Executive Summary');
  } else {
    // If no Assessment Date line found, try to add after Executive Summary header
    const execSummaryPattern = /^## Executive Summary$/m;
    if (reportContent.match(execSummaryPattern)) {
      // Add model as first item in Executive Summary
      reportContent = reportContent.replace(execSummaryPattern, `## Executive Summary\n- Model: ${modelStr}`);
      logger.info('Model info added to Executive Summary header');
    } else {
      logger.warn('Could not find Executive Summary section');
      return;
    }
  }

  // 5. Write modified report back
  await fs.writeFile(reportPath, reportContent);
}

/**
 * Surface the run's deliverables at the run directory's top level, so a customer opening the run
 * folder sees the report without digging through internals. Sources stay in the deliverables dir
 * (git-checkpointed, used by resume). Both the PDF and the markdown report are surfaced here as the
 * customer-facing copies.
 *
 * The SARIF log is surfaced beside it when present, since a CI step consuming it needs a stable
 * path and cannot be expected to reach into the internals directory. It is absent whenever the
 * run was analysis-only or `report.sarif` was set to false.
 */
export async function copyReportToRunRoot(
  repoPath: string,
  deliverablesSubdir: string | undefined,
  runDir: string,
  logger: ActivityLogger,
): Promise<void> {
  const dir = deliverablesDir(repoPath, deliverablesSubdir);

  const pdfSource = path.join(dir, ASSEMBLED_REPORT_PDF_FILENAME);
  if (await fs.pathExists(pdfSource)) {
    const destination = path.join(runDir, FINAL_REPORT_PDF_FILENAME);
    await fs.copy(pdfSource, destination, { overwrite: true });
    logger.info(`Surfaced PDF report at ${destination}`);
  } else {
    logger.warn(`PDF report not found, skipping ${FINAL_REPORT_PDF_FILENAME}`);
  }

  const markdownSource = path.join(dir, ASSEMBLED_REPORT_FILENAME);
  if (await fs.pathExists(markdownSource)) {
    const destination = path.join(runDir, FINAL_REPORT_MD_FILENAME);
    await fs.copy(markdownSource, destination, { overwrite: true });
    logger.info(`Surfaced markdown report at ${destination}`);
  } else {
    logger.warn(`Markdown report not found, skipping ${FINAL_REPORT_MD_FILENAME}`);
  }

  const sarifSource = path.join(dir, SARIF_FILENAME);
  if (await fs.pathExists(sarifSource)) {
    const sarifDestination = path.join(runDir, SARIF_FILENAME);
    await fs.copy(sarifSource, sarifDestination, { overwrite: true });
    logger.info(`Surfaced SARIF log at ${sarifDestination}`);
  }
}
