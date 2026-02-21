// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Agent Execution Service
 *
 * Handles the full agent lifecycle:
 * - Load config via ConfigLoaderService
 * - Load prompt template using AGENTS[agentName].promptTemplate
 * - Create git checkpoint
 * - Start audit logging
 * - Invoke Claude SDK via runClaudePrompt
 * - Spending cap check using isSpendingCapBehavior
 * - Handle failure (rollback, audit)
 * - Validate output using AGENTS[agentName].deliverableFilename
 * - Commit on success, log metrics
 *
 * No Temporal dependencies - pure domain logic.
 */

import type { ActivityLogger } from '../types/activity-logger.js';
import { Result, ok, err, isErr } from '../types/result.js';
import { ErrorCode, type PentestErrorType } from '../types/errors.js';
import { PentestError } from './error-handling.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { AGENTS, getPromptTemplate } from '../session-manager.js';
import { loadPrompt } from './prompt-manager.js';
import {
  runClaudePrompt,
  validateAgentOutput,
  type ClaudePromptResult,
} from '../ai/claude-executor.js';
import {
  createGitCheckpoint,
  commitGitSuccess,
  rollbackGitWorkspace,
  getGitCommitHash,
} from './git-manager.js';
import { AuditSession } from '../audit/index.js';
import type { AgentEndResult } from '../types/audit.js';
import type { AgentName } from '../types/agents.js';
import type { ConfigLoaderService } from './config-loader.js';
import type { AgentMetrics } from '../types/metrics.js';

/**
 * Input for agent execution.
 */
export interface AgentExecutionInput {
  webUrl: string;
  repoPath: string;
  configPath?: string | undefined;
  pipelineTestingMode?: boolean | undefined;
  isBlackbox?: boolean | undefined;
  attemptNumber: number;
}

interface FailAgentOpts {
  attemptNumber: number;
  result: ClaudePromptResult;
  rollbackReason: string;
  errorMessage: string;
  errorCode: ErrorCode;
  category: PentestErrorType;
  retryable: boolean;
  context: Record<string, unknown>;
}

/**
 * Service for executing agents with full lifecycle management.
 *
 * NOTE: AuditSession is passed per-execution, NOT stored on the service.
 * This is critical for parallel agent execution - each agent needs its own
 * AuditSession instance because AuditSession uses instance state (currentAgentName)
 * to track which agent is currently logging.
 */
export class AgentExecutionService {
  private readonly configLoader: ConfigLoaderService;

  constructor(configLoader: ConfigLoaderService) {
    this.configLoader = configLoader;
  }

  /**
   * Execute an agent with full lifecycle management.
   *
   * @param agentName - Name of the agent to execute
   * @param input - Execution input parameters
   * @param auditSession - Audit session for this specific agent execution
   * @returns Result containing AgentEndResult on success, PentestError on failure
   */
  async execute(
    agentName: AgentName,
    input: AgentExecutionInput,
    auditSession: AuditSession,
    logger: ActivityLogger
  ): Promise<Result<AgentEndResult, PentestError>> {
    const { webUrl, repoPath, configPath, pipelineTestingMode = false, isBlackbox = false, attemptNumber } = input;

    // 1. Load config (if provided)
    const configResult = await this.configLoader.loadOptional(configPath);
    if (isErr(configResult)) {
      return configResult;
    }
    const distributedConfig = configResult.value;

    // 2. Load prompt (selects blackbox variant when in blackbox mode)
    const promptTemplate = getPromptTemplate(agentName, isBlackbox);
    let prompt: string;
    try {
      prompt = await loadPrompt(
        promptTemplate,
        { webUrl, repoPath },
        distributedConfig,
        pipelineTestingMode,
        logger
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return err(
        new PentestError(
          `Failed to load prompt for ${agentName}: ${errorMessage}`,
          'prompt',
          false,
          { agentName, promptTemplate, originalError: errorMessage },
          ErrorCode.PROMPT_LOAD_FAILED
        )
      );
    }

    // 3. Create git checkpoint before execution
    try {
      await createGitCheckpoint(repoPath, agentName, attemptNumber, logger);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return err(
        new PentestError(
          `Failed to create git checkpoint for ${agentName}: ${errorMessage}`,
          'filesystem',
          false,
          { agentName, repoPath, originalError: errorMessage },
          ErrorCode.GIT_CHECKPOINT_FAILED
        )
      );
    }

    // 4. Start audit logging
    await auditSession.startAgent(agentName, prompt, attemptNumber);

    // 5. Execute agent
    const result: ClaudePromptResult = await runClaudePrompt(
      prompt,
      repoPath,
      '', // context
      agentName, // description
      agentName,
      auditSession,
      logger
    );

    // 6. Spending cap check - defense-in-depth
    if (result.success && (result.turns ?? 0) <= 2 && (result.cost || 0) === 0) {
      const resultText = result.result || '';
      if (isSpendingCapBehavior(result.turns ?? 0, result.cost || 0, resultText)) {
        return this.failAgent(agentName, repoPath, auditSession, logger, {
          attemptNumber, result,
          rollbackReason: 'spending cap detected',
          errorMessage: `Spending cap likely reached: ${resultText.slice(0, 100)}`,
          errorCode: ErrorCode.SPENDING_CAP_REACHED,
          category: 'billing',
          retryable: true,
          context: { agentName, turns: result.turns, cost: result.cost },
        });
      }
    }

    // 7. Handle execution failure
    if (!result.success) {
      return this.failAgent(agentName, repoPath, auditSession, logger, {
        attemptNumber, result,
        rollbackReason: 'execution failure',
        errorMessage: result.error || 'Agent execution failed',
        errorCode: ErrorCode.AGENT_EXECUTION_FAILED,
        category: 'validation',
        retryable: result.retryable ?? true,
        context: { agentName, originalError: result.error },
      });
    }

    // 8. Validate output
    const validationPassed = await validateAgentOutput(result, agentName, repoPath, logger);
    if (!validationPassed) {
      return this.failAgent(agentName, repoPath, auditSession, logger, {
        attemptNumber, result,
        rollbackReason: 'validation failure',
        errorMessage: `Agent ${agentName} failed output validation`,
        errorCode: ErrorCode.OUTPUT_VALIDATION_FAILED,
        category: 'validation',
        retryable: true,
        context: { agentName, deliverableFilename: AGENTS[agentName].deliverableFilename },
      });
    }

    // 9. Success - commit deliverables, then capture checkpoint hash
    await commitGitSuccess(repoPath, agentName, logger);
    const commitHash = await getGitCommitHash(repoPath);

    const endResult: AgentEndResult = {
      attemptNumber,
      duration_ms: result.duration,
      cost_usd: result.cost || 0,
      success: true,
      model: result.model,
      ...(commitHash && { checkpoint: commitHash }),
    };
    await auditSession.endAgent(agentName, endResult);

    return ok(endResult);
  }

  private async failAgent(
    agentName: AgentName,
    repoPath: string,
    auditSession: AuditSession,
    logger: ActivityLogger,
    opts: FailAgentOpts
  ): Promise<Result<AgentEndResult, PentestError>> {
    await rollbackGitWorkspace(repoPath, opts.rollbackReason, logger);

    const endResult: AgentEndResult = {
      attemptNumber: opts.attemptNumber,
      duration_ms: opts.result.duration,
      cost_usd: opts.result.cost || 0,
      success: false,
      model: opts.result.model,
      error: opts.errorMessage,
    };
    await auditSession.endAgent(agentName, endResult);

    return err(
      new PentestError(
        opts.errorMessage,
        opts.category,
        opts.retryable,
        opts.context,
        opts.errorCode
      )
    );
  }

  /**
   * Execute an agent, throwing PentestError on failure.
   *
   * This is the preferred method for Temporal activities, which need to
   * catch errors and classify them into ApplicationFailure. Avoids requiring
   * activities to import Result utilities, keeping the boundary clean.
   *
   * @param agentName - Name of the agent to execute
   * @param input - Execution input parameters
   * @param auditSession - Audit session for this specific agent execution
   * @returns AgentEndResult on success
   * @throws PentestError on failure
   */
  async executeOrThrow(
    agentName: AgentName,
    input: AgentExecutionInput,
    auditSession: AuditSession,
    logger: ActivityLogger
  ): Promise<AgentEndResult> {
    const result = await this.execute(agentName, input, auditSession, logger);
    if (isErr(result)) {
      throw result.error;
    }
    return result.value;
  }

  /**
   * Convert AgentEndResult to AgentMetrics for workflow state.
   */
  static toMetrics(endResult: AgentEndResult, result: ClaudePromptResult): AgentMetrics {
    return {
      durationMs: endResult.duration_ms,
      inputTokens: null, // Not currently exposed by SDK wrapper
      outputTokens: null,
      costUsd: endResult.cost_usd,
      numTurns: result.turns ?? null,
      model: result.model,
    };
  }
}
