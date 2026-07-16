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
 * 1. Repository path exists and is a directory
 * 2. Config file parses and validates (if provided)
 * 3. code_path rules match real entries in the repo (filesystem only)
 * 4. Credentials validate via a minimal pi session (API key, OAuth, or Bedrock)
 * 5. Target URL resolves, is not link-local (cloud metadata), and is reachable (DNS + HTTP)
 */

import type { LookupAddress } from 'node:dns';
import { lookup } from 'node:dns/promises';
import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import net, { type LookupFunction } from 'node:net';
import os from 'node:os';
import {
  AuthStorage,
  createAgentSession,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { glob } from 'zx';
import { resolveEffectiveProvider, resolveModelId } from '../ai/models.js';
import { parseConfig } from '../config-parser.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { Config, Rule } from '../types/config.js';
import { ErrorCode } from '../types/errors.js';
import { err, isErr, ok, type Result } from '../types/result.js';
import { matchesBillingTextPattern } from '../utils/billing-detection.js';
import { PentestError } from './error-handling.js';

const TARGET_URL_TIMEOUT_MS = 10_000;

function isLoopbackAddress(address: string): boolean {
  return address === '127.0.0.1' || address === '::1' || address === '0.0.0.0';
}

// 169.254.0.0/16 hosts the cloud metadata service. RFC1918 and loopback are
// intentionally allowed — scanning local targets is a supported Shannon use case.
const metadataBlockList = new net.BlockList();
metadataBlockList.addSubnet('169.254.0.0', 16, 'ipv4');

function isBlockedAddress(address: string): boolean {
  switch (net.isIP(address)) {
    case 4:
      return metadataBlockList.check(address, 'ipv4');
    case 6:
      return metadataBlockList.check(address, 'ipv6');
    default:
      return false;
  }
}

/** DNS lookup pinned to already-validated `addresses`, so the socket cannot be re-pointed after validation (DNS rebinding). */
function pinnedLookup(addresses: LookupAddress[]): LookupFunction {
  return (hostname, options, callback) => {
    const matching = options.family ? addresses.filter((a) => a.family === options.family) : addresses;
    const pool = matching.length > 0 ? matching : addresses;
    if (options.all) {
      callback(null, pool);
      return;
    }
    const first = pool[0];
    if (!first) {
      callback(new Error(`no resolved address for ${hostname}`), '', 0);
      return;
    }
    callback(null, first.address, first.family);
  };
}

// === Repository Validation ===

async function validateRepo(repoPath: string, logger: ActivityLogger): Promise<Result<void, PentestError>> {
  logger.info('Checking repository path...', { repoPath });

  // Check repo directory exists. The repo is not required to be a git repository:
  // multi-repo targets (a parent directory containing several repos) have no top-level
  // .git, and git-based checkpoint/rollback in git-manager already no-ops on non-git dirs.
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

  logger.info('Repository path OK');
  return ok(undefined);
}

// === Config Validation ===

async function validateConfig(configPath: string, logger: ActivityLogger): Promise<Result<Config, PentestError>> {
  logger.info('Validating configuration file...', { configPath });

  try {
    const config = await parseConfig(configPath);
    logger.info('Configuration file OK');
    return ok(config);
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

// === code_path Existence Validation ===

const CODE_PATH_IGNORE = ['.git/**', '.shannon/**'];

async function patternMatchesAny(repoPath: string, pattern: string): Promise<boolean> {
  const stream = glob.globbyStream(pattern, {
    cwd: repoPath,
    dot: true,
    onlyFiles: false,
    followSymbolicLinks: false,
    ignore: CODE_PATH_IGNORE,
  });
  for await (const _ of stream) {
    return true;
  }
  return false;
}

type RuleKind = 'avoid' | 'focus';
interface MissingCodePath {
  kind: RuleKind;
  value: string;
  description: string;
}

async function validateCodePathsExist(
  config: Config,
  repoPath: string,
  logger: ActivityLogger,
): Promise<Result<void, PentestError>> {
  const tagged: Array<{ kind: RuleKind; rule: Rule }> = [
    ...(config.rules?.avoid ?? []).map((rule) => ({ kind: 'avoid' as const, rule })),
    ...(config.rules?.focus ?? []).map((rule) => ({ kind: 'focus' as const, rule })),
  ].filter(({ rule }) => rule.type === 'code_path');

  if (tagged.length === 0) {
    return ok(undefined);
  }

  logger.info(`Validating ${tagged.length} code_path rule(s) against repo...`);

  // ≥1 match is the only property enforced — malformed globs simply match nothing.
  const missing: MissingCodePath[] = [];
  for (const { kind, rule } of tagged) {
    if (!(await patternMatchesAny(repoPath, rule.value))) {
      missing.push({ kind, value: rule.value, description: rule.description });
    }
  }

  if (missing.length > 0) {
    const lines = missing.map((m) => `[${m.kind}] '${m.value}' — ${m.description}`);
    return err(
      new PentestError(
        `code_path rules don't match any file or directory in the repo:\n  - ${lines.join('\n  - ')}\n` +
          `Fix the patterns or remove the rules.`,
        'config',
        false,
        { missing },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      ),
    );
  }

  logger.info('All code_path rules matched');
  return ok(undefined);
}

// === Credential Validation ===

/** Map provider error text to a human-readable preflight PentestError. */
/** Classify a provider error message (thrown or from a failed turn) into a PentestError. */
function classifyCredentialError(text: string, authType: string): Result<void, PentestError> {
  const lower = text.toLowerCase();
  if (matchesBillingTextPattern(text)) {
    return err(
      new PentestError(
        `Anthropic account has a billing or rate-limit issue during ${authType} validation. Add credits or wait and retry.`,
        'billing',
        true,
        { authType },
        ErrorCode.BILLING_ERROR,
      ),
    );
  }
  if (/401|403|invalid[ _-]?api[ _-]?key|unauthorized|authentication|forbidden|not allowed|x-api-key/.test(lower)) {
    return err(
      new PentestError(
        `Invalid ${authType}. Check your credentials in .env and try again.`,
        'config',
        false,
        { authType },
        ErrorCode.AUTH_FAILED,
      ),
    );
  }
  if (/model/.test(lower) && /not found|not available|unknown/.test(lower)) {
    return err(
      new PentestError(
        `Configured model is not available for this account. Check ANTHROPIC_*_MODEL in .env.`,
        'config',
        false,
        { authType },
      ),
    );
  }
  if (
    /network|timeout|enotfound|econnrefused|fetch failed|getaddrinfo|socket|overloaded|unavailable|50\d/.test(lower)
  ) {
    return err(
      new PentestError(`Anthropic API unreachable or temporarily unavailable. Try again shortly.`, 'network', true, {
        authType,
      }),
    );
  }
  return err(
    new PentestError(
      `${authType} validation failed: ${text.slice(0, 150)}`,
      'config',
      false,
      { authType },
      ErrorCode.AUTH_FAILED,
    ),
  );
}

/** Minimal pi session probe to validate credentials. An optional baseUrl overrides the endpoint. */
async function probeCredentialsWithPi(
  authType: string,
  token?: string,
  baseUrl?: string,
): Promise<Result<void, PentestError>> {
  const authStorage = AuthStorage.inMemory();
  if (token) authStorage.setRuntimeApiKey('anthropic', token);

  const baseModel = ModelRegistry.create(authStorage).find('anthropic', resolveModelId('small'));
  if (!baseModel) {
    return err(
      new PentestError(
        `Model not found in pi registry: ${resolveModelId('small')}`,
        'config',
        false,
        {},
        ErrorCode.AUTH_FAILED,
      ),
    );
  }
  const model = baseUrl ? { ...baseModel, baseUrl } : baseModel;

  let errText: string | undefined;
  try {
    const { session } = await createAgentSession({
      cwd: os.tmpdir(),
      model,
      thinkingLevel: 'off',
      noTools: 'all',
      authStorage,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } }),
    });
    session.subscribe((e) => {
      if (e.type === 'turn_end' && e.message.role === 'assistant' && e.message.stopReason === 'error') {
        errText = e.message.errorMessage ?? 'unknown provider error';
      }
    });
    await session.prompt('hi');
    session.dispose();
  } catch (error) {
    errText = error instanceof Error ? error.message : String(error);
  }

  if (errText) return classifyCredentialError(errText, authType);
  return ok(undefined);
}

/** Validate credentials via a minimal pi session. */
async function validateCredentials(logger: ActivityLogger): Promise<Result<void, PentestError>> {
  // Resolve the active provider through the same precedence the executor uses, so
  // preflight validates exactly the credentials the run will use (no drift).
  const eff = resolveEffectiveProvider();

  // 1. Bedrock mode — validate required AWS credentials are present (pi-ai owns the
  //    live AWS auth, so there is no cheap session probe here)
  if (eff.providerId === 'amazon-bedrock') {
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

  // 2. Custom base URL — validate the endpoint via a minimal pi session
  if (eff.baseUrl) {
    logger.info('Validating custom base URL');
    const probe = await probeCredentialsWithPi(`custom endpoint (${eff.baseUrl})`, eff.anthropicToken, eff.baseUrl);
    if (isErr(probe)) return probe;
    logger.info('Custom base URL OK');
    return ok(undefined);
  }

  // 3. Direct Anthropic — require a credential, then validate via a minimal pi session
  if (!eff.anthropicToken) {
    return err(
      new PentestError(
        'No API credentials found. Set ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env (or use CLAUDE_CODE_USE_BEDROCK=1 for AWS Bedrock)',
        'config',
        false,
        {},
        ErrorCode.AUTH_FAILED,
      ),
    );
  }

  const usingApiKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const authType = usingApiKey ? 'API key' : 'OAuth token';
  logger.info(`Validating ${authType} via pi...`);
  const probe = await probeCredentialsWithPi(authType, eff.anthropicToken);
  if (isErr(probe)) return probe;
  logger.info(`${authType} OK`);
  return ok(undefined);
}

// === Target URL Validation ===

/** HTTP HEAD with TLS verification disabled — we check reachability, not certificate validity. */
function httpHead(url: string, timeoutMs: number, addresses: LookupAddress[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const transport = isHttps ? https : http;

    const req = transport.request(
      url,
      {
        method: 'HEAD',
        timeout: timeoutMs,
        lookup: pinnedLookup(addresses),
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
  logger.info('Checking target URL reachability...');

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

  // 2. Resolve all records once — reused (pinned) for the connection below.
  const hostname = parsed.hostname;
  let addresses: LookupAddress[];
  try {
    addresses = await lookup(hostname, { all: true });
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

  // 3. Reject the link-local metadata range (169.254.0.0/16).
  const blocked = addresses.find((entry) => isBlockedAddress(entry.address));
  if (blocked) {
    return err(
      new PentestError(
        `Target URL ${targetUrl} resolves to ${blocked.address}, a link-local address ` +
          `(169.254.0.0/16). This range hosts the cloud instance metadata service and cannot be scanned.`,
        'config',
        false,
        { targetUrl, hostname, address: blocked.address },
        ErrorCode.TARGET_UNREACHABLE,
      ),
    );
  }

  // 4. HTTP reachability check (socket pinned to the resolved addresses).
  try {
    await httpHead(targetUrl, TARGET_URL_TIMEOUT_MS, addresses);

    logger.info('Target URL OK');
    return ok(undefined);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const isLoopback = addresses.some((entry) => isLoopbackAddress(entry.address));

    if (isLoopback) {
      const suggestion = targetUrl.replace(hostname, 'host.docker.internal');
      return err(
        new PentestError(
          `Target URL ${targetUrl} resolves to a loopback address and is not reachable. ` +
            `For local services, use host.docker.internal instead of ${hostname} (e.g., ${suggestion})`,
          'network',
          false,
          { targetUrl, hostname },
          ErrorCode.TARGET_UNREACHABLE,
        ),
      );
    }

    return err(
      new PentestError(
        `Target URL ${targetUrl} is not reachable: ${detail}`,
        'network',
        false,
        { targetUrl },
        ErrorCode.TARGET_UNREACHABLE,
      ),
    );
  }
}

// === Preflight Orchestrator ===

/**
 * Run all preflight checks sequentially (cheapest first).
 *
 * 1. Repository path exists and is a directory
 * 2. Config file parses and validates (if configPath provided)
 * 3. code_path rules match at least one entry in the repo (skipped without config)
 * 4. Credentials validate (API key, OAuth, or Bedrock)
 * 5. Target URL is reachable from the container
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
  let parsedConfig: Config | null = null;
  if (configPath) {
    const configResult = await validateConfig(configPath, logger);
    if (!configResult.ok) {
      return configResult;
    }
    parsedConfig = configResult.value;
  }

  // 3. code_path rules must match real entries in the repo (filesystem only).
  // Runs after both repo and config are valid, before any network round-trip.
  if (parsedConfig) {
    const codePathResult = await validateCodePathsExist(parsedConfig, repoPath, logger);
    if (!codePathResult.ok) {
      return codePathResult;
    }
  }

  // 4. Credential check (cheap — 1 pi round-trip)
  const credResult = await validateCredentials(logger);
  if (!credResult.ok) {
    return credResult;
  }

  // 5. Target URL reachability check (cheap — 1 HTTP round-trip)
  const urlResult = await validateTargetUrl(targetUrl, logger);
  if (!urlResult.ok) {
    return urlResult;
  }

  logger.info('All preflight checks passed');
  return ok(undefined);
}
