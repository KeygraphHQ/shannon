// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';
import { deliverablesDir } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import { PentestError } from './error-handling.js';

interface DeliverableFile {
  name: string;
  /** Candidate filenames in priority order. First one that exists wins. */
  paths: readonly string[];
  required: boolean;
}

// Pure function: Assemble final report from specialist deliverables.
// Per class, prefer the exploit-agent's evidence file; fall back to renderer-produced findings.
// Both never coexist for a workspace because scope (exploit flag) is locked.
export async function assembleFinalReport(
  sourceDir: string,
  deliverablesSubdir: string | undefined,
  logger: ActivityLogger,
): Promise<string> {
  const deliverableFiles: readonly DeliverableFile[] = [
    { name: 'Injection', paths: ['injection_exploitation_evidence.md', 'injection_findings.md'], required: false },
    { name: 'XSS', paths: ['xss_exploitation_evidence.md', 'xss_findings.md'], required: false },
    { name: 'Authentication', paths: ['auth_exploitation_evidence.md', 'auth_findings.md'], required: false },
    { name: 'SSRF', paths: ['ssrf_exploitation_evidence.md', 'ssrf_findings.md'], required: false },
    { name: 'Authorization', paths: ['authz_exploitation_evidence.md', 'authz_findings.md'], required: false },
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
  }

  const finalContent = sections.join('\n\n');
  const finalReportPath = path.join(dir, 'comprehensive_security_assessment_report.md');

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
  const sessionJsonPath = path.join(outputPath, 'session.json');

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
  const reportPath = path.join(deliverablesDir(repoPath, deliverablesSubdir), 'comprehensive_security_assessment_report.md');

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
