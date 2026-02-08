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

import { writeFileSync, mkdirSync } from 'fs';
import { join, resolve, basename } from 'path';

/**
 * Save deliverable file to deliverables/ directory
 *
 * @param targetDir - Target directory for deliverables (passed explicitly to avoid race conditions)
 * @param filename - Name of the deliverable file
 * @param content - File content to save
 */
export function saveDeliverableFile(targetDir: string, filename: string, content: string): string {
  // Path traversal protection: reject filenames with path separators or traversal sequences
  if (filename !== basename(filename)) {
    throw new Error(`Invalid filename: must not contain path separators`);
  }
  if (filename.includes('..') || filename.includes('\0')) {
    throw new Error(`Invalid filename: contains forbidden characters`);
  }

  const deliverablesDir = resolve(targetDir, 'deliverables');
  const filepath = resolve(deliverablesDir, filename);

  // Verify resolved path stays within the intended deliverables directory
  if (!filepath.startsWith(deliverablesDir + '/') && filepath !== deliverablesDir) {
    throw new Error(`Path traversal detected: resolved path escapes deliverables directory`);
  }

  // Ensure deliverables directory exists
  try {
    mkdirSync(deliverablesDir, { recursive: true });
  } catch {
    // Directory might already exist, ignore
  }

  // Write file (atomic write - single operation)
  writeFileSync(filepath, content, 'utf8');

  return filepath;
}
