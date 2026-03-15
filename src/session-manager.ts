// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { path, fs } from 'zx';
import { validateQueueAndDeliverable } from './services/queue-validation.js';
import type { AgentName, AgentDefinition, PlaywrightAgent, AgentValidator, VulnType } from './types/index.js';
import type { ActivityLogger } from './types/activity-logger.js';

// Agent definitions registry.
// NOTE: deliverableFilename values must match mcp-server/src/types/deliverables.ts:DELIVERABLE_FILENAMES
export const AGENTS: Readonly<Record<AgentName, AgentDefinition>> = Object.freeze({
  // === Shared Agents (all target types) ===
  'pre-recon': {
    name: 'pre-recon',
    displayName: 'Pre-recon agent',
    prerequisites: [],
    promptTemplate: 'pre-recon-code',
    deliverableFilename: 'code_analysis_deliverable.md',
    modelTier: 'large',
  },
  'recon': {
    name: 'recon',
    displayName: 'Recon agent',
    prerequisites: ['pre-recon'],
    promptTemplate: 'recon',
    deliverableFilename: 'recon_deliverable.md',
  },

  // === Web-Target Agents ===
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-injection',
    deliverableFilename: 'injection_analysis_deliverable.md',
    targetTypes: ['web', 'api'],
  },
  'xss-vuln': {
    name: 'xss-vuln',
    displayName: 'XSS vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-xss',
    deliverableFilename: 'xss_analysis_deliverable.md',
    targetTypes: ['web'],
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Auth vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-auth',
    deliverableFilename: 'auth_analysis_deliverable.md',
    targetTypes: ['web'],
  },
  'ssrf-vuln': {
    name: 'ssrf-vuln',
    displayName: 'SSRF vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-ssrf',
    deliverableFilename: 'ssrf_analysis_deliverable.md',
    targetTypes: ['web', 'api'],
  },
  'authz-vuln': {
    name: 'authz-vuln',
    displayName: 'Authz vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-authz',
    deliverableFilename: 'authz_analysis_deliverable.md',
    targetTypes: ['web'],
  },
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection exploit agent',
    prerequisites: ['injection-vuln'],
    promptTemplate: 'exploit-injection',
    deliverableFilename: 'injection_exploitation_evidence.md',
    targetTypes: ['web', 'api'],
  },
  'xss-exploit': {
    name: 'xss-exploit',
    displayName: 'XSS exploit agent',
    prerequisites: ['xss-vuln'],
    promptTemplate: 'exploit-xss',
    deliverableFilename: 'xss_exploitation_evidence.md',
    targetTypes: ['web'],
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Auth exploit agent',
    prerequisites: ['auth-vuln'],
    promptTemplate: 'exploit-auth',
    deliverableFilename: 'auth_exploitation_evidence.md',
    targetTypes: ['web'],
  },
  'ssrf-exploit': {
    name: 'ssrf-exploit',
    displayName: 'SSRF exploit agent',
    prerequisites: ['ssrf-vuln'],
    promptTemplate: 'exploit-ssrf',
    deliverableFilename: 'ssrf_exploitation_evidence.md',
    targetTypes: ['web', 'api'],
  },
  'authz-exploit': {
    name: 'authz-exploit',
    displayName: 'Authz exploit agent',
    prerequisites: ['authz-vuln'],
    promptTemplate: 'exploit-authz',
    deliverableFilename: 'authz_exploitation_evidence.md',
    targetTypes: ['web'],
  },

  // === CLI/TUI-Target Agents ===
  'cli-injection-vuln': {
    name: 'cli-injection-vuln',
    displayName: 'CLI command injection vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-cli-injection',
    deliverableFilename: 'cli_injection_analysis_deliverable.md',
    targetTypes: ['cli'],
  },
  'cli-prompt-injection-vuln': {
    name: 'cli-prompt-injection-vuln',
    displayName: 'CLI prompt injection vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-cli-prompt-injection',
    deliverableFilename: 'cli_prompt_injection_analysis_deliverable.md',
    targetTypes: ['cli'],
  },
  'cli-input-validation-vuln': {
    name: 'cli-input-validation-vuln',
    displayName: 'CLI input validation vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-cli-input-validation',
    deliverableFilename: 'cli_input_validation_analysis_deliverable.md',
    targetTypes: ['cli'],
  },
  'cli-auth-vuln': {
    name: 'cli-auth-vuln',
    displayName: 'CLI auth vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-cli-auth',
    deliverableFilename: 'cli_auth_analysis_deliverable.md',
    targetTypes: ['cli'],
  },
  'cli-privesc-vuln': {
    name: 'cli-privesc-vuln',
    displayName: 'CLI privilege escalation vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-cli-privesc',
    deliverableFilename: 'cli_privesc_analysis_deliverable.md',
    targetTypes: ['cli'],
  },
  'cli-injection-exploit': {
    name: 'cli-injection-exploit',
    displayName: 'CLI command injection exploit agent',
    prerequisites: ['cli-injection-vuln'],
    promptTemplate: 'exploit-cli-injection',
    deliverableFilename: 'cli_injection_exploitation_evidence.md',
    targetTypes: ['cli'],
  },
  'cli-prompt-injection-exploit': {
    name: 'cli-prompt-injection-exploit',
    displayName: 'CLI prompt injection exploit agent',
    prerequisites: ['cli-prompt-injection-vuln'],
    promptTemplate: 'exploit-cli-prompt-injection',
    deliverableFilename: 'cli_prompt_injection_exploitation_evidence.md',
    targetTypes: ['cli'],
  },
  'cli-input-validation-exploit': {
    name: 'cli-input-validation-exploit',
    displayName: 'CLI input validation exploit agent',
    prerequisites: ['cli-input-validation-vuln'],
    promptTemplate: 'exploit-cli-input-validation',
    deliverableFilename: 'cli_input_validation_exploitation_evidence.md',
    targetTypes: ['cli'],
  },
  'cli-auth-exploit': {
    name: 'cli-auth-exploit',
    displayName: 'CLI auth exploit agent',
    prerequisites: ['cli-auth-vuln'],
    promptTemplate: 'exploit-cli-auth',
    deliverableFilename: 'cli_auth_exploitation_evidence.md',
    targetTypes: ['cli'],
  },
  'cli-privesc-exploit': {
    name: 'cli-privesc-exploit',
    displayName: 'CLI privilege escalation exploit agent',
    prerequisites: ['cli-privesc-vuln'],
    promptTemplate: 'exploit-cli-privesc',
    deliverableFilename: 'cli_privesc_exploitation_evidence.md',
    targetTypes: ['cli'],
  },

  // === API-Target Agents ===
  'api-auth-vuln': {
    name: 'api-auth-vuln',
    displayName: 'API auth vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-api-auth',
    deliverableFilename: 'api_auth_analysis_deliverable.md',
    targetTypes: ['api'],
  },
  'api-bola-vuln': {
    name: 'api-bola-vuln',
    displayName: 'API BOLA/IDOR vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-api-bola',
    deliverableFilename: 'api_bola_analysis_deliverable.md',
    targetTypes: ['api'],
  },
  'api-input-validation-vuln': {
    name: 'api-input-validation-vuln',
    displayName: 'API input validation vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-api-input-validation',
    deliverableFilename: 'api_input_validation_analysis_deliverable.md',
    targetTypes: ['api'],
  },
  'api-auth-exploit': {
    name: 'api-auth-exploit',
    displayName: 'API auth exploit agent',
    prerequisites: ['api-auth-vuln'],
    promptTemplate: 'exploit-api-auth',
    deliverableFilename: 'api_auth_exploitation_evidence.md',
    targetTypes: ['api'],
  },
  'api-bola-exploit': {
    name: 'api-bola-exploit',
    displayName: 'API BOLA/IDOR exploit agent',
    prerequisites: ['api-bola-vuln'],
    promptTemplate: 'exploit-api-bola',
    deliverableFilename: 'api_bola_exploitation_evidence.md',
    targetTypes: ['api'],
  },
  'api-input-validation-exploit': {
    name: 'api-input-validation-exploit',
    displayName: 'API input validation exploit agent',
    prerequisites: ['api-input-validation-vuln'],
    promptTemplate: 'exploit-api-input-validation',
    deliverableFilename: 'api_input_validation_exploitation_evidence.md',
    targetTypes: ['api'],
  },
  'report': {
    name: 'report',
    displayName: 'Report agent',
    prerequisites: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'],
    promptTemplate: 'report-executive',
    deliverableFilename: 'comprehensive_security_assessment_report.md',
    modelTier: 'small',
  },
});

// Phase names for metrics aggregation
export type PhaseName = 'pre-recon' | 'recon' | 'vulnerability-analysis' | 'exploitation' | 'reporting';

// Map agents to their corresponding phases (single source of truth)
export const AGENT_PHASE_MAP: Readonly<Record<AgentName, PhaseName>> = Object.freeze({
  // Shared
  'pre-recon': 'pre-recon',
  'recon': 'recon',
  'report': 'reporting',

  // Web vuln
  'injection-vuln': 'vulnerability-analysis',
  'xss-vuln': 'vulnerability-analysis',
  'auth-vuln': 'vulnerability-analysis',
  'authz-vuln': 'vulnerability-analysis',
  'ssrf-vuln': 'vulnerability-analysis',
  // Web exploit
  'injection-exploit': 'exploitation',
  'xss-exploit': 'exploitation',
  'auth-exploit': 'exploitation',
  'authz-exploit': 'exploitation',
  'ssrf-exploit': 'exploitation',

  // CLI vuln
  'cli-injection-vuln': 'vulnerability-analysis',
  'cli-prompt-injection-vuln': 'vulnerability-analysis',
  'cli-input-validation-vuln': 'vulnerability-analysis',
  'cli-auth-vuln': 'vulnerability-analysis',
  'cli-privesc-vuln': 'vulnerability-analysis',
  // CLI exploit
  'cli-injection-exploit': 'exploitation',
  'cli-prompt-injection-exploit': 'exploitation',
  'cli-input-validation-exploit': 'exploitation',
  'cli-auth-exploit': 'exploitation',
  'cli-privesc-exploit': 'exploitation',

  // API vuln
  'api-auth-vuln': 'vulnerability-analysis',
  'api-bola-vuln': 'vulnerability-analysis',
  'api-input-validation-vuln': 'vulnerability-analysis',
  // API exploit
  'api-auth-exploit': 'exploitation',
  'api-bola-exploit': 'exploitation',
  'api-input-validation-exploit': 'exploitation',
});

// Factory function for vulnerability queue validators
function createVulnValidator(vulnType: string): AgentValidator {
  return async (sourceDir: string, logger: ActivityLogger): Promise<boolean> => {
    try {
      await validateQueueAndDeliverable(vulnType as VulnType, sourceDir);
      return true;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.warn(`Queue validation failed for ${vulnType}: ${errMsg}`);
      return false;
    }
  };
}

// Factory function for exploit deliverable validators
function createExploitValidator(vulnType: string): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    const evidenceFile = path.join(sourceDir, 'deliverables', `${vulnType}_exploitation_evidence.md`);
    return await fs.pathExists(evidenceFile);
  };
}

// Factory function for deliverable-only validators (no queue, just check the file exists)
function createDeliverableValidator(filename: string): AgentValidator {
  return async (sourceDir: string): Promise<boolean> => {
    const filePath = path.join(sourceDir, 'deliverables', filename);
    return await fs.pathExists(filePath);
  };
}

// MCP agent mapping - assigns each agent to a specific Playwright instance to prevent conflicts
// Keys are promptTemplate values from AGENTS registry
export const MCP_AGENT_MAPPING: Record<string, PlaywrightAgent> = Object.freeze({
  // Phase 1: Pre-reconnaissance (actual prompt name is 'pre-recon-code')
  // NOTE: Pre-recon is pure code analysis and doesn't use browser automation,
  // but assigning MCP server anyway for consistency and future extensibility
  'pre-recon-code': 'playwright-agent1',

  // Phase 2: Reconnaissance (actual prompt name is 'recon')
  recon: 'playwright-agent2',

  // Phase 3: Vulnerability Analysis — Web (5 parallel agents)
  'vuln-injection': 'playwright-agent1',
  'vuln-xss': 'playwright-agent2',
  'vuln-auth': 'playwright-agent3',
  'vuln-ssrf': 'playwright-agent4',
  'vuln-authz': 'playwright-agent5',

  // Phase 4: Exploitation — Web (5 parallel agents - same as vuln counterparts)
  'exploit-injection': 'playwright-agent1',
  'exploit-xss': 'playwright-agent2',
  'exploit-auth': 'playwright-agent3',
  'exploit-ssrf': 'playwright-agent4',
  'exploit-authz': 'playwright-agent5',

  // Phase 5: Reporting (actual prompt name is 'report-executive')
  // NOTE: Report generation is typically text-based and doesn't use browser automation,
  // but assigning MCP server anyway for potential screenshot inclusion or future needs
  'report-executive': 'playwright-agent3',

  // API vuln/exploit agents - use Playwright for API testing via browser context
  'vuln-api-auth': 'playwright-agent1',
  'vuln-api-bola': 'playwright-agent2',
  'vuln-api-input-validation': 'playwright-agent3',
  'exploit-api-auth': 'playwright-agent1',
  'exploit-api-bola': 'playwright-agent2',
  'exploit-api-input-validation': 'playwright-agent3',
});

// CLI agents do not use Playwright — they interact with CLIs via shell execution.
// The executor conditionally omits Playwright MCP for agents not in this mapping.
// CLI agents listed here for documentation; they rely on Bash tool + shannon-helper MCP only.
export const CLI_AGENT_PROMPTS = [
  'vuln-cli-injection',
  'vuln-cli-prompt-injection',
  'vuln-cli-input-validation',
  'vuln-cli-auth',
  'vuln-cli-privesc',
  'exploit-cli-injection',
  'exploit-cli-prompt-injection',
  'exploit-cli-input-validation',
  'exploit-cli-auth',
  'exploit-cli-privesc',
] as const;

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS: Record<AgentName, AgentValidator> = Object.freeze({
  // === Shared Agents ===
  'pre-recon': createDeliverableValidator('code_analysis_deliverable.md'),
  recon: createDeliverableValidator('recon_deliverable.md'),
  report: async (sourceDir: string, logger: ActivityLogger): Promise<boolean> => {
    const reportFile = path.join(
      sourceDir,
      'deliverables',
      'comprehensive_security_assessment_report.md'
    );

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      logger.error('Missing required deliverable: comprehensive_security_assessment_report.md');
    }

    return reportExists;
  },

  // === Web Vulnerability Agents ===
  'injection-vuln': createVulnValidator('injection'),
  'xss-vuln': createVulnValidator('xss'),
  'auth-vuln': createVulnValidator('auth'),
  'ssrf-vuln': createVulnValidator('ssrf'),
  'authz-vuln': createVulnValidator('authz'),

  // === Web Exploitation Agents ===
  'injection-exploit': createExploitValidator('injection'),
  'xss-exploit': createExploitValidator('xss'),
  'auth-exploit': createExploitValidator('auth'),
  'ssrf-exploit': createExploitValidator('ssrf'),
  'authz-exploit': createExploitValidator('authz'),

  // === CLI Vulnerability Agents ===
  'cli-injection-vuln': createDeliverableValidator('cli_injection_analysis_deliverable.md'),
  'cli-prompt-injection-vuln': createDeliverableValidator('cli_prompt_injection_analysis_deliverable.md'),
  'cli-input-validation-vuln': createDeliverableValidator('cli_input_validation_analysis_deliverable.md'),
  'cli-auth-vuln': createDeliverableValidator('cli_auth_analysis_deliverable.md'),
  'cli-privesc-vuln': createDeliverableValidator('cli_privesc_analysis_deliverable.md'),

  // === CLI Exploitation Agents ===
  'cli-injection-exploit': createExploitValidator('cli_injection'),
  'cli-prompt-injection-exploit': createExploitValidator('cli_prompt_injection'),
  'cli-input-validation-exploit': createExploitValidator('cli_input_validation'),
  'cli-auth-exploit': createExploitValidator('cli_auth'),
  'cli-privesc-exploit': createExploitValidator('cli_privesc'),

  // === API Vulnerability Agents ===
  'api-auth-vuln': createDeliverableValidator('api_auth_analysis_deliverable.md'),
  'api-bola-vuln': createDeliverableValidator('api_bola_analysis_deliverable.md'),
  'api-input-validation-vuln': createDeliverableValidator('api_input_validation_analysis_deliverable.md'),

  // === API Exploitation Agents ===
  'api-auth-exploit': createExploitValidator('api_auth'),
  'api-bola-exploit': createExploitValidator('api_bola'),
  'api-input-validation-exploit': createExploitValidator('api_input_validation'),
});
