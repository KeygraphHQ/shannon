#!/usr/bin/env node
// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal worker for Shannon pentest pipeline.
 *
 * Polls the 'shannon-pipeline' task queue and executes activities.
 * Handles up to 25 concurrent activities to support multiple parallel workflows.
 *
 * Usage:
 *   npm run temporal:worker
 *   # or
 *   node dist/temporal/worker.js
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import { NativeConnection, Worker, bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';
import chalk from 'chalk';
import * as activities from './activities.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runWorker(): Promise<void> {
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(chalk.cyan(`Connecting to Temporal at ${address}...`));

  const connection = await NativeConnection.connect({ address });

  // Bundle workflows for Temporal's V8 isolate
  console.log(chalk.gray('Bundling workflows...'));
  const workflowBundle = await bundleWorkflowCode({
    workflowsPath: path.join(__dirname, 'workflows.js'),
  });

  const worker = await Worker.create({
    connection,
    namespace: 'default',
    workflowBundle,
    activities,
    taskQueue: 'shannon-pipeline',
    maxConcurrentActivityTaskExecutions: 25, // Support multiple parallel workflows (5 agents × ~5 workflows)
  });

  // Graceful shutdown handling
  const shutdown = async (): Promise<void> => {
    console.log(chalk.yellow('\nShutting down worker...'));
    worker.shutdown();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  console.log(chalk.green('Shannon worker started'));
  console.log(chalk.gray('Task queue: shannon-pipeline'));
  console.log(chalk.gray('Press Ctrl+C to stop\n'));

  try {
    await worker.run();
  } finally {
    await connection.close();
    console.log(chalk.gray('Worker stopped'));
  }
}

runWorker().catch((err) => {
  console.error(chalk.red('Worker failed:'), err);
  process.exit(1);
});
