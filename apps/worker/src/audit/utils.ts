// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Audit System Utilities
 *
 * Core utility functions for path generation, atomic writes, and formatting.
 * All functions are pure and crash-safe.
 */

import path from 'node:path';
import { WORKSPACES_DIR } from '../paths.js';
import { ensureDirectory } from '../utils/file-io.js';

export type { SessionMetadata } from '../types/audit.js';

import type { SessionMetadata } from '../types/audit.js';

/**
 * Extract and sanitize hostname from URL for use in identifiers
 */
export function sanitizeHostname(url: string): string {
  return new URL(url).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
}

/**
 * Generate standardized session identifier from workflow ID
 * Workflow IDs already contain hostname, so we use them directly
 */
export function generateSessionIdentifier(sessionMetadata: SessionMetadata): string {
  return sessionMetadata.id;
}

/**
 * Generate path to audit log directory for a session
 * Uses custom outputPath if provided, otherwise defaults to WORKSPACES_DIR
 */
export function generateAuditPath(sessionMetadata: SessionMetadata): string {
  const sessionIdentifier = generateSessionIdentifier(sessionMetadata);
  const baseDir = sessionMetadata.outputPath || WORKSPACES_DIR;
  return path.join(baseDir, sessionIdentifier);
}

/**
 * Generate path to agent log file
 */
export function generateLogPath(
  sessionMetadata: SessionMetadata,
  agentName: string,
  timestamp: number,
  attemptNumber: number,
): string {
  const auditPath = generateAuditPath(sessionMetadata);
  const filename = `${timestamp}_${agentName}_attempt-${attemptNumber}.log`;
  return path.join(auditPath, 'agents', filename);
}

/**
 * Generate path to prompt snapshot file
 */
export function generatePromptPath(sessionMetadata: SessionMetadata, agentName: string): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'prompts', `${agentName}.md`);
}

/**
 * Generate path to session.json file
 */
export function generateSessionJsonPath(sessionMetadata: SessionMetadata): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'session.json');
}

/**
 * Generate path to workflow.log file
 */
export function generateWorkflowLogPath(sessionMetadata: SessionMetadata): string {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'workflow.log');
}

/**
 * Initialize audit directory structure for a session
 * Creates: workspaces/{sessionId}/, agents/, prompts/, deliverables/
 */
export async function initializeAuditStructure(sessionMetadata: SessionMetadata): Promise<void> {
  const auditPath = generateAuditPath(sessionMetadata);
  const agentsPath = path.join(auditPath, 'agents');
  const promptsPath = path.join(auditPath, 'prompts');
  const deliverablesPath = path.join(auditPath, 'deliverables');

  await ensureDirectory(auditPath);
  await ensureDirectory(agentsPath);
  await ensureDirectory(promptsPath);
  await ensureDirectory(deliverablesPath);
}
