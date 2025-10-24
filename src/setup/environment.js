import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError } from '../error-handling.js';

// Pure function: Setup local repository for testing
export async function setupLocalRepo(repoPath) {
  try {
    const sourceDir = path.resolve(repoPath);

    // MCP servers are now configured via mcpServers option in claude-executor.js
    // No need for pre-setup with claude CLI

    // Initialize git repository if not already initialized and create checkpoint
    try {
      // Check if it's already a git repository
      const isGitRepo = await fs.pathExists(path.join(sourceDir, '.git'));

      if (!isGitRepo) {
        await $`cd ${sourceDir} && git init`;
        console.log(chalk.blue('✅ Git repository initialized'));
      }

      // Configure git for pentest agent
      await $`cd ${sourceDir} && git config user.name "Pentest Agent"`;
      await $`cd ${sourceDir} && git config user.email "agent@localhost"`;

      // Create initial checkpoint
      await $`cd ${sourceDir} && git add -A && git commit -m "Initial checkpoint: Local repository setup" --allow-empty`;
      console.log(chalk.green('✅ Initial checkpoint created'));
    } catch (gitError) {
      console.log(chalk.yellow(`⚠️ Git setup warning: ${gitError.message}`));
      // Non-fatal - continue without Git setup
    }

    // MCP tools (save_deliverable, generate_totp) are now available natively via shannon-helper MCP server
    // No need to copy bash scripts to target repository

    return sourceDir;
  } catch (error) {
    if (error instanceof PentestError) {
      throw error;
    }
    throw new PentestError(
      `Local repository setup failed: ${error.message}`,
      'filesystem',
      false,
      { repoPath, originalError: error.message }
    );
  }
}