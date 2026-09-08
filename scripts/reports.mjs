// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { spawn } from 'node:child_process';
import { lstat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const usage = 'Usage: reports check <directory> [--require-integrity] | reports archive <source> <new-directory> | reports share <source> <new-directory> | reports catalog <root> | reports library <root> <new-directory>';
const help = `${usage}

Commands:
  check    Read and validate a saved bundle without modifying it.
           --require-integrity also requires matching manifest hashes.
  archive  Copy the four private artifacts exactly and add a hash manifest.
  share    Export an allowlisted summary with aliases and a hash manifest.
  catalog  Inventory saved reports and duplicates as private local JSON.
  library  Write a private, standalone HTML browser and catalog.json.

Prerequisites: Node.js 22 or newer and pnpm 10.33.0 installed.
Setup from the repository root:
  pnpm install --frozen-lockfile
  pnpm --filter @shannon/worker build

Run with: node scripts/reports.mjs <command> ...
Or use:   pnpm --silent reports <command> ...
Help works before dependencies or compiled output are installed.
Exports require a new destination with an existing parent directory.
Commands emit one JSON result. Exit codes: 0 success, 1 check/setup/operation
failure, 2 invalid usage. Unexpected child exit codes are preserved.
Manifest hashes establish self-consistency, not authenticity.
Catalog/library include private folder paths. Discovery completeness does not
establish assessment coverage. Libraries require complete directory discovery.
`;

function diagnostic(code, message, exitCode = 1) {
  console.log(JSON.stringify({ schemaVersion: 1, valid: false, issues: [{ code, message }] }));
  process.exitCode = exitCode;
}

function validArguments(args) {
  const [operation, source, destination] = args;
  if (operation === 'check' && source) {
    return args.length === 2 || (args.length === 3 && destination === '--require-integrity');
  }
  if (operation === 'catalog') return Boolean(source) && args.length === 2;
  return ['archive', 'share', 'library'].includes(operation) && Boolean(source) && Boolean(destination) && args.length === 3;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    process.stdout.write(help);
    return;
  }
  if (!validArguments(args)) {
    diagnostic('usage', usage, 2);
    return;
  }
  if (Number(process.versions.node.split('.')[0]) < 22) {
    diagnostic('unsupported_runtime', 'Report commands require Node.js 22 or newer.');
    return;
  }

  // Resolve the worker relative to this launcher, never the caller's directory.
  const cli = fileURLToPath(new URL('../apps/worker/dist/scripts/report-bundle.js', import.meta.url));
  try {
    if (!(await lstat(cli)).isFile()) throw new Error('missing build');
  } catch {
    diagnostic('build_required', 'Compiled reporting tools are unavailable. With Node.js 22 or newer and pnpm 10.33.0 installed, run pnpm install --frozen-lockfile, then pnpm --filter @shannon/worker build from the repository root.');
    return;
  }

  // No shell: paths, Unicode and metacharacters remain individual arguments.
  const child = spawn(process.execPath, [cli, ...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let outputSeen = false;
  let startFailed = false;
  child.stdout.on('data', () => { outputSeen = true; });
  child.stdout.pipe(process.stdout, { end: false });
  // Startup failures can include local paths. Report them using fixed text.
  child.stderr.resume();
  child.once('error', () => {
    startFailed = true;
    diagnostic('launch_failed', 'The reporting command could not start. Check the Node.js installation and rebuild the worker. Diagnostics omit input values.');
  });
  child.once('close', code => {
    if (startFailed) return;
    process.exitCode = code ?? 1;
    if (!outputSeen) {
      diagnostic('launch_failed', 'The reporting command ended without a result. Rebuild the worker and retry. Diagnostics omit input values.', process.exitCode || 1);
    }
  });
}

await main();
