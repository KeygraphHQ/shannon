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
 *   --output <path>        Stable mounted path for final customer report copies
 *   --workspace <name>     Resume from existing workspace
 *   --pipeline-testing     Use minimal prompts for fast testing
 *
 * Environment:
 *   TEMPORAL_ADDRESS - Temporal server address (default: localhost:7233)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client, Connection, type WorkflowHandle, WorkflowNotFoundError } from '@temporalio/client';
import { bundleWorkflowCode, NativeConnection, Worker } from '@temporalio/worker';
import dotenv from 'dotenv';
import { DEFAULT_MODEL_SPEC } from '../ai/models.js';
import { capellaTerminalStageLabel, isCapellaSafeFailureMessage } from '../ai/sast/capella/safe-failures.js';
import { capellaActivities, mergeActivityRegistries } from '../ai/sast/capella/temporal/registry.js';
import { CAPELLA_FORMAT_VERSION, CAPELLA_PROMPT_SET_VERSION } from '../ai/sast/capella/types.js';
import { sanitizeHostname } from '../audit/utils.js';
import { distributeConfig, parseConfig } from '../config-parser.js';
import { deliverablesDir, resolveSessionJsonPath } from '../paths.js';
import {
  ACCEPTED_CAPELLA_FAILURE_STAGES,
  isPartialReason,
  projectPartialReasons,
  SAFE_RUN_STATE_MESSAGES,
  workspaceExploitMismatchMessage,
} from '../types/run-state.js';
import { fileExists, readJson } from '../utils/file-io.js';
import {
  assembleReportActivity,
  checkExploitationQueue,
  compactReportFindings,
  finalizeReportOutputs,
  initDeliverableGit,
  initializeDurableScanState,
  initializeReportProgress,
  loadResumeState,
  logPhaseTransition,
  logWorkflowComplete,
  persistCanonicalReportProgress,
  persistFinalizedReportProgress,
  persistMiscellaneousOutcome,
  recordResumeAttempt,
  registerResumeAttempt,
  renumberClassFindings,
  restoreGitCheckpoint,
  runAuthExploitAgent,
  runAuthenticationValidation,
  runAuthVulnAgent,
  runAuthzExploitAgent,
  runAuthzVulnAgent,
  runInjectionExploitAgent,
  runInjectionVulnAgent,
  runMiscellaneousExploitAgent,
  runPreflightValidation,
  runPreReconAgent,
  runReconAgent,
  runReportAgent,
  runSsrfExploitAgent,
  runSsrfVulnAgent,
  runXssExploitAgent,
  runXssVulnAgent,
  saveCheckpoint,
  surfaceReportOutputs,
  syncCodePathDenyRules,
  syncPlaywrightStealthConfig,
} from './activities.js';
import { createReconciliationActivityRegistry } from './reconcile-activities.js';
import type { AgenticSastInput, PipelineInput, PipelineProgress, PipelineState } from './shared.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROGRESS_QUERY = 'getProgress';

function safeFailureCode(value: string | undefined): string | undefined {
  if (value !== undefined && /^[A-Z][A-Z0-9_]{0,63}$/u.test(value)) return value;
  return undefined;
}

function safePartialReasonMessage(reason: PipelineState['partialReasons'][number]): string | undefined {
  if (reason.code === 'agentic_sast_reduced') return 'Agentic SAST completed with reduced coverage.';
  const candidate = {
    code: reason.code,
    ...(reason.vulnerabilityClass !== undefined && { vulnerabilityClass: reason.vulnerabilityClass }),
    ...(reason.stage !== undefined && { stage: reason.stage }),
    ...(reason.reductionReason !== undefined && { reductionReason: reason.reductionReason }),
    ...(reason.omittedCount !== undefined && { omittedCount: reason.omittedCount }),
    ...(reason.consideredCount !== undefined && { consideredCount: reason.consideredCount }),
    ...(reason.classifiedCount !== undefined && { classifiedCount: reason.classifiedCount }),
    ...(reason.affectedBatchCount !== undefined && { affectedBatchCount: reason.affectedBatchCount }),
  };
  if (!isPartialReason(candidate)) return undefined;
  return projectPartialReasons([candidate])[0]?.message;
}

// The ordinary activity names. This frozen list is one of three that together form the
// registered activity set the CLI status reader mirrors: the Capella names in
// ai/sast/capella/temporal/activity-types.ts and the reconciliation names in
// reconcile-activity-types.ts are the other two. Adding or removing an activity means
// updating both this list and the `pentestActivities` object below, or the load-time check
// throws.
export const PENTEST_ACTIVITY_NAMES = Object.freeze([
  'runPreReconAgent',
  'runReconAgent',
  'runInjectionVulnAgent',
  'runXssVulnAgent',
  'runAuthVulnAgent',
  'runAuthzVulnAgent',
  'runSsrfVulnAgent',
  'runInjectionExploitAgent',
  'runXssExploitAgent',
  'runAuthExploitAgent',
  'runAuthzExploitAgent',
  'runSsrfExploitAgent',
  'runMiscellaneousExploitAgent',
  'runReportAgent',
  'runPreflightValidation',
  'runAuthenticationValidation',
  'initDeliverableGit',
  'syncPlaywrightStealthConfig',
  'syncCodePathDenyRules',
  'initializeDurableScanState',
  'persistMiscellaneousOutcome',
  'initializeReportProgress',
  'renumberClassFindings',
  'assembleReportActivity',
  'compactReportFindings',
  'persistCanonicalReportProgress',
  'finalizeReportOutputs',
  'persistFinalizedReportProgress',
  'surfaceReportOutputs',
  'checkExploitationQueue',
  'loadResumeState',
  'restoreGitCheckpoint',
  'registerResumeAttempt',
  'recordResumeAttempt',
  'logPhaseTransition',
  'logWorkflowComplete',
  'saveCheckpoint',
] as const);

export const pentestActivities = Object.freeze({
  runPreReconAgent,
  runReconAgent,
  runInjectionVulnAgent,
  runXssVulnAgent,
  runAuthVulnAgent,
  runAuthzVulnAgent,
  runSsrfVulnAgent,
  runInjectionExploitAgent,
  runXssExploitAgent,
  runAuthExploitAgent,
  runAuthzExploitAgent,
  runSsrfExploitAgent,
  runMiscellaneousExploitAgent,
  runReportAgent,
  runPreflightValidation,
  runAuthenticationValidation,
  initDeliverableGit,
  syncPlaywrightStealthConfig,
  syncCodePathDenyRules,
  initializeDurableScanState,
  persistMiscellaneousOutcome,
  initializeReportProgress,
  renumberClassFindings,
  assembleReportActivity,
  compactReportFindings,
  persistCanonicalReportProgress,
  finalizeReportOutputs,
  persistFinalizedReportProgress,
  surfaceReportOutputs,
  checkExploitationQueue,
  loadResumeState,
  restoreGitCheckpoint,
  registerResumeAttempt,
  recordResumeAttempt,
  logPhaseTransition,
  logWorkflowComplete,
  saveCheckpoint,
});

const registeredPentestNames = Object.keys(pentestActivities).sort();
const expectedPentestNames = [...PENTEST_ACTIVITY_NAMES].sort();
if (
  registeredPentestNames.length !== expectedPentestNames.length ||
  registeredPentestNames.some((name, index) => name !== expectedPentestNames[index])
) {
  throw new Error('Pentest activity registry does not match its frozen ordinary activity contract');
}

export interface ProductionActivityBindings {
  readonly repositoryPath: string;
  readonly webUrl: string;
  readonly workspacesDir: string;
}

/** Compose the frozen ordinary, Capella, and reconciliation activity namespaces. */
export function createProductionActivityRegistry(bindings: ProductionActivityBindings): Readonly<object> {
  const reconciliationActivities = createReconciliationActivityRegistry({
    repositoryPath: bindings.repositoryPath,
    deliverablesDir: deliverablesDir(bindings.repositoryPath),
    workspacesDir: bindings.workspacesDir,
    webUrl: bindings.webUrl,
  });
  return mergeActivityRegistries(pentestActivities, capellaActivities, reconciliationActivities);
}

// === CLI Argument Parsing ===

interface CliArgs {
  webUrl: string;
  repoPath: string;
  taskQueue: string;
  configPath?: string;
  customerOutputPath?: string;
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
  console.log('  --output <path>        Stable mounted path for final customer report copies');
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
  let customerOutputPath: string | undefined;
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
        customerOutputPath = nextArg;
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
    ...(customerOutputPath && { customerOutputPath }),
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
    status?: 'in-progress' | 'completed' | 'failed' | 'cancelled' | 'partial';
  };
  metrics: {
    total_cost_usd: number;
  };
  durableScanState?: {
    schema_version?: unknown;
    exploit?: unknown;
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
        console.log(`Failed to terminate ${wfId}: ${error}`);
      }
    }
  }

  return terminated;
}

async function resolveWorkspace(client: Client, args: CliArgs, expectedExploit: boolean): Promise<WorkspaceResolution> {
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
  const sessionPath = resolveSessionJsonPath(path.join('./workspaces', workspace));
  const workspaceExists = await fileExists(sessionPath);

  if (workspaceExists) {
    const session = await readJson<SessionJson>(sessionPath);
    if (session.session.webUrl !== args.webUrl) {
      throw new Error(
        'This workspace was created for a different target URL, so it cannot be resumed against this one. Check -u, or start a new scan with a different -w name.',
      );
    }
    if (session.durableScanState?.schema_version !== 1 || typeof session.durableScanState.exploit !== 'boolean') {
      throw new Error(SAFE_RUN_STATE_MESSAGES.CorruptedSessionError);
    }
    if (session.durableScanState.exploit !== expectedExploit) {
      throw new Error(workspaceExploitMismatchMessage(session.durableScanState.exploit));
    }

    console.log('=== RESUME MODE ===');
    console.log(`Workspace: ${workspace}\n`);

    const terminatedWorkflows = await terminateExistingWorkflows(client, workspace);
    if (terminatedWorkflows.length > 0) {
      console.log(`Terminated ${terminatedWorkflows.length} previous scan(s)\n`);
    }

    return {
      workflowId: `${workspace}_resume_${Date.now()}`,
      sessionId: workspace,
      isResume: true,
      terminatedWorkflows,
    };
  }

  if (!isValidWorkspaceName(workspace)) {
    console.error('ERROR: Invalid workspace name.');
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

interface OrchestrationConfig {
  agenticSast?: AgenticSastInput;
  exploit?: boolean;
}

async function loadOrchestrationConfig(configPath: string | undefined): Promise<OrchestrationConfig> {
  if (!configPath) return {};
  try {
    const config = await parseConfig(configPath);
    const distributed = distributeConfig(config);
    const codePathAvoids = distributed.avoid.filter((rule) => rule.type === 'code_path').map((rule) => rule.value);
    const codePathFocus = distributed.focus.filter((rule) => rule.type === 'code_path').map((rule) => rule.value);

    return {
      ...(distributed.agenticSast && {
        agenticSast: {
          codePathAvoids,
          codePathFocus,
          modelSpec: process.env.SHANNON_AI_MODEL?.trim() || DEFAULT_MODEL_SPEC,
          capellaFormatVersion: CAPELLA_FORMAT_VERSION,
          promptSetVersion: CAPELLA_PROMPT_SET_VERSION,
        },
      }),
      exploit: distributed.exploit,
    };
  } catch (error) {
    // A broken config must fail the run, not silently fall back to empty
    // defaults that quietly change scope (vuln classes, exploit, retries).
    console.error('Worker configuration could not be loaded. Reference code: CONFIG_VALIDATION_FAILED');
    process.exit(1);
  }
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
    ...(args.customerOutputPath !== undefined && { customerOutputPath: args.customerOutputPath }),
    ...(orchestration.agenticSast !== undefined && { agenticSast: orchestration.agenticSast }),
    ...(orchestration.exploit !== undefined && { exploit: orchestration.exploit }),
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
      const expectedCount = progress.expectedAgents.length;
      // Agentic SAST runs alongside the phase above, so the line names it while it is working.
      const agenticSast = progress.agenticSast.status === 'running' ? ' | Agentic SAST: running' : '';
      console.log(
        `[${elapsed}s] Phase: ${progress.currentPhase || 'unknown'} | Agent: ${progress.currentAgent || 'none'} | Completed: ${progress.completedAgents.length + progress.skippedAgents.length}/${expectedCount}${agenticSast}`,
      );
    } catch {
      // Workflow may have completed
    }
  }, 30000);

  try {
    const result = await handle.result();
    clearInterval(progressInterval);

    // The returned workflow state distinguishes completed, partial, and cancelled runs;
    // each prints its own terminal line so degradation is never labelled as full success.
    if (result.status === 'partial') {
      console.log('\nScan completed with gaps (partial). The reasons are listed below.');
      for (const reason of result.partialReasons) {
        const message = safePartialReasonMessage(reason);
        if (message !== undefined) console.log(`  - ${message}`);
      }
      // The reason above says a class of coverage degraded; these three name the sanitized
      // agentic-SAST failure behind it, under the same labels every other surface uses.
      if (result.agenticSast.status === 'failed') {
        const stage = ACCEPTED_CAPELLA_FAILURE_STAGES.includes(result.agenticSast.failedStage)
          ? capellaTerminalStageLabel(result.agenticSast.failedStage)
          : 'orchestration';
        const message = isCapellaSafeFailureMessage(result.agenticSast.error)
          ? result.agenticSast.error
          : 'An agentic SAST step failed.';
        console.log(`    Agentic SAST stopped at: ${stage}`);
        console.log(`    What happened: ${message}`);
        const code = safeFailureCode(result.agenticSast.errorCode);
        if (code !== undefined) {
          console.log(`    Reference code (for a bug report): ${code}`);
        }
      }
    } else if (result.status === 'cancelled') {
      console.log('\nScan cancelled before it finished.');
    } else {
      console.log('\nScan completed.');
    }
    if (result.summary) {
      console.log(`Duration: ${Math.floor(result.summary.totalDurationMs / 1000)}s`);
      console.log(`Agents resolved: ${result.summary.agentCount}`);
      console.log(`Total turns: ${result.summary.totalTurns}`);
      console.log(`Run cost: $${result.summary.totalCostUsd.toFixed(4)}`);
      if (result.summary.usageAccountingComplete === false) {
        console.log('Cost is incomplete — some background work is not included in this total.');
      }

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
  } catch {
    clearInterval(progressInterval);
    console.error('\nScan failed. Reference code: WORKFLOW_FAILED');
    process.exit(1);
  }
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
    // 3. Validate orchestration and resume state before terminating any workflow.
    const orchestration = await loadOrchestrationConfig(args.configPath);
    const workspace = await resolveWorkspace(client, args, orchestration.exploit ?? true);

    // 4. Bundle workflows and create the worker with the collision-checked activity registry.
    console.log('Preparing scan...');
    const workflowBundle = await bundleWorkflowCode({
      workflowsPath: path.join(__dirname, 'workflows.js'),
    });

    const productionActivities = createProductionActivityRegistry({
      repositoryPath: args.repoPath,
      webUrl: args.webUrl,
      workspacesDir: path.resolve('./workspaces'),
    });
    // args.taskQueue is generated fresh per scan (see resolveWorkspace), so Temporal can only
    // ever route this worker's activities to this scan's own container: an activity task from
    // an older or unrelated scan can never execute against the repo mounted here.
    const worker = await Worker.create({
      connection,
      namespace: 'default',
      workflowBundle,
      activities: productionActivities,
      taskQueue: args.taskQueue,
      maxConcurrentActivityTaskExecutions: 25,
    });

    // 5. Build the fixed-scope pipeline input.
    const input = buildPipelineInput(args, workspace, orchestration);

    // 6. Start worker polling in the background.
    const workerDone = worker.run();

    // 7. Submit workflow to the same task queue.
    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      'pentestPipelineWorkflow',
      {
        taskQueue: args.taskQueue,
        workflowId: workspace.workflowId,
        args: [input],
      },
    );

    // 8. Wait for workflow result.
    await waitForWorkflowResult(handle, workspace);

    // 9. Shut down worker gracefully. Final customer copies are workflow-owned.
    worker.shutdown();
    await workerDone;
  } finally {
    await connection.close();
    await clientConnection.close();
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedPath === fileURLToPath(import.meta.url)) {
  run().catch(() => {
    console.error('Worker failed. Reference code: WORKER_FAILED');
    process.exit(1);
  });
}
