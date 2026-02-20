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
 * 3. Credentials validate (API key, OAuth token, or router mode)
 */

import fs from 'fs/promises';
import { PentestError } from './error-handling.js';
import { ErrorCode } from '../types/errors.js';
import { type Result, ok, err } from '../types/result.js';
import { parseConfig } from '../config-parser.js';
import type { ActivityLogger } from '../types/activity-logger.js';

const VALIDATION_MODEL = 'claude-haiku-3-5-20241022';
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_OAUTH_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const FETCH_TIMEOUT_MS = 30_000;

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

/**
 * Validate a direct Anthropic API key via minimal Messages API call.
 * Costs ~$0.000025 (1 input token + 1 output token on Haiku).
 */
async function validateApiKey(
  apiKey: string,
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  logger.info('Validating Anthropic API key...');

  try {
    const response = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: VALIDATION_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      logger.info('API key OK');
      return ok(undefined);
    }

    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '';
    }

    if (response.status === 401) {
      return err(
        new PentestError(
          `API authentication failed: invalid x-api-key`,
          'config',
          false,
          { status: response.status },
          ErrorCode.AUTH_FAILED
        )
      );
    }

    if (response.status === 402 || response.status === 403) {
      return err(
        new PentestError(
          `Anthropic billing error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`,
          'billing',
          true,
          { status: response.status },
          ErrorCode.BILLING_ERROR
        )
      );
    }

    if (response.status === 429) {
      return err(
        new PentestError(
          `Spending cap or rate limit reached (HTTP 429)`,
          'billing',
          true,
          { status: response.status },
          ErrorCode.BILLING_ERROR
        )
      );
    }

    // Other status codes (5xx, etc) - transient
    return err(
      new PentestError(
        `Anthropic API error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`,
        'network',
        true,
        { status: response.status }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new PentestError(
        `Failed to reach Anthropic API: ${message}`,
        'network',
        true,
        { originalError: message }
      )
    );
  }
}

/**
 * Validate an OAuth token via the Anthropic usage endpoint.
 * Confirms the token is valid and checks quota availability.
 */
async function validateOAuthToken(
  token: string,
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  logger.info('Validating OAuth token...');

  try {
    const response = await fetch(ANTHROPIC_OAUTH_USAGE_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (response.ok) {
      logger.info('OAuth token OK');
      return ok(undefined);
    }

    let errorBody: string;
    try {
      errorBody = await response.text();
    } catch {
      errorBody = '';
    }

    if (response.status === 401) {
      return err(
        new PentestError(
          `OAuth token is invalid or expired`,
          'config',
          false,
          { status: response.status },
          ErrorCode.AUTH_FAILED
        )
      );
    }

    if (response.status === 403 || response.status === 429) {
      return err(
        new PentestError(
          `OAuth billing/quota error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`,
          'billing',
          true,
          { status: response.status },
          ErrorCode.BILLING_ERROR
        )
      );
    }

    return err(
      new PentestError(
        `OAuth validation error (HTTP ${response.status}): ${errorBody.slice(0, 200)}`,
        'network',
        true,
        { status: response.status }
      )
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new PentestError(
        `Failed to reach Anthropic OAuth endpoint: ${message}`,
        'network',
        true,
        { originalError: message }
      )
    );
  }
}

/**
 * Validate credentials based on detected auth mode.
 *
 * Auth modes (mutually exclusive):
 * - Router mode (ANTHROPIC_BASE_URL set): skip validation, log warning
 * - OAuth (CLAUDE_CODE_OAUTH_TOKEN set): validate via /api/oauth/usage
 * - API key (ANTHROPIC_API_KEY set): validate via Messages API
 * - None: error
 */
async function validateCredentials(
  logger: ActivityLogger
): Promise<Result<void, PentestError>> {
  // 1. Router mode — can't validate provider keys, just warn
  if (process.env.ANTHROPIC_BASE_URL) {
    logger.warn('Router mode detected — skipping API credential validation');
    return ok(undefined);
  }

  // 2. OAuth token
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (oauthToken) {
    return validateOAuthToken(oauthToken, logger);
  }

  // 3. Direct API key
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) {
    return validateApiKey(apiKey, logger);
  }

  // 4. No credentials
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

  // 3. Credential check (cheap — 1 token or single GET)
  const credResult = await validateCredentials(logger);
  if (!credResult.ok) {
    return credResult;
  }

  logger.info('All preflight checks passed');
  return ok(undefined);
}
