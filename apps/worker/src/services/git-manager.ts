// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { AsyncLocalStorage } from 'node:async_hooks';
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

// Two-phase reset: hard reset (tracked files) + clean (untracked files).
// When paths is provided, the untracked clean is scoped to those paths so a
// failing agent's rollback can't delete a concurrent sibling agent's scratch.
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
    const changes = await withGitRepoLock(async () => {
      const pendingChanges = await getChangedFiles(sourceDir, 'status check for rollback');
      await executeGitCommandWithRetry(['git', 'reset', '--hard', 'HEAD'], sourceDir, 'hard reset for rollback');
      const cleanArgs = paths && paths.length > 0 ? ['git', 'clean', '-fd', '--', ...paths] : ['git', 'clean', '-fd'];
      await executeGitCommandWithRetry(cleanArgs, sourceDir, 'cleaning untracked files for rollback');
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
