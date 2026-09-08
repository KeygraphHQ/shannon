// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import fs from 'node:fs/promises';
import path from 'node:path';

const usage = `Usage: review <openapi|compose> <file> [--fail-on-findings]
       review repo <directory> [--include <openapi|compose>:<relative-path>] [--exclude <relative-path>] [--output <new.json>]
       review compare <baseline.json> <candidate.json> [--fail-on-new-findings]`;
const help = `${usage}

Review local OpenAPI 3.0/3.1 and Docker Compose JSON/YAML declarations offline.
Deployed behavior is not assessed. No target, Docker service, model credentials,
or network access is needed. Repository includes are additive; exclusions win.

Prerequisites: Node.js 22 or newer and pnpm 10.33.0.
Setup from the repository root:
  pnpm install --frozen-lockfile
  pnpm --filter @shannon/worker build

Run: pnpm --silent review <command> <arguments>
Help works without installed dependencies or compiled output.
Output: deterministic JSON with private file paths and JSON Pointer evidence.
Snapshot files are new files only; their existing parent must be a real directory.
Within the reviewed root, store them under a default excluded directory (output).
Exit codes: 0 completed; 1 incomplete/failed analysis, comparison or setup;
2 invalid usage; 3 findings when the corresponding opt-in gate is requested.
Incomplete analysis takes precedence over the gate, including unknown changes.
Limits per input: 4 MiB, depth 64, 100000 nodes, 1000 reference/alias expansions,
30 seconds. Repository: 10000 entries, 128 files, 32 MiB, depth 24, 120 seconds,
2 workers. Each snapshot: 16 MiB. Comparison: 30 seconds including input reads.
See docs/security-review.md for filename rules, limitations, typed API and CI use.
`;

function diagnostic(code, message, exitCode = 1) {
  const kind = process.argv[2] === 'repo' ? 'offline-repository-review' : process.argv[2] === 'compare' ? 'offline-repository-comparison' : 'offline-security-review';
  console.log(JSON.stringify({ schemaVersion: 1, kind, status: 'failed', diagnostics: [{ code, message }] }));
  process.exitCode = exitCode;
}
function parse(args) {
  if (['openapi', 'compose'].includes(args[0]) && args[1] && (args.length === 2 || (args.length === 3 && args[2] === '--fail-on-findings'))) return { command: 'file', format: args[0], file: args[1], gate: args.length === 3 };
  if (args[0] === 'compare' && args[1] && args[2] && (args.length === 3 || (args.length === 4 && args[3] === '--fail-on-new-findings'))) return { command: 'compare', baseline: args[1], candidate: args[2], gate: args.length === 4 };
  if (args[0] !== 'repo' || !args[1]) return null;
  const options = { include: [], exclude: [] }; let output;
  for (let index = 2; index < args.length; index += 2) {
    const value = args[index + 1]; if (!value || value.startsWith('--')) return null;
    if (args[index] === '--include') {
      const match = /^(openapi|compose):(.+)$/.exec(value); if (!match) return null;
      options.include.push({ format: match[1], path: match[2] });
    } else if (args[index] === '--exclude') options.exclude.push(value);
    else if (args[index] === '--output' && output === undefined) output = value;
    else return null;
  }
  return { command: 'repo', root: args[1], options, output };
}
const key = value => process.platform === 'win32' ? value.toLowerCase() : value;
async function parentsOf(file, bounded) {
  const parents = new Map(); let directory = path.dirname(file);
  for (;;) {
    const stat = await bounded(() => fs.lstat(directory, { bigint: true }));
    if (!stat.isDirectory() || stat.isSymbolicLink() || key(await bounded(() => fs.realpath(directory))) !== key(directory)) throw new Error();
    parents.set(directory, stat); const parent = path.dirname(directory); if (parent === directory) break; directory = parent;
  }
  return parents;
}
async function saveSnapshot(output, root, result, json, deadline) {
  if (typeof output !== 'string' || !output || output.includes('\0') || (process.platform === 'win32' && (/^[\\/]{2}/.test(output) || output.replace(/^[a-z]:/i, '').includes(':')))) throw new Error();
  const file = path.resolve(output); const relative = path.relative(path.resolve(root), file);
  if (path.extname(file).toLowerCase() !== '.json' || Buffer.byteLength(json) > result.limits.maxSnapshotBytes) throw new Error();
  const inside = relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
  if (inside && !relative.split(path.sep).slice(0, -1).some(segment => result.policy.excludedDirectories.includes(segment))) throw new Error();
  const controller = new AbortController();
  const check = () => { if (Date.now() >= deadline) controller.abort(); if (controller.signal.aborted) throw new Error(); };
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - Date.now()));
  const bounded = async (operation, cleanup) => {
    check(); let abort;
    const stopped = new Promise((_, reject) => { abort = () => reject(new Error()); controller.signal.addEventListener('abort', abort, { once: true }); });
    const running = operation();
    try { const value = await Promise.race([running, stopped]); check(); return value; }
    catch (error) { if (controller.signal.aborted && cleanup) void running.then(cleanup, () => {}); throw error; }
    finally { controller.signal.removeEventListener('abort', abort); }
  };
  const close = handle => { void handle.close().catch(() => {}); };
  let handle;
  try {
    const before = await parentsOf(file, bounded);
    handle = await bounded(() => fs.open(file, 'wx', 0o600), close);
    await bounded(() => handle.writeFile(json, { encoding: 'utf8', signal: controller.signal }));
    await bounded(() => handle.sync());
    const after = await parentsOf(file, bounded);
    for (const [directory, stat] of before) {
      const current = after.get(directory); if (!current || current.ino !== stat.ino || current.dev !== stat.dev) throw new Error();
    }
    const opened = await bounded(() => handle.stat({ bigint: true })); const current = await bounded(() => fs.lstat(file, { bigint: true }));
    if (current.isSymbolicLink() || current.nlink !== 1n || current.ino !== opened.ino || current.size !== opened.size) throw new Error();
  } finally { if (handle) close(handle); clearTimeout(timer); }
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') { process.stdout.write(help); return; }
  const request = parse(args);
  if (!request) { diagnostic('usage', usage, 2); return; }
  if (Number(process.versions.node.split('.')[0]) < 22) { diagnostic('unsupported_runtime', 'Review commands require Node.js 22 or newer.'); return; }
  let api;
  try { api = await import('../apps/worker/dist/security-review/index.js'); }
  catch { diagnostic('build_required', 'Review tools are unavailable. Run pnpm install --frozen-lockfile, then pnpm --filter @shannon/worker build from the repository root.'); return; }
  try {
    const deadline = Date.now() + 120_000;
    let result; let findings = 0;
    if (request.command === 'file') { result = await api.reviewFile(request.format, request.file); findings = result.issues.length; }
    else if (request.command === 'compare') { result = await api.compareSnapshotFiles(request.baseline, request.candidate); findings = result.counts.new; }
    else result = await api.reviewRepository(request.root, request.options);
    const json = JSON.stringify(result);
    if (request.output) {
      try { await saveSnapshot(request.output, request.root, result, json, deadline); }
      catch { diagnostic('output_failed', 'Snapshot output requires a new JSON file with existing real parent directories, outside source discovery. Existing files are never overwritten.'); return; }
    }
    console.log(json);
    process.exitCode = result.status !== 'completed' ? 1 : request.gate && findings ? 3 : 0;
  } catch (error) {
    if (request.command === 'repo' && error instanceof Error && error.message === 'Invalid repository options.') diagnostic('usage', usage, 2);
    else diagnostic('processing_failed', 'The offline review could not complete within its input and resource bounds.');
  }
}
await main();
