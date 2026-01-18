// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs } from 'zx';
import chalk from 'chalk';
import { validateQueueAndDeliverable, type VulnType } from './queue-validation.js';
import type { AgentName, PromptName, PlaywrightAgent, AgentValidator } from './types/agents.js';

// Factory function for vulnerability queue validators
function createVulnValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    try {
      await validateQueueAndDeliverable(vulnType, sourceDir);
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.log(chalk.yellow(`   Queue validation failed for ${vulnType}: ${errMsg}`));
      return false;
    }
  };
}

// Factory function for exploit deliverable validators
function createExploitValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    const evidenceFile = path.join(sourceDir, 'deliverables', `${vulnType}_exploitation_evidence.md`);
    return await fs.pathExists(evidenceFile);
  };
}

// MCP agent mapping - assigns each agent to a specific Playwright instance to prevent conflicts
export const MCP_AGENT_MAPPING: Record<PromptName, PlaywrightAgent> = Object.freeze({
  // Phase 1: Pre-reconnaissance (actual prompt name is 'pre-recon-code')
  // NOTE: Pre-recon is pure code analysis and doesn't use browser automation,
  // but assigning MCP server anyway for consistency and future extensibility
  'pre-recon-code': 'playwright-agent1',

  // Phase 2: Reconnaissance (actual prompt name is 'recon')
  recon: 'playwright-agent2',

  // Phase 3: Vulnerability Analysis (5 parallel agents)
  'vuln-injection': 'playwright-agent1',
  'vuln-xss': 'playwright-agent2',
  'vuln-auth': 'playwright-agent3',
  'vuln-ssrf': 'playwright-agent4',
  'vuln-authz': 'playwright-agent5',

  // Phase 4: Exploitation (5 parallel agents - same as vuln counterparts)
  'exploit-injection': 'playwright-agent1',
  'exploit-xss': 'playwright-agent2',
  'exploit-auth': 'playwright-agent3',
  'exploit-ssrf': 'playwright-agent4',
  'exploit-authz': 'playwright-agent5',

  // Phase 5: Reporting (actual prompt name is 'report-executive')
  // NOTE: Report generation is typically text-based and doesn't use browser automation,
  // but assigning MCP server anyway for potential screenshot inclusion or future needs
  'report-executive': 'playwright-agent3',
});

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS: Record<AgentName, AgentValidator> = Object.freeze({
  // Pre-reconnaissance agent - validates the code analysis deliverable created by the agent
  'pre-recon': async (sourceDir: string): Promise<boolean> => {
    const codeAnalysisFile = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    return await fs.pathExists(codeAnalysisFile);
  },

  // Reconnaissance agent
  recon: async (sourceDir: string): Promise<boolean> => {
    const reconFile = path.join(sourceDir, 'deliverables', 'recon_deliverable.md');
    return await fs.pathExists(reconFile);
  },

  // Vulnerability analysis agents
  'injection-vuln': createVulnValidator('injection'),
  'xss-vuln': createVulnValidator('xss'),
  'auth-vuln': createVulnValidator('auth'),
  'ssrf-vuln': createVulnValidator('ssrf'),
  'authz-vuln': createVulnValidator('authz'),

  // Exploitation agents
  'injection-exploit': createExploitValidator('injection'),
  'xss-exploit': createExploitValidator('xss'),
  'auth-exploit': createExploitValidator('auth'),
  'ssrf-exploit': createExploitValidator('ssrf'),
  'authz-exploit': createExploitValidator('authz'),

  // Executive report agent
  report: async (sourceDir: string): Promise<boolean> => {
    const reportFile = path.join(
      sourceDir,
      'deliverables',
      'comprehensive_security_assessment_report.md'
    );

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      console.log(
        chalk.red(`    ❌ Missing required deliverable: comprehensive_security_assessment_report.md`)
      );
    }

    return reportExists;
  },
});
