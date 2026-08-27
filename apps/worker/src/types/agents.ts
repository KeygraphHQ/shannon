// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent type definitions
 */

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
  'miscellaneous-exploit',
  'report',
] as const;

/**
 * Agent name type derived from ALL_AGENTS.
 * This ensures type safety and prevents drift between type and array.
 */
export type AgentName = (typeof ALL_AGENTS)[number];

export type PlaywrightSession = 'agent1' | 'agent2' | 'agent3' | 'agent4' | 'agent5' | 'agent6';

import type { ActivityLogger } from './activity-logger.js';
import type { VulnClass } from './config.js';

export type AgentValidator = (sourceDir: string, logger: ActivityLogger) => Promise<boolean>;

export type AgentStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled-back';

export interface AgentDefinition {
  name: AgentName;
  displayName: string;
  prerequisites: AgentName[];
  promptTemplate: string;
  deliverableFilename: string;
}

/**
 * Vulnerability types supported by the pipeline.
 */
export type VulnType = VulnClass;

/**
 * Decision returned by queue validation for exploitation phase.
 */
export interface ExploitationDecision {
  /** True when the class's exploitation queue has at least one vulnerability to process. */
  shouldExploit: boolean;
  /** Currently always false; queue validation failures are surfaced as thrown errors instead. */
  shouldRetry: boolean;
  vulnerabilityCount: number;
  vulnType: VulnType;
}
