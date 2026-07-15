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
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import { type AssistantMessage, type Model, Type } from '@earendil-works/pi-ai';
import {
  type AuthStorage,
  createAgentSession,
  defineTool,
  getAgentDir,
  type ModelRegistry,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';

export interface TaskToolContext {
  cwd: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>;
  thinkingLevel?: ThinkingLevel;
  authStorage: AuthStorage;
  /** Explicit model registry for sub-session resolution. Omit to inherit the parent's default. */
  modelRegistry?: ModelRegistry;
  resourceLoader: ResourceLoader;
  cancellationSignal?: AbortSignal | undefined;
  /**
   * Reports the cost/tokens of each spawned sub-session back to the caller.
   * Sub-agents run in their own pi sessions that the parent has no reference to,
   * so without this their spend (the bulk of a whitebox run, since Shannon
   * prompts delegate the heavy work) is invisible to billing.
   */
  onUsage?: (usage: { cost: number; inputTokens: number; outputTokens: number }) => void;
}

const CHILD_TOOLS = ['read', 'grep', 'find', 'ls', 'write', 'bash'];

function textResult(text: string) {
  return { content: [{ type: 'text' as const, text }], details: undefined };
}

export function createTaskTool(config: TaskToolContext): ToolDefinition {
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
      const agentDir = getAgentDir();
      const { session: subSession } = await createAgentSession({
        cwd: config.cwd,
        agentDir,
        resourceLoader: config.resourceLoader,
        model: config.model,
        ...(config.thinkingLevel && { thinkingLevel: config.thinkingLevel }),
        tools: CHILD_TOOLS,
        authStorage: config.authStorage,
        ...(config.modelRegistry && { modelRegistry: config.modelRegistry }),
        sessionManager: SessionManager.inMemory(config.cwd),
        settingsManager: SettingsManager.inMemory({
          retry: { enabled: false },
          compaction: { enabled: true },
        }),
      });

      const abortChildSession = (): void => {
        void subSession.abort().catch(() => {
          // Parent logger is not available inside the tool; dispose still tears
          // down the session if abort itself rejects.
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
      let subInputTokens = 0;
      let subOutputTokens = 0;
      subSession.subscribe((event) => {
        if (event.type === 'turn_end') {
          const msg = event.message as AssistantMessage | undefined;
          for (const block of msg?.content ?? []) {
            if (block.type === 'text' && block.text) {
              resultText += (resultText ? '\n' : '') + block.text;
            }
          }
          if (msg?.usage?.cost?.total != null) subCost += msg.usage.cost.total;
          subInputTokens += msg?.usage?.input ?? 0;
          subOutputTokens += msg?.usage?.output ?? 0;
        }
      });

      let swallowedError: string | undefined;
      try {
        try {
          await subSession.prompt(params.prompt);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          resultText += `\n[Sub-agent error: ${errorMsg}]`;
        }

        swallowedError = subSession.state.errorMessage;
        // Read stats before dispose; reconcile cost the same way the parent does.
        const subStats = subSession.getSessionStats();
        if (subStats.cost > subCost) subCost = subStats.cost;
        config.onUsage?.({ cost: subCost, inputTokens: subInputTokens, outputTokens: subOutputTokens });
      } finally {
        config.cancellationSignal?.removeEventListener('abort', onCancellation);
        subSession.dispose();
      }

      if (swallowedError && !resultText.includes(swallowedError)) {
        resultText += `\n[Sub-agent error: ${swallowedError}]`;
      }

      return textResult(resultText || '[Sub-agent produced no output]');
    },
  });

  return taskTool;
}
