/**
 * OAuth 2.0 authorization-code + PKCE primitives for OrcaRouter.
 *
 * The point of PKCE is that no client secret exists: the verifier never leaves this
 * process, only its SHA-256 hash travels on the authorize URL, and the code is
 * redeemable only by whoever can present the verifier. That is why the verifier is
 * generated from a cryptographic RNG for every attempt and is never logged, echoed in
 * an error, or placed in a URL.
 *
 * `S256` is always sent, on every flow. Even with a loopback callback the user may
 * choose "Show me a code" on the consent screen, and the out-of-band flow makes that
 * choice mandatory — under `plain` the displayed code and the challenge on the
 * authorize URL would be the same secret.
 *
 * The exchange runs against the auth origin's `/api/v1/auth/keys`. The inference origin
 * (`https://api.orcarouter.ai/v1`) has no auth path at all; `/v1/auth/keys` is a 404.
 */

import crypto from 'node:crypto';
import { authUrl, ORCA_AUTHORIZE_PATH, ORCA_EXCHANGE_PATH, type OrcaEndpoints } from './endpoints.js';

/** Scope this client asks for. The token grants inference, which is what a scan needs. */
export const ORCA_REQUESTED_SCOPE = 'api';

/** Label shown on the consent screen. A claim the user sees, not an identifier. */
export const ORCA_APP_NAME = 'Shannon';

/** The literal `callback_url` value that selects the out-of-band flow. */
export const ORCA_OOB_CALLBACK = 'oob';

/** One-time authorization codes live ten minutes. */
export const ORCA_CODE_TTL_MS = 10 * 60 * 1000;

export interface PkcePair {
  /** High-entropy secret. Never leaves the process until the exchange. */
  readonly verifier: string;
  /** `base64url(sha256(verifier))`, no padding — the only half sent to the server. */
  readonly challenge: string;
  /** Opaque CSRF token, echoed back on the redirect. */
  readonly state: string;
}

function base64url(bytes: Buffer): string {
  return bytes.toString('base64url');
}

/**
 * A fresh verifier, challenge, and state from the platform CSPRNG. Called once per
 * authorization attempt: reusing a verifier or deriving it from anything guessable
 * defeats the flow.
 */
export function createPkcePair(): PkcePair {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));
  return { verifier, challenge, state };
}

export interface AuthorizeUrlOptions {
  readonly endpoints: OrcaEndpoints;
  readonly challenge: string;
  readonly state: string;
  /** Loopback redirect URL, or `oob` for the out-of-band flow. */
  readonly callbackUrl: string;
  readonly appName?: string;
  readonly scope?: string;
}

/** Build the consent URL. Carries the challenge and state, never the verifier. */
export function buildAuthorizeUrl(options: AuthorizeUrlOptions): string {
  const url = new URL(authUrl(options.endpoints, ORCA_AUTHORIZE_PATH));
  url.searchParams.set('callback_url', options.callbackUrl);
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', options.state);
  url.searchParams.set('app_name', options.appName ?? ORCA_APP_NAME);
  url.searchParams.set('scope', options.scope ?? ORCA_REQUESTED_SCOPE);
  return url.toString();
}

/** How an exchange failed. Every kind maps to a user-actionable next step. */
export type OrcaAuthErrorKind =
  | 'denied'
  | 'state_mismatch'
  | 'code_rejected'
  | 'downgrade_defence'
  | 'scope_downgrade'
  | 'rate_limited'
  | 'transport'
  | 'malformed_response'
  | 'cancelled';

/**
 * A failed authorization step. Carries a bounded kind and a message that names the
 * remedy without ever echoing a code, verifier, or key.
 */
export class OrcaAuthError extends Error {
  override readonly name = 'OrcaAuthError';
  readonly kind: OrcaAuthErrorKind;

  constructor(kind: OrcaAuthErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

export interface ExchangeResult {
  /** The OrcaRouter API key. Belongs to the user; billed to their account. */
  readonly apiKey: string;
  /** Scope actually granted, which may be narrower than the one requested. */
  readonly grantedScope: string;
  readonly userId?: string;
}

/** Shape of the exchange response, read defensively. */
interface ExchangeBody {
  key?: unknown;
  scope?: unknown;
  user_id?: unknown;
  error?: unknown;
  error_description?: unknown;
}

export interface ExchangeOptions {
  readonly endpoints: OrcaEndpoints;
  readonly code: string;
  readonly verifier: string;
  /** Injected for tests; defaults to the global fetch. */
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * Redeem an authorization code for an OrcaRouter API key.
 *
 * Form encoding is also accepted by the endpoint (RFC 6749 §2.3.1); JSON is used here
 * because it keeps the verifier out of any URL-encoded body a proxy might log
 * differently. The granted scope is read back and enforced — a client that asked for
 * `api` and received something narrower cannot run inference and must say so.
 */
export async function exchangeCode(options: ExchangeOptions): Promise<ExchangeResult> {
  const doFetch = options.fetchImpl ?? fetch;

  let response: Response;
  try {
    response = await doFetch(authUrl(options.endpoints, ORCA_EXCHANGE_PATH), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: options.code,
        code_verifier: options.verifier,
        code_challenge_method: 'S256',
      }),
      ...(options.signal ? { signal: options.signal } : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OrcaAuthError('cancelled', 'The OrcaRouter sign-in was cancelled.');
    }
    throw new OrcaAuthError(
      'transport',
      `Could not reach ${options.endpoints.authBaseUrl} to complete the sign-in. Check your network and try again.`,
    );
  }

  let body: ExchangeBody = {};
  try {
    body = (await response.json()) as ExchangeBody;
  } catch {
    body = {};
  }

  if (response.status === 429) {
    throw new OrcaAuthError(
      'rate_limited',
      'OrcaRouter refused a new authorization (429). An account may hold at most 10 app keys per 24 hours; revoke unused ones at https://www.orcarouter.ai/console/authorized-apps and retry later.',
    );
  }
  if (response.status === 400) {
    // A 400 here means the method was unrecognised or differs from the one sent at
    // authorize time — the downgrade defence. It is never a user input problem.
    throw new OrcaAuthError(
      'downgrade_defence',
      'OrcaRouter rejected the PKCE code_challenge_method (400). Restart the sign-in so a fresh S256 challenge is sent.',
    );
  }
  if (response.status === 403) {
    throw new OrcaAuthError(
      'code_rejected',
      'OrcaRouter rejected the authorization code (403): it is unknown, expired after 10 minutes, already used, or does not match this session. Run the connect command again.',
    );
  }
  if (!response.ok) {
    throw new OrcaAuthError(
      'transport',
      `OrcaRouter sign-in failed with HTTP ${response.status}. Try again, and check https://www.orcarouter.ai/status if it persists.`,
    );
  }

  const apiKey = typeof body.key === 'string' ? body.key : '';
  if (!apiKey) {
    throw new OrcaAuthError(
      'malformed_response',
      'OrcaRouter returned no API key for this authorization. Run the connect command again.',
    );
  }

  const grantedScope = typeof body.scope === 'string' ? body.scope : '';
  if (grantedScope !== ORCA_REQUESTED_SCOPE) {
    // The response says what was granted, not what was asked for. A narrower grant
    // cannot call the inference API, so surface it instead of storing a key that fails.
    const detail = grantedScope ? `"${grantedScope}"` : 'no scope';
    throw new OrcaAuthError(
      'scope_downgrade',
      `OrcaRouter granted ${detail} rather than "${ORCA_REQUESTED_SCOPE}", which cannot run inference. Approve the request as a workspace member whose role allows the api scope, or use an API key instead.`,
    );
  }

  return {
    apiKey,
    grantedScope,
    ...(typeof body.user_id === 'string' ? { userId: body.user_id } : {}),
  };
}

/**
 * Constant-time comparison of the `state` the client sent against the one echoed back.
 * Coming from the listener, so it is the only thing standing between this process and a
 * code some other page dropped on it.
 */
export function stateMatches(expected: string, received: string | null): boolean {
  if (!received) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
