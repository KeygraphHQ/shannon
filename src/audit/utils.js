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
 * Extract application name from config file or URL
 * @param {string} configFile - Config filename (e.g., "app-config.yaml")
 * @param {string} webUrl - Target web URL
 * @returns {string} App name (e.g., "app", "8080", "noconfig")
 */
function extractAppName(configFile, webUrl) {
  // If config file provided, extract app name from it
  if (configFile) {
    // Remove .yaml/.yml extension
    let baseName = configFile.replace(/\.(yaml|yml)$/i, '');

    // Remove path if present (e.g., "configs/app-config.yaml")
    baseName = baseName.split('/').pop();

    // Extract parts before "config"
    // app-config → app
    // my-app-config → myapp
    const parts = baseName.split('-');
    const configIndex = parts.indexOf('config');

    if (configIndex > 0) {
      // Take everything before "config" and join without hyphens
      return parts.slice(0, configIndex).join('').toLowerCase();
    }

    // Fallback: just use the whole thing without hyphens
    return baseName.replace(/-/g, '').toLowerCase();
  }

  // No config file - use port number for localhost, "noconfig" for remote
  const url = new URL(webUrl);
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    // Use port number (default to 80 for http, 443 for https)
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return port;
  }

  // Remote URL without config
  return 'noconfig';
}

/**
 * Generate standardized session identifier with timestamp and app context
 * Format: {timestamp}_{appName}_{hostname}_{sessionIdShort}
 * Example: 20251025T193847Z_myapp_localhost_efc60ee0
 *
 * @param {Object} sessionMetadata - Session metadata from Shannon store
 * @param {string} sessionMetadata.id - UUID session ID
 * @param {string} sessionMetadata.webUrl - Target web URL
 * @param {string} [sessionMetadata.configFile] - Config filename (optional)
 * @param {string} [sessionMetadata.createdAt] - ISO 8601 timestamp (optional, defaults to now)
 * @returns {string} Formatted session identifier
 */
export function generateSessionIdentifier(sessionMetadata) {
  const { id, webUrl, configFile, createdAt } = sessionMetadata;

  // Extract hostname
  const hostname = new URL(webUrl).hostname.replace(/[^a-zA-Z0-9-]/g, '-');

  // Extract app name from config file or URL
  const appName = extractAppName(configFile, webUrl);

  // Format timestamp (use createdAt if available, otherwise use current time)
  let timestamp = createdAt || new Date().toISOString();
  // Convert to compact ISO 8601: 2025-10-25T01:37:36.174Z → 20251025T013736Z
  timestamp = timestamp.replace(/[-:]/g, '').replace(/\.\d{3}Z/, 'Z');

  // Use first 8 characters of session ID for uniqueness
  const sessionIdShort = id.substring(0, 8);

  // Combine: timestamp_appName_hostname_sessionIdShort
  return `${timestamp}_${appName}_${hostname}_${sessionIdShort}`;
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
