// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production Claude agent execution with retry, git checkpoints, and audit logging

import { fs, path } from 'zx';
import { query } from '@anthropic-ai/claude-agent-sdk';

import { isRetryableError, PentestError } from '../services/error-handling.js';
import { isSpendingCapBehavior } from '../utils/billing-detection.js';
import { Timer } from '../utils/metrics.js';
import { formatTimestamp } from '../utils/formatting.js';
import { AGENT_VALIDATORS, MCP_AGENT_MAPPING } from '../session-manager.js';
import { AuditSession } from '../audit/index.js';
import { createShannonHelperServer } from '../../mcp-server/dist/index.js';
import { AGENTS } from '../session-manager.js';
import type { AgentName } from '../types/index.js';

import { dispatchMessage } from './message-handlers.js';
import { detectExecutionContext, formatErrorOutput, formatCompletionMessage } from './output-formatters.js';
import { createProgressManager } from './progress-manager.js';
import { createAuditLogger } from './audit-logger.js';
import { getActualModelName } from './router-utils.js';
import type { ActivityLogger } from '../types/activity-logger.js';

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
}

interface StdioMcpServer {
  type: 'stdio';
  command: string;
  args: string[];
  env: Record<string, string>;
}

type McpServer = ReturnType<typeof createShannonHelperServer> | StdioMcpServer;

// Configures MCP servers for agent execution, with Docker-specific Chromium handling
function buildMcpServers(
  sourceDir: string,
  agentName: string | null,
  logger: ActivityLogger
): Record<string, McpServer> {
  const shannonHelperServer = createShannonHelperServer(sourceDir);

  const mcpServers: Record<string, McpServer> = {
    'shannon-helper': shannonHelperServer,
  };

  if (agentName) {
    const promptTemplate = AGENTS[agentName as AgentName].promptTemplate;
    const playwrightMcpName = MCP_AGENT_MAPPING[promptTemplate as keyof typeof MCP_AGENT_MAPPING] || null;

    if (playwrightMcpName) {
      logger.info(`Assigned ${agentName} -> ${playwrightMcpName}`);

      const userDataDir = `/tmp/${playwrightMcpName}`;

      // Docker uses system Chromium; local dev uses Playwright's bundled browsers
      const isDocker = process.env.SHANNON_DOCKER === 'true';

      const mcpArgs: string[] = [
        '@playwright/mcp@latest',
        '--isolated',
        '--user-data-dir', userDataDir,
      ];

      // Docker: Use system Chromium; Local: Use Playwright's bundled browsers
      if (isDocker) {
        mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
        mcpArgs.push('--browser', 'chromium');
      }

      const envVars: Record<string, string> = Object.fromEntries(
        Object.entries({
          ...process.env,
          PLAYWRIGHT_HEADLESS: 'true',
          ...(isDocker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
        }).filter((entry): entry is [string, string] => entry[1] !== undefined)
      );

      mcpServers[playwrightMcpName] = {
        type: 'stdio' as const,
        command: 'npx',
        args: mcpArgs,
        env: envVars,
      };
    }
  }

  return mcpServers;
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
  duration: number
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
        stack: err.stack
      },
      context: {
        sourceDir,
        prompt: fullPrompt.slice(0, 200) + '...',
        retryable: isRetryableError(err)
      },
      duration
    };
    const logPath = path.join(sourceDir, 'error.log');
    await fs.appendFile(logPath, JSON.stringify(errorLog) + '\n');
  } catch {
    // Best-effort error log writing - don't propagate failures
  }
}

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string,
  logger: ActivityLogger
): Promise<boolean> {
  logger.info(`Validating ${agentName} agent output`);

  try {
    // Check if agent completed successfully
    if (!result.success || !result.result) {
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
  agentName: string | null = null,
  auditSession: AuditSession | null = null,
  logger: ActivityLogger
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false
  );
  const auditLogger = createAuditLogger(auditSession);

  logger.info(`Running Claude Code: ${description}...`);

  const mcpServers = buildMcpServers(sourceDir, agentName, logger);

  // Build env vars to pass to SDK subprocesses
  const sdkEnv: Record<string, string> = {
    CLAUDE_CODE_MAX_OUTPUT_TOKENS: process.env.CLAUDE_CODE_MAX_OUTPUT_TOKENS || '64000',
  };
  if (process.env.ANTHROPIC_API_KEY) {
    sdkEnv.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    sdkEnv.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  }

  const options = {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 10_000,
    cwd: sourceDir,
    permissionMode: 'bypassPermissions' as const,
    allowDangerouslySkipPermissions: true,
    mcpServers,
    env: sdkEnv,
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
    const messageLoopResult = await processMessageStream(
      fullPrompt,
      options,
      { execContext, description, progress, auditLogger, logger },
      timer
    );

    turnCount = messageLoopResult.turnCount;
    result = messageLoopResult.result;
    apiErrorDetected = messageLoopResult.apiErrorDetected;
    totalCost = messageLoopResult.cost;
    const model = messageLoopResult.model;

    // === SPENDING CAP SAFEGUARD ===
    // Defense-in-depth: Detect spending cap that slipped through detectApiError().
    // Uses consolidated billing detection from utils/billing-detection.ts
    if (isSpendingCapBehavior(turnCount, totalCost, result || '')) {
      throw new PentestError(
        `Spending cap likely reached (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
        'billing',
        true // Retryable - Temporal will use 5-30 min backoff
      );
    }

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
      apiErrorDetected
    };

  } catch (error) {
    const duration = timer.stop();

    const err = error as Error & { code?: string; status?: number };

    await auditLogger.logError(err, duration, turnCount);
    progress.stop();
    outputLines(formatErrorOutput(err, execContext, description, duration, sourceDir, isRetryableError(err)));
    await writeErrorLog(err, sourceDir, fullPrompt, duration);

    return {
      error: err.message,
      errorType: err.constructor.name,
      prompt: fullPrompt.slice(0, 100) + '...',
      success: false,
      duration,
      cost: totalCost,
      retryable: isRetryableError(err)
    };
  }
}


interface MessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
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
  timer: Timer
): Promise<MessageLoopResult> {
  const { execContext, description, progress, auditLogger, logger } = deps;
  const HEARTBEAT_INTERVAL = 30000;

  let turnCount = 0;
  let result: string | null = null;
  let apiErrorDetected = false;
  let cost = 0;
  let model: string | undefined;
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

    const dispatchResult = await dispatchMessage(
      message as { type: string; subtype?: string },
      turnCount,
      { execContext, description, progress, auditLogger, logger }
    );

    if (dispatchResult.type === 'throw') {
      throw dispatchResult.error;
    }

    if (dispatchResult.type === 'complete') {
      result = dispatchResult.result;
      cost = dispatchResult.cost;
      break;
    }

    if (dispatchResult.type === 'continue') {
      if (dispatchResult.apiErrorDetected) {
        apiErrorDetected = true;
      }
      // Capture model from SystemInitMessage, but override with router model if applicable
      if (dispatchResult.model) {
        model = getActualModelName(dispatchResult.model);
      }
    }
  }

  return { turnCount, result, apiErrorDetected, cost, model };
}
