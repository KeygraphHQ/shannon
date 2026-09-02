// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Process-wide serialized append handles for durable human-readable logging. */

import fs, { promises as fsPromises } from 'node:fs';
import path from 'node:path';
import { ensureDirectory } from '../utils/file-io.js';

export type AppendSearchScope = 'whole-file' | 'current-execution';
export type AppendMarkerMatch = 'exact-line' | 'line-suffix';

export interface AppendIfAbsentOptions {
  readonly marker: string;
  readonly scope: AppendSearchScope;
  readonly match: AppendMarkerMatch;
  readonly flush?: boolean;
}

interface SharedLogEntry {
  readonly filePath: string;
  readonly stream: fs.WriteStream;
  readonly ready: Promise<void>;
  queue: Promise<void>;
  references: number;
  closing: boolean;
}

const sharedLogs = new Map<string, SharedLogEntry>();
let warned = false;
let agentLogWarned = false;

export function warnLoggingFailure(): void {
  if (warned) return;
  warned = true;
  console.error('Shannon could not write scan progress to workflow.log.');
}

/**
 * A per-agent projection is best-effort: its failure must never disturb the canonical
 * workflow.log, so it is warned about separately and never surfaced as a workflow.log fault.
 */
export function warnAgentLoggingFailure(): void {
  if (agentLogWarned) return;
  agentLogWarned = true;
  console.error('Shannon could not write a per-agent log projection; the combined workflow.log is unaffected.');
}

/** Open the append stream and track when it is safe to write, so an early `write()` waits on `open` instead of racing it. */
function createSharedEntry(filePath: string): SharedLogEntry {
  const stream = fs.createWriteStream(filePath, { flags: 'a', encoding: 'utf8', autoClose: true });
  const ready = new Promise<void>((resolve, reject) => {
    const onOpen = (): void => {
      cleanup();
      resolve();
    };
    const onError = (): void => {
      cleanup();
      reject(new Error('workflow log stream could not be opened'));
    };
    const cleanup = (): void => {
      stream.removeListener('open', onOpen);
      stream.removeListener('error', onError);
    };
    stream.once('open', onOpen);
    stream.once('error', onError);
  });
  stream.on('error', warnLoggingFailure);
  return { filePath, stream, ready, queue: Promise.resolve(), references: 0, closing: false };
}

/**
 * Chain one more operation onto an entry's serial queue, so writes from any number of concurrent
 * `LogStream` handles to the same file still land in the order they were issued. The queue is
 * reset to a settled promise regardless of outcome, so one failed write cannot wedge every
 * write after it.
 */
function enqueue<T>(entry: SharedLogEntry, operation: () => Promise<T>): Promise<T> {
  const result = entry.queue.then(operation, operation);
  entry.queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function writeToStream(stream: fs.WriteStream, text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(text, 'utf8', (error) => {
      if (error) reject(new Error('workflow log write failed'));
      else resolve();
    });
  });
}

function syncStream(stream: fs.WriteStream): Promise<void> {
  const descriptor = (stream as fs.WriteStream & { readonly fd: number | null }).fd;
  if (descriptor === null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    fs.fsync(descriptor, (error) => {
      if (error) reject(new Error('workflow log flush failed'));
      else resolve();
    });
  });
}

/**
 * Restrict a marker search to the text written since the most recent resume boundary. A resumed
 * run reopens the same log file, so without this a `current-execution` marker check would also
 * match a line written by a previous, already-finished execution.
 */
function currentExecution(content: string): string {
  const matches = [...content.matchAll(/^RESUMED\r?$/gmu)];
  const last = matches.at(-1);
  return last?.index === undefined ? content : content.slice(last.index);
}

function markerExists(content: string, options: AppendIfAbsentOptions): boolean {
  const searched = options.scope === 'current-execution' ? currentExecution(content) : content;
  const lines = searched.split(/\r?\n/u);
  if (options.match === 'exact-line') return lines.includes(options.marker);
  return lines.some((line) => line.endsWith(options.marker));
}

/** A reference-counted handle to one process-wide append stream. */
export class LogStream {
  private released = false;

  private constructor(private readonly entry: SharedLogEntry) {}

  /**
   * Take a reference on the shared entry for `filePath`, opening it if this is the first
   * reference. If a prior lease is mid-{@link release} when this call arrives, wait for that
   * drain to finish rather than reusing an entry that is about to be removed from the map;
   * the loop re-reads the map afterward because the entry may have been deleted, or replaced
   * by a new opener, while this call was waiting.
   */
  static async acquire(filePath: string): Promise<LogStream> {
    const absolutePath = path.resolve(filePath);
    await ensureDirectory(path.dirname(absolutePath));
    let entry = sharedLogs.get(absolutePath);
    while (entry?.closing === true) {
      await entry.queue;
      entry = sharedLogs.get(absolutePath);
    }
    if (entry === undefined) {
      entry = createSharedEntry(absolutePath);
      sharedLogs.set(absolutePath, entry);
    }
    entry.references += 1;
    try {
      await entry.ready;
    } catch (error) {
      entry.references -= 1;
      if (entry.references === 0) sharedLogs.delete(absolutePath);
      warnLoggingFailure();
      throw error;
    }
    return new LogStream(entry);
  }

  /** Queue an append; `flush` fsyncs before resolving, for the low-frequency structural lines that must be durable. */
  write(text: string, flush = false): Promise<void> {
    if (this.released) return Promise.reject(new Error('workflow log handle was released'));
    return enqueue(this.entry, async () => {
      await writeToStream(this.entry.stream, text);
      if (flush) await syncStream(this.entry.stream);
    });
  }

  /**
   * Append `text` only if its marker is not already present, so a structural line (a header, a
   * resume boundary) survives a Temporal activity retry without being written twice. The check
   * and the write share the same queued operation, so a concurrent writer on this entry cannot
   * observe the marker as absent and duplicate it.
   */
  appendIfAbsent(text: string, options: AppendIfAbsentOptions): Promise<boolean> {
    if (this.released) return Promise.reject(new Error('workflow log handle was released'));
    return enqueue(this.entry, async () => {
      const content = await fsPromises.readFile(this.entry.filePath, 'utf8').catch(() => '');
      if (markerExists(content, options)) return false;
      await writeToStream(this.entry.stream, text);
      if (options.flush === true) await syncStream(this.entry.stream);
      return true;
    });
  }

  /**
   * Drop this handle's reference. Only the last outstanding reference actually closes the
   * underlying file descriptor; every earlier release just decrements the count so other
   * concurrent leaseholders (an agent still mid-write, a stage still draining) are unaffected.
   * The close itself is queued behind any writes already pending on this entry, and `closing`
   * gates a new {@link acquire} until it finishes, so no writer ever sees a half-closed stream.
   */
  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    this.entry.references -= 1;
    await enqueue(this.entry, async () => {
      if (this.entry.references > 0 || this.entry.closing) return;
      this.entry.closing = true;
      await new Promise<void>((resolve) => this.entry.stream.end(resolve));
      if (this.entry.references === 0 && sharedLogs.get(this.entry.filePath) === this.entry) {
        sharedLogs.delete(this.entry.filePath);
      }
    });
  }

  get path(): string {
    return this.entry.filePath;
  }
}
