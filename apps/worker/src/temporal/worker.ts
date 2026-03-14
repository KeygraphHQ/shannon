#!/usr/bin/env node

// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Combined Temporal worker + client for Shannon pentest pipeline.
 *
 * Starts a worker on a per-invocation task queue, submits a workflow,
 * waits for the result, and exits. Designed to run as a single ephemeral
 * container per scan.
 *
 * Usage:
 *   node dist/temporal/worker.js <webUrl> <repoPath> [options]
 *
 * Options:
 *   --task-queue <name>    Task queue name (required, unique per scan)
 *   --config <path>        Configuration file path
 *   --output <path>        Output directory for workspaces
 *   --workspace <name>     Resume from existing workspace
 *   --pipeline-testing     Use minimal prompts for fast testing
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Connection, type WorkflowHandle, WorkflowNotFoundError } from '@temporalio/client';
import { bundleWorkflowCode, NativeConnection, Worker } from '@temporalio/worker';
import dotenv from 'dotenv';
import { sanitizeHostname } from '../audit/utils.js';
import { parseConfig } from '../config-parser.js';
import type { PipelineConfig } from '../types/config.js';
import { fileExists, readJson } from '../utils/file-io.js';
import * as activities from './activities.js';
import type { PipelineInput, PipelineProgress, PipelineState } from './shared.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRESS_QUERY = 'getProgress';

// === CLI Argument Parsing ===

interface CliArgs {
  webUrl: string;
  repoPath: string;
  taskQueue: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode: boolean;
  resumeFromWorkspace?: string;
}

function showUsage(): void {
  console.log('\nShannon Worker');
  console.log('Combined worker + client for pentest pipeline\n');
  console.log('Usage:');
  console.log('  node dist/temporal/worker.js <webUrl> <repoPath> --task-queue <name> [options]\n');
  console.log('Options:');
  console.log('  --task-queue <name>    Task queue name (required)');
  console.log('  --config <path>        Configuration file path');
  console.log('  --workspace <name>     Resume from existing workspace');
  console.log('  --pipeline-testing     Use minimal prompts for fast testing\n');
}

function parseCliArgs(argv: string[]): CliArgs {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    showUsage();
    process.exit(0);
  }

  let webUrl: string | undefined;
  let repoPath: string | undefined;
  let taskQueue: string | undefined;
  let configPath: string | undefined;
  let outputPath: string | undefined;
  let pipelineTestingMode = false;
  let resumeFromWorkspace: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--task-queue') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        taskQueue = nextArg;
        i++;
      }
    } else if (arg === '--config') {
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
    } else if (arg === '--workspace') {
      const nextArg = argv[i + 1];
      if (nextArg && !nextArg.startsWith('-')) {
        resumeFromWorkspace = nextArg;
        i++;
      }
    } else if (arg === '--pipeline-testing') {
      pipelineTestingMode = true;
    } else if (arg && !arg.startsWith('-')) {
      if (!webUrl) {
        webUrl = arg;
      } else if (!repoPath) {
        repoPath = arg;
      }
    }
  }

  if (!webUrl || !repoPath) {
    console.error('Error: webUrl and repoPath are required');
    showUsage();
    process.exit(1);
  }

  if (!taskQueue) {
    console.error('Error: --task-queue is required');
    showUsage();
    process.exit(1);
  }

  return {
    webUrl,
    repoPath,
    taskQueue,
    pipelineTestingMode,
    ...(configPath && { configPath }),
    ...(outputPath && { outputPath }),
    ...(resumeFromWorkspace && { resumeFromWorkspace }),
  };
}

// === Workspace Resolution ===

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

function isValidWorkspaceName(name: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(name);
}

interface WorkspaceResolution {
  workflowId: string;
  sessionId: string;
  isResume: boolean;
  terminatedWorkflows: string[];
}

async function terminateExistingWorkflows(client: Client, workspaceName: string): Promise<string[]> {
  const sessionPath = path.join('./workspaces', workspaceName, 'session.json');

  if (!(await fileExists(sessionPath))) {
    throw new Error(`Workspace not found: ${workspaceName}\n` + `Expected path: ${sessionPath}`);
  }

  const session = await readJson<SessionJson>(sessionPath);

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
      }
    }
  }

  return terminated;
}

async function resolveWorkspace(client: Client, args: CliArgs): Promise<WorkspaceResolution> {
  if (!args.resumeFromWorkspace) {
    const hostname = sanitizeHostname(args.webUrl);
    const workflowId = `${hostname}_shannon-${Date.now()}`;
    return {
      workflowId,
      sessionId: workflowId,
      isResume: false,
      terminatedWorkflows: [],
    };
  }

  const workspace = args.resumeFromWorkspace;
  const sessionPath = path.join('./workspaces', workspace, 'session.json');
  const workspaceExists = await fileExists(sessionPath);

  if (workspaceExists) {
    console.log('=== RESUME MODE ===');
    console.log(`Workspace: ${workspace}\n`);

    const terminatedWorkflows = await terminateExistingWorkflows(client, workspace);
    if (terminatedWorkflows.length > 0) {
      console.log(`Terminated ${terminatedWorkflows.length} previous workflow(s)\n`);
    }

    const session = await readJson<SessionJson>(sessionPath);
    if (session.session.webUrl !== args.webUrl) {
      console.error('ERROR: URL mismatch with workspace');
      console.error(`  Workspace URL: ${session.session.webUrl}`);
      console.error(`  Provided URL:  ${args.webUrl}`);
      process.exit(1);
    }

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

  // If the workspace name already looks like a CLI-generated ID
  // (ends with _shannon-<digits>), use it directly to avoid double _shannon- suffixes
  const workflowId = /_shannon-\d+$/.test(workspace) ? workspace : `${workspace}_shannon-${Date.now()}`;

  return {
    workflowId,
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

    const result: PipelineConfig = {};
    if (raw.retry_preset !== undefined) {
      result.retry_preset = raw.retry_preset;
    }
    if (raw.max_concurrent_pipelines !== undefined) {
      result.max_concurrent_pipelines = Number(raw.max_concurrent_pipelines);
    }
    return result;
  } catch {
    return {};
  }
}

function buildPipelineInput(
  args: CliArgs,
  workspace: WorkspaceResolution,
  pipelineConfig: PipelineConfig,
): PipelineInput {
  return {
    webUrl: args.webUrl,
    repoPath: args.repoPath,
    workflowId: workspace.workflowId,
    sessionId: workspace.sessionId,
    ...(args.configPath && { configPath: args.configPath }),
    ...(args.pipelineTestingMode && { pipelineTestingMode: args.pipelineTestingMode }),
    ...(workspace.isResume && args.resumeFromWorkspace && { resumeFromWorkspace: args.resumeFromWorkspace }),
    ...(workspace.terminatedWorkflows.length > 0 && { terminatedWorkflows: workspace.terminatedWorkflows }),
    ...(Object.keys(pipelineConfig).length > 0 && { pipelineConfig }),
  };
}

// === Workflow Result Handling ===

async function waitForWorkflowResult(
  handle: WorkflowHandle<(input: PipelineInput) => Promise<PipelineState>>,
  workspace: WorkspaceResolution,
): Promise<void> {
  const progressInterval = setInterval(async () => {
    try {
      const progress = await handle.query<PipelineProgress>(PROGRESS_QUERY);
      const elapsed = Math.floor(progress.elapsedMs / 1000);
      console.log(
        `[${elapsed}s] Phase: ${progress.currentPhase || 'unknown'} | Agent: ${progress.currentAgent || 'none'} | Completed: ${progress.completedAgents.length}/13`,
      );
    } catch {
      // Workflow may have completed
    }
  }, 30000);

  try {
    const result = await handle.result();
    clearInterval(progressInterval);

    console.log('\nPipeline completed successfully!');
    if (result.summary) {
      console.log(`Duration: ${Math.floor(result.summary.totalDurationMs / 1000)}s`);
      console.log(`Agents completed: ${result.summary.agentCount}`);
      console.log(`Total turns: ${result.summary.totalTurns}`);
      console.log(`Run cost: $${result.summary.totalCostUsd.toFixed(4)}`);

      if (workspace.isResume) {
        try {
          const session = await readJson<SessionJson>(path.join('./workspaces', workspace.sessionId, 'session.json'));
          console.log(`Cumulative cost: $${session.metrics.total_cost_usd.toFixed(4)}`);
        } catch {
          // Non-fatal
        }
      }
    }
  } catch (error) {
    clearInterval(progressInterval);
    console.error('\nPipeline failed:', error);
    process.exit(1);
  }
}

// === Deliverables Copy ===

function copyDeliverables(repoPath: string, outputPath: string): void {
  const deliverablesDir = path.join(repoPath, 'deliverables');
  if (!fs.existsSync(deliverablesDir)) {
    console.log('No deliverables directory found, skipping copy');
    return;
  }

  const files = fs.readdirSync(deliverablesDir);
  if (files.length === 0) {
    console.log('No deliverables to copy');
    return;
  }

  fs.mkdirSync(outputPath, { recursive: true });

  for (const file of files) {
    const src = path.join(deliverablesDir, file);
    const dest = path.join(outputPath, file);
    fs.cpSync(src, dest, { recursive: true });
  }

  console.log(`Copied ${files.length} deliverable(s) to ${outputPath}`);
}

// === Main Entry Point ===

async function run(): Promise<void> {
  // 1. Parse CLI args
  const args = parseCliArgs(process.argv.slice(2));

  // 2. Connect to Temporal server
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(`Connecting to Temporal at ${address}...`);

  const connection = await NativeConnection.connect({ address });
  const clientConnection = await Connection.connect({ address });
  const client = new Client({ connection: clientConnection });

  try {
    // 3. Bundle workflows and create worker on per-invocation task queue
    console.log('Bundling workflows...');
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: path.join(__dirname, 'workflows.js'),
    });

    const worker = await Worker.create({
      connection,
      namespace: 'default',
      workflowBundle,
      activities,
      taskQueue: args.taskQueue,
      maxConcurrentActivityTaskExecutions: 25,
    });

    // 4. Resolve workspace and build pipeline input
    const workspace = await resolveWorkspace(client, args);
    const pipelineConfig = await loadPipelineConfig(args.configPath);
    const input = buildPipelineInput(args, workspace, pipelineConfig);

    // 5. Start worker polling in the background
    const workerDone = worker.run();

    // 6. Submit workflow to the same task queue
    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      'pentestPipelineWorkflow',
      {
        taskQueue: args.taskQueue,
        workflowId: workspace.workflowId,
        args: [input],
      },
    );

    // 7. Wait for workflow result
    await waitForWorkflowResult(handle, workspace);

    // 8. Copy deliverables to output directory
    if (args.outputPath) {
      copyDeliverables(args.repoPath, args.outputPath);
    }

    // 9. Shut down worker gracefully
    worker.shutdown();
    await workerDone;
  } finally {
    await connection.close();
    await clientConnection.close();
  }
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
