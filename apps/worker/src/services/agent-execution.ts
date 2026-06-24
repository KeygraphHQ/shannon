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
 * - Render the deliverable to disk via the writeDeliverable hook (if provided)
 * - Commit on success, log metrics
 *
 * No Temporal dependencies - pure domain logic.
 */

import { fs, path } from 'zx';
import { type ClaudePromptResult, validateAgentOutput } from '../ai/claude-executor.js';
import { augmentPromptForStructuredOutput, readStructuredOutputFromDisk } from '../ai/kiro-cli-executor.js';
import { getOutputFormat, getQueueFilename } from '../ai/queue-schemas.js';
import type { AuditSession } from '../audit/index.js';
import { authStateFile } from '../audit/utils.js';
import type { Executor } from '../interfaces/executor.js';
import { AGENTS, PLAYWRIGHT_SESSION_MAPPING } from '../session-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentName } from '../types/agents.js';
import type { AgentEndResult } from '../types/audit.js';
import { ErrorCode, type PentestErrorType } from '../types/errors.js';
import type { AgentMetrics } from '../types/metrics.js';
import { err, isErr, ok, type Result } from '../types/result.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import type { ConfigLoaderService } from './config-loader.js';
import { PentestError } from './error-handling.js';
import { commitGitSuccess, createGitCheckpoint, getGitCommitHash, rollbackGitWorkspace } from './git-manager.js';
import { loadPrompt } from './prompt-manager.js';

/**
 * Input for agent execution.
 */
export interface AgentExecutionInput {
  webUrl: string;
  repoPath: string;
  deliverablesPath: string;
  configPath?: string | undefined;
  configData?: import('../types/config.js').DistributedConfig | undefined;
  configYAML?: string | undefined;
  pipelineTestingMode?: boolean | undefined;
  attemptNumber: number;
  apiKey?: string | undefined;
  promptDir?: string | undefined;
  providerConfig?: import('../types/config.js').ProviderConfig | undefined;
  /** Callback to signal liveness to the orchestrator (e.g., Temporal heartbeat). */
  onHeartbeat?: ((details: Record<string, unknown>) => void) | undefined;
  mcpServers?: Record<string, import('@anthropic-ai/claude-agent-sdk').McpServerConfig>;
  // Renders the deliverable to disk; invoked after validation, before the success commit.
  writeDeliverable?: (deliverablesPath: string) => Promise<void>;
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
  private readonly executor: Executor;

  constructor(configLoader: ConfigLoaderService, executor: Executor) {
    this.configLoader = configLoader;
    this.executor = executor;
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
    logger: ActivityLogger,
  ): Promise<Result<AgentEndResult, PentestError>> {
    const {
      webUrl,
      repoPath,
      deliverablesPath,
      configPath,
      configData,
      configYAML,
      pipelineTestingMode = false,
      attemptNumber,
      apiKey,
      promptDir,
      providerConfig,
      mcpServers,
      writeDeliverable,
    } = input;

    // 1. Load config (pre-parsed configData → raw YAML → file path)
    const configResult = await this.configLoader.loadOptional(configPath, configData, configYAML);
    if (isErr(configResult)) {
      return configResult;
    }
    const distributedConfig = configResult.value;

    // 2. Load prompt
    const promptTemplate = AGENTS[agentName].promptTemplate;
    let prompt: string;
    try {
      prompt = await loadPrompt(
        promptTemplate,
        { webUrl, repoPath, AUTH_STATE_FILE: authStateFile(auditSession.sessionMetadata) },
        distributedConfig,
        pipelineTestingMode,
        logger,
        promptDir,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return err(
        new PentestError(
          `Failed to load prompt for ${agentName}: ${errorMessage}`,
          'prompt',
          false,
          { agentName, promptTemplate, originalError: errorMessage },
          ErrorCode.PROMPT_LOAD_FAILED,
        ),
      );
    }

    // 3. Create git checkpoint before execution
    try {
      await createGitCheckpoint(deliverablesPath, agentName, attemptNumber, logger);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return err(
        new PentestError(
          `Failed to create git checkpoint for ${agentName}: ${errorMessage}`,
          'filesystem',
          false,
          { agentName, deliverablesPath, originalError: errorMessage },
          ErrorCode.GIT_CHECKPOINT_FAILED,
        ),
      );
    }

    // 4. Start audit logging
    await auditSession.startAgent(agentName, prompt, attemptNumber);

    // 5. Execute agent
    const outputFormat = getOutputFormat(agentName, distributedConfig?.exploit ?? true);
    const queueFilename = getQueueFilename(agentName);

    // Augment prompt with queue-writing instructions for vuln agents.
    // Claude SDK uses native JsonSchemaOutputFormat; kiro-cli needs explicit file-write instructions.
    // The extra text is harmless for the SDK path since structured output takes precedence.
    let executionPrompt = prompt;
    if (queueFilename && outputFormat) {
      executionPrompt = augmentPromptForStructuredOutput(
        prompt,
        queueFilename,
        path.relative(repoPath, deliverablesPath),
        outputFormat.schema,
      );
    }

    const result: ClaudePromptResult = await this.executor.execute(
      executionPrompt,
      repoPath,
      agentName,
      AGENTS[agentName].modelTier ?? 'medium',
      logger,
      {
        context: '',
        description: agentName,
        auditSession,
        outputFormat,
        ...(apiKey ? { apiKey } : {}),
        deliverablesSubdir: path.relative(repoPath, deliverablesPath),
        ...(providerConfig ? { providerConfig } : {}),
        ...(queueFilename ? { queueFilename } : {}),
        ...(mcpServers ? { mcpServers } : {}),
        ...(process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH
          ? {
            playwrightExecutablePath: process.env.PLAYWRIGHT_MCP_EXECUTABLE_PATH,
            playwrightOutputDir: path.join(repoPath, '.shannon', '.playwright-cli'),
            playwrightSession: PLAYWRIGHT_SESSION_MAPPING[AGENTS[agentName].promptTemplate],
          }
          : {}),
        ...(input.onHeartbeat ? { onHeartbeat: input.onHeartbeat } : {}),
      },
    );

    // 6. Spending cap check - defense-in-depth
    if (result.success && (result.turns ?? 0) <= 2 && (result.cost || 0) === 0) {
      const resultText = result.result || '';
      if (isSpendingCapBehavior(result.turns ?? 0, result.cost || 0, resultText)) {
        return this.failAgent(agentName, deliverablesPath, auditSession, logger, {
          attemptNumber,
          result,
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
      return this.failAgent(agentName, deliverablesPath, auditSession, logger, {
        attemptNumber,
        result,
        rollbackReason: 'execution failure',
        errorMessage: result.error || 'Agent execution failed',
        errorCode: ErrorCode.AGENT_EXECUTION_FAILED,
        category: 'validation',
        retryable: result.retryable ?? true,
        context: { agentName, originalError: result.error },
      });
    }

    // 8. Write structured output to disk (vuln agents only)
    if (result.structuredOutput !== undefined && queueFilename) {
      await fs.ensureDir(deliverablesPath);
      const queuePath = path.join(deliverablesPath, queueFilename);
      await fs.writeFile(queuePath, JSON.stringify(result.structuredOutput, null, 2), 'utf8');
      logger.info(`Wrote structured output queue to ${queueFilename}`);
    } else if (result.structuredOutput === undefined && queueFilename) {
      // kiro-cli backend: agent writes queue JSON to disk directly via prompt instructions.
      // Read it back so downstream validation sees it.
      const diskOutput = await readStructuredOutputFromDisk(deliverablesPath, queueFilename);
      if (diskOutput !== undefined) {
        logger.info(`Read structured output queue from disk: ${queueFilename}`);
      }
    }

    // 9. Validate output
    const validationPassed = await validateAgentOutput(result, agentName, deliverablesPath, logger);
    if (!validationPassed) {
      return this.failAgent(agentName, deliverablesPath, auditSession, logger, {
        attemptNumber,
        result,
        rollbackReason: 'validation failure',
        errorMessage: `Agent ${agentName} failed output validation`,
        errorCode: ErrorCode.OUTPUT_VALIDATION_FAILED,
        category: 'validation',
        retryable: true,
        context: { agentName, deliverableFilename: AGENTS[agentName].deliverableFilename },
      });
    }

    // 10. Render the deliverable to disk so the success commit below stages it
    if (writeDeliverable) {
      await writeDeliverable(deliverablesPath);
    }

    // 11. Success - commit deliverables, then capture checkpoint hash
    await commitGitSuccess(deliverablesPath, agentName, logger);
    const commitHash = await getGitCommitHash(deliverablesPath);

    const endResult: AgentEndResult = {
      attemptNumber,
      duration_ms: result.duration,
      cost_usd: result.cost || 0,
      success: true,
      model: result.model,
      ...(commitHash && { checkpoint: commitHash }),
      ...(result.toolUsage ? { toolUsage: result.toolUsage } : {}),
      ...(result.toolInvocations ? { toolInvocations: result.toolInvocations } : {}),
    };
    await auditSession.endAgent(agentName, endResult);

    return ok(endResult);
  }

  private async failAgent(
    agentName: AgentName,
    deliverablesPath: string,
    auditSession: AuditSession,
    logger: ActivityLogger,
    opts: FailAgentOpts,
  ): Promise<Result<AgentEndResult, PentestError>> {
    await rollbackGitWorkspace(deliverablesPath, opts.rollbackReason, logger);

    const endResult: AgentEndResult = {
      attemptNumber: opts.attemptNumber,
      duration_ms: opts.result.duration,
      cost_usd: opts.result.cost || 0,
      success: false,
      model: opts.result.model,
      error: opts.errorMessage,
    };
    await auditSession.endAgent(agentName, endResult);

    return err(new PentestError(opts.errorMessage, opts.category, opts.retryable, opts.context, opts.errorCode));
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
    logger: ActivityLogger,
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
