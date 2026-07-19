// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

import { validateReportStructure } from './services/report-validation.js';
import type { ActivityLogger } from './types/activity-logger.js';
import type { AgentDefinition, AgentName, AgentValidator, PlaywrightSession, VulnType } from './types/index.js';

// Agent definitions according to PRD
export const AGENTS: Readonly<Record<AgentName, AgentDefinition>> = Object.freeze({
  'pre-recon': {
    name: 'pre-recon',
    displayName: 'Pre-recon agent',
    prerequisites: [],
    promptTemplate: 'pre-recon-code',
    deliverableFilename: 'pre_recon_deliverable.md',
    modelTier: 'large',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  recon: {
    name: 'recon',
    displayName: 'Recon agent',
    prerequisites: ['pre-recon'],
    promptTemplate: 'recon',
    deliverableFilename: 'recon_deliverable.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'injection-vuln': {
    name: 'injection-vuln',
    displayName: 'Injection vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-injection',
    deliverableFilename: 'injection_analysis_deliverable.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'xss-vuln': {
    name: 'xss-vuln',
    displayName: 'XSS vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-xss',
    deliverableFilename: 'xss_analysis_deliverable.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'auth-vuln': {
    name: 'auth-vuln',
    displayName: 'Auth vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-auth',
    deliverableFilename: 'auth_analysis_deliverable.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'ssrf-vuln': {
    name: 'ssrf-vuln',
    displayName: 'SSRF vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-ssrf',
    deliverableFilename: 'ssrf_analysis_deliverable.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'authz-vuln': {
    name: 'authz-vuln',
    displayName: 'Authz vuln agent',
    prerequisites: ['recon'],
    promptTemplate: 'vuln-authz',
    deliverableFilename: 'authz_analysis_deliverable.md',
    modelTier: 'large',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
  },
  'injection-exploit': {
    name: 'injection-exploit',
    displayName: 'Injection exploit agent',
    prerequisites: ['injection-vuln'],
    promptTemplate: 'exploit-injection',
    deliverableFilename: 'injection_exploitation_evidence.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'small',
    childReasoningEffort: 'low',
  },
  'xss-exploit': {
    name: 'xss-exploit',
    displayName: 'XSS exploit agent',
    prerequisites: ['xss-vuln'],
    promptTemplate: 'exploit-xss',
    deliverableFilename: 'xss_exploitation_evidence.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'small',
    childReasoningEffort: 'low',
  },
  'auth-exploit': {
    name: 'auth-exploit',
    displayName: 'Auth exploit agent',
    prerequisites: ['auth-vuln'],
    promptTemplate: 'exploit-auth',
    deliverableFilename: 'auth_exploitation_evidence.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'small',
    childReasoningEffort: 'low',
  },
  'ssrf-exploit': {
    name: 'ssrf-exploit',
    displayName: 'SSRF exploit agent',
    prerequisites: ['ssrf-vuln'],
    promptTemplate: 'exploit-ssrf',
    deliverableFilename: 'ssrf_exploitation_evidence.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'small',
    childReasoningEffort: 'low',
  },
  'authz-exploit': {
    name: 'authz-exploit',
    displayName: 'Authz exploit agent',
    prerequisites: ['authz-vuln'],
    promptTemplate: 'exploit-authz',
    deliverableFilename: 'authz_exploitation_evidence.md',
    modelTier: 'large',
    reasoningEffort: 'medium',
    childModelTier: 'small',
    childReasoningEffort: 'low',
  },
  report: {
    name: 'report',
    displayName: 'Report agent',
    prerequisites: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'],
    promptTemplate: 'report-executive',
    deliverableFilename: 'comprehensive_security_assessment_report.md',
    modelTier: 'medium',
    reasoningEffort: 'medium',
    childModelTier: 'medium',
    childReasoningEffort: 'medium',
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
    try {
      const queue = (await fs.readJson(queueFile)) as { vulnerabilities?: unknown };
      if (!Array.isArray(queue.vulnerabilities)) {
        logger.warn(`Queue validation failed for ${vulnType}: vulnerabilities must be an array`);
        return false;
      }
      const ids: string[] = [];
      for (const entry of queue.vulnerabilities) {
        if (typeof entry !== 'object' || entry === null) {
          logger.warn(`Queue validation failed for ${vulnType}: vulnerability entry must be an object`);
          return false;
        }
        const candidate = entry as Record<string, unknown>;
        if (
          typeof candidate.ID !== 'string' ||
          candidate.ID.trim() === '' ||
          typeof candidate.vulnerability_type !== 'string' ||
          candidate.vulnerability_type.trim() === '' ||
          typeof candidate.externally_exploitable !== 'boolean' ||
          typeof candidate.confidence !== 'string' ||
          !['low', 'medium', 'high'].includes(candidate.confidence) ||
          typeof candidate.severity !== 'string' ||
          !['low', 'medium', 'high', 'critical'].includes(candidate.severity)
        ) {
          logger.warn(`Queue validation failed for ${vulnType}: entry has incomplete required fields`);
          return false;
        }
        ids.push(candidate.ID);
      }
      if (new Set(ids).size !== ids.length) {
        logger.warn(`Queue validation failed for ${vulnType}: duplicate vulnerability IDs`);
        return false;
      }
    } catch (error) {
      logger.warn(`Queue validation failed for ${vulnType}: ${(error as Error).message}`);
      return false;
    }
    return true;
  };
}

// Exploitation agents — the evidence deliverable is rendered via the writeDeliverable
// hook after the agent succeeds (before the success commit), so a file-existence check
// here would race the renderer.
//
// VulnType is kept in the import surface for createVulnValidator above; this factory
// returns a no-op validator parameterized only for symmetry with the vuln-side factory.
function createExploitValidator(_vulnType: VulnType): AgentValidator {
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

  // Phase 5: Reporting
  'report-executive': 'agent3',
});

// Direct agent-to-validator mapping - much simpler than pattern matching
export const AGENT_VALIDATORS: Record<AgentName, AgentValidator> = Object.freeze({
  // Collector completion is validated by the activity's writeDeliverable hook because
  // the collector state is intentionally run-local and not visible from this registry.
  'pre-recon': async (): Promise<boolean> => true,

  // Recon collector completion is likewise validated before deterministic rendering.
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

  // Executive report agent
  report: async (sourceDir: string, logger: ActivityLogger): Promise<boolean> => {
    const reportFile = path.join(sourceDir, 'comprehensive_security_assessment_report.md');

    const reportExists = await fs.pathExists(reportFile);

    if (!reportExists) {
      logger.error('Missing required deliverable: comprehensive_security_assessment_report.md');
      return false;
    }

    const content = await fs.readFile(reportFile, 'utf8');
    const issues = validateReportStructure(content);
    for (const issue of issues) {
      logger.error(`Report validation failed: ${issue}`);
    }
    return issues.length === 0;
  },
});
