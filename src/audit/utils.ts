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

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Import and re-export file I/O utilities from canonical location
import { ensureDirectory, atomicWrite, readJson, fileExists } from '../utils/file-io.js';
export { ensureDirectory, atomicWrite, readJson, fileExists };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get Shannon repository root
const SHANNON_ROOT = path.resolve(__dirname, '..', '..');
const AUDIT_LOGS_DIR = path.join(SHANNON_ROOT, 'audit-logs');

export interface SessionMetadata {
  id: string;
  webUrl: string;
  repoPath?: string;
  outputPath?: string;
  [key: string]: unknown;
}

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
 * Uses custom outputPath if provided, otherwise defaults to AUDIT_LOGS_DIR
 */
export function generateAuditPath(sessionMetadata: SessionMetadata): string {
  const sessionIdentifier = generateSessionIdentifier(sessionMetadata);
  const baseDir = sessionMetadata.outputPath || AUDIT_LOGS_DIR;
  return path.join(baseDir, sessionIdentifier);
}

/**
 * Generate path to agent log file
 */
export function generateLogPath(
  sessionMetadata: SessionMetadata,
  agentName: string,
  timestamp: number,
  attemptNumber: number
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
 * Creates: audit-logs/{sessionId}/, agents/, prompts/, deliverables/
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

/**
 * Copy deliverable files from repo to audit-logs for self-contained audit trail.
 * No-ops if source directory doesn't exist. Idempotent and parallel-safe.
 */
export async function copyDeliverablesToAudit(
  sessionMetadata: SessionMetadata,
  repoPath: string
): Promise<void> {
  const sourceDir = path.join(repoPath, 'deliverables');
  const destDir = path.join(generateAuditPath(sessionMetadata), 'deliverables');

  let entries: string[];
  try {
    entries = await fs.readdir(sourceDir);
  } catch {
    // Source directory doesn't exist yet — nothing to copy
    return;
  }

  await ensureDirectory(destDir);

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry);
    const destPath = path.join(destDir, entry);

    // Only copy files, skip subdirectories
    const stat = await fs.stat(sourcePath);
    if (stat.isFile()) {
      await fs.copyFile(sourcePath, destPath);
    }
  }
}
