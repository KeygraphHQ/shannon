import { $, fs, path } from 'zx';
import chalk from 'chalk';
import { PentestError, logError } from '../error-handling.js';

// Pure function: Setup MCP with multiple isolated Playwright instances
export async function setupMCP(sourceDir) {
  console.log(chalk.blue('🎭 Setting up 5 isolated Playwright MCP instances...'));

  // Set headless mode for all instances
  process.env.PLAYWRIGHT_HEADLESS = 'true';

  try {
    // Clean slate - remove any existing instances
    const instancesToRemove = ['playwright', ...Array.from({length: 5}, (_, i) => `playwright-agent${i + 1}`)];

    for (const instance of instancesToRemove) {
      try {
        await $`claude mcp remove ${instance} --scope user 2>/dev/null`;
      } catch {
        // Silent ignore - instance might not exist
      }
    }

    // Ensure screenshot directories exist
    await fs.ensureDir(path.join(sourceDir, 'screenshots'));

    // Create 5 isolated instances sequentially to avoid config conflicts
    for (let i = 1; i <= 5; i++) {
      const instanceName = `playwright-agent${i}`;
      const screenshotDir = path.join(sourceDir, 'screenshots', instanceName);
      const userDataDir = `/tmp/${instanceName}`;

      // Ensure both directories exist
      await fs.ensureDir(screenshotDir);
      await fs.ensureDir(userDataDir);

      try {
        await $`claude mcp add ${instanceName} --scope user -- npx @playwright/mcp@latest --isolated --user-data-dir ${userDataDir} --output-dir ${screenshotDir}`;
        console.log(chalk.green(`  ✅ ${instanceName} configured`));
      } catch (error) {
        if (error.message?.includes('already exists')) {
          console.log(chalk.gray(`  ⏭️ ${instanceName} already exists`));
        } else {
          console.log(chalk.yellow(`  ⚠️ ${instanceName} failed: ${error.message}, continuing...`));
        }
      }
    }
    console.log(chalk.green('✅ All 5 Playwright MCP instances ready for parallel execution'));

  } catch (error) {
    // All MCP setup failures are fatal
    const mcpError = new PentestError(
      `Critical MCP setup failure: ${error.message}. Browser automation required for pentesting.`,
      'tool',
      false,
      { sourceDir, originalError: error.message }
    );
    await logError(mcpError, 'MCP setup failure', sourceDir);
    throw mcpError;
  }
}

// Pure function: Cleanup MCP instances
export async function cleanupMCP() {
  console.log(chalk.blue('🧹 Cleaning up Playwright MCP instances...'));

  try {
    // Remove all instances (including legacy 'playwright' if it exists)
    const instancesToRemove = ['playwright', ...Array.from({length: 5}, (_, i) => `playwright-agent${i + 1}`)];

    for (const instance of instancesToRemove) {
      try {
        await $`claude mcp remove ${instance} --scope user 2>/dev/null`;
        console.log(chalk.gray(`  🗑️ Removed ${instance}`));
      } catch {
        // Silent ignore - instance might not exist
      }
    }
    console.log(chalk.green('✅ Playwright MCP cleanup complete'));

  } catch (error) {
    // Non-fatal - log warning but don't throw
    console.log(chalk.yellow(`⚠️ MCP cleanup warning: ${error.message}`));
  }
}

// Pure function: Setup local repository for testing
export async function setupLocalRepo(repoPath) {
  try {
    const sourceDir = path.resolve(repoPath);

    // Setup MCP in the local repository - critical for browser automation
    await setupMCP(sourceDir);

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

    // Copy tools to local repository for agent accessibility
    try {
      const toolsDir = path.join(import.meta.dirname, '..', '..', 'tools');

      // Copy TOTP generation script
      const totpScriptSource = path.join(toolsDir, 'generate-totp-standalone.mjs');
      const totpScriptDest = path.join(sourceDir, 'generate-totp.mjs');

      if (await fs.pathExists(totpScriptSource)) {
        await fs.copy(totpScriptSource, totpScriptDest);
        await fs.chmod(totpScriptDest, '755'); // Make executable
        console.log(chalk.green('✅ TOTP generation script copied to target repository'));
      } else {
        console.log(chalk.yellow('⚠️ TOTP script not found, authentication may fail if TOTP is required'));
      }

      // Copy save_deliverable tool
      const saveDeliverableSource = path.join(toolsDir, 'save_deliverable.js');
      const saveDeliverableDest = path.join(sourceDir, 'save_deliverable.js');

      if (await fs.pathExists(saveDeliverableSource)) {
        await fs.copy(saveDeliverableSource, saveDeliverableDest);
        await fs.chmod(saveDeliverableDest, '755'); // Make executable
        console.log(chalk.green('✅ save_deliverable tool copied to target repository'));
      } else {
        console.log(chalk.yellow('⚠️ save_deliverable tool not found, deliverable creation may fail'));
      }
    } catch (toolError) {
      console.log(chalk.yellow(`⚠️ Failed to copy tools: ${toolError.message}`));
      // Non-fatal - continue without tools
    }

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