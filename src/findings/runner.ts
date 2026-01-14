// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { fs, path } from 'zx';
import type { DistributedConfig } from '../types/config.js';
import type { SessionMetadata } from '../audit/utils.js';
import { runClaudePromptWithRetry } from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import { appendFindingsToReport, enrichFindingsReport, parseFindingsReport, writeComplianceReport, writeFindingsCsv, writeFindingsJson, writeGitlabSast, writeSarif } from './index.js';
import type { FindingsReport } from './types.js';
import type { CiOptions } from '../ci/index.js';

interface PromptVariables {
  webUrl: string;
  repoPath: string;
  sourceDir: string;
}

export interface FindingsArtifacts {
  report: FindingsReport;
  findingsPath: string;
  csvPath: string;
  compliancePath: string;
  sarifPath?: string;
  gitlabPath?: string;
}

export const generateFindingsArtifacts = async (
  sourceDir: string,
  variables: PromptVariables,
  distributedConfig: DistributedConfig | null,
  pipelineTestingMode: boolean,
  sessionMetadata: SessionMetadata,
  ci: CiOptions
): Promise<FindingsArtifacts> => {
  console.log(chalk.blue('🧮 Normalizing findings and generating CVSS/compliance artifacts...'));

  const prompt = await loadPrompt('report-findings', variables, distributedConfig, pipelineTestingMode);
  const result = await runClaudePromptWithRetry(
    prompt,
    sourceDir,
    'Read',
    '',
    'Findings normalization',
    'report-findings',
    chalk.cyan,
    sessionMetadata
  );

  if (!result.result) {
    throw new Error('Findings normalization failed: no output from LLM');
  }

  const parsed = parseFindingsReport(result.result);
  parsed.assessment_date = new Date().toISOString().slice(0, 10);
  parsed.target = { web_url: variables.webUrl, repo_path: variables.repoPath };
  const enriched = enrichFindingsReport(parsed);

  const deliverablesDir = path.join(sourceDir, 'deliverables');
  await fs.ensureDir(deliverablesDir);

  const findingsPath = await writeFindingsJson(enriched, deliverablesDir);
  const csvPath = await writeFindingsCsv(enriched, deliverablesDir);
  const compliancePath = await writeComplianceReport(enriched, deliverablesDir);

  let sarifPath: string | undefined;
  let gitlabPath: string | undefined;

  if (ci.enabled && ci.generateSarif && ci.platforms.includes('github')) {
    sarifPath = await writeSarif(enriched, deliverablesDir);
  }
  if (ci.enabled && ci.generateGitlabSast && ci.platforms.includes('gitlab')) {
    gitlabPath = await writeGitlabSast(enriched, deliverablesDir);
  }

  const reportPath = path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md');
  await appendFindingsToReport(reportPath, enriched);

  return {
    report: enriched,
    findingsPath,
    csvPath,
    compliancePath,
    ...(sarifPath && { sarifPath }),
    ...(gitlabPath && { gitlabPath }),
  };
};
