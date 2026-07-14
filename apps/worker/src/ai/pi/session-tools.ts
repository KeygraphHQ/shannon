// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Per-session custom tools registered for every agent: `todo_write` and `glob`.
 *
 * These replace harness built-ins that pi does not ship. `todo_write` is a
 * full-state-replace planning scratchpad mirrored to the workflow log; `glob` is
 * fast-glob file matching (pi has no `Glob` built-in).
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { fs, glob, path } from 'zx';

import type { AuditLogger } from '../audit-logger.js';

export interface TodoItem {
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  activeForm: string;
}

function renderTodos(todos: readonly TodoItem[]): string {
  const mark = (status: TodoItem['status']): string => {
    if (status === 'completed') return 'x';
    if (status === 'in_progress') return '~';
    return ' ';
  };
  return todos.map((todo) => `[${mark(todo.status)}] ${todo.content}`).join('  ');
}

export function createTodoWriteTool(auditLogger: AuditLogger): ToolDefinition {
  let current: TodoItem[] = [];

  return defineTool({
    name: 'todo_write',
    label: 'Todo Write',
    description:
      'Use this tool to create and manage a structured task list for your current session. ' +
      'Pass the complete todo list on every call; it replaces the stored list entirely. Each ' +
      'todo has a status of pending, in_progress, or completed.',
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
    async execute(_toolCallId, params) {
      current = params.todos as TodoItem[];
      const completed = current.filter((todo) => todo.status === 'completed').length;
      await auditLogger.logNote('todo', renderTodos(current));
      return {
        content: [
          {
            type: 'text' as const,
            text: `Todos updated (${current.length} items, ${completed} completed).`,
          },
        ],
        details: undefined,
      };
    },
  });
}

export function createGlobTool(cwd: string): ToolDefinition {
  return defineTool({
    name: 'glob',
    label: 'Glob',
    description:
      'Fast file pattern matching. Supports glob patterns like "**/*.ts" or "src/**/*.{js,ts}". ' +
      'Returns matching file paths sorted by modification time, most recent first.',
    promptSnippet: 'glob: find files by name pattern',
    parameters: Type.Object({
      pattern: Type.String({ description: 'The glob pattern to match files against.' }),
      path: Type.Optional(Type.String({ description: 'Directory to search in. Omit for the repository root.' })),
    }),
    async execute(_toolCallId, params) {
      const searchRoot = params.path ? path.resolve(cwd, params.path) : cwd;
      const matches = await glob.globby(params.pattern, {
        cwd: searchRoot,
        absolute: true,
        dot: true,
        onlyFiles: true,
        followSymbolicLinks: false,
      });

      if (matches.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No files found' }], details: undefined };
      }

      const withMtime = await Promise.all(
        matches.map(async (file) => {
          try {
            return { file, mtime: (await fs.stat(file)).mtimeMs };
          } catch {
            return { file, mtime: 0 };
          }
        }),
      );
      withMtime.sort((a, b) => b.mtime - a.mtime);

      return {
        content: [{ type: 'text' as const, text: withMtime.map((match) => match.file).join('\n') }],
        details: undefined,
      };
    },
  });
}
