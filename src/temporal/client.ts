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
 *   --no-wait             Start workflow and exit without waiting
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import { Connection, Client } from '@temporalio/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
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
  console.log('  --no-wait             Start workflow and exit without waiting\n');
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
  let pipelineTestingMode = false;
  let customWorkflowId: string | undefined;
  let waitForCompletion = true;

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
    } else if (arg === '--workflow-id') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        customWorkflowId = nextArg;
        i++;
      }
    } else if (arg === '--pipeline-testing') {
      pipelineTestingMode = true;
    } else if (arg === '--no-wait') {
      waitForCompletion = false;
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

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(chalk.cyan(`Connecting to Temporal at ${address}...`));

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    const workflowId = customWorkflowId || `shannon-${Date.now()}`;

    const input: PipelineInput = {
      webUrl,
      repoPath,
      ...(configPath && { configPath }),
      ...(outputPath && { outputPath }),
      ...(pipelineTestingMode && { pipelineTestingMode }),
    };

    console.log(chalk.green(`\nStarting workflow: ${workflowId}`));
    console.log(chalk.gray(`Target: ${webUrl}`));
    console.log(chalk.gray(`Repository: ${repoPath}`));
    console.log(
      chalk.blue(
        `Web UI: http://localhost:8233/namespaces/default/workflows/${workflowId}\n`
      )
    );

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
      console.log(
        chalk.yellow('Workflow started in background. Use query tool to check progress.')
      );
      console.log(chalk.gray(`  npm run temporal:query -- ${workflowId}`));
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
      console.log(
        chalk.gray(`Duration: ${Math.floor((Date.now() - result.startTime) / 1000)}s`)
      );
      console.log(chalk.gray(`Agents completed: ${result.completedAgents.length}`));

      // Show cost summary if available
      const totalCost = Object.values(result.agentMetrics).reduce(
        (sum, m) => sum + (m.costUsd ?? 0),
        0
      );
      if (totalCost > 0) {
        console.log(chalk.gray(`Total cost: $${totalCost.toFixed(4)}`));
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
