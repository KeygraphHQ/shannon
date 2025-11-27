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

/**
 * Generate standardized session identifier: {hostname}_{sessionId}
 * @param {Object} sessionMetadata - Session metadata from Shannon store
 * @param {string} sessionMetadata.id - UUID session ID
 * @param {string} sessionMetadata.webUrl - Target web URL
 * @returns {string} Formatted session identifier
 */
export function generateSessionIdentifier(sessionMetadata) {
  const { id, webUrl } = sessionMetadata;
  const hostname = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');
  return `${hostname}_${id}`;
}

/**
 * Generate path to audit log directory for a session
 * @param {Object} sessionMetadata - Session metadata
 * @returns {string} Absolute path to session audit directory
 */
export function generateAuditPath(sessionMetadata) {
  const sessionIdentifier = generateSessionIdentifier(sessionMetadata);
  return path.join(AUDIT_LOGS_DIR, sessionIdentifier);
}

/**
 * Generate path to agent log file
 * @param {Object} sessionMetadata - Session metadata
 * @param {string} agentName - Name of the agent
 * @param {number} timestamp - Timestamp (ms since epoch)
 * @param {number} attemptNumber - Attempt number (1, 2, 3, ...)
 * @returns {string} Absolute path to agent log file
 */
export function generateLogPath(sessionMetadata, agentName, timestamp, attemptNumber) {
  const auditPath = generateAuditPath(sessionMetadata);
  const filename = `${timestamp}_${agentName}_attempt-${attemptNumber}.log`;
  return path.join(auditPath, 'agents', filename);
}

/**
 * Generate path to prompt snapshot file
 * @param {Object} sessionMetadata - Session metadata
 * @param {string} agentName - Name of the agent
 * @returns {string} Absolute path to prompt file
 */
export function generatePromptPath(sessionMetadata, agentName) {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'prompts', `${agentName}.md`);
}

/**
 * Generate path to session.json file
 * @param {Object} sessionMetadata - Session metadata
 * @returns {string} Absolute path to session.json
 */
export function generateSessionJsonPath(sessionMetadata) {
  const auditPath = generateAuditPath(sessionMetadata);
  return path.join(auditPath, 'session.json');
}

/**
 * Ensure directory exists (idempotent, race-safe)
 * @param {string} dirPath - Directory path to create
 * @returns {Promise<void>}
 */
export async function ensureDirectory(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    // Ignore EEXIST errors (race condition safe)
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Atomic write using temp file + rename pattern
 * Guarantees no partial writes or corruption on crash
 * @param {string} filePath - Target file path
 * @param {Object|string} data - Data to write (will be JSON.stringified if object)
 * @returns {Promise<void>}
 */
export async function atomicWrite(filePath, data) {
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
    } catch (cleanupError) {
      // Ignore cleanup errors
    }
    throw error;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 * @param {number} ms - Duration in milliseconds
 * @returns {string} Formatted duration (e.g., "2m 34s", "45s", "1.2s")
 */
export function formatDuration(ms) {
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
 * @param {number} [timestamp] - Unix timestamp in ms (defaults to now)
 * @returns {string} ISO 8601 formatted string
 */
export function formatTimestamp(timestamp = Date.now()) {
  return new Date(timestamp).toISOString();
}

/**
 * Calculate percentage
 * @param {number} part - Part value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function calculatePercentage(part, total) {
  if (total === 0) return 0;
  return (part / total) * 100;
}

/**
 * Read and parse JSON file
 * @param {string} filePath - Path to JSON file
 * @returns {Promise<Object>} Parsed JSON data
 */
export async function readJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

/**
 * Check if file exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>} True if file exists
 */
export async function fileExists(filePath) {
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
 * @param {Object} sessionMetadata - Session metadata
 * @returns {Promise<void>}
 */
export async function initializeAuditStructure(sessionMetadata) {
  const auditPath = generateAuditPath(sessionMetadata);
  const agentsPath = path.join(auditPath, 'agents');
  const promptsPath = path.join(auditPath, 'prompts');

  await ensureDirectory(auditPath);
  await ensureDirectory(agentsPath);
  await ensureDirectory(promptsPath);
}
