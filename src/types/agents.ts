// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent type definitions
 */

export type AgentName =
  | 'pre-recon'
  | 'recon'
  | 'injection-vuln'
  | 'xss-vuln'
  | 'auth-vuln'
  | 'ssrf-vuln'
  | 'authz-vuln'
  | 'injection-exploit'
  | 'xss-exploit'
  | 'auth-exploit'
  | 'ssrf-exploit'
  | 'authz-exploit'
  | 'report'
  | 'report-findings';

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
  | 'report-executive'
  | 'report-findings';

export type PlaywrightAgent =
  | 'playwright-agent1'
  | 'playwright-agent2'
  | 'playwright-agent3'
  | 'playwright-agent4'
  | 'playwright-agent5';

export type AgentValidator = (sourceDir: string) => Promise<boolean>;

export type AgentValidatorMap = Record<AgentName, AgentValidator>;

export type McpAgentMapping = Record<PromptName, PlaywrightAgent>;

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
