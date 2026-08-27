/**
 * Centralized error reporting.
 *
 * `fail` / `failWith` — an expected, user-fixable error (bad input, missing
 * prerequisite): a clean message on stderr and a non-zero exit, never a stack trace.
 * `failUsage` — a malformed invocation (unknown command, bad or missing
 * arguments): the same clean message, but a distinct exit code so callers can
 * tell a usage mistake from an operational failure.
 * `crash` — an unexpected error (a bug): a fixed code and a pointer to the issue tracker.
 *
 * JSON mode (enabled once, before parsing, for the `--json` command surface) replaces
 * the text lines with one compact envelope on stderr — stdout stays empty — while the
 * exit-code split is unchanged. Call sites on a JSON-capable path must exit through
 * `failWith`/`failUsage`/`crash` (never a bare `fail` or `warn`) so every failure
 * carries a stable code and stderr stays parseable.
 */

import fs from 'node:fs';

const ISSUES_URL = 'https://github.com/KeygraphHQ/shannon/issues';

const UNEXPECTED_MESSAGE = 'Shannon encountered an unexpected failure. Reference code: SHANNON_UNEXPECTED_ERROR';
const REPORT_HINT = `If this looks like a bug, please report it: ${ISSUES_URL}`;

/** Stable machine-readable failure codes for the JSON error envelope. */
export type ErrorCode =
  | 'CLI_USAGE'
  | 'CLI_SCAN_NOT_FOUND'
  | 'CLI_SCAN_IDENTITY_NOT_FOUND'
  | 'CLI_SCAN_IDENTITY_AMBIGUOUS'
  | 'CLI_SCAN_STATUS_UNAVAILABLE'
  | 'CLI_SCAN_SCHEMA_UNSUPPORTED'
  | 'CLI_PRECONDITION_FAILED'
  | 'CLI_INTERNAL_ERROR';

let jsonMode = false;

/** Switch failure reporting to the JSON envelope. Set once, before any guard, parse, or dispatch. */
export function enableJsonErrors(): void {
  jsonMode = true;
}

/** Whether failures are reported as the JSON envelope rather than text. */
export function jsonErrorsEnabled(): boolean {
  return jsonMode;
}

/** Fixed unexpected-failure projection shared by the runtime and focused safety tests. */
export function unexpectedFailureLines(): readonly string[] {
  return [`ERROR: ${UNEXPECTED_MESSAGE}`, REPORT_HINT];
}

/**
 * Report a failure on stderr and exit. Text mode prints the message and every hint
 * verbatim; JSON mode writes one compact envelope (dropping the empty strings used
 * to space text output) synchronously so `process.exit` cannot truncate it.
 */
function emit(exitCode: 1 | 2, code: ErrorCode, message: string, hints: readonly string[]): never {
  if (jsonMode) {
    const payload = JSON.stringify({ error: { code, message, hints: hints.filter((hint) => hint.trim() !== '') } });
    fs.writeSync(process.stderr.fd, `${payload}\n`);
    process.exit(exitCode);
  }
  console.error(`ERROR: ${message}`);
  for (const hint of hints) {
    console.error(hint);
  }
  process.exit(exitCode);
}

/**
 * Report an expected, user-fixable error (with optional extra lines) and exit non-zero.
 * Text-only paths use this; a JSON-capable path must use `failWith` so the envelope
 * carries a real code — if a bare `fail` is ever reached in JSON mode, the fixed
 * internal-error envelope is emitted instead of guessing a code for the message.
 */
export function fail(message: string, ...hints: string[]): never {
  if (jsonMode) {
    emit(1, 'CLI_INTERNAL_ERROR', UNEXPECTED_MESSAGE, [REPORT_HINT]);
  }
  emit(1, 'CLI_INTERNAL_ERROR', message, hints);
}

/** Report an expected operational failure under a stable code and exit 1. */
export function failWith(code: ErrorCode, message: string, ...hints: string[]): never {
  emit(1, code, message, hints);
}

/** Report a usage/argument error (with optional extra lines) and exit 2. */
export function failUsage(message: string, ...hints: string[]): never {
  emit(2, 'CLI_USAGE', message, hints);
}

/** Report a non-fatal warning on stderr (with optional extra lines) without exiting. */
export function warn(message: string, ...hints: string[]): void {
  console.error(`WARNING: ${message}`);
  for (const hint of hints) {
    console.error(hint);
  }
}

/** Report an unexpected error without projecting its message, stack, or attached values. */
export function crash(_error: unknown): never {
  if (jsonMode) {
    emit(1, 'CLI_INTERNAL_ERROR', UNEXPECTED_MESSAGE, [REPORT_HINT]);
  }
  for (const line of unexpectedFailureLines()) console.error(line);
  process.exit(1);
}
