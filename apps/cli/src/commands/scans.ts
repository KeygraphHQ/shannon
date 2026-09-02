/**
 * `shannon scans` command — list scans, running and completed, and where each report lives.
 *
 * Running scans come from Docker: every worker container is stamped with the shannon.workspace
 * label, so `runningScanWorkspaces()` is the authoritative live-scan list (shared with `stop`).
 * A scan counts as completed once it has produced a report; the report can live in any of a few
 * locations depending on the version that ran it, so `findReport` probes them in order and the
 * first hit is both the completion signal and the link target behind the workspace name. Dates and
 * durations come from each run's session.json (createdAt/completedAt), with the report file's mtime
 * as the date fallback for runs that lack a recorded time; a running scan's duration is elapsed time
 * so far (now − createdAt).
 *
 * Running scans are listed first, then completed newest-first. Human-readable by default; `--json`
 * emits the same rows as raw machine values on stdout.
 *
 * The completed list is filesystem-only (local ./workspaces/ or npx ~/.shannon/workspaces/ via
 * getWorkspacesDir); the running list needs Docker but degrades to empty when the daemon is down,
 * which is the correct answer (no scan can be running then).
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BOLD, CYAN, GOLD, paint } from '../colors.js';
import { runningScanWorkspaces } from '../docker.js';
import { getWorkspacesDir } from '../home.js';
import { commandPrefix } from '../mode.js';
import { FINAL_REPORT_PDF_FILENAME, INTERNAL_DIR, resolveRunFile } from '../paths.js';
import { stdoutIsTerminal, supportsColor } from '../tty.js';

/** Assembled report in the deliverables dir. Must match ASSEMBLED_REPORT_FILENAME in the worker package. */
const ASSEMBLED_REPORT_FILENAME = 'comprehensive_security_assessment_report.md';

/** Run-root markdown surfaced by older versions, before the PDF. Kept so those runs still list. */
const FINAL_REPORT_MD_FILENAME = 'Security-Assessment-Report.md';

const DELIVERABLES_SUBDIR = 'deliverables';

/** One scan, running or completed; raw values so the table and --json render from one source. */
interface ScanRow {
  readonly workspace: string;
  readonly state: 'running' | 'completed';
  /** Completion time in ms — sort key and date source. Null while a scan is still running. */
  readonly finishedMs: number | null;
  /** Wall-clock duration in ms: elapsed-so-far for running, total for completed. Null when unknown. */
  readonly durationMs: number | null;
  /** Absolute path to the report file — the link target behind the workspace name. Null while running. */
  readonly report: string | null;
}

/** The --json row shape: raw machine values, one per scan. */
interface JsonRow {
  readonly workspace: string;
  readonly state: 'running' | 'completed';
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
  readonly reportPath: string | null;
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
}

/** Read a run's session.json (dual-read across layouts). Missing or unreadable → empty shape. */
function readSession(runDir: string): SessionData {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveRunFile(runDir, 'session.json'), 'utf8'));
    return { session: parsed?.session ?? {} };
  } catch {
    return { session: {} };
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

    const { session } = readSession(runDir);
    const completedMs = Date.parse(session.completedAt ?? '');
    const createdMs = Date.parse(session.createdAt ?? '');
    const finishedMs = Number.isNaN(completedMs) ? fs.statSync(reportPath).mtimeMs : completedMs;
    const durationMs = Number.isNaN(completedMs) || Number.isNaN(createdMs) ? null : completedMs - createdMs;

    rows.push({ workspace: entry.name, state: 'completed', finishedMs, durationMs, report: reportPath });
  }
  return rows;
}

/** Gather every currently-running scan, one row each. Elapsed time is now − createdAt. */
function collectRunningScans(workspacesDir: string, nowMs: number): ScanRow[] {
  const rows: ScanRow[] = [];
  for (const workspace of runningScanWorkspaces()) {
    const { session } = readSession(path.join(workspacesDir, workspace));
    const createdMs = Date.parse(session.createdAt ?? '');
    const durationMs = Number.isNaN(createdMs) ? null : nowMs - createdMs;
    rows.push({ workspace, state: 'running', finishedMs: null, durationMs, report: null });
  }
  return rows;
}

function toJsonRow(row: ScanRow): JsonRow {
  return {
    workspace: row.workspace,
    state: row.state,
    finishedAt: row.finishedMs === null ? null : new Date(row.finishedMs).toISOString(),
    durationMs: row.durationMs,
    reportPath: row.report,
  };
}

/** Print the scans as an aligned table with each completed workspace name linked to its report. */
function printTable(workspacesDir: string, rows: readonly ScanRow[]): void {
  if (rows.length === 0) {
    const prefix = commandPrefix();
    console.log(`No scans yet. Run '${prefix} start -u <url> -r <path>' to begin.`);
    return;
  }

  const color = supportsColor();
  // On a terminal a completed workspace name is an OSC 8 hyperlink that opens its report; when
  // piped, or for a running scan that has no report yet, it prints as plain text.
  const linkable = stdoutIsTerminal();

  const table = rows.map((row) => ({
    state: row.state === 'running' ? 'RUNNING' : 'COMPLETED',
    finished: row.finishedMs === null ? '—' : new Date(row.finishedMs).toISOString().slice(0, 10),
    duration: row.durationMs === null ? '—' : formatDuration(row.durationMs),
    workspace: row.workspace,
    report: row.report,
  }));

  const stateWidth = Math.max('STATE'.length, ...table.map((row) => row.state.length));
  const dateWidth = Math.max('FINISHED'.length, 'YYYY-MM-DD'.length);
  const durationWidth = Math.max('DURATION'.length, ...table.map((row) => row.duration.length));

  console.log(`\nScans in ${workspacesDir}:\n`);
  const header = `${'STATE'.padEnd(stateWidth)}  ${'FINISHED'.padEnd(dateWidth)}  ${'DURATION'.padEnd(durationWidth)}  WORKSPACE`;
  console.log(paint(header, BOLD, color));

  for (const row of table) {
    const stateText = row.state.padEnd(stateWidth);
    const state = row.state === 'RUNNING' ? paint(stateText, CYAN, color) : stateText;
    const finished = row.finished.padEnd(dateWidth);
    const duration = row.duration.padEnd(durationWidth);
    // A running scan has no report to open, so its name stays plain; completed names are linked.
    const name = row.report ? paint(row.workspace, GOLD, color) : row.workspace;
    const workspace = row.report && linkable ? hyperlink(name, pathToFileURL(row.report).href) : name;
    console.log(`${state}  ${finished}  ${duration}  ${workspace}`);
  }
  console.log('');
}

export function scans(opts: { readonly json: boolean }): void {
  const workspacesDir = getWorkspacesDir();
  const nowMs = Date.now();

  const running = collectRunningScans(workspacesDir, nowMs);
  const runningNames = new Set(running.map((row) => row.workspace));
  // A running scan has no final report, so it can't also be completed; guard anyway.
  const completed = collectCompletedScans(workspacesDir).filter((row) => !runningNames.has(row.workspace));

  // Running scans on top (most recently started first), then completed newest-first.
  running.sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0));
  completed.sort((a, b) => (b.finishedMs ?? 0) - (a.finishedMs ?? 0));
  const rows = [...running, ...completed];

  if (opts.json) {
    console.log(JSON.stringify(rows.map(toJsonRow), null, 2));
    return;
  }

  printTable(workspacesDir, rows);
}
