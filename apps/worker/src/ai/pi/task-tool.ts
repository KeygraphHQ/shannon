// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Generic `task` tool — pi.dev ships no built-in Task tool, so this supplies the
 * Task-delegation surface Shannon's prompts require.
 *
 * Shannon's prompts mandate Task delegation (recon source tracer; the vuln
 * agents delegate *every* code review; the exploit agents delegate automation),
 * so this tool is required for parity, not optional. It spawns a nested pi
 * session with the parent's resolved model object (never a tier string — that
 * would route sub-agents through hardcoded IDs and leak billing), the parent's
 * resource loader, and a fixed child tool surface.
 *
 * Sub-sessions report through the parent's audit logger under a `task#N` label,
 * so every delegated tool call and model turn lands in the agent's audit log and
 * in the workflow log, attributable to the sub-session that produced it.
 */

import { type AssistantMessage, type Model, Type } from '@earendil-works/pi-ai';
import {
  type AgentSessionEvent,
  createAgentSession,
  defineTool,
  getAgentDir,
  type ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { AuditLogger } from '../audit-logger.js';
import { PI_RETRY_SETTINGS } from './retry-settings.js';

export interface TaskToolContext {
  cwd: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  /** Parent's model/auth runtime, reused so sub-agents share its resolved credential. */
  modelRuntime: ModelRuntime;
  resourceLoader: ResourceLoader;
  /**
   * Parent agent's audit logger. Sub-agents carry the work Shannon's prompts
   * delegate — custom scripts, payload loops, enumeration workflows — so their
   * tool calls and model output are recorded here instead of vanishing with the
   * sub-session.
   */
  auditLogger: AuditLogger;
  cancellationSignal?: AbortSignal | undefined;
  /**
   * Reports the cost/tokens of each spawned sub-session back to the caller.
   * Sub-agents run in their own pi sessions that the parent has no reference to,
   * so without this their spend (the bulk of a whitebox run, since Shannon
   * prompts delegate the heavy work) is invisible to billing.
   */
  onUsage?: (usage: {
    cost: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  }) => void;
}

const CHILD_TOOLS = ['read', 'grep', 'find', 'ls', 'write', 'bash'];

/** Workflow-log category for sub-session lifecycle notes. */
const TASK_LOG_CATEGORY = 'task';

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: undefined };
}

/** Collapse whitespace and cap length so a value fits on one audit log line. */
function summarizeForLog(text: string, maxLength: number): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= maxLength) return collapsed;
  return `${collapsed.slice(0, maxLength - 3)}...`;
}

/**
 * Attribution label for one sub-session, e.g. `task#2 (trace login flow)`.
 * Prefixed onto every audit entry a sub-session produces so a reader can tell
 * child work from the parent agent's own, and one child from another when
 * several run in parallel.
 */
function childSessionLabel(ordinal: number, description: string | undefined): string {
  const summary = description ? summarizeForLog(description, 60) : '';
  if (!summary) return `task#${ordinal}`;
  return `task#${ordinal} (${summary})`;
}

export function createTaskTool(config: TaskToolContext): ToolDefinition {
  let spawnedCount = 0;

  const taskTool: ToolDefinition = defineTool({
    name: 'task',
    label: 'Task',
    description:
      'Delegate a focused task to a sub-agent that runs independently with its own tools and returns ' +
      'the result. Use this to break complex work into smaller, parallelizable sub-tasks.',
    executionMode: 'parallel',
    promptSnippet: 'task - Delegate a focused task to a sub-agent with read, grep, find, ls, write, and bash.',
    promptGuidelines: [
      'Use the task tool to delegate focused work: code review, reconnaissance, automation scripting, validation.',
      'Pass all necessary context in the "prompt" parameter — the sub-agent cannot see your conversation history.',
      'The sub-agent can use read, grep, find, ls, write, and bash, but cannot call task or custom collector tools.',
      'You can launch multiple task tool calls in a single message to run sub-tasks in parallel.',
    ],
    parameters: Type.Object({
      prompt: Type.String({
        description: 'The task for the sub-agent to perform. Include all necessary context.',
      }),
      description: Type.Optional(Type.String({ description: 'A short (3-5 word) description of the task.' })),
    }),
    async execute(_toolCallId, params) {
      spawnedCount += 1;
      const label = childSessionLabel(spawnedCount, params.description);
      void config.auditLogger.logNote(TASK_LOG_CATEGORY, `${label} delegated: ${summarizeForLog(params.prompt, 200)}`);

      const agentDir = getAgentDir();
      const { session: subSession } = await createAgentSession({
        cwd: config.cwd,
        agentDir,
        resourceLoader: config.resourceLoader,
        model: config.model,
        tools: CHILD_TOOLS,
        modelRuntime: config.modelRuntime,
        sessionManager: SessionManager.inMemory(config.cwd),
        settingsManager: SettingsManager.inMemory({
          retry: PI_RETRY_SETTINGS,
          compaction: { enabled: true },
        }),
      });

      const abortChildSession = (): void => {
        void config.auditLogger.logNote(TASK_LOG_CATEGORY, `${label} aborted: parent activity cancelled`);
        void subSession.abort().catch(() => {
          // Dispose still tears down the session if abort itself rejects.
        });
      };
      const onCancellation = (): void => abortChildSession();
      if (config.cancellationSignal?.aborted) {
        abortChildSession();
      } else {
        config.cancellationSignal?.addEventListener('abort', onCancellation, { once: true });
      }

      let resultText = '';
      let subCost = 0;
      let childTurn = 0;
      subSession.subscribe((event: AgentSessionEvent) => {
        switch (event.type) {
          case 'turn_end': {
            childTurn += 1;
            const msg = event.message as AssistantMessage | undefined;
            let turnText = '';
            for (const block of msg?.content ?? []) {
              if (block.type === 'text' && block.text) {
                turnText += (turnText ? '\n' : '') + block.text;
              }
            }
            if (turnText) {
              resultText += (resultText ? '\n' : '') + turnText;
            }
            if (turnText.trim()) {
              void config.auditLogger.logLlmResponse(childTurn, `[${label}] ${turnText}`);
            }
            if (msg?.usage?.cost?.total != null) subCost += msg.usage.cost.total;
            break;
          }
          case 'tool_execution_start':
            void config.auditLogger.logToolStart(`${label} > ${event.toolName}`, event.args);
            break;
          case 'tool_execution_end':
            void config.auditLogger.logToolEnd({
              session: label,
              toolName: event.toolName,
              isError: event.isError,
              result: event.result,
            });
            break;
          default:
            break;
        }
      });

      let swallowedError: string | undefined;
      let promptError: string | undefined;
      try {
        try {
          await subSession.prompt(params.prompt);
        } catch (err) {
          promptError = err instanceof Error ? err.message : String(err);
          resultText += `\n[Sub-agent error: ${promptError}]`;
        }

        swallowedError = subSession.state.errorMessage;
        // Read stats before dispose; reconcile cost the same way the parent does.
        const subStats = subSession.getSessionStats();
        if (subStats.cost > subCost) subCost = subStats.cost;
        config.onUsage?.({
          cost: subCost,
          inputTokens: subStats.tokens.input,
          outputTokens: subStats.tokens.output,
          cacheReadTokens: subStats.tokens.cacheRead,
          cacheWriteTokens: subStats.tokens.cacheWrite,
        });
      } finally {
        config.cancellationSignal?.removeEventListener('abort', onCancellation);
        subSession.dispose();
      }

      if (swallowedError && !resultText.includes(swallowedError)) {
        resultText += `\n[Sub-agent error: ${swallowedError}]`;
      }

      const failure = promptError ?? swallowedError;
      const outcome = failure ? `failed: ${summarizeForLog(failure, 200)}` : 'completed';
      void config.auditLogger.logNote(
        TASK_LOG_CATEGORY,
        `${label} ${outcome} (${childTurn} turns, $${subCost.toFixed(4)})`,
      );

      return textResult(resultText || '[Sub-agent produced no output]');
    },
  });

  return taskTool;
}
