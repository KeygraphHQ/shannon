#!/usr/bin/env node

// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * save-deliverable CLI
 *
 * Standalone script to save deliverable files.
 *
 * Usage:
 *   node save-deliverable.js --type INJECTION_ANALYSIS --file-path deliverables/injection_analysis_deliverable.md
 */

import { mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { DELIVERABLE_FILENAMES, type DeliverableType } from '../types/deliverables.js';

const MAX_CONTENT_BYTES = 1024 * 1024; // 1 MiB cap for --content to protect Temporal buffer limits
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MiB hard cap on --file-path reads (defense-in-depth)

/**
 * Resolve --file-path with symlink-safe guards.
 * Rejects NUL bytes, absolute paths that escape cwd after canonicalisation, symlinks
 * whose final target escapes cwd (the /proc/self/environ attack), non-regular files,
 * and files larger than MAX_FILE_BYTES.
 */
function resolveSafeFilePath(cwd: string, rawFilePath: string): { ok: true; path: string } | { ok: false; error: string } {
  if (rawFilePath.includes('\0')) {
    return { ok: false, error: '--file-path contains NUL byte' };
  }

  // Stage 1: lexical-only traversal check (fast-reject obvious `..` escapes).
  const lexicallyResolved = resolve(cwd, rawFilePath);
  const withSepCwd = cwd.endsWith(sep) ? cwd : cwd + sep;
  if (lexicallyResolved !== cwd && !lexicallyResolved.startsWith(withSepCwd)) {
    return { ok: false, error: `Path traversal detected: ${rawFilePath}` };
  }

  // Stage 2: canonicalise via realpath and enforce that the FINAL (symlink-followed)
  // target is still inside cwd. Defeats the symlink-in-scratchpad -> /proc/self/environ
  // credential-exfiltration attack where the path itself resolves inside cwd but the
  // symlink it points at resolves outside.
  let realCwd: string;
  let realPath: string;
  try {
    realCwd = realpathSync.native(cwd);
  } catch (err) {
    return { ok: false, error: `Cannot canonicalise cwd: ${err instanceof Error ? err.message : String(err)}` };
  }
  try {
    realPath = realpathSync.native(lexicallyResolved);
  } catch (err) {
    return { ok: false, error: `Cannot canonicalise --file-path: ${err instanceof Error ? err.message : String(err)}` };
  }
  const withSepRealCwd = realCwd.endsWith(sep) ? realCwd : realCwd + sep;
  if (realPath !== realCwd && !realPath.startsWith(withSepRealCwd)) {
    return { ok: false, error: `Symlink escapes cwd (realpath=${realPath}, cwd=${realCwd})` };
  }

  // Stage 3: must be a regular file. Rejects directories, FIFOs, char/block devices,
  // sockets — all of which readFileSync would otherwise happily follow.
  let st: ReturnType<typeof statSync>;
  try {
    st = statSync(realPath);
  } catch (err) {
    return { ok: false, error: `Cannot stat --file-path: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!st.isFile()) {
    return { ok: false, error: `--file-path is not a regular file (mode=${st.mode.toString(8)})` };
  }

  // Stage 4: size cap. Guards against the agent pointing at a giant file.
  if (st.size > MAX_FILE_BYTES) {
    return { ok: false, error: `--file-path exceeds ${MAX_FILE_BYTES}-byte cap (got ${st.size})` };
  }

  return { ok: true, path: realPath };
}

function errorJson(message: string, retryable: boolean = false): string {
  return JSON.stringify({ status: 'error', message, retryable });
}

/**
 * Resolve SHANNON_DELIVERABLES_SUBDIR against targetDir with strict guards.
 * Rejects NUL bytes, absolute paths, and any resolved path that escapes targetDir.
 */
function resolveSafeDeliverablesDir(targetDir: string): { ok: true; dir: string } | { ok: false; error: string } {
  const rawSubdir = process.env.SHANNON_DELIVERABLES_SUBDIR || '.shannon/deliverables';

  if (rawSubdir.includes('\0')) {
    return { ok: false, error: 'SHANNON_DELIVERABLES_SUBDIR contains NUL byte' };
  }

  if (isAbsolute(rawSubdir)) {
    return { ok: false, error: `SHANNON_DELIVERABLES_SUBDIR must be relative (got absolute: ${rawSubdir})` };
  }

  const canonicalTarget = resolve(targetDir);
  const candidate = resolve(canonicalTarget, rawSubdir);

  const withSep = canonicalTarget.endsWith(sep) ? canonicalTarget : canonicalTarget + sep;
  if (candidate !== canonicalTarget && !candidate.startsWith(withSep)) {
    return {
      ok: false,
      error: `SHANNON_DELIVERABLES_SUBDIR escapes target directory (resolved=${candidate})`,
    };
  }

  return { ok: true, dir: candidate };
}

// === Argument Parsing ===

interface ParsedArgs {
  type: string;
  content?: string;
  filePath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { type: '' };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--type' && next) {
      args.type = next;
      i++;
    } else if (arg === '--content' && next) {
      args.content = next;
      i++;
    } else if (arg === '--file-path' && next) {
      args.filePath = next;
      i++;
    }
  }

  return args;
}

// === File Operations ===

function saveDeliverableFile(targetDir: string, filename: string, content: string): string {
  const dirResult = resolveSafeDeliverablesDir(targetDir);
  if (!dirResult.ok) {
    throw new Error(dirResult.error);
  }

  const deliverablesDir = dirResult.dir;
  const filepath = join(deliverablesDir, filename);

  try {
    mkdirSync(deliverablesDir, { recursive: true });
  } catch {
    throw new Error(`Cannot create deliverables directory at ${deliverablesDir}`);
  }

  writeFileSync(filepath, content, 'utf8');
  return filepath;
}

// === Main ===

function main(): void {
  const args = parseArgs(process.argv);

  // 1. Validate --type
  if (!args.type) {
    console.log(JSON.stringify({ status: 'error', message: 'Missing required --type argument', retryable: false }));
    process.exit(1);
  }

  const deliverableType = args.type as DeliverableType;
  const filename = DELIVERABLE_FILENAMES[deliverableType];

  if (!filename) {
    console.log(
      JSON.stringify({ status: 'error', message: `Unknown deliverable type: ${args.type}`, retryable: false }),
    );
    process.exit(1);
  }

  // 2. Resolve content from --content or --file-path
  let content: string;

  if (args.content) {
    if (Buffer.byteLength(args.content, 'utf8') > MAX_CONTENT_BYTES) {
      console.log(errorJson(`--content exceeds ${MAX_CONTENT_BYTES}-byte cap; use --file-path for large deliverables`));
      process.exit(1);
    }
    content = args.content;
  } else if (args.filePath) {
    // Symlink-safe path validation. Rejects traversal, non-regular files, and any
    // symlink whose final target resolves outside cwd (the /proc/self/environ attack).
    const cwd = process.cwd();
    const pathResult = resolveSafeFilePath(cwd, args.filePath);
    if (!pathResult.ok) {
      console.log(errorJson(pathResult.error));
      process.exit(1);
    }

    try {
      content = readFileSync(pathResult.path, 'utf8');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ status: 'error', message: `Failed to read file: ${msg}`, retryable: true }));
      process.exit(1);
    }
  } else {
    console.log(
      JSON.stringify({
        status: 'error',
        message: 'Either --content or --file-path is required',
        retryable: false,
      }),
    );
    process.exit(1);
  }

  // 3. Save the file
  try {
    const targetDir = process.cwd();
    const filepath = saveDeliverableFile(targetDir, filename, content);
    console.log(JSON.stringify({ status: 'success', filepath }));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ status: 'error', message: `Failed to save: ${msg}`, retryable: true }));
    process.exit(1);
  }
}

main();
