// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type Dir, type Dirent, constants as fsConstants, type Stats } from 'node:fs';
import { type FileHandle, lstat, open, opendir, realpath } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_OPERATION_TIMEOUT_MS = 2_000;
const DEFAULT_MAX_DEPTH = 32;
const DEFAULT_MAX_ENTRIES = 10_000;
const DEFAULT_MAX_FILE_BYTES = 1_048_576;
const MAX_OPERATION_TIMEOUT_MS = 60_000;
const MAX_ENUMERATION_DEPTH = 64;
const MAX_ENUMERATION_ENTRIES = 100_000;
const MAX_CONFIGURED_FILE_BYTES = 8 * 1_048_576;
const MAX_DENY_RULES = 1_000;
const MAX_DENY_LENGTH = 1_024;

/** Stable reasons returned by confined tools without disclosing host paths. */
export type ConfinementErrorCode =
  | 'ABORTED'
  | 'DENIED'
  | 'ESCAPE'
  | 'INVALID_PATH'
  | 'NOT_FOUND'
  | 'NOT_REGULAR_FILE'
  | 'NOT_DIRECTORY'
  | 'RACE_DETECTED'
  | 'TOO_LARGE'
  | 'TOO_MANY_ENTRIES'
  | 'TOO_DEEP'
  | 'TIMED_OUT';

/** A bounded confinement failure whose message never contains a requested or host path. */
export class ConfinementError extends Error {
  override readonly name = 'ConfinementError';

  constructor(
    readonly code: ConfinementErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface RepositoryConfinementOptions {
  readonly repositoryRoot: string;
  readonly deniedPaths?: readonly string[];
  readonly operationTimeoutMs?: number;
  readonly maxDepth?: number;
  readonly maxEntries?: number;
  readonly maxFileBytes?: number;
}

export interface ConfinedFile {
  readonly bytes: Buffer;
  readonly path: string;
  readonly truncated: boolean;
}

export interface ConfinedEntry {
  readonly absolutePath: string;
  readonly path: string;
  readonly dirent: Dirent;
}

interface CompiledDeny {
  readonly regex: RegExp;
}

export interface OperationBudget {
  readonly deadline: number;
  readonly signal?: AbortSignal;
}

function confinementError(code: ConfinementErrorCode): ConfinementError {
  switch (code) {
    case 'ABORTED':
      return new ConfinementError(code, 'Repository operation cancelled.');
    case 'DENIED':
      return new ConfinementError(code, 'Repository path is denied by scan policy.');
    case 'ESCAPE':
      return new ConfinementError(code, 'Repository path escapes the configured root.');
    case 'INVALID_PATH':
      return new ConfinementError(code, 'Repository path is invalid.');
    case 'NOT_FOUND':
      return new ConfinementError(code, 'Repository path does not exist.');
    case 'NOT_REGULAR_FILE':
      return new ConfinementError(code, 'Repository path is not a regular file.');
    case 'NOT_DIRECTORY':
      return new ConfinementError(code, 'Repository search root is not a directory.');
    case 'RACE_DETECTED':
      return new ConfinementError(code, 'Repository path changed during access.');
    case 'TOO_LARGE':
      return new ConfinementError(code, 'Repository file exceeds the bounded read limit.');
    case 'TOO_MANY_ENTRIES':
      return new ConfinementError(code, 'Repository enumeration exceeded its entry limit.');
    case 'TOO_DEEP':
      return new ConfinementError(code, 'Repository enumeration exceeded its depth limit.');
    case 'TIMED_OUT':
      return new ConfinementError(code, 'Repository operation exceeded its time limit.');
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}

/** Lexical containment only; callers pair it with realpath to defeat symlinks. */
function isWithin(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  if (relativePath === '') return true;
  if (relativePath === '..' || relativePath.startsWith(`..${path.sep}`)) return false;
  return !path.isAbsolute(relativePath);
}

function escapeRegex(character: string): string {
  return /[\\^$+?.()|{}[\]]/u.test(character) ? `\\${character}` : character;
}

function globToRegexSource(pattern: string): string {
  let source = '';
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        while (pattern[index + 1] === '*') index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
    } else if (character === '?') {
      source += '[^/]';
    } else {
      source += escapeRegex(character ?? '');
    }
  }
  return source;
}

function compileDeny(rawValue: string, realRoot: string): CompiledDeny | undefined {
  const trimmed = rawValue.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_DENY_LENGTH || trimmed.includes('\0') || trimmed.includes('\\')) {
    throw confinementError('INVALID_PATH');
  }

  let normalized = trimmed
    .replace(/^\.\//u, '')
    .replace(/\/{2,}/gu, '/')
    .replace(/\/$/u, '');
  if (path.isAbsolute(normalized)) {
    const relativePath = path.relative(realRoot, path.resolve(normalized));
    // An absolute deny that resolves outside the repository root cannot match
    // anything inside the jail, so it is inert and dropped rather than rejected.
    if (!isWithin(realRoot, path.resolve(normalized))) return undefined;
    normalized = toPosix(relativePath);
  }

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) throw confinementError('INVALID_PATH');

  const containsGlob = normalized.includes('*') || normalized.includes('?');
  if (containsGlob) {
    const source = globToRegexSource(normalized);
    if (normalized.endsWith('/**')) {
      const directorySource = globToRegexSource(normalized.slice(0, -3));
      return { regex: new RegExp(`^(?:${directorySource}|${source})$`, 'u') };
    }
    return { regex: new RegExp(`^(?:${source})$`, 'u') };
  }

  const escaped = normalized
    .split('')
    .map((character) => escapeRegex(character))
    .join('');
  const prefix = normalized.includes('/') ? '' : '(?:.*/)?';
  return { regex: new RegExp(`^${prefix}${escaped}(?:/.*)?$`, 'u') };
}

/** Out-of-range options are rejected outright; clamping would silently weaken a configured bound. */
function boundedOption(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw confinementError('INVALID_PATH');
  return value;
}

function sameIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.isFile() && right.isFile();
}

function sameEntryIdentity(left: Stats, right: Stats): boolean {
  const sameType = (left.isFile() && right.isFile()) || (left.isDirectory() && right.isDirectory());
  return left.dev === right.dev && left.ino === right.ino && sameType;
}

async function lstatForConfinement(target: string, code: ConfinementErrorCode): Promise<Stats> {
  try {
    return await lstat(target);
  } catch {
    throw confinementError(code);
  }
}

async function realpathForConfinement(target: string, code: ConfinementErrorCode): Promise<string> {
  try {
    return await realpath(target);
  } catch {
    throw confinementError(code);
  }
}

function validateRequestedPath(requestedPath: string, allowRoot: boolean): string {
  if (requestedPath.includes('\0') || requestedPath.includes('\\') || path.isAbsolute(requestedPath)) {
    throw confinementError('INVALID_PATH');
  }

  const normalized = requestedPath || '.';
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '..' || segment === '')) {
    throw confinementError('INVALID_PATH');
  }
  if (!allowRoot && segments.every((segment) => segment === '.')) {
    throw confinementError('INVALID_PATH');
  }
  return normalized;
}

/** Realpath-backed, deny-aware repository view shared by every Capella read tool. */
export class RepositoryConfinement {
  private constructor(
    readonly root: string,
    private readonly denies: readonly CompiledDeny[],
    private readonly operationTimeoutMs: number,
    private readonly maxDepth: number,
    private readonly maxEntries: number,
    private readonly maxFileBytes: number,
  ) {}

  static async create(options: RepositoryConfinementOptions): Promise<RepositoryConfinement> {
    if ((options.deniedPaths?.length ?? 0) > MAX_DENY_RULES) throw confinementError('INVALID_PATH');

    let realRoot: string;
    try {
      realRoot = await realpath(options.repositoryRoot);
    } catch {
      throw confinementError('NOT_FOUND');
    }

    const rootStats = await lstatForConfinement(realRoot, 'NOT_FOUND');
    if (!rootStats.isDirectory()) throw confinementError('NOT_DIRECTORY');

    const denies = (options.deniedPaths ?? [])
      .map((value) => compileDeny(value, realRoot))
      .filter((value): value is CompiledDeny => value !== undefined);

    return new RepositoryConfinement(
      realRoot,
      denies,
      boundedOption(options.operationTimeoutMs, DEFAULT_OPERATION_TIMEOUT_MS, MAX_OPERATION_TIMEOUT_MS),
      boundedOption(options.maxDepth, DEFAULT_MAX_DEPTH, MAX_ENUMERATION_DEPTH),
      boundedOption(options.maxEntries, DEFAULT_MAX_ENTRIES, MAX_ENUMERATION_ENTRIES),
      boundedOption(options.maxFileBytes, DEFAULT_MAX_FILE_BYTES, MAX_CONFIGURED_FILE_BYTES),
    );
  }

  relativePath(absolutePath: string): string {
    if (!isWithin(this.root, absolutePath)) throw confinementError('ESCAPE');
    const relativePath = toPosix(path.relative(this.root, absolutePath));
    return relativePath || '.';
  }

  isDenied(relativePath: string): boolean {
    const normalized = relativePath.replace(/^\.\//u, '');
    return this.denies.some(({ regex }) => regex.test(normalized));
  }

  createBudget(signal?: AbortSignal): OperationBudget {
    return {
      deadline: Date.now() + this.operationTimeoutMs,
      ...(signal && { signal }),
    };
  }

  checkBudget(budget: OperationBudget): void {
    if (budget.signal?.aborted) throw confinementError('ABORTED');
    if (Date.now() > budget.deadline) throw confinementError('TIMED_OUT');
  }

  async resolveExisting(requestedPath: string, expectDirectory: boolean, budget?: OperationBudget): Promise<string> {
    if (budget) this.checkBudget(budget);
    const normalized = validateRequestedPath(requestedPath, expectDirectory);
    const lexicalPath = path.resolve(this.root, normalized);
    if (!isWithin(this.root, lexicalPath)) throw confinementError('ESCAPE');

    let resolvedPath: string;
    try {
      resolvedPath = await realpath(lexicalPath);
    } catch {
      throw confinementError('NOT_FOUND');
    }
    if (budget) this.checkBudget(budget);
    if (!isWithin(this.root, resolvedPath)) throw confinementError('ESCAPE');

    const requestedRelativePath = this.relativePath(lexicalPath);
    const relativePath = this.relativePath(resolvedPath);
    if (this.isDenied(requestedRelativePath) || this.isDenied(relativePath)) throw confinementError('DENIED');

    const stats = await lstatForConfinement(resolvedPath, 'NOT_FOUND');
    if (budget) this.checkBudget(budget);
    if (stats.isSymbolicLink()) throw confinementError('RACE_DETECTED');
    if (expectDirectory && !stats.isDirectory()) throw confinementError('NOT_DIRECTORY');
    if (!expectDirectory && !stats.isFile()) throw confinementError('NOT_REGULAR_FILE');
    return resolvedPath;
  }

  async readFile(requestedPath: string, signal?: AbortSignal, maximumBytes = this.maxFileBytes): Promise<ConfinedFile> {
    const budget = this.createBudget(signal);
    this.checkBudget(budget);
    const resolvedPath = await this.resolveExisting(requestedPath, false, budget);
    return this.readResolvedFile(resolvedPath, budget, maximumBytes);
  }

  async readResolvedFile(
    resolvedPath: string,
    budget: OperationBudget,
    maximumBytes = this.maxFileBytes,
  ): Promise<ConfinedFile> {
    this.checkBudget(budget);
    if (!isWithin(this.root, resolvedPath)) throw confinementError('ESCAPE');
    const relativePath = this.relativePath(resolvedPath);
    if (this.isDenied(relativePath)) throw confinementError('DENIED');

    // TOCTOU defense: lstat before opening, then require the open descriptor,
    // the re-resolved path, and (on Linux) the descriptor's /proc target to all
    // agree on one file identity inside the root. A swap at any point reads as
    // RACE_DETECTED rather than serving bytes from outside the jail.
    let before: Stats;
    try {
      before = await lstat(resolvedPath);
    } catch {
      throw confinementError('NOT_FOUND');
    }
    if (!before.isFile() || before.isSymbolicLink()) throw confinementError('NOT_REGULAR_FILE');

    let handle: FileHandle | undefined;
    try {
      handle = await open(resolvedPath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
      const opened = await handle.stat();
      if (!sameIdentity(before, opened)) throw confinementError('RACE_DETECTED');

      const afterOpenPath = await realpath(resolvedPath);
      if (afterOpenPath !== resolvedPath || !isWithin(this.root, afterOpenPath)) {
        throw confinementError('RACE_DETECTED');
      }

      if (process.platform === 'linux') {
        try {
          const descriptorPath = await realpath(`/proc/self/fd/${handle.fd}`);
          if (descriptorPath !== resolvedPath || !isWithin(this.root, descriptorPath)) {
            throw confinementError('RACE_DETECTED');
          }
        } catch (error) {
          if (error instanceof ConfinementError) throw error;
          throw confinementError('RACE_DETECTED');
        }
      }

      const byteLimit = Math.min(Math.max(1, maximumBytes), this.maxFileBytes);
      // One byte beyond the limit distinguishes a file exactly at the limit from a truncated one.
      const output = Buffer.allocUnsafe(byteLimit + 1);
      let offset = 0;
      while (offset < output.length) {
        this.checkBudget(budget);
        const readResult = await handle.read(output, offset, output.length - offset, offset);
        if (readResult.bytesRead === 0) break;
        offset += readResult.bytesRead;
      }

      const afterRead = await handle.stat();
      if (!sameIdentity(opened, afterRead)) throw confinementError('RACE_DETECTED');
      const finalPath = await realpath(resolvedPath);
      if (finalPath !== resolvedPath || !isWithin(this.root, finalPath)) throw confinementError('RACE_DETECTED');

      const truncated = offset > byteLimit;
      return {
        bytes: output.subarray(0, Math.min(offset, byteLimit)),
        path: relativePath,
        truncated,
      };
    } catch (error) {
      if (error instanceof ConfinementError) throw error;
      // Unknown filesystem failures surface as RACE_DETECTED so no errno or host path escapes.
      throw confinementError('RACE_DETECTED');
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  async enumerate(
    requestedRoot: string,
    signal?: AbortSignal,
    operationBudget?: OperationBudget,
  ): Promise<readonly ConfinedEntry[]> {
    const budget = operationBudget ?? this.createBudget(signal);
    this.checkBudget(budget);
    const searchRoot = await this.resolveExisting(requestedRoot || '.', true, budget);
    const entries: ConfinedEntry[] = [];
    const pending: Array<{ absolutePath: string; depth: number }> = [{ absolutePath: searchRoot, depth: 0 }];
    let visited = 0;

    while (pending.length > 0) {
      this.checkBudget(budget);
      const current = pending.pop();
      if (!current) break;
      if (current.depth > this.maxDepth) throw confinementError('TOO_DEEP');

      const directoryBefore = await lstatForConfinement(current.absolutePath, 'RACE_DETECTED');
      this.checkBudget(budget);
      if (!directoryBefore.isDirectory() || directoryBefore.isSymbolicLink()) {
        throw confinementError('RACE_DETECTED');
      }
      const currentRealPath = await realpathForConfinement(current.absolutePath, 'RACE_DETECTED');
      if (currentRealPath !== current.absolutePath || !isWithin(this.root, currentRealPath)) {
        throw confinementError('RACE_DETECTED');
      }
      // A denied directory is pruned silently; its subtree simply does not exist to the tools.
      const currentRelativePath = this.relativePath(currentRealPath);
      if (this.isDenied(currentRelativePath)) continue;

      let directory: Dir;
      try {
        directory = await opendir(currentRealPath);
      } catch {
        throw confinementError('RACE_DETECTED');
      }
      try {
        for await (const dirent of directory) {
          this.checkBudget(budget);
          visited += 1;
          if (visited > this.maxEntries) throw confinementError('TOO_MANY_ENTRIES');
          // Symlinks are skipped, not errors: the jail exposes only what physically lives under the root.
          if (dirent.isSymbolicLink()) continue;

          const absolutePath = path.join(currentRealPath, dirent.name);
          const entryBefore = await lstatForConfinement(absolutePath, 'RACE_DETECTED');
          this.checkBudget(budget);
          if (entryBefore.isSymbolicLink()) continue;

          const resolvedEntryPath = await realpathForConfinement(absolutePath, 'RACE_DETECTED');
          this.checkBudget(budget);
          if (resolvedEntryPath !== absolutePath || !isWithin(this.root, resolvedEntryPath)) {
            throw confinementError('RACE_DETECTED');
          }
          const entryAfter = await lstatForConfinement(resolvedEntryPath, 'RACE_DETECTED');
          this.checkBudget(budget);
          if (!sameEntryIdentity(entryBefore, entryAfter)) throw confinementError('RACE_DETECTED');

          const relativePath = this.relativePath(resolvedEntryPath);
          if (this.isDenied(relativePath)) continue;

          if (entryAfter.isDirectory()) {
            pending.push({ absolutePath: resolvedEntryPath, depth: current.depth + 1 });
          } else if (entryAfter.isFile()) {
            entries.push({ absolutePath: resolvedEntryPath, path: relativePath, dirent });
          }
        }
      } catch (error) {
        if (error instanceof ConfinementError) throw error;
        throw confinementError('RACE_DETECTED');
      } finally {
        await directory.close().catch(() => undefined);
      }

      const directoryAfter = await lstatForConfinement(currentRealPath, 'RACE_DETECTED');
      this.checkBudget(budget);
      if (!sameEntryIdentity(directoryBefore, directoryAfter)) throw confinementError('RACE_DETECTED');
      const finalDirectoryPath = await realpathForConfinement(currentRealPath, 'RACE_DETECTED');
      if (finalDirectoryPath !== currentRealPath || !isWithin(this.root, finalDirectoryPath)) {
        throw confinementError('RACE_DETECTED');
      }
    }

    // Traversal order is a LIFO stack; sorting makes the result deterministic for callers.
    entries.sort((left, right) => left.path.localeCompare(right.path));
    return entries;
  }
}

/** Convert a bounded glob accepted by find/grep into a deterministic matcher. */
export function compileRepositoryGlob(pattern: string): RegExp {
  if (
    !pattern ||
    pattern.length > 256 ||
    pattern.includes('\0') ||
    pattern.includes('\\') ||
    path.isAbsolute(pattern) ||
    pattern.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw confinementError('INVALID_PATH');
  }
  return new RegExp(`^${globToRegexSource(pattern)}$`, 'u');
}
