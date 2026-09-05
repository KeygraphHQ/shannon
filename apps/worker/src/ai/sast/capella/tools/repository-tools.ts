// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import path from 'node:path';
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import type { CapellaTool } from '../../../pi/capella-agent-types.js';
import {
  type ConfinedEntry,
  type ConfinedFile,
  ConfinementError,
  compileRepositoryGlob,
  type OperationBudget,
  RepositoryConfinement,
  type RepositoryConfinementOptions,
} from './confinement.js';

const MAX_READ_OUTPUT_BYTES = 64 * 1024;
const MAX_READ_LINES = 1_000;
const MAX_FIND_RESULTS = 500;
const DEFAULT_FIND_RESULTS = 100;
const MAX_GREP_MATCHES = 200;
const DEFAULT_GREP_MATCHES = 100;
const MAX_GREP_CONTEXT = 10;
const MAX_GREP_PATTERN_LENGTH = 256;
const MAX_GREP_LINE_BYTES = 8 * 1024;
const MAX_GREP_OUTPUT_BYTES = 64 * 1024;
const MAX_GREP_SCANNED_BYTES = 2 * 1024 * 1024;

export const CAPELLA_REPOSITORY_TOOL_NAMES = ['read', 'find', 'grep'] as const;

// Tool identity is tracked by reference so the executor can verify a read/find/grep
// definition came from this confined factory rather than trusting its name.
const repositoryTools = new WeakSet<object>();

export interface CapellaRepositoryToolOptions extends RepositoryConfinementOptions {}

interface ReadDetails {
  readonly path: string;
  readonly truncated: boolean;
}

interface FindDetails {
  readonly count: number;
  readonly truncated: boolean;
}

interface GrepDetails {
  readonly matchCount: number;
  readonly filesScanned: number;
  readonly truncated: boolean;
}

function markRepositoryTool<T extends ToolDefinition>(tool: T): T {
  repositoryTools.add(tool);
  return tool;
}

/** Whether a read/find/grep definition came from the confined Capella factory. */
export function isCapellaRepositoryTool(tool: CapellaTool): boolean {
  return repositoryTools.has(tool);
}

/** Truncate to a byte budget without splitting a multi-byte character. */
function boundedText(text: string, maximumBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.byteLength <= maximumBytes) return { text, truncated: false };
  const suffix = `\n[Output truncated at ${maximumBytes} bytes.]`;
  const contentLimit = Math.max(0, maximumBytes - Buffer.byteLength(suffix));
  let prefix = bytes.subarray(0, contentLimit).toString('utf8');
  while (Buffer.byteLength(prefix) > contentLimit) prefix = prefix.slice(0, -1);
  return {
    text: `${prefix}${suffix}`,
    truncated: true,
  };
}

function sliceReadOutput(file: ConfinedFile, offset: number, limit: number): { text: string; truncated: boolean } {
  if (file.bytes.includes(0)) {
    throw new ConfinementError('NOT_REGULAR_FILE', 'Binary repository files are not available to Capella.');
  }

  const normalized = file.bytes.toString('utf8').replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  const start = offset - 1;
  const selected = lines.slice(start, start + limit);
  const bounded = boundedText(selected.join('\n'), MAX_READ_OUTPUT_BYTES);
  const lineTruncated = start + selected.length < lines.length;
  return { text: bounded.text, truncated: file.truncated || lineTruncated || bounded.truncated };
}

function createReadTool(confinement: RepositoryConfinement): ToolDefinition {
  return markRepositoryTool(
    defineTool({
      name: 'read',
      label: 'Read repository file',
      description: 'Read a bounded UTF-8 text file inside the configured repository root.',
      promptSnippet: 'read: inspect a bounded repository text file',
      promptGuidelines: ['Use only repository-relative paths. Absolute paths and traversal are rejected.'],
      parameters: Type.Object(
        {
          path: Type.String({ minLength: 1, maxLength: 1_024 }),
          offset: Type.Optional(Type.Integer({ minimum: 1, maximum: 100_000 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_READ_LINES })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, parameters, signal) {
        const budget = confinement.createBudget(signal);
        const resolvedPath = await confinement.resolveExisting(parameters.path, false, budget);
        const file = await confinement.readResolvedFile(resolvedPath, budget);
        const output = sliceReadOutput(file, parameters.offset ?? 1, parameters.limit ?? MAX_READ_LINES);
        confinement.checkBudget(budget);
        const details: ReadDetails = { path: file.path, truncated: output.truncated };
        return {
          content: [{ type: 'text' as const, text: output.text }],
          details,
        };
      },
    }),
  );
}

function relativeToSearchRoot(searchRoot: string, entry: ConfinedEntry): string {
  const relativePath = path.relative(searchRoot, entry.absolutePath);
  if (relativePath === '' || relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) {
    throw new ConfinementError('RACE_DETECTED', 'Repository path changed during enumeration.');
  }
  return relativePath.split(path.sep).join('/');
}

function createFindTool(confinement: RepositoryConfinement): ToolDefinition {
  return markRepositoryTool(
    defineTool({
      name: 'find',
      label: 'Find repository files',
      description: 'Find bounded repository-relative file paths without following symlinks.',
      promptSnippet: 'find: list repository files matching a bounded glob',
      promptGuidelines: ['Search roots and returned paths are repository-relative.'],
      parameters: Type.Object(
        {
          pattern: Type.String({ minLength: 1, maxLength: 256 }),
          path: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_FIND_RESULTS })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, parameters, signal) {
        const budget = confinement.createBudget(signal);
        const searchRoot = await confinement.resolveExisting(parameters.path ?? '.', true, budget);
        const matcher = compileRepositoryGlob(parameters.pattern);
        const maximumResults = parameters.limit ?? DEFAULT_FIND_RESULTS;
        const entries = await confinement.enumerate(parameters.path ?? '.', signal, budget);
        const matches: string[] = [];
        let resultLimitReached = false;

        for (const entry of entries) {
          confinement.checkBudget(budget);
          const relativeSearchPath = relativeToSearchRoot(searchRoot, entry);
          if (!matcher.test(relativeSearchPath)) continue;
          if (matches.length >= maximumResults) {
            resultLimitReached = true;
            break;
          }
          matches.push(entry.path);
        }

        const bounded = boundedText(matches.join('\n') || 'No files found.', MAX_READ_OUTPUT_BYTES);
        confinement.checkBudget(budget);
        const details: FindDetails = {
          count: matches.length,
          truncated: resultLimitReached || bounded.truncated,
        };
        return { content: [{ type: 'text' as const, text: bounded.text }], details };
      },
    }),
  );
}

/**
 * Restrict grep patterns to a subset with no quantifiers, alternation, groups,
 * or backreferences, so a model-authored pattern cannot trigger catastrophic
 * backtracking against repository text.
 */
function assertSafeRegex(pattern: string): void {
  let escaped = false;
  let insideClass = false;
  for (const character of pattern) {
    if (escaped) {
      if (/[1-9]/u.test(character)) {
        throw new ConfinementError('INVALID_PATH', 'Grep pattern is outside the bounded regular-expression subset.');
      }
      escaped = false;
      continue;
    }
    if (character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '[') {
      insideClass = true;
      continue;
    }
    if (character === ']' && insideClass) {
      insideClass = false;
      continue;
    }
    if (!insideClass && '()*+?{|}'.includes(character)) {
      throw new ConfinementError('INVALID_PATH', 'Grep pattern is outside the bounded regular-expression subset.');
    }
  }
}

function compileGrepPattern(pattern: string, literal: boolean, ignoreCase: boolean): RegExp {
  if (pattern.includes('\0')) {
    throw new ConfinementError('INVALID_PATH', 'Grep pattern is invalid.');
  }
  const flags = ignoreCase ? 'iu' : 'u';
  if (literal) {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(escaped, flags);
  }
  assertSafeRegex(pattern);
  try {
    return new RegExp(pattern, flags);
  } catch {
    throw new ConfinementError('INVALID_PATH', 'Grep pattern is invalid.');
  }
}

function lineForSearch(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.byteLength <= MAX_GREP_LINE_BYTES) return line;
  return bytes.subarray(0, MAX_GREP_LINE_BYTES).toString('utf8');
}

function formatGrepBlock(filePath: string, lines: readonly string[], lineIndex: number, context: number): string[] {
  const output: string[] = [];
  const start = Math.max(0, lineIndex - context);
  const end = Math.min(lines.length - 1, lineIndex + context);
  for (let index = start; index <= end; index += 1) {
    const separator = index === lineIndex ? ':' : '-';
    const bounded = boundedText(lines[index] ?? '', 1_000);
    output.push(`${filePath}${separator}${index + 1}${separator} ${bounded.text}`);
  }
  return output;
}

async function grepCandidate(
  confinement: RepositoryConfinement,
  entry: ConfinedEntry,
  matcher: RegExp,
  context: number,
  remainingMatches: number,
  budget: OperationBudget,
): Promise<{ readonly blocks: string[][]; readonly bytesScanned: number; readonly truncated: boolean }> {
  const file = await confinement.readResolvedFile(entry.absolutePath, budget);
  if (file.bytes.includes(0)) return { blocks: [], bytesScanned: file.bytes.byteLength, truncated: file.truncated };

  const lines = file.bytes.toString('utf8').replace(/\r\n?/gu, '\n').split('\n');
  const blocks: string[][] = [];
  for (let lineIndex = 0; lineIndex < lines.length && blocks.length < remainingMatches; lineIndex += 1) {
    confinement.checkBudget(budget);
    matcher.lastIndex = 0;
    if (!matcher.test(lineForSearch(lines[lineIndex] ?? ''))) continue;
    blocks.push(formatGrepBlock(file.path, lines, lineIndex, context));
  }
  return { blocks, bytesScanned: file.bytes.byteLength, truncated: file.truncated };
}

/**
 * Grep accepts a directory or a single file. Only NOT_DIRECTORY falls through
 * to the single-file path; every other confinement failure propagates.
 */
async function resolveGrepCandidates(
  confinement: RepositoryConfinement,
  requestedPath: string,
  budget: OperationBudget,
): Promise<readonly ConfinedEntry[]> {
  try {
    await confinement.resolveExisting(requestedPath, true, budget);
    return confinement.enumerate(requestedPath, undefined, budget);
  } catch (error) {
    if (!(error instanceof ConfinementError) || error.code !== 'NOT_DIRECTORY') throw error;
  }

  const resolvedPath = await confinement.resolveExisting(requestedPath, false, budget);
  return [
    {
      absolutePath: resolvedPath,
      path: confinement.relativePath(resolvedPath),
      dirent: {
        isFile: () => true,
      } as ConfinedEntry['dirent'],
    },
  ];
}

function createGrepTool(confinement: RepositoryConfinement): ToolDefinition {
  return markRepositoryTool(
    defineTool({
      name: 'grep',
      label: 'Search repository contents',
      description: 'Search bounded repository text through the same no-follow read boundary as read.',
      promptSnippet: 'grep: search bounded repository text',
      promptGuidelines: ['Patterns, search roots, and optional globs are bounded and contain no shell arguments.'],
      parameters: Type.Object(
        {
          pattern: Type.String({ minLength: 1, maxLength: MAX_GREP_PATTERN_LENGTH }),
          path: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
          glob: Type.Optional(Type.String({ minLength: 1, maxLength: 256 })),
          ignoreCase: Type.Optional(Type.Boolean()),
          literal: Type.Optional(Type.Boolean()),
          context: Type.Optional(Type.Integer({ minimum: 0, maximum: MAX_GREP_CONTEXT })),
          limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_GREP_MATCHES })),
        },
        { additionalProperties: false },
      ),
      async execute(_toolCallId, parameters, signal) {
        const matcher = compileGrepPattern(
          parameters.pattern,
          parameters.literal ?? false,
          parameters.ignoreCase ?? false,
        );
        const globMatcher = parameters.glob ? compileRepositoryGlob(parameters.glob) : undefined;
        const maximumMatches = parameters.limit ?? DEFAULT_GREP_MATCHES;
        const budget = confinement.createBudget(signal);
        const candidates = await resolveGrepCandidates(confinement, parameters.path ?? '.', budget);
        const blocks: string[][] = [];
        let filesScanned = 0;
        let bytesScanned = 0;
        let sourceTruncated = false;

        for (const entry of candidates) {
          confinement.checkBudget(budget);
          if (globMatcher && !globMatcher.test(entry.path)) continue;
          if (blocks.length >= maximumMatches || bytesScanned >= MAX_GREP_SCANNED_BYTES) break;

          const result = await grepCandidate(
            confinement,
            entry,
            matcher,
            parameters.context ?? 0,
            maximumMatches - blocks.length,
            budget,
          );
          blocks.push(...result.blocks);
          filesScanned += 1;
          bytesScanned += result.bytesScanned;
          sourceTruncated ||= result.truncated;
        }

        const rawOutput = blocks.map((block) => block.join('\n')).join('\n--\n') || 'No matches found.';
        const bounded = boundedText(rawOutput, MAX_GREP_OUTPUT_BYTES);
        confinement.checkBudget(budget);
        const truncated =
          sourceTruncated ||
          blocks.length >= maximumMatches ||
          bytesScanned >= MAX_GREP_SCANNED_BYTES ||
          bounded.truncated;
        const details: GrepDetails = { matchCount: blocks.length, filesScanned, truncated };
        return { content: [{ type: 'text' as const, text: bounded.text }], details };
      },
    }),
  );
}

/** Create the exact three Capella-owned repository tools for one immutable policy. */
export async function createCapellaRepositoryTools(
  options: CapellaRepositoryToolOptions,
): Promise<readonly CapellaTool[]> {
  const confinement = await RepositoryConfinement.create(options);
  return Object.freeze([createReadTool(confinement), createFindTool(confinement), createGrepTool(confinement)]);
}
