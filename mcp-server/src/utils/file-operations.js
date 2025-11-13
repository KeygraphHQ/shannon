// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

/**
 * File Operations Utilities
 *
 * Handles file system operations for deliverable saving.
 * Ported from tools/save_deliverable.js (lines 117-130).
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

/**
 * Save deliverable file to deliverables/ directory
 *
 * @param {string} filename - Name of the file to save
 * @param {string} content - Content to write to the file
 * @returns {string} Full path to the saved file
 */
export function saveDeliverableFile(filename, content) {
  // Use target directory from global context (set by createShannonHelperServer)
  const targetDir = global.__SHANNON_TARGET_DIR || process.cwd();
  const deliverablesDir = join(targetDir, 'deliverables');
  const filepath = join(deliverablesDir, filename);

  // Ensure deliverables directory exists
  try {
    mkdirSync(deliverablesDir, { recursive: true });
  } catch (error) {
    // Directory might already exist, ignore
  }

  // Write file (atomic write - single operation)
  writeFileSync(filepath, content, 'utf8');

  return filepath;
}
