/**
 * `shannon logs` command — tail a scan's live log.
 *
 * Uses chokidar for reliable cross-platform file watching and
 * bounded synchronous reads to prevent duplicate output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'chokidar';
import { fail } from '../errors.js';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';
import { stdoutIsTerminal } from '../tty.js';

// Match the exact line the worker writes — anchored to prevent false positives from agent output
const COMPLETION_PATTERN = /^Scan (COMPLETED|FAILED)$/m;

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

/**
 * Tail a scan's log until it reports completion, resolving when the completion marker appears
 * (or the file is gone, or Ctrl-C stops it). Never exits the process, so the caller decides what
 * happens next: plain `logs` exits 0; `start --follow` reads the workflow outcome first.
 */
export function tailUntilComplete(logFile: string): Promise<void> {
  return new Promise((resolve) => {
    let position = 0;

    /**
     * Output any new content appended since the last read.
     * Returns true when the workflow completion marker is detected.
     */
    function flush(): boolean {
      try {
        const { size } = fs.statSync(logFile);
        if (size <= position) return false;

        const data = readRange(logFile, position, size);
        process.stdout.write(data);
        position = size;

        return COMPLETION_PATTERN.test(data);
      } catch {
        // File deleted or unreadable — treat as done
        return true;
      }
    }

    // 1. Output existing content
    if (flush()) {
      resolve();
      return;
    }

    // 2. Watch for appended content via chokidar
    const watcher = watch(logFile, { persistent: true });

    const stop = (): void => {
      watcher.close().finally(() => resolve());
      // Safety net — resolve anyway if watcher.close() stalls
      setTimeout(() => resolve(), 1000).unref();
    };

    watcher.on('change', () => {
      if (flush()) stop();
    });

    process.on('SIGINT', stop);
  });
}

export function logs(workspaceId: string): void {
  const logFile = resolveLogFile(workspaceId);
  console.error(stdoutIsTerminal() ? `Tailing scan log: ${logFile}` : 'Tailing scan log');
  tailUntilComplete(logFile).finally(() => process.exit(0));
}
