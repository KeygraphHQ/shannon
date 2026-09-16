// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The OrcaRouter credential seam.
 *
 * Both entry points must produce the *same* credential result, because everything
 * downstream — the request path, model discovery, status — reads one shape and must not
 * care how the key was obtained. The other load-bearing property is generation safety:
 * a 401 that arrives from a request made under an old credential must never mark a
 * freshly reauthorized one as broken.
 */

import { afterEach, describe, expect, it } from 'vitest';
import {
  apiKeySource,
  connectSource,
  currentOrcaGeneration,
  hasOrcaCredential,
  looksLikeOrcaKey,
  maskOrcaKey,
  ORCA_AUTHORIZED_APPS_URL,
  ORCA_KEY_PREFIX,
  ORCA_RUN_ACCOUNT_ID,
  ORCAROUTER_AUTH_METHOD_ENV,
  OrcaAccountState,
  type OrcaEnv,
  orcaAccountState,
  orcaReauthenticationMessage,
  recordOrcaRelayRejection,
  resolveOrcaCredential,
} from './credentials.js';

const FAKE_KEY = `${ORCA_KEY_PREFIX}test-0000000000000000`;

describe('key shape checks', () => {
  it('accepts a plausibly shaped key and rejects an obvious paste mistake', () => {
    expect(looksLikeOrcaKey(FAKE_KEY)).toBe(true);
    expect(looksLikeOrcaKey('sk-openai-abc')).toBe(false);
    expect(looksLikeOrcaKey('')).toBe(false);
  });

  it('treats the prefix as a paste check, not proof of validity', () => {
    // Deliberately not a claim that the key works: only a real request can establish that.
    expect(looksLikeOrcaKey(`${ORCA_KEY_PREFIX}not-a-real-key`)).toBe(true);
  });

  it('masks a key to something identifying but unusable', () => {
    const masked = maskOrcaKey(FAKE_KEY);
    expect(masked).not.toBe(FAKE_KEY);
    expect(masked).toContain('…');
    expect(masked.length).toBeLessThan(FAKE_KEY.length);
  });

  it('echoes no key material at all, not even a prefix or a tail', () => {
    const body = 'AAAABBBBCCCCDDDDEEEEFFFF';
    const masked = maskOrcaKey(`${ORCA_KEY_PREFIX}${body}`);

    // A partial key is still key material: this string reaches scrollback and log files.
    for (const slice of ['AAAA', 'BBBB', 'EEEE', 'FFFF']) {
      expect(masked).not.toContain(slice);
    }
    expect(masked).toBe(`${ORCA_KEY_PREFIX}…(${ORCA_KEY_PREFIX.length + body.length})`);
  });

  it('masks a short or malformed value without crashing or leaking it', () => {
    expect(maskOrcaKey('sk-orca-')).toBe(`${ORCA_KEY_PREFIX}…(8)`);
    expect(maskOrcaKey('x')).toBe(`${ORCA_KEY_PREFIX}…(1)`);
  });
});

describe('API-key adapter', () => {
  it('reads the provider-specific variable first', () => {
    const credential = apiKeySource({ ORCAROUTER_API_KEY: FAKE_KEY });
    expect(credential).toEqual({ apiKey: FAKE_KEY, method: 'api-key', scope: 'api' });
  });

  it('accepts the shorthand aliases OrcaRouter tooling uses', () => {
    expect(apiKeySource({ ORCA_API_KEY: FAKE_KEY })?.apiKey).toBe(FAKE_KEY);
    expect(apiKeySource({ ORCA_KEY: FAKE_KEY })?.apiKey).toBe(FAKE_KEY);
  });

  it('prefers the provider-specific variable when several are set', () => {
    const credential = apiKeySource({ ORCA_KEY: `${ORCA_KEY_PREFIX}other`, ORCAROUTER_API_KEY: FAKE_KEY });
    expect(credential?.apiKey).toBe(FAKE_KEY);
  });

  it('resolves nothing when no key is set, rather than failing', () => {
    expect(apiKeySource({})).toBeUndefined();
    expect(hasOrcaCredential({})).toBe(false);
  });

  it('ignores a value that is not an OrcaRouter key', () => {
    expect(apiKeySource({ ORCAROUTER_API_KEY: 'sk-something-else' })).toBeUndefined();
  });

  it('ignores a blank value', () => {
    expect(apiKeySource({ ORCAROUTER_API_KEY: '   ' })).toBeUndefined();
  });
});

describe('both entry points produce the same credential result', () => {
  it('returns the identical key, scope, and shape from each adapter', () => {
    const env: OrcaEnv = { ORCAROUTER_API_KEY: FAKE_KEY };

    const fromApiKey = apiKeySource(env);
    const fromConnect = connectSource({ ...env, [ORCAROUTER_AUTH_METHOD_ENV]: 'pkce' });

    // Everything a consumer reads is identical; only the reported provenance differs.
    expect(fromConnect?.apiKey).toBe(fromApiKey?.apiKey);
    expect(fromConnect?.scope).toBe(fromApiKey?.scope);
    expect(Object.keys(fromConnect ?? {}).sort()).toEqual(Object.keys(fromApiKey ?? {}).sort());
  });

  it('labels the entry point without changing the credential', () => {
    const base = { ORCAROUTER_API_KEY: FAKE_KEY };
    expect(connectSource(base)?.method).toBe('api-key');
    expect(connectSource({ ...base, [ORCAROUTER_AUTH_METHOD_ENV]: 'pkce' })?.method).toBe('pkce');
    expect(connectSource({ ...base, [ORCAROUTER_AUTH_METHOD_ENV]: 'api-key' })?.method).toBe('api-key');
  });

  it('resolves the same credential through the single seam every consumer uses', () => {
    expect(resolveOrcaCredential({ ORCAROUTER_API_KEY: FAKE_KEY })?.apiKey).toBe(FAKE_KEY);
    expect(resolveOrcaCredential({ ORCAROUTER_API_KEY: FAKE_KEY, [ORCAROUTER_AUTH_METHOD_ENV]: 'pkce' })?.apiKey).toBe(
      FAKE_KEY,
    );
    expect(resolveOrcaCredential({})).toBeUndefined();
  });
});

describe('account and credential generation', () => {
  it('records a caller-supplied generation for an account created by a login', () => {
    const state = new OrcaAccountState();
    // A run that learned its account from GET /api/user/self can name that generation
    // explicitly rather than defaulting to 1.
    state.setActive('user-1', 7);
    expect(state.isUsable('user-1', 7)).toBe(true);
    expect(state.isUsable('user-1', 1)).toBe(false);
  });

  it('starts an unknown account active at generation 1', () => {
    const state = new OrcaAccountState();
    expect(state.status('user-1')).toMatchObject({ generation: 1, state: 'active' });
    expect(state.isUsable('user-1', 1)).toBe(true);
  });

  it('increments the generation on a successful sign-in and clears a pending reauth', () => {
    const state = new OrcaAccountState();
    state.markRejected('user-1', 1);
    expect(state.needsReauth()).toHaveLength(1);

    const generation = state.beginLogin('user-1');
    expect(generation).toBe(2);
    expect(state.status('user-1').state).toBe('active');
    expect(state.needsReauth()).toHaveLength(0);
  });

  it('marks only the exact account that was rejected', () => {
    const state = new OrcaAccountState();
    state.beginLogin('user-2');
    state.markRejected('user-1', 1);

    expect(state.status('user-1').state).toBe('needsReauth');
    expect(state.status('user-2').state).toBe('active');
    expect(state.isUsable('user-2', 2)).toBe(true);
  });

  it('ignores a 401 that arrives from a request made under an old generation', () => {
    const state = new OrcaAccountState();
    const staleGeneration = state.status('user-1').generation;

    // The user reauthorizes while the old request is still in flight.
    state.beginLogin('user-1');

    // The old request then fails with 401. It must not poison the new credential.
    expect(state.markRejected('user-1', staleGeneration)).toBe(false);
    expect(state.status('user-1').state).toBe('active');
    expect(state.needsReauth()).toHaveLength(0);
  });

  it('does not treat a revoked key as a refreshable token', () => {
    const state = new OrcaAccountState();
    state.markRejected('user-1', 1, 'revoked');

    const status = state.status('user-1');
    expect(status.state).toBe('needsReauth');
    expect(status.reason).toBe('revoked');
    // Nothing here schedules a refresh, and the account stays unusable until a new login.
    expect(state.isUsable('user-1', 1)).toBe(false);
  });

  it('keeps a rejected account unusable across repeated checks', () => {
    const state = new OrcaAccountState();
    state.markRejected('user-1', 1);
    expect(state.isUsable('user-1', 1)).toBe(false);
    expect(state.isUsable('user-1', 1)).toBe(false);
  });
});

/**
 * The relay-rejection transition the run's own account goes through.
 *
 * These exercise the process-wide state a scan actually uses, not a private instance, so
 * what is asserted is the transition the request boundary performs: the account that made
 * the rejected request is marked, and a rejection that arrives late — after a re-login has
 * already produced a newer generation — is discarded instead of breaking a working key.
 */
describe('recording a relay rejection against the run credential', () => {
  afterEach(() => {
    // The state is process-wide, so each case starts from a clean generation.
    orcaAccountState.setActive(ORCA_RUN_ACCOUNT_ID, 0);
  });

  it('marks the run account as needing reauthentication', () => {
    orcaAccountState.setActive(ORCA_RUN_ACCOUNT_ID, 0);

    const generation = currentOrcaGeneration();
    const rejection = recordOrcaRelayRejection(generation);

    expect(rejection.accountId).toBe(ORCA_RUN_ACCOUNT_ID);
    expect(rejection.applied).toBe(true);
    expect(orcaAccountState.status(ORCA_RUN_ACCOUNT_ID).state).toBe('needsReauth');
    expect(orcaAccountState.status(ORCA_RUN_ACCOUNT_ID).reason).toBe('revoked');
  });

  it('ignores a rejection from a generation a newer login has already replaced', () => {
    orcaAccountState.setActive(ORCA_RUN_ACCOUNT_ID, 1);
    // The request that is about to go out carries this generation.
    const generation = currentOrcaGeneration();

    // The user signs in again while that request is still in flight.
    orcaAccountState.beginLogin(ORCA_RUN_ACCOUNT_ID);

    // The in-flight request then fails with 401. It must not poison the new credential.
    const rejection = recordOrcaRelayRejection(generation);

    expect(rejection.applied).toBe(false);
    expect(orcaAccountState.status(ORCA_RUN_ACCOUNT_ID).state).toBe('active');
    expect(orcaAccountState.needsReauth()).toHaveLength(0);
  });

  it('does not attempt a refresh, and says what to do instead', () => {
    orcaAccountState.setActive(ORCA_RUN_ACCOUNT_ID, 0);
    recordOrcaRelayRejection(currentOrcaGeneration());

    const message = orcaReauthenticationMessage();

    // The remedy is a new sign-in, never a token refresh — there is no refresh grant.
    expect(message).toContain('connect');
    expect(message).toContain(ORCA_AUTHORIZED_APPS_URL);
    expect(message.toLowerCase()).not.toContain('refresh the');
    // And it never echoes key material.
    expect(message).not.toContain(ORCA_KEY_PREFIX);
  });
});
