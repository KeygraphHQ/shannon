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

import { Connection, Client, WorkflowNotFoundError, type WorkflowHandle } from '@temporalio/client';
import dotenv from 'dotenv';
import { displaySplashScreen } from '../splash-screen.js';
import { sanitizeHostname } from '../audit/utils.js';
import { readJson, fileExists } from '../utils/file-io.js';
import path from 'path';
import { parseConfig } from '../config-parser.js';
import type { PipelineConfig } from '../types/config.js';
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
  metrics: {
    total_cost_usd: number;
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
        console.log(`Terminating running workflow: ${wfId}`);
        await handle.terminate('Superseded by resume workflow');
        terminated.push(wfId);
        console.log(`Terminated: ${wfId}`);
      } else {
        console.log(`Workflow already ${description.status.name}: ${wfId}`);
      }
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        console.log(`Workflow not found (already cleaned up): ${wfId}`);
      } else {
        console.log(`Failed to terminate ${wfId}: ${error}`);
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
  console.log('\nShannon Temporal Client');
  console.log('Start a pentest pipeline workflow\n');
  console.log('Usage:');
  console.log(
    '  node dist/temporal/client.js <webUrl> <repoPath> [options]\n'
  );
  console.log('Options:');
  console.log('  --config <path>       Configuration file path');
  console.log('  --output <path>       Output directory for audit logs');
  console.log('  --pipeline-testing    Use minimal prompts for fast testing');
  console.log('  --workspace <name>    Resume from existing workspace');
  console.log(
    '  --workflow-id <id>    Custom workflow ID (default: shannon-<timestamp>)'
  );
  console.log('  --wait                Wait for workflow completion with progress polling\n');
  console.log('Examples:');
  console.log('  node dist/temporal/client.js https://example.com /path/to/repo');
  console.log(
    '  node dist/temporal/client.js https://example.com /path/to/repo --config config.yaml\n'
  );
}

// === CLI Argument Parsing ===

interface CliArgs {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  displayOutputPath?: string;
  pipelineTestingMode: boolean;
  customWorkflowId?: string;
  waitForCompletion: boolean;
  resumeFromWorkspace?: string;
}

function parseCliArgs(argv: string[]): CliArgs {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    showUsage();
    process.exit(0);
  }

  let webUrl: string | undefined;
  let repoPath: string | undefined;
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let displayOutputPath: string | undefined;
  let pipelineTestingMode = false;
  let customWorkflowId: string | undefined;
  let waitForCompletion = false;
  let resumeFromWorkspace: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        configPath = nextArg;
        i++;
      }
    } else if (arg === '--output') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        outputPath = nextArg;
        i++;
      }
    } else if (arg === '--display-output') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        displayOutputPath = nextArg;
        i++;
      }
    } else if (arg === '--workflow-id') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        customWorkflowId = nextArg;
        i++;
      }
    } else if (arg === '--pipeline-testing') {
      pipelineTestingMode = true;
    } else if (arg === '--workspace') {
      const nextArg = argv[i + 1];
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
    console.log('Error: webUrl and repoPath are required');
    showUsage();
    process.exit(1);
  }

  return {
    webUrl, repoPath, pipelineTestingMode, waitForCompletion,
    ...(configPath && { configPath }),
    ...(outputPath && { outputPath }),
    ...(displayOutputPath && { displayOutputPath }),
    ...(customWorkflowId && { customWorkflowId }),
    ...(resumeFromWorkspace && { resumeFromWorkspace }),
  };
}

// === Workspace Resolution ===

interface WorkspaceResolution {
  workflowId: string;
  sessionId: string;
  isResume: boolean;
  terminatedWorkflows: string[];
}

async function resolveWorkspace(
  client: Client,
  args: CliArgs
): Promise<WorkspaceResolution> {
  if (!args.resumeFromWorkspace) {
    const hostname = sanitizeHostname(args.webUrl);
    const workflowId = args.customWorkflowId || `${hostname}_shannon-${Date.now()}`;
    return {
      workflowId,
      sessionId: workflowId,
      isResume: false,
      terminatedWorkflows: [],
    };
  }

  const workspace = args.resumeFromWorkspace;
  const sessionPath = path.join('./audit-logs', workspace, 'session.json');
  const workspaceExists = await fileExists(sessionPath);

  if (workspaceExists) {
    console.log('=== RESUME MODE ===');
    console.log(`Workspace: ${workspace}\n`);

    // 1. Terminate any running workflows from previous attempts
    const terminatedWorkflows = await terminateExistingWorkflows(client, workspace);
    if (terminatedWorkflows.length > 0) {
      console.log(`Terminated ${terminatedWorkflows.length} previous workflow(s)\n`);
    }

    // 2. Validate URL matches the workspace
    const session = await readJson<SessionJson>(sessionPath);
    if (session.session.webUrl !== args.webUrl) {
      console.error('ERROR: URL mismatch with workspace');
      console.error(`  Workspace URL: ${session.session.webUrl}`);
      console.error(`  Provided URL:  ${args.webUrl}`);
      process.exit(1);
    }

    // 3. Generate a new workflow ID scoped to this resume attempt
    // 4. Return resolution with isResume=true so downstream uses resume logic
    return {
      workflowId: `${workspace}_resume_${Date.now()}`,
      sessionId: workspace,
      isResume: true,
      terminatedWorkflows,
    };
  }

  if (!isValidWorkspaceName(workspace)) {
    console.error(`ERROR: Invalid workspace name: "${workspace}"`);
    console.error('  Must be 1-128 characters, alphanumeric/hyphens/underscores, starting with alphanumeric');
    process.exit(1);
  }

  console.log('=== NEW NAMED WORKSPACE ===');
  console.log(`Workspace: ${workspace}\n`);

  return {
    workflowId: `${workspace}_shannon-${Date.now()}`,
    sessionId: workspace,
    isResume: false,
    terminatedWorkflows: [],
  };
}

// === Pipeline Input Construction ===

async function loadPipelineConfig(configPath: string | undefined): Promise<PipelineConfig> {
  if (!configPath) return {};
  try {
    const config = await parseConfig(configPath);
    const raw = config.pipeline;
    if (!raw) return {};

    // FAILSAFE_SCHEMA parses all YAML values as strings — coerce to number
    const result: PipelineConfig = {};
    if (raw.retry_preset !== undefined) {
      result.retry_preset = raw.retry_preset;
    }
    if (raw.max_concurrent_pipelines !== undefined) {
      result.max_concurrent_pipelines = Number(raw.max_concurrent_pipelines);
    }
    return result;
  } catch {
    // Config errors surface later in preflight. Don't block workflow start.
    return {};
  }
}

function buildPipelineInput(
  args: CliArgs, workspace: WorkspaceResolution, pipelineConfig: PipelineConfig
): PipelineInput {
  return {
    webUrl: args.webUrl,
    repoPath: args.repoPath,
    workflowId: workspace.workflowId,
    sessionId: workspace.sessionId,
    ...(args.configPath && { configPath: args.configPath }),
    ...(args.outputPath && { outputPath: args.outputPath }),
    ...(args.pipelineTestingMode && { pipelineTestingMode: args.pipelineTestingMode }),
    ...(workspace.isResume && args.resumeFromWorkspace && { resumeFromWorkspace: args.resumeFromWorkspace }),
    ...(workspace.terminatedWorkflows.length > 0 && { terminatedWorkflows: workspace.terminatedWorkflows }),
    ...(Object.keys(pipelineConfig).length > 0 && { pipelineConfig }),
  };
}

// === Display Helpers ===

function displayWorkflowInfo(args: CliArgs, workspace: WorkspaceResolution): void {
  console.log(`✓ Workflow started: ${workspace.workflowId}`);
  if (workspace.isResume) {
    console.log(`  (Resuming workspace: ${workspace.sessionId})`);
  }
  console.log();
  console.log(`  Target:     ${args.webUrl}`);
  console.log(`  Repository: ${args.repoPath}`);
  console.log(`  Workspace:  ${workspace.sessionId}`);
  if (args.configPath) {
    console.log(`  Config:     ${args.configPath}`);
  }
  if (args.displayOutputPath) {
    console.log(`  Output:     ${args.displayOutputPath}`);
  }
  if (args.pipelineTestingMode) {
    console.log(`  Mode:       Pipeline Testing`);
  }
  console.log();
}

function displayMonitoringInfo(args: CliArgs, workspace: WorkspaceResolution): void {
  const effectiveDisplayPath = args.displayOutputPath || args.outputPath || './audit-logs';
  const outputDir = `${effectiveDisplayPath}/${workspace.sessionId}`;

  console.log('Monitor progress:');
  console.log(`  Web UI:  http://localhost:8233/namespaces/default/workflows/${workspace.workflowId}`);
  console.log(`  Logs:    ./shannon logs ID=${workspace.workflowId}`);
  console.log();
  console.log('Output:');
  console.log(`  Reports: ${outputDir}`);
  console.log();
}

// === Workflow Result Handling ===

async function waitForWorkflowResult(
  handle: WorkflowHandle<(input: PipelineInput) => Promise<PipelineState>>,
  workspace: WorkspaceResolution
): Promise<void> {
  const progressInterval = setInterval(async () => {
    try {
      const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);
      const elapsed = Math.floor(progress.elapsedMs / 1000);
      console.log(
        `[${elapsed}s] Phase: ${progress.currentPhase || 'unknown'} | Agent: ${progress.currentAgent || 'none'} | Completed: ${progress.completedAgents.length}/13`
      );
    } catch {
      // Workflow may have completed
    }
  }, 30000);

  try {
    // 1. Block until workflow completes
    const result = await handle.result();
    clearInterval(progressInterval);

    // 2. Display run metrics
    console.log('\nPipeline completed successfully!');
    if (result.summary) {
      console.log(`Duration: ${Math.floor(result.summary.totalDurationMs / 1000)}s`);
      console.log(`Agents completed: ${result.summary.agentCount}`);
      console.log(`Total turns: ${result.summary.totalTurns}`);
      console.log(`Run cost: $${result.summary.totalCostUsd.toFixed(4)}`);

      // 3. Show cumulative cost across all resume attempts
      if (workspace.isResume) {
        try {
          const session = await readJson<SessionJson>(
            path.join('./audit-logs', workspace.sessionId, 'session.json')
          );
          console.log(`Cumulative cost: $${session.metrics.total_cost_usd.toFixed(4)}`);
        } catch {
          // Non-fatal, skip cumulative cost display
        }
      }
    }
  } catch (error) {
    clearInterval(progressInterval);
    console.error('\nPipeline failed:', error);
    process.exit(1);
  }
}

// === Main Entry Point ===

async function startPipeline(): Promise<void> {
  // 1. Parse CLI args and display splash
  const args = parseCliArgs(process.argv.slice(2));
  await displaySplashScreen();

  // 2. Connect to Temporal server
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(`Connecting to Temporal at ${address}...`);

  const connection = await Connection.connect({ address });
  const client = new Client({ connection });

  try {
    // 3. Resolve workspace (new or resume) and build pipeline input
    const workspace = await resolveWorkspace(client, args);
    const pipelineConfig = await loadPipelineConfig(args.configPath);
    const input = buildPipelineInput(args, workspace, pipelineConfig);

    // 4. Start the Temporal workflow
    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      'pentestPipelineWorkflow',
      {
        taskQueue: 'shannon-pipeline',
        workflowId: workspace.workflowId,
        args: [input],
      }
    );

    // 5. Display info and optionally wait for completion
    displayWorkflowInfo(args, workspace);

    if (args.waitForCompletion) {
      await waitForWorkflowResult(handle, workspace);
    } else {
      displayMonitoringInfo(args, workspace);
    }
  } finally {
    await connection.close();
  }
}

startPipeline().catch((err) => {
  console.error('Client error:', err);
  process.exit(1);
});
