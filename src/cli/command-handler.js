// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import {
  selectSession, deleteSession, deleteAllSessions,
  validateAgent, validatePhase, reconcileSession
} from '../session-manager.js';
import {
  runPhase, runAll, rollbackTo, rerunAgent, displayStatus, listAgents
} from '../checkpoint-manager.js';
import { logError, PentestError } from '../error-handling.js';
import { promptConfirmation } from './prompts.js';

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
      } else {
        // Cleanup all sessions - require confirmation
        const confirmed = await promptConfirmation(chalk.yellow('⚠️  This will delete all pentest sessions. Are you sure? (y/N):'));
        if (confirmed) {
          const deleted = await deleteAllSessions();
          if (deleted) {
            console.log(chalk.green('✅ All sessions deleted'));
          } else {
            console.log(chalk.yellow('⚠️  No sessions found to delete'));
          }
        } else {
          console.log(chalk.gray('Cleanup cancelled'));
        }
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

    // Self-healing: Reconcile session with audit logs before executing command
    // This ensures Shannon store is consistent with audit data, even after crash recovery
    try {
      const reconcileReport = await reconcileSession(session.id);

      if (reconcileReport.promotions.length > 0) {
        console.log(chalk.blue(`🔄 Reconciled: Added ${reconcileReport.promotions.length} completed agents from audit logs`));
      }
      if (reconcileReport.demotions.length > 0) {
        console.log(chalk.yellow(`🔄 Reconciled: Removed ${reconcileReport.demotions.length} rolled-back agents`));
      }
      if (reconcileReport.failures.length > 0) {
        console.log(chalk.yellow(`🔄 Reconciled: Marked ${reconcileReport.failures.length} failed agents`));
      }

      // Reload session after reconciliation to get fresh state
      const { getSession } = await import('../session-manager.js');
      session = await getSession(session.id);
    } catch (error) {
      // Reconciliation failure is non-critical, but log warning
      console.log(chalk.yellow(`⚠️  Failed to reconcile session with audit logs: ${error.message}`));
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