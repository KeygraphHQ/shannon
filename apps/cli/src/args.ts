/**
 * Shared argument parsing for CLI commands.
 *
 * Every command declares which boolean flags, value options, and positionals it
 * accepts; `parseArgs` resolves aliases, rejects anything unrecognized, and hands
 * back a typed result. This centralizes the common flags (notably `--yes`/`-y`) so
 * each command no longer re-hardcodes `args.includes('--yes')`, and it makes
 * unknown flags and stray arguments fail loudly instead of being silently ignored.
 */

import { closestMatch } from './suggest.js';

/** Thrown when argv does not match a command's schema. The dispatcher formats it. */
export class ArgError extends Error {}

/** Tokens that set the "skip confirmation" flag, declared once for every command. */
export const YES_FLAGS = ['--yes', '-y'] as const;

export interface ArgSchema {
  /** Boolean flags: result key -> accepted tokens (canonical plus any aliases). */
  readonly booleans?: Record<string, readonly string[]>;
  /** Value-taking options: result key -> accepted tokens. */
  readonly values?: Record<string, readonly string[]>;
  /** Maximum positional arguments allowed. Defaults to 0. */
  readonly maxPositionals?: number;
  /** Extra guidance appended to the error when too many positionals are given. */
  readonly positionalHint?: string;
}

export interface ParsedArgs {
  readonly flags: Record<string, boolean>;
  readonly values: Record<string, string>;
  readonly positionals: readonly string[];
}

/** Build a token -> result-key lookup from a schema section. */
function indexTokens(section: Record<string, readonly string[]>): Map<string, string> {
  const byToken = new Map<string, string>();
  for (const [key, tokens] of Object.entries(section)) {
    for (const token of tokens) {
      byToken.set(token, key);
    }
  }
  return byToken;
}

export function parseArgs(argv: readonly string[], schema: ArgSchema): ParsedArgs {
  const booleanByToken = indexTokens(schema.booleans ?? {});
  const valueByToken = indexTokens(schema.values ?? {});
  const maxPositionals = schema.maxPositionals ?? 0;

  const flags: Record<string, boolean> = {};
  const values: Record<string, string> = {};
  const positionals: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) {
      continue;
    }

    const equalsIndex = arg.startsWith('--') ? arg.indexOf('=') : -1;
    const token = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);
    const inlineValue = equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);

    const booleanKey = booleanByToken.get(token);
    if (booleanKey !== undefined) {
      if (inlineValue !== undefined) {
        throw new ArgError(`Flag ${token} does not take a value`);
      }
      flags[booleanKey] = true;
      continue;
    }

    const valueKey = valueByToken.get(token);
    if (valueKey !== undefined) {
      if (inlineValue !== undefined) {
        values[valueKey] = inlineValue;
        continue;
      }
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new ArgError(`Option ${token} requires a value`);
      }
      values[valueKey] = next;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      const suggestion = closestMatch(token, [...booleanByToken.keys(), ...valueByToken.keys()]);
      const hint = suggestion ? `\nDid you mean '${suggestion}'?` : '';
      throw new ArgError(`Unknown option: ${token}${hint}`);
    }

    positionals.push(arg);
  }

  if (positionals.length > maxPositionals) {
    const extra = positionals[maxPositionals];
    const hint = schema.positionalHint ? `\n${schema.positionalHint}` : '';
    throw new ArgError(`Unexpected argument: ${extra}${hint}`);
  }

  return { flags, values, positionals };
}
