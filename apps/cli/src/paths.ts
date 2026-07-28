/**
 * Path resolution for --repo and --config arguments.
 *
 * Local mode supports bare repo names (e.g. "my-repo" → ./repos/my-repo).
 * Both modes resolve relative paths against CWD.
 *
 * SECURITY: Resolved paths are validated against a blocklist of system
 * directories to prevent accidental exposure of sensitive host files
 * to the worker container via Docker volume mounts.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
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

/** System directories that should not be mounted into the container. */
const BLOCKED_MOUNT_PATHS = [
  '/etc',
  '/sys',
  '/proc',
  '/dev',
  '/boot',
  '/lost+found',
  '/media',
  '/mnt',
  '/run',
  '/srv',
  '/var/lib/docker',
  '/var/run/docker.sock',
  '/root',
  '/snap',
];

/** Sensitive home subdirectories that should not be mounted. */
const BLOCKED_HOME_SUBDIRS = [
  '.ssh',
  '.aws',
  '.gcloud',
  '.config',
  '.docker',
  '.gnupg',
  '.kube',
  'snap',
];

/** Normalize a path for comparison — resolve symlinks and trailing slashes. */
function normalizePath(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    return path.resolve(p);
  }
}

/** Check if a resolved host path is a blocked system directory. */
function getBlockedMountPath(hostPath: string): string | null {
  const normalized = normalizePath(hostPath);

  for (const blocked of BLOCKED_MOUNT_PATHS) {
    const nb = normalizePath(blocked);
    if (normalized === nb || normalized.startsWith(nb + path.sep)) {
      return blocked;
    }
  }

  const homeDir = normalizePath(os.homedir());
  for (const subdir of BLOCKED_HOME_SUBDIRS) {
    const bp = path.join(homeDir, subdir);
    const nb = normalizePath(bp);
    if (normalized === nb || normalized.startsWith(nb + path.sep)) {
      return bp;
    }
  }

  return null;
}

/** Allowed base directories for mounts. */
function getAllowedMountPrefixes(): string[] {
  const prefixes: string[] = [normalizePath('.')];
  if (isLocal()) {
    const reposDir = path.resolve('repos');
    try {
      if (fs.statSync(reposDir).isDirectory()) {
        prefixes.push(normalizePath(reposDir));
      }
    } catch {
      // repos/ dir may not exist yet
    }
  }
  try {
    prefixes.push(normalizePath('/tmp'));
  } catch {
    // /tmp should always exist
  }
  return prefixes;
}

/** Validate that a resolved host path is safe to mount. */
function validateMountPath(hostPath: string, argName: string): void {
  const normalized = normalizePath(hostPath);

  const blocked = getBlockedMountPath(hostPath);
  if (blocked) {
    console.error(`ERROR: ${argName} path resolves to a system directory: ${normalized}`);
    console.error(`  Mounting ${blocked} into the container is not allowed for security reasons.`);
    console.error(`  Place your target repository under an allowed directory.`);
    process.exit(1);
  }

  const allowed = getAllowedMountPrefixes();
  const isAllowed = allowed.some((prefix) => normalized === prefix || normalized.startsWith(prefix + path.sep));
  if (!isAllowed) {
    console.warn(`WARNING: ${argName} path is outside the expected directory: ${normalized}`);
    console.warn(`  This path will be mounted into the worker container.`);
    console.warn(`  Only mount directories you trust, as the AI agent will have read access to all files.`);
  }
}

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

  // Security validation
  validateMountPath(hostPath, '--repo');

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

  // Security validation
  validateMountPath(hostPath, '--config');

  const basename = path.basename(hostPath);
  return {
    hostPath,
    containerPath: `/app/configs/${basename}`,
  };
}
