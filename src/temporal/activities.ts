// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal activities for Shannon agent execution.
 *
 * Each activity wraps service calls with Temporal-specific concerns:
 * - Heartbeat loop (2s interval) to signal worker liveness
 * - Error classification into ApplicationFailure
 * - Container lifecycle management
 *
 * Business logic is delegated to services in src/services/.
 */

import { heartbeat, ApplicationFailure, Context } from '@temporalio/activity';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs/promises';

import { classifyErrorForTemporal, PentestError } from '../error-handling.js';
import { ErrorCode } from '../types/errors.js';
import { getOrCreateContainer, getContainer, removeContainer } from '../services/container.js';
import { ExploitationCheckerService } from '../services/exploitation-checker.js';
import type { VulnType, ExploitationDecision } from '../queue-validation.js';
import { AuditSession } from '../audit/index.js';
import type { WorkflowSummary } from '../audit/workflow-logger.js';
import type { AgentName } from '../types/agents.js';
import { ALL_AGENTS } from '../types/agents.js';
import type { AgentMetrics, ResumeState } from './shared.js';
import { copyDeliverablesToAudit, type SessionMetadata, readJson, fileExists } from '../audit/utils.js';
import { assembleFinalReport, injectModelIntoReport } from '../phases/reporting.js';
import { AGENTS } from '../session-manager.js';
import { executeGitCommandWithRetry } from '../utils/git-manager.js';
import type { ResumeAttempt } from '../audit/metrics-tracker.js';

// Max lengths to prevent Temporal protobuf buffer overflow
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_STACK_TRACE_LENGTH = 1000;

// Max retries for output validation errors (agent didn't save deliverables)
const MAX_OUTPUT_VALIDATION_RETRIES = 3;

const HEARTBEAT_INTERVAL_MS = 2000;

/**
 * Input for all agent activities.
 */
export interface ActivityInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId: string;
  sessionId: string;
}

/**
 * Truncate error message to prevent buffer overflow in Temporal serialization.
 */
function truncateErrorMessage(message: string): string {
  if (message.length <= MAX_ERROR_MESSAGE_LENGTH) {
    return message;
  }
  return message.slice(0, MAX_ERROR_MESSAGE_LENGTH - 20) + '\n[truncated]';
}

/**
 * Truncate stack trace on an ApplicationFailure to prevent buffer overflow.
 */
function truncateStackTrace(failure: ApplicationFailure): void {
  if (failure.stack && failure.stack.length > MAX_STACK_TRACE_LENGTH) {
    failure.stack = failure.stack.slice(0, MAX_STACK_TRACE_LENGTH) + '\n[stack truncated]';
  }
}

/**
 * Build SessionMetadata from ActivityInput.
 */
function buildSessionMetadata(input: ActivityInput): SessionMetadata {
  const { webUrl, repoPath, outputPath, sessionId } = input;
  return {
    id: sessionId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };
}

/**
 * Core activity implementation using services.
 *
 * Executes a single agent with:
 * 1. Heartbeat loop for worker liveness
 * 2. Container creation/reuse
 * 3. Service-based agent execution
 * 4. Error classification for Temporal retry
 */
async function runAgentActivity(
  agentName: AgentName,
  input: ActivityInput
): Promise<AgentMetrics> {
  const { repoPath, configPath, pipelineTestingMode = false, workflowId, webUrl } = input;
  const startTime = Date.now();
  const attemptNumber = Context.current().info.attempt;

  // Heartbeat loop - signals worker is alive to Temporal server
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    heartbeat({ agent: agentName, elapsedSeconds: elapsed, attempt: attemptNumber });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // Build session metadata and get/create container
    const sessionMetadata = buildSessionMetadata(input);
    const container = getOrCreateContainer(workflowId, sessionMetadata);

    // Create audit session for THIS agent execution
    // NOTE: Each agent needs its own AuditSession because AuditSession uses
    // instance state (currentAgentName) that cannot be shared across parallel agents
    const auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize(workflowId);

    // Execute agent via service (throws PentestError on failure)
    const endResult = await container.agentExecution.executeOrThrow(
      agentName,
      {
        webUrl,
        repoPath,
        configPath,
        pipelineTestingMode,
        attemptNumber,
      },
      auditSession
    );

    // Success - return metrics
    return {
      durationMs: Date.now() - startTime,
      inputTokens: null,
      outputTokens: null,
      costUsd: endResult.cost_usd,
      numTurns: null,
      model: endResult.model,
    };
  } catch (error) {
    // If error is already an ApplicationFailure, re-throw directly
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // Check if output validation retry limit reached (PentestError with code)
    if (
      error instanceof PentestError &&
      error.code === ErrorCode.OUTPUT_VALIDATION_FAILED &&
      attemptNumber >= MAX_OUTPUT_VALIDATION_RETRIES
    ) {
      throw ApplicationFailure.nonRetryable(
        `Agent ${agentName} failed output validation after ${attemptNumber} attempts`,
        'OutputValidationError',
        [{ agentName, attemptNumber, elapsed: Date.now() - startTime }]
      );
    }

    // Classify error for Temporal retry behavior
    const classified = classifyErrorForTemporal(error);
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = truncateErrorMessage(rawMessage);

    if (classified.retryable) {
      const failure = ApplicationFailure.create({
        message,
        type: classified.type,
        details: [{ agentName, attemptNumber, elapsed: Date.now() - startTime }],
      });
      truncateStackTrace(failure);
      throw failure;
    } else {
      const failure = ApplicationFailure.nonRetryable(message, classified.type, [
        { agentName, attemptNumber, elapsed: Date.now() - startTime },
      ]);
      truncateStackTrace(failure);
      throw failure;
    }
  } finally {
    clearInterval(heartbeatInterval);
  }
}

// === Individual Agent Activity Exports ===

export async function runPreReconAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('pre-recon', input);
}

export async function runReconAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('recon', input);
}

export async function runInjectionVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('injection-vuln', input);
}

export async function runXssVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('xss-vuln', input);
}

export async function runAuthVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('auth-vuln', input);
}

export async function runSsrfVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('ssrf-vuln', input);
}

export async function runAuthzVulnAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('authz-vuln', input);
}

export async function runInjectionExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('injection-exploit', input);
}

export async function runXssExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('xss-exploit', input);
}

export async function runAuthExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('auth-exploit', input);
}

export async function runSsrfExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('ssrf-exploit', input);
}

export async function runAuthzExploitAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('authz-exploit', input);
}

export async function runReportAgent(input: ActivityInput): Promise<AgentMetrics> {
  return runAgentActivity('report', input);
}

// === Report Assembly Activities ===

/**
 * Assemble the final report by concatenating exploitation evidence files.
 */
export async function assembleReportActivity(input: ActivityInput): Promise<void> {
  const { repoPath } = input;
  console.log(chalk.blue('  Assembling deliverables from specialist agents...'));
  try {
    await assembleFinalReport(repoPath);
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`  Warning: Error assembling final report: ${err.message}`));
  }
}

/**
 * Inject model metadata into the final report.
 */
export async function injectReportMetadataActivity(input: ActivityInput): Promise<void> {
  const { repoPath, sessionId, outputPath } = input;
  const effectiveOutputPath = outputPath
    ? path.join(outputPath, sessionId)
    : path.join('./audit-logs', sessionId);
  try {
    await injectModelIntoReport(repoPath, effectiveOutputPath);
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`  Warning: Error injecting model into report: ${err.message}`));
  }
}

// === Exploitation Queue Check ===

/**
 * Check if exploitation should run for a given vulnerability type.
 *
 * Uses existing container if available (from prior agent runs),
 * otherwise creates service directly (stateless, no dependencies).
 */
export async function checkExploitationQueue(
  input: ActivityInput,
  vulnType: VulnType
): Promise<ExploitationDecision> {
  const { repoPath, workflowId } = input;

  // Reuse container's service if available (from prior vuln agent runs)
  const existingContainer = getContainer(workflowId);
  const checker = existingContainer?.exploitationChecker ?? new ExploitationCheckerService();

  return checker.checkQueue(vulnType, repoPath);
}

// === Resume Activities ===

interface SessionJson {
  session: {
    id: string;
    webUrl: string;
    repoPath?: string;
    originalWorkflowId?: string;
    resumeAttempts?: ResumeAttempt[];
  };
  metrics: {
    agents: Record<
      string,
      {
        status: 'in-progress' | 'success' | 'failed';
        checkpoint?: string;
      }
    >;
  };
}

/**
 * Load resume state from an existing workspace.
 */
export async function loadResumeState(
  workspaceName: string,
  expectedUrl: string,
  expectedRepoPath: string
): Promise<ResumeState> {
  const sessionPath = path.join('./audit-logs', workspaceName, 'session.json');

  const exists = await fileExists(sessionPath);
  if (!exists) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceName}\nExpected path: ${sessionPath}`,
      'WorkspaceNotFoundError'
    );
  }

  let session: SessionJson;
  try {
    session = await readJson<SessionJson>(sessionPath);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw ApplicationFailure.nonRetryable(
      `Corrupted session.json in workspace ${workspaceName}: ${errorMsg}`,
      'CorruptedSessionError'
    );
  }

  if (session.session.webUrl !== expectedUrl) {
    throw ApplicationFailure.nonRetryable(
      `URL mismatch with workspace\n  Workspace URL: ${session.session.webUrl}\n  Provided URL:  ${expectedUrl}`,
      'URLMismatchError'
    );
  }

  const completedAgents: string[] = [];
  const agents = session.metrics.agents;

  for (const agentName of ALL_AGENTS) {
    const agentData = agents[agentName];
    if (!agentData || agentData.status !== 'success') {
      continue;
    }

    const deliverableFilename = AGENTS[agentName].deliverableFilename;
    const deliverablePath = `${expectedRepoPath}/deliverables/${deliverableFilename}`;
    const deliverableExists = await fileExists(deliverablePath);

    if (!deliverableExists) {
      console.log(
        chalk.yellow(`Agent ${agentName} shows success but deliverable missing, will re-run`)
      );
      continue;
    }

    completedAgents.push(agentName);
  }

  const checkpoints = completedAgents
    .map((name) => agents[name]?.checkpoint)
    .filter((hash): hash is string => hash != null);

  if (checkpoints.length === 0) {
    const successAgents = Object.entries(agents)
      .filter(([, data]) => data.status === 'success')
      .map(([name]) => name);

    throw ApplicationFailure.nonRetryable(
      `Cannot resume workspace ${workspaceName}: ` +
        (successAgents.length > 0
          ? `${successAgents.length} agent(s) show success in session.json (${successAgents.join(', ')}) ` +
            `but their deliverable files are missing from disk. ` +
            `Start a fresh run instead.`
          : `No agents completed successfully. Start a fresh run instead.`),
      'NoCheckpointsError'
    );
  }

  const checkpointHash = await findLatestCommit(expectedRepoPath, checkpoints);
  const originalWorkflowId = session.session.originalWorkflowId || session.session.id;

  console.log(chalk.cyan(`=== RESUME STATE ===`));
  console.log(`Workspace: ${workspaceName}`);
  console.log(`Completed agents: ${completedAgents.length}`);
  console.log(`Checkpoint: ${checkpointHash}`);

  return {
    workspaceName,
    originalUrl: session.session.webUrl,
    completedAgents,
    checkpointHash,
    originalWorkflowId,
  };
}

async function findLatestCommit(repoPath: string, commitHashes: string[]): Promise<string> {
  if (commitHashes.length === 1) {
    const hash = commitHashes[0];
    if (!hash) {
      throw new PentestError(
        'Empty commit hash in array',
        'filesystem',
        false, // Non-retryable - corrupt workspace state
        { phase: 'resume' },
        ErrorCode.GIT_CHECKPOINT_FAILED
      );
    }
    return hash;
  }

  const result = await executeGitCommandWithRetry(
    ['git', 'rev-list', '--max-count=1', ...commitHashes],
    repoPath,
    'find latest commit'
  );

  return result.stdout.trim();
}

/**
 * Restore git workspace to a checkpoint and clean up partial deliverables.
 */
export async function restoreGitCheckpoint(
  repoPath: string,
  checkpointHash: string,
  incompleteAgents: AgentName[]
): Promise<void> {
  console.log(chalk.blue(`Restoring git workspace to ${checkpointHash}...`));

  await executeGitCommandWithRetry(
    ['git', 'reset', '--hard', checkpointHash],
    repoPath,
    'reset to checkpoint for resume'
  );
  await executeGitCommandWithRetry(
    ['git', 'clean', '-fd'],
    repoPath,
    'clean untracked files for resume'
  );

  for (const agentName of incompleteAgents) {
    const deliverableFilename = AGENTS[agentName].deliverableFilename;
    const deliverablePath = `${repoPath}/deliverables/${deliverableFilename}`;
    try {
      const exists = await fileExists(deliverablePath);
      if (exists) {
        console.log(chalk.yellow(`Cleaning partial deliverable: ${agentName}`));
        await fs.unlink(deliverablePath);
      }
    } catch (error) {
      console.log(chalk.gray(`Note: Failed to delete ${deliverablePath}: ${error}`));
    }
  }

  console.log(chalk.green('Workspace restored to clean state'));
}

/**
 * Record a resume attempt in session.json.
 */
export async function recordResumeAttempt(
  input: ActivityInput,
  terminatedWorkflows: string[],
  checkpointHash: string
): Promise<void> {
  const sessionMetadata = buildSessionMetadata(input);
  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize();
  await auditSession.addResumeAttempt(input.workflowId, terminatedWorkflows, checkpointHash);
}

// === Phase Transition Activities ===

/**
 * Log phase transition to the unified workflow log.
 */
export async function logPhaseTransition(
  input: ActivityInput,
  phase: string,
  event: 'start' | 'complete'
): Promise<void> {
  const sessionMetadata = buildSessionMetadata(input);
  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize(input.workflowId);

  if (event === 'start') {
    await auditSession.logPhaseStart(phase);
  } else {
    await auditSession.logPhaseComplete(phase);
  }
}

/**
 * Log workflow completion with full summary.
 * Cleans up container when done.
 */
export async function logWorkflowComplete(
  input: ActivityInput,
  summary: WorkflowSummary
): Promise<void> {
  const { repoPath, workflowId } = input;
  const sessionMetadata = buildSessionMetadata(input);

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize(workflowId);
  await auditSession.updateSessionStatus(summary.status);

  // Use cumulative metrics from session.json
  const sessionData = (await auditSession.getMetrics()) as {
    metrics: {
      total_duration_ms: number;
      total_cost_usd: number;
      agents: Record<string, { final_duration_ms: number; total_cost_usd: number }>;
    };
  };

  // Fill in metrics for skipped agents
  const agentMetrics = { ...summary.agentMetrics };
  for (const agentName of summary.completedAgents) {
    if (!agentMetrics[agentName]) {
      const agentData = sessionData.metrics.agents[agentName];
      if (agentData) {
        agentMetrics[agentName] = {
          durationMs: agentData.final_duration_ms,
          costUsd: agentData.total_cost_usd,
        };
      }
    }
  }

  const cumulativeSummary: WorkflowSummary = {
    ...summary,
    totalDurationMs: sessionData.metrics.total_duration_ms,
    totalCostUsd: sessionData.metrics.total_cost_usd,
    agentMetrics,
  };
  await auditSession.logWorkflowComplete(cumulativeSummary);

  // Copy deliverables to audit-logs
  try {
    await copyDeliverablesToAudit(sessionMetadata, repoPath);
  } catch (copyErr) {
    console.error('Failed to copy deliverables to audit-logs:', copyErr);
  }

  // Clean up container
  removeContainer(workflowId);
}
