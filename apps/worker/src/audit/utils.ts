// Copyright (C) 2026 Keygraph, Inc.
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
import { INTERNAL_DIR, WORKSPACES_DIR } from '../paths.js';
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
 * Generate path to a run directory for a session (its top level).
 * Uses custom outputPath if provided, otherwise defaults to WORKSPACES_DIR.
 * Only the final report lives here; all internals live under INTERNAL_DIR.
 */
export function generateAuditPath(sessionMetadata: SessionMetadata): string {
  const sessionIdentifier = generateSessionIdentifier(sessionMetadata);
  const baseDir = sessionMetadata.outputPath || WORKSPACES_DIR;
  return path.join(baseDir, sessionIdentifier);
}

/**
 * Generate path to the hidden internals directory inside a run directory.
 * Holds logs, prompts, session state, deliverables, and browser artifacts.
 */
export function generateInternalPath(sessionMetadata: SessionMetadata): string {
  return path.join(generateAuditPath(sessionMetadata), INTERNAL_DIR);
}

/**
 * Generate path to session.json file
 */
export function generateSessionJsonPath(sessionMetadata: SessionMetadata): string {
  const internalPath = generateInternalPath(sessionMetadata);
  return path.join(internalPath, 'session.json');
}

/**
 * Path to the shared authenticated browser session saved by the preflight
 * validator and consumed by downstream agents via `_shared-session.txt`.
 * Deleted at workflow end, so an authenticated session never outlives the scan it was created for.
 */
export function authStateFile(sessionMetadata: SessionMetadata): string {
  return path.join(generateInternalPath(sessionMetadata), 'auth-state.json');
}

/**
 * Generate path to workflow.log file
 */
export function generateWorkflowLogPath(sessionMetadata: SessionMetadata): string {
  const internalPath = generateInternalPath(sessionMetadata);
  return path.join(internalPath, 'workflow.log');
}

/**
 * Initialize audit directory structure for a session.
 * Creates the hidden internals directory. The deliverables, scratchpad, and
 * browser directories are created host-side and bind-mounted in.
 */
export async function initializeAuditStructure(sessionMetadata: SessionMetadata): Promise<void> {
  const internalPath = generateInternalPath(sessionMetadata);
  await ensureDirectory(internalPath);
}
