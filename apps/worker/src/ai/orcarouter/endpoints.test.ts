// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Origin resolution for OrcaRouter.
 *
 * The single most consequential rule here is that the two public origins are
 * independent: authentication is `www.orcarouter.ai` and inference is
 * `api.orcarouter.ai/v1`. Deriving one from the other by swapping a hostname or
 * appending `/v1` produces a URL that 404s, so every case below pins which origin a
 * given concern uses.
 */

import { describe, expect, it } from 'vitest';
import {
  apiUrl,
  authUrl,
  DEFAULT_ORCA_API_BASE_URL,
  DEFAULT_ORCA_AUTH_BASE_URL,
  normalizeOrcaOrigin,
  ORCA_AUTHORIZE_PATH,
  ORCA_DEVICE_CODE_PATH,
  ORCA_EXCHANGE_PATH,
  resolveOrcaEndpoints,
} from './endpoints.js';

describe('resolveOrcaEndpoints', () => {
  it('defaults authentication to www and inference to api, on separate origins', () => {
    const endpoints = resolveOrcaEndpoints({});

    expect(endpoints.authBaseUrl).toBe('https://www.orcarouter.ai');
    expect(endpoints.apiBaseUrl).toBe('https://api.orcarouter.ai/v1');
    expect(endpoints.authBaseUrl).not.toBe(endpoints.apiBaseUrl);
  });

  it('exposes the documented paths, with the exchange under /api/v1 rather than /v1', () => {
    expect(ORCA_AUTHORIZE_PATH).toBe('/auth');
    expect(ORCA_EXCHANGE_PATH).toBe('/api/v1/auth/keys');
    expect(ORCA_DEVICE_CODE_PATH).toBe('/api/v1/auth/device/code');

    const endpoints = resolveOrcaEndpoints({});
    expect(authUrl(endpoints, ORCA_EXCHANGE_PATH)).toBe('https://www.orcarouter.ai/api/v1/auth/keys');
    // The mistake this pins down: the exchange lives under the auth origin's `/api/v1`,
    // not at `/v1/auth/keys` and not on the inference origin.
    const exchange = authUrl(endpoints, ORCA_EXCHANGE_PATH);
    expect(exchange).not.toContain('api.orcarouter.ai');
    expect(exchange).toContain('/api/v1/auth/keys');
    expect(new URL(exchange).pathname.startsWith('/api/v1/')).toBe(true);
  });

  it('builds inference URLs on the api origin, never the auth origin', () => {
    const endpoints = resolveOrcaEndpoints({});
    expect(apiUrl(endpoints, '/models')).toBe('https://api.orcarouter.ai/v1/models');
    expect(apiUrl(endpoints, '/chat/completions')).toBe('https://api.orcarouter.ai/v1/chat/completions');
  });

  it('uses one origin for both when a self-hosted deployment sets the shared base', () => {
    const endpoints = resolveOrcaEndpoints({ ORCA_BASE_URL: 'https://orca.internal.example' });

    expect(endpoints.authBaseUrl).toBe('https://orca.internal.example');
    expect(endpoints.apiBaseUrl).toBe('https://orca.internal.example');
  });

  it('lets an explicit override beat the shared base on its own side only', () => {
    const endpoints = resolveOrcaEndpoints({
      ORCA_BASE_URL: 'https://shared.example',
      ORCA_AUTH_BASE_URL: 'https://auth.example',
    });

    expect(endpoints.authBaseUrl).toBe('https://auth.example');
    expect(endpoints.apiBaseUrl).toBe('https://shared.example');

    const other = resolveOrcaEndpoints({
      ORCA_BASE_URL: 'https://shared.example',
      ORCA_API_BASE_URL: 'https://inference.example/v1',
    });

    expect(other.authBaseUrl).toBe('https://shared.example');
    expect(other.apiBaseUrl).toBe('https://inference.example/v1');
  });

  it('treats the two explicit overrides as independent of each other', () => {
    const endpoints = resolveOrcaEndpoints({
      ORCA_AUTH_BASE_URL: 'https://auth.example',
      ORCA_API_BASE_URL: 'https://api.example/v1',
    });

    expect(endpoints.authBaseUrl).toBe('https://auth.example');
    expect(endpoints.apiBaseUrl).toBe('https://api.example/v1');
  });

  it('strips a trailing slash so concatenated paths do not double up', () => {
    const endpoints = resolveOrcaEndpoints({ ORCA_BASE_URL: 'https://orca.example/' });
    expect(endpoints.authBaseUrl).toBe('https://orca.example');
    expect(authUrl(endpoints, ORCA_AUTHORIZE_PATH)).toBe('https://orca.example/auth');
  });

  it('requires HTTPS for a remote origin and permits plain HTTP only on loopback', () => {
    expect(() => normalizeOrcaOrigin('http://orca.example', 'ORCA_BASE_URL')).toThrow(/HTTPS/);
    expect(normalizeOrcaOrigin('http://127.0.0.1:8080', 'ORCA_BASE_URL')).toBe('http://127.0.0.1:8080');
    expect(normalizeOrcaOrigin('http://localhost:8080', 'ORCA_BASE_URL')).toBe('http://localhost:8080');
  });

  it('rejects a configured origin carrying credentials, a query, or a fragment', () => {
    expect(() => normalizeOrcaOrigin('https://user:pass@orca.example', 'ORCA_BASE_URL')).toThrow(/credentials/);
    expect(() => normalizeOrcaOrigin('https://orca.example?a=b', 'ORCA_BASE_URL')).toThrow(/query string/);
    expect(() => normalizeOrcaOrigin('https://orca.example#frag', 'ORCA_BASE_URL')).toThrow(/fragment/);
  });

  it('rejects a value that is not a URL at all', () => {
    expect(() => normalizeOrcaOrigin('orca.example', 'ORCA_BASE_URL')).toThrow(/not a valid URL/);
  });

  it('names the offending variable in the error', () => {
    expect(() => resolveOrcaEndpoints({ ORCA_AUTH_BASE_URL: 'http://remote.example' })).toThrow(/ORCA_AUTH_BASE_URL/);
  });

  it('keeps the published defaults stable', () => {
    expect(DEFAULT_ORCA_AUTH_BASE_URL).toBe('https://www.orcarouter.ai');
    expect(DEFAULT_ORCA_API_BASE_URL).toBe('https://api.orcarouter.ai/v1');
  });
});
