/**
 * `shannon scans` command — list completed scans and where each report lives.
 *
 * A scan counts as completed when it produced a report. The report can live in any of a
 * few locations depending on the version that ran it, so `findReport` probes them in order
 * and the first hit is both the completion signal and the link target behind the workspace
 * name. The date, wall-clock duration, and cost come from the run's session.json
 * (createdAt/completedAt/metrics), with the report file's mtime as the date fallback for
 * runs that lack a recorded time.
 *
 * Human-readable by default; `--json` emits the same rows as raw machine values on stdout.
 *
 * Filesystem-only (local ./workspaces/ or npx ~/.shannon/workspaces/ via getWorkspacesDir);
 * no Temporal dependency.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOLD, GOLD, paint } from '../colors.js';
import { getWorkspacesDir } from '../home.js';
import { getMode } from '../mode.js';
import { FINAL_REPORT_PDF_FILENAME, INTERNAL_DIR, resolveRunFile } from '../paths.js';
import { stdoutIsTerminal, supportsColor } from '../tty.js';

/** Assembled report in the deliverables dir. Must match ASSEMBLED_REPORT_FILENAME in the worker package. */
const ASSEMBLED_REPORT_FILENAME = 'comprehensive_security_assessment_report.md';

/** Run-root markdown surfaced by older versions, before the PDF. Kept so those runs still list. */
const FINAL_REPORT_MD_FILENAME = 'Security-Assessment-Report.md';

const DELIVERABLES_SUBDIR = 'deliverables';

/** One completed scan; raw values so the table and --json render from one source. */
interface ScanRow {
  readonly workspace: string;
  /** Completion time in ms — sort key and date source. */
  readonly finishedMs: number;
  /** Wall-clock duration (completedAt − createdAt) in ms, or null when unknown. */
  readonly durationMs: number | null;
  /** Total cost in USD, or null when unknown. */
  readonly costUsd: number | null;
  /** Absolute path to the report file — the link target behind the workspace name. */
  readonly report: string;
}

/** The --json row shape: raw machine values, one per completed scan. */
interface JsonRow {
  readonly workspace: string;
  readonly finishedAt: string;
  readonly durationMs: number | null;
  readonly costUsd: number | null;
  readonly reportPath: string;
}

/** Compact wall-clock duration from milliseconds: "47s", "1m 32s", "1h 47m". */
function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m ${totalSeconds % 60}s`;
  }
  return `${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`;
}

/**
 * Wrap `text` in an OSC 8 hyperlink to `url` so a supporting terminal opens it on click,
 * or return `text` unchanged. Terminals without OSC 8 simply show the text.
 */
function hyperlink(text: string, url: string): string {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

/** First existing report path for a run (newest-surfaced first), or null if it has none. */
function findReport(runDir: string): string | null {
  const candidates = [
    path.join(runDir, FINAL_REPORT_PDF_FILENAME),
    path.join(runDir, FINAL_REPORT_MD_FILENAME),
    path.join(runDir, INTERNAL_DIR, DELIVERABLES_SUBDIR, ASSEMBLED_REPORT_FILENAME),
    path.join(runDir, DELIVERABLES_SUBDIR, ASSEMBLED_REPORT_FILENAME),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

interface SessionData {
  readonly session: { readonly createdAt?: string; readonly completedAt?: string };
  readonly metrics: { readonly total_cost_usd?: number };
}

/** Read a run's session.json (dual-read across layouts). Missing or unreadable → empty shape. */
function readSession(runDir: string): SessionData {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveRunFile(runDir, 'session.json'), 'utf8'));
    return { session: parsed?.session ?? {}, metrics: parsed?.metrics ?? {} };
  } catch {
    return { session: {}, metrics: {} };
  }
}

/** Gather every workspace that has a report, one row each. */
function collectCompletedScans(workspacesDir: string): ScanRow[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
  } catch {
    // Workspaces directory does not exist yet — no scans have ever run.
    return [];
  }

  const rows: ScanRow[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const runDir = path.join(workspacesDir, entry.name);
    const reportPath = findReport(runDir);
    if (!reportPath) {
      continue;
    }

    const { session, metrics } = readSession(runDir);
    const completedMs = Date.parse(session.completedAt ?? '');
    const createdMs = Date.parse(session.createdAt ?? '');
    const finishedMs = Number.isNaN(completedMs) ? fs.statSync(reportPath).mtimeMs : completedMs;
    const durationMs = Number.isNaN(completedMs) || Number.isNaN(createdMs) ? null : completedMs - createdMs;
    const costUsd = typeof metrics.total_cost_usd === 'number' ? metrics.total_cost_usd : null;

    rows.push({ workspace: entry.name, finishedMs, durationMs, costUsd, report: reportPath });
  }
  return rows;
}

function toJsonRow(row: ScanRow): JsonRow {
  return {
    workspace: row.workspace,
    finishedAt: new Date(row.finishedMs).toISOString(),
    durationMs: row.durationMs,
    costUsd: row.costUsd,
    reportPath: row.report,
  };
}

/** Print the completed scans as an aligned table with the workspace name linked to its report. */
function printTable(workspacesDir: string, rows: readonly ScanRow[]): void {
  if (rows.length === 0) {
    const prefix = getMode() === 'local' ? './shannon' : 'npx @keygraph/shannon';
    console.log(`No completed scans yet. Run '${prefix} start -u <url> -r <path>' to begin.`);
    return;
  }

  const color = supportsColor();
  // On a terminal the workspace name is an OSC 8 hyperlink that opens its report; when
  // piped there is nothing to click, so it prints as plain text.
  const linkable = stdoutIsTerminal();

  const table = rows.map((row) => ({
    finished: new Date(row.finishedMs).toISOString().slice(0, 10),
    duration: row.durationMs === null ? '—' : formatDuration(row.durationMs),
    cost: row.costUsd === null ? '—' : `$${row.costUsd.toFixed(2)}`,
    workspace: row.workspace,
    report: row.report,
  }));

  const dateWidth = Math.max('FINISHED'.length, 'YYYY-MM-DD'.length);
  const durationWidth = Math.max('DURATION'.length, ...table.map((row) => row.duration.length));
  const costWidth = Math.max('COST'.length, ...table.map((row) => row.cost.length));

  console.log(`\nCompleted scans in ${workspacesDir}:\n`);
  const header = `${'FINISHED'.padEnd(dateWidth)}  ${'DURATION'.padEnd(durationWidth)}  ${'COST'.padEnd(costWidth)}  WORKSPACE`;
  console.log(paint(header, BOLD, color));

  for (const row of table) {
    const finished = row.finished.padEnd(dateWidth);
    const duration = row.duration.padEnd(durationWidth);
    const cost = row.cost.padEnd(costWidth);
    const name = paint(row.workspace, GOLD, color);
    const workspace = linkable ? hyperlink(name, pathToFileURL(row.report).href) : name;
    console.log(`${finished}  ${duration}  ${cost}  ${workspace}`);
  }
  console.log('');
}

export function scans(opts: { readonly json: boolean }): void {
  const workspacesDir = getWorkspacesDir();
  const rows = collectCompletedScans(workspacesDir);

  // Latest on top.
  rows.sort((a, b) => b.finishedMs - a.finishedMs);

  if (opts.json) {
    console.log(JSON.stringify(rows.map(toJsonRow), null, 2));
    return;
  }

  printTable(workspacesDir, rows);
}
