// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OrcaRouter origin resolution.
 *
 * Authentication and inference live on different public origins and neither may be
 * derived from the other by swapping a hostname or appending `/v1`:
 *
 *   - consent, code exchange, device grant:  https://www.orcarouter.ai
 *   - inference and model discovery:         https://api.orcarouter.ai/v1
 *
 * A self-hosted deployment may serve both from one origin, so `ORCA_BASE_URL`
 * supplies a shared fallback while `ORCA_AUTH_BASE_URL` and `ORCA_API_BASE_URL`
 * override their own side; an explicit override always wins.
 *
 * Remote origins must be HTTPS. Plain HTTP is accepted only for loopback, which is
 * what a local development deployment uses.
 *
 * Mirrors apps/cli/src/orcarouter/endpoints.ts; the CLI cannot import from the worker
 * package (it ships as a standalone bundle), so the rule is duplicated there
 * deliberately and the two copies must stay in sync.
 */

/** Public consent origin. Not an API — the browser is sent here. */
export const DEFAULT_ORCA_AUTH_BASE_URL = 'https://www.orcarouter.ai';

/** Public inference origin, including the `/v1` the OpenAI wire format is mounted at. */
export const DEFAULT_ORCA_API_BASE_URL = 'https://api.orcarouter.ai/v1';

/** Consent screen path on the auth origin. */
export const ORCA_AUTHORIZE_PATH = '/auth';

/** Code-for-key exchange path on the auth origin. Note the `/api` segment. */
export const ORCA_EXCHANGE_PATH = '/api/v1/auth/keys';

/** Device-grant paths on the auth origin, for the out-of-band flow. */
export const ORCA_DEVICE_CODE_PATH = '/api/v1/auth/device/code';
export const ORCA_DEVICE_TOKEN_PATH = '/api/v1/auth/device/token';

export const ORCA_BASE_URL_ENV = 'ORCA_BASE_URL';
export const ORCA_AUTH_BASE_URL_ENV = 'ORCA_AUTH_BASE_URL';
export const ORCA_API_BASE_URL_ENV = 'ORCA_API_BASE_URL';

export interface OrcaEndpoints {
  /** Origin serving consent and code exchange, without a trailing slash. */
  readonly authBaseUrl: string;
  /** Inference origin including its `/v1` segment, without a trailing slash. */
  readonly apiBaseUrl: string;
}

/** Loopback hosts permitted to use plain HTTP. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Validate one configured origin. Rejects credentials in the URL, a query/fragment,
 * and plain HTTP on anything but loopback.
 */
export function normalizeOrcaOrigin(raw: string, variableName: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${variableName} is not a valid URL: ${raw}`);
  }

  if (url.username || url.password) {
    throw new Error(`${variableName} must not carry credentials in the URL.`);
  }
  if (url.search || url.hash) {
    throw new Error(`${variableName} must be an origin without a query string or fragment.`);
  }
  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`${variableName} must use HTTPS; plain HTTP is allowed only for loopback.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variableName} must be an http(s) URL.`);
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/**
 * Resolve both origins. Explicit auth/API overrides win over the shared
 * `ORCA_BASE_URL`, which in turn wins over the public defaults.
 */
export function resolveOrcaEndpoints(env: NodeJS.ProcessEnv = process.env): OrcaEndpoints {
  const shared = env[ORCA_BASE_URL_ENV]?.trim();
  const authOverride = env[ORCA_AUTH_BASE_URL_ENV]?.trim();
  const apiOverride = env[ORCA_API_BASE_URL_ENV]?.trim();

  const authRaw = authOverride || shared || DEFAULT_ORCA_AUTH_BASE_URL;
  const apiRaw = apiOverride || shared || DEFAULT_ORCA_API_BASE_URL;

  const authName = authOverride ? ORCA_AUTH_BASE_URL_ENV : shared ? ORCA_BASE_URL_ENV : 'default';
  const apiName = apiOverride ? ORCA_API_BASE_URL_ENV : shared ? ORCA_BASE_URL_ENV : 'default';

  return {
    authBaseUrl: normalizeOrcaOrigin(authRaw, authName === 'default' ? 'OrcaRouter auth origin' : authName),
    apiBaseUrl: normalizeOrcaOrigin(apiRaw, apiName === 'default' ? 'OrcaRouter API origin' : apiName),
  };
}

/** Absolute URL for a path on the auth origin. */
export function authUrl(endpoints: OrcaEndpoints, path: string): string {
  return `${endpoints.authBaseUrl}${path}`;
}

/** Absolute URL for a path on the inference origin. */
export function apiUrl(endpoints: OrcaEndpoints, path: string): string {
  return `${endpoints.apiBaseUrl}${path}`;
}
