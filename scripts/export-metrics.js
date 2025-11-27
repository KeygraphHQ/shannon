// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

#!/usr/bin/env node

/**
 * Export Metrics to CSV
 *
 * Converts session.json from audit-logs into CSV format for spreadsheet analysis.
 *
 * DATA SOURCE:
 * - Reads from: audit-logs/{hostname}_{sessionId}/session.json
 * - Source of truth for all metrics, timing, and cost data
 * - Automatically created by Shannon during agent execution
 *
 * CSV OUTPUT:
 * - One row per agent with: agent, phase, status, attempts, duration_ms, cost_usd
 * - Perfect for importing into Excel/Google Sheets for analysis
 *
 * USE CASES:
 * - Compare performance across multiple sessions
 * - Track costs and optimize budget
 * - Identify slow agents for optimization
 * - Generate charts and visualizations
 * - Export data for external reporting tools
 *
 * EXAMPLES:
 * ```bash
 * # Export to stdout
 * ./scripts/export-metrics.js --session-id abc123
 *
 * # Export to file
 * ./scripts/export-metrics.js --session-id abc123 --output metrics.csv
 *
 * # Find session ID from Shannon store
 * cat .shannon-store.json | jq '.sessions | keys'
 * ```
 *
 * NOTE: For raw metrics, just read audit-logs/.../session.json directly.
 * This script only exists to provide a spreadsheet-friendly CSV format.
 */

import chalk from 'chalk';
import { fs, path } from 'zx';
import { getSession } from '../src/session-manager.js';
import { AuditSession } from '../src/audit/index.js';

// Parse command-line arguments
function parseArgs() {
  const args = {
    sessionId: null,
    output: null
  };

  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];

    if (arg === '--session-id' && process.argv[i + 1]) {
      args.sessionId = process.argv[i + 1];
      i++;
    } else if (arg === '--output' && process.argv[i + 1]) {
      args.output = process.argv[i + 1];
      i++;
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
  console.log(chalk.cyan('\n📊 Export Metrics to CSV'));
  console.log(chalk.gray('\nUsage: ./scripts/export-metrics.js [options]\n'));
  console.log(chalk.white('Options:'));
  console.log(chalk.gray('  --session-id <id>      Session ID to export (required)'));
  console.log(chalk.gray('  --output <file>        Output CSV file path (default: stdout)'));
  console.log(chalk.gray('  --help, -h             Show this help\n'));
  console.log(chalk.white('Examples:'));
  console.log(chalk.gray('  # Export to stdout'));
  console.log(chalk.gray('  ./scripts/export-metrics.js --session-id abc123\n'));
  console.log(chalk.gray('  # Export to file'));
  console.log(chalk.gray('  ./scripts/export-metrics.js --session-id abc123 --output metrics.csv\n'));
}

// Export metrics for a session
async function exportMetrics(sessionId) {
  const session = await getSession(sessionId);
  if (!session) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const auditSession = new AuditSession(session);
  await auditSession.initialize();
  const metrics = await auditSession.getMetrics();

  return exportAsCSV(session, metrics);
}

// Export as CSV
function exportAsCSV(session, metrics) {
  const lines = [];

  // Header
  lines.push('agent,phase,status,attempts,duration_ms,cost_usd');

  // Phase mapping
  const phaseMap = {
    'pre-recon': 'pre-recon',
    'recon': 'recon',
    'injection-vuln': 'vulnerability-analysis',
    'xss-vuln': 'vulnerability-analysis',
    'auth-vuln': 'vulnerability-analysis',
    'authz-vuln': 'vulnerability-analysis',
    'ssrf-vuln': 'vulnerability-analysis',
    'injection-exploit': 'exploitation',
    'xss-exploit': 'exploitation',
    'auth-exploit': 'exploitation',
    'authz-exploit': 'exploitation',
    'ssrf-exploit': 'exploitation',
    'report': 'reporting'
  };

  // Agent rows
  for (const [agentName, agentData] of Object.entries(metrics.metrics.agents)) {
    const phase = phaseMap[agentName] || 'unknown';

    lines.push([
      agentName,
      phase,
      agentData.status,
      agentData.attempts.length,
      agentData.final_duration_ms,
      agentData.total_cost_usd.toFixed(4)
    ].join(','));
  }

  return lines.join('\n');
}

// Main execution
async function main() {
  const args = parseArgs();

  if (!args.sessionId) {
    console.log(chalk.red('❌ Must specify --session-id'));
    printUsage();
    process.exit(1);
  }

  console.log(chalk.cyan.bold('\n📊 Exporting Metrics to CSV\n'));
  console.log(chalk.gray(`Session ID: ${args.sessionId}\n`));

  const output = await exportMetrics(args.sessionId);

  if (args.output) {
    await fs.writeFile(args.output, output);
    console.log(chalk.green(`✅ Exported to: ${args.output}`));
  } else {
    console.log(chalk.cyan('CSV Output:\n'));
    console.log(output);
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
