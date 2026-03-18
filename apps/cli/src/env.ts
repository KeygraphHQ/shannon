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
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ROUTER_DEFAULT',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'CLAUDE_CODE_USE_VERTEX',
  'CLOUD_ML_REGION',
  'ANTHROPIC_VERTEX_PROJECT_ID',
  'GOOGLE_APPLICATION_CREDENTIALS',
  'ANTHROPIC_SMALL_MODEL',
  'ANTHROPIC_MEDIUM_MODEL',
  'ANTHROPIC_LARGE_MODEL',
  'CLAUDE_CODE_MAX_OUTPUT_TOKENS',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
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
  mode: 'api-key' | 'oauth' | 'custom-base-url' | 'bedrock' | 'vertex' | 'router';
}

/** Check if router credentials are present in the environment. */
export function isRouterConfigured(): boolean {
  return !!(process.env.ROUTER_DEFAULT && (process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY));
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
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') providers.push('Google Vertex');
  if (isRouterConfigured()) providers.push('Router');
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
    // Set auth token as API key so the SDK can initialize
    process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_AUTH_TOKEN;
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
  if (process.env.CLAUDE_CODE_USE_VERTEX === '1') {
    const missing: string[] = [];
    if (!process.env.CLOUD_ML_REGION) missing.push('CLOUD_ML_REGION');
    if (!process.env.ANTHROPIC_VERTEX_PROJECT_ID) missing.push('ANTHROPIC_VERTEX_PROJECT_ID');
    if (!process.env.ANTHROPIC_SMALL_MODEL) missing.push('ANTHROPIC_SMALL_MODEL');
    if (!process.env.ANTHROPIC_MEDIUM_MODEL) missing.push('ANTHROPIC_MEDIUM_MODEL');
    if (!process.env.ANTHROPIC_LARGE_MODEL) missing.push('ANTHROPIC_LARGE_MODEL');
    if (missing.length > 0) {
      return {
        valid: false,
        mode: 'vertex',
        error: `Vertex AI mode requires: ${missing.join(', ')}`,
      };
    }
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return {
        valid: false,
        mode: 'vertex',
        error: 'Vertex AI mode requires GOOGLE_APPLICATION_CREDENTIALS',
      };
    }
    return { valid: true, mode: 'vertex' };
  }
  if (isRouterConfigured()) {
    // Set a placeholder so the worker doesn't reject the missing key
    process.env.ANTHROPIC_API_KEY = 'router-mode';
    return { valid: true, mode: 'router' };
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
