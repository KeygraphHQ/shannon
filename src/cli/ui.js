// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';

// Helper function: Display help information
export function showHelp() {
  console.log(chalk.cyan.bold('AI Penetration Testing Agent'));
  console.log(chalk.gray('Automated security assessment tool\n'));

  console.log(chalk.yellow.bold('NORMAL MODE (Creates Sessions):'));
  console.log('  ./shannon.mjs <WEB_URL> <REPO_PATH> [--config config.yaml] [--pipeline-testing]');
  console.log('  ./shannon.mjs <WEB_URL> <REPO_PATH> --setup-only                     # Setup local repo and create session only\n');

  console.log(chalk.yellow.bold('DEVELOPER MODE (Operates on Existing Sessions):'));
  console.log('  ./shannon.mjs --run-phase <phase-name> [--pipeline-testing]');
  console.log('  ./shannon.mjs --run-all [--pipeline-testing]');
  console.log('  ./shannon.mjs --rollback-to <agent-name>');
  console.log('  ./shannon.mjs --rerun <agent-name> [--pipeline-testing]');
  console.log('  ./shannon.mjs --status');
  console.log('  ./shannon.mjs --list-agents');
  console.log('  ./shannon.mjs --cleanup [session-id]                      # Delete sessions\n');

  console.log(chalk.yellow.bold('OPTIONS:'));
  console.log('  --config <file>      YAML configuration file for authentication and testing parameters');
  console.log('  --pipeline-testing   Use minimal prompts for fast pipeline testing (creates minimal deliverables)');
  console.log('  --disable-loader     Disable the animated progress loader (useful when logs interfere with spinner)\n');

  console.log(chalk.yellow.bold('DEVELOPER COMMANDS:'));
  console.log('  --run-phase          Run all agents in a phase (parallel execution for 5x speedup)');
  console.log('  --run-all            Run all remaining agents to completion (parallel execution)');
  console.log('  --rollback-to        Rollback git workspace to agent checkpoint');
  console.log('  --rerun              Rollback and rerun specific agent');
  console.log('  --status             Show current session status and progress');
  console.log('  --list-agents        List all available agents and phases');
  console.log('  --cleanup            Delete all sessions or specific session by ID\n');

  console.log(chalk.yellow.bold('EXAMPLES:'));
  console.log('  # Normal mode - create new session');
  console.log('  ./shannon.mjs "https://example.com" "/path/to/local/repo"');
  console.log('  ./shannon.mjs "https://example.com" "/path/to/local/repo" --config auth.yaml');
  console.log('  ./shannon.mjs "https://example.com" "/path/to/local/repo" --setup-only  # Setup only\n');

  console.log('  # Developer mode - operate on existing session');
  console.log('  ./shannon.mjs --status                    # Show session status');
  console.log('  ./shannon.mjs --run-phase exploitation    # Run entire phase');
  console.log('  ./shannon.mjs --run-all                   # Run all remaining agents');
  console.log('  ./shannon.mjs --rerun xss-vuln           # Fix and rerun failed agent');
  console.log('  ./shannon.mjs --cleanup                  # Delete all sessions');
  console.log('  ./shannon.mjs --cleanup <session-id>    # Delete specific session\n');

  console.log(chalk.yellow.bold('REQUIREMENTS:'));
  console.log('  • WEB_URL must start with http:// or https://');
  console.log('  • REPO_PATH must be an accessible local directory');
  console.log('  • Only test systems you own or have permission to test');
  console.log('  • Developer mode requires existing pentest session\n');

  console.log(chalk.yellow.bold('ENVIRONMENT VARIABLES:'));
  console.log('  PENTEST_MAX_RETRIES    Number of retries for AI agents (default: 3)');
}

// Export the splash screen function for use in main
export { displaySplashScreen };