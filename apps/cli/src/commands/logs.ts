/**
 * `shannon logs` command — tail a scan's live log.
 *
 * The log file is streamed for its content; completion is decided by Temporal (the
 * workflow's status), so a worker that dies mid-run can't leave the tail hanging. Uses
 * chokidar for reliable cross-platform file watching and bounded synchronous reads to
 * prevent duplicate output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { watch } from 'chokidar';
import { fail } from '../errors.js';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';
import { resolveWorkflowId } from '../session.js';
import { waitForWorkflowClose } from '../temporal-client.js';
import { stdoutIsTerminal } from '../tty.js';

/** Read a byte range from a file and return it as a UTF-8 string. */
function readRange(filePath: string, start: number, end: number): string {
  const length = end - start;
  const buffer = Buffer.alloc(length);
  const fd = fs.openSync(filePath, 'r');
  try {
    fs.readSync(fd, buffer, 0, length, start);
  } finally {
    fs.closeSync(fd);
  }
  return buffer.toString('utf-8');
}

/** Resolve a workspace ID to its workflow.log path, or exit with an error. */
export function resolveLogFile(workspaceId: string): string {
  const workspacesDir = getWorkspacesDir();

  // 1. Direct match
  const directPath = resolveRunFile(path.join(workspacesDir, workspaceId), 'workflow.log');
  if (fs.existsSync(directPath)) return directPath;

  // 2. Resume workflow ID (e.g. workspace_resume_123)
  const resumeBase = workspaceId.replace(/_resume_\d+$/, '');
  if (resumeBase !== workspaceId) {
    const resumePath = resolveRunFile(path.join(workspacesDir, resumeBase), 'workflow.log');
    if (fs.existsSync(resumePath)) return resumePath;
  }

  // 3. Named workspace ID (e.g. workspace_shannon-123)
  const namedBase = workspaceId.replace(/_shannon-\d+$/, '');
  if (namedBase !== workspaceId) {
    const namedPath = resolveRunFile(path.join(workspacesDir, namedBase), 'workflow.log');
    if (fs.existsSync(namedPath)) return namedPath;
  }

  fail(
    `No scan found named: ${workspaceId}`,
    '',
    'Possible causes:',
    "  - The scan hasn't started yet",
    '  - The workspace name is incorrect',
    '',
    'Check the dashboard at http://localhost:8233 for scan details',
  );
}

export interface TailOptions {
  /** Workflow whose Temporal status decides when the tail stops. Without it, only Ctrl-C ends the tail. */
  readonly workflowId?: string;
  /** Called if the tail ends because Temporal became unreachable, with the captured error. */
  readonly onUnreachable?: (lastError: string) => void;
}

/**
 * Stream a scan's log to the terminal until the workflow closes (completion comes from Temporal,
 * or Ctrl-C). A Temporal outage is warned about and, if sustained, ends the tail with a diagnostic.
 * Never exits the process: plain `logs` exits; `start --follow` reads the workflow outcome first.
 */
export function tailUntilComplete(logFile: string, opts: TailOptions = {}): Promise<void> {
  return new Promise((resolve) => {
    let position = 0;
    let done = false;
    const controller = new AbortController();
    let watcher: ReturnType<typeof watch> | undefined;

    /** Output any new content appended since the last read. */
    function flush(): void {
      try {
        const { size } = fs.statSync(logFile);
        if (size <= position) return;
        const data = readRange(logFile, position, size);
        process.stdout.write(data);
        position = size;
      } catch {
        // File not present yet or transiently unreadable — nothing to flush this round.
      }
    }

    function finish(): void {
      if (done) return;
      done = true;
      controller.abort();
      if (watcher) {
        watcher.close().finally(() => resolve());
        // Safety net — resolve anyway if watcher.close() stalls.
        setTimeout(() => resolve(), 1000).unref();
      } else {
        resolve();
      }
    }

    // 1. Output existing content, then stream anything appended.
    flush();
    watcher = watch(logFile, { persistent: true });
    watcher.on('change', () => flush());

    // 2. Ctrl-C stops watching.
    process.on('SIGINT', finish);

    // 3. Temporal decides completion. Without a workflow id, the tail relies on Ctrl-C alone.
    if (opts.workflowId) {
      waitForWorkflowClose(opts.workflowId, {
        signal: controller.signal,
        onConnectionTrouble: (lastError) => {
          if (!done) console.error(`\n⚠ Lost contact with Temporal, retrying… (${lastError})`);
        },
        onReconnected: () => {
          if (!done) console.error('  Reconnected to Temporal.');
        },
      })
        .then(async (end) => {
          if (done) return;
          // Flush, let a just-written final summary land, then flush the tail once more.
          flush();
          await sleep(750).catch(() => {});
          flush();
          if (end.reason === 'unreachable') {
            console.error('\nScan watch aborted: lost contact with Temporal.');
            console.error(`  Last error: ${end.lastError}`);
            console.error('  Temporal may have crashed — check `docker compose logs temporal`.');
            opts.onUnreachable?.(end.lastError);
          }
          finish();
        })
        .catch(() => {
          // waitForWorkflowClose never rejects; guard only against an aborted race.
        });
    }
  });
}

export function logs(workspaceId: string): void {
  const logFile = resolveLogFile(workspaceId);
  const workflowId = resolveWorkflowId(workspaceId);
  console.error(stdoutIsTerminal() ? `Tailing scan log: ${logFile}` : 'Tailing scan log');

  let unreachable = false;
  tailUntilComplete(logFile, {
    ...(workflowId ? { workflowId } : {}),
    onUnreachable: () => {
      unreachable = true;
    },
  }).finally(() => process.exit(unreachable ? 1 : 0));
}
