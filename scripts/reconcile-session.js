#!/usr/bin/env node

/**
 * Manual Session Reconciliation Script
 *
 * Purpose: Diagnostics and exceptional recovery (NOT normal operations).
 *
 * Use Cases:
 * 1. Diagnostics (Primary): Non-destructively report inconsistencies
 * 2. Debugging: Test reconciliation logic in isolation
 * 3. Exceptional Recovery: Malformed JSON recovery, reconciliation bugs
 * 4. Bulk Operations: System-wide consistency audit
 *
 * Design Principle:
 * "Self-healing is the norm. Manual intervention is the exception."
 *
 * Red Flags (indicate bugs):
 * - Manual script needed frequently
 * - Automatic reconciliation failing consistently
 * - Manual intervention after every crash
 */

import chalk from 'chalk';
import { fs, path } from 'zx';
import { reconcileSession, getSession } from '../src/session-manager.js';

const STORE_FILE = path.join(process.cwd(), '.shannon-store.json');

// Parse command-line arguments
function parseArgs() {
  const args = {
    sessionId: null,
    allSessions: false,
    dryRun: false,
    verbose: false
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--session-id' && process.argv[i + 1]) {
      args.sessionId = process.argv[i + 1];
      i++;
    } else if (arg === '--all-sessions') {
      args.allSessions = true;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--verbose') {
      args.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      console.log(chalk.red(`❌ Unknown argument: ${arg}`));
      printUsage();
      process.exit(1);
    }
  }

  return args;
}

function printUsage() {
  console.log(chalk.cyan('\n📋 Manual Session Reconciliation Script'));
  console.log(chalk.gray('\nUsage: ./scripts/reconcile-session.js [options]\n'));
  console.log(chalk.white('Options:'));
  console.log(chalk.gray('  --session-id <id>      Reconcile specific session'));
  console.log(chalk.gray('  --all-sessions         Reconcile all sessions'));
  console.log(chalk.gray('  --dry-run              Report inconsistencies without fixing'));
  console.log(chalk.gray('  --verbose              Detailed logging'));
  console.log(chalk.gray('  --help, -h             Show this help\n'));
  console.log(chalk.white('Examples:'));
  console.log(chalk.gray('  # Diagnostics (primary use case)'));
  console.log(chalk.gray('  ./scripts/reconcile-session.js --session-id abc123 --dry-run\n'));
  console.log(chalk.gray('  # System-wide consistency audit'));
  console.log(chalk.gray('  ./scripts/reconcile-session.js --all-sessions --dry-run --verbose\n'));
  console.log(chalk.gray('  # Exceptional recovery'));
  console.log(chalk.gray('  ./scripts/reconcile-session.js --session-id abc123\n'));
}

// Load all sessions
async function loadAllSessions() {
  try {
    if (!await fs.pathExists(STORE_FILE)) {
      return [];
    }

    const content = await fs.readFile(STORE_FILE, 'utf8');
    const store = JSON.parse(content);
    return Object.values(store.sessions || {});
  } catch (error) {
    throw new Error(`Failed to load sessions: ${error.message}`);
  }
}

// Reconcile a single session
async function reconcileSingleSession(sessionId, dryRun, verbose) {
  try {
    const session = await getSession(sessionId);
    if (!session) {
      console.log(chalk.red(`❌ Session ${sessionId} not found`));
      return { success: false, sessionId };
    }

    if (verbose) {
      console.log(chalk.blue(`\n🔍 Analyzing session: ${sessionId}`));
      console.log(chalk.gray(`   Web URL: ${session.webUrl}`));
      console.log(chalk.gray(`   Status: ${session.status}`));
      console.log(chalk.gray(`   Completed Agents: ${session.completedAgents.length}`));
    }

    if (dryRun) {
      console.log(chalk.yellow(`   [DRY RUN] Would reconcile session ${sessionId.substring(0, 8)}...`));
      return { success: true, sessionId, dryRun: true };
    }

    // Perform actual reconciliation
    const report = await reconcileSession(sessionId);

    const hasChanges = report.promotions.length > 0 ||
                       report.demotions.length > 0 ||
                       report.failures.length > 0;

    if (hasChanges) {
      console.log(chalk.green(`✅ Reconciled session ${sessionId.substring(0, 8)}...`));

      if (report.promotions.length > 0) {
        console.log(chalk.blue(`   ➕ Added ${report.promotions.length} completed agents: ${report.promotions.join(', ')}`));
      }
      if (report.demotions.length > 0) {
        console.log(chalk.yellow(`   ➖ Removed ${report.demotions.length} rolled-back agents: ${report.demotions.join(', ')}`));
      }
      if (report.failures.length > 0) {
        console.log(chalk.red(`   ❌ Marked ${report.failures.length} failed agents: ${report.failures.join(', ')}`));
      }
    } else {
      if (verbose) {
        console.log(chalk.gray(`   ✓ No inconsistencies found`));
      }
    }

    return { success: true, sessionId, ...report };
  } catch (error) {
    console.log(chalk.red(`❌ Failed to reconcile session ${sessionId}: ${error.message}`));
    return { success: false, sessionId, error: error.message };
  }
}

// Main execution
async function main() {
  const args = parseArgs();

  console.log(chalk.cyan.bold('\n🔄 Manual Session Reconciliation\n'));

  if (args.dryRun) {
    console.log(chalk.yellow('⚠️  DRY RUN MODE - No changes will be made\n'));
  }

  let sessions = [];

  if (args.sessionId) {
    sessions = [{ id: args.sessionId }];
  } else if (args.allSessions) {
    sessions = await loadAllSessions();
    console.log(chalk.blue(`Found ${sessions.length} sessions\n`));
  } else {
    console.log(chalk.red('❌ Must specify either --session-id or --all-sessions'));
    printUsage();
    process.exit(1);
  }

  const results = {
    total: sessions.length,
    success: 0,
    failed: 0,
    totalPromotions: 0,
    totalDemotions: 0,
    totalFailures: 0
  };

  for (const session of sessions) {
    const result = await reconcileSingleSession(session.id, args.dryRun, args.verbose);

    if (result.success) {
      results.success++;
      results.totalPromotions += result.promotions?.length || 0;
      results.totalDemotions += result.demotions?.length || 0;
      results.totalFailures += result.failures?.length || 0;
    } else {
      results.failed++;
    }
  }

  // Summary
  console.log(chalk.cyan.bold('\n📊 Summary:'));
  console.log(chalk.gray(`Total sessions: ${results.total}`));
  console.log(chalk.green(`Successful: ${results.success}`));
  if (results.failed > 0) {
    console.log(chalk.red(`Failed: ${results.failed}`));
  }
  console.log(chalk.blue(`Promotions: ${results.totalPromotions}`));
  console.log(chalk.yellow(`Demotions: ${results.totalDemotions}`));
  console.log(chalk.red(`Failures: ${results.totalFailures}`));

  // Health check
  if (args.allSessions) {
    const consistencyRate = (results.success / results.total) * 100;
    console.log(chalk.cyan(`\n📈 Consistency Rate: ${consistencyRate.toFixed(1)}%`));

    if (consistencyRate < 98) {
      console.log(chalk.red('\n⚠️  WARNING: Low consistency rate detected!'));
      console.log(chalk.red('This may indicate bugs in automatic reconciliation.'));
    }
  }

  console.log();
}

main().catch(error => {
  console.log(chalk.red.bold(`\n🚨 Fatal error: ${error.message}`));
  if (process.env.DEBUG) {
    console.log(chalk.gray(error.stack));
  }
  process.exit(1);
});
