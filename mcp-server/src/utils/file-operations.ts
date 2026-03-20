// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * File Operations Utilities
 *
 * Handles file system operations for deliverable saving.
 * Ported from tools/save_deliverable.js (lines 117-130).
 */

import { writeFileSync, mkdirSync, renameSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';

/**
 * Save deliverable file to deliverables/ directory
 *
 * @param targetDir - Target directory for deliverables (passed explicitly to avoid race conditions)
 * @param filename - Name of the deliverable file
 * @param content - File content to save
 */
export function saveDeliverableFile(targetDir: string, filename: string, content: string): string {
  const deliverablesDir = join(targetDir, 'deliverables');
  const filepath = join(deliverablesDir, filename);

  // Ensure deliverables directory exists
  try {
    mkdirSync(deliverablesDir, { recursive: true });
  } catch {
    throw new Error(`Cannot create deliverables directory at ${deliverablesDir}`);
  }

  // Atomic write: write to temp file then rename
  const tempPath = join(deliverablesDir, `.tmp-${randomBytes(8).toString('hex')}`);
  try {
    writeFileSync(tempPath, content, { encoding: 'utf8', mode: 0o644 });
    renameSync(tempPath, filepath);
  } catch (err) {
    // Clean up temp file on failure
    try { unlinkSync(tempPath); } catch { /* ignore */ }
    throw err;
  }

  return filepath;
}
