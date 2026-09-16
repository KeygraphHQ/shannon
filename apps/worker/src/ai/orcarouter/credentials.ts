// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The OrcaRouter credential seam, and the two adapters that feed it.
 *
 * "How do we get an OrcaRouter key?" has exactly two answers for a user: paste an
 * existing `sk-orca-…` key, or sign in with an OrcaRouter account over OAuth 2.0 +
 * PKCE. Both produce the *same* thing — an ordinary OrcaRouter API key belonging to
 * that user — so everything downstream (inference, model discovery, status) reads one
 * `OrcaCredential` and never asks where it came from.
 *
 * Keeping that boundary real is the point: the request path, the catalog, and each
 * entry point must not each grow their own copy of "which auth method is in play".
 *
 * An OrcaRouter key is durable, but it is **not** a refresh token. There is no refresh
 * grant, and no code here schedules one. A key the relay rejects with 401 is a terminal
 * reauthentication requirement for that exact account and credential generation, which
 * is what `OrcaAccountState` records — a late failure from a request made under an old
 * generation can never mark a freshly reauthorized credential as broken.
 *
 * Mirrors apps/cli/src/orcarouter/credentials.ts; the CLI cannot import from the worker
 * package (it ships as a standalone bundle), so the file is duplicated there deliberately
 * and the two copies must stay in sync.
 */

import { ORCA_API_BASE_URL_ENV, ORCA_AUTH_BASE_URL_ENV, ORCA_BASE_URL_ENV, resolveOrcaEndpoints } from './endpoints.js';

/** Which of the two entry points produced a credential. Display and support only. */
export type OrcaAuthMethod = 'api-key' | 'pkce';

/** The one credential shape every OrcaRouter consumer reads. */
export interface OrcaCredential {
  /** The OrcaRouter API key. Never logged, never placed in a URL, never in an error. */
  readonly apiKey: string;
  /** Which entry point produced it. Downstream request code must not branch on this. */
  readonly method: OrcaAuthMethod;
  /** Scope the exchange granted. `api` is what inference needs. */
  readonly scope: string;
}

/**
 * A credential source. The request path and the catalog take one of these; they never
 * take an auth method, a browser, or a config file. The environment is a parameter so a
 * caller can supply one explicitly rather than reading the process's.
 */
export type OrcaCredentialSource = (env?: OrcaEnv) => OrcaCredential | undefined;

/**
 * Env vars carrying an OrcaRouter API key, in precedence order. `ORCAROUTER_API_KEY` is
 * Shannon's own name for this provider and wins; the remaining names are the shorthand
 * forms OrcaRouter's own tooling and documentation use.
 */
export const ORCAROUTER_API_KEY_ENV = 'ORCAROUTER_API_KEY';

export const ORCAROUTER_API_KEY_ENV_ALIASES: readonly string[] = [
  ORCAROUTER_API_KEY_ENV,
  'ORCA_API_KEY',
  'ORCA_KEY',
  'SHANNON_AI_API_KEY',
];

/** Set by the CLI after a connect so status can name the entry point that was used. */
export const ORCAROUTER_AUTH_METHOD_ENV = 'ORCAROUTER_AUTH_METHOD';

/** Prefix every OrcaRouter-issued key carries. */
export const ORCA_KEY_PREFIX = 'sk-orca-';

/** Body of a key is checked for length only; the prefix is not proof a key is valid. */
const MIN_KEY_LENGTH = ORCA_KEY_PREFIX.length + 8;

/**
 * Lightweight shape check, used to catch an obvious paste mistake. A key that passes is
 * not thereby known to be valid — there is no free validation endpoint, so the first
 * real request establishes validity and its failure is reported then.
 */
export function looksLikeOrcaKey(value: string): boolean {
  return value.startsWith(ORCA_KEY_PREFIX) && value.length >= MIN_KEY_LENGTH;
}

/**
 * Render a key for display.
 *
 * Nothing beyond the fixed, non-secret prefix is echoed: not the head, not the tail. A
 * partial key is still key material, and this string reaches terminal scrollback and log
 * files. The length is enough to tell two keys of different shape apart.
 */
export function maskOrcaKey(value: string): string {
  return `${ORCA_KEY_PREFIX}…(${value.length})`;
}

export type OrcaEnv = Readonly<Record<string, string | undefined>>;

/** First variable in precedence order that holds a value. */
function firstSet(env: OrcaEnv, names: readonly string[]): { name: string; value: string } | undefined {
  for (const name of names) {
    const value = env[name]?.trim();
    if (value) return { name, value };
  }
  return undefined;
}

/**
 * API-key adapter: the user pasted or exported a key themselves.
 *
 * Returns undefined when nothing is set — the caller then offers the connect flow
 * rather than failing, because "no key yet" is a normal starting state.
 */
export function apiKeySource(env: OrcaEnv = process.env as OrcaEnv): OrcaCredential | undefined {
  const found = firstSet(env, ORCAROUTER_API_KEY_ENV_ALIASES);
  if (!found) return undefined;
  if (!looksLikeOrcaKey(found.value)) return undefined;
  return { apiKey: found.value, method: 'api-key', scope: 'api' };
}

/**
 * Connect adapter: the key a completed PKCE sign-in produced.
 *
 * The CLI writes the issued key into the same slot the API-key path uses and records
 * that a connect produced it, so this adapter differs from `apiKeySource` only in the
 * method it reports. That is deliberate: the two entry points are interchangeable to
 * every consumer, and only the UI distinguishes them.
 */
export function connectSource(env: OrcaEnv = process.env as OrcaEnv): OrcaCredential | undefined {
  const credential = apiKeySource(env);
  if (!credential) return undefined;
  const method: OrcaAuthMethod = env[ORCAROUTER_AUTH_METHOD_ENV]?.trim() === 'pkce' ? 'pkce' : 'api-key';
  return { ...credential, method };
}

/**
 * Resolve a credential for a run. Both entry points feed this one function, and the
 * result is identical in shape whichever produced it.
 */
export function resolveOrcaCredential(env: OrcaEnv = process.env as OrcaEnv): OrcaCredential | undefined {
  return connectSource(env);
}

/** Whether a credential is present, without materializing it. */
export function hasOrcaCredential(env: OrcaEnv = process.env as OrcaEnv): boolean {
  return resolveOrcaCredential(env) !== undefined;
}

/**
 * Environment the inference and discovery paths read their origins from. Forwarded into
 * the worker so an explicit override reaches the process that actually makes the request.
 */
export const ORCA_ORIGIN_ENV_VARS: readonly string[] = [
  ORCA_BASE_URL_ENV,
  ORCA_AUTH_BASE_URL_ENV,
  ORCA_API_BASE_URL_ENV,
];

/** Where the user manages and revokes the keys this app holds. */
export const ORCA_AUTHORIZED_APPS_URL = 'https://www.orcarouter.ai/console/authorized-apps';

/** Where the user creates or copies an API key by hand. */
export const ORCA_API_KEYS_URL = 'https://www.orcarouter.ai/console/api-keys';

// === Account and credential generation ===

/** Reauthentication state for one OrcaRouter account. */
export interface OrcaAccountStatus {
  readonly accountId: string;
  /** Increments on every successful sign-in, so a request can name its own generation. */
  readonly generation: number;
  readonly state: 'active' | 'needsReauth';
  /** Why the account needs reauthentication; set only with `needsReauth`. */
  readonly reason?: 'revoked' | 'rejected';
}

/**
 * Tracks one account's credential generation and whether the relay has rejected it.
 *
 * The generation guard is the whole point. An in-flight request that started under
 * generation 1 can fail with 401 *after* the user has signed in again as generation 2;
 * applying that verdict would mark a credential that works as broken. A rejection is
 * therefore only recorded when the generation it names is still the current one.
 */
export class OrcaAccountState {
  private readonly accounts = new Map<string, OrcaAccountStatus>();

  /** State for an account, defaulting to an active generation 1. */
  status(accountId: string): OrcaAccountStatus {
    return this.accounts.get(accountId) ?? { accountId, generation: 1, state: 'active' };
  }

  /**
   * Record a successful sign-in and return the new generation. Any pending
   * `needsReauth` on this account clears, because a working credential now exists.
   */
  beginLogin(accountId: string): number {
    const generation = this.status(accountId).generation + 1;
    this.accounts.set(accountId, { accountId, generation, state: 'active' });
    return generation;
  }

  /** Record an account as active at a known generation, for a caller that learned one. */
  setActive(accountId: string, generation: number): void {
    this.accounts.set(accountId, { accountId, generation, state: 'active' });
  }

  /**
   * Record a relay rejection against the exact generation that made the request.
   *
   * Returns whether the rejection applied. A stale generation is ignored — that is the
   * case where a slow failure must not poison a newer credential.
   */
  markRejected(accountId: string, generation: number, reason: 'revoked' | 'rejected' = 'revoked'): boolean {
    if (this.status(accountId).generation !== generation) return false;
    this.accounts.set(accountId, { accountId, generation, state: 'needsReauth', reason });
    return true;
  }

  /** Whether this exact account and generation may still be used. */
  isUsable(accountId: string, generation: number): boolean {
    const status = this.status(accountId);
    return status.generation === generation && status.state === 'active';
  }

  /** Accounts awaiting reauthentication. */
  needsReauth(): readonly OrcaAccountStatus[] {
    return [...this.accounts.values()].filter((status) => status.state === 'needsReauth');
  }

  /**
   * Origins the credential is valid against. Read here so a self-hosted deployment's
   * override applies to inference and discovery alike, never derived by rewriting the
   * other origin's hostname.
   */
  endpoints(env: OrcaEnv = process.env as OrcaEnv): ReturnType<typeof resolveOrcaEndpoints> {
    return resolveOrcaEndpoints(env as NodeJS.ProcessEnv);
  }
}

/**
 * Process-wide account state for credential generation tracking.
 *
 * A scan runs one account, and the state has to outlive any single request so a late 401
 * can be compared against the generation that is current when it lands.
 */
export const orcaAccountState = new OrcaAccountState();

/**
 * Account the process's credential belongs to. A run holds exactly one OrcaRouter
 * credential, so it needs no per-account bookkeeping to tell them apart.
 */
export const ORCA_RUN_ACCOUNT_ID = 'orcarouter';

/** Outcome of recording a relay rejection, so the caller can report it accurately. */
export interface OrcaRelayRejection {
  readonly accountId: string;
  readonly generation: number;
  /** False when a newer credential generation already replaced the one that was rejected. */
  readonly applied: boolean;
}

/**
 * The generation a request about to be made belongs to.
 *
 * Read before the request rather than after it fails: the whole point of the guard is that
 * the verdict is attributed to the credential the request actually carried, which a caller
 * that asked later could no longer know.
 */
export function currentOrcaGeneration(): number {
  return orcaAccountState.status(ORCA_RUN_ACCOUNT_ID).generation;
}

/**
 * Take the terminal-reauthentication transition for a credential the relay rejected with 401.
 *
 * This is deliberately not a retry and deliberately not a refresh. An OrcaRouter key is
 * durable and has no refresh grant, so a rejected key cannot be repaired by asking for a
 * new one — the account has to sign in again. Marking it is what stops the run from
 * hammering a dead credential, and the message it produces is what tells the user the one
 * action that fixes it.
 *
 * `generation` is the one the rejected request was made under, taken from
 * {@link currentOrcaGeneration} before the request went out. A late failure from a request
 * that started before a re-login therefore names a generation that is no longer current:
 * `applied` is false and the fresh credential is left alone.
 */
export function recordOrcaRelayRejection(
  generation: number,
  reason: 'revoked' | 'rejected' = 'revoked',
): OrcaRelayRejection {
  const accountId = ORCA_RUN_ACCOUNT_ID;
  return { accountId, generation, applied: orcaAccountState.markRejected(accountId, generation, reason) };
}

/**
 * The message a rejected credential produces. Names the two ways back in and the one place
 * the user can undo whatever revoked access, without echoing the key or the relay's prose.
 */
export function orcaReauthenticationMessage(): string {
  return (
    'OrcaRouter rejected the configured credential. The key may have been revoked at ' +
    `${ORCA_AUTHORIZED_APPS_URL}, or replaced by a newer one. Run \`npx @keygraph/shannon connect\` to ` +
    'sign in again, or set a current key in ORCAROUTER_API_KEY. No retry is attempted, because an ' +
    'OrcaRouter key is durable and is not refreshable.'
  );
}
