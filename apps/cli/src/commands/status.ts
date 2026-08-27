/**
 * `shannon status <workspace>` — one scan's live progress from Temporal.
 *
 * While the scan runs, polls Temporal and redraws the phase/agent tree on a
 * terminal (a pipe or a finished scan gets a single frame). When the scan reaches
 * a terminal state, prints the overall result and exits. Local session records prove
 * the target's canonical workspace/workflow identity; the progress itself is read from
 * Temporal directly — no worker — so it needs Temporal up and shows scans within its
 * retention window (Shannon configures seven days by default; see SHANNON_TEMPORAL_RETENTION).
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { failWith } from '../errors.js';
import { commandPrefix, isLocal } from '../mode.js';
import { type RenderInput, renderScan } from '../scan/render.js';
import { toStatusJson } from '../scan/status-json.js';
import { displaySplash } from '../splash.js';
import {
  ActivityMirrorError,
  describeScan,
  getTerminalOutcome,
  queryProgress,
  type ScanDescription,
} from '../temporal-client.js';
import { stdoutIsTerminal, supportsColor } from '../tty.js';
import { getVersion } from '../version.js';
import { resolveScanIdentity } from '../workspaces.js';

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
/** Redraw cadence for the spinner animation; data is refreshed on the slower poll. */
const RENDER_MS = 120;
const POLL_MS = 1200;

/** Terminal = anything other than an open, running execution. */
function isTerminalStatus(status: string): boolean {
  return status !== 'RUNNING' && status !== 'UNSPECIFIED';
}

/**
 * Read one scan description, telling the two failure modes apart. A stale activity mirror
 * carries its own message and needs a CLI update; anything else is a read that did not reach
 * a usable answer, which is most often Temporal being down.
 */
async function readScanDescription(workflowId: string): Promise<ScanDescription | null> {
  try {
    return await describeScan(workflowId);
  } catch (error) {
    if (error instanceof ActivityMirrorError) failWith('CLI_SCAN_SCHEMA_UNSUPPORTED', error.message);
    failWith(
      'CLI_SCAN_STATUS_UNAVAILABLE',
      "Could not read this scan's progress.",
      'If Temporal is not running, start a scan to bring it up. If it is running, this build of the CLI',
      'does not recognise part of the scan and needs updating.',
    );
  }
}

// Match SGR color escapes (ESC[…m) so a line's on-screen width excludes them. Built from the ESC
// char code so the source carries no literal control character.
const ANSI_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

/**
 * Physical terminal rows a frame occupies, so the live redraw moves the cursor up by the right
 * amount. A line wider than the terminal wraps onto extra rows, so counting logical lines alone
 * undercounts and the redraw drifts downward. Color escapes don't take screen columns, so strip them.
 */
function physicalRows(frame: string): number {
  const columns = process.stdout.columns || 80;
  return frame.split('\n').reduce((rows, line) => {
    const width = line.replace(ANSI_PATTERN, '').length;
    return rows + Math.max(1, Math.ceil(width / columns));
  }, 0);
}

function exitCodeFor(input: RenderInput): number {
  if (input.temporalStatus === 'FAILED' || input.temporalStatus === 'TIMED_OUT') return 1;
  if (input.state?.status === 'failed') return 1;
  return 0;
}

/** Live view of a running scan: its progress query plus the in-flight agents from describe. */
async function buildRunningInput(workspace: string, workflowId: string, desc: ScanDescription): Promise<RenderInput> {
  const state = await queryProgress(workflowId);
  return {
    workspace,
    workflowId,
    temporalStatus: desc.status,
    state,
    running: desc.runningAgents,
    ...(desc.startedAt !== undefined && { startedAt: desc.startedAt }),
  };
}

/** Final view of a closed scan: its result (or the failure) plus timing from describe. */
async function buildTerminalInput(workspace: string, workflowId: string, desc: ScanDescription): Promise<RenderInput> {
  const outcome = await getTerminalOutcome(workflowId);
  const timing = {
    ...(desc.startedAt !== undefined && { startedAt: desc.startedAt }),
    ...(desc.closedAt !== undefined && { endedAt: desc.closedAt }),
  };
  if (outcome.kind === 'success') {
    return { workspace, workflowId, temporalStatus: desc.status, state: outcome.state, running: [], ...timing };
  }
  return {
    workspace,
    workflowId,
    temporalStatus: desc.status,
    state: null,
    running: [],
    failureMessage: outcome.message,
    ...timing,
  };
}

function printFrame(input: RenderInput): void {
  const frame = renderScan(input, {
    now: Date.now(),
    color: supportsColor(),
    unicode: stdoutIsTerminal(),
    live: false,
    frame: 0,
  });
  process.stdout.write(`${frame}\n`);
}

/**
 * Poll Temporal and redraw until the scan reaches a terminal state, then print the
 * final frame and exit. A fast ticker animates the running spinner off the cached
 * snapshot; the network poll refreshes that snapshot on a slower cadence.
 */
async function watch(workspace: string, workflowId: string): Promise<never> {
  let prevRows = 0;
  let frame = 0;
  let cached: RenderInput | null = null;

  const draw = (input: RenderInput, live: boolean): void => {
    const out = renderScan(input, { now: Date.now(), color: supportsColor(), unicode: true, live, frame });
    if (prevRows > 0) process.stdout.write(`\x1b[${prevRows}A\x1b[0J`);
    process.stdout.write(`${out}\n`);
    prevRows = physicalRows(out);
  };

  process.on('exit', () => process.stdout.write(SHOW_CURSOR));
  process.on('SIGINT', () => {
    process.stdout.write('\n');
    process.exit(0);
  });
  process.stdout.write(HIDE_CURSOR);

  const ticker = setInterval(() => {
    frame++;
    if (cached) draw(cached, true);
  }, RENDER_MS);

  for (;;) {
    const desc = await readScanDescription(workflowId);
    if (!desc) {
      clearInterval(ticker);
      failWith('CLI_SCAN_NOT_FOUND', `Scan "${workspace}" is no longer in Temporal.`);
    }

    if (isTerminalStatus(desc.status)) {
      clearInterval(ticker);
      const input = await buildTerminalInput(workspace, workflowId, desc);
      draw(input, false);
      process.exit(exitCodeFor(input));
    }

    cached = await buildRunningInput(workspace, workflowId, desc);
    await sleep(POLL_MS);
  }
}

/** Read one point-in-time snapshot from Temporal: the terminal result if closed, else live progress. */
async function snapshot(workspace: string, workflowId: string, desc: ScanDescription): Promise<RenderInput> {
  return isTerminalStatus(desc.status)
    ? buildTerminalInput(workspace, workflowId, desc)
    : buildRunningInput(workspace, workflowId, desc);
}

export async function status(target: string, opts: { readonly json: boolean }): Promise<void> {
  // Target selection picked a string; identity resolution proves the canonical workspace and
  // workflow pair from session records before Temporal is queried. A workspace name follows its
  // latest resume; an exact recorded workflow id keeps addressing that execution. A raw id with
  // no local record is refused rather than echoed into the required workspace field.
  const identity = resolveScanIdentity(target);
  if (identity.kind === 'ambiguous') {
    failWith(
      'CLI_SCAN_IDENTITY_AMBIGUOUS',
      `Multiple workspaces claim workflow ID "${target}": ${identity.claims.join(', ')}.`,
      `Run '${commandPrefix()} scans' and pass the workspace directory name instead.`,
    );
  }
  if (identity.kind === 'not-found') {
    failWith(
      'CLI_SCAN_IDENTITY_NOT_FOUND',
      identity.reason === 'unreadable-record'
        ? `Workspace "${target}" has no readable session record (${identity.sessionPath}).`
        : `No scan matches "${target}" in the local workspace records.`,
      `Run '${commandPrefix()} scans' to list scans.`,
      'Temporal dashboard: http://localhost:8233',
    );
  }
  const { workspace, workflowId } = identity;

  const desc = await readScanDescription(workflowId);

  if (!desc) {
    failWith(
      'CLI_SCAN_NOT_FOUND',
      `No scan found for "${workspace}".`,
      '',
      "Scan histories are available while a scan runs and within Temporal's retention window after it finishes.",
      "Shannon configures 7 days of retention by default (override: SHANNON_TEMPORAL_RETENTION). Expired histories can't be restored.",
    );
  }

  // --json is always a single snapshot then exit, even on a TTY — it never enters the live watch loop.
  if (opts.json) {
    const input = await snapshot(workspace, workflowId, desc);
    process.stdout.write(`${JSON.stringify(toStatusJson(input, Date.now()), null, 2)}\n`);
    process.exit(exitCodeFor(input));
  }

  // Human-facing views open with the splash; skip it off a real terminal so piped output stays clean.
  if (stdoutIsTerminal()) {
    displaySplash(isLocal() ? undefined : getVersion());
  }

  // A finished scan, or output that isn't a live terminal, gets a single frame.
  if (isTerminalStatus(desc.status) || !stdoutIsTerminal()) {
    const input = await snapshot(workspace, workflowId, desc);
    printFrame(input);
    process.exit(exitCodeFor(input));
  }

  await watch(workspace, workflowId);
}
