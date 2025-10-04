import chalk from 'chalk';
import {
  selectSession, deleteSession, deleteAllSessions,
  validateAgent, validatePhase
} from '../session-manager.js';
import {
  runPhase, runAll, rollbackTo, rerunAgent, displayStatus, listAgents
} from '../checkpoint-manager.js';
import { logError, PentestError } from '../error-handling.js';
import { cleanupMCP } from '../setup/environment.js';

// Developer command handlers
export async function handleDeveloperCommand(command, args, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt) {
  try {
    let session;

    // Commands that don't require session selection
    if (command === '--list-agents') {
      listAgents();
      return;
    }

    if (command === '--cleanup') {
      // Handle cleanup without needing session selection first
      if (args[0]) {
        // Cleanup specific session by ID
        const sessionId = args[0];
        const deletedSession = await deleteSession(sessionId);
        console.log(chalk.green(`✅ Deleted session ${sessionId} (${new URL(deletedSession.webUrl).hostname})`));
        // Clean up MCP agents when deleting specific session
        await cleanupMCP();
      } else {
        // Cleanup all sessions - require confirmation
        console.log(chalk.yellow('⚠️  This will delete all pentest sessions. Are you sure? (y/N):'));
        const { createInterface } = await import('readline');
        const readline = createInterface({
          input: process.stdin,
          output: process.stdout
        });

        await new Promise((resolve) => {
          readline.question('', (answer) => {
            readline.close();
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              deleteAllSessions().then(deleted => {
                if (deleted) {
                  console.log(chalk.green('✅ All sessions deleted'));
                } else {
                  console.log(chalk.yellow('⚠️  No sessions found to delete'));
                }
                // Clean up MCP agents after deleting sessions
                return cleanupMCP();
              }).then(() => {
                resolve();
              }).catch(error => {
                console.log(chalk.red(`❌ Failed to delete sessions: ${error.message}`));
                resolve();
              });
            } else {
              console.log(chalk.gray('Cleanup cancelled'));
              resolve();
            }
          });
        });
      }
      return;
    }

    // Early validation for commands with agent names (before session selection)

    if (command === '--run-phase') {
      if (!args[0]) {
        console.log(chalk.red('❌ --run-phase requires a phase name'));
        console.log(chalk.gray('Usage: ./shannon.mjs --run-phase <phase-name>'));
        process.exit(1);
      }
      validatePhase(args[0]); // This will throw PentestError if invalid
    }

    if (command === '--rollback-to' || command === '--rerun') {
      if (!args[0]) {
        console.log(chalk.red(`❌ ${command} requires an agent name`));
        console.log(chalk.gray(`Usage: ./shannon.mjs ${command} <agent-name>`));
        process.exit(1);
      }
      validateAgent(args[0]); // This will throw PentestError if invalid
    }

    // Get session for other commands
    try {
      session = await selectSession();
    } catch (error) {
      console.log(chalk.red(`❌ ${error.message}`));
      process.exit(1);
    }

    switch (command) {

      case '--run-phase':
        await runPhase(args[0], session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
        break;

      case '--run-all':
        await runAll(session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
        break;

      case '--rollback-to':
        await rollbackTo(args[0], session);
        break;

      case '--rerun':
        await rerunAgent(args[0], session, pipelineTestingMode, runClaudePromptWithRetry, loadPrompt);
        break;

      case '--status':
        await displayStatus(session);
        break;

      default:
        console.log(chalk.red(`❌ Unknown developer command: ${command}`));
        console.log(chalk.gray('Use --help to see available commands'));
        process.exit(1);
    }
  } catch (error) {
    if (error instanceof PentestError) {
      await logError(error, `Developer command ${command}`);
      console.log(chalk.red.bold(`\n🚨 Command failed: ${error.message}`));
    } else {
      console.log(chalk.red.bold(`\n🚨 Unexpected error: ${error.message}`));
      if (process.env.DEBUG) {
        console.log(chalk.gray(error.stack));
      }
    }
    process.exit(1);
  }
}