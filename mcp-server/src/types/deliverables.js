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

/**
 * @typedef {Object} DeliverableType
 * @property {string} CODE_ANALYSIS
 * @property {string} RECON
 * @property {string} INJECTION_ANALYSIS
 * @property {string} INJECTION_QUEUE
 * @property {string} XSS_ANALYSIS
 * @property {string} XSS_QUEUE
 * @property {string} AUTH_ANALYSIS
 * @property {string} AUTH_QUEUE
 * @property {string} AUTHZ_ANALYSIS
 * @property {string} AUTHZ_QUEUE
 * @property {string} SSRF_ANALYSIS
 * @property {string} SSRF_QUEUE
 * @property {string} INJECTION_EVIDENCE
 * @property {string} XSS_EVIDENCE
 * @property {string} AUTH_EVIDENCE
 * @property {string} AUTHZ_EVIDENCE
 * @property {string} SSRF_EVIDENCE
 */

export const DeliverableType = {
  // Pre-recon agent
  CODE_ANALYSIS: 'CODE_ANALYSIS',

  // Recon agent
  RECON: 'RECON',

  // Vulnerability analysis agents
  INJECTION_ANALYSIS: 'INJECTION_ANALYSIS',
  INJECTION_QUEUE: 'INJECTION_QUEUE',

  XSS_ANALYSIS: 'XSS_ANALYSIS',
  XSS_QUEUE: 'XSS_QUEUE',

  AUTH_ANALYSIS: 'AUTH_ANALYSIS',
  AUTH_QUEUE: 'AUTH_QUEUE',

  AUTHZ_ANALYSIS: 'AUTHZ_ANALYSIS',
  AUTHZ_QUEUE: 'AUTHZ_QUEUE',

  SSRF_ANALYSIS: 'SSRF_ANALYSIS',
  SSRF_QUEUE: 'SSRF_QUEUE',

  // Exploitation agents
  INJECTION_EVIDENCE: 'INJECTION_EVIDENCE',
  XSS_EVIDENCE: 'XSS_EVIDENCE',
  AUTH_EVIDENCE: 'AUTH_EVIDENCE',
  AUTHZ_EVIDENCE: 'AUTHZ_EVIDENCE',
  SSRF_EVIDENCE: 'SSRF_EVIDENCE',
};

/**
 * Hard-coded filename mappings from agent prompts
 * Must match tools/save_deliverable.js exactly
 */
export const DELIVERABLE_FILENAMES = {
  [DeliverableType.CODE_ANALYSIS]: 'code_analysis_deliverable.md',
  [DeliverableType.RECON]: 'recon_deliverable.md',
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
};

/**
 * Queue types that require JSON validation
 */
export const QUEUE_TYPES = [
  DeliverableType.INJECTION_QUEUE,
  DeliverableType.XSS_QUEUE,
  DeliverableType.AUTH_QUEUE,
  DeliverableType.AUTHZ_QUEUE,
  DeliverableType.SSRF_QUEUE,
];

/**
 * Type guard to check if a deliverable type is a queue
 * @param {string} type - Deliverable type to check
 * @returns {boolean} True if the type is a queue type
 */
export function isQueueType(type) {
  return QUEUE_TYPES.includes(type);
}

/**
 * @typedef {Object} VulnerabilityQueue
 * @property {Array<Object>} vulnerabilities - Array of vulnerability objects
 */
