// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Generic exact-path, lost-acknowledgement-safe file publication over a deliverables Git repo. */

import { randomUUID } from 'node:crypto';
import { lstat, mkdtemp, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ActivityLogger } from '../types/activity-logger.js';
import {
  commitExactPaths,
  executeGitCommandWithRetry,
  getGitCommitHash,
  pathsChangedInCommit,
  readCommittedFile,
  restorePathsFromHead,
  withGitRepoLock,
} from './git-manager.js';

export type RenumberErrorType = 'unmappable-survivor' | 'key-set-divergence';

const RENUMBER_ERROR_MESSAGES: Readonly<Record<RenumberErrorType, string>> = Object.freeze({
  'unmappable-survivor': 'A report survivor could not be mapped to one canonical class reference.',
  'key-set-divergence': 'Committed report-facing class artifacts disagree on their reference set.',
});

export interface RenumberErrorDetails {
  readonly checkCode: string;
  readonly [key: string]: unknown;
}

export class RenumberError extends Error {
  readonly retryable: boolean;
  readonly type: RenumberErrorType;
  readonly details?: RenumberErrorDetails;

  constructor(type: RenumberErrorType, retryable: boolean, details?: RenumberErrorDetails) {
    super(RENUMBER_ERROR_MESSAGES[type]);
    this.name = 'RenumberError';
    this.type = type;
    this.retryable = retryable;
    if (details !== undefined) this.details = details;
  }
}

export interface ExactOutputFile {
  readonly relPath: string;
  /** `null` makes absence part of the exact output contract. */
  readonly contents: string | null;
}

export interface ExactOutputCommit {
  readonly commitHash: string;
  readonly changedPaths: readonly string[];
  readonly alreadyCommitted: boolean;
}

function samePathSet(first: readonly string[], second: readonly string[]): boolean {
  return (
    first.length === second.length &&
    new Set(first).size === first.length &&
    first.every((entry) => second.includes(entry))
  );
}

function isErrno(error: unknown, code: string): boolean {
  return error instanceof Error && (error as NodeJS.ErrnoException).code === code;
}

async function rejectSymlinks(dir: string, relPaths: readonly string[]): Promise<void> {
  for (const relPath of relPaths) {
    try {
      if ((await lstat(path.join(dir, relPath))).isSymbolicLink()) {
        throw new RenumberError('key-set-divergence', false, { checkCode: 'output-symlink' });
      }
    } catch (error) {
      if (isErrno(error, 'ENOENT')) continue;
      throw error;
    }
  }
}

async function atomicWriteUnique(absolutePath: string, contents: string): Promise<void> {
  const temporaryPath = `${absolutePath}.tmp-${randomUUID()}`;
  try {
    await writeFile(temporaryPath, contents, { flag: 'wx' });
    await rename(temporaryPath, absolutePath);
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function executeExactGitCommand(
  args: string[],
  dir: string,
  description: string,
): Promise<{ stdout: string; stderr: string }> {
  try {
    return await executeGitCommandWithRetry(args, dir, description);
  } catch (error) {
    throw new Error(`Exact-output Git step failed: ${description}`, { cause: error });
  }
}

async function repairExactPathsFromHead(dir: string, relPaths: readonly string[]): Promise<void> {
  const presentPaths: string[] = [];
  const absentPaths: string[] = [];
  for (const relPath of relPaths) {
    const committed = await readCommittedFile(dir, relPath);
    if (committed.state === 'corrupt') {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'corrupt-output-object' });
    }
    if (committed.state === 'present') presentPaths.push(relPath);
    else absentPaths.push(relPath);
  }
  if (presentPaths.length > 0) await restorePathsFromHead(dir, presentPaths);
  if (absentPaths.length === 0) return;
  for (const relPath of absentPaths) {
    const listed = await executeExactGitCommand(
      ['git', 'ls-files', '--', relPath],
      dir,
      'checking an absent exact-output index path',
    );
    if (listed.stdout.trim() !== '') {
      await executeExactGitCommand(
        ['git', 'update-index', '--force-remove', '--', relPath],
        dir,
        'clearing an absent exact-output path from the index',
      );
    }
  }
  for (const relPath of absentPaths) {
    await unlink(path.join(dir, relPath)).catch((error: unknown) => {
      if (!isErrno(error, 'ENOENT')) throw error;
    });
  }
}

async function commitExactFilesWithTemporaryIndex(
  dir: string,
  files: readonly ExactOutputFile[],
  expectedChangedPaths: readonly string[],
  message: string,
  logger: ActivityLogger,
): Promise<{ commitHash: string; changedPaths: string[] }> {
  const head = await getGitCommitHash(dir);
  if (head === null) throw new Error('Unable to read HEAD for exact-output commit');
  const temporaryDir = await mkdtemp(path.join(tmpdir(), 'shannon-exact-index-'));
  const temporaryIndex = path.join(temporaryDir, 'index');
  const pathsToStage = files
    .filter((file) => file.contents !== null || expectedChangedPaths.includes(file.relPath))
    .map((file) => file.relPath);
  const runWithTemporaryIndex = async (gitArgs: readonly string[], description: string) =>
    executeExactGitCommand(['env', `GIT_INDEX_FILE=${temporaryIndex}`, 'git', ...gitArgs], dir, description);

  try {
    await runWithTemporaryIndex(['read-tree', head], 'initializing an exact-output temporary index');
    await runWithTemporaryIndex(['add', '-A', '--', ...pathsToStage], 'staging exact outputs in a temporary index');
    const tree = (await runWithTemporaryIndex(['write-tree'], 'writing the exact-output tree')).stdout.trim();
    const commitHash = (
      await executeExactGitCommand(
        ['git', 'commit-tree', tree, '-p', head, '-m', message],
        dir,
        'creating the exact-output commit object',
      )
    ).stdout.trim();
    const changedPaths = await pathsChangedInCommit(dir, commitHash);
    if (!samePathSet(changedPaths, expectedChangedPaths)) {
      throw new RenumberError('key-set-divergence', false, { checkCode: 'changed-path-set-mismatch' });
    }
    await executeExactGitCommand(
      ['git', 'update-ref', 'HEAD', commitHash, head],
      dir,
      'advancing HEAD to the exact-output commit',
    );
    for (const file of files) {
      if (file.contents === null) {
        const listed = await executeExactGitCommand(
          ['git', 'ls-files', '--', file.relPath],
          dir,
          'checking an exact-output deletion in the index',
        );
        if (listed.stdout.trim() !== '') {
          await executeExactGitCommand(
            ['git', 'update-index', '--force-remove', '--', file.relPath],
            dir,
            'recording an exact-output deletion in the index',
          );
        }
      } else {
        await executeExactGitCommand(
          ['git', 'add', '--', file.relPath],
          dir,
          'refreshing an exact-output path in the index',
        );
      }
    }
    logger.info(`Path-limited commit ${commitHash.slice(0, 8)} changed ${changedPaths.length} path(s)`);
    return { commitHash, changedPaths };
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

/** Exact-path, lost-acknowledgement-safe publication used by both transforms. */
export async function writeAndCommitExactFiles(
  dir: string,
  files: readonly ExactOutputFile[],
  message: string,
  logger: ActivityLogger,
  options: {
    readonly afterCommit?: (commit: { commitHash: string; changedPaths: readonly string[] }) => void | Promise<void>;
  } = {},
): Promise<ExactOutputCommit> {
  if (files.length === 0) throw new Error('writeAndCommitExactFiles requires at least one file');
  const relPaths = files.map((file) => file.relPath);
  if (
    relPaths.some(
      (relPath) =>
        relPath.length === 0 ||
        path.isAbsolute(relPath) ||
        relPath.includes('\0') ||
        relPath.split(/[\\/]/).some((segment) => segment === '' || segment === '.' || segment === '..'),
    )
  ) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'unsafe-output-path' });
  }
  if (new Set(relPaths).size !== relPaths.length) {
    throw new RenumberError('key-set-divergence', false, { checkCode: 'duplicate-output-path' });
  }

  return withGitRepoLock(async () => {
    await rejectSymlinks(dir, relPaths);
    const expectedChangedPaths: string[] = [];
    let allCommitted = true;
    for (const file of files) {
      const committed = await readCommittedFile(dir, file.relPath);
      if (committed.state === 'corrupt') {
        throw new RenumberError('key-set-divergence', false, { checkCode: 'corrupt-output-object' });
      }
      const matches =
        file.contents === null
          ? committed.state === 'absent'
          : committed.state === 'present' && committed.contents === file.contents;
      if (!matches) {
        allCommitted = false;
        expectedChangedPaths.push(file.relPath);
      }
    }

    if (allCommitted) {
      await repairExactPathsFromHead(dir, relPaths);
      const commitHash = await getGitCommitHash(dir);
      if (commitHash === null) throw new Error('Unable to read the existing exact-output commit');
      return { commitHash, changedPaths: [], alreadyCommitted: true };
    }

    try {
      for (const file of files) {
        const absolutePath = path.join(dir, file.relPath);
        if (file.contents === null) {
          await unlink(absolutePath).catch((error: unknown) => {
            if (!isErrno(error, 'ENOENT')) throw error;
          });
        } else {
          await atomicWriteUnique(absolutePath, file.contents);
        }
      }
      const committed = files.some((file) => file.contents === null)
        ? await commitExactFilesWithTemporaryIndex(dir, files, expectedChangedPaths, message, logger)
        : await commitExactPaths(dir, relPaths, message, logger);
      if (!samePathSet(committed.changedPaths, expectedChangedPaths)) {
        throw new RenumberError('key-set-divergence', false, { checkCode: 'changed-path-set-mismatch' });
      }
      await options.afterCommit?.(committed);
      for (const file of files) {
        const verified = await readCommittedFile(dir, file.relPath);
        const matches =
          file.contents === null
            ? verified.state === 'absent'
            : verified.state === 'present' && verified.contents === file.contents;
        if (!matches) {
          throw new RenumberError('key-set-divergence', false, { checkCode: 'committed-byte-mismatch' });
        }
      }
      return { ...committed, alreadyCommitted: false };
    } catch (error) {
      await repairExactPathsFromHead(dir, relPaths).catch((cleanupError: unknown) => {
        logger.error('Exact-output rollback failed', {
          error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
        });
      });
      throw error;
    }
  });
}
