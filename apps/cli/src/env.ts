/**
 * Environment variable loading and credential validation.
 *
 * Local mode: loads ./.env via dotenv.
 * NPX mode: fills gaps from ~/.shannon/config.toml (no .env).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import dotenv from 'dotenv';
import { resolveConfig } from './config/resolver.js';
import { getMode } from './mode.js';
import {
  CURATED_PROVIDERS,
  type CuratedProviderId,
  GENERIC_API_KEY_ENV,
  isCuratedProvider,
  PROVIDER_API_KEY_ENV,
  PROVIDER_CREDENTIAL_HINT,
  PROVIDER_EXTRA_ENV,
  resolveModelSpec,
} from './model-spec.js';

/**
 * Variables forwarded to every worker container regardless of provider. Each is
 * forwarded only when set, so an unused one never appears in the container.
 * SHANNON_AI_API_KEY rides along because it is provider-neutral.
 */
const COMMON_FORWARD_VARS = [
  'SHANNON_AI_MODEL',
  'SHANNON_AI_BASE_URL',
  'SHANNON_AI_OPENAI_FORMAT',
  GENERIC_API_KEY_ENV,
] as const;

/**
 * Credential variables for one provider. Only the selected provider's entries are
 * forwarded, so a key for an unused provider never enters the scan container. An
 * uncurated provider has none — it relies on the common SHANNON_AI_API_KEY.
 */
function providerForwardVars(providerId: string): readonly string[] {
  if (!isCuratedProvider(providerId)) return [];
  return [...PROVIDER_API_KEY_ENV[providerId], ...PROVIDER_EXTRA_ENV[providerId]];
}

/** Parse a user-facing boolean env var: `1`/`true` (any case) true, `0`/`false`/empty false, else the default. */
export function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === '') return defaultValue;
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return defaultValue;
}

const USE_PI_AUTH_ENV = 'SHANNON_USE_PI_AUTH';

/** Where the host's auth.json is mounted: pi's standard location (worker HOME is /tmp), read natively. */
export const PI_AUTH_CONTAINER_PATH = '/tmp/.pi/agent/auth.json';

/** Host path to pi's credential file. */
export function resolveHostPiAuthPath(): string {
  return path.join(os.homedir(), '.pi', 'agent', 'auth.json');
}

export function piAuthFlagEnabled(): boolean {
  return envBool(USE_PI_AUTH_ENV, false);
}

/** Opted into pi auth via the flag, and the auth file exists to mount. */
export function shouldUsePiAuth(): boolean {
  return piAuthFlagEnabled() && fs.existsSync(resolveHostPiAuthPath());
}

/**
 * Load credentials into process.env.
 * Local mode: loads ./.env via dotenv.
 * NPX mode: fills gaps from ~/.shannon/config.toml.
 * Exported env vars always take precedence in both modes.
 */
export function loadEnv(): void {
  if (getMode() === 'local') {
    dotenv.config({ path: '.env', quiet: true });
  } else {
    resolveConfig();
  }
}

/**
 * Build `-e` flags for docker run. Forwards the common vars plus only the
 * selected provider's credentials, passed by name (`-e KEY`) so secret values
 * stay out of the `docker run` argv; docker inherits them from this process's env.
 */
export function buildEnvFlags(): string[] {
  const flags: string[] = ['-e', 'TEMPORAL_ADDRESS=shannon-temporal:7233'];

  const spec = resolveModelSpec();
  const providerVars = typeof spec === 'string' ? [] : providerForwardVars(spec.providerId);

  for (const key of [...COMMON_FORWARD_VARS, ...providerVars]) {
    if (process.env[key]) {
      flags.push('-e', key);
    }
  }

  return flags;
}

interface CredentialValidation {
  valid: boolean;
  error?: string;
}

/** Whether a curated provider has its own named credential set (API key plus any extra var). */
function hasNamedCredential(providerId: CuratedProviderId): boolean {
  const apiKeys = PROVIDER_API_KEY_ENV[providerId];
  if (!apiKeys.some((name) => Boolean(process.env[name]))) return false;
  return PROVIDER_EXTRA_ENV[providerId].every((name) => Boolean(process.env[name]));
}

/** Whether the selected provider has a credential. Bedrock needs its AWS_ vars; the generic key never stands in for it. */
function hasCredential(providerId: string): boolean {
  if (providerId === 'amazon-bedrock') return hasNamedCredential('amazon-bedrock');
  if (isCuratedProvider(providerId) && hasNamedCredential(providerId)) return true;
  return Boolean(process.env[GENERIC_API_KEY_ENV]);
}

/** Curated providers with a named credential. The generic key is neutral, so it never counts toward ambiguity. */
function configuredProviders(): CuratedProviderId[] {
  return CURATED_PROVIDERS.filter((providerId) => hasNamedCredential(providerId));
}

/**
 * Validate that the model selection parses and its provider has a credential.
 * Runs before any Docker work so mistakes fail immediately.
 */
export function validateCredentials(): CredentialValidation {
  // 1. Model selection must parse into a provider and model id
  const spec = resolveModelSpec();
  if (typeof spec === 'string') {
    return { valid: false, error: spec };
  }

  // Pi-auth: skip the API-key checks, but the host auth file must exist to mount.
  if (piAuthFlagEnabled()) {
    const authPath = resolveHostPiAuthPath();
    if (!fs.existsSync(authPath)) {
      return {
        valid: false,
        error: `${USE_PI_AUTH_ENV} is set but no pi credentials were found at ${authPath}. Authenticate with pi first.`,
      };
    }
    return { valid: true };
  }

  // 2. The selected provider must have a credential
  if (!hasCredential(spec.providerId)) {
    const requirement = isCuratedProvider(spec.providerId)
      ? PROVIDER_CREDENTIAL_HINT[spec.providerId]
      : GENERIC_API_KEY_ENV;
    const hint =
      getMode() === 'local'
        ? `Set ${requirement} in .env or export it.`
        : `Export the variables or run 'npx @keygraph/shannon setup'.`;
    return {
      valid: false,
      error: `No credentials found for provider "${spec.providerId}". ${hint}`,
    };
  }

  // 3. Exactly one provider may be configured. Several complete credentials make
  //    the scan's provider depend on SHANNON_AI_MODEL alone, which is too easy to
  //    misread as "both are in play" and too easy to redirect by editing one line.
  if (configuredProviders().length > 1) {
    return { valid: false, error: 'Credentials for more than one provider are set.' };
  }

  return { valid: true };
}
