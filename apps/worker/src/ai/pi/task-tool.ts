// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The `task` custom tool: delegates a focused sub-task to an in-process child
 * session (the Task sub-agent replacement pi does not ship as a built-in).
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai';
import {
  type AuthStorage,
  createAgentSession,
  defineTool,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

/** Tool surface for child sessions: read/search plus `write`+`bash` to author and run scripts. */
const CHILD_TOOLS = ['read', 'grep', 'find', 'ls', 'write', 'bash'];

/** Cap on `task` delegations per parent session — guards against unbounded fan-out. */
const MAX_TASKS_PER_SESSION = 10;

export interface TaskToolContext {
  model: Model<Api>;
  thinkingLevel: ThinkingLevel;
  authStorage: AuthStorage;
  cwd: string;
  /** When set, child sessions inherit the code_path deny policy. */
  resourceLoader?: ResourceLoader;
  /**
   * Reports each spawned child (sub-agent) session's usage back to the caller.
   * Sub-agents run in their own pi sessions the parent has no reference to, so
   * without this their spend — the bulk of a run, since the heavy work is
   * delegated — is invisible to the parent's cost accounting. Fired once per
   * child, in the `finally`, so a failed child's partial spend still counts.
   */
  onUsage?: (usage: { cost: number; inputTokens: number; outputTokens: number }) => void;
  /** Maximum `task` delegations allowed per parent session. Defaults to 10. */
  maxTasksPerSession?: number;
  /** When aborted, in-flight child sessions are torn down. */
  cancellationSignal?: AbortSignal;
}

function textResult(text: string): { content: { type: 'text'; text: string }[]; details: Record<string, never> } {
  return { content: [{ type: 'text' as const, text }], details: {} };
}

/**
 * The `task` tool — launch a new agent to handle a multi-step task autonomously.
 *
 * Spawns an in-process child session, drives it to completion, and returns its
 * final text. Marked `parallel` for one-turn fan-out. Children get no `task` of
 * their own — delegation is one level.
 */
export function createTaskTool(ctx: TaskToolContext): ToolDefinition {
  const maxTasks = ctx.maxTasksPerSession ?? MAX_TASKS_PER_SESSION;
  let taskCount = 0;

  return defineTool({
    name: 'task',
    label: 'Task',
    description:
      'Launch a new agent to handle complex, multi-step tasks autonomously. The agent runs on its own and ' +
      'its final report is returned to you as the tool result (it is not shown to the user). Each invocation ' +
      'is stateless — you cannot send follow-up messages, so give a complete, detailed instruction in a single ' +
      'prompt and specify exactly what information the agent should return. Launch multiple agents concurrently ' +
      'by issuing multiple task calls in a single message.',
    promptSnippet: 'task: launch a new agent to handle a multi-step task',
    executionMode: 'parallel',
    parameters: Type.Object({
      description: Type.Optional(Type.String({ description: 'Short (3-5 word) label for the delegated sub-task.' })),
      prompt: Type.String({ description: 'The full instruction for the sub-agent.' }),
    }),
    execute: async (_toolCallId, params) => {
      taskCount++;
      if (taskCount > maxTasks) {
        return textResult(
          `[Task budget exhausted: ${maxTasks} tasks already spawned. Work with the results you have.]`,
        );
      }

      const { session: child } = await createAgentSession({
        cwd: ctx.cwd,
        model: ctx.model,
        thinkingLevel: ctx.thinkingLevel,
        tools: CHILD_TOOLS,
        authStorage: ctx.authStorage,
        sessionManager: SessionManager.inMemory(),
        settingsManager: SettingsManager.inMemory({
          retry: { enabled: false },
          compaction: { enabled: true },
        }),
        ...(ctx.resourceLoader && { resourceLoader: ctx.resourceLoader }),
      });

      // Tear down the child session if the caller cancels mid-run; `dispose` in the
      // `finally` still cleans up if `abort` itself rejects.
      const abortChildSession = (): void => {
        void child.abort().catch(() => {});
      };
      if (ctx.cancellationSignal?.aborted) {
        abortChildSession();
      } else {
        ctx.cancellationSignal?.addEventListener('abort', abortChildSession, { once: true });
      }

      // Collect the child's output and per-turn usage from its own event stream —
      // the parent has no other handle on a sub-session's cost or tokens.
      let resultText = '';
      let childCost = 0;
      let childInputTokens = 0;
      let childOutputTokens = 0;
      child.subscribe((event) => {
        if (event.type !== 'turn_end') return;
        const msg = event.message as AssistantMessage | undefined;
        for (const block of msg?.content ?? []) {
          if (block.type === 'text' && block.text) {
            resultText += (resultText ? '\n' : '') + block.text;
          }
        }
        if (msg?.usage?.cost?.total != null) childCost += msg.usage.cost.total;
        childInputTokens += msg?.usage?.input ?? 0;
        childOutputTokens += msg?.usage?.output ?? 0;
      });

      try {
        try {
          await child.prompt(params.prompt);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          resultText += `${resultText ? '\n' : ''}[Sub-agent error: ${errorMsg}]`;
        }

        // Reconcile against the session's own tally, which may exceed the summed
        // turn events (e.g. compaction spend), before reporting upward.
        const stats = child.getSessionStats();
        if (stats.cost > childCost) childCost = stats.cost;
        ctx.onUsage?.({ cost: childCost, inputTokens: childInputTokens, outputTokens: childOutputTokens });

        const swallowedError = child.state.errorMessage;
        if (swallowedError && !resultText.includes(swallowedError)) {
          resultText += `${resultText ? '\n' : ''}[Sub-agent error: ${swallowedError}]`;
        }
        return textResult(resultText || '(sub-agent produced no output)');
      } finally {
        ctx.cancellationSignal?.removeEventListener('abort', abortChildSession);
        child.dispose();
      }
    },
  });
}
