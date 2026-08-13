/**
 * `shannon progress <workspace>` — one scan's live progress from Temporal.
 *
 * While the scan runs, polls Temporal and redraws the phase/agent tree on a
 * terminal (a pipe or a finished scan gets a single frame). When the scan reaches
 * a terminal state, prints the overall result and exits. Reads Temporal directly —
 * no worker, no session files — so it needs Temporal up and shows scans within its
 * ~24h retention window.
 */

import { setTimeout as sleep } from 'node:timers/promises';
import { fail } from '../errors.js';
import { type RenderInput, renderScan } from '../scan/render.js';
import { describeScan, getTerminalOutcome, queryProgress, type ScanDescription } from '../temporal-client.js';
import { stdoutIsTerminal, supportsColor } from '../tty.js';

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
/** Redraw cadence for the spinner animation; data is refreshed on the slower poll. */
const RENDER_MS = 120;
const POLL_MS = 1200;

/** Terminal = anything other than an open, running execution. */
function isTerminalStatus(status: string): boolean {
  return status !== 'RUNNING' && status !== 'UNSPECIFIED';
}

function exitCodeFor(input: RenderInput): number {
  if (input.temporalStatus === 'FAILED' || input.temporalStatus === 'TIMED_OUT') return 1;
  if (input.state?.status === 'failed') return 1;
  return 0;
}

/** Live view of a running scan: its progress query plus the in-flight agents from describe. */
async function buildRunningInput(workspace: string, desc: ScanDescription): Promise<RenderInput> {
  const state = await queryProgress(workspace);
  return {
    workspace,
    temporalStatus: desc.status,
    state,
    running: desc.runningAgents,
    ...(desc.startedAt !== undefined && { startedAt: desc.startedAt }),
  };
}

/** Final view of a closed scan: its result (or the failure) plus timing from describe. */
async function buildTerminalInput(workspace: string, desc: ScanDescription): Promise<RenderInput> {
  const outcome = await getTerminalOutcome(workspace);
  const timing = {
    ...(desc.startedAt !== undefined && { startedAt: desc.startedAt }),
    ...(desc.closedAt !== undefined && { endedAt: desc.closedAt }),
  };
  if (outcome.kind === 'success') {
    return { workspace, temporalStatus: desc.status, state: outcome.state, running: [], ...timing };
  }
  return {
    workspace,
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
async function watch(workspace: string): Promise<never> {
  let prevLines = 0;
  let frame = 0;
  let cached: RenderInput | null = null;

  const draw = (input: RenderInput, live: boolean): void => {
    const out = renderScan(input, { now: Date.now(), color: supportsColor(), unicode: true, live, frame });
    if (prevLines > 0) process.stdout.write(`\x1b[${prevLines}A\x1b[0J`);
    process.stdout.write(`${out}\n`);
    prevLines = out.split('\n').length;
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
    const desc = await describeScan(workspace);
    if (!desc) {
      clearInterval(ticker);
      fail(`Scan "${workspace}" is no longer in Temporal.`);
    }

    if (isTerminalStatus(desc.status)) {
      clearInterval(ticker);
      const input = await buildTerminalInput(workspace, desc);
      draw(input, false);
      process.exit(exitCodeFor(input));
    }

    cached = await buildRunningInput(workspace, desc);
    await sleep(POLL_MS);
  }
}

export async function progress(workspace: string): Promise<void> {
  // WorkflowId == workspace name for a first run. (Resumed scans spawn a new workflow id — not yet resolved here.)
  let desc: ScanDescription | null;
  try {
    desc = await describeScan(workspace);
  } catch {
    fail('Could not reach Temporal at 127.0.0.1:7233.', 'Start Temporal (it comes up with a scan) and try again.');
  }

  if (!desc) {
    fail(
      `No scan found for "${workspace}".`,
      '',
      'Scans are visible while running and for ~24h after they finish (Temporal retention).',
    );
  }

  // A finished scan, or output that isn't a live terminal, gets a single frame.
  if (isTerminalStatus(desc.status) || !stdoutIsTerminal()) {
    const input = isTerminalStatus(desc.status)
      ? await buildTerminalInput(workspace, desc)
      : await buildRunningInput(workspace, desc);
    printFrame(input);
    process.exit(exitCodeFor(input));
  }

  await watch(workspace);
}
