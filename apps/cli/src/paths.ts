/**
 * Path resolution for --repo and --config arguments.
 *
 * Local mode supports bare repo names (e.g. "my-repo" → ./repos/my-repo).
 * Both modes resolve relative paths against CWD.
 */

import fs from 'node:fs';
import path from 'node:path';
import { isLocal } from './mode.js';

export interface MountPair {
  hostPath: string;
  containerPath: string;
}

/**
 * Hidden subdirectory inside each run directory that holds all internals
 * (deliverables, logs, prompts, session state, browser artifacts). Keeps the
 * run folder's top level clean so only the final report is visible. Must match
 * INTERNAL_DIR in the worker package.
 */
export const INTERNAL_DIR = '.shannon';

/**
 * Filename of the human-facing final report surfaced at the run directory root.
 * Must match FINAL_REPORT_FILENAME in the worker package.
 */
export const FINAL_REPORT_FILENAME = 'Security-Assessment-Report.md';

/**
 * Resolve a run-directory file (e.g. session.json, workflow.log), preferring the
 * current INTERNAL_DIR location and falling back to the legacy run-root location
 * so pre-restructure workspaces keep working. Returns the INTERNAL_DIR path when
 * neither exists — the right default for new runs and error messages.
 */
export function resolveRunFile(runDir: string, filename: string): string {
  const current = path.join(runDir, INTERNAL_DIR, filename);
  if (fs.existsSync(current)) {
    return current;
  }
  const legacy = path.join(runDir, filename);
  if (fs.existsSync(legacy)) {
    return legacy;
  }
  return current;
}

/**
 * Resolve --repo to absolute path and container mount.
 * Dev mode: bare names (no / or . prefix) check ./repos/<name> first.
 */
export function resolveRepo(repoArg: string): MountPair {
  let hostPath: string;

  if (isLocal() && !repoArg.startsWith('/') && !repoArg.startsWith('.')) {
    // Bare name — check ./repos/<name> for backward compatibility
    const barePath = path.resolve('repos', repoArg);
    if (fs.existsSync(barePath)) {
      hostPath = barePath;
    } else {
      console.error(`ERROR: Repository not found at ./repos/${repoArg}`);
      console.error('');
      console.error('Place your target repository under the ./repos/ directory,');
      console.error('or pass an absolute/relative path: -r /path/to/repo');
      process.exit(1);
    }
  } else {
    hostPath = path.resolve(repoArg);
  }

  if (!fs.existsSync(hostPath)) {
    console.error(`ERROR: Repository not found: ${hostPath}`);
    process.exit(1);
  }

  if (!fs.statSync(hostPath).isDirectory()) {
    console.error(`ERROR: Not a directory: ${hostPath}`);
    process.exit(1);
  }

  const basename = path.basename(hostPath);
  return {
    hostPath,
    containerPath: `/repos/${basename}`,
  };
}

/**
 * Resolve --config to absolute path and container mount.
 */
export function resolveConfig(configArg: string): MountPair {
  const hostPath = path.resolve(configArg);

  if (!fs.existsSync(hostPath)) {
    console.error(`ERROR: Config file not found: ${hostPath}`);
    process.exit(1);
  }

  if (!fs.statSync(hostPath).isFile()) {
    console.error(`ERROR: Not a file: ${hostPath}`);
    process.exit(1);
  }

  const basename = path.basename(hostPath);
  return {
    hostPath,
    containerPath: `/app/configs/${basename}`,
  };
}
