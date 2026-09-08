// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { createHash } from 'node:crypto';
import { type BigIntStats, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { JSON_SCHEMA, load } from 'js-yaml';
import type { ReviewLimits } from './types.js';

export class InputError extends Error {
  constructor(readonly code: string) {
    super('Offline input processing failed.');
  }
}
const stop = (code: string): never => {
  throw new InputError(code);
};
const pathKey = (file: string): string => (process.platform === 'win32' ? file.toLowerCase() : file);
function sameEntry(a: BigIntStats, b: BigIntStats): boolean {
  return (
    a.ino === b.ino &&
    (a.dev === b.dev ||
      (process.platform === 'win32' && (a.dev === 0n || b.dev === 0n) && a.birthtimeNs === b.birthtimeNs))
  );
}
async function ancestors(file: string): Promise<Map<string, BigIntStats>> {
  const entries = new Map<string, BigIntStats>();
  let current = path.dirname(file);
  for (;;) {
    const stat = await fs.lstat(current, { bigint: true });
    if (!stat.isDirectory() || stat.isSymbolicLink()) stop('unsafe_directory');
    entries.set(current, stat);
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (pathKey(await fs.realpath(path.dirname(file))) !== pathKey(path.dirname(file))) stop('unsafe_directory');
  return entries;
}

async function read(file: string, limits: ReviewLimits): Promise<Buffer> {
  const parents = await ancestors(file);
  const before = await fs.lstat(file, { bigint: true });
  if (
    !before.isFile() ||
    before.isSymbolicLink() ||
    before.nlink !== 1n ||
    pathKey(await fs.realpath(file)) !== pathKey(file)
  )
    stop('unsafe_file');
  if (before.size > limits.maxBytes) stop('input_too_large');
  const handle = await fs.open(file, constants.O_RDONLY | (process.platform === 'win32' ? 0 : constants.O_NOFOLLOW));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameEntry(before, opened) || opened.size !== before.size || opened.nlink !== 1n) stop('source_changed');
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, length);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const current = await fs.lstat(file, { bigint: true });
    if (
      length !== Number(before.size) ||
      after.size !== before.size ||
      after.mtimeNs !== before.mtimeNs ||
      after.ctimeNs !== before.ctimeNs ||
      !sameEntry(before, current) ||
      current.isSymbolicLink() ||
      current.nlink !== 1n ||
      current.mtimeNs !== before.mtimeNs
    )
      stop('source_changed');
    const finalParents = await ancestors(file);
    for (const [directory, stat] of parents) {
      const final = finalParents.get(directory);
      if (!final || !sameEntry(stat, final)) stop('source_changed');
    }
    return buffer.subarray(0, length);
  } finally {
    await handle.close();
  }
}

export async function readDocument(
  file: string,
  limits: ReviewLimits,
  strictJson = false,
): Promise<{ document: unknown; referencesUsed: number; sha256: string; bytes: number }> {
  let bytes: Buffer;
  try {
    bytes = await read(file, limits);
  } catch (error) {
    if (error instanceof InputError) throw error;
    return stop('read_failed');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return stop('invalid_encoding');
  }
  let document: unknown;
  let scalarAliases = 0;
  try {
    // Strict JSON syntax plus YAML's duplicate-key rejection. JSON_SCHEMA alone is not strict JSON.
    if (strictJson || path.extname(file).toLowerCase() === '.json') JSON.parse(text);
    let parseDepth = 0;
    let parseNodes = 0;
    type ParsedChild = { value: unknown; followedByColon: boolean };
    const frames: { start: number; children: ParsedChild[] }[] = [];
    const aliases = new Set<number>();
    const primitiveAliases = new Set<number>();
    const colon = /(?:[ \t\r\n]|#[^\r\n]*)*:/y;
    const alias = /(?:[ \t\r\n]|#[^\r\n]*)*\*/y;
    document = load(text, {
      schema: JSON_SCHEMA,
      json: false,
      onWarning: () => stop('invalid_document'),
      listener: (event, state) => {
        if (event === 'open') {
          if (++parseDepth > limits.maxDepth + 2) stop('depth_limit');
          if (++parseNodes > limits.maxNodes * 3) stop('node_limit');
          frames.push({ start: state.position, children: [] });
        } else {
          parseDepth--;
          const frame = frames.pop();
          if (!frame) return stop('invalid_document');
          const value: unknown = state.result;
          colon.lastIndex = state.position;
          const followedByColon = colon.test(state.input);
          // js-yaml stringifies mapping keys. Validate node types before losing that evidence.
          if (followedByColon && typeof value !== 'string') stop('invalid_document');
          const wrapper = frame.children.length === 1 && frame.children[0]?.value === value;
          if (state.kind === 'mapping' && !wrapper) {
            let key = true;
            for (const child of frame.children) {
              if (key && typeof child.value !== 'string') stop('invalid_document');
              key = key ? !child.followedByColon : true;
            }
          }
          // Aliases retain kind=null, including scalar and null aliases. Count source tokens
          // once because the parser can emit speculative wrapper nodes for one token.
          alias.lastIndex = frame.start;
          if (state.kind === null && alias.test(state.input) && alias.lastIndex <= state.position) {
            aliases.add(alias.lastIndex - 1);
            if (value === null || typeof value !== 'object') primitiveAliases.add(alias.lastIndex - 1);
            if (aliases.size > limits.maxReferences) stop('reference_limit');
          }
          frames.at(-1)?.children.push({ value, followedByColon });
        }
      },
    });
    scalarAliases = primitiveAliases.size;
  } catch (error) {
    if (error instanceof InputError) throw error;
    return stop('invalid_document');
  }
  let nodes = 0;
  let references = scalarAliases;
  const seen = new WeakSet<object>();
  const active = new WeakSet<object>();
  function visit(value: unknown, depth: number): void {
    if (++nodes > limits.maxNodes) stop('node_limit');
    if (depth > limits.maxDepth) stop('depth_limit');
    if (typeof value === 'number' && !Number.isFinite(value)) stop('invalid_document');
    if (value === null || typeof value !== 'object') return;
    if (active.has(value)) stop('cyclic_alias');
    if (seen.has(value) && ++references > limits.maxReferences) stop('reference_limit');
    seen.add(value);
    active.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (!Array.isArray(value) && key === '<<') stop('unsupported_yaml_merge');
      visit(child, depth + 1);
    }
    active.delete(value);
  }
  visit(document, 0);
  return {
    document,
    referencesUsed: references,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  };
}
