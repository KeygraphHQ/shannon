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
import { join, resolve } from 'node:path';
import { DELIVERABLE_FILENAMES, type DeliverableType } from '../types/deliverables.js';

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
  const deliverablesDir = join(targetDir, 'deliverables');
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
