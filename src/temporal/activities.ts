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

import {
  runClaudePrompt,
  validateAgentOutput,
  type ClaudePromptResult,
} from '../ai/claude-executor.js';
import { loadPrompt } from '../prompts/prompt-manager.js';
import { parseConfig, distributeConfig } from '../config-parser.js';
import { classifyErrorForTemporal } from '../error-handling.js';
import {
  createGitCheckpoint,
  commitGitSuccess,
  rollbackGitWorkspace,
  getGitCommitHash,
} from '../utils/git-manager.js';
import { getPromptNameForAgent } from '../types/agents.js';
import { AuditSession } from '../audit/index.js';
import type { AgentName } from '../types/agents.js';
import type { AgentMetrics } from './shared.js';
import type { DistributedConfig } from '../types/config.js';
import type { SessionMetadata } from '../audit/utils.js';

const HEARTBEAT_INTERVAL_MS = 2000; // Must be < heartbeatTimeout (30s)

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
    const sessionMetadata: SessionMetadata = {
      id: workflowId,
      webUrl,
      repoPath,
      ...(outputPath && { outputPath }),
    };

    // 3. Initialize audit session (idempotent, safe across retries)
    const auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();

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
      sessionMetadata,
      auditSession,
      attemptNumber
    );

    // 7. Handle execution failure
    if (!result.success) {
      await rollbackGitWorkspace(repoPath, 'execution failure');
      await auditSession.endAgent(agentName, {
        attemptNumber,
        duration_ms: result.duration,
        cost_usd: result.cost || 0,
        success: false,
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
        error: 'Output validation failed',
      });
      throw new Error(`Agent ${agentName} failed output validation`);
    }

    // 9. Success - commit and log
    const commitHash = await getGitCommitHash(repoPath);
    await auditSession.endAgent(agentName, {
      attemptNumber,
      duration_ms: result.duration,
      cost_usd: result.cost || 0,
      success: true,
      ...(commitHash && { checkpoint: commitHash }),
    });
    await commitGitSuccess(repoPath, agentName);

    // 10. Return metrics
    return {
      durationMs: Date.now() - startTime,
      inputTokens: null, // Not currently exposed by SDK wrapper
      outputTokens: null,
      costUsd: result.cost ?? null,
      numTurns: result.turns ?? null,
    };
  } catch (error) {
    // Rollback git workspace before Temporal retry to ensure clean state
    try {
      await rollbackGitWorkspace(repoPath, 'error recovery');
    } catch (rollbackErr) {
      // Log but don't fail - rollback is best-effort
      console.error(`Failed to rollback git workspace for ${agentName}:`, rollbackErr);
    }

    // Classify error for Temporal retry behavior
    const classified = classifyErrorForTemporal(error);
    const message = error instanceof Error ? error.message : String(error);

    if (classified.retryable) {
      // Temporal will retry with configured backoff
      throw ApplicationFailure.create({
        message,
        type: classified.type,
        details: [{ agentName, attemptNumber, elapsed: Date.now() - startTime }],
      });
    } else {
      // Fail immediately - no retry
      throw ApplicationFailure.nonRetryable(message, classified.type, [
        { agentName, attemptNumber, elapsed: Date.now() - startTime },
      ]);
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
