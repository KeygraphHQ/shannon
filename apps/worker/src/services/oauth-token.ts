// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OAuth token acquisition core.
 *
 * Shared by the `get-oauth-token` CLI (which downstream agents invoke inline via the
 * `bash` tool) and by the authentication preflight (which fetches once to fail a scan
 * fast on a broken grant). This is the one place that talks to a target's token endpoint.
 *
 * API-only targets are authenticated with a bearer token, not a browser session. There is
 * no Playwright storageState to capture; instead a token is fetched here and attached as an
 * `Authorization` header to the raw HTTP requests the recon/exploit agents make. Access
 * tokens routinely expire inside a single scan (5-60 min TTL vs. a ~1-1.5 h run), so the
 * token is cached to disk next to its config with its expiry and transparently re-fetched
 * when stale — a single up-front fetch would go stale mid-scan.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export type GrantType = 'client_credentials' | 'password' | 'refresh_token';
export type ClientAuthMethod = 'client_secret_post' | 'client_secret_basic';

export interface OAuthConfig {
  token_url: string;
  grant_type: GrantType;
  client_id?: string;
  client_secret?: string;
  /** Resource-owner-password grant only. */
  username?: string;
  /** Resource-owner-password grant only. */
  password?: string;
  scope?: string;
  audience?: string;
  /** refresh_token grant only; the initial refresh token to exchange. */
  refresh_token?: string;
  /** How client credentials are presented to the token endpoint. Default: client_secret_post. */
  client_auth?: ClientAuthMethod;
  /** Header the agents attach the token under. Default: Authorization. */
  token_header?: string;
  /** Prefix placed before the token value in the header. Default: "Bearer ". */
  token_prefix?: string;
  /** Extra form parameters sent verbatim in the token request body. */
  extra_params?: Record<string, string>;
}

export interface FetchedToken {
  accessToken: string;
  /** Absolute epoch-ms at which the token should be considered expired. */
  expiresAt: number;
  /** Present only when the endpoint rotated the refresh token. */
  refreshToken?: string;
}

interface TokenCacheEntry {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

/** Refresh this many ms before the real expiry, so a token handed to an agent stays valid for the request. */
const EXPIRY_SKEW_MS = 60_000;
/** Used when the token endpoint omits expires_in. Conservative so we re-fetch rather than trust a stale token. */
const DEFAULT_TTL_SECONDS = 300;

export class OAuthTokenError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = false) {
    super(message);
    this.name = 'OAuthTokenError';
    this.retryable = retryable;
  }
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

/** Build the form body + headers for a token request from the grant type and client-auth method. */
function buildRequest(config: OAuthConfig): { body: URLSearchParams; headers: Record<string, string> } {
  const body = new URLSearchParams();
  body.set('grant_type', config.grant_type);
  if (config.scope) body.set('scope', config.scope);
  if (config.audience) body.set('audience', config.audience);

  if (config.grant_type === 'password') {
    if (!config.username || !config.password) {
      throw new OAuthTokenError('password grant requires oauth.username and oauth.password');
    }
    body.set('username', config.username);
    body.set('password', config.password);
  } else if (config.grant_type === 'refresh_token') {
    if (!config.refresh_token) {
      throw new OAuthTokenError('refresh_token grant requires oauth.refresh_token');
    }
    body.set('refresh_token', config.refresh_token);
  }

  for (const [k, v] of Object.entries(config.extra_params ?? {})) {
    body.set(k, v);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  };

  const method: ClientAuthMethod = config.client_auth ?? 'client_secret_post';
  if (method === 'client_secret_basic') {
    if (!config.client_id || !config.client_secret) {
      throw new OAuthTokenError('client_secret_basic requires oauth.client_id and oauth.client_secret');
    }
    headers.Authorization = basicAuthHeader(config.client_id, config.client_secret);
  } else {
    // client_secret_post — credentials go in the body.
    if (config.client_id) body.set('client_id', config.client_id);
    if (config.client_secret) body.set('client_secret', config.client_secret);
  }

  return { body, headers };
}

/** Perform a single token request against the configured endpoint. */
export async function fetchToken(config: OAuthConfig, refreshTokenOverride?: string): Promise<FetchedToken> {
  const effective: OAuthConfig = refreshTokenOverride
    ? { ...config, grant_type: 'refresh_token', refresh_token: refreshTokenOverride }
    : config;

  const { body, headers } = buildRequest(effective);

  let response: Response;
  try {
    response = await fetch(effective.token_url, { method: 'POST', headers, body });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OAuthTokenError(`Token endpoint request failed: ${detail}`, true);
  }

  const text = await response.text();
  if (!response.ok) {
    // OAuth error bodies can leak nothing sensitive here (they describe the grant, not the secret);
    // truncate defensively all the same.
    throw new OAuthTokenError(
      `Token endpoint returned ${response.status}: ${text.slice(0, 300)}`,
      response.status >= 500 || response.status === 429,
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new OAuthTokenError(`Token endpoint returned non-JSON body: ${text.slice(0, 200)}`);
  }

  const accessToken = parsed.access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new OAuthTokenError('Token endpoint response contained no access_token');
  }

  const expiresIn = typeof parsed.expires_in === 'number' ? parsed.expires_in : DEFAULT_TTL_SECONDS;
  const rotated = typeof parsed.refresh_token === 'string' ? parsed.refresh_token : undefined;

  return {
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    ...(rotated !== undefined && { refreshToken: rotated }),
  };
}

/** Cache path is a stable sibling of the config file, namespaced by a hash of the grant identity. */
function cacheFileFor(configFile: string, config: OAuthConfig): string {
  const key = createHash('sha256')
    .update(
      [config.token_url, config.grant_type, config.client_id ?? '', config.scope ?? '', config.audience ?? ''].join(
        '|',
      ),
    )
    .digest('hex')
    .slice(0, 16);
  const dir = path.dirname(configFile);
  return path.join(dir, `.oauth-token-${key}.json`);
}

async function readCache(cacheFile: string): Promise<TokenCacheEntry | null> {
  try {
    const raw = await fs.readFile(cacheFile, 'utf8');
    const parsed = JSON.parse(raw) as TokenCacheEntry;
    if (typeof parsed.accessToken === 'string' && typeof parsed.expiresAt === 'number') {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeCache(cacheFile: string, entry: TokenCacheEntry): Promise<void> {
  // Best-effort, 0600. A cache write failure must not break token acquisition.
  try {
    await fs.writeFile(cacheFile, JSON.stringify(entry), { mode: 0o600 });
  } catch {
    /* ignore */
  }
}

export async function loadConfig(configFile: string): Promise<OAuthConfig> {
  let raw: string;
  try {
    raw = await fs.readFile(configFile, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OAuthTokenError(`Cannot read OAuth config at ${configFile}: ${detail}`);
  }
  let parsed: OAuthConfig;
  try {
    parsed = JSON.parse(raw) as OAuthConfig;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new OAuthTokenError(`OAuth config at ${configFile} is not valid JSON: ${detail}`);
  }
  if (!parsed.token_url || !parsed.grant_type) {
    throw new OAuthTokenError('OAuth config must include token_url and grant_type');
  }
  return parsed;
}

/**
 * Return a currently-valid access token for the given on-disk config, using the disk cache
 * and refreshing transparently when the cached token is missing or within the expiry skew.
 */
export async function getValidToken(configFile: string): Promise<string> {
  const config = await loadConfig(configFile);
  const cacheFile = cacheFileFor(configFile, config);

  const cached = await readCache(cacheFile);
  if (cached && cached.expiresAt - EXPIRY_SKEW_MS > Date.now()) {
    return cached.accessToken;
  }

  // For refresh_token grants, prefer a server-rotated refresh token captured last time.
  const refreshOverride = config.grant_type === 'refresh_token' ? cached?.refreshToken : undefined;
  const fetched = await fetchToken(config, refreshOverride);

  await writeCache(cacheFile, {
    accessToken: fetched.accessToken,
    expiresAt: fetched.expiresAt,
    ...(fetched.refreshToken !== undefined
      ? { refreshToken: fetched.refreshToken }
      : config.refresh_token !== undefined
        ? { refreshToken: config.refresh_token }
        : {}),
  });

  return fetched.accessToken;
}

/** Fallback cache location when a config is supplied inline rather than by path (CLI --config-json). */
export function ephemeralConfigPath(): string {
  return path.join(os.tmpdir(), `.shannon-oauth-${process.pid}.json`);
}
