// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Built-in tools for OpenAI-compatible provider.
 * Replicates the core capabilities of the Claude Agent SDK's built-in toolset.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import type { Dirent } from 'fs';
import { fs, path } from 'zx';

const execAsync = promisify(exec);

const BASH_TIMEOUT_MS = 60000; // 1 minute
const BASH_MAX_OUTPUT = 500 * 1024; // 500KB
const SEARCH_MAX_FILES = 1000;
const SEARCH_MAX_MATCHES = 100;

export interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, { type: string; description?: string; items?: { type: string } }>;
      required?: string[];
    };
  };
}

export interface ToolHandlerContext {
  cwd: string;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
) => Promise<string>;

function resolvePath(cwd: string, relativePath: string): string {
  const resolved = path.resolve(cwd, relativePath);
  if (!resolved.startsWith(path.resolve(cwd))) {
    throw new Error(`Path traversal not allowed: ${relativePath}`);
  }
  return resolved;
}

async function bashHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const command = args.command;
  if (typeof command !== 'string' || !command.trim()) {
    return JSON.stringify({ error: 'Missing or invalid command' });
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: ctx.cwd,
      timeout: BASH_TIMEOUT_MS,
      maxBuffer: BASH_MAX_OUTPUT,
      shell: '/bin/bash',
    });

    const output = [stdout, stderr].filter(Boolean).join('\n').trim();
    return output || '(command completed with no output)';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Command failed: ${message}` });
  }
}

async function readFileHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const filePath = args.path;
  if (typeof filePath !== 'string') {
    return JSON.stringify({ error: 'Missing path' });
  }

  try {
    const resolved = resolvePath(ctx.cwd, filePath);
    const content = await fs.readFile(resolved, 'utf-8');

    const startLine = typeof args.start_line === 'number' ? args.start_line : undefined;
    const endLine = typeof args.end_line === 'number' ? args.end_line : undefined;

    if (startLine !== undefined || endLine !== undefined) {
      const lines = content.split('\n');
      const start = Math.max(0, (startLine ?? 1) - 1);
      const end = endLine !== undefined ? Math.min(lines.length, endLine) : lines.length;
      return lines.slice(start, end).join('\n');
    }

    return content;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Failed to read file: ${message}` });
  }
}

async function writeFileHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const filePath = args.path;
  const contents = args.contents;

  if (typeof filePath !== 'string') {
    return JSON.stringify({ error: 'Missing path' });
  }
  if (typeof contents !== 'string') {
    return JSON.stringify({ error: 'Missing contents' });
  }

  try {
    const resolved = resolvePath(ctx.cwd, filePath);
    await fs.writeFile(resolved, contents, 'utf-8');
    return JSON.stringify({ success: true, path: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Failed to write file: ${message}` });
  }
}

async function editFileHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const filePath = args.path;
  const oldString = args.old_string;
  const newString = args.new_string;

  if (typeof filePath !== 'string') {
    return JSON.stringify({ error: 'Missing path' });
  }
  if (typeof oldString !== 'string') {
    return JSON.stringify({ error: 'Missing old_string' });
  }
  if (typeof newString !== 'string') {
    return JSON.stringify({ error: 'Missing new_string' });
  }

  try {
    const resolved = resolvePath(ctx.cwd, filePath);
    const content = await fs.readFile(resolved, 'utf-8');

    if (!content.includes(oldString)) {
      return JSON.stringify({ error: 'old_string not found in file' });
    }

    const newContent = content.replace(oldString, newString);
    await fs.writeFile(resolved, newContent, 'utf-8');
    return JSON.stringify({ success: true, path: resolved });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Failed to edit file: ${message}` });
  }
}

async function searchFilesHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const pattern = args.pattern;
  const directory = args.directory;

  if (typeof pattern !== 'string') {
    return JSON.stringify({ error: 'Missing pattern' });
  }

  const patternStr = pattern;

  const searchDir = typeof directory === 'string'
    ? resolvePath(ctx.cwd, directory)
    : ctx.cwd;

  try {
    const results: Array<{ path: string; line: number; content: string }> = [];
    let fileCount = 0;

    async function searchDirRecursive(dir: string): Promise<void> {
      if (fileCount >= SEARCH_MAX_FILES || results.length >= SEARCH_MAX_MATCHES) return;

      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (fileCount >= SEARCH_MAX_FILES || results.length >= SEARCH_MAX_MATCHES) return;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const base = path.basename(entry.name);
          if (base === 'node_modules' || base === '.git' || base === 'dist' || base === 'build') continue;
          await searchDirRecursive(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length && results.length < SEARCH_MAX_MATCHES; i++) {
              const line = lines[i] ?? '';
              if (new RegExp(patternStr, 'i').test(line)) {
                results.push({
                  path: path.relative(ctx.cwd, fullPath),
                  line: i + 1,
                  content: line.trim(),
                });
              }
            }
          } catch {
            // Skip binary/unreadable files
          }
        }
      }
    }

    await searchDirRecursive(searchDir);

    return JSON.stringify({
      matches: results,
      truncated: results.length >= SEARCH_MAX_MATCHES,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Search failed: ${message}` });
  }
}

async function listDirectoryHandler(
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const directory = args.path;

  if (typeof directory !== 'string') {
    return JSON.stringify({ error: 'Missing path' });
  }

  try {
    const resolved = resolvePath(ctx.cwd, directory);
    const entries = await fs.readdir(resolved, { withFileTypes: true });

    const items = entries.map((e: Dirent) => ({
      name: e.name,
      type: e.isDirectory() ? 'directory' : 'file',
    }));

    return JSON.stringify({ path: directory, items });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Failed to list directory: ${message}` });
  }
}

const BUILTIN_TOOLS: Array<{
  definition: OpenAITool;
  handler: ToolHandler;
}> = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'bash',
        description: 'Execute a bash command in the project directory. Use for running scripts, package managers, and system commands.',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Bash command to execute' },
          },
          required: ['command'],
        },
      },
    },
    handler: bashHandler,
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'read_file',
        description: 'Read contents of a file. Optionally specify line range with start_line and end_line.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to file (relative to project root)' },
            start_line: { type: 'number', description: 'Optional first line to read (1-indexed)' },
            end_line: { type: 'number', description: 'Optional last line to read (1-indexed)' },
          },
          required: ['path'],
        },
      },
    },
    handler: readFileHandler,
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'write_file',
        description: 'Write or overwrite file contents.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to file (relative to project root)' },
            contents: { type: 'string', description: 'Content to write' },
          },
          required: ['path', 'contents'],
        },
      },
    },
    handler: writeFileHandler,
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'edit_file',
        description: 'Replace old_string with new_string in a file. Use for precise edits.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to file (relative to project root)' },
            old_string: { type: 'string', description: 'Exact string to replace' },
            new_string: { type: 'string', description: 'Replacement string' },
          },
          required: ['path', 'old_string', 'new_string'],
        },
      },
    },
    handler: editFileHandler,
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'search_files',
        description: 'Search for a regex pattern across files in a directory. Returns matching lines with file paths and line numbers.',
        parameters: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Regex pattern to search for' },
            directory: { type: 'string', description: 'Optional directory to search (default: project root)' },
          },
          required: ['pattern'],
        },
      },
    },
    handler: searchFilesHandler,
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_directory',
        description: 'List contents of a directory.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Path to directory (relative to project root)' },
          },
          required: ['path'],
        },
      },
    },
    handler: listDirectoryHandler,
  },
];

export function getBuiltinOpenAITools(): OpenAITool[] {
  return BUILTIN_TOOLS.map((t) => t.definition);
}

export async function executeBuiltinTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolHandlerContext
): Promise<string> {
  const tool = BUILTIN_TOOLS.find((t) => t.definition.function.name === name);
  if (!tool) {
    return JSON.stringify({ error: `Unknown built-in tool: ${name}` });
  }
  return tool.handler(args, ctx);
}

export function isBuiltinTool(name: string): boolean {
  return BUILTIN_TOOLS.some((t) => t.definition.function.name === name);
}
