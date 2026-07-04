/**
 * `shannon logs` command — tail a scan's live log.
 *
 * Uses chokidar for reliable cross-platform file watching and
 * bounded synchronous reads to prevent duplicate output.
 */

import fs from 'node:fs';
import path from 'node:path';
import { watch } from 'chokidar';
import { getWorkspacesDir } from '../home.js';
import { resolveRunFile } from '../paths.js';

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
function resolveLogFile(workspaceId: string): string {
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

  console.error(`ERROR: No scan found named: ${workspaceId}`);
  console.error('');
  console.error('Possible causes:');
  console.error("  - The scan hasn't started yet");
  console.error('  - The workspace name is incorrect');
  console.error('');
  console.error('Check the dashboard at http://localhost:8233 for scan details');
  process.exit(1);
}

export function logs(workspaceId: string): void {
  const logFile = resolveLogFile(workspaceId);
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

  console.log(`Tailing scan log: ${logFile}`);

  // 1. Output existing content
  if (flush()) {
    process.exit(0);
  }

  // 2. Watch for appended content via chokidar
  const watcher = watch(logFile, { persistent: true });

  const shutdown = (): void => {
    watcher.close().finally(() => process.exit(0));
    // Safety net — force exit if watcher.close() stalls
    setTimeout(() => process.exit(0), 1000).unref();
  };

  watcher.on('change', () => {
    if (flush()) shutdown();
  });

  process.on('SIGINT', shutdown);
}
