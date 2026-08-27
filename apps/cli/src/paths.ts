/**
 * Path resolution for --repo and --config arguments.
 *
 * Both --repo and --config are filesystem paths, absolute or relative to CWD.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fail } from './errors.js';

/**
 * Expand a leading `~` or `~/` to the home directory. The shell skips this in the
 * `--flag=~/x` form (the tilde is not at the word start), so it must be done here.
 */
export function expandHome(inputPath: string): string {
  if (inputPath === '~') {
    return os.homedir();
  }
  if (inputPath.startsWith('~/')) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

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
 * Filename of the human-facing PDF report surfaced at the run directory root.
 * Must match FINAL_REPORT_PDF_FILENAME in the worker package.
 */
export const FINAL_REPORT_PDF_FILENAME = 'Security-Assessment-Report.pdf';

/**
 * Customer-facing Markdown report name at the run root.
 * Must match FINAL_REPORT_MD_FILENAME in the worker package.
 */
export const FINAL_REPORT_MD_FILENAME = 'Security-Assessment-Report.md';

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
 * Resolve --repo to an absolute path and container mount. The argument is a
 * filesystem path, absolute or relative to CWD.
 */
export function resolveRepo(repoArg: string): MountPair {
  const hostPath = path.resolve(expandHome(repoArg));

  if (!fs.existsSync(hostPath)) {
    fail(`Repository not found: ${hostPath}`);
  }

  if (!fs.statSync(hostPath).isDirectory()) {
    fail(`Not a directory: ${hostPath}`);
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
  const hostPath = path.resolve(expandHome(configArg));

  if (!fs.existsSync(hostPath)) {
    fail(`Config file not found: ${hostPath}`);
  }

  if (!fs.statSync(hostPath).isFile()) {
    fail(`Not a file: ${hostPath}`);
  }

  const basename = path.basename(hostPath);
  return {
    hostPath,
    containerPath: `/app/configs/${basename}`,
  };
}
