/**
 * Shannon 1.9.0 invocation builder.
 *
 * Builds the exact, already-verified Shannon CLI invocation:
 *
 *   npx @keygraph/shannon@1.9.0 start --url <URL> --repo <REPO> [--workspace <NAME>]
 *
 * No other flags are ever added here. If a future phase needs another
 * Shannon capability, it must be verified against the real CLI first and
 * added explicitly — this module must never guess at undocumented flags.
 */

import { err, ok, type Result } from '../types.js';

export const SHANNON_PACKAGE_SPEC = '@keygraph/shannon@1.9.0';

export interface ShannonInvocationInput {
  readonly url: string;
  readonly repo: string;
  readonly workspace?: string;
}

export interface ShannonInvocation {
  readonly command: 'npx';
  readonly args: readonly string[];
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function buildShannonInvocation(input: ShannonInvocationInput): Result<ShannonInvocation, string> {
  if (!isHttpUrl(input.url)) {
    return err(`"${input.url}" is not a valid http(s) URL for Shannon --url`);
  }
  if (input.repo.trim().length === 0) {
    return err('Shannon --repo must be a non-empty local path');
  }
  if (input.repo.includes('://')) {
    return err(`Shannon --repo must be a local filesystem path, got "${input.repo}"`);
  }

  const args = [SHANNON_PACKAGE_SPEC, 'start', '--url', input.url, '--repo', input.repo];
  if (input.workspace !== undefined && input.workspace.trim().length > 0) {
    args.push('--workspace', input.workspace);
  }

  return ok({ command: 'npx', args });
}

/** Renders an invocation the way it would be typed on a command line. */
export function formatInvocation(invocation: ShannonInvocation): string {
  return [invocation.command, ...invocation.args].join(' ');
}
