// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production Claude agent execution with retry, git checkpoints, and audit logging

import { type JsonSchemaOutputFormat, query } from '@anthropic-ai/claude-agent-sdk';
import { fs, path } from 'zx';
import type { AuditSession } from '../audit/index.js';
import { deliverablesDir } from '../paths.js';
import { isRetryableError, PentestError } from '../services/error-handling.js';
import { AGENT_VALIDATORS } from '../session-manager.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { formatTimestamp } from '../utils/formatting.js';
import { Timer } from '../utils/metrics.js';
import { createAuditLogger } from './audit-logger.js';
import { dispatchMessage } from './message-handlers.js';
import { type ModelTier, resolveModel, supportsAdaptiveThinking } from './models.js';
import { detectExecutionContext, formatCompletionMessage, formatErrorOutput } from './output-formatters.js';
import { createProgressManager } from './progress-manager.js';

declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

export interface ClaudePromptResult {
  result?: string | null | undefined;
  success: boolean;
  duration: number;
  turns?: number | undefined;
  cost: number;
  model?: string | undefined;
  partialCost?: number | undefined;
  apiErrorDetected?: boolean | undefined;
  error?: string | undefined;
  errorType?: string | undefined;
  prompt?: string | undefined;
  retryable?: boolean | undefined;
  structuredOutput?: unknown;
}

function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

async function writeErrorLog(
  err: Error & { code?: string; status?: number },
  sourceDir: string,
  fullPrompt: string,
  duration: number,
): Promise<void> {
  try {
    const errorLog = {
      timestamp: formatTimestamp(),
      agent: 'claude-executor',
      error: {
        name: err.constructor.name,
        message: err.message,
        code: err.code,
        status: err.status,
        stack: err.stack,
      },
      context: {
        sourceDir,
        prompt: `${fullPrompt.slice(0, 200)}...`,
        retryable: isRetryableError(err),
      },
      duration,
    };
    const logPath = path.join(deliverablesDir(sourceDir), 'error.log');
    await fs.appendFile(logPath, `${JSON.stringify(errorLog)}\n`);
  } catch {
    // Best-effort error log writing - don't propagate failures
  }
}

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string,
  logger: ActivityLogger,
): Promise<boolean> {
  logger.info(`Validating ${agentName} agent output`);

  try {
    // Check if agent completed successfully (text result OR structured output)
    if (!result.success || (!result.result && result.structuredOutput === undefined)) {
      logger.error('Validation failed: Agent execution was unsuccessful');
      return false;
    }

    // Get validator function for this agent
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;

    if (!validator) {
      logger.warn(`No validator found for agent "${agentName}" - assuming success`);
      logger.info('Validation passed: Unknown agent with successful result');
      return true;
    }

    logger.info(`Using validator for agent: ${agentName}`, { sourceDir });

    // Apply validation function
    const validationResult = await validator(sourceDir, logger);

    if (validationResult) {
      logger.info('Validation passed: Required files/structure present');
    } else {
      logger.error('Validation failed: Missing required deliverable files');
    }

    return validationResult;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    logger.error(`Validation failed with error: ${errMsg}`);
    return false;
  }
}

// Low-level SDK execution. Handles message streaming, progress, and audit logging.
// Exported for Temporal activities to call single-attempt execution.
export async function runClaudePrompt(
  prompt: string,
  sourceDir: string,
  context: string = '',
  description: string = 'Claude analysis',
  _agentName: string | null = null,
  auditSession: AuditSession | null = null,
  logger: ActivityLogger,
  modelTier: ModelTier = 'medium',
  outputFormat?: JsonSchemaOutputFormat,
  apiKey?: string,
  deliverablesSubdir?: string,
  providerConfig?: import('../types/config.js').ProviderConfig,
): Promise<ClaudePromptResult> {
  // 1. Initialize timing and prompt
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  // 2. Set up progress and audit infrastructure
  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false,
  );
  const auditLogger = createAuditLogger(auditSession);

  logger.info(`Running Claude Code: ${description}...`);

  // 3. Build env vars to pass to SDK subprocesses
  const sdkEnv: Record<string, string> = {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '64000',
    PLAYWRIGHT_MCP_OUTPUT_DIR: deliverablesSubdir
      ? path.join(sourceDir, path.dirname(deliverablesSubdir), '.playwright-cli')
      : path.join(sourceDir, '.shannon', '.playwright-cli'),
    // apiKey from ContainerConfig takes precedence over process.env
    ...(apiKey && { ANTHROPIC_API_KEY: apiKey }),
    // Deliverables subdir for save-deliverable CLI tool
    ...(deliverablesSubdir && { SHANNON_DELIVERABLES_SUBDIR: deliverablesSubdir }),
  };

  // 3a. Apply structured provider config directly to sdkEnv (no process.env mutation)
  if (providerConfig) {
    switch (providerConfig.providerType) {
      case 'bedrock':
        sdkEnv.CLAUDE_CODE_USE_BEDROCK = '1';
        if (providerConfig.awsRegion) sdkEnv.AWS_REGION = providerConfig.awsRegion;
        if (providerConfig.awsAccessKeyId) sdkEnv.AWS_ACCESS_KEY_ID = providerConfig.awsAccessKeyId;
        if (providerConfig.awsSecretAccessKey) sdkEnv.AWS_SECRET_ACCESS_KEY = providerConfig.awsSecretAccessKey;
        break;
      case 'vertex':
        sdkEnv.CLAUDE_CODE_USE_VERTEX = '1';
        if (providerConfig.gcpRegion) sdkEnv.CLOUD_ML_REGION = providerConfig.gcpRegion;
        if (providerConfig.gcpProjectId) sdkEnv.ANTHROPIC_VERTEX_PROJECT_ID = providerConfig.gcpProjectId;
        if (providerConfig.gcpCredentialsPath) sdkEnv.GOOGLE_APPLICATION_CREDENTIALS = providerConfig.gcpCredentialsPath;
        break;
      case 'litellm_router':
        if (providerConfig.baseUrl) sdkEnv.ANTHROPIC_BASE_URL = providerConfig.baseUrl;
        if (providerConfig.authToken) sdkEnv.ANTHROPIC_AUTH_TOKEN = providerConfig.authToken;
        break;
      default:
        // 'anthropic_api' or unset — apiKey already handled above
        if (providerConfig.apiKey && !apiKey) sdkEnv.ANTHROPIC_API_KEY = providerConfig.apiKey;
        break;
    }
  }

  // 3b. Passthrough env vars not already set by providerConfig or apiKey
  const passthroughVars = [
    ...(!sdkEnv.ANTHROPIC_API_KEY ? ['ANTHROPIC_API_KEY'] : []),
    'CLAUDE_CODE_OAUTH_TOKEN',
    ...(!sdkEnv.ANTHROPIC_BASE_URL ? ['ANTHROPIC_BASE_URL'] : []),
    ...(!sdkEnv.ANTHROPIC_AUTH_TOKEN ? ['ANTHROPIC_AUTH_TOKEN'] : []),
    ...(!sdkEnv.CLAUDE_CODE_USE_BEDROCK ? ['CLAUDE_CODE_USE_BEDROCK'] : []),
    ...(!sdkEnv.AWS_REGION ? ['AWS_REGION'] : []),
    'AWS_BEARER_TOKEN_BEDROCK',
    ...(!sdkEnv.CLAUDE_CODE_USE_VERTEX ? ['CLAUDE_CODE_USE_VERTEX'] : []),
    ...(!sdkEnv.CLOUD_ML_REGION ? ['CLOUD_ML_REGION'] : []),
    ...(!sdkEnv.ANTHROPIC_VERTEX_PROJECT_ID ? ['ANTHROPIC_VERTEX_PROJECT_ID'] : []),
    ...(!sdkEnv.GOOGLE_APPLICATION_CREDENTIALS ? ['GOOGLE_APPLICATION_CREDENTIALS'] : []),
    'HOME',
    'PATH',
    'PLAYWRIGHT_MCP_EXECUTABLE_PATH',
  ];
  for (const name of passthroughVars) {
    const val = process.env[name];
    if (val) {
      sdkEnv[name] = val;
    }
  }

  // 4. Configure SDK options
  // Model override from providerConfig takes precedence over env-based resolveModel
  const model = providerConfig?.modelOverrides?.[modelTier] ?? resolveModel(modelTier);
  const adaptiveThinking = supportsAdaptiveThinking(model) && process.env.CLAUDE_ADAPTIVE_THINKING !== 'false';
  const options = {
    model,
    maxTurns: 10_000,
    cwd: sourceDir,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    settingSources: ['user'] as ('user' | 'project' | 'local')[],
    env: sdkEnv,
    ...(adaptiveThinking && { thinking: { type: 'adaptive' as const } }),
    ...(outputFormat && { outputFormat }),
  };

  if (!execContext.useCleanOutput) {
    logger.info(`SDK Options: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`);
  }

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let totalCost = 0;

  progress.start();

  try {
    // 6. Process the message stream
    const messageLoopResult = await processMessageStream(
      fullPrompt,
      options,
      { execContext, description, progress, auditLogger, logger },
      timer,
    );

    turnCount = messageLoopResult.turnCount;
    result = messageLoopResult.result;
    apiErrorDetected = messageLoopResult.apiErrorDetected;
    totalCost = messageLoopResult.cost;
    const model = messageLoopResult.model;

    // === SPENDING CAP SAFEGUARD ===
    // 7. Defense-in-depth: Detect spending cap that slipped through detectApiError().
    // Uses consolidated billing detection from utils/billing-detection.ts
    if (isSpendingCapBehavior(turnCount, totalCost, result || '')) {
      throw new PentestError(
        `Spending cap likely reached (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
        'billing',
        true, // Retryable - Temporal will use 5-30 min backoff
      );
    }

    // 8. Finalize successful result
    const duration = timer.stop();

    if (apiErrorDetected) {
      logger.warn(`API Error detected in ${description} - will validate deliverables before failing`);
    }

    progress.finish(formatCompletionMessage(execContext, description, turnCount, duration));

    return {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      model,
      partialCost: totalCost,
      apiErrorDetected,
      ...(messageLoopResult.structuredOutput !== undefined && {
        structuredOutput: messageLoopResult.structuredOutput,
      }),
    };
  } catch (error) {
    // 9. Handle errors — log, write error file, return failure
    const duration = timer.stop();

    const err = error as Error & { code?: string; status?: number };

    await auditLogger.logError(err, duration, turnCount);
    progress.stop();
    outputLines(formatErrorOutput(err, execContext, description, duration, sourceDir, isRetryableError(err)));
    await writeErrorLog(err, sourceDir, fullPrompt, duration);

    return {
      error: err.message,
      errorType: err.constructor.name,
      prompt: `${fullPrompt.slice(0, 100)}...`,
      success: false,
      duration,
      cost: totalCost,
      retryable: isRetryableError(err),
    };
  }
}

interface MessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
  structuredOutput?: unknown;
}

interface MessageLoopDeps {
  execContext: ReturnType<typeof detectExecutionContext>;
  description: string;
  progress: ReturnType<typeof createProgressManager>;
  auditLogger: ReturnType<typeof createAuditLogger>;
  logger: ActivityLogger;
}

async function processMessageStream(
  fullPrompt: string,
  options: NonNullable<Parameters<typeof query>[0]['options']>,
  deps: MessageLoopDeps,
  timer: Timer,
): Promise<MessageLoopResult> {
  const { execContext, description, progress, auditLogger, logger } = deps;
  const HEARTBEAT_INTERVAL = 30000;

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let cost = 0;
  let model: string | undefined;
  let structuredOutput: unknown | undefined;
  let lastHeartbeat = Date.now();

  for await (const message of query({ prompt: fullPrompt, options })) {
    // Heartbeat logging when loader is disabled
    const now = Date.now();
    if (global.SHANNON_DISABLE_LOADER && now - lastHeartbeat > HEARTBEAT_INTERVAL) {
      logger.info(`[${Math.floor((now - timer.startTime) / 1000)}s] ${description} running... (Turn ${turnCount})`);
      lastHeartbeat = now;
    }

    // Increment turn count for assistant messages
    if (message.type === 'assistant') {
      turnCount++;
    }

    const dispatchResult = await dispatchMessage(message as { type: string; subtype?: string }, turnCount, {
      execContext,
      description,
      progress,
      auditLogger,
      logger,
    });

    if (dispatchResult.type === 'throw') {
      throw dispatchResult.error;
    }

    if (dispatchResult.type === 'complete') {
      result = dispatchResult.result;
      cost = dispatchResult.cost;
      if (dispatchResult.structuredOutput !== undefined) {
        structuredOutput = dispatchResult.structuredOutput;
      }
      break;
    }

    if (dispatchResult.type === 'continue') {
      if (dispatchResult.apiErrorDetected) {
        apiErrorDetected = true;
      }
      if (dispatchResult.model) {
        model = dispatchResult.model;
      }
    }
  }

  return {
    turnCount,
    result,
    apiErrorDetected,
    cost,
    model,
    ...(structuredOutput !== undefined && { structuredOutput }),
  };
}
