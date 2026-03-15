// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deliverable Type Definitions
 *
 * Maps deliverable types to their filenames and defines validation requirements.
 * Must match the exact mappings from tools/save_deliverable.js.
 */

export enum DeliverableType {
  // Pre-recon agent
  CODE_ANALYSIS = 'CODE_ANALYSIS',

  // Recon agent
  RECON = 'RECON',

  // === Web Vulnerability Analysis Agents ===
  INJECTION_ANALYSIS = 'INJECTION_ANALYSIS',
  INJECTION_QUEUE = 'INJECTION_QUEUE',

  XSS_ANALYSIS = 'XSS_ANALYSIS',
  XSS_QUEUE = 'XSS_QUEUE',

  AUTH_ANALYSIS = 'AUTH_ANALYSIS',
  AUTH_QUEUE = 'AUTH_QUEUE',

  AUTHZ_ANALYSIS = 'AUTHZ_ANALYSIS',
  AUTHZ_QUEUE = 'AUTHZ_QUEUE',

  SSRF_ANALYSIS = 'SSRF_ANALYSIS',
  SSRF_QUEUE = 'SSRF_QUEUE',

  // === Web Exploitation Agents ===
  INJECTION_EVIDENCE = 'INJECTION_EVIDENCE',
  XSS_EVIDENCE = 'XSS_EVIDENCE',
  AUTH_EVIDENCE = 'AUTH_EVIDENCE',
  AUTHZ_EVIDENCE = 'AUTHZ_EVIDENCE',
  SSRF_EVIDENCE = 'SSRF_EVIDENCE',

  // === CLI Vulnerability Analysis Agents ===
  CLI_INJECTION_ANALYSIS = 'CLI_INJECTION_ANALYSIS',
  CLI_PROMPT_INJECTION_ANALYSIS = 'CLI_PROMPT_INJECTION_ANALYSIS',
  CLI_INPUT_VALIDATION_ANALYSIS = 'CLI_INPUT_VALIDATION_ANALYSIS',
  CLI_AUTH_ANALYSIS = 'CLI_AUTH_ANALYSIS',
  CLI_PRIVESC_ANALYSIS = 'CLI_PRIVESC_ANALYSIS',

  // === CLI Exploitation Agents ===
  CLI_INJECTION_EVIDENCE = 'CLI_INJECTION_EVIDENCE',
  CLI_PROMPT_INJECTION_EVIDENCE = 'CLI_PROMPT_INJECTION_EVIDENCE',
  CLI_INPUT_VALIDATION_EVIDENCE = 'CLI_INPUT_VALIDATION_EVIDENCE',
  CLI_AUTH_EVIDENCE = 'CLI_AUTH_EVIDENCE',
  CLI_PRIVESC_EVIDENCE = 'CLI_PRIVESC_EVIDENCE',

  // === API Vulnerability Analysis Agents ===
  API_AUTH_ANALYSIS = 'API_AUTH_ANALYSIS',
  API_BOLA_ANALYSIS = 'API_BOLA_ANALYSIS',
  API_INPUT_VALIDATION_ANALYSIS = 'API_INPUT_VALIDATION_ANALYSIS',

  // === API Exploitation Agents ===
  API_AUTH_EVIDENCE = 'API_AUTH_EVIDENCE',
  API_BOLA_EVIDENCE = 'API_BOLA_EVIDENCE',
  API_INPUT_VALIDATION_EVIDENCE = 'API_INPUT_VALIDATION_EVIDENCE',
}

/**
 * Hard-coded filename mappings from agent prompts
 * Must match tools/save_deliverable.js exactly
 */
export const DELIVERABLE_FILENAMES: Record<DeliverableType, string> = {
  // Shared
  [DeliverableType.CODE_ANALYSIS]: 'code_analysis_deliverable.md',
  [DeliverableType.RECON]: 'recon_deliverable.md',

  // Web
  [DeliverableType.INJECTION_ANALYSIS]: 'injection_analysis_deliverable.md',
  [DeliverableType.INJECTION_QUEUE]: 'injection_exploitation_queue.json',
  [DeliverableType.XSS_ANALYSIS]: 'xss_analysis_deliverable.md',
  [DeliverableType.XSS_QUEUE]: 'xss_exploitation_queue.json',
  [DeliverableType.AUTH_ANALYSIS]: 'auth_analysis_deliverable.md',
  [DeliverableType.AUTH_QUEUE]: 'auth_exploitation_queue.json',
  [DeliverableType.AUTHZ_ANALYSIS]: 'authz_analysis_deliverable.md',
  [DeliverableType.AUTHZ_QUEUE]: 'authz_exploitation_queue.json',
  [DeliverableType.SSRF_ANALYSIS]: 'ssrf_analysis_deliverable.md',
  [DeliverableType.SSRF_QUEUE]: 'ssrf_exploitation_queue.json',
  [DeliverableType.INJECTION_EVIDENCE]: 'injection_exploitation_evidence.md',
  [DeliverableType.XSS_EVIDENCE]: 'xss_exploitation_evidence.md',
  [DeliverableType.AUTH_EVIDENCE]: 'auth_exploitation_evidence.md',
  [DeliverableType.AUTHZ_EVIDENCE]: 'authz_exploitation_evidence.md',
  [DeliverableType.SSRF_EVIDENCE]: 'ssrf_exploitation_evidence.md',

  // CLI
  [DeliverableType.CLI_INJECTION_ANALYSIS]: 'cli_injection_analysis_deliverable.md',
  [DeliverableType.CLI_PROMPT_INJECTION_ANALYSIS]: 'cli_prompt_injection_analysis_deliverable.md',
  [DeliverableType.CLI_INPUT_VALIDATION_ANALYSIS]: 'cli_input_validation_analysis_deliverable.md',
  [DeliverableType.CLI_AUTH_ANALYSIS]: 'cli_auth_analysis_deliverable.md',
  [DeliverableType.CLI_PRIVESC_ANALYSIS]: 'cli_privesc_analysis_deliverable.md',
  [DeliverableType.CLI_INJECTION_EVIDENCE]: 'cli_injection_exploitation_evidence.md',
  [DeliverableType.CLI_PROMPT_INJECTION_EVIDENCE]: 'cli_prompt_injection_exploitation_evidence.md',
  [DeliverableType.CLI_INPUT_VALIDATION_EVIDENCE]: 'cli_input_validation_exploitation_evidence.md',
  [DeliverableType.CLI_AUTH_EVIDENCE]: 'cli_auth_exploitation_evidence.md',
  [DeliverableType.CLI_PRIVESC_EVIDENCE]: 'cli_privesc_exploitation_evidence.md',

  // API
  [DeliverableType.API_AUTH_ANALYSIS]: 'api_auth_analysis_deliverable.md',
  [DeliverableType.API_BOLA_ANALYSIS]: 'api_bola_analysis_deliverable.md',
  [DeliverableType.API_INPUT_VALIDATION_ANALYSIS]: 'api_input_validation_analysis_deliverable.md',
  [DeliverableType.API_AUTH_EVIDENCE]: 'api_auth_exploitation_evidence.md',
  [DeliverableType.API_BOLA_EVIDENCE]: 'api_bola_exploitation_evidence.md',
  [DeliverableType.API_INPUT_VALIDATION_EVIDENCE]: 'api_input_validation_exploitation_evidence.md',
};

/**
 * Queue types that require JSON validation
 */
export const QUEUE_TYPES: DeliverableType[] = [
  DeliverableType.INJECTION_QUEUE,
  DeliverableType.XSS_QUEUE,
  DeliverableType.AUTH_QUEUE,
  DeliverableType.AUTHZ_QUEUE,
  DeliverableType.SSRF_QUEUE,
];

/**
 * Type guard to check if a deliverable type is a queue
 */
export function isQueueType(type: string): boolean {
  return QUEUE_TYPES.includes(type as DeliverableType);
}

/**
 * Vulnerability queue structure
 */
export interface VulnerabilityQueue {
  vulnerabilities: VulnerabilityItem[];
}

export interface VulnerabilityItem {
  [key: string]: unknown;
}
