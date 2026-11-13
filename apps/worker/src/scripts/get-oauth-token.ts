#!/usr/bin/env node

// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * get-oauth-token CLI
 *
 * Emits a currently-valid OAuth access token for an API-only target, refreshing it
 * transparently against the token endpoint when the cached token is stale. This mirrors the
 * `generate-totp` helper: the shared-session prompt has each agent run it via the `bash`
 * tool and inject the result as a bearer header, e.g.
 *
 *   curl -H "Authorization: Bearer $(get-oauth-token --config <file>)" https://api.target/...
 *
 * The OAuth config (including the client secret) is read from a file written by the
 * preflight, never from argv, so the secret never lands in the process table or prompt text.
 * On success the raw token is printed to stdout with no trailing decoration so command
 * substitution yields exactly the token. On error a JSON diagnostic goes to stderr, exit 1.
 *
 * Usage:
 *   get-oauth-token --config /path/to/oauth-config.json
 *   get-oauth-token --config /path/to/oauth-config.json --json
 *   get-oauth-token --help
 */

import { getValidToken, OAuthTokenError } from '../services/oauth-token.js';

function printHelp(): void {
  console.log(
    `get-oauth-token - emit a current OAuth access token for an API target.

Usage:
  get-oauth-token --config <file>       Print a valid access token to stdout.
  get-oauth-token --config <file> --json Print {"status":"success","token":"..."} instead.
  get-oauth-token --help

Options:
  --config <file>  Path to the JSON OAuth config written by the auth preflight.
  --json           Emit a JSON envelope instead of the bare token.
  -h, --help       Show this help and exit.

Output:
  Success: the raw access token on stdout (or a JSON envelope with --json).
  Error:   {"status":"error","message":"...","retryable":bool} on stderr (exit 1).`,
  );
}

function parseArg(argv: string[], name: string): string | undefined {
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
  }
  return undefined;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  const configFile = parseArg(process.argv, '--config');
  const asJson = process.argv.includes('--json');

  if (!configFile) {
    process.stderr.write(
      `${JSON.stringify({ status: 'error', message: 'Missing required --config <file> argument', retryable: false })}\n`,
    );
    process.exit(1);
    return;
  }

  try {
    const token = await getValidToken(configFile);
    if (asJson) {
      process.stdout.write(`${JSON.stringify({ status: 'success', token })}\n`);
    } else {
      // Bare token, no newline decoration issues: a trailing newline is fine inside "$( )".
      process.stdout.write(`${token}\n`);
    }
  } catch (error) {
    const retryable = error instanceof OAuthTokenError ? error.retryable : false;
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${JSON.stringify({ status: 'error', message, retryable })}\n`);
    process.exit(1);
  }
}

void main();
