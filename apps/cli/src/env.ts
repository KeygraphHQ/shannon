/**
 * Environment variable loading and credential validation.
 *
 * Local mode: loads ./.env via dotenv.
 * NPX mode: fills gaps from ~/.shannon/config.toml (no .env).
 */

import dotenv from 'dotenv';
import { resolveConfig } from './config/resolver.js';
import { getMode } from './mode.js';

/** Environment variables forwarded to worker containers. */
const FORWARD_VARS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'OPENAI_SMALL_MODEL',
  'OPENAI_MEDIUM_MODEL',
  'OPENAI_LARGE_MODEL',
  'ANTHROPIC_SMALL_MODEL',
  'ANTHROPIC_MEDIUM_MODEL',
  'ANTHROPIC_LARGE_MODEL',
  'SHANNON_SMALL_MODEL',
  'SHANNON_MEDIUM_MODEL',
  'SHANNON_LARGE_MODEL',
  'CLAUDE_ADAPTIVE_THINKING',
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
  mode: 'openai' | 'api-key' | 'oauth' | 'custom-base-url' | 'bedrock';
}

/** Check whether any custom Anthropic-compatible endpoint setting is present. */
function hasCustomBaseUrlConfiguration(): boolean {
  return !!(process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Detect which providers are configured via environment variables. */
export function detectProviders(): string[] {
  const providers: string[] = [];
  if (process.env.OPENAI_API_KEY) providers.push('OpenAI API key');
  if (process.env.ANTHROPIC_API_KEY) providers.push('Anthropic API key');
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) providers.push('Anthropic OAuth');
  if (hasCustomBaseUrlConfiguration()) providers.push('Custom Base URL');
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

  if (process.env.OPENAI_API_KEY) {
    return { valid: true, mode: 'openai' };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { valid: true, mode: 'api-key' };
  }
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    return { valid: true, mode: 'oauth' };
  }
  if (hasCustomBaseUrlConfiguration()) {
    const missing: string[] = [];
    if (!process.env.ANTHROPIC_BASE_URL) missing.push('ANTHROPIC_BASE_URL');
    if (!process.env.ANTHROPIC_AUTH_TOKEN) missing.push('ANTHROPIC_AUTH_TOKEN');
    if (missing.length > 0) {
      return {
        valid: false,
        mode: 'custom-base-url',
        error: `Custom Base URL mode requires: ${missing.join(', ')}`,
      };
    }
    return { valid: true, mode: 'custom-base-url' };
  }
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    const missing: string[] = [];
    if (!process.env.AWS_REGION) missing.push('AWS_REGION');
    if (!process.env.AWS_BEARER_TOKEN_BEDROCK) missing.push('AWS_BEARER_TOKEN_BEDROCK');
    for (const tier of ['SMALL', 'MEDIUM', 'LARGE'] as const) {
      if (!process.env[`ANTHROPIC_${tier}_MODEL`] && !process.env[`SHANNON_${tier}_MODEL`]) {
        missing.push(`ANTHROPIC_${tier}_MODEL or SHANNON_${tier}_MODEL`);
      }
    }
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
      ? `No credentials found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY in .env (or export one).`
      : `Authentication not configured. Export variables or run 'npx @keygraph/shannon setup'.`;
  return {
    valid: false,
    mode: 'api-key',
    error: hint,
  };
}
