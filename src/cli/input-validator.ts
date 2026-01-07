// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { fs, path } from 'zx';

interface ValidationResult {
  valid: boolean;
  error?: string;
  path?: string;
}

// Helper function: Validate web URL
export function validateWebUrl(url: string): ValidationResult {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Web URL must use HTTP or HTTPS protocol' };
    }
    if (!parsed.hostname) {
      return { valid: false, error: 'Web URL must have a valid hostname' };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid web URL format' };
  }
}

// Helper function: Validate local repository path
export async function validateRepoPath(repoPath: string): Promise<ValidationResult> {
  try {
    // Check if path exists
    if (!(await fs.pathExists(repoPath))) {
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
    } catch {
      return { valid: false, error: 'Repository path is not readable' };
    }

    // Convert to absolute path
    const absolutePath = path.resolve(repoPath);
    return { valid: true, path: absolutePath };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return { valid: false, error: `Invalid repository path: ${errMsg}` };
  }
}
