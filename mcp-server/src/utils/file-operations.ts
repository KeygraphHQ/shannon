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
import { join } from 'path';

declare global {
  var __SHANNON_TARGET_DIR: string | undefined;
}

/**
 * Save deliverable file to deliverables/ directory
 */
export function saveDeliverableFile(filename: string, content: string): string {
  // Use target directory from global context (set by createShannonHelperServer)
  const targetDir = global.__SHANNON_TARGET_DIR || process.cwd();
  const deliverablesDir = join(targetDir, 'deliverables');
  const filepath = join(deliverablesDir, filename);

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
