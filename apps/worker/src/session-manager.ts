// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

import { RECON_ROUTE_DISPOSITIONS } from './ai/queue-schemas.js';
import type { ActivityLogger } from './types/activity-logger.js';
import type {
  AgentDefinition,
  AgentName,
  AgentValidator,
  PlaywrightSession,
  ValidationMode,
  VulnType,
} from './types/index.js';

// Agent definitions according to PRD
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
  report: {
    name: 'report',
    displayName: 'Report agent',
    prerequisites: ['injection-exploit', 'xss-exploit', 'auth-exploit', 'ssrf-exploit', 'authz-exploit'],
    promptTemplate: 'report-executive',
    deliverableFilename: 'comprehensive_security_assessment_report.md',
  },
});

interface RecordedAgentState {
  readonly status: string;
}

/**
 * Return recorded prerequisites that were not accepted into the current resume state.
 * Missing records are ignored because class-scoped runs intentionally omit unrelated agents.
 */
export function incompleteRecordedPrerequisites(
  agentName: AgentName,
  recordedAgents: Readonly<Partial<Record<AgentName, RecordedAgentState>>>,
  completedAgents: ReadonlySet<string>,
): AgentName[] {
  return AGENTS[agentName].prerequisites.filter(
    (prerequisite) => recordedAgents[prerequisite] !== undefined && !completedAgents.has(prerequisite),
  );
}

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
// The validator checks queue.json, written by the submit-tool path in
// agent-execution.ts before this validator runs. Authz additionally verifies
// its handoff against the already-rendered recon deliverable.
interface ReconRouteDisposition {
  route_id?: unknown;
  disposition?: unknown;
  finding_ids?: unknown;
  evidence?: unknown;
}

interface AuthzQueueDocument {
  vulnerabilities?: unknown;
  recon_route_dispositions?: unknown;
}

const RECON_ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD', 'WS']);

function markdownTableCells(line: string): string[] {
  if (!line.startsWith('|') || !line.endsWith('|')) return [];
  return line
    .slice(1, -1)
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function reconRouteIds(markdown: string): string[] | null {
  const sectionStart = markdown.indexOf('## 4. API Endpoint Inventory');
  if (sectionStart === -1) return null;
  const sectionEnd = markdown.indexOf('\n## ', sectionStart + 1);
  if (sectionEnd === -1) return null;
  const section = markdown.slice(sectionStart, sectionEnd);
  if (section.includes('[Section 4: not provided')) return [];
  const rows = section.split(/\r?\n/).map(markdownTableCells);
  const header = rows.find((cells) => cells.includes('Method') && cells.includes('Endpoint Path'));
  if (!header) return null;
  const methodIndex = header.indexOf('Method');
  const pathIndex = header.indexOf('Endpoint Path');

  const routeIds = rows
    .filter((cells) => RECON_ROUTE_METHODS.has(cells[methodIndex] ?? '') && (cells[pathIndex]?.length ?? 0) > 0)
    .map((cells) => `${cells[methodIndex]} ${cells[pathIndex]}`);
  return routeIds.length > 0 ? routeIds : null;
}

async function validateAuthzReconHandoff(
  sourceDir: string,
  queueFile: string,
  logger: ActivityLogger,
  mode: ValidationMode,
): Promise<boolean> {
  const reconFile = path.join(sourceDir, 'recon_deliverable.md');
  if (!(await fs.pathExists(reconFile))) {
    logger.warn('Authz recon handoff validation failed: recon_deliverable.md missing');
    return false;
  }

  try {
    const [reconMarkdown, queueJson] = await Promise.all([
      fs.readFile(reconFile, 'utf8'),
      fs.readFile(queueFile, 'utf8'),
    ]);
    const expectedRouteIds = reconRouteIds(reconMarkdown);
    if (expectedRouteIds === null) {
      logger.warn('Authz recon handoff validation failed: recon Section 4 is missing or malformed');
      return false;
    }
    const queue = JSON.parse(queueJson) as AuthzQueueDocument;
    const rawDispositions = queue.recon_route_dispositions;
    // A queue written before the route ledger existed carries no dispositions at all. Its run is
    // already recorded as complete, so a resume accepts it rather than discarding the whole analysis.
    if (rawDispositions === undefined && mode === 'resume') {
      logger.warn('Authz queue predates recon route dispositions; accepting recorded completion on resume');
      return true;
    }
    if (!Array.isArray(rawDispositions)) {
      logger.warn('Authz recon handoff validation failed: recon_route_dispositions missing or invalid');
      return false;
    }

    if (!Array.isArray(queue.vulnerabilities)) {
      logger.warn('Authz recon handoff validation failed: vulnerabilities missing or invalid');
      return false;
    }

    const expectedRouteIdSet = new Set(expectedRouteIds);
    const findingIds = new Set(
      queue.vulnerabilities
        .map((entry) => (entry as { ID?: unknown } | null)?.ID)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );
    const submittedRouteIds = new Map<string, number>();
    const violations: string[] = [];

    for (const [index, rawDisposition] of rawDispositions.entries()) {
      if (typeof rawDisposition !== 'object' || rawDisposition === null) {
        violations.push(`disposition ${index + 1} is not an object`);
        continue;
      }
      const disposition = rawDisposition as ReconRouteDisposition;
      if (typeof disposition.route_id !== 'string' || disposition.route_id.length === 0) {
        violations.push(`disposition ${index + 1} has no route_id`);
        continue;
      }

      const routeId = disposition.route_id;
      submittedRouteIds.set(routeId, (submittedRouteIds.get(routeId) ?? 0) + 1);
      if (!expectedRouteIdSet.has(routeId)) {
        violations.push(`unknown route disposition: ${routeId}`);
      }
      const dispositionIsKnown = RECON_ROUTE_DISPOSITIONS.some((value) => value === disposition.disposition);
      if (!dispositionIsKnown) {
        violations.push(`${routeId} has invalid disposition`);
      }
      if (typeof disposition.evidence !== 'string' || disposition.evidence.trim().length === 0) {
        violations.push(`${routeId} has no evidence`);
      }
      if (!Array.isArray(disposition.finding_ids)) {
        violations.push(`${routeId} has invalid finding_ids`);
        continue;
      }

      const linkedFindingIds = disposition.finding_ids.filter((id): id is string => typeof id === 'string');
      if (linkedFindingIds.length !== disposition.finding_ids.length) {
        violations.push(`${routeId} has a non-string finding ID`);
      }
      if (disposition.disposition === 'queued') {
        if (linkedFindingIds.length === 0) {
          violations.push(`${routeId} is queued without a finding ID`);
        }
        for (const findingId of linkedFindingIds) {
          if (!findingIds.has(findingId)) {
            violations.push(`${routeId} references unknown finding ID ${findingId}`);
          }
        }
      } else if (disposition.disposition === 'out_of_scope') {
        // These findings were confirmed and then deliberately kept out of the queue, so they live in
        // the deliverable's out-of-scope section rather than in `vulnerabilities`. The route still
        // has to name them, or the confirmation leaves no trace on the ledger.
        if (linkedFindingIds.length === 0) {
          violations.push(`${routeId} is out_of_scope without a finding ID`);
        }
      } else if (linkedFindingIds.length > 0) {
        violations.push(`${routeId} is ${String(disposition.disposition)} but links finding IDs`);
      }
    }

    for (const [routeId, count] of submittedRouteIds) {
      if (count > 1) violations.push(`duplicate route disposition: ${routeId}`);
    }
    for (const routeId of expectedRouteIds) {
      if (!submittedRouteIds.has(routeId)) violations.push(`missing route disposition: ${routeId}`);
    }

    if (violations.length > 0) {
      logger.warn(`Authz recon handoff validation failed: ${violations.join('; ')}`);
      return false;
    }
    return true;
  } catch (error) {
    logger.warn(`Authz recon handoff validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

function createVulnValidator(vulnType: VulnType): AgentValidator {
  return async (sourceDir: string, logger: ActivityLogger, mode: ValidationMode = 'completion'): Promise<boolean> => {
    const queueFile = path.join(sourceDir, `${vulnType}_exploitation_queue.json`);
    const queueExists = await fs.pathExists(queueFile);
    if (!queueExists) {
      logger.warn(`Queue validation failed for ${vulnType}: ${vulnType}_exploitation_queue.json missing`);
      return false;
    }
    if (vulnType === 'authz') {
      return validateAuthzReconHandoff(sourceDir, queueFile, logger, mode);
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
