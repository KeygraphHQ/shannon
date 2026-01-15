// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

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
  error?: Error;
}

/**
 * Get list of changed files from git status --porcelain output
 */
async function getChangedFiles(
  sourceDir: string,
  operationDescription: string
): Promise<string[]> {
  const status = await executeGitCommandWithRetry(
    ['git', 'status', '--porcelain'],
    sourceDir,
    operationDescription
  );
  return status.stdout
    .trim()
    .split('\n')
    .filter((line) => line.length > 0);
}

/**
 * Log a summary of changed files with truncation for long lists
 */
function logChangeSummary(
  changes: string[],
  messageWithChanges: string,
  messageWithoutChanges: string,
  color: typeof chalk.green,
  maxToShow: number = 5
): void {
  if (changes.length > 0) {
    console.log(color(messageWithChanges.replace('{count}', String(changes.length))));
    changes.slice(0, maxToShow).forEach((change) => console.log(chalk.gray(`       ${change}`)));
    if (changes.length > maxToShow) {
      console.log(chalk.gray(`       ... and ${changes.length - maxToShow} more files`));
    }
  } else {
    console.log(color(messageWithoutChanges));
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
      resolve!();
    }
  }
}

const gitSemaphore = new GitSemaphore();

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
  maxRetries: number = 5
): Promise<{ stdout: string; stderr: string }> {
  await gitSemaphore.acquire();

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const [cmd, ...args] = commandArgs;
        const result = await $`cd ${sourceDir} && ${cmd} ${args}`;
        return result;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);

        if (isGitLockError(errMsg) && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(
            chalk.yellow(
              `    ⚠️ Git lock conflict during ${description} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`
            )
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
    throw new Error(`Git command failed after ${maxRetries} retries`);
  } finally {
    gitSemaphore.release();
  }
}

// Two-phase reset: hard reset (tracked files) + clean (untracked files)
export async function rollbackGitWorkspace(
  sourceDir: string,
  reason: string = 'retry preparation'
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  Skipping git rollback (not a git repository)`));
    return { success: true };
  }

  console.log(chalk.yellow(`    🔄 Rolling back workspace for ${reason}`));
  try {
    const changes = await getChangedFiles(sourceDir, 'status check for rollback');

    await executeGitCommandWithRetry(
      ['git', 'reset', '--hard', 'HEAD'],
      sourceDir,
      'hard reset for rollback'
    );
    await executeGitCommandWithRetry(
      ['git', 'clean', '-fd'],
      sourceDir,
      'cleaning untracked files for rollback'
    );

    logChangeSummary(
      changes,
      '    ✅ Rollback completed - removed {count} contaminated changes:',
      '    ✅ Rollback completed - no changes to remove',
      chalk.yellow,
      3
    );
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.red(`    ❌ Rollback failed after retries: ${result.error?.message}`));
    return result;
  }
}

// Creates checkpoint before each attempt. First attempt preserves workspace; retries clean it.
export async function createGitCheckpoint(
  sourceDir: string,
  description: string,
  attempt: number
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  Skipping git checkpoint (not a git repository)`));
    return { success: true };
  }

  console.log(chalk.blue(`    📍 Creating checkpoint for ${description} (attempt ${attempt})`));
  try {
    // First attempt: preserve existing deliverables. Retries: clean workspace to prevent pollution
    if (attempt > 1) {
      const cleanResult = await rollbackGitWorkspace(sourceDir, `${description} (retry cleanup)`);
      if (!cleanResult.success) {
        console.log(
          chalk.yellow(`    ⚠️ Workspace cleanup failed, continuing anyway: ${cleanResult.error?.message}`)
        );
      }
    }

    const changes = await getChangedFiles(sourceDir, 'status check');
    const hasChanges = changes.length > 0;

    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, 'staging changes');
    await executeGitCommandWithRetry(
      ['git', 'commit', '-m', `📍 Checkpoint: ${description} (attempt ${attempt})`, '--allow-empty'],
      sourceDir,
      'creating commit'
    );

    if (hasChanges) {
      console.log(chalk.blue(`    ✅ Checkpoint created with uncommitted changes staged`));
    } else {
      console.log(chalk.blue(`    ✅ Empty checkpoint created (no workspace changes)`));
    }
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.yellow(`    ⚠️ Checkpoint creation failed after retries: ${result.error?.message}`));
    return result;
  }
}

export async function commitGitSuccess(
  sourceDir: string,
  description: string
): Promise<GitOperationResult> {
  // Skip git operations if not a git repository
  if (!(await isGitRepository(sourceDir))) {
    console.log(chalk.gray(`    ⏭️  Skipping git commit (not a git repository)`));
    return { success: true };
  }

  console.log(chalk.green(`    💾 Committing successful results for ${description}`));
  try {
    const changes = await getChangedFiles(sourceDir, 'status check for success commit');

    await executeGitCommandWithRetry(
      ['git', 'add', '-A'],
      sourceDir,
      'staging changes for success commit'
    );
    await executeGitCommandWithRetry(
      ['git', 'commit', '-m', `✅ ${description}: completed successfully`, '--allow-empty'],
      sourceDir,
      'creating success commit'
    );

    logChangeSummary(
      changes,
      '    ✅ Success commit created with {count} file changes:',
      '    ✅ Empty success commit created (agent made no file changes)',
      chalk.green,
      5
    );
    return { success: true };
  } catch (error) {
    const result = toErrorResult(error);
    console.log(chalk.yellow(`    ⚠️ Success commit failed after retries: ${result.error?.message}`));
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
    const result = await $`cd ${sourceDir} && git rev-parse HEAD`;
    return result.stdout.trim();
  } catch {
    return null;
  }
}
