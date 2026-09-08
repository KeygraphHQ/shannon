// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { Dir, Stats } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { types } from 'node:util';
import { reviewerIdentity, reviewFileForRepository } from './repository-file.js';
import {
  CONVENTIONAL_NAMES,
  EXCLUDED_DIRECTORIES,
  type FileSelector,
  REPOSITORY_LIMITS,
  type RepositoryDiagnostic,
  type RepositoryLimits,
  type RepositoryOptions,
  type RepositoryPolicy,
  type RepositorySnapshot,
  type SnapshotFile,
} from './repository-types.js';
import { failedResult } from './result.js';
import { sealSnapshot } from './snapshot.js';
import { DEFAULT_LIMITS, type ReviewFormat, type ReviewResult } from './types.js';

export { CONVENTIONAL_NAMES, EXCLUDED_DIRECTORIES, REPOSITORY_LIMITS } from './repository-types.js';

const OPTION_ERROR = 'Invalid repository options.';
const DEADLINE_ERROR = 'Repository processing deadline exceeded.';
const MESSAGES: Record<string, string> = {
  'invalid-root': 'The repository root must be a readable real local directory.',
  'linked-path': 'A linked or aliased path was skipped without following it.',
  'unreadable-entry': 'A filesystem entry could not be inspected or read.',
  'unsafe-path': 'A filesystem entry has an unsupported portable path.',
  'source-changed': 'A filesystem entry changed during discovery or review.',
  'selection-missing': 'An explicit selection was not found as a reviewable regular file.',
  'entry-limit': 'Discovery reached the filesystem entry limit; inventory is incomplete.',
  'depth-limit': 'A directory exceeded the discovery depth limit.',
  'file-limit': 'A supported file exceeded the selected file count limit.',
  'byte-limit': 'A supported file exceeded the aggregate selected byte limit.',
  'report-limit': 'Further discovery omissions exceeded the bounded diagnostic capacity.',
};

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function portable(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 4096 || /[\\:<>"|?*]/.test(value)) return false;
  if ([...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) return false;
  return value
    .split('/')
    .every(
      (segment) =>
        segment !== '' &&
        segment !== '.' &&
        segment !== '..' &&
        !/[. ]$/.test(segment) &&
        !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(segment),
    );
}

function dataObject(value: unknown, keys: readonly string[]): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value))
    throw new Error(OPTION_ERROR);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new Error(OPTION_ERROR);
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !keys.includes(key)))
    throw new Error(OPTION_ERROR);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value)))
    if (!('value' in descriptor) || !descriptor.enumerable) throw new Error(OPTION_ERROR);
}

function normalize(options: RepositoryOptions): { policy: RepositoryPolicy; limits: RepositoryLimits } {
  dataObject(options, ['include', 'exclude', 'limits']);
  const limits = { ...REPOSITORY_LIMITS };
  if (options.limits !== undefined) {
    dataObject(options.limits, Object.keys(REPOSITORY_LIMITS));
    for (const key of Object.keys(options.limits) as (keyof RepositoryLimits)[]) {
      const value = options.limits[key];
      if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > REPOSITORY_LIMITS[key])
        throw new Error(OPTION_ERROR);
      limits[key] = value;
    }
  }
  const includes = new Map<string, FileSelector>();
  if (options.include !== undefined) {
    if (
      !Array.isArray(options.include) ||
      options.include.length > REPOSITORY_LIMITS.maxFiles ||
      types.isProxy(options.include)
    )
      throw new Error(OPTION_ERROR);
    for (const selector of options.include) {
      dataObject(selector, ['format', 'path']);
      if (!portable(selector.path) || (selector.format !== 'openapi' && selector.format !== 'compose'))
        throw new Error(OPTION_ERROR);
      if (includes.has(selector.path) && includes.get(selector.path)?.format !== selector.format)
        throw new Error(OPTION_ERROR);
      includes.set(selector.path, { format: selector.format, path: selector.path });
    }
  }
  const excludes = new Set<string>();
  if (options.exclude !== undefined) {
    if (
      !Array.isArray(options.exclude) ||
      options.exclude.length > REPOSITORY_LIMITS.maxEntries ||
      types.isProxy(options.exclude)
    )
      throw new Error(OPTION_ERROR);
    for (const excluded of options.exclude) {
      if (!portable(excluded)) throw new Error(OPTION_ERROR);
      excludes.add(excluded);
    }
  }
  return {
    limits,
    policy: {
      conventionalNames: [...CONVENTIONAL_NAMES],
      excludedDirectories: [...EXCLUDED_DIRECTORIES],
      includes: [...includes.values()].sort((a, b) => compare(a.path, b.path)),
      excludes: [...excludes].sort(compare),
    },
  };
}

class DeadlineError extends Error {
  constructor() {
    super(DEADLINE_ERROR);
  }
}

class BoundaryError extends Error {
  constructor(readonly reason: 'linked-path' | 'source-changed') {
    super(reason);
  }
}

interface Candidate {
  readonly path: string;
  readonly format: ReviewFormat;
  readonly stat: Stats;
}

/** Finite local declaration discovery. Reviewed data never controls commands, imports or external reads. */
export async function reviewRepository(root: string, options: RepositoryOptions = {}): Promise<RepositorySnapshot> {
  const started = Date.now();
  const { policy, limits } = normalize(options);
  const deadline = started + limits.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  const check = (): void => {
    if (Date.now() >= deadline) controller.abort();
    if (controller.signal.aborted) throw new DeadlineError();
  };
  // A timed-out filesystem promise may settle later. Its only allowed continuation is handle cleanup.
  const bounded = async <T>(operation: () => Promise<T>, cleanup?: (value: T) => void): Promise<T> => {
    check();
    let abort: () => void = () => {};
    const stopped = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new DeadlineError());
      controller.signal.addEventListener('abort', abort, { once: true });
    });
    const running = operation();
    try {
      const value = await Promise.race([running, stopped]);
      check();
      return value;
    } catch (error) {
      if (controller.signal.aborted && cleanup) void running.then(cleanup, () => {});
      throw error;
    } finally {
      controller.signal.removeEventListener('abort', abort);
    }
  };

  try {
    const reviewer = await bounded(() => reviewerIdentity(controller.signal));
    check();
    const rootPath =
      typeof root === 'string' &&
      root.length > 0 &&
      !root.includes('\0') &&
      !(process.platform === 'win32' && (/^[\\/]{2}/.test(root) || root.replace(/^[a-z]:/i, '').includes(':')))
        ? path.resolve(root)
        : null;
    let incomplete = false;
    let failedRoot = false;
    let entriesVisited = 0;
    let selectedBytes = 0;
    let ignoredFiles = 0;
    const skipped = new Map<string, { path: string; reason: string }>();
    const diagnostics = new Map<string, RepositoryDiagnostic>();
    const candidates: Candidate[] = [];
    const files: SnapshotFile[] = [];
    const directoryIdentities = new Map<string, Stats>();
    const encountered = new Set<string>();
    const selections = new Map(policy.includes.map((selection) => [selection.path, selection.format]));
    const absolute = (relative: string): string => path.join(rootPath ?? '', ...relative.split('/'));
    const pathKey = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
    const deliberateExclusion = (relative: string, directory = false): string | null => {
      if (policy.excludes.some((excluded) => relative === excluded || relative.startsWith(`${excluded}/`)))
        return 'excluded-path';
      const segments = relative.split('/');
      if (!directory) segments.pop();
      return segments.some((segment) => policy.excludedDirectories.includes(segment)) ? 'excluded-directory' : null;
    };
    const omit = (relative: string, reason: string): void => {
      const key = `${relative}\0${reason}`;
      if (skipped.has(key)) return;
      if (skipped.size >= REPOSITORY_LIMITS.maxEntries - 1 || diagnostics.size >= REPOSITORY_LIMITS.maxEntries - 1) {
        incomplete = true;
        skipped.set('\0report-limit', { path: '', reason: 'report-limit' });
        diagnostics.set('\0report-limit', {
          code: 'repository/report-limit',
          path: '',
          message: MESSAGES['report-limit'] ?? '',
        });
        return;
      }
      skipped.set(key, { path: relative, reason });
      if (reason !== 'excluded-directory' && reason !== 'excluded-path') {
        incomplete = true;
        diagnostics.set(key, {
          code: `repository/${reason}`,
          path: relative,
          message: MESSAGES[reason] ?? 'Repository discovery could not complete.',
        });
      }
    };
    const directory = async (relative: string): Promise<Stats> => {
      check();
      const name = absolute(relative);
      const stat = await bounded(() => fs.lstat(name));
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new BoundaryError('linked-path');
      const resolved = await bounded(() => fs.realpath(name));
      if (pathKey(resolved) !== pathKey(name)) throw new BoundaryError('linked-path');
      const expected = directoryIdentities.get(relative);
      if (expected && (stat.dev !== expected.dev || stat.ino !== expected.ino))
        throw new BoundaryError('source-changed');
      return stat;
    };
    const directoryChain = async (relative: string): Promise<void> => {
      await directory('');
      let prefix = '';
      for (const segment of relative ? relative.split('/') : []) {
        check();
        prefix = prefix ? `${prefix}/${segment}` : segment;
        await directory(prefix);
      }
      check();
    };
    const reasonFor = (error: unknown): string => (error instanceof BoundaryError ? error.reason : 'unreadable-entry');
    const close = (handle: Dir): void => {
      void handle.close().catch(() => {});
    };
    const walk = async (relative: string, depth: number): Promise<void> => {
      check();
      if (entriesVisited >= limits.maxEntries) {
        omit(relative, 'entry-limit');
        return;
      }
      let handle: Dir | undefined;
      const names: string[] = [];
      let enumerated = false;
      try {
        await directoryChain(relative);
        handle = await bounded(() => fs.opendir(absolute(relative), { bufferSize: 1 }), close);
        await directoryChain(relative);
        while (true) {
          check();
          // Do not read an additional entry merely to determine whether an exhausted directory is empty.
          if (entriesVisited >= limits.maxEntries) {
            omit(relative, 'entry-limit');
            break;
          }
          const opened = handle;
          const entry = await bounded(() => opened.read());
          if (entry === null) {
            enumerated = true;
            break;
          }
          entriesVisited++;
          names.push(entry.name);
        }
      } catch (error) {
        check();
        omit(relative, reasonFor(error));
      } finally {
        if (handle) close(handle);
      }
      check();
      // A truncated native enumeration has no stable order. Preserve its gap, not an arbitrary file prefix.
      if (!enumerated) return;
      names.sort(compare);
      for (const name of names) {
        check();
        const entry = relative ? `${relative}/${name}` : name;
        if (!portable(entry)) {
          omit(relative, 'unsafe-path');
          continue;
        }
        encountered.add(entry);
        const excludedPath = deliberateExclusion(entry);
        if (excludedPath) {
          omit(entry, excludedPath);
          continue;
        }
        let stat: Stats;
        try {
          await directoryChain(relative);
          stat = await bounded(() => fs.lstat(absolute(entry)));
        } catch (error) {
          check();
          omit(entry, reasonFor(error));
          continue;
        }
        check();
        if (stat.isSymbolicLink()) {
          omit(entry, 'linked-path');
          continue;
        }
        if (stat.isDirectory()) {
          const excludedDirectory = deliberateExclusion(entry, true);
          if (excludedDirectory) {
            omit(entry, excludedDirectory);
            continue;
          }
          if (selections.has(entry)) omit(entry, 'selection-missing');
          if (depth >= limits.maxDepth) {
            omit(entry, 'depth-limit');
            continue;
          }
          directoryIdentities.set(entry, stat);
          await walk(entry, depth + 1);
          continue;
        }
        const format =
          selections.get(entry) ??
          (CONVENTIONAL_NAMES.includes(name) ? (name.startsWith('openapi.') ? 'openapi' : 'compose') : null);
        if (format === null) {
          ignoredFiles++;
          continue;
        }
        if (!stat.isFile()) {
          omit(entry, 'unreadable-entry');
          continue;
        }
        if (stat.nlink !== 1) {
          omit(entry, 'linked-path');
          continue;
        }
        if (candidates.length >= limits.maxFiles) {
          omit(entry, 'file-limit');
          continue;
        }
        if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > limits.maxBytes - selectedBytes) {
          omit(entry, 'byte-limit');
          continue;
        }
        selectedBytes += stat.size;
        candidates.push({ path: entry, format, stat });
      }
    };

    if (rootPath === null) {
      failedRoot = true;
      omit('', 'invalid-root');
    } else {
      try {
        directoryIdentities.set('', await directory(''));
      } catch {
        check();
        failedRoot = true;
        omit('', 'invalid-root');
      }
      if (!failedRoot) await walk('', 0);
    }
    check();
    for (const selection of policy.includes) {
      check();
      if (!encountered.has(selection.path) && !deliberateExclusion(selection.path))
        omit(selection.path, 'selection-missing');
    }

    const rebase = (result: ReviewResult, relative: string): ReviewResult => ({
      ...result,
      source: { file: relative },
      issues: result.issues.map((issue) => ({ ...issue, evidence: { ...issue.evidence, file: relative } })),
    });
    let next = 0;
    const reviewNext = async (): Promise<void> => {
      while (next < candidates.length) {
        check();
        const candidate = candidates[next++];
        if (!candidate) return;
        const fileLimits = {
          ...DEFAULT_LIMITS,
          maxBytes: Math.max(1, Math.min(DEFAULT_LIMITS.maxBytes, candidate.stat.size)),
        };
        try {
          await directoryChain(candidate.path.split('/').slice(0, -1).join('/'));
          const current = await bounded(() => fs.lstat(absolute(candidate.path)));
          if (current.isSymbolicLink() || current.nlink !== 1 || !current.isFile())
            throw new BoundaryError('linked-path');
          if (
            current.dev !== candidate.stat.dev ||
            current.ino !== candidate.stat.ino ||
            current.size !== candidate.stat.size ||
            current.mtimeMs !== candidate.stat.mtimeMs ||
            current.ctimeMs !== candidate.stat.ctimeMs
          )
            throw new BoundaryError('source-changed');
          const analysis = await bounded(() =>
            reviewFileForRepository(candidate.format, absolute(candidate.path), fileLimits, controller.signal),
          );
          check();
          if (analysis.bytes !== null && analysis.bytes > candidate.stat.size)
            throw new BoundaryError('source-changed');
          files.push({
            path: candidate.path,
            format: candidate.format,
            sha256: analysis.sha256,
            bytes: analysis.bytes,
            result: rebase(analysis.result, candidate.path),
            observations: analysis.observations.map((observation) => ({
              ...observation,
              issue: { ...observation.issue, evidence: { ...observation.issue.evidence, file: candidate.path } },
            })),
          });
        } catch (error) {
          check();
          omit(candidate.path, reasonFor(error));
          files.push({
            path: candidate.path,
            format: candidate.format,
            sha256: null,
            bytes: null,
            observations: [],
            result: failedResult(
              candidate.format,
              candidate.path,
              fileLimits,
              error instanceof BoundaryError ? 'source_changed' : 'read_failed',
            ),
          });
        }
      }
    };
    await bounded(() =>
      Promise.all(Array.from({ length: Math.min(limits.concurrency, candidates.length) }, () => reviewNext())),
    );
    check();
    const body: Omit<RepositorySnapshot, 'id'> = {
      schemaVersion: 1,
      kind: 'offline-repository-review',
      status: failedRoot
        ? 'failed'
        : incomplete || files.some((file) => file.result.status !== 'completed')
          ? 'partial'
          : 'completed',
      reviewer,
      policy,
      limits,
      discovery: {
        state: incomplete ? 'incomplete' : 'complete',
        entriesVisited,
        selectedBytes,
        ignoredFiles,
        skipped: [...skipped.values()].sort((a, b) => compare(`${a.path}\0${a.reason}`, `${b.path}\0${b.reason}`)),
      },
      files: files.sort((a, b) => compare(a.path, b.path)),
      diagnostics: [...diagnostics.values()].sort((a, b) => compare(`${a.path}\0${a.code}`, `${b.path}\0${b.code}`)),
    };
    check();
    if (Buffer.byteLength(JSON.stringify({ ...body, id: '0'.repeat(64) })) > limits.maxSnapshotBytes)
      throw new Error('Repository snapshot size limit exceeded.');
    check();
    const snapshot = sealSnapshot(body, deadline);
    check();
    return snapshot;
  } catch (error) {
    check();
    throw error;
  } finally {
    controller.abort();
    clearTimeout(timer);
  }
}
