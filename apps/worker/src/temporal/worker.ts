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

import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Connection, type WorkflowHandle, WorkflowNotFoundError } from '@temporalio/client';
import { bundleWorkflowCode, NativeConnection, Worker } from '@temporalio/worker';
import dotenv from 'dotenv';
import { resolveModelSpec } from '../ai/models.js';
import { captureWorkerCodeIdentity, RunMetadataStore } from '../audit/run-metadata.js';
import { sanitizeHostname } from '../audit/utils.js';
import type { BlackboxWorkflowInput, BlackboxWorkflowResult } from '../blackbox/activities.js';
import * as blackboxActivities from '../blackbox/activities.js';
import { createBlackboxRunScope } from '../blackbox/scope-guard.js';
import {
  assertResolvedAccessValidationScope,
  type ResolvedAccessValidation,
} from '../blackbox-observation/access-validation.js';
import { normalizeBlackboxConfig, parseConfig } from '../config-parser.js';
import {
  ASSEMBLED_REPORT_PDF_FILENAME,
  deliverablesDir,
  FINAL_REPORT_PDF_FILENAME,
  resolveSessionJsonPath,
} from '../paths.js';
import type { BlackboxRunScope } from '../types/blackbox.js';
import type { VulnClass } from '../types/config.js';
import { fileExists, readJson } from '../utils/file-io.js';
import * as whiteboxActivities from './activities.js';
import type { BlackboxWorkflowProgress } from './blackbox-workflow.js';
import type { PipelineInput, PipelineProgress, PipelineState } from './shared.js';
import {
  assertResumeCompatible,
  type CliArgs,
  consumeValidationSelectionFile,
  deriveWorkflowId,
  enforceResumeTerminationFailure,
  parseCliArgs,
  workflowNameFor,
} from './worker-cli.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRESS_QUERY = 'getProgress';
const registeredActivities = { ...whiteboxActivities, ...blackboxActivities };

function showUsage(): void {
  console.log('\nShannon Worker');
  console.log('Combined worker + client for pentest pipeline\n');
  console.log('Usage:');
  console.log('  node dist/temporal/worker.js <webUrl> <repoPath> --task-queue <name> [options]\n');
  console.log('Options:');
  console.log('  --task-queue <name>    Task queue name (required)');
  console.log('  --blackbox             Run the black-box authorization workflow');
  console.log('  --config <path>        Configuration file path');
  console.log('  --workspace <name>     Resume from existing workspace');
  console.log('  --validation-selection <path>  Consume one normalized black-box validation selector');
  console.log('  --validation-selection-digest <sha256>  Bind the selector to its host-validated digest');
  console.log('  --pipeline-testing     Use minimal prompts for fast testing\n');
}

// === Workspace Resolution ===

interface SessionJson {
  session: {
    id: string;
    webUrl: string;
    mode?: 'whitebox' | 'blackbox';
    blackboxScope?: BlackboxRunScope;
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

async function terminateExistingWorkflows(
  client: Client,
  workspaceName: string,
  mode: CliArgs['mode'],
): Promise<string[]> {
  const sessionPath = resolveSessionJsonPath(path.join('./workspaces', workspaceName));

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
        console.log(`Terminating running scan: ${wfId}`);
        await handle.terminate('Superseded by resume workflow');
        terminated.push(wfId);
        console.log(`Terminated: ${wfId}`);
      } else {
        console.log(`Scan already ${description.status.name}: ${wfId}`);
      }
    } catch (error) {
      if (error instanceof WorkflowNotFoundError) {
        console.log(`Scan not found (already cleaned up): ${wfId}`);
      } else {
        enforceResumeTerminationFailure(mode, wfId, error);
        console.log(`Failed to terminate ${wfId}: ${error}`);
      }
    }
  }

  return terminated;
}

async function resolveWorkspace(
  client: Client,
  args: CliArgs,
  blackboxScope?: BlackboxRunScope,
): Promise<WorkspaceResolution> {
  if (!args.resumeFromWorkspace) {
    const hostname = sanitizeHostname(args.webUrl);
    const workflowId = deriveWorkflowId(hostname, 'new');
    return {
      workflowId,
      sessionId: workflowId,
      isResume: false,
      terminatedWorkflows: [],
    };
  }

  const workspace = args.resumeFromWorkspace;
  const sessionPath = resolveSessionJsonPath(path.join('./workspaces', workspace));
  const workspaceExists = await fileExists(sessionPath);

  if (workspaceExists) {
    console.log('=== RESUME MODE ===');
    console.log(`Workspace: ${workspace}\n`);

    const session = await readJson<SessionJson>(sessionPath);
    assertResumeCompatible(session, args, blackboxScope);

    const terminatedWorkflows = await terminateExistingWorkflows(client, workspace, args.mode);
    if (terminatedWorkflows.length > 0) {
      console.log(`Terminated ${terminatedWorkflows.length} previous scan(s)\n`);
    }

    return {
      workflowId: deriveWorkflowId(workspace, 'resume'),
      sessionId: workspace,
      isResume: true,
      terminatedWorkflows,
    };
  }

  if (!isValidWorkspaceName(workspace)) {
    throw new Error(
      `Invalid workspace name: "${workspace}". ` +
        'Must be 1-128 characters, alphanumeric/hyphens/underscores, starting with alphanumeric',
    );
  }

  console.log('=== NEW NAMED WORKSPACE ===');
  console.log(`Workspace: ${workspace}\n`);

  const workflowId = deriveWorkflowId(workspace, 'new');

  return {
    workflowId,
    sessionId: workspace,
    isResume: false,
    terminatedWorkflows: [],
  };
}

// === Pipeline Input Construction ===

interface OrchestrationConfig {
  vulnClasses?: VulnClass[];
  exploit?: boolean;
}

async function loadOrchestrationConfig(configPath: string | undefined): Promise<OrchestrationConfig> {
  if (!configPath) return {};
  const config = await parseConfig(configPath);
  return {
    ...(config.vuln_classes && config.vuln_classes.length > 0 && { vulnClasses: [...config.vuln_classes] }),
    ...(config.exploit !== undefined && { exploit: config.exploit === 'true' }),
  };
}

async function loadBlackboxRunScope(
  args: CliArgs,
  validationSelection?: ResolvedAccessValidation,
): Promise<BlackboxRunScope> {
  if (!args.configPath) throw new Error('--config is required with --blackbox');
  const config = normalizeBlackboxConfig(await parseConfig(args.configPath, 'blackbox'));
  const runScope = createBlackboxRunScope(
    args.webUrl,
    config.identities.map(({ name }) => name),
    config.identityBoundRequestFields,
    process.env,
    validationSelection?.selectionDigest,
  );
  if (validationSelection) {
    assertResolvedAccessValidationScope(validationSelection, runScope.targetOrigin, config.identities);
  }
  return runScope;
}

async function loadValidationSelection(args: CliArgs): Promise<ResolvedAccessValidation | undefined> {
  if (!args.validationSelectionPath) return undefined;
  if (!args.validationSelectionDigest) {
    throw new Error('--validation-selection-digest is required with --validation-selection');
  }
  const expected = path.resolve(args.repoPath, '.shannon', 'blackbox', 'validation-selection.json');
  if (path.resolve(args.validationSelectionPath) !== expected) {
    throw new Error('--validation-selection must reference the fixed target-workspace selector path');
  }
  return consumeValidationSelectionFile(expected, args.validationSelectionDigest);
}

function buildPipelineInput(
  args: CliArgs,
  workspace: WorkspaceResolution,
  orchestration: OrchestrationConfig,
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
    ...(orchestration.vulnClasses && { vulnClasses: orchestration.vulnClasses }),
    ...(orchestration.exploit !== undefined && { exploit: orchestration.exploit }),
  };
}

async function buildBlackboxInput(
  args: CliArgs,
  workspace: WorkspaceResolution,
  validationSelection?: ResolvedAccessValidation,
): Promise<BlackboxWorkflowInput & { readonly runAttemptId: string }> {
  if (!args.configPath) throw new Error('--config is required with --blackbox');
  const runAttemptId = randomUUID();
  let configuredModel: string | null = null;
  try {
    const model = resolveModelSpec();
    configuredModel = `${model.providerId}:${model.modelId}`;
  } catch {
    /* The normal configuration validation owns this error. */
  }
  const metadataStore = new RunMetadataStore(args.repoPath);
  await metadataStore.start({
    attemptId: runAttemptId,
    workflowId: workspace.workflowId,
    startedAt: new Date().toISOString(),
    // A prior startup may have recorded an attempt before session.json existed.
    isResume: workspace.isResume || (await metadataStore.read()) !== null,
    code: await captureWorkerCodeIdentity(),
    configuredModel,
  });
  return {
    webUrl: args.webUrl,
    repoPath: args.repoPath,
    configPath: args.configPath,
    workspace: workspace.sessionId,
    workflowId: workspace.workflowId,
    runAttemptId,
    auditDir: './workspaces',
    ...(args.outputPath ? { outputPath: args.outputPath } : {}),
    ...(workspace.isResume && args.resumeFromWorkspace ? { resumeFromWorkspace: args.resumeFromWorkspace } : {}),
    ...(workspace.terminatedWorkflows.length > 0 ? { terminatedWorkflows: workspace.terminatedWorkflows } : {}),
    ...(validationSelection ? { validationSelection } : {}),
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
          const session = await readJson<SessionJson>(
            resolveSessionJsonPath(path.join('./workspaces', workspace.sessionId)),
          );
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

async function waitForBlackboxWorkflowResult(
  handle: WorkflowHandle<(input: BlackboxWorkflowInput) => Promise<BlackboxWorkflowResult>>,
): Promise<BlackboxWorkflowResult> {
  const progressInterval = setInterval(async () => {
    try {
      const progress = await handle.query<BlackboxWorkflowProgress>(PROGRESS_QUERY);
      const completed = progress.tasks.filter(({ status }) => status === 'completed').length;
      console.log(
        `Black-box wave ${progress.wave} | revision ${progress.revision} | completed ${completed}/${progress.tasks.length}`,
      );
    } catch {
      // Workflow may have completed.
    }
  }, 30000);

  try {
    const result = await handle.result();
    console.log(`\nBlack-box run finished: ${result.status} (${result.findingCount} finding(s))`);
    return result;
  } finally {
    clearInterval(progressInterval);
  }
}

// === Deliverables Copy ===

function copyDeliverables(repoPath: string, outputPath: string): void {
  const outputDir = deliverablesDir(repoPath);
  if (!fs.existsSync(outputDir)) {
    console.log('No deliverables directory found, skipping copy');
    return;
  }

  const files = fs.readdirSync(outputDir);
  if (files.length === 0) {
    console.log('No deliverables to copy');
    return;
  }

  fs.mkdirSync(outputPath, { recursive: true });

  for (const file of files) {
    if (file === '.git') continue;
    const src = path.join(outputDir, file);
    const dest = path.join(outputPath, file);
    fs.cpSync(src, dest, { recursive: true });
  }

  // Surface the report under its human-facing name alongside the raw deliverables
  const assembledPdf = path.join(outputDir, ASSEMBLED_REPORT_PDF_FILENAME);
  if (fs.existsSync(assembledPdf)) {
    fs.copyFileSync(assembledPdf, path.join(outputPath, FINAL_REPORT_PDF_FILENAME));
  }

  console.log(`Copied ${files.length} deliverable(s) to ${outputPath}`);
}

// === Main Entry Point ===

async function run(): Promise<void> {
  // 1. Parse CLI args
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    showUsage();
    return;
  }
  const args = parseCliArgs(argv);
  const validationSelection = args.mode === 'blackbox' ? await loadValidationSelection(args) : undefined;
  const blackboxScope = args.mode === 'blackbox' ? await loadBlackboxRunScope(args, validationSelection) : undefined;
  const orchestration = args.mode === 'whitebox' ? await loadOrchestrationConfig(args.configPath) : {};

  // 2. Connect to Temporal server
  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  console.log(`Connecting to Temporal at ${address}...`);

  const connection = await NativeConnection.connect({ address });
  const clientConnection = await Connection.connect({ address });
  const client = new Client({ connection: clientConnection });

  try {
    // 3. Bundle workflows and create worker on per-invocation task queue
    console.log('Preparing scan...');
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: path.join(__dirname, 'workflows.js'),
    });

    const worker = await Worker.create({
      connection,
      namespace: 'default',
      workflowBundle,
      activities: registeredActivities,
      taskQueue: args.taskQueue,
      maxConcurrentActivityTaskExecutions: 25,
    });

    // 4. Resolve workspace and build pipeline input
    const workspace = await resolveWorkspace(client, args, blackboxScope);

    // 5. Start worker polling in the background
    const workerDone = worker.run();

    try {
      // 6. Submit workflow to the same task queue
      if (args.mode === 'blackbox') {
        const input = await buildBlackboxInput(args, workspace, validationSelection);
        try {
          const handle = await client.workflow.start<(input: BlackboxWorkflowInput) => Promise<BlackboxWorkflowResult>>(
            workflowNameFor(args.mode),
            {
              taskQueue: args.taskQueue,
              workflowId: workspace.workflowId,
              args: [input],
            },
          );
          await waitForBlackboxWorkflowResult(handle);
        } finally {
          // Even a failed start response can be ambiguous; only a recorded close is an ending.
          try {
            const description = await client.workflow.getHandle(workspace.workflowId).describe();
            if (description.closeTime) {
              const interrupted = ['CANCELLED', 'CANCELED', 'TERMINATED'].includes(description.status.name);
              const reason = interrupted
                ? 'interrupted'
                : description.status.name === 'COMPLETED'
                  ? 'completed'
                  : 'execution_error';
              await new RunMetadataStore(args.repoPath).observeEnd(
                input.runAttemptId,
                description.closeTime.toISOString(),
                reason,
                'temporal',
              );
            }
          } catch (metadataError) {
            console.error(
              'Could not record Temporal termination metadata; the ending remains unrecorded:',
              metadataError,
            );
          }
        }
      } else {
        const input = buildPipelineInput(args, workspace, orchestration);
        const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
          workflowNameFor(args.mode),
          {
            taskQueue: args.taskQueue,
            workflowId: workspace.workflowId,
            args: [input],
          },
        );
        await waitForWorkflowResult(handle, workspace);
        if (args.outputPath) copyDeliverables(args.repoPath, args.outputPath);
      }
    } finally {
      // Stop polling even when workflow startup, result handling, or artifact copying fails.
      worker.shutdown();
      await workerDone;
    }
  } finally {
    await connection.close();
    await clientConnection.close();
  }
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});
