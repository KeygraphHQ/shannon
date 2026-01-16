// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production Claude agent execution with retry, git checkpoints, and audit logging

import { fs, path } from 'zx';
import chalk, { type ChalkInstance } from 'chalk';
import { query } from '@anthropic-ai/claude-agent-sdk';

import { isRetryableError, getRetryDelay, PentestError } from '../error-handling.js';
import { timingResults, Timer } from '../utils/metrics.js';
import { formatTimestamp } from '../utils/formatting.js';
import { createGitCheckpoint, commitGitSuccess, rollbackGitWorkspace, getGitCommitHash } from '../utils/git-manager.js';
import { AGENT_VALIDATORS, MCP_AGENT_MAPPING } from '../constants.js';
import { AuditSession } from '../audit/index.js';
import { createShannonHelperServer } from '../../mcp-server/dist/index.js';
import type { SessionMetadata } from '../audit/utils.js';
import { getPromptNameForAgent } from '../types/agents.js';
import type { AgentName } from '../types/index.js';

import { dispatchMessage } from './message-handlers.js';
import { detectExecutionContext, formatErrorOutput, formatCompletionMessage } from './output-formatters.js';
import { createProgressManager } from './progress-manager.js';
import { createAuditLogger } from './audit-logger.js';
import { getActualModelName } from './router-utils.js';

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
  agentName: string | null
): Record<string, McpServer> {
  const shannonHelperServer = createShannonHelperServer(sourceDir);

  const mcpServers: Record<string, McpServer> = {
    'shannon-helper': shannonHelperServer,
  };

  if (agentName) {
    const promptName = getPromptNameForAgent(agentName as AgentName);
    const playwrightMcpName = MCP_AGENT_MAPPING[promptName as keyof typeof MCP_AGENT_MAPPING] || null;

    if (playwrightMcpName) {
      console.log(chalk.gray(`    Assigned ${agentName} -> ${playwrightMcpName}`));

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
  } catch (logError) {
    const logErrMsg = logError instanceof Error ? logError.message : String(logError);
    console.log(chalk.gray(`    (Failed to write error log: ${logErrMsg})`));
  }
}

export async function validateAgentOutput(
  result: ClaudePromptResult,
  agentName: string | null,
  sourceDir: string
): Promise<boolean> {
  console.log(chalk.blue(`    Validating ${agentName} agent output`));

  try {
    // Check if agent completed successfully
    if (!result.success || !result.result) {
      console.log(chalk.red(`    Validation failed: Agent execution was unsuccessful`));
      return false;
    }

    // Get validator function for this agent
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;

    if (!validator) {
      console.log(chalk.yellow(`    No validator found for agent "${agentName}" - assuming success`));
      console.log(chalk.green(`    Validation passed: Unknown agent with successful result`));
      return true;
    }

    console.log(chalk.blue(`    Using validator for agent: ${agentName}`));
    console.log(chalk.blue(`    Source directory: ${sourceDir}`));

    // Apply validation function
    const validationResult = await validator(sourceDir);

    if (validationResult) {
      console.log(chalk.green(`    Validation passed: Required files/structure present`));
    } else {
      console.log(chalk.red(`    Validation failed: Missing required deliverable files`));
    }

    return validationResult;

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.log(chalk.red(`    Validation failed with error: ${errMsg}`));
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
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null,
  auditSession: AuditSession | null = null,
  attemptNumber: number = 1
): Promise<ClaudePromptResult> {
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const fullPrompt = context ? `${context}\n\n${prompt}` : prompt;

  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false
  );
  const auditLogger = createAuditLogger(auditSession);

  console.log(chalk.blue(`  Running Claude Code: ${description}...`));

  const mcpServers = buildMcpServers(sourceDir, agentName);
  const options = {
    model: 'claude-sonnet-4-5-20250929',
    maxTurns: 10_000,
    cwd: sourceDir,
    permissionMode: 'bypassPermissions' as const,
    mcpServers,
  };

  if (!execContext.useCleanOutput) {
    console.log(chalk.gray(`    SDK Options: maxTurns=${options.maxTurns}, cwd=${sourceDir}, permissions=BYPASS`));
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
      { execContext, description, colorFn, progress, auditLogger },
      timer
    );

    turnCount = messageLoopResult.turnCount;
    result = messageLoopResult.result;
    apiErrorDetected = messageLoopResult.apiErrorDetected;
    totalCost = messageLoopResult.cost;
    const model = messageLoopResult.model;

    // === SPENDING CAP SAFEGUARD ===
    // Defense-in-depth: Detect spending cap that slipped through detectApiError().
    // When spending cap is hit, Claude returns a short message with $0 cost.
    // Legitimate agent work NEVER costs $0 with only 1-2 turns.
    if (turnCount <= 2 && totalCost === 0) {
      const resultLower = (result || '').toLowerCase();
      const BILLING_KEYWORDS = ['spending', 'cap', 'limit', 'budget', 'resets'];
      const looksLikeBillingError = BILLING_KEYWORDS.some((kw) =>
        resultLower.includes(kw)
      );

      if (looksLikeBillingError) {
        throw new PentestError(
          `Spending cap likely reached (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
          'billing',
          true // Retryable - Temporal will use 5-30 min backoff
        );
      }
    }

    const duration = timer.stop();
    timingResults.agents[execContext.agentKey] = duration;

    if (apiErrorDetected) {
      console.log(chalk.yellow(`  API Error detected in ${description} - will validate deliverables before failing`));
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
    timingResults.agents[execContext.agentKey] = duration;

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
  colorFn: ChalkInstance;
  progress: ReturnType<typeof createProgressManager>;
  auditLogger: ReturnType<typeof createAuditLogger>;
}

async function processMessageStream(
  fullPrompt: string,
  options: NonNullable<Parameters<typeof query>[0]['options']>,
  deps: MessageLoopDeps,
  timer: Timer
): Promise<MessageLoopResult> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;
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
      console.log(chalk.blue(`    [${Math.floor((now - timer.startTime) / 1000)}s] ${description} running... (Turn ${turnCount})`));
      lastHeartbeat = now;
    }

    // Increment turn count for assistant messages
    if (message.type === 'assistant') {
      turnCount++;
    }

    const dispatchResult = await dispatchMessage(
      message as { type: string; subtype?: string },
      turnCount,
      { execContext, description, colorFn, progress, auditLogger }
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

// Main entry point for agent execution. Handles retries, git checkpoints, and validation.
export async function runClaudePromptWithRetry(
  prompt: string,
  sourceDir: string,
  _allowedTools: string = 'Read',
  context: string = '',
  description: string = 'Claude analysis',
  agentName: string | null = null,
  colorFn: ChalkInstance = chalk.cyan,
  sessionMetadata: SessionMetadata | null = null
): Promise<ClaudePromptResult> {
  const maxRetries = 3;
  let lastError: Error | undefined;
  let retryContext = context;

  console.log(chalk.cyan(`Starting ${description} with ${maxRetries} max attempts`));

  let auditSession: AuditSession | null = null;
  if (sessionMetadata && agentName) {
    auditSession = new AuditSession(sessionMetadata);
    await auditSession.initialize();
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    await createGitCheckpoint(sourceDir, description, attempt);

    if (auditSession && agentName) {
      const fullPrompt = retryContext ? `${retryContext}\n\n${prompt}` : prompt;
      await auditSession.startAgent(agentName, fullPrompt, attempt);
    }

    try {
      const result = await runClaudePrompt(
        prompt, sourceDir, retryContext,
        description, agentName, colorFn, sessionMetadata, auditSession, attempt
      );

      if (result.success) {
        const validationPassed = await validateAgentOutput(result, agentName, sourceDir);

        if (validationPassed) {
          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`Validation: Ready for exploitation despite API error warnings`));
          }

          if (auditSession && agentName) {
            const commitHash = await getGitCommitHash(sourceDir);
            const endResult: {
              attemptNumber: number;
              duration_ms: number;
              cost_usd: number;
              success: true;
              checkpoint?: string;
            } = {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.cost || 0,
              success: true,
            };
            if (commitHash) {
              endResult.checkpoint = commitHash;
            }
            await auditSession.endAgent(agentName, endResult);
          }

          await commitGitSuccess(sourceDir, description);
          console.log(chalk.green.bold(`${description} completed successfully on attempt ${attempt}/${maxRetries}`));
          return result;
        // Validation failure is retryable - agent might succeed on retry with cleaner workspace
        } else {
          console.log(chalk.yellow(`${description} completed but output validation failed`));

          if (auditSession && agentName) {
            await auditSession.endAgent(agentName, {
              attemptNumber: attempt,
              duration_ms: result.duration,
              cost_usd: result.partialCost || result.cost || 0,
              success: false,
              error: 'Output validation failed',
              isFinalAttempt: attempt === maxRetries
            });
          }

          if (result.apiErrorDetected) {
            console.log(chalk.yellow(`API Error detected with validation failure - treating as retryable`));
            lastError = new Error('API Error: terminated with validation failure');
          } else {
            lastError = new Error('Output validation failed');
          }

          if (attempt < maxRetries) {
            await rollbackGitWorkspace(sourceDir, 'validation failure');
            continue;
          } else {
            throw new PentestError(
              `Agent ${description} failed output validation after ${maxRetries} attempts. Required deliverable files were not created.`,
              'validation',
              false,
              { description, sourceDir, attemptsExhausted: maxRetries }
            );
          }
        }
      }

    } catch (error) {
      const err = error as Error & { duration?: number; cost?: number; partialResults?: unknown };
      lastError = err;

      if (auditSession && agentName) {
        await auditSession.endAgent(agentName, {
          attemptNumber: attempt,
          duration_ms: err.duration || 0,
          cost_usd: err.cost || 0,
          success: false,
          error: err.message,
          isFinalAttempt: attempt === maxRetries
        });
      }

      if (!isRetryableError(err)) {
        console.log(chalk.red(`${description} failed with non-retryable error: ${err.message}`));
        await rollbackGitWorkspace(sourceDir, 'non-retryable error cleanup');
        throw err;
      }

      if (attempt < maxRetries) {
        await rollbackGitWorkspace(sourceDir, 'retryable error cleanup');

        const delay = getRetryDelay(err, attempt);
        const delaySeconds = (delay / 1000).toFixed(1);
        console.log(chalk.yellow(`${description} failed (attempt ${attempt}/${maxRetries})`));
        console.log(chalk.gray(`    Error: ${err.message}`));
        console.log(chalk.gray(`    Workspace rolled back, retrying in ${delaySeconds}s...`));

        if (err.partialResults) {
          retryContext = `${context}\n\nPrevious partial results: ${JSON.stringify(err.partialResults)}`;
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        await rollbackGitWorkspace(sourceDir, 'final failure cleanup');
        console.log(chalk.red(`${description} failed after ${maxRetries} attempts`));
        console.log(chalk.red(`    Final error: ${err.message}`));
      }
    }
  }

  throw lastError;
}
