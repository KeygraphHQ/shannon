// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Deliverable Type Definitions
 *
 * Maps deliverable types to their filenames for the save-deliverable CLI.
 */

export enum DeliverableType {
  // Pre-recon agent
  CODE_ANALYSIS = 'CODE_ANALYSIS',

  // Recon agent
  RECON = 'RECON',

  // Vulnerability analysis agents
  INJECTION_ANALYSIS = 'INJECTION_ANALYSIS',
  XSS_ANALYSIS = 'XSS_ANALYSIS',
  AUTH_ANALYSIS = 'AUTH_ANALYSIS',
  AUTHZ_ANALYSIS = 'AUTHZ_ANALYSIS',
  SSRF_ANALYSIS = 'SSRF_ANALYSIS',

  // Exploitation agents
  INJECTION_EVIDENCE = 'INJECTION_EVIDENCE',
  XSS_EVIDENCE = 'XSS_EVIDENCE',
  AUTH_EVIDENCE = 'AUTH_EVIDENCE',
  AUTHZ_EVIDENCE = 'AUTHZ_EVIDENCE',
  SSRF_EVIDENCE = 'SSRF_EVIDENCE',
}

/**
 * Hard-coded filename mappings from agent prompts
 */
export const DELIVERABLE_FILENAMES: Record<DeliverableType, string> = {
  [DeliverableType.CODE_ANALYSIS]: 'code_analysis_deliverable.md',
  [DeliverableType.RECON]: 'recon_deliverable.md',
  [DeliverableType.INJECTION_ANALYSIS]: 'injection_analysis_deliverable.md',
  [DeliverableType.XSS_ANALYSIS]: 'xss_analysis_deliverable.md',
  [DeliverableType.AUTH_ANALYSIS]: 'auth_analysis_deliverable.md',
  [DeliverableType.AUTHZ_ANALYSIS]: 'authz_analysis_deliverable.md',
  [DeliverableType.SSRF_ANALYSIS]: 'ssrf_analysis_deliverable.md',
  [DeliverableType.INJECTION_EVIDENCE]: 'injection_exploitation_evidence.md',
  [DeliverableType.XSS_EVIDENCE]: 'xss_exploitation_evidence.md',
  [DeliverableType.AUTH_EVIDENCE]: 'auth_exploitation_evidence.md',
  [DeliverableType.AUTHZ_EVIDENCE]: 'authz_exploitation_evidence.md',
  [DeliverableType.SSRF_EVIDENCE]: 'ssrf_exploitation_evidence.md',
};
