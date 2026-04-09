/** Centralized path constants for the worker package */

import fs from 'node:fs';
import path from 'node:path';

/** Worker package root (apps/worker/) resolved from compiled dist/ files */
const WORKER_ROOT = path.resolve(import.meta.dirname, '..');

export const PROMPTS_DIR = path.join(WORKER_ROOT, 'prompts');
export const CONFIGS_DIR = path.join(WORKER_ROOT, 'configs');

/** Default deliverables subdirectory relative to repoPath */
export const DEFAULT_DELIVERABLES_SUBDIR = '.shannon/deliverables';

/** Default audit log directory */
export const DEFAULT_AUDIT_DIR = './workspaces';

/**
 * Resolve the deliverables directory for a given repoPath and optional subdir override.
 * @param repoPath - Absolute path to the target repository
 * @param subdir - Subdirectory relative to repoPath (default: '.shannon/deliverables')
 */
export function deliverablesDir(repoPath: string, subdir: string = DEFAULT_DELIVERABLES_SUBDIR): string {
  return path.join(repoPath, ...subdir.split('/'));
}

/**
 * Repository root — walk up from WORKER_ROOT looking for pnpm-workspace.yaml.
 * Falls back to two levels up (apps/worker/ → repo root) if not found.
 */
function findRepoRoot(): string {
  let dir = WORKER_ROOT;
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(WORKER_ROOT, '..', '..');
}

const REPO_ROOT = findRepoRoot();
export const WORKSPACES_DIR = path.join(REPO_ROOT, 'workspaces');
