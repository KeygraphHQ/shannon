/**
 * `npx @keygraph/shannon connect` — sign in with an OrcaRouter account.
 *
 * This is the second of Shannon's two OrcaRouter entry points. The first is pasting an
 * `sk-orca-…` key, which `setup` handles and which stays available unchanged. Both end
 * at the same place: one ordinary OrcaRouter API key, belonging to the user, stored
 * where the running mode keeps its provider credentials — `~/.shannon/config.toml` under
 * npx, `./.env` under a clone.
 *
 * **Flow A (loopback redirect)** is the default. Shannon's client is a local process that
 * can listen on `127.0.0.1`, so the code arrives on its own and the user clicks once.
 * **Flow B (out-of-band)** covers the session that has no terminal to be prompted at or
 * no browser on the same machine as the terminal: the consent URL and the displayed code
 * are printed, and the code is pasted back. The device grant (Flow C) is left out — it is
 * strictly more work for a user who has a browser, and the two flows above already cover
 * both shapes of client.
 *
 * `S256` is sent on both. The consent screen offers the user a "show me a code" option,
 * and a displayed code must be redeemable only by the process holding the verifier.
 *
 * The key is durable but is **not** a refresh token: it is reused until revoked, never
 * refreshed, and reauthorizing on every launch would burn the ten-keys-per-24-hours cap.
 */

import { exec } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import * as p from '@clack/prompts';
import { intro, isCancel, log, select, text } from '@clack/prompts';
import { saveConfig, upsertEnvFile } from '../config/writer.js';
import { fail } from '../errors.js';
import { getConfigFile } from '../home.js';
import { getMode, isLocal } from '../mode.js';
import {
  maskOrcaKey,
  ORCA_API_KEYS_URL,
  ORCA_AUTHORIZED_APPS_URL,
  ORCAROUTER_API_KEY_ENV,
  ORCAROUTER_AUTH_METHOD_ENV,
} from '../orcarouter/credentials.js';
import { authUrl, resolveOrcaEndpoints } from '../orcarouter/endpoints.js';
import {
  buildAuthorizeUrl,
  createPkcePair,
  type ExchangeResult,
  exchangeCode,
  ORCA_OOB_CALLBACK,
  OrcaAuthError,
  stateMatches,
} from '../orcarouter/pkce.js';
import { displaySplash } from '../splash.js';
import { getVersion } from '../version.js';

/** How long the whole sign-in may take before it gives up and releases the listener. */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Loopback path the consent screen redirects to. */
const CALLBACK_PATH = '/cb';

/** The page shown to the browser once the code has been received. */
const CALLBACK_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Shannon</title></head>
<body style="font-family: system-ui, sans-serif; margin: 4rem auto; max-width: 32rem; line-height: 1.5">
<h1 style="font-size: 1.25rem">Connected to OrcaRouter</h1>
<p>You can close this tab and return to Shannon.</p>
</body></html>`;

interface LoopbackResult {
  readonly port: number;
  /** Resolves with the authorization code, or rejects with an OrcaAuthError. */
  readonly code: Promise<string>;
  /** Stop listening and release the port. Safe to call more than once. */
  readonly close: () => void;
}

/**
 * Start the loopback listener before the browser opens, so the port is known and the
 * redirect cannot race the server.
 *
 * `state` is compared before the code is accepted — it is the only thing standing
 * between this listener and a code some other page dropped on it.
 */
async function startLoopbackListener(expectedState: string): Promise<LoopbackResult> {
  let settle: (code: string) => void = () => {};
  let fail: (error: Error) => void = () => {};
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname !== CALLBACK_PATH) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }

    // Only a callback carrying this attempt's state may settle the pending promise. A
    // request with anything else — a stale tab, a probe, another page — is acknowledged
    // and dropped, so it cannot leave an unobserved rejection behind.
    if (!stateMatches(expectedState, url.searchParams.get('state'))) {
      res.writeHead(400, { 'Content-Type': 'text/plain' }).end('Sign-in state did not match.');
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(CALLBACK_HTML);
    close();

    const error = url.searchParams.get('error');
    if (error) {
      fail(
        new OrcaAuthError(
          'denied',
          error === 'access_denied'
            ? 'The OrcaRouter authorization was denied, so no key was issued. Nothing was changed — you can retry or paste an API key instead.'
            : `The OrcaRouter authorization failed (${error}). Run the connect command again.`,
        ),
      );
      return;
    }

    const received = url.searchParams.get('code');
    if (!received) {
      fail(new OrcaAuthError('malformed_response', 'The OrcaRouter redirect carried no authorization code.'));
      return;
    }
    settle(received);
  });

  const close = (): void => {
    server.close();
  };

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (address === null || typeof address === 'string') {
    close();
    throw new OrcaAuthError('transport', 'Could not open a loopback port to receive the OrcaRouter redirect.');
  }

  return { port: address.port, code, close };
}

/**
 * Hand the consent URL to the user. Best effort by design: a machine with no browser is a
 * normal case, so the URL is always printed and opening it is allowed to fail silently.
 *
 * `present` is injectable so a test can receive the URL instead of launching a browser.
 * The URL is always printed before anything is opened, because a machine with no browser
 * is a normal case rather than an error.
 */
export function presentConsentUrl(url: string, present?: (url: string) => void, announce = true): void {
  if (announce) log.info(`If your browser did not open, visit:\n${url}`);
  if (present) {
    present(url);
    return;
  }

  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${command} "${url}"`, () => {
    // No browser, or no handler for it: the printed URL is the fallback.
  });
}

export interface ConnectFlowOptions {
  /** Receives the consent URL. Defaults to opening the user's browser. */
  readonly presentConsentUrl?: (url: string) => void;
  /**
   * Whether the human ceremony around the sign-in may be printed. A flow driven without a
   * terminal (a test, or a caller that supplied its own `presentConsentUrl`) still performs
   * every protocol step; it just does not narrate them to a screen nobody is watching.
   */
  readonly announce?: boolean;
}

/**
 * Run the sign-in and return the issued API key.
 *
 * Flow A (loopback redirect) is used, because this client is a local process that can
 * listen on `127.0.0.1` — the code arrives on its own and the user clicks once. `S256` is
 * sent even so: the consent screen offers a "show me a code" option, and a code put into
 * human hands must be redeemable only by the process holding the verifier. Flow B covers
 * the no-terminal case, where the URL is printed and a code is pasted back.
 *
 * Every terminal path releases the listener: success, denial, state mismatch, exchange
 * failure, timeout, and an explicit cancel. A failure never deletes an existing stored
 * credential, and never logs the verifier or the key.
 */
export async function runConnectFlow(options: ConnectFlowOptions = {}): Promise<ExchangeResult> {
  const endpoints = resolveOrcaEndpoints();
  const pkce = createPkcePair();
  const announce = options.announce ?? true;

  const listener = await startLoopbackListener(pkce.state);
  const authorizeUrl = buildAuthorizeUrl({
    endpoints,
    challenge: pkce.challenge,
    state: pkce.state,
    callbackUrl: `http://127.0.0.1:${listener.port}${CALLBACK_PATH}`,
  });

  // A loopback callback URL is only reachable from this machine, and the verifier never
  // leaves this process: no verifier, no code, and no key is ever printed here.
  if (announce) log.info(`Waiting for authorization at ${endpoints.authBaseUrl}.`);
  presentConsentUrl(authorizeUrl, options.presentConsentUrl, announce);

  let timeout: NodeJS.Timeout | undefined;
  const timedOut = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(
      () =>
        reject(
          new OrcaAuthError(
            'cancelled',
            'The OrcaRouter sign-in timed out after five minutes. Run the connect command again.',
          ),
        ),
      LOGIN_TIMEOUT_MS,
    );
  });

  try {
    const code = await Promise.race([listener.code, timedOut]);
    return await exchangeCode({ endpoints, code, verifier: pkce.verifier });
  } finally {
    if (timeout) clearTimeout(timeout);
    listener.close();
  }
}

/**
 * Run the out-of-band sign-in (Flow B) and return the issued API key.
 *
 * For a session with no browser of its own — SSH, a container, a CI runner. The consent
 * screen displays a code that the user types back here, so this is the one flow where the
 * user has to copy a string; it exists precisely so that no predictable address is needed.
 * `S256` is mandatory here rather than advisable: the challenge rides the authorize URL and
 * the code is read off a screen, so under `plain` the two halves of the secret would meet.
 *
 * No listener is opened, so there is nothing to leak and nothing to time out but the
 * exchange itself.
 */
export async function runOutOfBandConnectFlow(
  options: ConnectFlowOptions & { readonly readCode?: () => Promise<string | undefined> } = {},
): Promise<ExchangeResult> {
  const endpoints = resolveOrcaEndpoints();
  const pkce = createPkcePair();
  const announce = options.announce ?? true;

  const authorizeUrl = buildAuthorizeUrl({
    endpoints,
    challenge: pkce.challenge,
    state: pkce.state,
    callbackUrl: ORCA_OOB_CALLBACK,
  });

  if (announce) log.info(`Approve this sign-in in your browser:\n${authorizeUrl}`);
  presentConsentUrl(authorizeUrl, options.presentConsentUrl, announce);

  const readCode = options.readCode ?? promptForAuthorizationCode;
  const entered = await withTimeout(
    readCode(),
    LOGIN_TIMEOUT_MS,
    'The OrcaRouter sign-in timed out after five minutes.',
  );
  const code = entered?.trim();
  if (!code) {
    throw new OrcaAuthError('cancelled', 'No authorization code was entered, so no key was issued.');
  }

  return exchangeCode({ endpoints, code, verifier: pkce.verifier });
}

/** Read the displayed code from the terminal. */
async function promptForAuthorizationCode(): Promise<string | undefined> {
  const entered = await text({
    message: 'Paste the code shown on the OrcaRouter consent screen',
    validate: (value) => (value?.trim() ? undefined : 'The code is required'),
  });
  if (isCancel(entered)) return undefined;
  return entered;
}

/** Reject after `ms`, so an unanswered prompt cannot hold the process open indefinitely. */
function withTimeout<T>(work: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_resolve, reject) => {
      const timer = setTimeout(() => reject(new OrcaAuthError('cancelled', message)), ms);
      timer.unref?.();
    }),
  ]);
}

/**
 * `shannon connect` — present the two entry points, run the chosen one, and persist the
 * result.
 *
 * The choice is explicit because the two serve different users and fail differently: a
 * user who already has a key never needs a browser, and a user without one never has to
 * go and create it.
 *
 * Both modes are supported. Interactive terminals get the two-way prompt; an SSH session
 * or CI runner that has no terminal can still authenticate by passing `--pkce` (the code
 * is printed for approval on any device) or by setting the key variable, so the
 * out-of-band entry point is reachable exactly where a browser and a terminal are not
 * both available.
 */
export interface ConnectOptions {
  /** Skip the choice and go straight to the API-key prompt (`--api-key`). */
  readonly apiKeyOnly?: boolean;
  /** Skip the choice and run the browser sign-in (`--pkce`). */
  readonly pkceOnly?: boolean;
}

export async function connect(options: ConnectOptions = {}): Promise<void> {
  // Non-interactive sessions may still run the sign-in; they just cannot be prompted for
  // which of the two entry points to take.
  const interactive = !!process.stdin.isTTY && !!process.stdout.isTTY;
  if (interactive) {
    displaySplash(getVersion());
    intro('Connect to OrcaRouter');
  }

  let choice: 'pkce' | 'api-key';
  if (options.apiKeyOnly) {
    choice = 'api-key';
  } else if (options.pkceOnly) {
    choice = 'pkce';
  } else if (!interactive) {
    fail(
      "'connect' needs an interactive terminal to ask which entry point to use.",
      "Re-run with 'connect --pkce' to sign in (the browser or the printed code), or 'connect --api-key' to paste a key.",
      `For unattended use, set ${ORCAROUTER_API_KEY_ENV} instead.`,
    );
  } else {
    const selected = await select({
      message: 'How do you want to connect?',
      options: [
        { value: 'pkce' as const, label: 'Sign in with OrcaRouter', hint: 'opens your browser; issues a key' },
        {
          value: 'api-key' as const,
          label: 'OrcaRouter - API',
          hint: `paste an existing sk-orca-… key (${ORCA_API_KEYS_URL})`,
        },
      ],
    });
    if (isCancel(selected)) {
      p.cancel('Connect cancelled.');
      return;
    }
    choice = selected;
  }

  try {
    if (choice === 'api-key') {
      if (!interactive) {
        fail(
          "'connect --api-key' needs an interactive terminal to read the key.",
          `Export ${ORCAROUTER_API_KEY_ENV} instead, which is equivalent and works unattended.`,
        );
      }
      const entered = await text({
        message: 'Paste your OrcaRouter API key',
        placeholder: 'sk-orca-…',
        validate: (value) => (value?.trim() ? undefined : 'An API key is required'),
      });
      if (isCancel(entered)) {
        p.cancel('Connect cancelled.');
        return;
      }
      persist(entered, 'api-key');
      return;
    }

    const result = await runConnectFlow({ announce: interactive });
    persist(result.apiKey, 'pkce');
  } catch (error) {
    const message =
      error instanceof OrcaAuthError
        ? error.message
        : 'The OrcaRouter sign-in did not complete. Run the connect command again.';
    log.error(message);
    log.info(
      `Your existing configuration was not changed. You can also paste an API key (${ORCA_API_KEYS_URL}), or review app access at ${ORCA_AUTHORIZED_APPS_URL}.`,
    );
    process.exitCode = 1;
  }
}

/**
 * Where a credential goes, so it lands where this mode reads credentials from.
 *
 * npx mode fills gaps from `~/.shannon/config.toml`; local mode reads `./.env` and never
 * looks at that file. Writing the npx file in local mode would save a key the next scan
 * does not read, which is the difference between a connect that works and one that
 * appears to work.
 */
export function credentialStorePath(): string {
  return isLocal() ? path.resolve('.env') : getConfigFile();
}

/** Save the key and record which entry point produced it. */
function persist(apiKey: string, method: 'api-key' | 'pkce'): void {
  const trimmed = apiKey.trim();
  if (!trimmed) {
    log.error('No key was entered, so nothing was saved.');
    process.exitCode = 1;
    return;
  }

  // Stored exactly where the rest of this mode's provider credentials live: the 0o600
  // config.toml under npx, the .env dotenv file under a clone. Either way the key reaches
  // the worker through the environment, which is how every other provider credential does.
  if (getMode() === 'local') {
    upsertEnvFile(credentialStorePath(), {
      [ORCAROUTER_API_KEY_ENV]: trimmed,
      [ORCAROUTER_AUTH_METHOD_ENV]: method,
      SHANNON_AI_MODEL: `orcarouter:openai/gpt-5.5`,
    });
  } else {
    saveConfig({ core: { model: `orcarouter:openai/gpt-5.5` }, provider: { api_key: trimmed } });
  }

  process.env[ORCAROUTER_API_KEY_ENV] = trimmed;
  process.env[ORCAROUTER_AUTH_METHOD_ENV] = method;

  log.success(`OrcaRouter connected. Key ${maskOrcaKey(trimmed)} saved to ${credentialStorePath()}.`);
  log.info(
    method === 'pkce'
      ? 'Sign-in issued a key for this machine. It is reused until you revoke it — Shannon never re-authorizes on its own.'
      : 'The key is stored with the rest of your provider credentials.',
  );
  log.info(`Manage or revoke access at ${ORCA_AUTHORIZED_APPS_URL}.`);
}

/** Where this flow sends the browser. Exported so a test can assert the auth origin. */
export function connectAuthorizeOrigin(): string {
  return authUrl(resolveOrcaEndpoints(), '');
}
