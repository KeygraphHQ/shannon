// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import type { BigIntStats as Stats } from 'node:fs';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { RunMetadata } from '../types/run-metadata.js';
import {
  type BundleCheck,
  type BundleIssue,
  type BundleManifest,
  type BundleProfile,
  type JsonRecord,
  MANIFEST_FILE,
  PRIVATE_FILES,
  type PrivateBundleData,
  SHARE_FILES,
} from './bundle-types.js';
import type { CatalogInspection, CatalogSummary } from './catalog-types.js';
import { validatePrivateBundle } from './private-bundle.js';
import { buildSanitizedArtifacts, validateSanitizedArtifacts } from './sanitized-report.js';

export const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 16 * 1024;
const HASH_WARNING = 'Unsigned hashes establish consistency with the manifest, not origin or authenticity.';
const LEGACY_WARNING =
  'No manifest is recorded; content integrity is unavailable. Only structural consistency was checked.';

export class BundleOperationError extends Error {
  constructor(readonly issues: readonly BundleIssue[]) {
    super('Report bundle operation failed; inspect the structured issue codes.');
    this.name = 'BundleOperationError';
  }
}

function failure(code: string, message: string, file?: string): BundleOperationError {
  return new BundleOperationError([{ code, message, ...(file ? { file } : {}) }]);
}

function pathKey(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function beneath(child: string, parent: string): boolean {
  const relative = path.relative(pathKey(parent), pathKey(child));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function sameEntry(left: Stats, right: Stats): boolean {
  // Windows Node 22 can report dev=0 for lstat but a volume ID for handle.stat.
  // All comparisons are for the same path after rejecting linked ancestors.
  const deviceMatches =
    left.dev === right.dev ||
    (process.platform === 'win32' && (left.dev === 0n || right.dev === 0n) && left.birthtimeNs === right.birthtimeNs);
  return deviceMatches && left.ino === right.ino;
}

const statEntry = (file: string): Promise<Stats> => fs.lstat(file, { bigint: true });

async function safeDirectory(directory: string): Promise<string> {
  const absolute = path.resolve(directory);
  let current = absolute;
  for (;;) {
    const entry = await statEntry(current);
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw failure('unsafe_directory', 'Bundle directories and their ancestors must be real directories.');
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  const resolved = await fs.realpath(absolute);
  if (pathKey(resolved) !== pathKey(absolute)) {
    throw failure('unsafe_directory', 'The bundle directory resolves through an unsupported alias.');
  }
  return resolved;
}

async function readArtifact(directory: string, name: string, limit: number): Promise<Buffer> {
  const file = path.join(directory, name);
  const before = await statEntry(file);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    throw failure('unsafe_file', 'Artifacts must be regular files without symbolic or hard links.', name);
  }
  if (before.size > limit) throw failure('file_too_large', 'Artifact exceeds the supported size limit.', name);
  const handle = await fs.open(file, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameEntry(before, opened) || opened.size !== before.size || opened.nlink !== 1n) {
      throw failure('source_changed', 'An artifact changed while being opened.', name);
    }
    // Bound reads even if another process grows the file after the stat call.
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const current = await statEntry(file);
    if (
      length !== Number(before.size) ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      !sameEntry(before, current) ||
      current.isSymbolicLink() ||
      current.nlink !== 1n
    ) {
      throw failure('source_changed', 'An artifact changed while being read.', name);
    }
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function decode(bytes: Buffer, file: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw failure('invalid_encoding', 'Artifacts must contain valid UTF-8.', file);
  }
}

function artifactNames(profile: BundleProfile): readonly string[] {
  return profile === 'private' ? PRIVATE_FILES : SHARE_FILES;
}

function parseManifest(bytes: Buffer): BundleManifest {
  try {
    const manifest = JSON.parse(decode(bytes, MANIFEST_FILE));
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      Array.isArray(manifest) ||
      Object.keys(manifest).sort().join(',') !== 'algorithm,files,profile,schemaVersion' ||
      manifest.schemaVersion !== 1 ||
      manifest.algorithm !== 'sha256' ||
      !['private', 'sanitized'].includes(manifest.profile) ||
      !Array.isArray(manifest.files)
    )
      throw new Error();
    const names = artifactNames(manifest.profile);
    if (manifest.files.length !== names.length) throw new Error();
    const seen = new Set<string>();
    for (const entry of manifest.files) {
      if (
        !entry ||
        typeof entry !== 'object' ||
        Array.isArray(entry) ||
        Object.keys(entry).sort().join(',') !== 'bytes,name,sha256' ||
        !names.includes(entry.name) ||
        seen.has(entry.name) ||
        !Number.isSafeInteger(entry.bytes) ||
        entry.bytes < 0 ||
        entry.bytes > MAX_ARTIFACT_BYTES ||
        typeof entry.sha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        throw new Error();
      seen.add(entry.name);
    }
    return manifest as BundleManifest;
  } catch {
    throw failure('invalid_manifest', 'Manifest schema, filenames, sizes or digests are invalid.', MANIFEST_FILE);
  }
}

interface LoadedBundle {
  readonly check: BundleCheck;
  readonly bytes: Readonly<Record<string, Buffer>>;
  readonly data?: PrivateBundleData;
}

async function loadBundle(input: string): Promise<LoadedBundle> {
  const bytes: Record<string, Buffer> = {};
  let profile: BundleCheck['profile'] = 'unknown';
  let integrity: BundleCheck['integrity'] = 'unavailable';
  const warnings: string[] = [];
  const issues: BundleIssue[] = [];
  let data: PrivateBundleData | undefined;
  try {
    const directory = await safeDirectory(input);
    const directoryIdentity = await statEntry(directory);
    const entries = await fs.readdir(directory);
    let manifest: BundleManifest | undefined;
    if (entries.includes(MANIFEST_FILE)) {
      integrity = 'failed';
      const manifestBytes = await readArtifact(directory, MANIFEST_FILE, MAX_MANIFEST_BYTES);
      manifest = parseManifest(manifestBytes);
      profile = manifest.profile;
      warnings.push(HASH_WARNING);
    } else if (entries.some((name) => (PRIVATE_FILES as readonly string[]).includes(name))) {
      profile = 'private';
      warnings.push(LEGACY_WARNING);
    } else if (entries.some((name) => (SHARE_FILES as readonly string[]).includes(name))) {
      profile = 'sanitized';
      issues.push({
        code: 'manifest_missing',
        file: MANIFEST_FILE,
        message: 'Sanitized bundles require their content manifest.',
      });
    } else {
      throw failure('unsupported_bundle', 'Directory does not contain a supported report bundle.');
    }
    const expected = artifactNames(profile);
    if (entries.some((name) => name !== MANIFEST_FILE && !expected.includes(name))) {
      issues.push({ code: 'unexpected_file', message: 'Bundle contains an unexpected file or directory.' });
    }
    for (const name of expected) {
      if (!entries.includes(name)) {
        issues.push({ code: 'missing_file', file: name, message: 'A companion artifact is missing.' });
      } else {
        bytes[name] = await readArtifact(directory, name, MAX_ARTIFACT_BYTES);
      }
    }
    if (manifest) {
      const mismatch = manifest.files.filter((entry) => {
        const content = bytes[entry.name];
        return (
          !content ||
          content.length !== entry.bytes ||
          createHash('sha256').update(content).digest('hex') !== entry.sha256
        );
      });
      integrity = mismatch.length === 0 ? 'matched' : 'failed';
      for (const entry of mismatch)
        issues.push({
          code: 'content_mismatch',
          file: entry.name,
          message: 'Artifact bytes do not match the recorded manifest.',
        });
    }
    if (expected.every((name) => bytes[name])) {
      const text = Object.fromEntries(expected.map((name) => [name, decode(bytes[name] as Buffer, name)]));
      if (profile === 'private') {
        const validated = validatePrivateBundle(text);
        issues.push(...validated.issues);
        data = validated.data;
      } else issues.push(...validateSanitizedArtifacts(text));
    }
    if (
      pathKey(await safeDirectory(input)) !== pathKey(directory) ||
      !sameEntry(directoryIdentity, await statEntry(directory))
    )
      throw failure('source_changed', 'Bundle directory changed during inspection.');
  } catch (error) {
    issues.push(
      ...(error instanceof BundleOperationError
        ? error.issues
        : [{ code: 'read_failed', message: 'Bundle could not be read completely.' }]),
    );
  }
  const check: BundleCheck = {
    schemaVersion: 1,
    valid: issues.length === 0,
    profile,
    integrity,
    authenticity: 'not-established',
    issues,
    warnings,
  };
  return { check, bytes, ...(data ? { data } : {}) };
}

export async function checkReportBundle(directory: string): Promise<BundleCheck> {
  return (await loadBundle(directory)).check;
}

function privateCatalogSummary(data: PrivateBundleData): CatalogSummary {
  // These fields have already passed the private bundle validator. Project only
  // counts and fixed enums; arbitrary IDs, prose and provenance values stay private.
  const board = data.blackboard;
  const metadata = board.runMetadata as RunMetadata | undefined;
  return {
    outcome: board.runStatus as CatalogSummary['outcome'],
    findings: data.findings.length,
    trafficRecords: data.inventory.length,
    unresolvedHypotheses: (board.hypotheses as JsonRecord[]).filter((entry) =>
      ['open', 'queued', 'tested', 'blocked'].includes(entry.status as string),
    ).length,
    pendingTasks: (board.tasks as JsonRecord[]).filter((entry) =>
      ['pending', 'running'].includes(entry.status as string),
    ).length,
    blockedVerifications: (board.verifications as JsonRecord[]).filter((entry) => entry.verdict === 'blocked').length,
    provenance: metadata ? 'available' : 'unavailable',
    historyComplete: metadata?.historyComplete ?? null,
    resultRecorded: metadata?.resultAttemptId != null,
    attempts: metadata?.attempts.length ?? 0,
  };
}

function sanitizedCatalogSummary(bytes: Buffer): CatalogSummary {
  // loadBundle has validated canonical JSON, enum values and derived counts.
  const summary = JSON.parse(bytes.toString('utf8'));
  return {
    outcome: summary.run.status,
    findings: summary.counts.observed.findings,
    trafficRecords: summary.counts.observed.trafficRecords,
    unresolvedHypotheses: summary.counts.unresolved.hypotheses,
    pendingTasks: summary.counts.unresolved.pendingOrRunningTasks,
    blockedVerifications: summary.counts.unresolved.blockedVerifications,
    provenance: summary.provenance.available ? 'available' : 'unavailable',
    historyComplete: summary.provenance.historyComplete,
    resultRecorded: summary.provenance.resultAttempt !== null,
    attempts: summary.provenance.attempts.length,
  };
}

/** Inspect once, retaining only validated counts and an exact artifact-content ID. */
export async function inspectReportBundle(directory: string): Promise<CatalogInspection> {
  const loaded = await loadBundle(directory);
  if (!loaded.check.valid || loaded.check.profile === 'unknown')
    return { check: loaded.check, contentId: null, summary: null };
  const hash = createHash('sha256').update(`report-catalog-content-v1\0${loaded.check.profile}\0`);
  for (const name of artifactNames(loaded.check.profile)) {
    const bytes = loaded.bytes[name] as Buffer;
    hash.update(`${name}\0${bytes.length}\0`).update(bytes);
  }
  return {
    check: loaded.check,
    contentId: hash.digest('hex'),
    summary:
      loaded.check.profile === 'private'
        ? privateCatalogSummary(loaded.data as PrivateBundleData)
        : sanitizedCatalogSummary(loaded.bytes['report.json'] as Buffer),
  };
}

function manifestFor(profile: BundleProfile, files: Readonly<Record<string, Buffer>>): Buffer {
  const manifest: BundleManifest = {
    schemaVersion: 1,
    profile,
    algorithm: 'sha256',
    files: artifactNames(profile).map((name) => {
      const bytes = files[name];
      if (!bytes) throw failure('export_failed', 'An expected output artifact was not produced.');
      return { name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  };
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

export interface BundleExportIo {
  /** The caller exclusively creates and owns the handle before invoking this writer. */
  writeFile(handle: FileHandle, bytes: Buffer): Promise<void>;
}
const DEFAULT_EXPORT_IO: BundleExportIo = {
  writeFile: (handle, bytes) => handle.writeFile(bytes),
};

async function removeStage(stage: string, identity: Stats, parent: string): Promise<void> {
  const resolved = await safeDirectory(stage);
  const current = await statEntry(stage);
  if (
    pathKey(path.dirname(resolved)) !== pathKey(parent) ||
    !path.basename(resolved).startsWith('.report-bundle-') ||
    !sameEntry(current, identity)
  )
    throw failure('cleanup_failed', 'Temporary export ownership changed; cleanup was refused.');
  await fs.rm(resolved, { recursive: true, force: true });
}

/** New destinations only. Original evidence is never modified, including legacy exports. */
export async function exportReportBundle(
  source: string,
  destination: string,
  profile: BundleProfile,
  io: BundleExportIo = DEFAULT_EXPORT_IO,
): Promise<BundleCheck> {
  let stage: string | undefined;
  let stageIdentity: Stats | undefined;
  let destinationIdentity: Stats | undefined;
  let parent: string | undefined;
  const written: { name: string; identity: Stats }[] = [];
  let completed = false;
  let result: BundleCheck | undefined;
  const operationIssues: BundleIssue[] = [];
  try {
    if (!['private', 'sanitized'].includes(profile)) throw failure('invalid_operation', 'Unsupported export profile.');
    const sourceDirectory = await safeDirectory(source);
    const target = path.resolve(destination);
    parent = await safeDirectory(path.dirname(target));
    if (beneath(target, sourceDirectory) || beneath(sourceDirectory, target)) {
      throw failure('overlapping_destination', 'Export destination must not overlap its source.');
    }
    try {
      await statEntry(target);
      throw failure('destination_exists', 'Export destination already exists. Choose a new directory.');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const loaded = await loadBundle(sourceDirectory);
    if (!loaded.check.valid || loaded.check.profile !== 'private' || !loaded.data) {
      throw new BundleOperationError(
        loaded.check.issues.length
          ? loaded.check.issues
          : [{ code: 'private_source_required', message: 'Export requires a valid private source bundle.' }],
      );
    }
    const files: Record<string, Buffer> =
      profile === 'private'
        ? { ...loaded.bytes }
        : Object.fromEntries(
            Object.entries(buildSanitizedArtifacts(loaded.data)).map(([name, content]) => [name, Buffer.from(content)]),
          );
    const outputNames = [...artifactNames(profile), MANIFEST_FILE];
    if (Object.keys(files).some((name) => !artifactNames(profile).includes(name)))
      throw failure('export_failed', 'Export produced an unexpected artifact.');
    files[MANIFEST_FILE] = manifestFor(profile, files);
    stage = await fs.mkdtemp(path.join(parent, '.report-bundle-'));
    stageIdentity = await statEntry(stage);
    for (const name of outputNames) {
      const handle = await fs.open(path.join(stage, name), 'wx', 0o600);
      try {
        await io.writeFile(handle, files[name] as Buffer);
      } finally {
        await handle.close();
      }
    }
    const staged = await checkReportBundle(stage);
    if (!staged.valid || staged.integrity !== 'matched') throw new BundleOperationError(staged.issues);
    // Exclusively claim the destination. Never rename over an existing directory.
    await safeDirectory(parent);
    await fs.mkdir(target, { mode: 0o700 });
    destinationIdentity = await statEntry(target);
    for (const name of outputNames) {
      await safeDirectory(target);
      if (!sameEntry(destinationIdentity, await statEntry(target)))
        throw failure('destination_changed', 'Destination ownership changed during export.');
      const content = await readArtifact(stage, name, name === MANIFEST_FILE ? MAX_MANIFEST_BYTES : MAX_ARTIFACT_BYTES);
      const handle = await fs.open(path.join(target, name), 'wx', 0o600);
      try {
        written.push({ name, identity: await handle.stat({ bigint: true }) });
        await io.writeFile(handle, content);
      } finally {
        await handle.close();
      }
    }
    const checked = await checkReportBundle(target);
    if (!checked.valid || checked.integrity !== 'matched') throw new BundleOperationError(checked.issues);
    await removeStage(stage, stageIdentity, parent);
    stage = undefined;
    completed = true;
    result = checked;
  } catch (error) {
    if (error instanceof BundleOperationError) operationIssues.push(...error.issues);
    else if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      operationIssues.push({
        code: 'destination_exists',
        message: 'Export destination already exists. Choose a new directory.',
      });
    else
      operationIssues.push({
        code: 'export_failed',
        message: 'Export could not be completed. No input values are included in diagnostics.',
      });
  }
  {
    let cleanupFailed = false;
    try {
      if (!completed && destinationIdentity) {
        const target = path.resolve(destination);
        const current = await statEntry(target);
        if (
          !current.isSymbolicLink() &&
          sameEntry(current, destinationIdentity) &&
          pathKey(await safeDirectory(path.dirname(target))) === pathKey(parent as string)
        ) {
          for (const file of written) {
            try {
              const currentFile = await statEntry(path.join(target, file.name));
              if (sameEntry(currentFile, file.identity) && !currentFile.isSymbolicLink())
                await fs.unlink(path.join(target, file.name));
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
            }
          }
          // Refuse to delete files introduced by another writer.
          if ((await fs.readdir(target)).length === 0) await fs.rmdir(target);
          else
            throw failure(
              'cleanup_failed',
              'An incomplete destination needs inspection; unowned files were preserved.',
            );
        } else throw failure('cleanup_failed', 'Destination ownership changed; cleanup was refused.');
      }
    } catch {
      cleanupFailed = true;
    }
    try {
      if (stage && stageIdentity && parent) {
        await removeStage(stage, stageIdentity, parent);
      }
    } catch {
      cleanupFailed = true;
    }
    if (cleanupFailed)
      operationIssues.push({
        code: 'cleanup_failed',
        message: 'Cleanup could not safely finish; inspect the incomplete output and temporary directories.',
      });
  }
  if (operationIssues.length > 0) throw new BundleOperationError(operationIssues);
  if (!result) throw failure('export_failed', 'Export did not produce a validated result.');
  return result;
}
