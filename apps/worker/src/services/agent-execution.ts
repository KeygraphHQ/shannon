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
 * - Invoke the pi agent via runPiPrompt
 * - Spending cap check using isSpendingCapBehavior
 * - Handle failure (rollback, audit)
 * - Validate output using AGENTS[agentName].deliverableFilename
 * - Render the deliverable to disk via the writeDeliverable hook (if provided)
 * - Commit on success, log metrics
 *
 * No Temporal dependencies - pure domain logic.
 */

import { fs, path } from 'zx';
import { type PiPromptResult, runPiPrompt, validateAgentOutput } from '../ai/pi/pi-executor.js';
import { createQueueSubmitTool, getQueueFilename } from '../ai/queue-schemas.js';
import type { AuditSession } from '../audit/index.js';
import { authStateFile } from '../audit/utils.js';
import { AGENTS } from '../session-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { AgentName } from '../types/agents.js';
import type { AgentEndResult } from '../types/audit.js';
import { ErrorCode, type PentestErrorType } from '../types/errors.js';
import type { AgentMetrics } from '../types/metrics.js';
import { err, isErr, ok, type Result } from '../types/result.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { getAgentGitPaths } from './agent-git-paths.js';
import type { ConfigLoaderService } from './config-loader.js';
import { PentestError } from './error-handling.js';
import { commitGitSuccess, createGitCheckpoint, rollbackGitWorkspace, withGitRepoLock } from './git-manager.js';
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
  promptDir?: string | undefined;
  customTools?: import('@earendil-works/pi-coding-agent').ToolDefinition[];
  // Renders the deliverable to disk; invoked after validation, before the success commit.
  writeDeliverable?: (deliverablesPath: string) => Promise<void>;
  cancellationSignal?: AbortSignal | undefined;
}

interface FailAgentOpts {
  attemptNumber: number;
  result: PiPromptResult;
  rollbackReason: string;
  errorMessage: string;
  errorCode: ErrorCode;
  category: PentestErrorType;
  retryable: boolean;
  context: Record<string, unknown>;
}

function errorCodeFromResult(result: PiPromptResult): ErrorCode {
  if (result.errorType && Object.values(ErrorCode).includes(result.errorType as ErrorCode)) {
    return result.errorType as ErrorCode;
  }
  return ErrorCode.AGENT_EXECUTION_FAILED;
}

function categoryForErrorCode(code: ErrorCode): PentestErrorType {
  switch (code) {
    case ErrorCode.SPENDING_CAP_REACHED:
    case ErrorCode.INSUFFICIENT_CREDITS:
    case ErrorCode.BILLING_ERROR:
    case ErrorCode.API_RATE_LIMITED:
      return 'billing';
    case ErrorCode.GIT_CHECKPOINT_FAILED:
    case ErrorCode.GIT_ROLLBACK_FAILED:
      return 'filesystem';
    case ErrorCode.PROMPT_LOAD_FAILED:
      return 'prompt';
    default:
      return 'validation';
  }
}

/** Wrap a failed git operation result into a PentestError attributed to the agent. */
function gitFailureForAgent(
  agentName: AgentName,
  operation: string,
  error: Error | undefined,
  code: ErrorCode = ErrorCode.GIT_CHECKPOINT_FAILED,
): PentestError {
  const retryable = error instanceof PentestError ? error.retryable : true;
  const message = error?.message ?? 'unknown git failure';
  return new PentestError(
    `Failed to ${operation} for ${agentName}: ${message}`,
    'filesystem',
    retryable,
    { agentName, originalError: message },
    code,
  );
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
      promptDir,
      customTools,
      writeDeliverable,
      cancellationSignal,
    } = input;
    const gitPaths = getAgentGitPaths(agentName);

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

    // 3. Create git checkpoint before execution (scoped to this agent's paths)
    try {
      const checkpointResult = await createGitCheckpoint(deliverablesPath, agentName, attemptNumber, logger, gitPaths);
      if (!checkpointResult.success) {
        const code =
          checkpointResult.error instanceof PentestError && checkpointResult.error.code
            ? checkpointResult.error.code
            : ErrorCode.GIT_CHECKPOINT_FAILED;
        return err(gitFailureForAgent(agentName, 'create git checkpoint', checkpointResult.error, code));
      }
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

    // 5. Execute agent. Vuln agents get a submit tool that captures the structured
    //    exploitation queue (pi has no JSON-schema output format).
    const submitTool = createQueueSubmitTool(agentName, distributedConfig?.exploit ?? true);
    const result: PiPromptResult = await runPiPrompt(
      prompt,
      repoPath,
      '', // context
      agentName, // description
      agentName,
      auditSession,
      logger,
      AGENTS[agentName].modelTier,
      customTools,
      path.relative(repoPath, deliverablesPath),
      cancellationSignal,
      submitTool,
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
      const errorCode = errorCodeFromResult(result);
      return this.failAgent(agentName, deliverablesPath, auditSession, logger, {
        attemptNumber,
        result,
        rollbackReason: 'execution failure',
        errorMessage: result.error || 'Agent execution failed',
        errorCode,
        category: categoryForErrorCode(errorCode),
        retryable: result.retryable ?? true,
        context: { agentName, originalError: result.error },
      });
    }

    // 8-11. Write structured output, validate, render, and commit under one repo lock so
    //       the write→validate→commit sequence is atomic against concurrent sibling agents.
    let commitHash: string | undefined;
    const finalizationError = await withGitRepoLock(async (): Promise<PentestError | null> => {
      // 8. Write structured output to disk (vuln agents only) from the executor's capture
      const queueFilename = getQueueFilename(agentName);
      if (submitTool && queueFilename && result.structuredOutput !== undefined) {
        await fs.ensureDir(deliverablesPath);
        const queuePath = path.join(deliverablesPath, queueFilename);
        await fs.writeFile(queuePath, JSON.stringify(result.structuredOutput, null, 2), 'utf8');
        logger.info(`Wrote structured output queue to ${queueFilename}`);
      }

      // 9. Validate output
      const validationPassed = await validateAgentOutput(result, agentName, deliverablesPath, logger);
      if (!validationPassed) {
        return new PentestError(
          `Agent ${agentName} failed output validation`,
          'validation',
          true,
          { agentName, deliverableFilename: AGENTS[agentName].deliverableFilename },
          ErrorCode.OUTPUT_VALIDATION_FAILED,
        );
      }

      // 10. Render the deliverable to disk so the success commit below stages it
      if (writeDeliverable) {
        await writeDeliverable(deliverablesPath);
      }

      // 11. Success - commit deliverables (scoped) and capture the checkpoint hash
      const commitResult = await commitGitSuccess(deliverablesPath, agentName, logger, gitPaths);
      if (!commitResult.success) {
        return gitFailureForAgent(agentName, 'commit successful results', commitResult.error);
      }
      commitHash = commitResult.commitHash;
      return null;
    });

    if (finalizationError) {
      const rollbackReason =
        finalizationError.code === ErrorCode.OUTPUT_VALIDATION_FAILED
          ? 'validation failure'
          : 'post-processing failure';
      return this.failAgent(agentName, deliverablesPath, auditSession, logger, {
        attemptNumber,
        result,
        rollbackReason,
        errorMessage: finalizationError.message,
        errorCode: finalizationError.code ?? ErrorCode.AGENT_EXECUTION_FAILED,
        category: finalizationError.type,
        retryable: finalizationError.retryable,
        context: { agentName, ...finalizationError.context },
      });
    }

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
    deliverablesPath: string,
    auditSession: AuditSession,
    logger: ActivityLogger,
    opts: FailAgentOpts,
  ): Promise<Result<AgentEndResult, PentestError>> {
    const rollbackResult = await rollbackGitWorkspace(
      deliverablesPath,
      opts.rollbackReason,
      logger,
      getAgentGitPaths(agentName),
    );

    const endResult: AgentEndResult = {
      attemptNumber: opts.attemptNumber,
      duration_ms: opts.result.duration,
      cost_usd: opts.result.cost || 0,
      success: false,
      model: opts.result.model,
      error: opts.errorMessage,
    };
    await auditSession.endAgent(agentName, endResult);

    const context = rollbackResult.success
      ? opts.context
      : {
          ...opts.context,
          rollbackFailed: true,
          rollbackError: rollbackResult.error?.message ?? 'unknown rollback failure',
          rollbackErrorCode:
            rollbackResult.error instanceof PentestError
              ? (rollbackResult.error.code ?? ErrorCode.GIT_ROLLBACK_FAILED)
              : ErrorCode.GIT_ROLLBACK_FAILED,
        };

    return err(new PentestError(opts.errorMessage, opts.category, opts.retryable, context, opts.errorCode));
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
  static toMetrics(endResult: AgentEndResult, result: PiPromptResult): AgentMetrics {
    return {
      durationMs: endResult.duration_ms,
      inputTokens: null, // Not currently exposed by the pi executor
      outputTokens: null,
      costUsd: endResult.cost_usd,
      numTurns: result.turns ?? null,
      model: result.model,
    };
  }
}
