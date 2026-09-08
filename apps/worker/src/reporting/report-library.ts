// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { type BigIntStats, constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BundleOperationError } from './bundle.js';
import { renderReportCatalog } from './catalog-html.js';
import type { ReportCatalog } from './catalog-types.js';
import { buildReportCatalog } from './report-catalog.js';

const key = (value: string): string =>
  process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
const stat = (value: string): Promise<BigIntStats> => fs.lstat(value, { bigint: true });
function same(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.ino === right.ino &&
    (left.dev === right.dev ||
      (process.platform === 'win32' && (left.dev === 0n || right.dev === 0n) && left.birthtimeNs === right.birthtimeNs))
  );
}
function fail(code: string, message: string): BundleOperationError {
  return new BundleOperationError([{ code, message }]);
}
async function realDirectory(value: string): Promise<string> {
  const absolute = path.resolve(value);
  let current = absolute;
  for (;;) {
    const entry = await stat(current);
    if (!entry.isDirectory() || entry.isSymbolicLink())
      throw fail('unsafe_directory', 'Library paths and ancestors must be real directories.');
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const resolved = await fs.realpath(absolute);
  if (key(resolved) !== key(absolute)) throw fail('unsafe_directory', 'Unsupported directory alias.');
  return resolved;
}
function beneath(child: string, parent: string): boolean {
  const relative = path.relative(key(parent), key(child));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

export interface LibraryExportIo {
  /** The exporter exclusively owns the handle and verifies the resulting bytes. */
  writeFile(handle: FileHandle, bytes: Buffer): Promise<void>;
}

/** Write an offline private snapshot to a new sibling directory; never modify source evidence. */
export async function exportReportLibrary(
  source: string,
  destination: string,
  io: LibraryExportIo = { writeFile: (handle, bytes) => handle.writeFile(bytes) },
): Promise<ReportCatalog> {
  const target = path.resolve(destination);
  let owner: BigIntStats | undefined;
  const written: { name: string; owner: BigIntStats }[] = [];
  let parent: string | undefined;
  try {
    const root = await realDirectory(source);
    parent = await realDirectory(path.dirname(target));
    if (beneath(root, target) || beneath(target, root))
      throw fail('overlapping_destination', 'Library destination must not overlap its source root.');
    try {
      await stat(target);
      throw fail('destination_exists', 'Library destination already exists. Choose a new directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const catalog = await buildReportCatalog(root);
    if (!catalog.complete)
      throw fail(
        'catalog_incomplete',
        'Directory discovery was incomplete. Inspect the catalog command result before exporting.',
      );
    const files: Readonly<Record<string, Buffer>> = {
      'catalog.json': Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`),
      'index.html': Buffer.from(renderReportCatalog(catalog)),
    };
    await realDirectory(parent);
    await fs.mkdir(target, { mode: 0o700 });
    owner = await stat(target);
    for (const [name, bytes] of Object.entries(files)) {
      await realDirectory(target);
      if (!same(owner, await stat(target))) throw fail('destination_changed', 'Library destination ownership changed.');
      const handle = await fs.open(path.join(target, name), 'wx+', 0o600);
      try {
        written.push({ name, owner: await handle.stat({ bigint: true }) });
        await io.writeFile(handle, bytes);
        const actual = Buffer.alloc(bytes.length);
        let offset = 0;
        while (offset < actual.length) {
          const { bytesRead } = await handle.read(actual, offset, actual.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        const entry = await stat(path.join(target, name));
        const opened = await handle.stat({ bigint: true });
        if (
          offset !== bytes.length ||
          opened.size !== BigInt(bytes.length) ||
          !actual.equals(bytes) ||
          !same(opened, entry) ||
          entry.isSymbolicLink() ||
          entry.nlink !== 1n
        )
          throw fail('write_verification_failed', 'Library output bytes could not be verified.');
      } finally {
        await handle.close();
      }
    }
    await realDirectory(target);
    if (!same(owner, await stat(target)) || (await fs.readdir(target)).length !== 2)
      throw fail('destination_changed', 'Library destination changed during export.');
    // Verify the complete publication again after all writes, including earlier files.
    for (const file of written) {
      const entry = await stat(path.join(target, file.name));
      if (entry.isSymbolicLink() || entry.nlink !== 1n || !same(entry, file.owner))
        throw fail('destination_changed', 'Library output ownership changed.');
      const handle = await fs.open(
        path.join(target, file.name),
        constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW),
      );
      try {
        const bytes = files[file.name] as Buffer;
        const actual = Buffer.alloc(bytes.length + 1);
        let offset = 0;
        while (offset < actual.length) {
          const { bytesRead } = await handle.read(actual, offset, actual.length - offset, offset);
          if (!bytesRead) break;
          offset += bytesRead;
        }
        const opened = await handle.stat({ bigint: true });
        const current = await stat(path.join(target, file.name));
        if (
          !same(opened, file.owner) ||
          !same(current, file.owner) ||
          current.nlink !== 1n ||
          current.isSymbolicLink() ||
          offset !== bytes.length ||
          opened.size !== BigInt(bytes.length) ||
          !actual.subarray(0, offset).equals(bytes)
        )
          throw fail('write_verification_failed', 'Library publication bytes changed.');
      } finally {
        await handle.close();
      }
    }
    await realDirectory(target);
    if (!same(owner, await stat(target))) throw fail('destination_changed', 'Library destination ownership changed.');
    return catalog;
  } catch (error) {
    const issues =
      error instanceof BundleOperationError
        ? [...error.issues]
        : [
            {
              code: (error as NodeJS.ErrnoException).code === 'EEXIST' ? 'destination_exists' : 'library_failed',
              message: 'Library export could not finish. Diagnostics omit input values.',
            },
          ];
    if (owner) {
      try {
        await realDirectory(target);
        if (!same(owner, await stat(target)) || key(path.dirname(await fs.realpath(target))) !== key(parent as string))
          throw new Error('changed owner');
        for (const file of written) {
          try {
            const entry = await stat(path.join(target, file.name));
            if (!entry.isSymbolicLink() && same(entry, file.owner)) await fs.unlink(path.join(target, file.name));
          } catch (cleanupError) {
            if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') throw cleanupError;
          }
        }
        // A non-empty directory contains unowned files and must be preserved.
        await fs.rmdir(target);
      } catch {
        issues.push({
          code: 'cleanup_failed',
          message: 'Incomplete output needs inspection; unowned files were preserved.',
        });
      }
    }
    throw new BundleOperationError(issues);
  }
}
