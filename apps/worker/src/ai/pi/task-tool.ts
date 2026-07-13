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
import type { Api, Model } from '@earendil-works/pi-ai';
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
   * Mutable accumulator: each child (sub-agent) session's cost is added here so the
   * parent executor can include sub-agent spend in its reported cost. Child sessions
   * keep their own `getSessionStats`, separate from the parent's.
   */
  childUsage?: { cost: number };
  /** Maximum `task` delegations allowed per parent session. Defaults to 10. */
  maxTasksPerSession?: number;
  /** When aborted, in-flight child sessions are torn down. */
  cancellationSignal?: AbortSignal;
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
        return {
          content: [
            {
              type: 'text' as const,
              text: `[Task budget exhausted: ${maxTasks} tasks already spawned. Work with the results you have.]`,
            },
          ],
          details: {},
        };
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

      try {
        await child.prompt(params.prompt);
        const text = child.getLastAssistantText() ?? '(sub-agent produced no output)';
        return { content: [{ type: 'text' as const, text }], details: {} };
      } finally {
        ctx.cancellationSignal?.removeEventListener('abort', abortChildSession);
        // Roll the child's cost up to the parent before disposing (best-effort, and
        // captured in `finally` so a failed child's partial spend still counts).
        if (ctx.childUsage) {
          try {
            ctx.childUsage.cost += child.getSessionStats().cost;
          } catch {
            // ignore — cost capture is best-effort
          }
        }
        child.dispose();
      }
    },
  });
}
