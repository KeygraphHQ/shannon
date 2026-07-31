// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Production agent execution on the pi harness, with git checkpoints and audit logging.

import os from 'node:os';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type Skill,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { fs, path } from 'zx';
import type { AuditSession } from '../../audit/index.js';
import { BASH_TIMEOUT_EXTENSION_DIR, deliverablesDir, OAUTH_PROMPT_SHAPE_EXTENSION_DIR } from '../../paths.js';
import { isRetryableFailure, PentestError } from '../../services/error-handling.js';
import { AGENT_VALIDATORS } from '../../session-manager.js';
import type { ActivityLogger } from '../../types/activity-logger.js';
import { isBrowserAgent } from '../../utils/browser-agents.js';
import { formatTimestamp } from '../../utils/formatting.js';
import { Timer } from '../../utils/metrics.js';
import { createAuditLogger } from '../audit-logger.js';
import { resolveModelSelection } from '../models.js';
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
import { PI_RETRY_SETTINGS } from './retry-settings.js';
import { createGlobTool, createTodoWriteTool } from './session-tools.js';
import { createTaskTool } from './task-tool.js';
import { providerTurnError } from './turn-error.js';

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
  // The OAuth-prompt-shape extension self-gates on the token, so loading it always is a
  // no-op for non-OAuth runs.
  const additionalExtensionPaths: string[] = [BASH_TIMEOUT_EXTENSION_DIR, OAUTH_PROMPT_SHAPE_EXTENSION_DIR];
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

interface ChildUsage {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

/**
 * Usage for one agent: the parent session plus every `task` sub-session it
 * spawned. Sub-sessions keep their own stats, so their spend is accumulated
 * separately and added here.
 */
function totalUsage(session: AgentSession | undefined, childUsage: ChildUsage) {
  const stats = session?.getSessionStats();
  return {
    cost: (stats?.cost ?? 0) + childUsage.cost,
    inputTokens: (stats?.tokens.input ?? 0) + childUsage.inputTokens,
    outputTokens: (stats?.tokens.output ?? 0) + childUsage.outputTokens,
    cacheReadTokens: (stats?.tokens.cacheRead ?? 0) + childUsage.cacheReadTokens,
    cacheWriteTokens: (stats?.tokens.cacheWrite ?? 0) + childUsage.cacheWriteTokens,
  };
}

export interface PiPromptResult {
  result?: string | null | undefined;
  success: boolean;
  duration: number;
  turns?: number | undefined;
  cost: number;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  cacheReadTokens?: number | undefined;
  cacheWriteTokens?: number | undefined;
  model?: string | undefined;
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
      context: { sourceDir, prompt: `${fullPrompt.slice(0, 200)}...`, retryable: isRetryableFailure(err) },
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
  const selection = await resolveModelSelection();
  const resourceLoader = await buildResourceLoader(sourceDir, logger, agentName);
  // Accumulates usage from in-process `task` child sessions so the parent's reported
  // cost includes sub-agent spend (their getSessionStats is separate from ours).
  const childUsage: ChildUsage = { cost: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const customTools: ToolDefinition[] = [
    createTaskTool({
      model: selection.model,
      modelRuntime: selection.modelRuntime,
      cwd: sourceDir,
      onUsage: (usage) => {
        childUsage.cost += usage.cost;
        childUsage.inputTokens += usage.inputTokens;
        childUsage.outputTokens += usage.outputTokens;
        childUsage.cacheReadTokens += usage.cacheReadTokens;
        childUsage.cacheWriteTokens += usage.cacheWriteTokens;
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
  // Declared out here so the catch can bill spend accrued before a failure.
  let session: AgentSession | undefined;

  progress.start();

  try {
    ({ session } = await createAgentSession({
      cwd: sourceDir,
      model: selection.model,
      tools,
      customTools,
      modelRuntime: selection.modelRuntime,
      sessionManager: SessionManager.inMemory(),
      // Temporal owns agent restarts, pi absorbs transport faults (see
      // PI_RETRY_SETTINGS); compaction stays on to guard against context overflow
      // on long agent runs.
      settingsManager: SettingsManager.inMemory({ retry: PI_RETRY_SETTINGS, compaction: { enabled: true } }),
      resourceLoader,
    }));

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
          }
          if (msg.role === 'assistant' && msg.stopReason === 'error') {
            pendingError = pendingError ?? providerTurnError(msg, 'Agent error', selection.model.contextWindow);
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
    const usage = totalUsage(session, childUsage);
    const result = session.getLastAssistantText() ?? null;

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
      cost: usage.cost,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      model: selection.model.id,
      ...(structuredOutput !== undefined && { structuredOutput }),
    };
  } catch (error) {
    // 10. Handle errors — log, write error file, return failure
    const duration = timer.stop();
    const err = error as Error & { code?: string; status?: number };
    await auditLogger.logError(err, duration, turnCount);
    progress.stop();
    outputLines(formatErrorOutput(err, execContext, description, duration, sourceDir, isRetryableFailure(err)));
    await writeErrorLog(err, sourceDir, fullPrompt, duration);

    // A failed agent still spent money — on its own turns and, since Shannon's
    // prompts delegate the heavy work, mostly on `task` sub-agents. Both count
    // toward the run's usage.
    const usage = totalUsage(session, childUsage);

    return {
      error: err.message,
      errorType: err instanceof PentestError && err.code ? err.code : err.constructor.name,
      prompt: `${fullPrompt.slice(0, 100)}...`,
      success: false,
      duration,
      turns: turnCount,
      cost: usage.cost,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      retryable: isRetryableFailure(err),
    };
  }
}
