/**
 * Shared argument parsing for CLI commands.
 *
 * Every command declares which boolean flags, value options, and positionals it
 * accepts; `parseArgs` resolves aliases, rejects anything unrecognized, and hands
 * back a typed result. This centralizes the common flags (notably `--yes`/`-y`) so
 * each command no longer re-hardcodes `args.includes('--yes')`, and it makes
 * unknown flags and stray arguments fail loudly instead of being silently ignored.
 */

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

    const booleanKey = booleanByToken.get(arg);
    if (booleanKey !== undefined) {
      flags[booleanKey] = true;
      continue;
    }

    const valueKey = valueByToken.get(arg);
    if (valueKey !== undefined) {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('-')) {
        throw new ArgError(`Option ${arg} requires a value`);
      }
      values[valueKey] = next;
      i++;
      continue;
    }

    if (arg.startsWith('-')) {
      throw new ArgError(`Unknown option: ${arg}`);
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
