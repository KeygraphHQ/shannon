// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { $ } from 'zx';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import { PentestError } from './error-handling.js';

/**
 * Check if a directory is a git repository.
 * Returns true if the directory contains a .git folder or is inside a git repo.
 */
export async function isGitRepository(dir: string): Promise<boolean> {
  try {
    await $`cd ${dir} && git rev-parse --git-dir`.quiet();
    return true;
  } catch {
    return false;
  }
}

interface GitOperationResult {
  success: boolean;
  hadChanges?: boolean;
  changes?: string[];
  commitHash?: string;
  error?: Error;
}

/**
 * Get list of changed files from git status --porcelain -z output.
 * When paths is provided, the status query is scoped to those paths.
 */
async function getChangedFiles(
  sourceDir: string,
  operationDescription: string,
  paths?: readonly string[],
): Promise<string[]> {
  const args = ['git', 'status', '--porcelain', '-z'];
  if (paths && paths.length > 0) {
    args.push('--', ...paths);
  }
  const status = await executeGitCommandWithRetry(args, sourceDir, operationDescription);
  return parsePorcelainZ(status.stdout);
}

/**
 * Parse `git status --porcelain -z` output.
 *
 * -z uses NUL separators and raw (unquoted) byte paths, sidestepping the
 * fragile whitespace/quote handling of the default porcelain v1 format.
 * Each entry is `XY<space>PATH\0`; renames/copies (X = 'R' or 'C') emit an
 * additional `ORIG\0` token immediately after the entry, which we skip.
 */
export function parsePorcelainZ(raw: string): string[] {
  if (raw.length === 0) {
    return [];
  }
  const tokens = raw.split('\0');
  const entries: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.length < 4) {
      continue;
    }
    entries.push(tok);
    const x = tok[0];
    if (x === 'R' || x === 'C') {
      i++;
    }
  }
  return entries;
}

function changedPathFromStatus(entry: string): string {
  return entry.slice(3);
}

async function stageChanges(sourceDir: string, description: string, paths?: readonly string[]): Promise<string[]> {
  const changes = await getChangedFiles(sourceDir, description, paths);
  if (paths && paths.length > 0) {
    const changedPaths = [...new Set(changes.map(changedPathFromStatus).filter((p) => p.length > 0))];
    if (changedPaths.length > 0) {
      await executeGitCommandWithRetry(['git', 'add', '-A', '--', ...changedPaths], sourceDir, description);
    }
    return changes;
  }

  await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, description);
  return changes;
}

/**
 * Log a summary of changed files with truncation for long lists
 */
function logChangeSummary(
  changes: string[],
  messageWithChanges: string,
  messageWithoutChanges: string,
  logger: ActivityLogger,
  level: 'info' | 'warn' = 'info',
  maxToShow: number = 5,
): void {
  if (changes.length > 0) {
    const msg = messageWithChanges.replace('{count}', String(changes.length));
    const fileList = changes
      .slice(0, maxToShow)
      .map((c) => `  ${c}`)
      .join(', ');
    const suffix = changes.length > maxToShow ? ` ... and ${changes.length - maxToShow} more files` : '';
    logger[level](`${msg} ${fileList}${suffix}`);
  } else {
    logger[level](messageWithoutChanges);
  }
}

/**
 * Convert unknown error to GitOperationResult
 */
function toErrorResult(error: unknown): GitOperationResult {
  const errMsg = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: error instanceof Error ? error : new Error(errMsg),
  };
}

// Serializes git operations to prevent index.lock conflicts during parallel agent execution
class GitSemaphore {
  private queue: Array<() => void> = [];
  private running: boolean = false;

  async acquire(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  release(): void {
    this.running = false;
    this.process();
  }

  private process(): void {
    if (!this.running && this.queue.length > 0) {
      this.running = true;
      const resolve = this.queue.shift();
      resolve?.();
    }
  }
}

const gitSemaphore = new GitSemaphore();

// Tracks whether the current async context already holds the repo lock, so a
// composite operation (e.g. status → add → commit) can call nested git helpers
// without re-acquiring the semaphore and deadlocking on itself.
const gitLockContext = new AsyncLocalStorage<boolean>();

/**
 * Run an operation while holding the repo-wide git lock. Reentrant: a nested
 * call inside an already-locked context runs immediately instead of blocking.
 */
export async function withGitRepoLock<T>(operation: () => Promise<T>): Promise<T> {
  if (gitLockContext.getStore()) {
    return operation();
  }

  await gitSemaphore.acquire();
  try {
    return await gitLockContext.run(true, operation);
  } finally {
    gitSemaphore.release();
  }
}

const GIT_LOCK_ERROR_PATTERNS = [
  'index.lock',
  'unable to lock',
  'Another git process',
  'fatal: Unable to create',
  'fatal: index file',
];

function isGitLockError(errorMessage: string): boolean {
  return GIT_LOCK_ERROR_PATTERNS.some((pattern) => errorMessage.includes(pattern));
}

// Retries git commands on lock conflicts with exponential backoff
export async function executeGitCommandWithRetry(
  commandArgs: string[],
  sourceDir: string,
  description: string,
  maxRetries: number = 5,
): Promise<{ stdout: string; stderr: string }> {
  if (!gitLockContext.getStore()) {
    return withGitRepoLock(() => executeGitCommandWithRetry(commandArgs, sourceDir, description, maxRetries));
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const [cmd, ...args] = commandArgs;
      const result = await $`cd ${sourceDir} && ${cmd} ${args}`;
      return result;
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);

      if (isGitLockError(errMsg) && attempt < maxRetries) {
        const delay = 2 ** (attempt - 1) * 1000;
        // executeGitCommandWithRetry is also called outside activity context
        // (e.g., from resume logic), so we use console.warn as a fallback here
        console.warn(
          `Git lock conflict during ${description} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }
  throw new PentestError(
    `Git command failed after ${maxRetries} retries`,
    'filesystem',
    true, // Retryable - transient git lock issues
    { maxRetries, description },
    ErrorCode.GIT_CHECKPOINT_FAILED,
  );
}

// Filter paths to those present in the HEAD tree, so a subsequent
// `git restore --source=HEAD` won't abort on a pathspec the commit doesn't
// contain. Sourced from HEAD (not the index) to match what restore reads.
async function listPathsInHead(sourceDir: string, paths: readonly string[]): Promise<string[]> {
  const result = await executeGitCommandWithRetry(
    ['git', 'ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', ...paths],
    sourceDir,
    'list HEAD-tracked rollback paths',
  );
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

async function restoreScopedPathsFromHead(
  sourceDir: string,
  paths: readonly string[],
  description: string,
): Promise<void> {
  const pathsInHead = await listPathsInHead(sourceDir, paths);

  // Resetting the scoped index first also makes a newly staged path untracked,
  // allowing the clean step to remove it when the path is absent from HEAD.
  await executeGitCommandWithRetry(
    ['git', 'reset', 'HEAD', '--', ...paths],
    sourceDir,
    `resetting owned index paths for ${description}`,
  );
  if (pathsInHead.length > 0) {
    await executeGitCommandWithRetry(
      ['git', 'restore', '--source=HEAD', '--worktree', '--', ...pathsInHead],
      sourceDir,
      `restoring owned worktree paths for ${description}`,
    );
  }
  await executeGitCommandWithRetry(
    ['git', 'clean', '-fd', '--', ...paths],
    sourceDir,
    `cleaning untracked owned paths for ${description}`,
  );
}

// Two-phase rollback to the last checkpoint: restore tracked files, then clean
// untracked files. When paths is provided, both phases are scoped to those
// paths so one agent's rollback cannot discard a concurrent sibling's work.
// Without paths, the existing whole-workspace reset remains available.
export async function rollbackGitWorkspace(
  sourceDir: string,
  reason: string = 'retry preparation',
  logger: ActivityLogger,
  paths?: readonly string[],
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    logger.info('Skipping git rollback (not a git repository)');
    return { success: true };
  }

  logger.info(`Rolling back workspace for ${reason}`);
  try {
    const scoped = paths !== undefined && paths.length > 0;
    const changes = await withGitRepoLock(async () => {
      const pendingChanges = await getChangedFiles(sourceDir, 'status check for rollback', paths);
      if (scoped) {
        await restoreScopedPathsFromHead(sourceDir, paths, 'rollback');
      } else {
        await executeGitCommandWithRetry(['git', 'reset', '--hard', 'HEAD'], sourceDir, 'hard reset for rollback');
        await executeGitCommandWithRetry(['git', 'clean', '-fd'], sourceDir, 'cleaning untracked files for rollback');
      }
      return pendingChanges;
    });

    logChangeSummary(
      changes,
      'Rollback completed - removed {count} contaminated changes:',
      'Rollback completed - no changes to remove',
      logger,
      'info',
      3,
    );
    return { success: true };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Rollback failed after retries: ${errMsg}`);
    return {
      success: false,
      error: new PentestError(
        `Git rollback failed: ${errMsg}`,
        'filesystem',
        false, // Non-retryable - rollback is best-effort cleanup
        { sourceDir, reason },
        ErrorCode.GIT_ROLLBACK_FAILED,
      ),
    };
  }
}

// Creates checkpoint before each attempt. First attempt preserves workspace; retries clean it.
export async function createGitCheckpoint(
  sourceDir: string,
  description: string,
  attempt: number,
  logger: ActivityLogger,
  paths?: readonly string[],
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    logger.info('Skipping git checkpoint (not a git repository)');
    return { success: true };
  }

  logger.info(`Creating checkpoint for ${description} (attempt ${attempt})`);
  try {
    const result = await withGitRepoLock(async (): Promise<GitOperationResult> => {
      // 1. On retries, clean workspace to prevent pollution from previous attempt
      if (attempt > 1) {
        const cleanResult = await rollbackGitWorkspace(sourceDir, `${description} (retry cleanup)`, logger, paths);
        if (!cleanResult.success) {
          return cleanResult;
        }
      }

      // 2. Stage scoped changes and commit checkpoint
      const changes = await stageChanges(sourceDir, 'staging changes', paths);
      const hasChanges = changes.length > 0;

      await executeGitCommandWithRetry(
        ['git', 'commit', '-m', `📍 Checkpoint: ${description} (attempt ${attempt})`, '--allow-empty'],
        sourceDir,
        'creating commit',
      );

      const commitHash = await getGitCommitHash(sourceDir);
      return { success: true, hadChanges: hasChanges, changes, ...(commitHash && { commitHash }) };
    });

    if (result.success) {
      if (result.hadChanges) {
        logger.info('Checkpoint created with scoped changes staged');
      } else {
        logger.info('Empty checkpoint created (no scoped workspace changes)');
      }
    }
    return result;
  } catch (error) {
    const result = toErrorResult(error);
    logger.warn(`Checkpoint creation failed after retries: ${result.error?.message}`);
    return result;
  }
}

export async function commitGitSuccess(
  sourceDir: string,
  description: string,
  logger: ActivityLogger,
  paths?: readonly string[],
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    logger.info('Skipping git commit (not a git repository)');
    return { success: true };
  }

  logger.info(`Committing successful results for ${description}`);
  try {
    const result = await withGitRepoLock(async (): Promise<GitOperationResult> => {
      const changes = await stageChanges(sourceDir, 'staging changes for success commit', paths);

      await executeGitCommandWithRetry(
        ['git', 'commit', '-m', `✅ ${description}: completed successfully`, '--allow-empty'],
        sourceDir,
        'creating success commit',
      );

      const commitHash = await getGitCommitHash(sourceDir);
      return {
        success: true,
        hadChanges: changes.length > 0,
        changes,
        ...(commitHash && { commitHash }),
      };
    });

    logChangeSummary(
      result.changes ?? [],
      'Success commit created with {count} file changes:',
      'Empty success commit created (agent made no file changes)',
      logger,
    );
    return result;
  } catch (error) {
    const result = toErrorResult(error);
    logger.warn(`Success commit failed after retries: ${result.error?.message}`);
    return result;
  }
}

/**
 * Return the repo-relative paths changed by one commit.
 *
 * The result is NUL-delimited at the Git boundary so unusual path characters
 * are not split or unquoted.
 */
export async function pathsChangedInCommit(sourceDir: string, commitHash: string): Promise<string[]> {
  const result = await executeGitCommandWithRetry(
    ['git', 'diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', commitHash],
    sourceDir,
    'listing commit changed paths',
  );
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

function samePathSet(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    new Set(first).size === first.length &&
    first.every((path) => second.includes(path))
  );
}

async function stagedPaths(sourceDir: string, paths: readonly string[]): Promise<string[]> {
  const result = await executeGitCommandWithRetry(
    ['git', 'diff', '--cached', '--name-only', '-z', '--', ...paths],
    sourceDir,
    'verifying exact staged paths',
  );
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

/** Raised before commit when the staged delta differs from the caller's exact contract. */
export class ExactPathCommitMismatchError extends Error {
  constructor() {
    super('The staged Git path set differs from the exact publication contract');
    this.name = 'ExactPathCommitMismatchError';
  }
}

/**
 * Commit only the supplied pathspecs, leaving unrelated staged and dirty paths untouched.
 *
 * There is no empty-path or empty-commit mode: either would weaken the exact-path
 * contract. The caller owns cleanup after any failed write or commit.
 */
export async function commitExactPaths(
  sourceDir: string,
  paths: readonly string[],
  description: string,
  logger: ActivityLogger,
  expectedChangedPaths?: readonly string[],
): Promise<{ commitHash: string; changedPaths: string[] }> {
  if (paths.length === 0) {
    throw new Error('commitExactPaths: refusing an empty pathspec set');
  }
  if (
    expectedChangedPaths !== undefined &&
    (new Set(expectedChangedPaths).size !== expectedChangedPaths.length ||
      expectedChangedPaths.some((expectedPath) => !paths.includes(expectedPath)))
  ) {
    throw new ExactPathCommitMismatchError();
  }

  return withGitRepoLock(async () => {
    await executeGitCommandWithRetry(['git', 'add', '-A', '--', ...paths], sourceDir, 'staging exact paths');
    if (expectedChangedPaths !== undefined) {
      const prospectivePaths = await stagedPaths(sourceDir, paths);
      if (!samePathSet(prospectivePaths, expectedChangedPaths)) {
        throw new ExactPathCommitMismatchError();
      }
    }
    await executeGitCommandWithRetry(
      ['git', 'commit', '-m', description, '--', ...paths],
      sourceDir,
      'creating path-limited commit',
    );

    const commitHash = await getGitCommitHash(sourceDir);
    if (commitHash === null) {
      throw new Error('commitExactPaths: HEAD is unreadable after commit');
    }

    const changedPaths = await pathsChangedInCommit(sourceDir, commitHash);
    logger.info(`Path-limited commit ${commitHash.slice(0, 8)} changed ${changedPaths.length} path(s)`);
    return { commitHash, changedPaths };
  });
}

/**
 * Get current git commit hash.
 * Returns null if not a git repository.
 */
export async function getGitCommitHash(sourceDir: string): Promise<string | null> {
  if (!(await isGitRepository(sourceDir))) {
    return null;
  }
  try {
    const result = await executeGitCommandWithRetry(['git', 'rev-parse', 'HEAD'], sourceDir, 'read HEAD commit');
    return result.stdout.trim();
  } catch {
    return null;
  }
}

/** Return whether one commit is an ancestor of or equal to another. */
export async function isAncestor(ancestor: string, descendant: string, sourceDir: string): Promise<boolean> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${sourceDir} && git merge-base --is-ancestor ${ancestor} ${descendant}`.nothrow().quiet();
    return result.exitCode === 0;
  });
}

/** Read a file from `HEAD`, returning null only when the Git command cannot supply it. */
export async function readFileFromHead(sourceDir: string, relPath: string): Promise<string | null> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${sourceDir} && git show ${`HEAD:${relPath}`}`.nothrow().quiet();
    return result.exitCode === 0 ? result.stdout : null;
  });
}

/**
 * Classify a failed committed read.
 *
 * Transient markers are checked before corruption markers because Git can emit
 * `bad object` after an earlier permission or I/O error. Unknown failures remain
 * transient so callers retry instead of incorrectly treating them as absent.
 */
export function classifyHeadReadFailure(stderr: string): 'absent' | 'corrupt' | 'transient' {
  const text = stderr.toLowerCase();
  if (/does not exist in|exists on disk, but not in/.test(text)) {
    return 'absent';
  }
  if (
    /permission denied|resource temporarily unavailable|operation timed out|input\/output error|too many open files|no space left|unable to open|interrupted system call/.test(
      text,
    )
  ) {
    return 'transient';
  }
  if (
    /bad object|is corrupt|object file .* is empty|unable to unpack|inflate|did not match|hash mismatch|sha1 mismatch/.test(
      text,
    )
  ) {
    return 'corrupt';
  }
  return 'transient';
}

/** The classifiable outcomes of reading one committed file from `HEAD`. */
export type CommittedReadResult =
  | { readonly state: 'present'; readonly contents: string }
  | { readonly state: 'absent' }
  | { readonly state: 'corrupt' };

/** The classifiable outcomes of reading one committed blob identity from `HEAD`. */
export type CommittedBlobResult =
  | { readonly state: 'present'; readonly sha: string }
  | { readonly state: 'absent' }
  | { readonly state: 'corrupt' };

function transientHeadReadError(operation: string): PentestError {
  return new PentestError(
    'A committed Git object could not be read because of a transient repository error',
    'filesystem',
    true,
    { operation },
    ErrorCode.GIT_CHECKPOINT_FAILED,
  );
}

/**
 * Read a committed file while preserving absent, corrupt, and transient outcomes.
 * Transient reads throw so the activity retry policy remains authoritative.
 */
export async function readCommittedFile(sourceDir: string, relPath: string): Promise<CommittedReadResult> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${sourceDir} && git show ${`HEAD:${relPath}`}`.nothrow().quiet();
    if (result.exitCode === 0) {
      return { state: 'present', contents: result.stdout };
    }

    const failure = classifyHeadReadFailure(result.stderr);
    if (failure === 'absent') {
      return { state: 'absent' };
    }
    if (failure === 'corrupt') {
      return { state: 'corrupt' };
    }
    throw transientHeadReadError('read-committed-file');
  });
}

/** Read one Git blob identity from `HEAD` without collapsing transient failure into absence. */
export async function blobShaFromHead(sourceDir: string, relPath: string): Promise<CommittedBlobResult> {
  return withGitRepoLock(async () => {
    const result = await $`cd ${sourceDir} && git rev-parse ${`HEAD:${relPath}`}`.nothrow().quiet();
    if (result.exitCode === 0) {
      return { state: 'present', sha: result.stdout.trim() };
    }

    const failure = classifyHeadReadFailure(result.stderr);
    if (failure === 'absent') {
      return { state: 'absent' };
    }
    if (failure === 'corrupt') {
      return { state: 'corrupt' };
    }
    throw transientHeadReadError('read-committed-blob-identity');
  });
}

/**
 * Compute the Git blob id for in-memory bytes without writing them, so a caller can compare
 * intended contents against a committed blob id. Uses the repo's own object format (sha1 or
 * sha256) so the id matches what this repository would store.
 */
export async function gitBlobShaForContents(sourceDir: string, contents: string): Promise<string> {
  return withGitRepoLock(async () => {
    const result = await executeGitCommandWithRetry(
      ['git', 'rev-parse', '--show-object-format'],
      sourceDir,
      'reading Git object format',
    );
    const objectFormat = result.stdout.trim();
    if (objectFormat !== 'sha1' && objectFormat !== 'sha256') {
      throw new Error('Unsupported Git object format');
    }
    const bytes = Buffer.from(contents, 'utf8');
    return createHash(objectFormat).update(`blob ${bytes.length}\0`, 'utf8').update(bytes).digest('hex');
  });
}

/** Return the newest reachable commit that changed one exact path. */
export async function lastCommitForPathAtHead(sourceDir: string, relPath: string): Promise<string | null> {
  return withGitRepoLock(async () => {
    const result = await executeGitCommandWithRetry(
      ['git', 'log', '-1', '--format=%H', 'HEAD', '--', relPath],
      sourceDir,
      'reading exact-path publication commit',
    );
    const commitHash = result.stdout.trim();
    return commitHash.length > 0 ? commitHash : null;
  });
}

/** Restore only the supplied paths in both the index and working tree from `HEAD`. */
export async function restorePathsFromHead(sourceDir: string, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) {
    return;
  }
  await withGitRepoLock(() => restoreScopedPathsFromHead(sourceDir, paths, 'committed-state repair'));
}
