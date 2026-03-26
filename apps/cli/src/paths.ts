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

/**
 * Ensure the deliverables directory exists and is writable by the container user.
 */
export function ensureDeliverables(repoHostPath: string): void {
  const deliverables = path.join(repoHostPath, 'deliverables');
  fs.mkdirSync(deliverables, { recursive: true });
  fs.chmodSync(deliverables, 0o777);
}
