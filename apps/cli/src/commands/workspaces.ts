/**
 * `shannon workspaces` command — list all workspaces.
 *
 * Reads the workspaces directory and each run's session.json directly on the
 * host: pure filesystem work, no worker image or Docker daemon required.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { OutputFormat } from '../format.js';
import { getWorkspacesDir } from '../home.js';
import { isLocal } from '../mode.js';
import { resolveRunFile } from '../paths.js';

interface SessionJson {
  session: {
    webUrl: string;
    status: 'in-progress' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
  };
  metrics: {
    total_cost_usd: number;
  };
}

interface WorkspaceInfo {
  name: string;
  url: string;
  status: 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt: Date | null;
  costUsd: number;
}

const NAME_WIDTH = 30;
const URL_WIDTH = 30;
const STATUS_WIDTH = 14;
const DURATION_WIDTH = 10;
const COST_WIDTH = 10;

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen - 1)}…`;
}

/** Read one run directory's session.json into a WorkspaceInfo, or null if it has none/invalid. */
function readWorkspace(workspacesDir: string, entry: string): WorkspaceInfo | null {
  const sessionPath = resolveRunFile(path.join(workspacesDir, entry), 'session.json');
  try {
    const data = JSON.parse(fs.readFileSync(sessionPath, 'utf-8')) as SessionJson;
    return {
      name: entry,
      url: data.session.webUrl,
      status: data.session.status,
      createdAt: new Date(data.session.createdAt),
      completedAt: data.session.completedAt ? new Date(data.session.completedAt) : null,
      costUsd: data.metrics.total_cost_usd,
    };
  } catch {
    // Skip directories without a valid session.json
    return null;
  }
}

function printRow(ws: WorkspaceInfo): void {
  const endTime = ws.completedAt ?? new Date();
  const duration = formatDuration(endTime.getTime() - ws.createdAt.getTime());
  const cost = `$${ws.costUsd.toFixed(2)}`;
  const resumeTag = ws.status !== 'completed' ? ' (resumable)' : '';

  console.log(
    '  ' +
      truncate(ws.name, NAME_WIDTH - 2).padEnd(NAME_WIDTH) +
      truncate(ws.url, URL_WIDTH - 2).padEnd(URL_WIDTH) +
      ws.status.padEnd(STATUS_WIDTH) +
      duration.padEnd(DURATION_WIDTH) +
      cost.padEnd(COST_WIDTH) +
      resumeTag,
  );
}

/** JSON/plain shape for one workspace: dates as ISO strings, duration precomputed. */
interface SerializableWorkspace {
  name: string;
  url: string;
  status: WorkspaceInfo['status'];
  createdAt: string;
  completedAt: string | null;
  durationMs: number;
  costUsd: number;
  resumable: boolean;
}

function toSerializable(ws: WorkspaceInfo): SerializableWorkspace {
  const endTime = ws.completedAt ?? new Date();
  return {
    name: ws.name,
    url: ws.url,
    status: ws.status,
    createdAt: ws.createdAt.toISOString(),
    completedAt: ws.completedAt ? ws.completedAt.toISOString() : null,
    durationMs: endTime.getTime() - ws.createdAt.getTime(),
    costUsd: ws.costUsd,
    resumable: ws.status !== 'completed',
  };
}

/** One untruncated, tab-separated record for `--plain` — safe to pipe to grep/awk. */
function plainRow(ws: WorkspaceInfo): string {
  const endTime = ws.completedAt ?? new Date();
  const duration = formatDuration(endTime.getTime() - ws.createdAt.getTime());
  return [ws.name, ws.url, ws.status, duration, ws.costUsd.toFixed(2)].join('\t');
}

/**
 * Gather every run directory holding a valid session.json, most recent first.
 * A missing workspaces directory is not an error here — it just yields no rows.
 */
function collectWorkspaces(workspacesDir: string): WorkspaceInfo[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(workspacesDir);
  } catch {
    return [];
  }

  return entries
    .map((entry) => readWorkspace(workspacesDir, entry))
    .filter((ws): ws is WorkspaceInfo => ws !== null)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function workspaces(format: OutputFormat = 'human'): void {
  const workspacesDir = getWorkspacesDir();
  const found = collectWorkspaces(workspacesDir);

  // Machine formats stay valid even with zero workspaces: an empty array / no lines.
  if (format === 'json') {
    process.stdout.write(`${JSON.stringify(found.map(toSerializable), null, 2)}\n`);
    return;
  }
  if (format === 'plain') {
    for (const ws of found) {
      process.stdout.write(`${plainRow(ws)}\n`);
    }
    return;
  }

  renderHuman(workspacesDir, found);
}

function renderHuman(workspacesDir: string, found: WorkspaceInfo[]): void {
  const startCmd = isLocal() ? './shannon' : 'npx @keygraph/shannon';

  if (found.length === 0) {
    if (!fs.existsSync(workspacesDir)) {
      console.log('No workspaces directory found.');
      console.log(`Expected: ${workspacesDir}`);
      return;
    }
    console.log('\nNo workspaces found.');
    console.log(`Run a pipeline first: ${startCmd} start -u <url> -r <repo>`);
    return;
  }

  console.log('\n=== Shannon Workspaces ===\n');
  console.log(
    '  ' +
      'WORKSPACE'.padEnd(NAME_WIDTH) +
      'URL'.padEnd(URL_WIDTH) +
      'STATUS'.padEnd(STATUS_WIDTH) +
      'DURATION'.padEnd(DURATION_WIDTH) +
      'COST'.padEnd(COST_WIDTH),
  );
  console.log(`  ${'─'.repeat(NAME_WIDTH + URL_WIDTH + STATUS_WIDTH + DURATION_WIDTH + COST_WIDTH)}`);

  for (const ws of found) {
    printRow(ws);
  }

  // Summary and resume hint
  const resumableCount = found.filter((ws) => ws.status !== 'completed').length;
  console.log();
  const summary = `${found.length} workspace${found.length === 1 ? '' : 's'} found`;
  const resumeSummary = resumableCount > 0 ? ` (${resumableCount} resumable)` : '';
  console.log(`${summary}${resumeSummary}`);

  if (resumableCount > 0) {
    console.log(`\nResume with: ${startCmd} start -u <url> -r <repo> -w <name>`);
  }

  console.log();
}
