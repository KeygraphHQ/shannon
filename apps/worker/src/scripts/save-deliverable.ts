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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { DELIVERABLE_FILENAMES, type DeliverableType } from '../types/deliverables.js';

const MAX_CONTENT_BYTES = 1024 * 1024; // 1 MiB cap for --content to protect Temporal buffer limits

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
    // Path traversal protection: must resolve inside cwd
    const cwd = process.cwd();
    const resolved = resolve(cwd, args.filePath);
    if (!resolved.startsWith(`${cwd}/`) && resolved !== cwd) {
      console.log(
        JSON.stringify({ status: 'error', message: `Path traversal detected: ${args.filePath}`, retryable: false }),
      );
      process.exit(1);
    }

    try {
      content = readFileSync(resolved, 'utf8');
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
