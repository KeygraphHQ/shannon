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
 * 3. Credentials validate via Claude Agent SDK query (API key, OAuth, Bedrock, Vertex AI, or router mode)
 * 4. Target URL is reachable from the container (DNS + HTTP)
 */

import { lookup } from 'node:dns/promises';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import type { SDKAssistantMessageError } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import { resolveModel } from '../ai/models.js';
import { parseConfig } from '../config-parser.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import { ErrorCode } from '../types/errors.js';
import { err, ok, type Result } from '../types/result.js';
import { isRetryableError, PentestError } from './error-handling.js';

const TARGET_URL_TIMEOUT_MS = 10_000;

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '0.0.0.0';
}

// === Repository Validation ===

async function validateRepo(repoPath: string, logger: ActivityLogger): Promise<Result<void, PentestError>> {
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
          ErrorCode.REPO_NOT_FOUND,
        ),
      );
    }
  } catch {
    return err(
      new PentestError(
        `Repository path does not exist: ${repoPath}`,
        'config',
        false,
        { repoPath },
        ErrorCode.REPO_NOT_FOUND,
      ),
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
          ErrorCode.REPO_NOT_FOUND,
        ),
      );
    }
  } catch {
    return err(
      new PentestError(
        `Not a git repository (no .git directory): ${repoPath}`,
        'config',
        false,
        { repoPath },
        ErrorCode.REPO_NOT_FOUND,
      ),
    );
  }

  logger.info('Repository path OK');
  return ok(undefined);
}

// === Config Validation ===

async function validateConfig(configPath: string, logger: ActivityLogger): Promise<Result<void, PentestError>> {
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
        ErrorCode.CONFIG_VALIDATION_FAILED,
      ),
    );
  }
}

// === Credential Validation ===

/** Map SDK error type to a human-readable preflight PentestError. */
function classifySdkError(sdkError: SDKAssistantMessageError, authType: string): Result<void, PentestError> {
  switch (sdkError) {
    case 'authentication_failed':
      return err(
        new PentestError(
          `Invalid ${authType}. Check your credentials in .env and try again.`,
          'config',
          false,
          { authType, sdkError },
          ErrorCode.AUTH_FAILED,
        ),
      );
    case 'billing_error':
      return err(
        new PentestError(
          `Anthropic account has a billing issue. Add credits or check your billing dashboard.`,
          'billing',
          true,
          { authType, sdkError },
          ErrorCode.BILLING_ERROR,
        ),
      );
    case 'rate_limit':
      return err(
        new PentestError(
          `Anthropic rate limit or spending cap reached. Wait a few minutes and try again.`,
          'billing',
          true,
          { authType, sdkError },
          ErrorCode.BILLING_ERROR,
        ),
      );
    case 'server_error':
      return err(
        new PentestError(`Anthropic API is temporarily unavailable. Try again shortly.`, 'network', true, {
          authType,
          sdkError,
        }),
      );
    default:
      return err(
        new PentestError(
          `${authType} validation failed unexpectedly. Check your credentials in .env.`,
          'config',
          false,
          { authType, sdkError },
          ErrorCode.AUTH_FAILED,
        ),
      );
  }
}

/** Validate credentials via a minimal Claude Agent SDK query. */
async function validateCredentials(logger: ActivityLogger): Promise<Result<void, PentestError>> {
  // 1. Custom base URL — validate endpoint is reachable via SDK query
  if (process.env.ANTHROPIC_BASE_URL) {
    const baseUrl = process.env.ANTHROPIC_BASE_URL;
    logger.info(`Validating custom base URL: ${baseUrl}`);

    try {
      for await (const message of query({ prompt: 'hi', options: { model: resolveModel('small'), maxTurns: 1 } })) {
        if (message.type === 'assistant' && message.error) {
          return classifySdkError(message.error, `custom endpoint (${baseUrl})`);
        }
        if (message.type === 'result') {
          break;
        }
      }

      logger.info('Custom base URL OK');
      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(
        new PentestError(
          `Custom base URL unreachable: ${baseUrl} — ${message}`,
          'network',
          false,
          { baseUrl },
          ErrorCode.AUTH_FAILED,
        ),
      );
    }
  }

  // 2. Bedrock mode — validate required AWS credentials are present
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const required = [
      'AWS_REGION',
      'AWS_BEARER_TOKEN_BEDROCK',
      'ANTHROPIC_SMALL_MODEL',
      'ANTHROPIC_MEDIUM_MODEL',
      'ANTHROPIC_LARGE_MODEL',
    ];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return err(
        new PentestError(
          `Bedrock mode requires the following env vars in .env: ${missing.join(', ')}`,
          'config',
          false,
          { missing },
          ErrorCode.AUTH_FAILED,
        ),
      );
    }
    logger.info('Bedrock credentials OK');
    return ok(undefined);
  }

  // 3. Vertex AI mode — validate required GCP credentials are present
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
    const required = [
      'CLOUD_ML_REGION',
      'ANTHROPIC_VERTEX_PROJECT_ID',
      'ANTHROPIC_SMALL_MODEL',
      'ANTHROPIC_MEDIUM_MODEL',
      'ANTHROPIC_LARGE_MODEL',
    ];
    const missing = required.filter((v) => !process.env[v]);
    if (missing.length > 0) {
      return err(
        new PentestError(
          `Vertex AI mode requires the following env vars in .env: ${missing.join(', ')}`,
          'config',
          false,
          { missing },
          ErrorCode.AUTH_FAILED,
        ),
      );
    }
    // Validate service account credentials file is accessible
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) {
      return err(
        new PentestError(
          'Vertex AI mode requires GOOGLE_APPLICATION_CREDENTIALS pointing to a service account key JSON file',
          'config',
          false,
          {},
          ErrorCode.AUTH_FAILED,
        ),
      );
    }
    try {
      await fs.access(credPath);
    } catch {
      return err(
        new PentestError(
          `Service account key file not found at: ${credPath}`,
          'config',
          false,
          { credPath },
          ErrorCode.AUTH_FAILED,
        ),
      );
    }
    logger.info('Vertex AI credentials OK');
    return ok(undefined);
  }

  // 4. Check that at least one credential is present
  if (!process.env.ANTHROPIC_API_KEY && !process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return err(
      new PentestError(
        'No API credentials found. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env (or use CLAUDE_CODE_USE_BEDROCK=1 for AWS Bedrock, or CLAUDE_CODE_USE_VERTEX=1 for Google Vertex AI)',
        'config',
        false,
        {},
        ErrorCode.AUTH_FAILED,
      ),
    );
  }

  // 5. Validate via SDK query
  const authType = process.env.CLAUDE_CODE_OAUTH_TOKEN ? 'OAuth token' : 'API key';
  logger.info(`Validating ${authType} via SDK...`);

  try {
    for await (const message of query({ prompt: 'hi', options: { model: resolveModel('small'), maxTurns: 1 } })) {
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
        retryable ? undefined : ErrorCode.AUTH_FAILED,
      ),
    );
  }
}

// === Target URL Validation ===

/** HTTP HEAD with TLS verification disabled — we check reachability, not certificate validity. */
function httpHead(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      url,
      {
        method: 'HEAD',
        timeout: timeoutMs,
        ...(isHttps && { rejectUnauthorized: false }),
      },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Connection timed out after ${timeoutMs}ms`));
    });
    req.on('error', reject);
    req.end();
  });
}

/** Check that the target URL is reachable from inside the container. */
async function validateTargetUrl(targetUrl: string, logger: ActivityLogger): Promise<Result<void, PentestError>> {
  logger.info('Checking target URL reachability...', { targetUrl });

  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return err(
      new PentestError(
        `Invalid target URL: ${targetUrl}`,
        'config',
        false,
        { targetUrl },
        ErrorCode.TARGET_UNREACHABLE,
      ),
    );
  }

  // 2. DNS lookup — detect loopback addresses early for a better hint
  const hostname = parsed.hostname;
  let resolvedAddress: string | undefined;
  try {
    const result = await lookup(hostname);
    resolvedAddress = result.address;
  } catch {
    return err(
      new PentestError(
        `Target URL ${targetUrl} is not reachable. Verify the URL is correct and the site is up.`,
        'network',
        false,
        { targetUrl, hostname },
        ErrorCode.TARGET_UNREACHABLE,
      ),
    );
  }

  // 3. HTTP reachability check
  try {
    await httpHead(targetUrl, TARGET_URL_TIMEOUT_MS);

    logger.info('Target URL OK');
    return ok(undefined);
  } catch (error) {
    const isLoopback = isLoopbackAddress(resolvedAddress);
    const detail = error instanceof Error ? error.message : String(error);

    if (isLoopback) {
      const suggestion = targetUrl.replace(hostname, 'host.docker.internal');
      return err(
        new PentestError(
          `Target URL ${targetUrl} resolves to ${resolvedAddress} (loopback) and is not reachable. ` +
            `For local services, use host.docker.internal instead of ${hostname} (e.g., ${suggestion})`,
          'network',
          false,
          { targetUrl, resolvedAddress, hostname },
          ErrorCode.TARGET_UNREACHABLE,
        ),
      );
    }

    return err(
      new PentestError(
        `Target URL ${targetUrl} is not reachable: ${detail}`,
        'network',
        false,
        { targetUrl, resolvedAddress },
        ErrorCode.TARGET_UNREACHABLE,
      ),
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
 * 4. Target URL is reachable from the container
 *
 * Returns on first failure.
 */
export async function runPreflightChecks(
  targetUrl: string,
  repoPath: string,
  configPath: string | undefined,
  logger: ActivityLogger,
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

  // 4. Target URL reachability check (cheap — 1 HTTP round-trip)
  const urlResult = await validateTargetUrl(targetUrl, logger);
  if (!urlResult.ok) {
    return urlResult;
  }

  logger.info('All preflight checks passed');
  return ok(undefined);
}
