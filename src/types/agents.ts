// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent type definitions
 */

import path from 'path';

/**
 * List of all agents in execution order.
 * Used for iteration during resume state checking.
 */
export const ALL_AGENTS = [
  'pre-recon',
  'recon',
  'injection-vuln',
  'xss-vuln',
  'auth-vuln',
  'ssrf-vuln',
  'authz-vuln',
  'injection-exploit',
  'xss-exploit',
  'auth-exploit',
  'ssrf-exploit',
  'authz-exploit',
  'report',
] as const;

/**
 * Agent name type derived from ALL_AGENTS.
 * This ensures type safety and prevents drift between type and array.
 */
export type AgentName = typeof ALL_AGENTS[number];

export type PromptName =
  | 'pre-recon-code'
  | 'recon'
  | 'vuln-injection'
  | 'vuln-xss'
  | 'vuln-auth'
  | 'vuln-ssrf'
  | 'vuln-authz'
  | 'exploit-injection'
  | 'exploit-xss'
  | 'exploit-auth'
  | 'exploit-ssrf'
  | 'exploit-authz'
  | 'report-executive';

export type PlaywrightAgent =
  | 'playwright-agent1'
  | 'playwright-agent2'
  | 'playwright-agent3'
  | 'playwright-agent4'
  | 'playwright-agent5';

export type AgentValidator = (sourceDir: string) => Promise<boolean>;

export type AgentStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'rolled-back';

export interface AgentDefinition {
  name: AgentName;
  displayName: string;
  prerequisites: AgentName[];
}

/**
 * Maps an agent name to its corresponding prompt file name.
 */
export function getPromptNameForAgent(agentName: AgentName): PromptName {
  const mappings: Record<AgentName, PromptName> = {
    'pre-recon': 'pre-recon-code',
    'recon': 'recon',
    'injection-vuln': 'vuln-injection',
    'xss-vuln': 'vuln-xss',
    'auth-vuln': 'vuln-auth',
    'ssrf-vuln': 'vuln-ssrf',
    'authz-vuln': 'vuln-authz',
    'injection-exploit': 'exploit-injection',
    'xss-exploit': 'exploit-xss',
    'auth-exploit': 'exploit-auth',
    'ssrf-exploit': 'exploit-ssrf',
    'authz-exploit': 'exploit-authz',
    'report': 'report-executive',
  };

  return mappings[agentName];
}

/**
 * Maps an agent name to its deliverable file path.
 * Must match mcp-server/src/types/deliverables.ts:DELIVERABLE_FILENAMES
 */
export function getDeliverablePath(agentName: AgentName, repoPath: string): string {
  const deliverableMap: Record<AgentName, string> = {
    'pre-recon': 'code_analysis_deliverable.md',
    'recon': 'recon_deliverable.md',
    'injection-vuln': 'injection_analysis_deliverable.md',
    'xss-vuln': 'xss_analysis_deliverable.md',
    'auth-vuln': 'auth_analysis_deliverable.md',
    'ssrf-vuln': 'ssrf_analysis_deliverable.md',
    'authz-vuln': 'authz_analysis_deliverable.md',
    'injection-exploit': 'injection_exploitation_evidence.md',
    'xss-exploit': 'xss_exploitation_evidence.md',
    'auth-exploit': 'auth_exploitation_evidence.md',
    'ssrf-exploit': 'ssrf_exploitation_evidence.md',
    'authz-exploit': 'authz_exploitation_evidence.md',
    'report': 'comprehensive_security_assessment_report.md',
  };

  const filename = deliverableMap[agentName];
  return path.join(repoPath, 'deliverables', filename);
}
