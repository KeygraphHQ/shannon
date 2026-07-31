/**
 * Environment variable loading and credential validation.
 *
 * Local mode: loads ./.env via dotenv.
 * NPX mode: fills gaps from ~/.shannon/config.toml (no .env).
 */

import dotenv from 'dotenv';
import { resolveConfig } from './config/resolver.js';
import { getMode } from './mode.js';
import {
  PROVIDER_API_KEY_ENV,
  PROVIDER_CREDENTIAL_HINT,
  PROVIDER_EXTRA_ENV,
  type ProviderId,
  resolveModelSpec,
  SUPPORTED_PROVIDERS,
} from './model-spec.js';

/**
 * Variables forwarded to every worker container regardless of provider. Each is
 * forwarded only when set, so an unused one never appears in the container.
 */
const COMMON_FORWARD_VARS = ['SHANNON_AI_MODEL', 'SHANNON_AI_BASE_URL', 'SHANNON_AI_OPENAI_FORMAT'] as const;

/**
 * Credential variables for one provider. Only the selected provider's entries are
 * forwarded, so a key for an unused provider never enters the scan container.
 */
function providerForwardVars(providerId: ProviderId): readonly string[] {
  return [...PROVIDER_API_KEY_ENV[providerId], ...PROVIDER_EXTRA_ENV[providerId]];
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
 * Build `-e KEY=VALUE` flags for docker run. Forwards the common vars plus only
 * the selected provider's credentials.
 */
export function buildEnvFlags(): string[] {
  const flags: string[] = ['-e', 'TEMPORAL_ADDRESS=shannon-temporal:7233'];

  const spec = resolveModelSpec();
  const providerVars = typeof spec === 'string' ? [] : providerForwardVars(spec.providerId);

  for (const key of [...COMMON_FORWARD_VARS, ...providerVars]) {
    const value = process.env[key];
    if (value) {
      flags.push('-e', `${key}=${value}`);
    }
  }

  return flags;
}

interface CredentialValidation {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Whether the selected provider has a usable credential in the environment. Any
 * one API key satisfies a key-based provider; Bedrock instead needs every one of
 * its AWS_ vars.
 */
function hasCredential(providerId: ProviderId): boolean {
  const apiKeys = PROVIDER_API_KEY_ENV[providerId];
  if (apiKeys.length > 0 && !apiKeys.some((name) => Boolean(process.env[name]))) {
    return false;
  }
  return PROVIDER_EXTRA_ENV[providerId].every((name) => Boolean(process.env[name]));
}

/** Every provider that currently has a complete credential in the environment. */
function configuredProviders(): ProviderId[] {
  return SUPPORTED_PROVIDERS.filter((providerId) => hasCredential(providerId));
}

/**
 * Validate that the model selection parses and its provider has a credential.
 * Runs before any Docker work so mistakes fail immediately.
 */
export function validateCredentials(): CredentialValidation {
  // 1. Model selection must parse and name a supported provider
  const spec = resolveModelSpec();
  if (typeof spec === 'string') {
    return { valid: false, error: spec };
  }

  // 2. The selected provider must have a credential
  if (!hasCredential(spec.providerId)) {
    const hint =
      getMode() === 'local'
        ? `Set ${PROVIDER_CREDENTIAL_HINT[spec.providerId]} in .env or export it.`
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

  return { valid: true, ...anthropicCredentialWarning(spec.providerId) };
}

/**
 * De-silence the two ways an Anthropic credential surprises the user. Both are
 * warnings, not errors: the run still starts, but the operator is told what will
 * actually happen on the wire.
 *
 * - Both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN set: they authenticate
 *   differently (x-api-key vs OAuth bearer) yet share the `anthropic` provider, so
 *   the "exactly one provider" gate never fires and the API key silently wins — a
 *   run the user believes is on their subscription quietly bills API credits.
 * - A CLAUDE_CODE_OAUTH_TOKEN without the `sk-ant-oat` marker: pi recognises OAuth
 *   only by that marker, so anything else is sent as an x-api-key that
 *   api.anthropic.com rejects.
 */
function anthropicCredentialWarning(providerId: ProviderId): { warning?: string } {
  if (providerId !== 'anthropic') return {};

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;

  if (apiKey && oauthToken) {
    return {
      warning:
        'Both ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are set. ANTHROPIC_API_KEY takes precedence, ' +
        'so this scan bills API credits and the OAuth token is ignored. Unset ANTHROPIC_API_KEY to run on a ' +
        'Claude Code subscription.',
    };
  }

  if (oauthToken && !oauthToken.includes('sk-ant-oat')) {
    return {
      warning:
        'CLAUDE_CODE_OAUTH_TOKEN does not contain the "sk-ant-oat" marker, so it is sent as an API key rather ' +
        'than an OAuth token. Generate a Claude Code token with `claude setup-token`.',
    };
  }

  return {};
}
