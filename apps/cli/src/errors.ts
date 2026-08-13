/**
 * Centralized error reporting.
 *
 * `fail` — an expected, user-fixable error (bad input, missing prerequisite):
 * a clean message on stderr and a non-zero exit, never a stack trace.
 * `crash` — an unexpected error (a bug): a brief message, the full stack written
 * to a log file for a bug report, and a pointer to the issue tracker.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ISSUES_URL = 'https://github.com/KeygraphHQ/shannon/issues';

/** Report an expected, user-fixable error (with optional extra lines) and exit non-zero. */
export function fail(message: string, ...hints: string[]): never {
  console.error(`ERROR: ${message}`);
  for (const hint of hints) {
    console.error(hint);
  }
  process.exit(1);
}

/** Report an unexpected error: brief message, full stack to a log file, plus the issue link. */
export function crash(error: unknown): never {
  console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
  if (process.env.DEBUG) {
    console.error(error instanceof Error ? error.stack : String(error));
  }

  const logPath = writeCrashLog(error);
  if (logPath) {
    console.error(`Details written to ${logPath}`);
  }
  console.error(`If this looks like a bug, please report it: ${ISSUES_URL}`);
  process.exit(1);
}

/** Write the full error and stack to a log file; return its path, or null if it can't be written. */
function writeCrashLog(error: unknown): string | null {
  try {
    const logPath = path.join(os.tmpdir(), 'shannon-error.log');
    const detail = error instanceof Error && error.stack ? error.stack : String(error);
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${detail}\n`);
    return logPath;
  } catch {
    return null;
  }
}
