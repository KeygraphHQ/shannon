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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get Shannon repository root
export const SHANNON_ROOT = path.resolve(__dirname, '..', '..');
export const AUDIT_LOGS_DIR = path.join(SHANNON_ROOT, 'audit-logs');

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
 * Ensure directory exists (idempotent, race-safe)
 */
export async function ensureDirectory(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore EEXIST errors (race condition safe)
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Atomic write using temp file + rename pattern
 * Guarantees no partial writes or corruption on crash
 */
export async function atomicWrite(filePath: string, data: object | string): Promise<void> {
  const tempPath = `${filePath}.tmp`;
  const content = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  try {
    // Write to temp file
    await fs.writeFile(tempPath, content, 'utf8');

    // Atomic rename (POSIX guarantee: atomic on same filesystem)
    await fs.rename(tempPath, filePath);
  } catch (error) {
    // Clean up temp file on failure
    try {
      await fs.unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Format timestamp to ISO 8601 string
 */
export function formatTimestamp(timestamp: number = Date.now()): string {
  return new Date(timestamp).toISOString();
}

/**
 * Calculate percentage
 */
export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Read and parse JSON file
 */
export async function readJson<T = unknown>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize audit directory structure for a session
 * Creates: audit-logs/{sessionId}/, agents/, prompts/
 */
export async function initializeAuditStructure(sessionMetadata: SessionMetadata): Promise<void> {
  const auditPath = generateAuditPath(sessionMetadata);
  const agentsPath = path.join(auditPath, 'agents');
  const promptsPath = path.join(auditPath, 'prompts');

  await ensureDirectory(auditPath);
  await ensureDirectory(agentsPath);
  await ensureDirectory(promptsPath);
}
