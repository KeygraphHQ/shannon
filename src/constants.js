// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs } from 'zx';
import chalk from 'chalk';
import { validateQueueAndDeliverable } from './queue-validation.js';

// Factory function for vulnerability queue validators
function createVulnValidator(vulnType) {
  return async (sourceDir) => {
    try {
      await validateQueueAndDeliverable(vulnType, sourceDir);
      return true;
    } catch (error) {
      console.log(chalk.yellow(`   Queue validation failed for ${vulnType}: ${error.message}`));
      return false;
    }
  };
}

// Factory function for exploit deliverable validators
function createExploitValidator(vulnType) {
  return async (sourceDir) => {
    const evidenceFile = path.join(sourceDir, 'deliverables', `${vulnType}_exploitation_evidence.md`);
    return await fs.pathExists(evidenceFile);
  };
}

// Model selection per agent - use faster models for simpler tasks
// Available models:
//   - 'claude-sonnet-4-5-20250929' (default) - Best balance of speed/quality
//   - 'claude-haiku-4-5-20251001' - 3-5x faster, good for simpler analysis
//   - 'claude-opus-4-5-20250929' - Most capable, for complex tasks (slower)
export const AGENT_MODEL_MAPPING = Object.freeze({
  // Phase 1: Pre-reconnaissance - needs deep code understanding
  'pre-recon': 'claude-sonnet-4-5-20250929',

  // Phase 2: Reconnaissance - mostly summarizing findings
  'recon': 'claude-haiku-4-5-20251001',

  // Phase 3: Vulnerability Analysis
  'injection-vuln': 'claude-sonnet-4-5-20250929',  // Complex SQL/command injection tracing
  'xss-vuln': 'claude-haiku-4-5-20251001',         // Simpler pattern matching
  'auth-vuln': 'claude-sonnet-4-5-20250929',       // Complex auth logic
  'ssrf-vuln': 'claude-haiku-4-5-20251001',        // URL pattern analysis
  'authz-vuln': 'claude-sonnet-4-5-20250929',      // Complex permission logic

  // Phase 4: Exploitation - needs careful testing
  'injection-exploit': 'claude-sonnet-4-5-20250929',
  'xss-exploit': 'claude-haiku-4-5-20251001',
  'auth-exploit': 'claude-sonnet-4-5-20250929',
  'ssrf-exploit': 'claude-haiku-4-5-20251001',
  'authz-exploit': 'claude-sonnet-4-5-20250929',

  // Phase 5: Reporting - needs good writing
  'report': 'claude-sonnet-4-5-20250929'
});

// Default model if agent not in mapping
export const DEFAULT_MODEL = 'claude-sonnet-4-5-20250929';

// MCP agent mapping - assigns each agent to a specific Playwright instance to prevent conflicts
export const MCP_AGENT_MAPPING = Object.freeze({
  // Phase 1: Pre-reconnaissance (actual prompt name is 'pre-recon-code')
  // NOTE: Pre-recon is pure code analysis and doesn't use browser automation,
  // but assigning MCP server anyway for consistency and future extensibility
  'pre-recon-code': 'playwright-agent1',

  // Phase 2: Reconnaissance (actual prompt name is 'recon')
  'recon': 'playwright-agent2',

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
  'report-executive': 'playwright-agent3'
});

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS = Object.freeze({
  // Pre-reconnaissance agent - validates the code analysis deliverable created by the agent
  // Now also accepts partial completion if intermediate sub-agent files exist
  'pre-recon': async (sourceDir) => {
    const codeAnalysisFile = path.join(sourceDir, 'deliverables', 'code_analysis_deliverable.md');
    const mainFileExists = await fs.pathExists(codeAnalysisFile);

    if (mainFileExists) {
      return true;
    }

    // Check for intermediate sub-agent results (partial completion)
    const deliverablesDir = path.join(sourceDir, 'deliverables');
    const intermediateFiles = [
      'architecture_analysis.md',
      'entry_points.md',
      'security_patterns.md',
      'data_flow_analysis.md',
      'input_validation.md',
      'auth_mechanisms.md'
    ];

    let foundCount = 0;
    for (const file of intermediateFiles) {
      if (await fs.pathExists(path.join(deliverablesDir, file))) {
        foundCount++;
      }
    }

    // If at least 3 intermediate files exist, accept as partial success
    // This prevents losing all work when only report generation fails
    if (foundCount >= 3) {
      console.log(chalk.yellow(`    ⚠️ Partial completion: Found ${foundCount}/${intermediateFiles.length} intermediate files`));
      console.log(chalk.yellow(`    📝 Will attempt to generate final report from intermediate results`));
      return 'partial'; // Signal partial completion
    }

    return false;
  },

  // Reconnaissance agent
  'recon': async (sourceDir) => {
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
  'report': async (sourceDir) => {
    const reportFile = path.join(sourceDir, 'deliverables', 'comprehensive_security_assessment_report.md');

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      console.log(chalk.red(`    ❌ Missing required deliverable: comprehensive_security_assessment_report.md`));
    }

    return reportExists;
  }
});