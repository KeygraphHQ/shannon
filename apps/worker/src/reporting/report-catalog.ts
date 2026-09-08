// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { BigIntStats, Dirent } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BundleOperationError, inspectReportBundle } from './bundle.js';
import { MANIFEST_FILE, PRIVATE_FILES, SHARE_FILES } from './bundle-types.js';
import type { CatalogEntry, ReportCatalog } from './catalog-types.js';

export const DEFAULT_CATALOG_LIMITS: ReportCatalog['limits'] = Object.freeze({
  maxDepth: 32,
  maxDirectories: 1000,
  maxBundles: 250,
  maxEntries: 10000,
});

const ARTIFACT_NAMES = new Set<string>([...PRIVATE_FILES, ...SHARE_FILES, MANIFEST_FILE]);
const compare = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
const pathKey = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
const stat = (value: string): Promise<BigIntStats> => fs.lstat(value, { bigint: true });
const sameEntry = (left: BigIntStats, right: BigIntStats): boolean =>
  left.dev === right.dev && left.ino === right.ino && left.birthtimeNs === right.birthtimeNs;

class TraversalError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function directoryIdentity(directory: string): Promise<BigIntStats> {
  let current = directory;
  let identity: BigIntStats | undefined;
  for (;;) {
    const entry = await stat(current);
    if (entry.isSymbolicLink()) throw new TraversalError('linked_directory');
    if (!entry.isDirectory()) throw new TraversalError('not_directory');
    identity ??= entry;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (pathKey(await fs.realpath(directory)) !== pathKey(directory)) throw new TraversalError('aliased_directory');
  return identity as BigIntStats;
}

function catalogLimits(overrides: Partial<ReportCatalog['limits']>): ReportCatalog['limits'] {
  const limits = { ...DEFAULT_CATALOG_LIMITS, ...overrides };
  if (
    Object.keys(overrides).some((key) => !Object.hasOwn(DEFAULT_CATALOG_LIMITS, key)) ||
    Object.entries(limits).some(([key, value]) => !Number.isSafeInteger(value) || value < (key === 'maxDepth' ? 0 : 1))
  )
    throw new BundleOperationError([
      { code: 'invalid_catalog_limits', message: 'Catalog limits must be supported finite nonnegative integers.' },
    ]);
  return limits;
}

/** Read-only bounded inventory. Folder paths are private metadata, never a sanitized share. */
export async function buildReportCatalog(
  input: string,
  overrides: Partial<ReportCatalog['limits']> = {},
): Promise<ReportCatalog> {
  const root = path.resolve(input);
  const limits = catalogLimits(overrides);
  const entries: CatalogEntry[] = [];
  const traversalIssues: { code: string; folder: string }[] = [];
  const queue: { directory: string; depth: number }[] = [{ directory: root, depth: 0 }];
  const folder = (directory: string): string => path.relative(root, directory) || '.';
  const issue = (code: string, directory: string): void => {
    traversalIssues.push({ code, folder: folder(directory) });
  };
  let directoriesVisited = 0;
  let entryCount = 0;
  let exhausted = false;

  for (let position = 0; position < queue.length && !exhausted; position += 1) {
    const item = queue[position];
    if (!item) continue;
    const { directory, depth } = item;
    if (directoriesVisited >= limits.maxDirectories) {
      issue('directory_limit', directory);
      break;
    }
    directoriesVisited += 1;
    try {
      const identity = await directoryIdentity(directory);
      const handle = await fs.opendir(directory);
      const children: Dirent[] = [];
      try {
        for (;;) {
          const child = await handle.read();
          if (!child) break;
          if (entryCount >= limits.maxEntries) {
            issue('entry_limit', directory);
            exhausted = true;
            break;
          }
          entryCount += 1;
          children.push(child);
        }
      } finally {
        await handle.close();
      }
      const after = await directoryIdentity(directory);
      if (!sameEntry(identity, after) || identity.mtimeNs !== after.mtimeNs)
        throw new TraversalError('directory_changed');
      // Do not inspect a partially enumerated bundle: its omitted entries may
      // include companions, child directories or unsupported extra files.
      if (exhausted) break;
      children.sort((left, right) => compare(left.name, right.name));
      if (children.some((child) => ARTIFACT_NAMES.has(child.name))) {
        if (entries.length >= limits.maxBundles) {
          issue('bundle_limit', directory);
          break;
        }
        entries.push({
          id: '',
          folder: folder(directory),
          ...(await inspectReportBundle(directory)),
          duplicateGroup: null,
        });
      }
      for (const child of children) {
        const childPath = path.join(directory, child.name);
        try {
          const childIdentity = await stat(childPath);
          if (childIdentity.isSymbolicLink()) issue('linked_entry', childPath);
          else if (childIdentity.isDirectory()) {
            if (depth >= limits.maxDepth) issue('depth_limit', childPath);
            else queue.push({ directory: childPath, depth: depth + 1 });
          }
        } catch {
          issue('entry_read_failed', childPath);
        }
      }
      const current = await directoryIdentity(directory);
      if (!sameEntry(identity, current) || identity.mtimeNs !== current.mtimeNs)
        throw new TraversalError('directory_changed');
    } catch (error) {
      issue(error instanceof TraversalError ? error.code : 'directory_read_failed', directory);
    }
  }

  entries.sort((left, right) => compare(left.folder, right.folder));
  const groups = new Map<string, number>();
  for (const entry of entries) {
    if (entry.contentId !== null) groups.set(entry.contentId, (groups.get(entry.contentId) ?? 0) + 1);
  }
  const duplicates = new Map(
    [...groups].filter(([, count]) => count > 1).map(([id], index) => [id, `duplicate-${index + 1}`]),
  );
  const catalogEntries = entries.map((entry, index) => ({
    ...entry,
    id: `bundle-${index + 1}`,
    duplicateGroup: entry.contentId === null ? null : (duplicates.get(entry.contentId) ?? null),
  }));
  traversalIssues.sort((left, right) => compare(left.folder, right.folder) || compare(left.code, right.code));
  return {
    schemaVersion: 1,
    kind: 'private-report-catalog',
    root,
    generatedAt: new Date().toISOString(),
    complete: traversalIssues.length === 0,
    limits,
    directoriesVisited,
    entries: catalogEntries,
    traversalIssues,
    totals: {
      bundles: entries.length,
      valid: entries.filter((entry) => entry.check.valid).length,
      invalid: entries.filter((entry) => !entry.check.valid).length,
      integrityMatched: entries.filter((entry) => entry.check.integrity === 'matched').length,
      integrityUnavailable: entries.filter((entry) => entry.check.integrity === 'unavailable').length,
      integrityFailed: entries.filter((entry) => entry.check.integrity === 'failed').length,
      duplicateGroups: duplicates.size,
      duplicateCopies: [...groups.values()].reduce((total, count) => total + Math.max(0, count - 1), 0),
      provenanceAvailable: entries.filter((entry) => entry.summary?.provenance === 'available').length,
      provenanceUnavailable: entries.filter((entry) => entry.summary?.provenance === 'unavailable').length,
      provenanceUnknown: entries.filter((entry) => entry.summary === null).length,
    },
  };
}
