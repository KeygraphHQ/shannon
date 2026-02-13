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

import { Connection, Client, WorkflowNotFoundError } from '@temporalio/client';
import dotenv from 'dotenv';
import chalk from 'chalk';
import { displaySplashScreen } from '../splash-screen.js';
import { sanitizeHostname } from '../audit/utils.js';
import { readJson, fileExists } from '../audit/utils.js';
import path from 'path';
// Import types only - these don't pull in workflow runtime code
import type { PipelineInput, PipelineState, PipelineProgress } from './shared.js';

/**
 * Session.json structure for resume validation
 */
interface SessionJson {
  session: {
    id: string;
    webUrl: string;
    originalWorkflowId?: string;
    resumeAttempts?: Array<{ workflowId: string }>;
  };
}

dotenv.config();

// Query name must match the one defined in workflows.ts
const PROGRESS_QUERY = 'getProgress';

/**
 * Terminate any running workflows associated with a workspace.
 * Returns the list of terminated workflow IDs.
 */
async function terminateExistingWorkflows(
  client: Client,
  workspaceName: string
): Promise<string[]> {
  const sessionPath = path.join('./audit-logs', workspaceName, 'session.json');

  if (!(await fileExists(sessionPath))) {
    throw new Error(
      `Workspace not found: ${workspaceName}\n` +
      `Expected path: ${sessionPath}`
    );
  }

  const session = await readJson<SessionJson>(sessionPath);

  // Collect all workflow IDs associated with this workspace
  const workflowIds = [
    session.session.originalWorkflowId || session.session.id,
    ...(session.session.resumeAttempts?.map((r) => r.workflowId) || []),
  ].filter((id): id is string => id != null);

  const terminated: string[] = [];

  for (const wfId of workflowIds) {
    try {
      const handle = client.workflow.getHandle(wfId);
      const description = await handle.describe();

      if (description.status.name === 'RUNNING') {
        console.log(chalk.yellow(`Terminating running workflow: ${wfId}`));
        await handle.terminate('Superseded by resume workflow');
        terminated.push(wfId);
        console.log(chalk.green(`Terminated: ${wfId}`));
      } else {
        console.log(chalk.gray(`Workflow already ${description.status.name}: ${wfId}`));
      }
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        console.log(chalk.gray(`Workflow not found (already cleaned up): ${wfId}`));
      } else {
        console.log(chalk.red(`Failed to terminate ${wfId}: ${error}`));
        // Continue anyway - don't block resume on termination failure
      }
    }
  }

  return terminated;
}

/**
 * Validate workspace name: alphanumeric, hyphens, underscores, 1-128 chars,
 * must start with alphanumeric.
 */
function isValidWorkspaceName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name);
}

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
  console.log('  --workspace <name>    Resume from existing workspace');
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
  let resumeFromWorkspace: string | undefined;

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
    } else if (arg === '--workspace') {
      const nextArg = args[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        resumeFromWorkspace = nextArg;
        i++;
      }
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
    let terminatedWorkflows: string[] = [];
    let workflowId: string;
    let sessionId: string; // Workspace name (persistent directory)
    let isResume = false;

    if (resumeFromWorkspace) {
      const sessionPath = path.join('./audit-logs', resumeFromWorkspace, 'session.json');
      const workspaceExists = await fileExists(sessionPath);

      if (workspaceExists) {
        // === Resume Mode: existing workspace ===
        isResume = true;
        console.log(chalk.cyan('=== RESUME MODE ==='));
        console.log(`Workspace: ${resumeFromWorkspace}\n`);

        // Terminate any running workflows for this workspace
        terminatedWorkflows = await terminateExistingWorkflows(client, resumeFromWorkspace);

        if (terminatedWorkflows.length > 0) {
          console.log(chalk.yellow(`Terminated ${terminatedWorkflows.length} previous workflow(s)\n`));
        }

        // Validate URL matches workspace
        const session = await readJson<SessionJson>(sessionPath);

        if (session.session.webUrl !== webUrl) {
          console.error(chalk.red('ERROR: URL mismatch with workspace'));
          console.error(`  Workspace URL: ${session.session.webUrl}`);
          console.error(`  Provided URL:  ${webUrl}`);
          process.exit(1);
        }

        // Generate resume workflow ID
        workflowId = `${resumeFromWorkspace}_resume_${Date.now()}`;
        sessionId = resumeFromWorkspace;
      } else {
        // === New Named Workspace ===
        if (!isValidWorkspaceName(resumeFromWorkspace)) {
          console.error(chalk.red(`ERROR: Invalid workspace name: "${resumeFromWorkspace}"`));
          console.error(chalk.gray('  Must be 1-128 characters, alphanumeric/hyphens/underscores, starting with alphanumeric'));
          process.exit(1);
        }

        console.log(chalk.cyan('=== NEW NAMED WORKSPACE ==='));
        console.log(`Workspace: ${resumeFromWorkspace}\n`);

        workflowId = `${resumeFromWorkspace}_shannon-${Date.now()}`;
        sessionId = resumeFromWorkspace;
      }
    } else {
      // === New Auto-Named Workflow ===
      const hostname = sanitizeHostname(webUrl);
      workflowId = customWorkflowId || `${hostname}_shannon-${Date.now()}`;
      sessionId = workflowId;
    }

    const input: PipelineInput = {
      webUrl,
      repoPath,
      workflowId, // Add for audit correlation
      sessionId, // Workspace directory name
      ...(configPath && { configPath }),
      ...(outputPath && { outputPath }),
      ...(pipelineTestingMode && { pipelineTestingMode }),
      ...(isResume && resumeFromWorkspace && { resumeFromWorkspace }),
      ...(terminatedWorkflows.length > 0 && { terminatedWorkflows }),
    };

    // Determine output directory for display (use sessionId for persistent directory)
    // Use displayOutputPath (host path) if provided, otherwise fall back to outputPath or default
    const effectiveDisplayPath = displayOutputPath || outputPath || './audit-logs';
    const outputDir = `${effectiveDisplayPath}/${sessionId}`;

    console.log(chalk.green.bold(`✓ Workflow started: ${workflowId}`));
    if (isResume) {
      console.log(chalk.gray(`  (Resuming workspace: ${sessionId})`));
    }
    console.log();
    console.log(chalk.white('  Target:     ') + chalk.cyan(webUrl));
    console.log(chalk.white('  Repository: ') + chalk.cyan(repoPath));
    console.log(chalk.white('  Workspace:  ') + chalk.cyan(sessionId));
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
