/**
 * The PKCE sign-in, end to end through the adapter the CLI actually uses.
 *
 * These tests drive the real connect flow against a local fake consent server, so what
 * they exercise is the whole path — authorize URL, loopback callback, code exchange,
 * persistence — rather than a hash helper in isolation. Nothing here reaches the real
 * OrcaRouter: the auth origin is pointed at the fake server with `ORCA_AUTH_BASE_URL`,
 * which is the same override a self-hosted deployment uses.
 *
 * The assertions that matter most are negative: the verifier must not appear on the
 * authorize URL, and neither a verifier nor a key may appear in a failure's message.
 */

import crypto from 'node:crypto';
import http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ORCA_AUTHORIZE_PATH, type OrcaEndpoints } from './endpoints.js';
import {
  buildAuthorizeUrl,
  createPkcePair,
  exchangeCode,
  ORCA_APP_NAME,
  ORCA_REQUESTED_SCOPE,
  OrcaAuthError,
  stateMatches,
} from './pkce.js';

const FAKE_KEY = 'sk-orca-issued-by-fake-server-0000';

/** A stand-in consent + exchange server. Records every request it is asked for. */
interface FakeAuthServer {
  readonly origin: string;
  readonly endpoints: OrcaEndpoints;
  readonly exchangeBodies: string[];
  readonly close: () => Promise<void>;
}

interface FakeServerOptions {
  /** Response body for the exchange. Defaults to a successful `api` scope grant. */
  readonly exchange?: { status: number; body: unknown };
}

async function startFakeAuthServer(options: FakeServerOptions = {}): Promise<FakeAuthServer> {
  const exchangeBodies: string[] = [];

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/api/v1/auth/keys') {
      res.writeHead(404, { 'Content-Type': 'application/json' }).end('{"error":"not_found"}');
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      exchangeBodies.push(body);
      const outcome = options.exchange ?? { status: 200, body: { key: FAKE_KEY, user_id: '12345', scope: 'api' } };
      res.writeHead(outcome.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(outcome.body));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fake server did not bind');

  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    endpoints: { authBaseUrl: origin, apiBaseUrl: 'https://api.orcarouter.ai/v1' },
    exchangeBodies,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/**
 * Observe a flow's outcome without ever leaving its rejection unhandled.
 *
 * The flow is settled while the test is still driving the browser side, so a handler must
 * already be attached when that happens; awaiting it later is not soon enough.
 */
function settle<T>(promise: Promise<T>): Promise<{ value?: T; error?: unknown }> {
  return promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
}

/** Complete a loopback sign-in the way a consent screen would, and return the code it sent. */
async function deliverCallback(callbackUrl: string, params: Record<string, string>): Promise<void> {
  const url = new URL(callbackUrl);
  url.search = new URLSearchParams(params).toString();
  await new Promise<void>((resolve) => {
    http.get(url.toString(), (response) => {
      response.resume();
      response.on('end', resolve);
    });
  });
}

describe('PKCE primitives', () => {
  it('derives an unpadded base64url S256 challenge from the verifier', () => {
    const { verifier, challenge } = createPkcePair();
    const expected = crypto.createHash('sha256').update(verifier).digest('base64url');

    expect(challenge).toBe(expected);
    expect(challenge).not.toContain('=');
    expect(challenge).not.toContain('+');
    expect(challenge).not.toContain('/');
  });

  it('never sends the verifier as the challenge', () => {
    const { verifier, challenge } = createPkcePair();
    expect(challenge).not.toBe(verifier);
  });

  it('generates a fresh verifier and state on every attempt', () => {
    const first = createPkcePair();
    const second = createPkcePair();

    expect(first.verifier).not.toBe(second.verifier);
    expect(first.challenge).not.toBe(second.challenge);
    expect(first.state).not.toBe(second.state);
  });

  it('uses high-entropy values rather than anything guessable', () => {
    const { verifier, state } = createPkcePair();
    // 32 bytes of base64url is 43 characters, 16 bytes is 22.
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(state.length).toBeGreaterThanOrEqual(22);
  });

  it('compares state in constant time and rejects a missing or differing value', () => {
    const state = 'expected-state-value';
    expect(stateMatches(state, state)).toBe(true);
    expect(stateMatches(state, 'other-state-value')).toBe(false);
    expect(stateMatches(state, null)).toBe(false);
    expect(stateMatches(state, `${state}x`)).toBe(false);
  });
});

describe('authorize URL', () => {
  const endpoints: OrcaEndpoints = {
    authBaseUrl: 'https://www.orcarouter.ai',
    apiBaseUrl: 'https://api.orcarouter.ai/v1',
  };

  it('targets the auth origin at the consent path, never the inference origin', () => {
    const url = new URL(
      buildAuthorizeUrl({ endpoints, challenge: 'chal', state: 'st', callbackUrl: 'http://127.0.0.1:1/cb' }),
    );

    expect(url.origin).toBe('https://www.orcarouter.ai');
    expect(url.pathname).toBe(ORCA_AUTHORIZE_PATH);
  });

  it('always sends S256, on every flow', () => {
    const url = new URL(buildAuthorizeUrl({ endpoints, challenge: 'chal', state: 'st', callbackUrl: 'oob' }));
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
  });

  it('carries the challenge and state but never a verifier', () => {
    const { verifier, challenge, state } = createPkcePair();
    const url = buildAuthorizeUrl({ endpoints, challenge, state, callbackUrl: 'oob' });

    expect(url).toContain(`code_challenge=${challenge}`);
    expect(url).toContain(`state=${state}`);
    expect(url).not.toContain(verifier);
    expect(url).not.toContain('code_verifier');
  });

  it('names the app and asks for the api scope', () => {
    const url = new URL(buildAuthorizeUrl({ endpoints, challenge: 'c', state: 's', callbackUrl: 'oob' }));
    expect(url.searchParams.get('app_name')).toBe(ORCA_APP_NAME);
    expect(url.searchParams.get('scope')).toBe(ORCA_REQUESTED_SCOPE);
  });
});

describe('code exchange', () => {
  let server: FakeAuthServer;

  afterEach(async () => {
    if (server) await server.close();
  });

  it('posts to /api/v1/auth/keys on the auth origin and returns the issued key', async () => {
    server = await startFakeAuthServer();
    const result = await exchangeCode({
      endpoints: server.endpoints,
      code: 'fake-auth-code',
      verifier: 'fake-verifier-value',
    });

    expect(result.apiKey).toBe(FAKE_KEY);
    expect(result.grantedScope).toBe('api');
    expect(server.exchangeBodies).toHaveLength(1);
  });

  it('sends the verifier and the S256 method in the body', async () => {
    server = await startFakeAuthServer();
    await exchangeCode({ endpoints: server.endpoints, code: 'fake-auth-code', verifier: 'fake-verifier-value' });

    const body = JSON.parse(server.exchangeBodies[0] ?? '{}');
    expect(body).toEqual({
      code: 'fake-auth-code',
      code_verifier: 'fake-verifier-value',
      code_challenge_method: 'S256',
    });
  });

  it('never puts the verifier in the request URL', async () => {
    server = await startFakeAuthServer();
    const calls: string[] = [];
    const impl = (async (url: string, init: RequestInit) => {
      calls.push(url);
      return fetch(url, init);
    }) as unknown as typeof fetch;

    await exchangeCode({
      endpoints: server.endpoints,
      code: 'fake-auth-code',
      verifier: 'fake-verifier-value',
      fetchImpl: impl,
    });

    expect(calls[0]).toBe(`${server.origin}/api/v1/auth/keys`);
    expect(calls[0]).not.toContain('fake-verifier-value');
  });

  it('reports a 403 as a rejected code and says what to do about it', async () => {
    server = await startFakeAuthServer({ exchange: { status: 403, body: { error: 'invalid_grant' } } });

    await expect(exchangeCode({ endpoints: server.endpoints, code: 'used-code', verifier: 'v' })).rejects.toMatchObject(
      { kind: 'code_rejected' },
    );
  });

  it('reports a 400 as the downgrade defence rather than a user error', async () => {
    server = await startFakeAuthServer({ exchange: { status: 400, body: { error: 'invalid_request' } } });

    await expect(exchangeCode({ endpoints: server.endpoints, code: 'c', verifier: 'v' })).rejects.toMatchObject({
      kind: 'downgrade_defence',
    });
  });

  it('reports 429 with the key-cap remedy instead of hot-looping', async () => {
    server = await startFakeAuthServer({ exchange: { status: 429, body: { error: 'rate_limited' } } });

    const error = await exchangeCode({ endpoints: server.endpoints, code: 'c', verifier: 'v' }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(OrcaAuthError);
    expect((error as OrcaAuthError).kind).toBe('rate_limited');
    expect((error as OrcaAuthError).message).toContain('revoke');
  });

  it('rejects a granted scope narrower than the one requested', async () => {
    server = await startFakeAuthServer({
      exchange: { status: 200, body: { key: FAKE_KEY, scope: 'connector' } },
    });

    const error = await exchangeCode({ endpoints: server.endpoints, code: 'c', verifier: 'v' }).catch(
      (thrown: unknown) => thrown,
    );
    expect((error as OrcaAuthError).kind).toBe('scope_downgrade');
    // The narrower grant is surfaced, not silently stored as if it were usable.
    expect((error as OrcaAuthError).message).toContain('connector');
  });

  it('reports a response with no key as malformed rather than storing nothing', async () => {
    server = await startFakeAuthServer({ exchange: { status: 200, body: { scope: 'api' } } });

    await expect(exchangeCode({ endpoints: server.endpoints, code: 'c', verifier: 'v' })).rejects.toMatchObject({
      kind: 'malformed_response',
    });
  });

  it('keeps the verifier out of every error message', async () => {
    server = await startFakeAuthServer({ exchange: { status: 403, body: { error: 'invalid_grant' } } });
    const secretVerifier = 'super-secret-verifier-value';

    const error = (await exchangeCode({
      endpoints: server.endpoints,
      code: 'c',
      verifier: secretVerifier,
    }).catch((thrown: unknown) => thrown)) as OrcaAuthError;

    expect(error.message).not.toContain(secretVerifier);
    expect(JSON.stringify(error, Object.getOwnPropertyNames(error))).not.toContain(secretVerifier);
  });

  it('reports an unreachable auth origin as a transport failure, not a hang', async () => {
    const dead = await startFakeAuthServer();
    const endpoints = { authBaseUrl: dead.origin, apiBaseUrl: dead.endpoints.apiBaseUrl };
    await dead.close();

    await expect(exchangeCode({ endpoints, code: 'c', verifier: 'v' })).rejects.toMatchObject({
      kind: 'transport',
    });
  });
});

describe('connect flow through the CLI adapter', () => {
  let server: FakeAuthServer;
  let savedEnv: Record<string, string | undefined>;
  /** Receives the consent URL the flow would otherwise open in a browser. */
  let sink: (url: string) => void;

  beforeEach(() => {
    savedEnv = {
      ORCA_AUTH_BASE_URL: process.env.ORCA_AUTH_BASE_URL,
      ORCA_API_BASE_URL: process.env.ORCA_API_BASE_URL,
      ORCA_BASE_URL: process.env.ORCA_BASE_URL,
    };
  });

  afterEach(async () => {
    if (server) await server.close();
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('drives authorize → callback → exchange → persist against a local auth server', async () => {
    const { runConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();

    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    // Capture the URL the flow would open instead of launching a browser, then play the
    // part of the consent screen: deliver a code to the loopback listener it is waiting on.
    const opened = new Promise<string>((resolve) => {
      sink = resolve;
    });

    const outcome = settle(runConnectFlow({ presentConsentUrl: (url) => sink(url) }));
    const url = await opened;
    const parsed = new URL(url);

    expect(parsed.origin).toBe(server.origin);
    expect(parsed.pathname).toBe(ORCA_AUTHORIZE_PATH);
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');

    const callbackUrl = parsed.searchParams.get('callback_url') ?? '';
    expect(callbackUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/cb$/);

    await deliverCallback(callbackUrl, {
      code: 'fake-auth-code',
      state: parsed.searchParams.get('state') ?? '',
    });

    const { value, error } = await outcome;
    expect(error).toBeUndefined();
    expect(value?.apiKey).toBe(FAKE_KEY);
    expect(value?.grantedScope).toBe('api');
    expect(server.exchangeBodies).toHaveLength(1);
  });

  it('surfaces a denial and releases the listener instead of hanging', async () => {
    const { runConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();

    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    const opened = new Promise<string>((resolve) => {
      sink = resolve;
    });
    const outcome = settle(runConnectFlow({ presentConsentUrl: (url) => sink(url) }));
    const parsed = new URL(await opened);
    const callbackUrl = parsed.searchParams.get('callback_url') ?? '';

    await deliverCallback(callbackUrl, {
      error: 'access_denied',
      state: parsed.searchParams.get('state') ?? '',
    });

    const { error } = await outcome;
    expect(error).toBeInstanceOf(OrcaAuthError);
    expect((error as OrcaAuthError).kind).toBe('denied');
    // Nothing was exchanged, so no key was minted for a denied authorization.
    expect(server.exchangeBodies).toHaveLength(0);
  });

  it('ignores a callback whose state does not match and exchanges nothing', async () => {
    const { runConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();

    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    const opened = new Promise<string>((resolve) => {
      sink = resolve;
    });
    const outcome = settle(runConnectFlow({ presentConsentUrl: (url) => sink(url) }));
    const parsed = new URL(await opened);
    const callbackUrl = parsed.searchParams.get('callback_url') ?? '';

    // A callback with the wrong state must not settle the flow; it is dropped.
    await deliverCallback(callbackUrl, { code: 'attacker-supplied-code', state: 'not-the-expected-state' });
    expect(server.exchangeBodies).toHaveLength(0);

    // Settle it properly afterwards, proving the attempt was not derailed by the intruder.
    await deliverCallback(callbackUrl, { code: 'fake-auth-code', state: parsed.searchParams.get('state') ?? '' });
    const { value, error } = await outcome;

    expect(error).toBeUndefined();
    expect(value?.apiKey).toBe(FAKE_KEY);
    expect(server.exchangeBodies).toHaveLength(1);
    expect(server.exchangeBodies[0]).toContain('fake-auth-code');
    expect(server.exchangeBodies[0]).not.toContain('attacker-supplied-code');
  });
});

/**
 * Flow B, for the session that has no terminal to be prompted at or no browser on the
 * machine running the CLI. The code is displayed by the consent screen and typed back, so
 * the two properties that matter are that no listener is opened at all, and that the
 * challenge is still an S256 hash rather than the verifier the user could have read off
 * the authorize URL.
 */
describe('out-of-band connect flow', () => {
  let server: FakeAuthServer;
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = {
      ORCA_AUTH_BASE_URL: process.env.ORCA_AUTH_BASE_URL,
      ORCA_API_BASE_URL: process.env.ORCA_API_BASE_URL,
      ORCA_BASE_URL: process.env.ORCA_BASE_URL,
    };
  });

  afterEach(async () => {
    if (server) await server.close();
    for (const [name, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('asks for the literal oob callback and exchanges the pasted code', async () => {
    const { runOutOfBandConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    let consentUrl = '';
    const outcome = await runOutOfBandConnectFlow({
      presentConsentUrl: (url) => {
        consentUrl = url;
      },
      readCode: async () => 'code-from-the-consent-screen',
    });

    const parsed = new URL(consentUrl);
    expect(parsed.origin).toBe(server.origin);
    expect(parsed.pathname).toBe(ORCA_AUTHORIZE_PATH);
    // The literal three letters, so the mode is asked for rather than guessed at.
    expect(parsed.searchParams.get('callback_url')).toBe('oob');
    // Mandatory here: the code is displayed, so under `plain` the challenge on this URL
    // and the code on the screen would be the same secret.
    expect(parsed.searchParams.get('code_challenge_method')).toBe('S256');

    expect(outcome.apiKey).toBe(FAKE_KEY);
    expect(server.exchangeBodies).toHaveLength(1);
    expect(server.exchangeBodies[0]).toContain('code-from-the-consent-screen');
  });

  it('never opens a loopback listener', async () => {
    const { runOutOfBandConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    // Spied rather than counted from the active handles: this file's other tests own
    // servers of their own, and their teardown is asynchronous.
    const createServer = vi.spyOn(http, 'createServer');
    let consentUrl = '';
    try {
      await runOutOfBandConnectFlow({
        presentConsentUrl: (url) => {
          consentUrl = url;
        },
        readCode: async () => 'code-from-the-consent-screen',
      });
    } finally {
      createServer.mockRestore();
    }

    // Nothing is listening: the flow's whole point is that it needs no reachable address.
    expect(createServer).not.toHaveBeenCalled();
    // And it named no address for the code to come back to — the code is displayed instead.
    expect(new URL(consentUrl).searchParams.get('callback_url')).toBe('oob');
  });

  it('issues no key when the user supplies nothing', async () => {
    const { runOutOfBandConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    const outcome = settle(runOutOfBandConnectFlow({ presentConsentUrl: () => {}, readCode: async () => undefined }));
    const { error } = await outcome;

    expect(error).toBeInstanceOf(OrcaAuthError);
    expect((error as OrcaAuthError).kind).toBe('cancelled');
    // A declined prompt must not reach the exchange at all.
    expect(server.exchangeBodies).toHaveLength(0);
  });

  it('uses a fresh verifier for each out-of-band attempt', async () => {
    const { runOutOfBandConnectFlow } = await import('../commands/connect.js');
    server = await startFakeAuthServer();
    process.env.ORCA_AUTH_BASE_URL = server.origin;
    delete process.env.ORCA_BASE_URL;
    delete process.env.ORCA_API_BASE_URL;

    const challenges: string[] = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await runOutOfBandConnectFlow({
        presentConsentUrl: (url) => challenges.push(new URL(url).searchParams.get('code_challenge') ?? ''),
        readCode: async () => 'code-from-the-consent-screen',
      });
    }

    expect(challenges).toHaveLength(2);
    expect(challenges[0]).not.toBe(challenges[1]);
  });
});
