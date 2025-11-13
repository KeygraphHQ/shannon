// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.

import { fs, path } from 'zx';

// Helper function: Validate web URL
export function validateWebUrl(url) {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Web URL must use HTTP or HTTPS protocol' };
    }
    if (!parsed.hostname) {
      return { valid: false, error: 'Web URL must have a valid hostname' };
    }
    return { valid: true };
  } catch (error) {
    return { valid: false, error: 'Invalid web URL format' };
  }
}

// Helper function: Validate local repository path
export async function validateRepoPath(repoPath) {
  try {
    // Check if path exists
    if (!await fs.pathExists(repoPath)) {
      return { valid: false, error: 'Repository path does not exist' };
    }

    // Check if it's a directory
    const stats = await fs.stat(repoPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'Repository path must be a directory' };
    }

    // Check if it's readable
    try {
      await fs.access(repoPath, fs.constants.R_OK);
    } catch (error) {
      return { valid: false, error: 'Repository path is not readable' };
    }

    // Convert to absolute path
    const absolutePath = path.resolve(repoPath);
    return { valid: true, path: absolutePath };
  } catch (error) {
    return { valid: false, error: `Invalid repository path: ${error.message}` };
  }
}