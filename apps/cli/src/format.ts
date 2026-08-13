/**
 * Output format selection for commands that print structured data.
 *
 * `human` (the default) is the decorated, aligned output meant to be read.
 * `json` emits parseable JSON; `plain` emits one untruncated record per line for
 * `grep`/`awk`. Both machine formats drop the borders, truncation, and headers
 * that make the human output unsafe to parse.
 */

import { fail } from './errors.js';

export type OutputFormat = 'human' | 'json' | 'plain';

export const JSON_FLAG = ['--json'] as const;
export const PLAIN_FLAG = ['--plain'] as const;

/** Resolve the mutually exclusive `--json`/`--plain` flags into a single format. */
export function resolveFormat(json: boolean, plain: boolean): OutputFormat {
  if (json && plain) {
    fail('Pass --json or --plain, not both.');
  }
  if (json) return 'json';
  if (plain) return 'plain';
  return 'human';
}
