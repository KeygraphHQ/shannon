/**
 * Version reporting — mode-aware.
 *
 * NPX mode:   the published package.json version (stamped by CI at release).
 * Local mode: the git commit SHA of the checked-out clone (`git-<full-sha>`).
 *             A clone has no meaningful semver, so the commit is the honest identifier.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMode } from './mode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

/** Run a git command in the CLI's own repo; returns trimmed stdout or null on any failure. */
function git(...args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd: __dirname, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function readGitSha(): string | null {
  return git('rev-parse', 'HEAD');
}

/**
 * Version identifier. NPX: package.json version. Local: `git-<full-sha>`,
 * falling back to the package version if git is unavailable.
 */
export function getVersion(): string {
  if (getMode() !== 'local') return readPackageVersion();

  const sha = readGitSha();
  if (!sha) return readPackageVersion();

  return `git-${sha}`;
}

/**
 * Human-facing version line printed by `--version`.
 * NPX: `shannon <version>`. Local: `shannon git-<full-sha>`.
 */
export function getVersionLine(): string {
  return `shannon ${getVersion()}`;
}
