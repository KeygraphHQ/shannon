// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Attempt-local working-tree copy used by the task-formation model boundary. */

import type { Dirent, Stats } from 'node:fs';
import { cp, lstat, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArtifactIntegrityError, ReconciliationIoError } from '../reconciliation/artifact-store.js';

const JAIL_PREFIX = 'shannon-task-formation-';
const ALWAYS_EXCLUDED_NAMES = Object.freeze(['.git', '.shannon', '.pi'] as const);

export interface SourceJailOptions {
  readonly sourceRoot: string;
  readonly deliverablesPath: string;
  readonly reconciliationWorkspacePath: string;
  readonly signal?: AbortSignal;
  /** Test-only filesystem selector. Production uses `os.tmpdir()`. */
  readonly tempRoot?: string;
}

/** One source-only jail plus the immutable deny rules used by its live tool gate. */
export interface SourceJail {
  readonly dir: string;
  readonly deniedPaths: readonly string[];
  cleanup(): Promise<void>;
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('Task formation was cancelled.', 'AbortError');
}

function checkCancellation(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw cancellationError(signal);
}

function isWithin(root: string, candidate: string): boolean {
  const relativePath = path.relative(root, candidate);
  return (
    relativePath === '' ||
    (!relativePath.startsWith(`..${path.sep}`) && relativePath !== '..' && !path.isAbsolute(relativePath))
  );
}

async function relativeExclusion(
  sourceRoot: string,
  lexicalSourceRoot: string,
  candidate: string,
): Promise<string | undefined> {
  const resolved = path.resolve(candidate);
  let relativePath: string | undefined;
  if (isWithin(sourceRoot, resolved)) {
    relativePath = path.relative(sourceRoot, resolved);
  } else if (isWithin(lexicalSourceRoot, resolved)) {
    relativePath = path.relative(lexicalSourceRoot, resolved);
  } else {
    try {
      const canonicalCandidate = await realpath(resolved);
      if (isWithin(sourceRoot, canonicalCandidate)) {
        relativePath = path.relative(sourceRoot, canonicalCandidate);
      }
    } catch {
      return undefined;
    }
  }
  if (relativePath === undefined) return undefined;

  if (relativePath === '') {
    throw new ArtifactIntegrityError('A task-formation exclusion resolves to the complete source root');
  }
  return relativePath;
}

async function buildDynamicExclusions(
  options: SourceJailOptions,
  sourceRoot: string,
  lexicalSourceRoot: string,
): Promise<readonly string[]> {
  const exclusions = (
    await Promise.all([
      relativeExclusion(sourceRoot, lexicalSourceRoot, options.deliverablesPath),
      relativeExclusion(sourceRoot, lexicalSourceRoot, options.reconciliationWorkspacePath),
    ])
  ).filter((value): value is string => value !== undefined);
  return Object.freeze([...new Set(exclusions)]);
}

function pathHasAlwaysExcludedName(relativePath: string): boolean {
  const segments = relativePath.split(path.sep);
  return segments.some((segment) => (ALWAYS_EXCLUDED_NAMES as readonly string[]).includes(segment));
}

function pathIsDynamicallyExcluded(relativePath: string, exclusions: readonly string[]): boolean {
  return exclusions.some((excluded) => relativePath === excluded || relativePath.startsWith(`${excluded}${path.sep}`));
}

async function copySourceTree(
  sourceRoot: string,
  destination: string,
  dynamicExclusions: readonly string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(sourceRoot, { withFileTypes: true })).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  } catch {
    throw new ReconciliationIoError('Unable to enumerate the task-formation source tree');
  }

  for (const entry of entries) {
    checkCancellation(signal);
    const source = path.join(sourceRoot, entry.name);
    const destinationEntry = path.join(destination, entry.name);
    try {
      await cp(source, destinationEntry, {
        recursive: true,
        verbatimSymlinks: true,
        errorOnExist: true,
        force: false,
        async filter(candidate) {
          checkCancellation(signal);
          const relativePath = path.relative(sourceRoot, candidate);
          if (relativePath === '' || !isWithin(sourceRoot, path.resolve(candidate))) return false;
          if (pathHasAlwaysExcludedName(relativePath)) return false;
          return !pathIsDynamicallyExcluded(relativePath, dynamicExclusions);
        },
      });
    } catch (error) {
      if (signal?.aborted === true) throw cancellationError(signal);
      if (error instanceof ArtifactIntegrityError) throw error;
      throw new ReconciliationIoError('Unable to copy the task-formation source tree');
    }
  }
  checkCancellation(signal);
}

async function assertAlwaysExcludedNamesAbsent(directory: string, signal: AbortSignal | undefined): Promise<void> {
  checkCancellation(signal);
  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    throw new ReconciliationIoError('Unable to verify the task-formation source jail');
  }

  for (const entry of entries) {
    checkCancellation(signal);
    if ((ALWAYS_EXCLUDED_NAMES as readonly string[]).includes(entry.name)) {
      throw new ArtifactIntegrityError('The task-formation source jail contains an excluded entry');
    }
    if (entry.isDirectory() && !entry.isSymbolicLink()) {
      await assertAlwaysExcludedNamesAbsent(path.join(directory, entry.name), signal);
    }
  }
}

async function assertDynamicExclusionsAbsent(
  directory: string,
  exclusions: readonly string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  for (const excluded of exclusions) {
    checkCancellation(signal);
    try {
      await lstat(path.join(directory, excluded));
    } catch (error) {
      if (isErrno(error, 'ENOENT')) continue;
      throw new ReconciliationIoError('Unable to verify a task-formation jail exclusion');
    }
    throw new ArtifactIntegrityError('The task-formation source jail contains a protected workspace entry');
  }
}

async function verifyJail(
  directory: string,
  dynamicExclusions: readonly string[],
  signal: AbortSignal | undefined,
): Promise<void> {
  checkCancellation(signal);
  let stats: Stats;
  try {
    stats = await lstat(directory);
  } catch {
    throw new ReconciliationIoError('Unable to inspect the task-formation source jail');
  }
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new ArtifactIntegrityError('The task-formation source jail is not a real directory');
  }
  await assertAlwaysExcludedNamesAbsent(directory, signal);
  await assertDynamicExclusionsAbsent(directory, dynamicExclusions, signal);
  checkCancellation(signal);
}

async function removeJail(directory: string): Promise<void> {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch {
    throw new ReconciliationIoError('Unable to remove the task-formation source jail');
  }

  try {
    await lstat(directory);
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return;
    throw new ReconciliationIoError('Unable to verify task-formation source-jail cleanup');
  }
  throw new ReconciliationIoError('Task-formation source-jail cleanup left the jail on disk');
}

/**
 * Copy the scanned working tree into an isolated temporary directory without following symlinks.
 * Every failure removes the attempt-local directory before it propagates.
 */
export async function materializeSourceJail(options: SourceJailOptions): Promise<SourceJail> {
  checkCancellation(options.signal);

  const lexicalSourceRoot = path.resolve(options.sourceRoot);
  let sourceRoot: string;
  try {
    sourceRoot = await realpath(options.sourceRoot);
    const sourceStats = await lstat(sourceRoot);
    if (sourceStats.isSymbolicLink() || !sourceStats.isDirectory()) {
      throw new ArtifactIntegrityError('The task-formation source root is not a real directory');
    }
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) throw error;
    throw new ReconciliationIoError('Unable to resolve the task-formation source root');
  }

  let tempRoot: string;
  try {
    const configuredTempRoot = options.tempRoot ?? os.tmpdir();
    await mkdir(configuredTempRoot, { recursive: true });
    tempRoot = await realpath(configuredTempRoot);
  } catch {
    throw new ReconciliationIoError('Unable to resolve the task-formation temporary root');
  }
  if (isWithin(sourceRoot, tempRoot)) {
    throw new ArtifactIntegrityError('The task-formation temporary root cannot be inside the source tree');
  }

  const dynamicExclusions = await buildDynamicExclusions(options, sourceRoot, lexicalSourceRoot);
  let directory: string;
  try {
    directory = await mkdtemp(path.join(tempRoot, JAIL_PREFIX));
  } catch {
    throw new ReconciliationIoError('Unable to create the task-formation source jail');
  }

  let cleaned = false;
  const cleanup = async (): Promise<void> => {
    if (cleaned) return;
    await removeJail(directory);
    cleaned = true;
  };

  try {
    await copySourceTree(sourceRoot, directory, dynamicExclusions, options.signal);
    await verifyJail(directory, dynamicExclusions, options.signal);
  } catch (error) {
    await cleanup().catch(() => undefined);
    throw error;
  }

  const deniedPaths = Object.freeze([...ALWAYS_EXCLUDED_NAMES, ...dynamicExclusions]);
  return Object.freeze({ dir: directory, deniedPaths, cleanup });
}
