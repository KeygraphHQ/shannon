// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent type definitions
 */

// === Target Types ===

/**
 * Target types supported by the pipeline.
 * - web: Traditional web application (browser-based, Playwright MCP)
 * - cli: CLI/TUI application (terminal-based, shell interaction)
 * - api: API service (HTTP endpoints, no browser UI)
 */
export type TargetType = 'web' | 'cli' | 'api';

// === Web Agents ===

/**
 * List of all web-target agents in execution order.
 */
export const WEB_AGENTS = [
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

// === CLI/TUI Agents ===

/**
 * List of all CLI/TUI-target agents in execution order.
 *
 * CLI pipelines focus on:
 * - Command injection via argument/stdin manipulation
 * - Prompt injection for AI-powered CLIs
 * - Input validation bypass (argument parsing, env vars, config files)
 * - Auth/authz flaws in CLI authentication flows
 * - Privilege escalation via SUID, capabilities, or sudo misuse
 */
export const CLI_AGENTS = [
  'pre-recon',
  'recon',
  'cli-injection-vuln',
  'cli-prompt-injection-vuln',
  'cli-input-validation-vuln',
  'cli-auth-vuln',
  'cli-privesc-vuln',
  'cli-injection-exploit',
  'cli-prompt-injection-exploit',
  'cli-input-validation-exploit',
  'cli-auth-exploit',
  'cli-privesc-exploit',
  'report',
] as const;

// === API Agents ===

/**
 * List of all API-target agents in execution order.
 *
 * API pipelines focus on:
 * - Injection (SQL, NoSQL, command) via API parameters
 * - Auth/authz flaws (broken auth, BOLA/IDOR, mass assignment)
 * - SSRF via API parameters
 * - Input validation (mass assignment, type confusion, rate limiting)
 * - Business logic flaws in API workflows
 */
export const API_AGENTS = [
  'pre-recon',
  'recon',
  'injection-vuln',
  'api-auth-vuln',
  'api-bola-vuln',
  'ssrf-vuln',
  'api-input-validation-vuln',
  'injection-exploit',
  'api-auth-exploit',
  'api-bola-exploit',
  'ssrf-exploit',
  'api-input-validation-exploit',
  'report',
] as const;

/**
 * Union of all agent lists. Used for resume state checking across target types.
 */
export const ALL_AGENTS = [
  ...WEB_AGENTS,
  // CLI-specific agents (exclude shared pre-recon, recon, report)
  'cli-injection-vuln',
  'cli-prompt-injection-vuln',
  'cli-input-validation-vuln',
  'cli-auth-vuln',
  'cli-privesc-vuln',
  'cli-injection-exploit',
  'cli-prompt-injection-exploit',
  'cli-input-validation-exploit',
  'cli-auth-exploit',
  'cli-privesc-exploit',
  // API-specific agents (exclude shared pre-recon, recon, injection, ssrf, report)
  'api-auth-vuln',
  'api-bola-vuln',
  'api-input-validation-vuln',
  'api-auth-exploit',
  'api-bola-exploit',
  'api-input-validation-exploit',
] as const;

/**
 * Agent name type derived from ALL_AGENTS.
 * This ensures type safety and prevents drift between type and array.
 */
export type AgentName = typeof ALL_AGENTS[number];

/**
 * Get the agent list for a given target type.
 */
export function getAgentsForTarget(targetType: TargetType): readonly AgentName[] {
  switch (targetType) {
    case 'web': return WEB_AGENTS;
    case 'cli': return CLI_AGENTS;
    case 'api': return API_AGENTS;
  }
}

export type PlaywrightAgent =
  | 'playwright-agent1'
  | 'playwright-agent2'
  | 'playwright-agent3'
  | 'playwright-agent4'
  | 'playwright-agent5';

import type { ActivityLogger } from './activity-logger.js';

export type AgentValidator = (sourceDir: string, logger: ActivityLogger) => Promise<boolean>;

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
  promptTemplate: string;
  deliverableFilename: string;
  modelTier?: 'small' | 'medium' | 'large';
  /** Target types this agent applies to. Omit for shared agents (pre-recon, recon, report). */
  targetTypes?: readonly TargetType[];
}

/**
 * Vulnerability types supported by the web pipeline.
 */
export type VulnType = 'injection' | 'xss' | 'auth' | 'ssrf' | 'authz';

/**
 * Vulnerability types supported by the CLI pipeline.
 */
export type CliVulnType = 'cli-injection' | 'cli-prompt-injection' | 'cli-input-validation' | 'cli-auth' | 'cli-privesc';

/**
 * Vulnerability types supported by the API pipeline.
 */
export type ApiVulnType = 'injection' | 'api-auth' | 'api-bola' | 'ssrf' | 'api-input-validation';

/**
 * Decision returned by queue validation for exploitation phase.
 */
export interface ExploitationDecision {
  shouldExploit: boolean;
  shouldRetry: boolean;
  vulnerabilityCount: number;
  vulnType: VulnType | CliVulnType | ApiVulnType;
}
