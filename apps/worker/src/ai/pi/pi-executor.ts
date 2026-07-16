// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production agent execution on the pi harness, with git checkpoints and audit logging.

import os from 'node:os';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { fs, path } from 'zx';
import type { AuditSession } from '../../audit/index.js';
import { BASH_TIMEOUT_EXTENSION_DIR, deliverablesDir } from '../../paths.js';
import { isRetryableError, PentestError } from '../../services/error-handling.js';
import { AGENT_VALIDATORS } from '../../session-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import { ErrorCode } from '../../types/errors.js';
import { isSpendingCapBehavior, matchesBillingTextPattern } from '../../utils/billing-detection.js';
import { isBrowserAgent } from '../../utils/browser-agents.js';
import { formatTimestamp } from '../../utils/formatting.js';
import { Timer } from '../../utils/metrics.js';
import { createAuditLogger } from '../audit-logger.js';
import { type ModelTier, resolveModelSelection } from '../models.js';
import {
  detectExecutionContext,
  formatAssistantOutput,
  formatCompletionMessage,
  formatErrorOutput,
  formatToolCall,
} from '../output-formatters.js';
import { createProgressManager } from '../progress-manager.js';
import type { CapturedSubmitTool } from '../submit-tool.js';
import { permissionSystemConfigExists, permissionSystemPackageDir } from './permission-system.js';
import { createGlobTool, createTodoWriteTool } from './session-tools.js';
import { createTaskTool } from './task-tool.js';

declare global {
  var SHANNON_DISABLE_LOADER: boolean | undefined;
}

/** Built-in pi tools enabled for every agent (custom tool names are appended). */
const BUILTIN_TOOLS = ['read', 'bash', 'edit', 'write', 'grep', 'find', 'ls'];

/** Build the playwright-cli Skill object injected for browser-using agents. */
function buildPlaywrightSkill(): Skill {
  const filePath =
    process.env.PLAYWRIGHT_CLI_SKILL_PATH ?? path.join(os.homedir(), '.claude/skills/playwright-cli/SKILL.md');
  const baseDir = path.dirname(filePath);
  return {
    name: 'playwright-cli',
    description:
      'Drive a real browser via the playwright-cli binary. Use for any task that navigates, clicks, ' +
      'fills forms, takes screenshots, or reads live pages.',
    filePath,
    baseDir,
    sourceInfo: { path: filePath, source: 'custom', scope: 'user', origin: 'top-level', baseDir },
    disableModelInvocation: false,
  };
}

async function buildResourceLoader(
  cwd: string,
  logger: ActivityLogger,
  agentName: string | null,
): Promise<ResourceLoader> {
  // Always enforce bounded bash timeouts so an unbounded command cannot hang the agent.
  const additionalExtensionPaths: string[] = [BASH_TIMEOUT_EXTENSION_DIR];
  if (permissionSystemConfigExists(getAgentDir())) {
    try {
      additionalExtensionPaths.push(permissionSystemPackageDir());
    } catch {
      logger.warn(
        'code_path deny config present but @gotgenes/pi-permission-system not resolvable — skipping enforcement',
      );
    }
  }

  // Only browser-driving agents get the playwright-cli skill; the rest run with no skills.
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    ...(additionalExtensionPaths.length > 0 && { additionalExtensionPaths }),
    ...(isBrowserAgent(agentName)
      ? {
          skillsOverride: (base) => ({
            skills: [buildPlaywrightSkill()],
            diagnostics: base.diagnostics,
          }),
        }
      : { noSkills: true }),
  });
  await loader.reload();
  return loader;
}

export interface PiPromptResult {
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
      agent: 'pi-executor',
      error: { name: err.constructor.name, message: err.message, code: err.code, status: err.status, stack: err.stack },
      context: { sourceDir, prompt: `${fullPrompt.slice(0, 200)}...`, retryable: isRetryableError(err) },
      duration,
    };
    const logPath = path.join(deliverablesDir(sourceDir), 'error.log');
    await fs.appendFile(logPath, `${JSON.stringify(errorLog)}\n`);
  } catch {
    // Best-effort error log writing - don't propagate failures
  }
}

export async function validateAgentOutput(
  result: PiPromptResult,
  agentName: string | null,
  sourceDir: string,
  logger: ActivityLogger,
): Promise<boolean> {
  logger.info(`Validating ${agentName} agent output`);
  try {
    if (!result.success || (!result.result && result.structuredOutput === undefined)) {
      logger.error('Validation failed: Agent execution was unsuccessful');
      return false;
    }
    const validator = agentName ? AGENT_VALIDATORS[agentName as keyof typeof AGENT_VALIDATORS] : undefined;
    if (!validator) {
      logger.warn(`No validator found for agent "${agentName}" - assuming success`);
      return true;
    }
    logger.info(`Using validator for agent: ${agentName}`, { sourceDir });
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

/** Concatenate the text blocks of an assistant message (skips thinking + tool calls). */
function extractAssistantText(message: AgentMessage): string {
  if (message.role !== 'assistant') return '';
  const blocks = message.content as Array<{ type: string; text?: string }>;
  return blocks
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n');
}

/**
 * Classify error-bearing text into a PentestError, mirroring the prior provider error
 * handling. Spending-cap / billing text is retryable (Temporal backs off and
 * recovers when the cap resets); session limit is permanent.
 */
function classifyErrorText(content: string): PentestError | null {
  if (!content) return null;
  if (matchesBillingTextPattern(content)) {
    return new PentestError(
      `Billing limit reached: ${content.slice(0, 100)}`,
      'billing',
      true,
      {},
      ErrorCode.SPENDING_CAP_REACHED,
    );
  }
  if (content.toLowerCase().includes('session limit reached')) {
    return new PentestError('Session limit reached', 'billing', false);
  }
  return null;
}

// Low-level pi execution. Drives one agent session to completion with progress and
// audit logging. Exported for Temporal activities to call single-attempt execution.
export async function runPiPrompt(
  prompt: string,
  sourceDir: string,
  context: string = '',
  description: string = 'Agent analysis',
  agentName: string | null = null,
  auditSession: AuditSession | null = null,
  logger: ActivityLogger,
  modelTier: ModelTier = 'medium',
  callerTools?: ToolDefinition[],
  deliverablesSubdir?: string,
  cancellationSignal?: AbortSignal,
  submitTool?: CapturedSubmitTool,
): Promise<PiPromptResult> {
  // 1. Initialize timing and prompt. A submit tool appends its directive so the
  //    instruction to call it lives with the tool, not in every prompt file.
  const timer = new Timer(`agent-${description.toLowerCase().replace(/\s+/g, '-')}`);
  const basePrompt = context ? `${context}\n\n${prompt}` : prompt;
  const fullPrompt = submitTool?.directive ? basePrompt + submitTool.directive : basePrompt;

  // 2. Set up progress and audit infrastructure
  const execContext = detectExecutionContext(description);
  const progress = createProgressManager(
    { description, useCleanOutput: execContext.useCleanOutput },
    global.SHANNON_DISABLE_LOADER ?? false,
  );
  const auditLogger = createAuditLogger(auditSession);

  logger.info(`Running pi agent: ${description}...`);

  // 3. Expose bash-invoked CLI tooling (playwright-cli, save-deliverable) to the
  //    environment pi's bash tool inherits. These are constant per container, so
  //    setting them on process.env is parallel-safe across this workflow's agents.
  process.env.PLAYWRIGHT_MCP_OUTPUT_DIR = deliverablesSubdir
    ? path.join(sourceDir, path.dirname(deliverablesSubdir), '.playwright-cli')
    : path.join(sourceDir, '.shannon', '.playwright-cli');
  if (deliverablesSubdir) process.env.SHANNON_DELIVERABLES_SUBDIR = deliverablesSubdir;

  // 4. Resolve model + auth, then assemble the tool set (universal task/todo tools
  //    plus any caller-supplied collector/submit tools).
  const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), modelTier);
  const resourceLoader = await buildResourceLoader(sourceDir, logger, agentName);
  // Accumulates usage from in-process `task` child sessions so the parent's reported
  // cost includes sub-agent spend (their getSessionStats is separate from ours).
  const childUsage = { cost: 0, inputTokens: 0, outputTokens: 0 };
  const customTools: ToolDefinition[] = [
    createTaskTool({
      model: selection.model,
      thinkingLevel: selection.thinkingLevel,
      authStorage: selection.authStorage,
      cwd: sourceDir,
      onUsage: (usage) => {
        childUsage.cost += usage.cost;
        childUsage.inputTokens += usage.inputTokens;
        childUsage.outputTokens += usage.outputTokens;
      },
      resourceLoader,
      ...(cancellationSignal && { cancellationSignal }),
    }),
    createTodoWriteTool(auditLogger),
    createGlobTool(sourceDir),
    ...(callerTools ?? []),
    ...(submitTool ? [submitTool.tool] : []),
  ];
  // pi's `tools` allowlist gates custom tools too — list every custom name.
  const tools = [...BUILTIN_TOOLS, ...customTools.map((t) => t.name)];

  let turnCount = 0;
  let pendingError: PentestError | null = null;
  let apiErrorDetected = false;

  progress.start();

  try {
    const { session } = await createAgentSession({
      cwd: sourceDir,
      model: selection.model,
      thinkingLevel: selection.thinkingLevel,
      tools,
      customTools,
      authStorage: selection.authStorage,
      sessionManager: SessionManager.inMemory(),
      // Temporal owns retry; pi compaction stays on (no analog previously, guards
      // against context overflow on long agent runs).
      settingsManager: SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true } }),
      resourceLoader,
    });

    // 5. Map pi events to audit logging + progress + error capture.
    session.subscribe((event: AgentSessionEvent) => {
      switch (event.type) {
        case 'turn_end': {
          turnCount += 1;
          const msg = event.message;
          const text = extractAssistantText(msg);
          if (text.trim()) {
            void auditLogger.logLlmResponse(turnCount, text);
            progress.stop();
            outputLines(formatAssistantOutput(text, execContext, turnCount, description));
            progress.start();
            const billing = classifyErrorText(text);
            if (billing) pendingError = billing;
          }
          if (msg.role === 'assistant' && msg.stopReason === 'error') {
            apiErrorDetected = true;
            pendingError =
              pendingError ??
              classifyErrorText(msg.errorMessage ?? '') ??
              new PentestError(`Agent error: ${(msg.errorMessage ?? 'unknown').slice(0, 200)}`, 'unknown', true);
          }
          break;
        }
        case 'tool_execution_start': {
          void auditLogger.logToolStart(event.toolName, event.args);
          const toolLines = formatToolCall(
            event.toolName,
            event.args as Record<string, unknown>,
            execContext,
            description,
          );
          if (toolLines.length > 0) {
            progress.stop();
            outputLines(toolLines);
            progress.start();
          }
          break;
        }
        case 'tool_execution_end':
          void auditLogger.logToolEnd(event.result);
          break;
        case 'compaction_end':
          if (!event.aborted && !event.willRetry && event.errorMessage) {
            pendingError =
              pendingError ??
              classifyErrorText(event.errorMessage) ??
              new PentestError(`Context compaction failed: ${event.errorMessage.slice(0, 200)}`, 'unknown', true);
          }
          break;
        default:
          break;
      }
    });

    // 6. Run the agent to completion (resolves at agent_end).
    await session.prompt(fullPrompt);
    session.dispose();

    // 7. Surface any error captured during the run.
    if (pendingError) throw pendingError;

    // 8. Read usage/cost and final text.
    const stats = session.getSessionStats();
    const totalCost = stats.cost + childUsage.cost;
    const result = session.getLastAssistantText() ?? null;

    // 9. Defense-in-depth: detect a spending cap that produced an empty/cheap run.
    if (isSpendingCapBehavior(turnCount, totalCost, result || '')) {
      throw new PentestError(
        `Spending cap likely reached (turns=${turnCount}, cost=$0): ${result?.slice(0, 100)}`,
        'billing',
        true,
      );
    }

    const duration = timer.stop();
    progress.finish(formatCompletionMessage(execContext, description, turnCount, duration));

    // Capture the submit tool's structured payload so callers read it off the
    // result instead of holding a reference to the tool.
    const structuredOutput = submitTool?.getCaptured();

    return {
      result,
      success: true,
      duration,
      turns: turnCount,
      cost: totalCost,
      model: selection.model.id,
      partialCost: totalCost,
      apiErrorDetected,
      ...(structuredOutput !== undefined && { structuredOutput }),
    };
  } catch (error) {
    // 10. Handle errors — log, write error file, return failure
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
      cost: 0,
      retryable: isRetryableError(err),
    };
  }
}
