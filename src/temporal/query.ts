#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal query tool for inspecting Shannon workflow progress.
 *
 * Queries a running or completed workflow and displays its state.
 *
 * Usage:
 *   npm run temporal:query -- <workflowId>
 *   # or
 *   node dist/temporal/query.js <workflowId>
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import { Connection, Client } from '@temporalio/client';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// Query name must match the one defined in workflows.ts
const PROGRESS_QUERY = 'getProgress';

// Types duplicated from shared.ts to avoid importing workflow APIs
interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
  model?: string | undefined;
}

interface PipelineProgress {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  workflowId: string;
  elapsedMs: number;
}

function showUsage(): void {
  console.log(chalk.cyan.bold('\nShannon Temporal Query Tool'));
  console.log(chalk.gray('Query progress of a running workflow\n'));
  console.log(chalk.yellow('Usage:'));
  console.log('  node dist/temporal/query.js <workflowId>\n');
  console.log(chalk.yellow('Examples:'));
  console.log('  node dist/temporal/query.js shannon-1704672000000\n');
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'running':
      return chalk.yellow(status);
    case 'completed':
      return chalk.green(status);
    case 'failed':
      return chalk.red(status);
    default:
      return status;
  }
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

async function queryWorkflow(): Promise<void> {
  const workflowId = process.argv[2];

  if (!workflowId || workflowId === '--help' || workflowId === '-h') {
    showUsage();
    process.exit(workflowId ? 0 : 1);
  }

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    const handle = client.workflow.getHandle(workflowId);
    const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);

    console.log(chalk.cyan.bold('\nWorkflow Progress'));
    console.log(chalk.gray('\u2500'.repeat(40)));
    console.log(`${chalk.white('Workflow ID:')} ${progress.workflowId}`);
    console.log(`${chalk.white('Status:')} ${getStatusColor(progress.status)}`);
    console.log(
      `${chalk.white('Current Phase:')} ${progress.currentPhase || 'none'}`
    );
    console.log(
      `${chalk.white('Current Agent:')} ${progress.currentAgent || 'none'}`
    );
    console.log(`${chalk.white('Elapsed:')} ${formatDuration(progress.elapsedMs)}`);
    console.log(
      `${chalk.white('Completed:')} ${progress.completedAgents.length}/13 agents`
    );

    if (progress.completedAgents.length > 0) {
      console.log(chalk.gray('\nCompleted agents:'));
      for (const agent of progress.completedAgents) {
        const metrics = progress.agentMetrics[agent];
        const duration = metrics ? formatDuration(metrics.durationMs) : 'unknown';
        const cost = metrics?.costUsd ? `$${metrics.costUsd.toFixed(4)}` : '';
        const model = metrics?.model ? ` [${metrics.model}]` : '';
        console.log(
          chalk.green(`  - ${agent}`) +
            chalk.blue(model) +
            chalk.gray(` (${duration}${cost ? ', ' + cost : ''})`)
        );
      }
    }

    if (progress.error) {
      console.log(chalk.red(`\nError: ${progress.error}`));
      console.log(chalk.red(`Failed agent: ${progress.failedAgent}`));
    }

    console.log();
  } catch (error) {
    const err = error as Error;
    if (err.message?.includes('not found')) {
      console.log(chalk.red(`Workflow not found: ${workflowId}`));
    } else {
      console.error(chalk.red('Query failed:'), err.message);
    }
    process.exit(1);
  } finally {
    await connection.close();
  }
}

queryWorkflow().catch((err) => {
  console.error(chalk.red('Query error:'), err);
  process.exit(1);
});
