// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { InputError, readDocument } from '../security-review/input.js';
import { analyzeObservation, failedObservation } from './analyze.js';
import { runObservationWorker } from './isolate.js';
import { observationLimits } from './limits.js';
import { renderObservationMarkdown } from './render.js';
import type {
  InputReadDiagnostic,
  ObservationLimits,
  ObservationResult,
  RawRecordInput,
  SourceKind,
  SourceManifest,
  SourceRef,
} from './types.js';
import { selectRawExchangeIds } from './validate.js';

export interface ObservationReport {
  readonly result: ObservationResult;
  readonly json: string;
  readonly markdown: string;
}
export interface ObservationFileOptions {
  readonly rawDirectory?: string;
  readonly outputDirectory?: string;
  readonly limits?: Partial<ObservationLimits>;
  readonly signal?: AbortSignal;
}
export interface ObservationFileJob {
  readonly directory: string;
  readonly rawDirectory?: string;
  readonly outputDirectory?: string;
  readonly limits: ObservationLimits;
}
interface GuardedDirectoryRoot {
  readonly directory: string;
  readonly stat: BigIntStats;
  readonly chain: ReadonlyMap<string, BigIntStats>;
}
interface GuardedAvailableSource {
  readonly availability: 'available';
  readonly file: string;
  readonly stat: BigIntStats;
  readonly parents: ReadonlyMap<string, BigIntStats>;
  readonly sha256: string;
  readonly bytes: number;
}
interface GuardedMissingSource {
  readonly availability: 'missing';
  readonly file: string;
  readonly parents: ReadonlyMap<string, BigIntStats>;
}
type GuardedSource = GuardedAvailableSource | GuardedMissingSource;
export interface GuardedObservationInput {
  readonly roots: readonly GuardedDirectoryRoot[];
  readonly sources: readonly GuardedSource[];
}
export class ObservationOutputError extends Error {
  constructor() {
    super('Observation output exceeds the enforced limit.');
  }
}
class FileFailure extends Error {
  constructor(readonly code: string) {
    super('Saved observation processing failed.');
  }
}
export function guardedFailureCode(error: unknown): string {
  return error instanceof FileFailure ? error.code : 'processing-failed';
}
const key = (value: string): string => (process.platform === 'win32' ? value.toLowerCase() : value);
function sameEntry(a: BigIntStats, b: BigIntStats): boolean {
  return (
    a.ino === b.ino &&
    (a.dev === b.dev ||
      (process.platform === 'win32' && (a.dev === 0n || b.dev === 0n) && a.birthtimeNs === b.birthtimeNs))
  );
}
export function localPath(value: string): string {
  if (typeof value !== 'string' || !value || value.includes('\0')) throw new FileFailure('unsafe-input');
  if (
    process.platform === 'win32' &&
    (/^[\\/]{2}/.test(value) ||
      /^[a-z]:(?![\\/])/i.test(value) ||
      value.replace(/^[a-z]:/i, '').includes(':') ||
      value
        .split(/[\\/]/)
        .some(
          (part) =>
            /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part) ||
            (part !== '.' && part !== '..' && /[. ]$/.test(part)),
        ))
  )
    throw new FileFailure('unsafe-input');
  return path.resolve(value);
}
async function directoryChain(directory: string): Promise<Map<string, BigIntStats>> {
  const result = new Map<string, BigIntStats>();
  let current = directory;
  for (;;) {
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new FileFailure('unsafe-input');
    result.set(current, stat);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (key(await fs.realpath(directory)) !== key(directory)) throw new FileFailure('unsafe-input');
  return result;
}
async function checkChain(before: Map<string, BigIntStats>, directory: string): Promise<void> {
  const after = await directoryChain(directory);
  for (const [name, stat] of before) {
    const current = after.get(name);
    if (!current || !sameEntry(stat, current)) throw new FileFailure('source-changed');
  }
}
async function guardedDigest(
  file: string,
  expected: BigIntStats,
  capturedParents?: ReadonlyMap<string, BigIntStats>,
): Promise<GuardedAvailableSource> {
  const parents = capturedParents ?? (await directoryChain(path.dirname(file)));
  const before = await fs.lstat(file, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    !sameEntry(expected, before) ||
    before.size !== expected.size ||
    before.mtimeNs !== expected.mtimeNs ||
    before.ctimeNs !== expected.ctimeNs
  )
    throw new FileFailure('source-changed');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (
      !opened.isFile() ||
      opened.nlink !== 1n ||
      !sameEntry(before, opened) ||
      opened.size !== before.size ||
      opened.mtimeNs !== before.mtimeNs ||
      opened.ctimeNs !== before.ctimeNs
    )
      throw new FileFailure('source-changed');
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let position = 0;
    for (;;) {
      const remaining = Number(before.size) - position;
      if (remaining <= 0) {
        const probe = Buffer.allocUnsafe(1);
        if ((await handle.read(probe, 0, 1, position)).bytesRead !== 0) throw new FileFailure('source-changed');
        break;
      }
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, remaining), position);
      if (bytesRead === 0) throw new FileFailure('source-changed');
      digest.update(buffer.subarray(0, bytesRead));
      position += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(file, { bigint: true });
    if (
      position !== Number(before.size) ||
      !sameEntry(before, after) ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      !sameEntry(before, current) ||
      !current.isFile() ||
      current.isSymbolicLink() ||
      current.nlink !== 1n ||
      current.size !== before.size ||
      current.mtimeNs !== before.mtimeNs ||
      current.ctimeNs !== before.ctimeNs
    )
      throw new FileFailure('source-changed');
    await checkChain(new Map(parents), path.dirname(file));
    return {
      availability: 'available',
      file,
      stat: before,
      parents,
      sha256: digest.digest('hex'),
      bytes: position,
    };
  } finally {
    await handle.close();
  }
}

export async function verifyGuardedObservationInput(guard: GuardedObservationInput): Promise<void> {
  for (const root of guard.roots) {
    await checkChain(new Map(root.chain), root.directory);
    const current = await fs.lstat(root.directory, { bigint: true });
    if (!sameEntry(root.stat, current)) throw new FileFailure('source-changed');
  }
  for (const source of guard.sources) {
    if (source.availability === 'missing') {
      await checkChain(new Map(source.parents), path.dirname(source.file));
      try {
        await fs.lstat(source.file);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        throw new FileFailure('source-changed');
      }
      throw new FileFailure('source-changed');
    }
    const current = await guardedDigest(source.file, source.stat, source.parents);
    if (current.bytes !== source.bytes || current.sha256 !== source.sha256) throw new FileFailure('source-changed');
  }
}
export function contains(parent: string, child: string): boolean {
  const relative = path.relative(key(parent), key(child));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}
function nodes(value: unknown): number {
  if (value === null || typeof value !== 'object') return 1;
  return 1 + Object.values(value).reduce<number>((count, child) => count + nodes(child), 0);
}

/** Pure serialization of an analysis result; each artifact has its own byte ceiling. */
export function serializeObservation(result: ObservationResult): ObservationReport {
  const limits = observationLimits(result.limits);
  const json = `${JSON.stringify(result, null, 2)}\n`;
  if (Buffer.byteLength(json) > limits.maxOutputBytes) throw new ObservationOutputError();
  const markdown = renderObservationMarkdown(result);
  if (Buffer.byteLength(markdown) > limits.maxOutputBytes) throw new ObservationOutputError();
  return { result, json, markdown };
}
function failureReport(code: string, limits: ObservationLimits, sources: SourceManifest[] = []): ObservationReport {
  return serializeObservation(failedObservation(code, limits, sources));
}

/** The public file API owns one fixed worker for reads, interpretation and serialization. */
export async function observeDirectory(
  directory: string,
  options: ObservationFileOptions = {},
): Promise<ObservationReport> {
  const started = Date.now();
  const limits = observationLimits(options.limits);
  let job: ObservationFileJob;
  try {
    job = {
      directory: localPath(directory),
      limits,
      ...(options.rawDirectory === undefined ? {} : { rawDirectory: localPath(options.rawDirectory) }),
      ...(options.outputDirectory === undefined ? {} : { outputDirectory: localPath(options.outputDirectory) }),
    };
  } catch {
    return failureReport('unsafe-input', limits);
  }
  const outcome = await runObservationWorker(job, limits.timeoutMs - (Date.now() - started), options.signal);
  if (outcome.code) return failureReport(outcome.code, limits);
  const message = outcome.message as { report?: ObservationReport; outputLimit?: boolean } | undefined;
  if (message?.outputLimit) throw new ObservationOutputError();
  if (!message?.report) return failureReport('processing-failed', limits);
  return message.report;
}

export async function writeFixedOutput(
  job: Pick<ObservationFileJob, 'directory' | 'rawDirectory' | 'outputDirectory'>,
  files: readonly (readonly [string, string])[],
  guard: GuardedObservationInput,
): Promise<void> {
  if (!job.outputDirectory) return;
  const output = job.outputDirectory;
  for (const input of [job.directory, ...(job.rawDirectory ? [job.rawDirectory] : [])]) {
    if (contains(input, output) || contains(output, input)) throw new FileFailure('unsafe-output');
  }
  await verifyGuardedObservationInput(guard);
  const parent = path.dirname(output);
  const openedFiles: {
    readonly content: string;
    readonly file: string;
    readonly handle: Awaited<ReturnType<typeof fs.open>>;
    readonly stat: BigIntStats;
  }[] = [];
  let outputHandle: Awaited<ReturnType<typeof fs.open>> | undefined;
  let scrubAfterDetectedMutation = false;
  try {
    for (let current = parent; ; current = path.dirname(current)) {
      const followed = await fs.stat(current, { bigint: true });
      if (guard.roots.some((root) => sameEntry(root.stat, followed))) throw new FileFailure('unsafe-output');
      if (path.dirname(current) === current) break;
    }
    const parents = await directoryChain(parent);
    await fs.mkdir(output, { mode: 0o700 }); // Exclusive: no recursive creation and no reuse.
    await checkChain(parents, parent);
    const created = await fs.lstat(output, { bigint: true });
    if (!created.isDirectory() || created.isSymbolicLink()) throw new FileFailure('output-failed');
    outputHandle = await fs.open(output, constants.O_RDONLY);
    const openedOutput = await outputHandle.stat({ bigint: true });
    if (!openedOutput.isDirectory() || !sameEntry(created, openedOutput)) throw new FileFailure('output-failed');
    const owned = await directoryChain(output);
    const ownedRoot = owned.get(output);
    if (!ownedRoot || !sameEntry(created, ownedRoot)) throw new FileFailure('output-failed');
    const names = new Set<string>();
    for (const [name, content] of files) {
      if (
        !name ||
        name === '.' ||
        name === '..' ||
        path.basename(name) !== name ||
        names.has(key(name)) ||
        content === undefined
      )
        throw new FileFailure('output-failed');
      names.add(key(name));
      await checkChain(owned, output);
      const file = path.join(output, name);
      const handle = await fs.open(
        file,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      try {
        const opened = await handle.stat({ bigint: true });
        const current = await fs.lstat(file, { bigint: true });
        if (
          !opened.isFile() ||
          opened.size !== 0n ||
          opened.nlink !== 1n ||
          current.isSymbolicLink() ||
          !current.isFile() ||
          current.size !== 0n ||
          current.nlink !== 1n ||
          !sameEntry(opened, current)
        )
          throw new FileFailure('output-failed');
        await checkChain(owned, output);
        openedFiles.push({ content, file, handle, stat: opened });
      } catch (error) {
        await handle.close();
        throw error;
      }
    }
    // No report bytes are written until every pathname has resolved to a verified
    // new file in the directory we created. Later writes use retained handles.
    await checkChain(owned, output);
    await verifyGuardedObservationInput(guard);
    for (const opened of openedFiles) {
      await opened.handle.writeFile(opened.content, 'utf8');
      await opened.handle.sync();
      scrubAfterDetectedMutation = true;
      const after = await opened.handle.stat({ bigint: true });
      if (
        !sameEntry(opened.stat, after) ||
        after.nlink !== 1n ||
        after.size !== BigInt(Buffer.byteLength(opened.content))
      )
        throw new FileFailure('output-failed');
      scrubAfterDetectedMutation = false;
    }
    scrubAfterDetectedMutation = true;
    await checkChain(owned, output);
    for (const opened of openedFiles) {
      const current = await fs.lstat(opened.file, { bigint: true });
      if (!current.isFile() || current.isSymbolicLink() || current.nlink !== 1n || !sameEntry(opened.stat, current))
        throw new FileFailure('output-failed');
    }
    scrubAfterDetectedMutation = false;
  } catch (error) {
    if (scrubAfterDetectedMutation)
      await Promise.allSettled(
        openedFiles.map(async (opened) => {
          await opened.handle.truncate(0);
          await opened.handle.sync();
        }),
      );
    // Keep any partial new output for inspection; never delete a user's destination.
    if (error instanceof FileFailure && ['source-changed', 'unsafe-output'].includes(error.code)) throw error;
    throw new FileFailure('output-failed');
  } finally {
    await Promise.allSettled(openedFiles.map((opened) => opened.handle.close()));
    await outputHandle?.close().catch(() => undefined);
  }
}

export async function withGuardedObservationInput<T>(
  job: ObservationFileJob,
  limits: ObservationLimits,
  strictUnsafeRaw: boolean,
  sources: SourceManifest[],
  inputDiagnostics: InputReadDiagnostic[],
  operation: (input: {
    readonly traffic: unknown;
    readonly blackboard: unknown;
    readonly findings?: unknown;
    readonly rawRequested: boolean;
    readonly rawRecords: readonly RawRecordInput[];
    readonly sources: readonly SourceManifest[];
    readonly inputDiagnostics: readonly InputReadDiagnostic[];
  }) => T | Promise<T>,
): Promise<{ readonly value: T; readonly guard: GuardedObservationInput }> {
  const guardedLimits = observationLimits({
    maxNativeBytes: limits.maxNativeBytes,
    maxRawBytes: limits.maxRawBytes,
    maxTotalBytes: limits.maxTotalBytes,
    maxDepth: limits.maxDepth,
    maxNodes: limits.maxNodes,
    maxExchanges: limits.maxExchanges,
    maxRoutes: limits.maxRoutes,
    maxIdentities: limits.maxIdentities,
    maxTransitions: limits.maxTransitions,
    maxRecords: limits.maxRecords,
    maxRawFiles: limits.maxRawFiles,
    maxOutputBytes: limits.maxOutputBytes,
    timeoutMs: limits.timeoutMs,
  });
  let totalBytes = 0;
  let totalNodes = 0;
  const guardedSources: GuardedSource[] = [];
  async function read(source: SourceKind, directory: string, file: string, required: boolean, exchangeId?: string) {
    const reference: SourceRef = { source, pointer: '', ...(exchangeId ? { exchangeId } : {}) };
    const manifest = (
      availability: SourceManifest['availability'],
      sha256: string | null = null,
      bytes: number | null = null,
    ) => {
      sources.push({ source, file, availability, sha256, bytes, ...(exchangeId ? { exchangeId } : {}) });
    };
    const location = path.join(directory, file);
    try {
      let stat: BigIntStats;
      try {
        stat = await fs.lstat(location, { bigint: true });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        guardedSources.push({
          availability: 'missing',
          file: location,
          parents: await directoryChain(directory),
        });
        manifest('missing');
        if (required) inputDiagnostics.push({ code: 'missing-input', source: reference });
        return { availability: 'missing' as const, document: undefined };
      }
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1n) throw new FileFailure('unsafe-input');
      const maxBytes = source === 'raw' ? guardedLimits.maxRawBytes : guardedLimits.maxNativeBytes;
      if (stat.size > maxBytes || stat.size > guardedLimits.maxTotalBytes - totalBytes)
        throw new FileFailure('input-limit');
      totalBytes += Number(stat.size); // Charge selected bytes even when parsing fails.
      const guarded = await guardedDigest(location, stat);
      guardedSources.push(guarded);
      const parsed = await readDocument(
        location,
        {
          maxBytes: Number(stat.size),
          maxDepth: guardedLimits.maxDepth,
          maxNodes: guardedLimits.maxNodes - totalNodes,
          maxReferences: 0,
          timeoutMs: guardedLimits.timeoutMs,
        },
        true,
      );
      if (parsed.bytes !== guarded.bytes || parsed.sha256 !== guarded.sha256) throw new FileFailure('source-changed');
      totalNodes += nodes(parsed.document);
      manifest('available', parsed.sha256, parsed.bytes);
      return { availability: 'available' as const, document: parsed.document };
    } catch (error) {
      if (
        (error instanceof FileFailure && error.code === 'source-changed') ||
        (error instanceof InputError && error.code === 'source_changed')
      )
        throw new FileFailure('source-changed');
      if (strictUnsafeRaw && source === 'raw' && error instanceof FileFailure && error.code === 'unsafe-input')
        throw error;
      const code = error instanceof InputError || error instanceof FileFailure ? error.code : 'read_failed';
      if (['input-limit', 'input_too_large', 'depth_limit', 'node_limit', 'reference_limit'].includes(code))
        throw new FileFailure('input-limit');
      manifest('invalid');
      inputDiagnostics.push({
        code: ['unsafe-input', 'unsafe_file', 'unsafe_directory', 'source_changed'].includes(code)
          ? 'unsafe-input'
          : ['invalid_document', 'invalid_encoding'].includes(code)
            ? 'invalid-input'
            : 'read-failed',
        source: reference,
      });
      return { availability: 'invalid' as const, document: undefined };
    }
  }
  const inputChain = await directoryChain(job.directory);
  const rawChain = job.rawDirectory ? await directoryChain(job.rawDirectory) : undefined;
  const inputRoot = inputChain.get(job.directory);
  const rawRoot = job.rawDirectory && rawChain ? rawChain.get(job.rawDirectory) : undefined;
  if (!inputRoot || (job.rawDirectory && !rawRoot)) throw new FileFailure('unsafe-input');
  const traffic = await read('traffic', job.directory, 'traffic_inventory.json', true);
  const blackboard = await read('blackboard', job.directory, 'blackbox_blackboard.json', true);
  const findings = await read('findings', job.directory, 'blackbox_authz_findings.json', false);
  const rawRecords: RawRecordInput[] = [];
  if (job.rawDirectory && traffic.availability === 'available' && blackboard.availability === 'available') {
    const ids = selectRawExchangeIds(traffic.document, blackboard.document, guardedLimits);
    if (ids.length > guardedLimits.maxRawFiles) throw new FileFailure('input-limit');
    for (const exchangeId of ids) {
      if (!/^ex_[a-f0-9]{24}$/.test(exchangeId)) throw new FileFailure('unsafe-input');
      const raw = await read('raw', job.rawDirectory, `${exchangeId}.json`, false, exchangeId);
      rawRecords.push({ exchangeId, ...raw });
    }
  }
  const value = await operation({
    traffic: traffic.document,
    blackboard: blackboard.document,
    ...(findings.document === undefined ? {} : { findings: findings.document }),
    rawRequested: job.rawDirectory !== undefined,
    rawRecords,
    sources,
    inputDiagnostics,
  });
  const guard: GuardedObservationInput = {
    roots: [
      { directory: job.directory, stat: inputRoot, chain: inputChain },
      ...(job.rawDirectory && rawChain && rawRoot
        ? [{ directory: job.rawDirectory, stat: rawRoot, chain: rawChain }]
        : []),
    ],
    sources: guardedSources,
  };
  await verifyGuardedObservationInput(guard);
  return { value, guard };
}

/** Internal worker entry. Never call this directly for untrusted local files. */
export async function loadObservation(job: ObservationFileJob): Promise<ObservationReport> {
  const limits = observationLimits(job.limits);
  const sources: SourceManifest[] = [];
  const inputDiagnostics: InputReadDiagnostic[] = [];
  try {
    const guarded = await withGuardedObservationInput(job, limits, false, sources, inputDiagnostics, (input) =>
      serializeObservation(analyzeObservation(input, limits)),
    );
    const report = guarded.value;
    if (report.result.status !== 'failed')
      await writeFixedOutput(
        job,
        [
          ['observation.json', report.json],
          ['observation.md', report.markdown],
        ],
        guarded.guard,
      );
    return report;
  } catch (error) {
    if (error instanceof ObservationOutputError) throw error;
    return failureReport(guardedFailureCode(error), limits, sources);
  }
}
