// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

import type { ActivityLogger } from './types/activity-logger.js';
import type { AgentDefinition, AgentName, AgentValidator, PlaywrightSession, VulnType } from './types/index.js';
import type { ReconciliationClass } from './types/reconciliation.js';

// Single source of truth for every agent the pipeline can run. Each entry:
//   - name / displayName: identity used in logs, metrics, and per-agent log filenames
//   - prerequisites: the agents this one conceptually depends on. This is documentation
//     of the intended dependency graph, not an executed check. Actual phase ordering and
//     concurrency are enforced by the explicit phase structure in the Temporal workflow.
//   - promptTemplate: the file under apps/worker/prompts/ (without extension) rendered for this agent
//   - deliverableFilename: the canonical filename AgentExecutionService and the
//     save-deliverable CLI script write this agent's output under
export const AGENTS: Readonly<Record<AgentName, AgentDefinition>> = Object.freeze({
  'pre-recon': {
    name: 'pre-recon',
    displayName: 'Pre-recon agent',
    prerequisites: [],
    promptTemplate: 'pre-recon-code',
    deliverableFilename: 'pre_recon_deliverable.md',
  },
  recon: {
    name: 'recon',
    displayName: 'Recon agent',
    prerequisites: ['pre-recon'],
    promptTemplate: 'recon',
    deliverableFilename: 'recon_deliverable.md',
  },
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-injection',
    deliverableFilename: 'injection_analysis_deliverable.md',
  },
  'xss-vuln': {
    name: 'xss-vuln',
    displayName: 'XSS vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-xss',
    deliverableFilename: 'xss_analysis_deliverable.md',
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Auth vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-auth',
    deliverableFilename: 'auth_analysis_deliverable.md',
  },
  'ssrf-vuln': {
    name: 'ssrf-vuln',
    displayName: 'SSRF vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-ssrf',
    deliverableFilename: 'ssrf_analysis_deliverable.md',
  },
  'authz-vuln': {
    name: 'authz-vuln',
    displayName: 'Authz vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-authz',
    deliverableFilename: 'authz_analysis_deliverable.md',
  },
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection exploit agent',
    prerequisites: ['injection-vuln'],
    promptTemplate: 'exploit-injection',
    deliverableFilename: 'injection_exploitation_evidence.md',
  },
  'xss-exploit': {
    name: 'xss-exploit',
    displayName: 'XSS exploit agent',
    prerequisites: ['xss-vuln'],
    promptTemplate: 'exploit-xss',
    deliverableFilename: 'xss_exploitation_evidence.md',
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Auth exploit agent',
    prerequisites: ['auth-vuln'],
    promptTemplate: 'exploit-auth',
    deliverableFilename: 'auth_exploitation_evidence.md',
  },
  'ssrf-exploit': {
    name: 'ssrf-exploit',
    displayName: 'SSRF exploit agent',
    prerequisites: ['ssrf-vuln'],
    promptTemplate: 'exploit-ssrf',
    deliverableFilename: 'ssrf_exploitation_evidence.md',
  },
  'authz-exploit': {
    name: 'authz-exploit',
    displayName: 'Authz exploit agent',
    prerequisites: ['authz-vuln'],
    promptTemplate: 'exploit-authz',
    deliverableFilename: 'authz_exploitation_evidence.md',
  },
  // Internal class covering findings outside the five core vuln types (from reconciliation
  // or agentic SAST). It has no analysis-phase counterpart: there is no 'miscellaneous-vuln'
  // agent, since it only ever receives findings that another phase already surfaced.
  'miscellaneous-exploit': {
    name: 'miscellaneous-exploit',
    displayName: 'Miscellaneous exploit agent',
    prerequisites: ['recon'],
    promptTemplate: 'exploit-miscellaneous',
    deliverableFilename: 'miscellaneous_exploitation_evidence.md',
  },
  report: {
    name: 'report',
    displayName: 'Report agent',
    prerequisites: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'],
    promptTemplate: 'report-executive',
    deliverableFilename: 'comprehensive_security_assessment_report.md',
  },
});

// Phase names for metrics aggregation
export type PhaseName = 'pre-recon' | 'recon' | 'vulnerability-analysis' | 'exploitation' | 'reporting';

// Map agents to their corresponding phases (single source of truth)
export const AGENT_PHASE_MAP: Readonly<Record<AgentName, PhaseName>> = Object.freeze({
  'pre-recon': 'pre-recon',
  recon: 'recon',
  'injection-vuln': 'vulnerability-analysis',
  'xss-vuln': 'vulnerability-analysis',
  'auth-vuln': 'vulnerability-analysis',
  'authz-vuln': 'vulnerability-analysis',
  'ssrf-vuln': 'vulnerability-analysis',
  'injection-exploit': 'exploitation',
  'xss-exploit': 'exploitation',
  'auth-exploit': 'exploitation',
  'authz-exploit': 'exploitation',
  'ssrf-exploit': 'exploitation',
  'miscellaneous-exploit': 'exploitation',
  report: 'reporting',
});

// Factory function for vulnerability queue validators.
//
// The analysis_deliverable.md is rendered via the writeDeliverable hook, which
// AgentExecutionService runs after validateAgentOutput but before the success
// commit — so a "both files exist" check here would race the renderer. The
// validator only checks queue.json, written by the submit-tool path in
// agent-execution.ts before this validator runs.
function createVulnValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string, logger: ActivityLogger): Promise<boolean> => {
    const queueFile = path.join(sourceDir, `${vulnType}_exploitation_queue.json`);
    const queueExists = await fs.pathExists(queueFile);
    if (!queueExists) {
      logger.warn(`Queue validation failed for ${vulnType}: ${vulnType}_exploitation_queue.json missing`);
      return false;
    }
    return true;
  };
}

// Exploitation agents — the evidence deliverable is rendered via the writeDeliverable
// hook after the agent succeeds (before the success commit), so a file-existence check
// here would race the renderer.
//
// Exploitation includes the analysis-less internal `miscellaneous` class, while vulnerability
// analysis remains limited to the five-class VulnType contract above.
function createExploitValidator(_vulnType: ReconciliationClass): AgentValidator {
  return async (): Promise<boolean> => true;
}

// Playwright session mapping - assigns each agent to a specific session for browser isolation
// Keys are promptTemplate values from AGENTS registry
export const PLAYWRIGHT_SESSION_MAPPING: Record<string, PlaywrightSession> = Object.freeze({
  // Runs before any agent — non-concurrent, so agent1 is safe to share
  'validate-authentication': 'agent1',

  // Phase 1: Pre-reconnaissance
  'pre-recon-code': 'agent1',

  // Phase 2: Reconnaissance
  recon: 'agent2',

  // Phase 3: Vulnerability Analysis (5 parallel agents)
  'vuln-injection': 'agent1',
  'vuln-xss': 'agent2',
  'vuln-auth': 'agent3',
  'vuln-ssrf': 'agent4',
  'vuln-authz': 'agent5',

  // Phase 4: Exploitation (5 parallel agents - same as vuln counterparts)
  'exploit-injection': 'agent1',
  'exploit-xss': 'agent2',
  'exploit-auth': 'agent3',
  'exploit-ssrf': 'agent4',
  'exploit-authz': 'agent5',

  // Conditional analysis-less class; it may run beside the five analysis-backed exploit agents.
  'exploit-miscellaneous': 'agent6',

  // Phase 5: Reporting
  'report-executive': 'agent3',
});

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS: Record<AgentName, AgentValidator> = Object.freeze({
  // Pre-reconnaissance agent — skipped tools surface as renderer placeholders, not
  // activity failures. The deliverable file is written by the renderer after the agent
  // succeeds, so a file-existence check here would race the renderer.
  'pre-recon': async (): Promise<boolean> => true,

  // Reconnaissance agent — validation lives in runReconAgent post-processing.
  // The deliverable file is written by the renderer after the agent succeeds, so a
  // file-existence check here would race the renderer.
  recon: async (): Promise<boolean> => true,

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
  'miscellaneous-exploit': createExploitValidator('miscellaneous'),

  // Executive report agent
  report: async (sourceDir: string, logger: ActivityLogger): Promise<boolean> => {
    const reportFile = path.join(sourceDir, 'comprehensive_security_assessment_report.md');

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      logger.error('Missing required deliverable: comprehensive_security_assessment_report.md');
    }

    return reportExists;
  },
});
