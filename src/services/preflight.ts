// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Preflight Validation Service
 *
 * Runs cheap, fast checks before any agent execution begins.
 * Catches configuration and credential problems early, saving
 * time and API costs compared to failing mid-pipeline.
 *
 * Checks run sequentially, cheapest first:
 * 1. Repository path exists and contains .git
 * 2. Config file parses and validates (if provided)
 * 3. Credentials validate via Claude Agent SDK query (API key, OAuth, or router mode)
 */

import fs from 'fs/promises';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SDKAssistantMessageError } from '@anthropic-ai/claude-agent-sdk';
import { PentestError, isRetryableError } from './error-handling.js';
import { ErrorCode } from '../types/errors.js';
import { type Result, ok, err } from '../types/result.js';
import { parseConfig } from '../config-parser.js';
import type { ActivityLogger } from '../types/activity-logger.js';

// === Repository Validation ===

async function validateRepo(
  repoPath: string,
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  logger.info('Checking repository path...', { repoPath });

  // 1. Check repo directory exists
  try {
    const stats = await fs.stat(repoPath);
    if (!stats.isDirectory()) {
      return err(
        new PentestError(
          `Repository path is not a directory: ${repoPath}`,
          'config',
          false,
          { repoPath },
          ErrorCode.REPO_NOT_FOUND
        )
      );
    }
  } catch {
    return err(
      new PentestError(
        `Repository path does not exist: ${repoPath}`,
        'config',
        false,
        { repoPath },
        ErrorCode.REPO_NOT_FOUND
      )
    );
  }

  // 2. Check .git directory exists
  try {
    const gitStats = await fs.stat(`${repoPath}/.git`);
    if (!gitStats.isDirectory()) {
      return err(
        new PentestError(
          `Not a git repository (no .git directory): ${repoPath}`,
          'config',
          false,
          { repoPath },
          ErrorCode.REPO_NOT_FOUND
        )
      );
    }
  } catch {
    return err(
      new PentestError(
        `Not a git repository (no .git directory): ${repoPath}`,
        'config',
        false,
        { repoPath },
        ErrorCode.REPO_NOT_FOUND
      )
    );
  }

  logger.info('Repository path OK');
  return ok(undefined);
}

// === Config Validation ===

async function validateConfig(
  configPath: string,
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  logger.info('Validating configuration file...', { configPath });

  try {
    await parseConfig(configPath);
    logger.info('Configuration file OK');
    return ok(undefined);
  } catch (error) {
    if (error instanceof PentestError) {
      return err(error);
    }
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new PentestError(
        `Configuration validation failed: ${message}`,
        'config',
        false,
        { configPath },
        ErrorCode.CONFIG_VALIDATION_FAILED
      )
    );
  }
}

// === Credential Validation ===

/** Map SDK error type to a human-readable preflight PentestError. */
function classifySdkError(
  sdkError: SDKAssistantMessageError,
  authType: string
): Result<void, PentestError> {
  switch (sdkError) {
    case 'authentication_failed':
      return err(new PentestError(
        `Invalid ${authType}. Check your credentials in .env and try again.`,
        'config', false, { authType, sdkError }, ErrorCode.AUTH_FAILED
      ));
    case 'billing_error':
      return err(new PentestError(
        `Anthropic account has a billing issue. Add credits or check your billing dashboard.`,
        'billing', true, { authType, sdkError }, ErrorCode.BILLING_ERROR
      ));
    case 'rate_limit':
      return err(new PentestError(
        `Anthropic rate limit or spending cap reached. Wait a few minutes and try again.`,
        'billing', true, { authType, sdkError }, ErrorCode.BILLING_ERROR
      ));
    case 'server_error':
      return err(new PentestError(
        `Anthropic API is temporarily unavailable. Try again shortly.`,
        'network', true, { authType, sdkError }
      ));
    default:
      return err(new PentestError(
        `${authType} validation failed unexpectedly. Check your credentials in .env.`,
        'config', false, { authType, sdkError }, ErrorCode.AUTH_FAILED
      ));
  }
}

/** Validate credentials via a minimal Claude Agent SDK query. */
async function validateCredentials(
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  // 1. Router mode — can't validate provider keys, just warn
  if (process.env.ANTHROPIC_BASE_URL) {
    logger.warn('Router mode detected — skipping API credential validation');
    return ok(undefined);
  }

  // 2. Check that at least one credential is present
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return err(
      new PentestError(
        'No API credentials found. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env',
        'config',
        false,
        {},
        ErrorCode.AUTH_FAILED
      )
    );
  }

  // 3. Validate via SDK query
  const authType = process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'OAuth token' : 'API key';
  logger.info(`Validating ${authType} via SDK...`);

  try {
    for await (const message of query({ prompt: 'hi', options: { model: 'claude-haiku-4-5-20251001', maxTurns: 1 } })) {
      if (message.type === 'assistant' && message.error) {
        return classifySdkError(message.error, authType);
      }
      if (message.type === 'result') {
        break;
      }
    }

    logger.info(`${authType} OK`);
    return ok(undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const retryable = isRetryableError(error instanceof Error ? error : new Error(message));

    return err(
      new PentestError(
        retryable
          ? `Failed to reach Anthropic API. Check your network connection.`
          : `${authType} validation failed: ${message}`,
        retryable ? 'network' : 'config',
        retryable,
        { authType },
        retryable ? undefined : ErrorCode.AUTH_FAILED
      )
    );
  }
}

// === Preflight Orchestrator ===

/**
 * Run all preflight checks sequentially (cheapest first).
 *
 * 1. Repository path exists and contains .git
 * 2. Config file parses and validates (if configPath provided)
 * 3. Credentials validate (API key, OAuth, or router mode)
 *
 * Returns on first failure.
 */
export async function runPreflightChecks(
  repoPath: string,
  configPath: string | undefined,
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  // 1. Repository check (free — filesystem only)
  const repoResult = await validateRepo(repoPath, logger);
  if (!repoResult.ok) {
    return repoResult;
  }

  // 2. Config check (free — filesystem + CPU)
  if (configPath) {
    const configResult = await validateConfig(configPath, logger);
    if (!configResult.ok) {
      return configResult;
    }
  }

  // 3. Credential check (cheap — 1 SDK round-trip)
  const credResult = await validateCredentials(logger);
  if (!credResult.ok) {
    return credResult;
  }

  logger.info('All preflight checks passed');
  return ok(undefined);
}
