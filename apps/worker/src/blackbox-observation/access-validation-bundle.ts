// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { isDeepStrictEqual } from 'node:util';
import { compareAccessDirectory } from './access-files.js';
import { accessComparisonLimits } from './access-limits.js';
import type { AccessComparisonLimits } from './access-types.js';
import {
  AccessValidationError,
  type AccessValidationSelection,
  createAccessValidationSelection,
  type ResolvedAccessValidation,
  resolveAccessValidationSelection,
} from './access-validation.js';
import { AccessValidationBundleError, loadAccessValidationBundle } from './access-validation-files.js';
import { contains, localPath } from './files.js';
import type { SourceManifest } from './types.js';

const RAW_FILE = /^(ex_[a-f0-9]{24})\.json$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const NATIVE_FILES = Object.freeze({
  traffic: 'traffic_inventory.json',
  blackboard: 'blackbox_blackboard.json',
  findings: 'blackbox_authz_findings.json',
} as const);

export type AccessValidationBundleCreateErrorCode =
  | 'invalid-arguments'
  | 'unsafe-input'
  | 'unsafe-output'
  | 'missing-raw'
  | 'partial-comparison'
  | 'ineligible-comparison'
  | 'source-changed'
  | 'verification-failed'
  | 'processing-timeout'
  | 'aborted'
  | 'cleanup-failed'
  | 'processing-failed';

export class AccessValidationBundleCreateError extends Error {
  constructor(readonly code: AccessValidationBundleCreateErrorCode) {
    super('Black-box access validation bundle could not be created.');
    this.name = 'AccessValidationBundleCreateError';
  }
}

export interface AccessValidationBundleCreateOptions {
  readonly rawDirectory: string;
  readonly outputDirectory: string;
  readonly limits?: Partial<AccessComparisonLimits>;
  readonly signal?: AbortSignal;
}

interface SourceCopy {
  readonly source: string;
  readonly destination: string;
  readonly sha256: string;
  readonly bytes: number;
}

interface OwnedEntry {
  readonly path: string;
  readonly kind: 'directory' | 'file';
  readonly identity: BigIntStats;
  readonly parent?: OwnedEntry;
}

function fail(code: AccessValidationBundleCreateErrorCode): never {
  throw new AccessValidationBundleCreateError(code);
}

function key(value: string): string {
  return process.platform === 'win32' ? value.toLowerCase() : value;
}

function sameEntry(left: BigIntStats, right: BigIntStats): boolean {
  return (
    left.ino === right.ino &&
    (left.dev === right.dev ||
      (process.platform === 'win32' && (left.dev === 0n || right.dev === 0n) && left.birthtimeNs === right.birthtimeNs))
  );
}

function hash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function checkActive(signal: AbortSignal | undefined, deadline: number): void {
  if (signal?.aborted) fail('aborted');
  if (performance.now() >= deadline) fail('processing-timeout');
}

function limitsWithinDeadline(limits: AccessComparisonLimits, deadline: number): AccessComparisonLimits {
  if (performance.now() >= deadline) return fail('processing-timeout');
  return limits;
}

async function directoryChain(
  directory: string,
  unsafeCode: AccessValidationBundleCreateErrorCode = 'unsafe-input',
): Promise<Map<string, BigIntStats>> {
  const result = new Map<string, BigIntStats>();
  let current = directory;
  for (;;) {
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) return fail(unsafeCode);
    result.set(current, stat);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (key(await fs.realpath(directory)) !== key(directory)) return fail(unsafeCode);
  return result;
}

async function checkDirectoryChain(
  before: ReadonlyMap<string, BigIntStats>,
  directory: string,
  unsafeCode: AccessValidationBundleCreateErrorCode = 'unsafe-input',
  changedCode: AccessValidationBundleCreateErrorCode = 'source-changed',
): Promise<void> {
  const after = await directoryChain(directory, unsafeCode);
  for (const [name, stat] of before) {
    const current = after.get(name);
    if (!current || !sameEntry(stat, current)) return fail(changedCode);
  }
}

async function readVerifiedFile(
  copy: SourceCopy,
  signal: AbortSignal | undefined,
  deadline: number,
  unsafeCode: AccessValidationBundleCreateErrorCode,
  changedCode: AccessValidationBundleCreateErrorCode,
): Promise<Buffer> {
  checkActive(signal, deadline);
  let parents: ReadonlyMap<string, BigIntStats>;
  let before: BigIntStats;
  try {
    parents = await directoryChain(path.dirname(copy.source), unsafeCode);
    before = await fs.lstat(copy.source, { bigint: true });
  } catch (error) {
    if (error instanceof AccessValidationBundleCreateError) throw error;
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail(changedCode);
    return fail(unsafeCode);
  }
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
    return fail(unsafeCode);
  }
  let sourceReal: string;
  try {
    sourceReal = await fs.realpath(copy.source);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail(changedCode);
    return fail(unsafeCode);
  }
  if (key(sourceReal) !== key(copy.source)) return fail(unsafeCode);
  if (before.size !== BigInt(copy.bytes)) return fail(changedCode);
  const flags = constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW);
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(copy.source, flags);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail(changedCode);
    return fail(unsafeCode);
  }
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameEntry(before, opened) || opened.nlink !== 1n || opened.size !== before.size) return fail(changedCode);
    const buffer = Buffer.alloc(copy.bytes + 1);
    let offset = 0;
    while (offset < buffer.length) {
      checkActive(signal, deadline);
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (bytesRead === 0) break;
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(copy.source, { bigint: true });
    if (
      offset !== copy.bytes ||
      !sameEntry(before, after) ||
      !sameEntry(before, current) ||
      current.isSymbolicLink() ||
      current.nlink !== 1n ||
      current.size !== before.size ||
      current.mtimeNs !== before.mtimeNs ||
      current.ctimeNs !== before.ctimeNs
    ) {
      return fail(changedCode);
    }
    await checkDirectoryChain(parents, path.dirname(copy.source), unsafeCode, changedCode);
    const bytes = buffer.subarray(0, offset);
    if (hash(bytes) !== copy.sha256) return fail(changedCode);
    checkActive(signal, deadline);
    return bytes;
  } finally {
    await handle.close();
  }
}

function availableSource(source: SourceManifest): source is SourceManifest & { sha256: string; bytes: number } {
  return (
    source.availability === 'available' &&
    typeof source.sha256 === 'string' &&
    SHA256.test(source.sha256) &&
    typeof source.bytes === 'number' &&
    Number.isSafeInteger(source.bytes) &&
    source.bytes >= 0
  );
}

function sourceCopies(
  sources: readonly SourceManifest[],
  observation: string,
  raw: string,
  output: string,
): readonly SourceCopy[] {
  const copies: SourceCopy[] = [];
  const seen = new Set<string>();
  for (const kind of ['traffic', 'blackboard', 'findings'] as const) {
    const matches = sources.filter((source) => source.source === kind);
    if (matches.length !== 1) return fail('unsafe-input');
    const source = matches[0];
    if (!source || source.file !== NATIVE_FILES[kind] || source.exchangeId !== undefined) return fail('unsafe-input');
    if (kind === 'findings' && source.availability === 'not-supplied') continue;
    if (!availableSource(source)) return fail('unsafe-input');
    copies.push({
      source: path.join(observation, source.file),
      destination: path.join(output, 'observation', source.file),
      sha256: source.sha256,
      bytes: source.bytes,
    });
    seen.add(`${kind}\0${source.file}`);
  }

  const rawSources = sources.filter((source) => source.source === 'raw');
  if (rawSources.length === 0 || rawSources.some((source) => !availableSource(source))) return fail('missing-raw');
  for (const source of rawSources) {
    const matched = RAW_FILE.exec(source.file);
    if (!matched?.[1] || source.exchangeId !== matched[1] || seen.has(`raw\0${source.file}`))
      return fail('unsafe-input');
    seen.add(`raw\0${source.file}`);
    copies.push({
      source: path.join(raw, source.file),
      destination: path.join(output, 'raw', source.file),
      sha256: source.sha256 as string,
      bytes: source.bytes as number,
    });
  }
  return copies.sort((left, right) => left.destination.localeCompare(right.destination, 'en'));
}

async function entryMatches(entry: OwnedEntry): Promise<boolean> {
  try {
    const current = await fs.lstat(entry.path, { bigint: true });
    return (
      sameEntry(entry.identity, current) &&
      !current.isSymbolicLink() &&
      (entry.kind === 'directory' ? current.isDirectory() : current.isFile())
    );
  } catch {
    return false;
  }
}

async function createOwnedDirectory(
  directory: string,
  parent: OwnedEntry | undefined,
  owned: OwnedEntry[],
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<OwnedEntry> {
  checkActive(signal, deadline);
  if (parent && !(await entryMatches(parent))) return fail('verification-failed');
  try {
    await fs.mkdir(directory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST')
      return fail(parent ? 'verification-failed' : 'unsafe-output');
    throw error;
  }
  const identity = await fs.lstat(directory, { bigint: true });
  const entry: OwnedEntry = { path: directory, kind: 'directory', identity, ...(parent ? { parent } : {}) };
  owned.push(entry);
  if (!identity.isDirectory() || identity.isSymbolicLink()) return fail('verification-failed');
  if (parent && !(await entryMatches(parent))) return fail('verification-failed');
  return entry;
}

async function exclusiveWrite(
  file: string,
  bytes: Uint8Array,
  parent: OwnedEntry,
  owned: OwnedEntry[],
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<OwnedEntry> {
  checkActive(signal, deadline);
  if (!(await entryMatches(parent))) return fail('verification-failed');
  const handle = await fs.open(file, 'wx', 0o600);
  try {
    const identity = await handle.stat({ bigint: true });
    const entry: OwnedEntry = { path: file, kind: 'file', identity, parent };
    owned.push(entry);
    if (!identity.isFile() || identity.nlink !== 1n) return fail('verification-failed');
    await handle.writeFile(bytes);
    await handle.sync();
    const stat = await handle.stat({ bigint: true });
    if (!stat.isFile() || stat.nlink !== 1n || stat.size !== BigInt(bytes.byteLength))
      return fail('verification-failed');
    const current = await fs.lstat(file, { bigint: true });
    if (!sameEntry(identity, current) || !current.isFile() || current.isSymbolicLink() || current.nlink !== 1n)
      return fail('verification-failed');
    if (!(await entryMatches(parent))) return fail('verification-failed');
    checkActive(signal, deadline);
    return entry;
  } finally {
    await handle.close();
  }
}

async function outputPaths(
  directory: string,
  rawDirectory: string,
  outputDirectory: string,
): Promise<{
  readonly observation: string;
  readonly raw: string;
  readonly output: string;
  readonly outputParent: string;
  readonly outputParentChain: ReadonlyMap<string, BigIntStats>;
}> {
  let observation: string;
  let raw: string;
  let output: string;
  try {
    observation = localPath(directory);
    raw = localPath(rawDirectory);
    output = localPath(outputDirectory);
  } catch {
    return fail('invalid-arguments');
  }
  if (
    contains(observation, output) ||
    contains(output, observation) ||
    contains(raw, output) ||
    contains(output, raw)
  ) {
    return fail('unsafe-output');
  }
  const outputParent = path.dirname(output);
  try {
    await fs.lstat(output);
    return fail('unsafe-output');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  let outputParentChain: ReadonlyMap<string, BigIntStats>;
  try {
    outputParentChain = await directoryChain(outputParent, 'unsafe-output');
  } catch (error) {
    if (error instanceof AccessValidationBundleCreateError) throw error;
    return fail('unsafe-output');
  }
  let observationReal: string;
  try {
    observationReal = await fs.realpath(observation);
  } catch {
    return fail('unsafe-input');
  }
  let rawReal: string;
  try {
    rawReal = await fs.realpath(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fail('missing-raw');
    return fail('unsafe-input');
  }
  const parentReal = await fs.realpath(outputParent);
  const physicalOutput = path.join(parentReal, path.basename(output));
  if (
    contains(observationReal, physicalOutput) ||
    contains(physicalOutput, observationReal) ||
    contains(rawReal, physicalOutput) ||
    contains(physicalOutput, rawReal)
  ) {
    return fail('unsafe-output');
  }
  return { observation, raw, output, outputParent, outputParentChain };
}

async function removeOwnedPartial(owned: readonly OwnedEntry[]): Promise<boolean> {
  let complete = true;
  for (const entry of [...owned].reverse()) {
    if (entry.parent && !(await entryMatches(entry.parent))) {
      complete = false;
      continue;
    }
    let current: BigIntStats;
    try {
      current = await fs.lstat(entry.path, { bigint: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      complete = false;
      continue;
    }
    if (
      !sameEntry(entry.identity, current) ||
      current.isSymbolicLink() ||
      (entry.kind === 'directory' ? !current.isDirectory() : !current.isFile())
    ) {
      complete = false;
      continue;
    }
    try {
      if (entry.kind === 'directory') await fs.rmdir(entry.path);
      else await fs.unlink(entry.path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') complete = false;
    }
  }
  return complete;
}

async function verifyInventory(directory: OwnedEntry, names: readonly string[]): Promise<void> {
  if (!(await entryMatches(directory))) return fail('verification-failed');
  const actual = (await fs.readdir(directory.path)).sort((left, right) => left.localeCompare(right, 'en'));
  const expected = [...names].sort((left, right) => left.localeCompare(right, 'en'));
  if (!isDeepStrictEqual(actual, expected)) return fail('verification-failed');
}

async function verifyExactBundle(
  root: OwnedEntry,
  observation: OwnedEntry,
  raw: OwnedEntry,
  owned: readonly OwnedEntry[],
  files: readonly SourceCopy[],
  signal: AbortSignal | undefined,
  deadline: number,
): Promise<void> {
  const observationNames = files
    .filter((file) => path.dirname(file.source) === observation.path)
    .map((file) => path.basename(file.source));
  const rawNames = files
    .filter((file) => path.dirname(file.source) === raw.path)
    .map((file) => path.basename(file.source));
  await verifyInventory(root, ['comparison.json', 'observation', 'raw', 'selection.json']);
  await verifyInventory(observation, observationNames);
  await verifyInventory(raw, rawNames);
  for (const entry of owned) if (!(await entryMatches(entry))) return fail('verification-failed');
  for (const file of files)
    await readVerifiedFile(file, signal, deadline, 'verification-failed', 'verification-failed');
  for (const entry of owned) if (!(await entryMatches(entry))) return fail('verification-failed');
  await verifyInventory(root, ['comparison.json', 'observation', 'raw', 'selection.json']);
  await verifyInventory(observation, observationNames);
  await verifyInventory(raw, rawNames);
}

function comparisonFailure(code: string | undefined): AccessValidationBundleCreateErrorCode {
  if (code === 'unsafe-input') return 'unsafe-input';
  if (code === 'source-changed') return 'source-changed';
  if (code === 'processing-timeout') return 'processing-timeout';
  return 'processing-failed';
}

async function createAccessValidationBundleInternal(
  directory: string,
  comparisonId: string,
  options: AccessValidationBundleCreateOptions,
): Promise<ResolvedAccessValidation> {
  if (
    !options ||
    typeof options.rawDirectory !== 'string' ||
    typeof options.outputDirectory !== 'string' ||
    typeof comparisonId !== 'string'
  ) {
    return fail('invalid-arguments');
  }
  let limits: AccessComparisonLimits;
  try {
    limits = accessComparisonLimits(options.limits);
  } catch {
    return fail('invalid-arguments');
  }
  const deadline = performance.now() + limits.timeoutMs;
  const timeoutSignal = AbortSignal.timeout(limits.timeoutMs);
  const boundedSignal = options.signal ? AbortSignal.any([options.signal, timeoutSignal]) : timeoutSignal;
  checkActive(options.signal, deadline);
  const paths = await outputPaths(directory, options.rawDirectory, options.outputDirectory);
  checkActive(options.signal, deadline);
  const report = await compareAccessDirectory(paths.observation, {
    rawDirectory: paths.raw,
    limits: limitsWithinDeadline(limits, deadline),
    signal: boundedSignal,
  });
  if (report.result.status === 'failed') return fail(comparisonFailure(report.result.diagnostics[0]?.code));
  const unavailableRaw = report.result.sources.some(
    (source) => source.source === 'raw' && source.availability !== 'available',
  );
  if (unavailableRaw || !report.result.sources.some((source) => source.source === 'raw')) return fail('missing-raw');
  if (report.result.status !== 'completed') return fail('partial-comparison');

  let selection: AccessValidationSelection;
  let expected: ResolvedAccessValidation;
  try {
    selection = createAccessValidationSelection(report.result, comparisonId);
    expected = resolveAccessValidationSelection(selection, report.result);
  } catch (error) {
    if (error instanceof AccessValidationError) return fail('ineligible-comparison');
    throw error;
  }
  const copies = sourceCopies(report.result.sources, paths.observation, paths.raw, paths.output);
  const owned: OwnedEntry[] = [];
  try {
    await checkDirectoryChain(paths.outputParentChain, paths.outputParent, 'unsafe-output', 'unsafe-output');
    const root = await createOwnedDirectory(paths.output, undefined, owned, options.signal, deadline);
    const observation = await createOwnedDirectory(
      path.join(paths.output, 'observation'),
      root,
      owned,
      options.signal,
      deadline,
    );
    const raw = await createOwnedDirectory(path.join(paths.output, 'raw'), root, owned, options.signal, deadline);
    const copiedFiles: SourceCopy[] = [];

    for (const copy of copies) {
      const parent = path.dirname(copy.destination) === observation.path ? observation : raw;
      const bytes = await readVerifiedFile(copy, options.signal, deadline, 'unsafe-input', 'source-changed');
      await exclusiveWrite(copy.destination, bytes, parent, owned, options.signal, deadline);
      copiedFiles.push({ ...copy, source: copy.destination });
    }
    for (const copy of copies) await readVerifiedFile(copy, options.signal, deadline, 'unsafe-input', 'source-changed');

    const comparisonBytes = Buffer.from(report.json, 'utf8');
    const comparisonFile = path.join(paths.output, 'comparison.json');
    await exclusiveWrite(comparisonFile, comparisonBytes, root, owned, options.signal, deadline);
    copiedFiles.push({
      source: comparisonFile,
      destination: comparisonFile,
      sha256: hash(comparisonBytes),
      bytes: comparisonBytes.byteLength,
    });
    const selectionBytes = Buffer.from(`${JSON.stringify(selection, null, 2)}\n`, 'utf8');
    const selectionFile = path.join(paths.output, 'selection.json');
    await exclusiveWrite(selectionFile, selectionBytes, root, owned, options.signal, deadline);
    copiedFiles.push({
      source: selectionFile,
      destination: selectionFile,
      sha256: hash(selectionBytes),
      bytes: selectionBytes.byteLength,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    checkActive(options.signal, deadline);
    const resolved = await loadAccessValidationBundle(paths.output, {
      limits: limitsWithinDeadline(limits, deadline),
      signal: boundedSignal,
    });
    if (!isDeepStrictEqual(resolved, expected)) return fail('verification-failed');
    await verifyExactBundle(root, observation, raw, owned, copiedFiles, options.signal, deadline);
    await checkDirectoryChain(paths.outputParentChain, paths.outputParent, 'unsafe-output', 'verification-failed');
    checkActive(options.signal, deadline);
    return resolved;
  } catch (error) {
    if (!(await removeOwnedPartial(owned))) return fail('cleanup-failed');
    checkActive(options.signal, deadline);
    if (error instanceof AccessValidationBundleCreateError) throw error;
    if (error instanceof AccessValidationBundleError) return fail('verification-failed');
    if (error instanceof AccessValidationError) return fail('verification-failed');
    return fail('processing-failed');
  }
}

/** Create one self-contained, digest-pinned validation bundle from guarded saved evidence. */
export async function createAccessValidationBundle(
  directory: string,
  comparisonId: string,
  options: AccessValidationBundleCreateOptions,
): Promise<ResolvedAccessValidation> {
  try {
    return await createAccessValidationBundleInternal(directory, comparisonId, options);
  } catch (error) {
    if (error instanceof AccessValidationBundleCreateError) throw error;
    return fail('processing-failed');
  }
}
