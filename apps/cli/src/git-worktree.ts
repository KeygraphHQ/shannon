/** Git worktree support for the --repo mount. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MountPair } from './paths.js';

const CONTAINER_GIT_ROOT = '/git';
const POINTER_FILENAME = 'worktree-git-pointer';

interface GitLocations {
  topLevel: string;
  gitDir: string;
  commonDir: string;
}

export interface WorktreeGitMounts {
  commonDir: MountPair;
  /** Generated `.git` file mounted over the worktree's own, pointing into `/git/<repo name>`. */
  pointer: MountPair;
}

function readGitLocations(repoHostPath: string): GitLocations | undefined {
  let output: string;
  try {
    output = execFileSync(
      'git',
      ['-C', repoHostPath, 'rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'],
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 10_000 },
    );
  } catch {
    return undefined;
  }

  const [topLevel, gitDir, commonDir] = output.trim().split('\n');
  if (topLevel === undefined || gitDir === undefined || commonDir === undefined) {
    return undefined;
  }
  return { topLevel, gitDir, commonDir };
}

/** Mounts that let git in the container read a worktree passed as --repo. */
export function prepareWorktreeGitMounts(repo: MountPair, pointerDir: string): WorktreeGitMounts | undefined {
  const locations = readGitLocations(repo.hostPath);
  if (locations === undefined) {
    return undefined;
  }

  // A subfolder is mounted without its ancestors, so git in the container cannot find its repo.
  const isRepoRoot = locations.topLevel === fs.realpathSync.native(repo.hostPath);
  if (!isRepoRoot) {
    return undefined;
  }

  // In a regular clone the git dir is the common dir, already inside the mounted folder.
  const isLinkedWorktree = locations.gitDir !== locations.commonDir;
  if (!isLinkedWorktree) {
    return undefined;
  }

  const gitDirInCommonDir = path.relative(locations.commonDir, locations.gitDir);

  const containerCommonDir = path.posix.join(CONTAINER_GIT_ROOT, path.posix.basename(repo.containerPath));
  const pointerPath = path.join(pointerDir, POINTER_FILENAME);
  fs.writeFileSync(pointerPath, `gitdir: ${path.posix.join(containerCommonDir, gitDirInCommonDir)}\n`);

  return {
    commonDir: { hostPath: locations.commonDir, containerPath: containerCommonDir },
    pointer: { hostPath: pointerPath, containerPath: path.posix.join(repo.containerPath, '.git') },
  };
}
