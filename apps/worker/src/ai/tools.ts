// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Universal custom tools registered for every agent: `task` and `todo_write`.
 *
 * These replace the previous harness built-ins that pi does not ship. `task`
 * delegates a focused sub-task to an in-process child session (the Task sub-agent
 * replacement); `todo_write` is a full-state-replace planning scratchpad mirrored
 * to the workflow log.
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
import type { AuditLogger } from './audit-logger.js';

/** Tool surface for child sessions: read/search plus `write`+`bash` to author and run scripts. */
const CHILD_TOOLS = ['read', 'grep', 'find', 'ls', 'write', 'bash'];

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
}

/**
 * The `task` tool — launch a new agent to handle a multi-step task autonomously.
 *
 * Spawns an in-process child session, drives it to completion, and returns its
 * final text. Marked `parallel` for one-turn fan-out. Children get no `task` of
 * their own — delegation is one level.
 */
export function createTaskTool(ctx: TaskToolContext): ToolDefinition {
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
      try {
        await child.prompt(params.prompt);
        const text = child.getLastAssistantText() ?? '(sub-agent produced no output)';
        return { content: [{ type: 'text' as const, text }], details: {} };
      } finally {
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

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

/** Render a todo list as a compact checklist for the workflow log. */
function renderTodos(todos: readonly TodoItem[]): string {
  const mark = (s: TodoItem['status']): string => (s === 'completed' ? 'x' : s === 'in_progress' ? '~' : ' ');
  return todos.map((t) => `[${mark(t.status)}] ${t.content}`).join('  ');
}

/**
 * The `todo_write` tool — a full-state-replace planning scratchpad.
 *
 * Mirrors the TodoWrite tool: each call carries the entire list and replaces
 * stored state (no append/merge). No deliverable impact; every call is echoed to
 * the workflow log so `shannon logs` shows the agent's live plan. State is per
 * tool instance (one per agent execution).
 */
export function createTodoWriteTool(auditLogger: AuditLogger): ToolDefinition {
  let current: TodoItem[] = [];
  return defineTool({
    name: 'todo_write',
    label: 'Todo Write',
    description:
      'Use this tool to create and manage a structured task list for your current session. This helps you ' +
      'track progress and organize complex, multi-step work, and gives visibility into what you are doing. ' +
      'Pass the COMPLETE todo list on every call — it replaces the stored list entirely (no append or merge). ' +
      'Each todo has a status of pending, in_progress, or completed; keep exactly one task in_progress at a ' +
      'time and mark a task completed as soon as it is finished.',
    promptSnippet: 'todo_write: create and manage a structured task list',
    parameters: Type.Object({
      todos: Type.Array(
        Type.Object({
          content: Type.String({ description: 'Imperative task description, e.g. "Map SSRF sinks".' }),
          status: Type.Union([Type.Literal('pending'), Type.Literal('in_progress'), Type.Literal('completed')]),
          activeForm: Type.String({ description: 'Present-continuous form, e.g. "Mapping SSRF sinks".' }),
        }),
      ),
    }),
    execute: async (_toolCallId, params) => {
      current = params.todos as TodoItem[];
      const completed = current.filter((t) => t.status === 'completed').length;
      await auditLogger.logNote('todo', renderTodos(current));
      return {
        content: [{ type: 'text' as const, text: `Todos updated (${current.length} items, ${completed} completed).` }],
        details: {},
      };
    },
  });
}
