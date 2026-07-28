/**
 * Environment variable loading and credential validation.
 *
 * Local mode: loads ./.env via dotenv.
 * NPX mode: fills gaps from ~/.shannon/config.toml (no .env).
 */

import dotenv from 'dotenv';
import { resolveConfig } from './config/resolver.js';
import { getMode } from './mode.js';

/**
 * Environment variables forwarded to worker containers.
 *
 * SECURITY: Credential variables (API keys, OAuth tokens) are NOT forwarded
 * via Docker environment variables. They would be visible to any user with
 * `docker inspect` access and to any process via `/proc/*/environ` inside the
 * container. Credentials reach the worker through the Temporal activity input
 * and Claude SDK's sdkEnv map, not through process.env passthrough.
 */
const FORWARD_VARS = [
  // Infrastructure — not credentials
  'ANTHROPIC_BASE_URL',            // Custom API endpoint URL (proxy/router)
  'ANTHROPIC_AUTH_TOKEN',          // Auth token for custom endpoint

  // Provider mode flags — not credentials
  'CLAUDE_CODE_USE_BEDROCK',       // AWS Bedrock mode flag
  'AWS_REGION',                    // AWS region (non-secret config)
  'AWS_BEARER_TOKEN_BEDROCK',      // AWS Bedrock bearer token (needed for SDK auth in container)
  'ANTHROPIC_SMALL_MODEL',         // Override small model tier
  'ANTHROPIC_MEDIUM_MODEL',        // Override medium model tier
  'ANTHROPIC_LARGE_MODEL',         // Override large model tier

  // SDK configuration — not credentials
  'CLAUDE_ADAPTIVE_THINKING',      // SDK thinking budget config
] as const;

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
 * Build `-e KEY=VALUE` flags for docker run, only for set variables.
 */
export function buildEnvFlags(): string[] {
  const flags: string[] = ['-e', 'TEMPORAL_ADDRESS=shannon-temporal:7233'];

  for (const key of FORWARD_VARS) {
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
  mode: 'api-key' | 'oauth' | 'custom-base-url' | 'bedrock';
}

/** Check if a custom Anthropic-compatible base URL is configured. */
function isCustomBaseUrlConfigured(): boolean {
  return !!(process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Detect which providers are configured via environment variables. */
function detectProviders(): string[] {
  const providers: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) providers.push('Anthropic API key');
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) providers.push('Anthropic OAuth');
  if (isCustomBaseUrlConfigured()) providers.push('Custom Base URL');
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') providers.push('AWS Bedrock');
  return providers;
}

/**
 * Validate that exactly one authentication method is configured.
 */
export function validateCredentials(): CredentialValidation {
  // Reject multiple providers
  const providers = detectProviders();
  if (providers.length > 1) {
    return {
      valid: false,
      mode: 'api-key',
      error: `Multiple providers detected: ${providers.join(', ')}. Only one provider can be active at a time.`,
    };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    return { valid: true, mode: 'api-key' };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { valid: true, mode: 'oauth' };
  }
  if (isCustomBaseUrlConfigured()) {
    return { valid: true, mode: 'custom-base-url' };
  }
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const missing: string[] = [];
    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) missing.push('AWS_BEARER_TOKEN_BEDROCK');
    if (!process.env.ANTHROPIC_SMALL_MODEL) missing.push('ANTHROPIC_SMALL_MODEL');
    if (!process.env.ANTHROPIC_MEDIUM_MODEL) missing.push('ANTHROPIC_MEDIUM_MODEL');
    if (!process.env.ANTHROPIC_LARGE_MODEL) missing.push('ANTHROPIC_LARGE_MODEL');
    if (missing.length > 0) {
      return {
        valid: false,
        mode: 'bedrock',
        error: `Bedrock mode requires: ${missing.join(', ')}`,
      };
    }
    return { valid: true, mode: 'bedrock' };
  }

  const hint =
    getMode() === 'local'
      ? `No credentials found. Set ANTHROPIC_API_KEY in .env or export it.`
      : `Authentication not configured. Export variables or run 'npx @keygraph/shannon setup'.`;
  return {
    valid: false,
    mode: 'api-key',
    error: hint,
  };
}
