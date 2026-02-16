// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal activities for Shannon agent execution.
 *
 * Each activity wraps a single agent execution with:
 * - Heartbeat loop (2s interval) to signal worker liveness
 * - Git checkpoint/rollback/commit per attempt
 * - Error classification for Temporal retry behavior
 * - Audit session logging
 *
 * Temporal handles retries based on error classification:
 * - Retryable: BillingError, TransientError (429, 5xx, network)
 * - Non-retryable: AuthenticationError, PermissionError, ConfigurationError, etc.
 */

import { heartbeat, ApplicationFailure, Context } from '@temporalio/activity';
import chalk from 'chalk';

// Max lengths to prevent Temporal protobuf buffer overflow
const MAX_ERROR_MESSAGE_LENGTH = 2000;
const MAX_STACK_TRACE_LENGTH = 1000;

// Max retries for output validation errors (agent didn't save deliverables)
// Lower than default 50 since this is unlikely to self-heal
const MAX_OUTPUT_VALIDATION_RETRIES = 3;

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

import {
  runClaudePrompt,
  validateAgentOutput,
  type ClaudePromptResult,
} from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import { parseConfig, distributeConfig } from '../config-parser.js';
import { classifyErrorForTemporal } from '../error-handling.js';
import {
  safeValidateQueueAndDeliverable,
  type VulnType,
  type ExploitationDecision,
} from '../queue-validation.js';
import {
  createGitCheckpoint,
  commitGitSuccess,
  rollbackGitWorkspace,
  getGitCommitHash,
} from '../utils/git-manager.js';
import { assembleFinalReport, injectModelIntoReport } from '../phases/reporting.js';
import { getPromptNameForAgent } from '../types/agents.js';
import { AuditSession } from '../audit/index.js';
import type { WorkflowSummary } from '../audit/workflow-logger.js';
import type { AgentName } from '../types/agents.js';
import { getDeliverablePath, ALL_AGENTS } from '../types/agents.js';
import type { AgentMetrics, ResumeState } from './shared.js';
import type { DistributedConfig } from '../types/config.js';
import { copyDeliverablesToAudit, type SessionMetadata, readJson, fileExists } from '../audit/utils.js';
import type { ResumeAttempt } from '../audit/metrics-tracker.js';
import { executeGitCommandWithRetry } from '../utils/git-manager.js';
import path from 'path';
import fs from 'fs/promises';

const HEARTBEAT_INTERVAL_MS = 2000; // Must be < heartbeatTimeout (10min production, 5min testing)

/**
 * Input for all agent activities.
 * Matches PipelineInput but with required workflowId for audit correlation.
 */
export interface ActivityInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId: string;
  sessionId: string; // Workspace name (for resume) or workflowId (for new runs)
}

/**
 * Core activity implementation.
 *
 * Executes a single agent with:
 * 1. Heartbeat loop for worker liveness
 * 2. Config loading (if configPath provided)
 * 3. Audit session initialization
 * 4. Prompt loading
 * 5. Git checkpoint before execution
 * 6. Agent execution (single attempt)
 * 7. Output validation
 * 8. Git commit on success, rollback on failure
 * 9. Error classification for Temporal retry
 */
async function runAgentActivity(
  agentName: AgentName,
  input: ActivityInput
): Promise<AgentMetrics> {
  const {
    webUrl,
    repoPath,
    configPath,
    outputPath,
    pipelineTestingMode = false,
    workflowId,
  } = input;

  const startTime = Date.now();

  // Get attempt number from Temporal context (tracks retries automatically)
  const attemptNumber = Context.current().info.attempt;

  // Heartbeat loop - signals worker is alive to Temporal server
  const heartbeatInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    heartbeat({ agent: agentName, elapsedSeconds: elapsed, attempt: attemptNumber });
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // 1. Load config (if provided)
    let distributedConfig: DistributedConfig | null = null;
    if (configPath) {
      try {
        const config = await parseConfig(configPath);
        distributedConfig = distributeConfig(config);
      } catch (err) {
        throw new Error(`Failed to load config ${configPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 2. Build session metadata for audit
    // Use sessionId (workspace name) for directory, workflowId for tracking
    const sessionMetadata: SessionMetadata = {
      id: input.sessionId,
      webUrl,
      repoPath,
      ...(outputPath && { outputPath }),
    };

    // 3. Initialize audit session (idempotent, safe across retries)
    const auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize(workflowId);

    // 4. Load prompt
    const promptName = getPromptNameForAgent(agentName);
    const prompt = await loadPrompt(
      promptName,
      { webUrl, repoPath },
      distributedConfig,
      pipelineTestingMode
    );

    // 5. Create git checkpoint before execution
    await createGitCheckpoint(repoPath, agentName, attemptNumber);
    await auditSession.startAgent(agentName, prompt, attemptNumber);

    // 6. Execute agent (single attempt - Temporal handles retries)
    const result: ClaudePromptResult = await runClaudePrompt(
      prompt,
      repoPath,
      '', // context
      agentName, // description
      agentName,
      chalk.cyan,
      auditSession
    );

    // 6.5. Sanity check: Detect spending cap that slipped through all detection layers
    // Defense-in-depth: A successful agent execution should never have ≤2 turns with $0 cost
    if (result.success && (result.turns ?? 0) <= 2 && (result.cost || 0) === 0) {
      const resultText = result.result || '';
      const looksLikeBillingError = /spending|cap|limit|budget|resets/i.test(resultText);

      if (looksLikeBillingError) {
        await rollbackGitWorkspace(repoPath, 'spending cap detected');
        await auditSession.endAgent(agentName, {
          attemptNumber,
          duration_ms: result.duration,
          cost_usd: 0,
          success: false,
          model: result.model,
          error: `Spending cap likely reached: ${resultText.slice(0, 100)}`,
        });
        // Throw as billing error so Temporal retries with long backoff
        throw new Error(`Spending cap likely reached: ${resultText.slice(0, 100)}`);
      }
    }

    // 7. Handle execution failure
    if (!result.success) {
      await rollbackGitWorkspace(repoPath, 'execution failure');
      await auditSession.endAgent(agentName, {
        attemptNumber,
        duration_ms: result.duration,
        cost_usd: result.cost || 0,
        success: false,
        model: result.model,
        error: result.error || 'Execution failed',
      });
      throw new Error(result.error || 'Agent execution failed');
    }

    // 8. Validate output
    const validationPassed = await validateAgentOutput(result, agentName, repoPath);
    if (!validationPassed) {
      await rollbackGitWorkspace(repoPath, 'validation failure');
      await auditSession.endAgent(agentName, {
        attemptNumber,
        duration_ms: result.duration,
        cost_usd: result.cost || 0,
        success: false,
        model: result.model,
        error: 'Output validation failed',
      });

      // Limit output validation retries (unlikely to self-heal)
      if (attemptNumber >= MAX_OUTPUT_VALIDATION_RETRIES) {
        throw ApplicationFailure.nonRetryable(
          `Agent ${agentName} failed output validation after ${attemptNumber} attempts`,
          'OutputValidationError',
          [{ agentName, attemptNumber, elapsed: Date.now() - startTime }]
        );
      }
      // Let Temporal retry (will be classified as OutputValidationError)
      throw new Error(`Agent ${agentName} failed output validation`);
    }

    // 9. Success - commit deliverables, then capture checkpoint hash
    await commitGitSuccess(repoPath, agentName);
    const commitHash = await getGitCommitHash(repoPath);
    await auditSession.endAgent(agentName, {
      attemptNumber,
      duration_ms: result.duration,
      cost_usd: result.cost || 0,
      success: true,
      model: result.model,
      ...(commitHash && { checkpoint: commitHash }),
    });

    // 10. Return metrics
    return {
      durationMs: Date.now() - startTime,
      inputTokens: null, // Not currently exposed by SDK wrapper
      outputTokens: null,
      costUsd: result.cost ?? null,
      numTurns: result.turns ?? null,
      model: result.model,
    };
  } catch (error) {
    // Rollback git workspace before Temporal retry to ensure clean state
    try {
      await rollbackGitWorkspace(repoPath, 'error recovery');
    } catch (rollbackErr) {
      // Log but don't fail - rollback is best-effort
      console.error(`Failed to rollback git workspace for ${agentName}:`, rollbackErr);
    }

    // If error is already an ApplicationFailure (e.g., from our retry limit logic),
    // re-throw it directly without re-classifying
    if (error instanceof ApplicationFailure) {
      throw error;
    }

    // Classify error for Temporal retry behavior
    const classified = classifyErrorForTemporal(error);
    // Truncate message to prevent protobuf buffer overflow
    const rawMessage = error instanceof Error ? error.message : String(error);
    const message = truncateErrorMessage(rawMessage);

    if (classified.retryable) {
      // Temporal will retry with configured backoff
      const failure = ApplicationFailure.create({
        message,
        type: classified.type,
        details: [{ agentName, attemptNumber, elapsed: Date.now() - startTime }],
      });
      truncateStackTrace(failure);
      throw failure;
    } else {
      // Fail immediately - no retry
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
// Each function is a thin wrapper around runAgentActivity with the agent name.

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

/**
 * Assemble the final report by concatenating exploitation evidence files.
 * This must be called BEFORE runReportAgent to create the file that the report agent will modify.
 */
export async function assembleReportActivity(input: ActivityInput): Promise<void> {
  const { repoPath } = input;
  console.log(chalk.blue('📝 Assembling deliverables from specialist agents...'));
  try {
    await assembleFinalReport(repoPath);
  } catch (error) {
    const err = error as Error;
    console.log(chalk.yellow(`⚠️ Error assembling final report: ${err.message}`));
    // Don't throw - the report agent can still create content even if no exploitation files exist
  }
}

/**
 * Inject model metadata into the final report.
 * This must be called AFTER runReportAgent to add the model information to the Executive Summary.
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
    console.log(chalk.yellow(`⚠️ Error injecting model into report: ${err.message}`));
    // Don't throw - this is a non-critical enhancement
  }
}

/**
 * Check if exploitation should run for a given vulnerability type.
 * Reads the vulnerability queue file and returns the decision.
 *
 * This activity allows the workflow to skip exploit agents entirely
 * when no vulnerabilities were found, saving API calls and time.
 *
 * Error handling:
 * - Retryable errors (missing files, invalid JSON): re-throw for Temporal retry
 * - Non-retryable errors: skip exploitation gracefully
 */
export async function checkExploitationQueue(
  input: ActivityInput,
  vulnType: VulnType
): Promise<ExploitationDecision> {
  const { repoPath } = input;

  const result = await safeValidateQueueAndDeliverable(vulnType, repoPath);

  if (result.success && result.data) {
    const { shouldExploit, vulnerabilityCount } = result.data;
    console.log(
      chalk.blue(
        `🔍 ${vulnType}: ${shouldExploit ? `${vulnerabilityCount} vulnerabilities found` : 'no vulnerabilities, skipping exploitation'}`
      )
    );
    return result.data;
  }

  // Validation failed - check if we should retry or skip
  const error = result.error;
  if (error?.retryable) {
    // Re-throw retryable errors so Temporal can retry the vuln agent
    console.log(chalk.yellow(`⚠️ ${vulnType}: ${error.message} (retrying)`));
    throw error;
  }

  // Non-retryable error - skip exploitation gracefully
  console.log(
    chalk.yellow(`⚠️ ${vulnType}: ${error?.message ?? 'Unknown error'}, skipping exploitation`)
  );
  return {
    shouldExploit: false,
    shouldRetry: false,
    vulnerabilityCount: 0,
    vulnType,
  };
}

// === Resume Activities ===

/**
 * Session.json structure for resume state loading
 */
interface SessionJson {
  session: {
    id: string;
    webUrl: string;
    repoPath?: string;
    originalWorkflowId?: string;
    resumeAttempts?: ResumeAttempt[];
  };
  metrics: {
    agents: Record<string, {
      status: 'in-progress' | 'success' | 'failed';
      checkpoint?: string;
    }>;
  };
}

/**
 * Load resume state from an existing workspace.
 * Validates workspace exists, URL matches, and determines which agents to skip.
 *
 * @throws ApplicationFailure.nonRetryable if workspace not found or URL mismatch
 */
export async function loadResumeState(
  workspaceName: string,
  expectedUrl: string,
  expectedRepoPath: string
): Promise<ResumeState> {
  const sessionPath = path.join('./audit-logs', workspaceName, 'session.json');

  // Validate workspace exists
  const exists = await fileExists(sessionPath);
  if (!exists) {
    throw ApplicationFailure.nonRetryable(
      `Workspace not found: ${workspaceName}\nExpected path: ${sessionPath}`,
      'WorkspaceNotFoundError'
    );
  }

  // Load session.json
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

  // Validate URL matches
  if (session.session.webUrl !== expectedUrl) {
    throw ApplicationFailure.nonRetryable(
      `URL mismatch with workspace\n  Workspace URL: ${session.session.webUrl}\n  Provided URL:  ${expectedUrl}`,
      'URLMismatchError'
    );
  }

  // Find completed agents (status === 'success' AND deliverable exists)
  const completedAgents: string[] = [];
  const agents = session.metrics.agents;

  for (const agentName of ALL_AGENTS) {
    const agentData = agents[agentName];

    // Skip if agent never ran or didn't succeed
    if (!agentData || agentData.status !== 'success') {
      continue;
    }

    // Validate deliverable exists
    const deliverablePath = getDeliverablePath(agentName, expectedRepoPath);
    const deliverableExists = await fileExists(deliverablePath);

    if (!deliverableExists) {
      console.log(
        chalk.yellow(`Agent ${agentName} shows success but deliverable missing, will re-run`)
      );
      continue;
    }

    // Agent completed successfully and deliverable exists
    completedAgents.push(agentName);
  }

  // Find latest checkpoint from completed agents
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

  // Find most recent commit among checkpoints
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

/**
 * Find the most recent commit among a list of commit hashes.
 * Uses git rev-list to determine which commit is newest.
 */
async function findLatestCommit(repoPath: string, commitHashes: string[]): Promise<string> {
  if (commitHashes.length === 1) {
    const hash = commitHashes[0];
    if (!hash) {
      throw new Error('Empty commit hash in array');
    }
    return hash;
  }

  // Use git rev-list to find the most recent commit among all hashes
  const result = await executeGitCommandWithRetry(
    ['git', 'rev-list', '--max-count=1', ...commitHashes],
    repoPath,
    'find latest commit'
  );

  return result.stdout.trim();
}

/**
 * Restore git workspace to a checkpoint and clean up partial deliverables.
 *
 * @param repoPath - Repository path
 * @param checkpointHash - Git commit hash to reset to
 * @param incompleteAgents - Agents that didn't complete (will have deliverables cleaned up)
 */
export async function restoreGitCheckpoint(
  repoPath: string,
  checkpointHash: string,
  incompleteAgents: AgentName[]
): Promise<void> {
  console.log(chalk.blue(`Restoring git workspace to ${checkpointHash}...`));

  // Checkpoint hash points to the success commit (after commitGitSuccess),
  // so git reset --hard naturally preserves all completed agent deliverables.
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

  // Clean up any partial deliverables from incomplete agents
  for (const agentName of incompleteAgents) {
    const deliverablePath = getDeliverablePath(agentName, repoPath);
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
 * Tracks the new workflow ID, terminated workflows, and checkpoint hash.
 */
export async function recordResumeAttempt(
  input: ActivityInput,
  terminatedWorkflows: string[],
  checkpointHash: string
): Promise<void> {
  const { webUrl, repoPath, outputPath, sessionId, workflowId } = input;

  const sessionMetadata: SessionMetadata = {
    id: sessionId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize();

  await auditSession.addResumeAttempt(workflowId, terminatedWorkflows, checkpointHash);
}

/**
 * Log phase transition to the unified workflow log.
 * Called at phase boundaries for per-workflow logging.
 */
export async function logPhaseTransition(
  input: ActivityInput,
  phase: string,
  event: 'start' | 'complete'
): Promise<void> {
  const { webUrl, repoPath, outputPath, sessionId, workflowId } = input;

  const sessionMetadata: SessionMetadata = {
    id: sessionId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize(workflowId);

  if (event === 'start') {
    await auditSession.logPhaseStart(phase);
  } else {
    await auditSession.logPhaseComplete(phase);
  }
}

/**
 * Log workflow completion with full summary to the unified workflow log.
 * Called at the end of the workflow to write a summary breakdown.
 */
export async function logWorkflowComplete(
  input: ActivityInput,
  summary: WorkflowSummary
): Promise<void> {
  const { webUrl, repoPath, outputPath, sessionId, workflowId } = input;

  const sessionMetadata: SessionMetadata = {
    id: sessionId,
    webUrl,
    repoPath,
    ...(outputPath && { outputPath }),
  };

  const auditSession = new AuditSession(sessionMetadata);
  await auditSession.initialize(workflowId);
  await auditSession.updateSessionStatus(summary.status);

  // Use cumulative metrics from session.json (includes all resume attempts)
  const sessionData = await auditSession.getMetrics() as {
    metrics: {
      total_duration_ms: number;
      total_cost_usd: number;
      agents: Record<string, { final_duration_ms: number; total_cost_usd: number }>;
    };
  };

  // Fill in metrics for skipped agents (completed in previous runs)
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

  // Copy all deliverables to audit-logs once at workflow end (non-fatal)
  try {
    await copyDeliverablesToAudit(sessionMetadata, repoPath);
  } catch (copyErr) {
    console.error('Failed to copy deliverables to audit-logs:', copyErr);
  }
}
