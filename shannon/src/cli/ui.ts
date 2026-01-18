// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';

// Helper function: Display help information
export function showHelp(): void {
  console.log(chalk.cyan.bold('AI Penetration Testing Agent'));
  console.log(chalk.gray('Automated security assessment tool\n'));

  console.log(chalk.yellow.bold('USAGE:'));
  console.log('  shannon <WEB_URL> <REPO_PATH> [--config config.yaml] [--output /path/to/reports]\n');

  console.log(chalk.yellow.bold('OPTIONS:'));
  console.log(
    '  --config <file>      YAML configuration file for authentication and testing parameters'
  );
  console.log(
    '  --output <path>      Custom output directory for session folder (default: ./audit-logs/)'
  );
  console.log(
    '  --pipeline-testing   Use minimal prompts for fast pipeline testing (creates minimal deliverables)'
  );
  console.log(
    '  --disable-loader     Disable the animated progress loader (useful when logs interfere with spinner)'
  );
  console.log('  --help               Show this help message\n');

  console.log(chalk.yellow.bold('EXAMPLES:'));
  console.log('  shannon "https://example.com" "/path/to/local/repo"');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --config auth.yaml');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --output /path/to/reports');
  console.log('  shannon "https://example.com" "/path/to/local/repo" --pipeline-testing\n');

  console.log(chalk.yellow.bold('REQUIREMENTS:'));
  console.log('  • WEB_URL must start with http:// or https://');
  console.log('  • REPO_PATH must be an accessible local directory');
  console.log('  • Only test systems you own or have permission to test\n');

  console.log(chalk.yellow.bold('ENVIRONMENT VARIABLES:'));
  console.log('  PENTEST_MAX_RETRIES    Number of retries for AI agents (default: 3)');
}

// Export the splash screen function for use in main
export { displaySplashScreen };
