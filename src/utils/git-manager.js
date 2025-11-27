// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { $ } from 'zx';
import chalk from 'chalk';

// Global git operations semaphore to prevent index.lock conflicts during parallel execution
class GitSemaphore {
  constructor() {
    this.queue = [];
    this.running = false;
  }

  async acquire() {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.process();
    });
  }

  release() {
    this.running = false;
    this.process();
  }

  process() {
    if (!this.running && this.queue.length > 0) {
      this.running = true;
      const resolve = this.queue.shift();
      resolve();
    }
  }
}

const gitSemaphore = new GitSemaphore();

// Execute git commands with retry logic for index.lock conflicts
export const executeGitCommandWithRetry = async (commandArgs, sourceDir, description, maxRetries = 5) => {
  await gitSemaphore.acquire();

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Handle both array and string commands
        let result;
        if (Array.isArray(commandArgs)) {
          // For arrays like ['git', 'status', '--porcelain'], execute parts separately
          const [cmd, ...args] = commandArgs;
          result = await $`cd ${sourceDir} && ${cmd} ${args}`;
        } else {
          // For string commands
          result = await $`cd ${sourceDir} && ${commandArgs}`;
        }
        return result;
      } catch (error) {
        const isLockError = error.message.includes('index.lock') ||
                           error.message.includes('unable to lock') ||
                           error.message.includes('Another git process') ||
                           error.message.includes('fatal: Unable to create') ||
                           error.message.includes('fatal: index file');

        if (isLockError && attempt < maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          console.log(chalk.yellow(`    ⚠️ Git lock conflict during ${description} (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`));
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        throw error;
      }
    }
  } finally {
    gitSemaphore.release();
  }
};

// Pure functions for Git workspace management
const cleanWorkspace = async (sourceDir, reason = 'clean start') => {
  console.log(chalk.blue(`    🧹 Cleaning workspace for ${reason}`));
  try {
    // Check for uncommitted changes
    const status = await $`cd ${sourceDir} && git status --porcelain`;
    const hasChanges = status.stdout.trim().length > 0;

    if (hasChanges) {
      // Show what we're about to remove
      const changes = status.stdout.trim().split('\n').filter(line => line.length > 0);
      console.log(chalk.yellow(`    🔄 Rolling back workspace for ${reason}`));

      await $`cd ${sourceDir} && git reset --hard HEAD`;
      await $`cd ${sourceDir} && git clean -fd`;

      console.log(chalk.yellow(`    ✅ Rollback completed - removed ${changes.length} contaminated changes:`));
      changes.slice(0, 3).forEach(change => console.log(chalk.gray(`       ${change}`)));
      if (changes.length > 3) {
        console.log(chalk.gray(`       ... and ${changes.length - 3} more files`));
      }
    } else {
      console.log(chalk.blue(`    ✅ Workspace already clean (no changes to remove)`));
    }
    return { success: true, hadChanges: hasChanges };
  } catch (error) {
    console.log(chalk.yellow(`    ⚠️ Workspace cleanup failed: ${error.message}`));
    return { success: false, error };
  }
};

export const createGitCheckpoint = async (sourceDir, description, attempt) => {
  console.log(chalk.blue(`    📍 Creating checkpoint for ${description} (attempt ${attempt})`));
  try {
    // Only clean workspace on retry attempts (attempt > 1), not on first attempts
    // This preserves deliverables between agents while still cleaning on actual retries
    if (attempt > 1) {
      const cleanResult = await cleanWorkspace(sourceDir, `${description} (retry cleanup)`);
      if (!cleanResult.success) {
        console.log(chalk.yellow(`    ⚠️ Workspace cleanup failed, continuing anyway: ${cleanResult.error.message}`));
      }
    }

    // Check for uncommitted changes with retry logic
    const status = await executeGitCommandWithRetry(['git', 'status', '--porcelain'], sourceDir, 'status check');
    const hasChanges = status.stdout.trim().length > 0;

    // Stage changes with retry logic
    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, 'staging changes');

    // Create commit with retry logic
    await executeGitCommandWithRetry(['git', 'commit', '-m', `📍 Checkpoint: ${description} (attempt ${attempt})`, '--allow-empty'], sourceDir, 'creating commit');

    if (hasChanges) {
      console.log(chalk.blue(`    ✅ Checkpoint created with uncommitted changes staged`));
    } else {
      console.log(chalk.blue(`    ✅ Empty checkpoint created (no workspace changes)`));
    }
    return { success: true };
  } catch (error) {
    console.log(chalk.yellow(`    ⚠️ Checkpoint creation failed after retries: ${error.message}`));
    return { success: false, error };
  }
};

export const commitGitSuccess = async (sourceDir, description) => {
  console.log(chalk.green(`    💾 Committing successful results for ${description}`));
  try {
    // Check what we're about to commit with retry logic
    const status = await executeGitCommandWithRetry(['git', 'status', '--porcelain'], sourceDir, 'status check for success commit');
    const changes = status.stdout.trim().split('\n').filter(line => line.length > 0);

    // Stage changes with retry logic
    await executeGitCommandWithRetry(['git', 'add', '-A'], sourceDir, 'staging changes for success commit');

    // Create success commit with retry logic
    await executeGitCommandWithRetry(['git', 'commit', '-m', `✅ ${description}: completed successfully`, '--allow-empty'], sourceDir, 'creating success commit');

    if (changes.length > 0) {
      console.log(chalk.green(`    ✅ Success commit created with ${changes.length} file changes:`));
      changes.slice(0, 5).forEach(change => console.log(chalk.gray(`       ${change}`)));
      if (changes.length > 5) {
        console.log(chalk.gray(`       ... and ${changes.length - 5} more files`));
      }
    } else {
      console.log(chalk.green(`    ✅ Empty success commit created (agent made no file changes)`));
    }
    return { success: true };
  } catch (error) {
    console.log(chalk.yellow(`    ⚠️ Success commit failed after retries: ${error.message}`));
    return { success: false, error };
  }
};

export const rollbackGitWorkspace = async (sourceDir, reason = 'retry preparation') => {
  console.log(chalk.yellow(`    🔄 Rolling back workspace for ${reason}`));
  try {
    // Show what we're about to remove with retry logic
    const status = await executeGitCommandWithRetry(['git', 'status', '--porcelain'], sourceDir, 'status check for rollback');
    const changes = status.stdout.trim().split('\n').filter(line => line.length > 0);

    // Reset to HEAD with retry logic
    await executeGitCommandWithRetry(['git', 'reset', '--hard', 'HEAD'], sourceDir, 'hard reset for rollback');

    // Clean untracked files with retry logic
    await executeGitCommandWithRetry(['git', 'clean', '-fd'], sourceDir, 'cleaning untracked files for rollback');

    if (changes.length > 0) {
      console.log(chalk.yellow(`    ✅ Rollback completed - removed ${changes.length} contaminated changes:`));
      changes.slice(0, 3).forEach(change => console.log(chalk.gray(`       ${change}`)));
      if (changes.length > 3) {
        console.log(chalk.gray(`       ... and ${changes.length - 3} more files`));
      }
    } else {
      console.log(chalk.yellow(`    ✅ Rollback completed - no changes to remove`));
    }
    return { success: true };
  } catch (error) {
    console.log(chalk.red(`    ❌ Rollback failed after retries: ${error.message}`));
    return { success: false, error };
  }
};