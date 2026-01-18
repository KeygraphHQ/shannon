#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal client for starting Shannon pentest pipeline workflows.
 *
 * Starts a workflow and optionally waits for completion with progress polling.
 *
 * Usage:
 *   npm run temporal:start -- <webUrl> <repoPath> [options]
 *   # or
 *   node dist/temporal/client.js <webUrl> <repoPath> [options]
 *
 * Options:
 *   --config <path>       Configuration file path
 *   --output <path>       Output directory for audit logs
 *   --pipeline-testing    Use minimal prompts for fast testing
 *   --workflow-id <id>    Custom workflow ID (default: shannon-<timestamp>)
 *   --wait                Wait for workflow completion with progress polling
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import { Connection, Client } from '@temporalio/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';
import { sanitizeHostname } from '../audit/utils.js';
// Import types only - these don't pull in workflow runtime code
import type { PipelineInput, PipelineState, PipelineProgress } from './shared.js';

dotenv.config();

// Query name must match the one defined in workflows.ts
const PROGRESS_QUERY = 'getProgress';

function showUsage(): void {
  console.log(chalk.cyan.bold('\nShannon Temporal Client'));
  console.log(chalk.gray('Start a pentest pipeline workflow\n'));
  console.log(chalk.yellow('Usage:'));
  console.log(
    '  node dist/temporal/client.js <webUrl> <repoPath> [options]\n'
  );
  console.log(chalk.yellow('Options:'));
  console.log('  --config <path>       Configuration file path');
  console.log('  --output <path>       Output directory for audit logs');
  console.log('  --pipeline-testing    Use minimal prompts for fast testing');
  console.log(
    '  --workflow-id <id>    Custom workflow ID (default: shannon-<timestamp>)'
  );
  console.log('  --wait                Wait for workflow completion with progress polling\n');
  console.log(chalk.yellow('Examples:'));
  console.log('  node dist/temporal/client.js https://example.com /path/to/repo');
  console.log(
    '  node dist/temporal/client.js https://example.com /path/to/repo --config config.yaml\n'
  );
}

async function startPipeline(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showUsage();
    process.exit(0);
  }

  // Parse arguments
  let webUrl: string | undefined;
  let repoPath: string | undefined;
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let displayOutputPath: string | undefined; // Host path for display purposes
  let pipelineTestingMode = false;
  let customWorkflowId: string | undefined;
  let waitForCompletion = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--config') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        configPath = nextArg;
        i++;
      }
    } else if (arg === '--output') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        outputPath = nextArg;
        i++;
      }
    } else if (arg === '--display-output') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        displayOutputPath = nextArg;
        i++;
      }
    } else if (arg === '--workflow-id') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        customWorkflowId = nextArg;
        i++;
      }
    } else if (arg === '--pipeline-testing') {
      pipelineTestingMode = true;
    } else if (arg === '--wait') {
      waitForCompletion = true;
    } else if (arg && !arg.startsWith('-')) {
      if (!webUrl) {
        webUrl = arg;
      } else if (!repoPath) {
        repoPath = arg;
      }
    }
  }

  if (!webUrl || !repoPath) {
    console.log(chalk.red('Error: webUrl and repoPath are required'));
    showUsage();
    process.exit(1);
  }

  // Display splash screen
  await displaySplashScreen();

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(chalk.gray(`Connecting to Temporal at ${address}...`));

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    const hostname = sanitizeHostname(webUrl);
    const workflowId = customWorkflowId || `${hostname}_shannon-${Date.now()}`;

    const input: PipelineInput = {
      webUrl,
      repoPath,
      ...(configPath && { configPath }),
      ...(outputPath && { outputPath }),
      ...(pipelineTestingMode && { pipelineTestingMode }),
    };

    // Determine output directory for display
    // Use displayOutputPath (host path) if provided, otherwise fall back to outputPath or default
    const effectiveDisplayPath = displayOutputPath || outputPath || './audit-logs';
    const outputDir = `${effectiveDisplayPath}/${workflowId}`;

    console.log(chalk.green.bold(`✓ Workflow started: ${workflowId}`));
    console.log();
    console.log(chalk.white('  Target:     ') + chalk.cyan(webUrl));
    console.log(chalk.white('  Repository: ') + chalk.cyan(repoPath));
    if (configPath) {
      console.log(chalk.white('  Config:     ') + chalk.cyan(configPath));
    }
    if (displayOutputPath) {
      console.log(chalk.white('  Output:     ') + chalk.cyan(displayOutputPath));
    }
    if (pipelineTestingMode) {
      console.log(chalk.white('  Mode:       ') + chalk.yellow('Pipeline Testing'));
    }
    console.log();

    // Start workflow by name (not by importing the function)
    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      'pentestPipelineWorkflow',
      {
        taskQueue: 'shannon-pipeline',
        workflowId,
        args: [input],
      }
    );

    if (!waitForCompletion) {
      console.log(chalk.bold('Monitor progress:'));
      console.log(chalk.white('  Web UI:  ') + chalk.blue(`http://localhost:8233/namespaces/default/workflows/${workflowId}`));
      console.log(chalk.white('  Logs:    ') + chalk.gray(`./shannon logs ID=${workflowId}`));
      console.log(chalk.white('  Query:   ') + chalk.gray(`./shannon query ID=${workflowId}`));
      console.log();
      console.log(chalk.bold('Output:'));
      console.log(chalk.white('  Reports: ') + chalk.cyan(outputDir));
      console.log();
      return;
    }

    // Poll for progress every 30 seconds
    const progressInterval = setInterval(async () => {
      try {
        const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);
        const elapsed = Math.floor(progress.elapsedMs / 1000);
        console.log(
          chalk.gray(`[${elapsed}s]`),
          chalk.cyan(`Phase: ${progress.currentPhase || 'unknown'}`),
          chalk.gray(`| Agent: ${progress.currentAgent || 'none'}`),
          chalk.gray(`| Completed: ${progress.completedAgents.length}/13`)
        );
      } catch {
        // Workflow may have completed
      }
    }, 30000);

    try {
      const result = await handle.result();
      clearInterval(progressInterval);

      console.log(chalk.green.bold('\nPipeline completed successfully!'));
      if (result.summary) {
        console.log(chalk.gray(`Duration: ${Math.floor(result.summary.totalDurationMs / 1000)}s`));
        console.log(chalk.gray(`Agents completed: ${result.summary.agentCount}`));
        console.log(chalk.gray(`Total turns: ${result.summary.totalTurns}`));
        console.log(chalk.gray(`Total cost: $${result.summary.totalCostUsd.toFixed(4)}`));
      }
    } catch (error) {
      clearInterval(progressInterval);
      console.error(chalk.red.bold('\nPipeline failed:'), error);
      process.exit(1);
    }
  } finally {
    await connection.close();
  }
}

startPipeline().catch((err) => {
  console.error(chalk.red('Client error:'), err);
  process.exit(1);
});
