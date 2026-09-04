/**
 * Configuration resolver with environment-first, TOML-fallback precedence.
 *
 * Priority: process.env > ~/.shannon/config.toml
 * Env var names match .env.example exactly; TOML uses nested sections.
 */

import fs from 'node:fs';
import { parse as parseTOML } from 'smol-toml';
import { fail } from '../errors.js';
import { getConfigFile } from '../home.js';
import { getMode } from '../mode.js';
import {
  type CuratedProviderId,
  DEFAULT_MODEL_SPEC,
  GENERIC_API_KEY_ENV,
  isCuratedProvider,
  PROVIDER_API_KEY_ENV,
  parseModelSpec,
} from '../model-spec.js';

// === TOML ↔ Env Mapping ===

type TOMLType = 'string' | 'number' | 'boolean';

interface ConfigMapping {
  readonly env: string;
  readonly toml: string;
  readonly type: TOMLType;
  readonly boolFormat?: 'numeric' | 'literal';
}

/** Maps every supported env var to its TOML path (section.key) and expected type. */
const CONFIG_MAP: readonly ConfigMapping[] = [
  // Core — base_url points any provider at a proxy or gateway
  { env: 'SHANNON_AI_MODEL', toml: 'core.model', type: 'string' },
  { env: 'SHANNON_AI_BASE_URL', toml: 'core.base_url', type: 'string' },

  // Anthropic
  { env: 'ANTHROPIC_API_KEY', toml: 'anthropic.api_key', type: 'string' },
  { env: 'CLAUDE_CODE_OAUTH_TOKEN', toml: 'anthropic.oauth_token', type: 'string' },

  // OpenAI
  { env: 'OPENAI_API_KEY', toml: 'openai.api_key', type: 'string' },

  // xAI
  { env: 'XAI_API_KEY', toml: 'xai.api_key', type: 'string' },

  // Bedrock
  { env: 'AWS_REGION', toml: 'bedrock.region', type: 'string' },
  { env: 'AWS_BEARER_TOKEN_BEDROCK', toml: 'bedrock.token', type: 'string' },

  // Generic — credential for any provider Shannon does not curate
  { env: GENERIC_API_KEY_ENV, toml: 'provider.api_key', type: 'string' },

  // Antigravity
  { env: 'ANTIGRAVITY_PROXY_URL', toml: 'antigravity.proxy_url', type: 'string' },
  { env: 'ANTIGRAVITY_API_KEY', toml: 'antigravity.api_key', type: 'string' },
] as const;

/** TOML section holding each curated provider's credentials, keyed by provider id. */
const PROVIDER_SECTIONS: Readonly<Record<CuratedProviderId, string>> = {
  anthropic: 'anthropic',
  openai: 'openai',
  xai: 'xai',
  'amazon-bedrock': 'bedrock',
  antigravity: 'antigravity',
};

/** TOML section holding the generic credential for uncurated providers. */
const GENERIC_PROVIDER_SECTION = 'provider';

// === TOML Parsing ===

type TOMLValue = string | number | boolean;
type TOMLSection = Record<string, TOMLValue>;
type TOMLConfig = Record<string, TOMLSection>;

/** Read a nested TOML value for a given mapping. */
function getTomlValue(config: TOMLConfig, mapping: ConfigMapping): string | undefined {
  const [section, key] = mapping.toml.split('.');
  if (!section || !key) return undefined;

  const sectionObj = config[section];
  if (!sectionObj || typeof sectionObj !== 'object') return undefined;

  const value = sectionObj[key];
  if (value === undefined || value === null) return undefined;

  if (typeof value === 'boolean') {
    if (mapping.boolFormat === 'literal') return value ? 'true' : 'false';
    return value ? '1' : '0';
  }

  return String(value);
}

/** Parse the global TOML config file, returning null if it doesn't exist. */
function loadTOML(): TOMLConfig | null {
  const configPath = getConfigFile();
  if (!fs.existsSync(configPath)) return null;

  // Config contains secrets — refuse to read if group or others have any access.
  // Skip on Windows where POSIX permissions are not supported.
  if (process.platform !== 'win32') {
    const mode = fs.statSync(configPath).mode;
    if (mode & 0o077) {
      const actual = (mode & 0o777).toString(8).padStart(3, '0');
      fail(
        `Your config file is readable by other users on this machine (${actual}). Lock it down: chmod 600 ${configPath}`,
      );
    }
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseTOML(content) as TOMLConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail(`Failed to parse ${configPath}: ${message}`, `Run 'npx @keygraph/shannon setup' to reconfigure.`);
  }
}

// === Validation ===

/** Build a lookup of allowed keys per section from CONFIG_MAP. */
function buildSchema(): Map<string, Map<string, TOMLType>> {
  const schema = new Map<string, Map<string, TOMLType>>();
  for (const mapping of CONFIG_MAP) {
    const [section, key] = mapping.toml.split('.');
    if (!section || !key) continue;

    let keys = schema.get(section);
    if (!keys) {
      keys = new Map();
      schema.set(section, keys);
    }
    keys.set(key, mapping.type);
  }
  return schema;
}

/**
 * Check that the section backing the selected provider carries a usable
 * credential. `core.model` names the provider, so only that section is required;
 * other providers' sections are ignored and never forwarded. An uncurated
 * provider draws its credential from the generic [provider] section.
 */
function validateProviderFields(config: TOMLConfig, providerId: string, errors: string[]): void {
  if (!isCuratedProvider(providerId)) {
    const section = config[GENERIC_PROVIDER_SECTION] as Record<string, unknown> | undefined;
    if (!section || !Object.keys(section).includes('api_key')) {
      errors.push(`[${GENERIC_PROVIDER_SECTION}] requires api_key for provider "${providerId}"`);
    }
    return;
  }

  const sectionName = PROVIDER_SECTIONS[providerId];
  const section = config[sectionName] as Record<string, unknown> | undefined;
  const keys = section ? Object.keys(section) : [];

  if (providerId === 'amazon-bedrock') {
    const missing = ['region', 'token'].filter((k) => !keys.includes(k));
    if (missing.length > 0) {
      errors.push(`[bedrock] missing required keys: ${missing.join(', ')}`);
    }
    return;
  }

  if (providerId === 'anthropic') {
    if (!keys.includes('api_key') && !keys.includes('oauth_token')) {
      errors.push('[anthropic] requires either api_key or oauth_token');
    }
    return;
  }

  if (!keys.includes('api_key')) {
    errors.push(`[${sectionName}] requires api_key`);
  }
}

/**
 * Validate a parsed TOML config against the known schema.
 * Returns an array of human-readable error messages (empty = valid).
 */
function validateConfig(config: TOMLConfig): string[] {
  const schema = buildSchema();
  const errors: string[] = [];

  for (const [section, sectionObj] of Object.entries(config)) {
    // 1. Reject unknown sections
    const allowedKeys = schema.get(section);
    if (!allowedKeys) {
      const known = [...schema.keys()].join(', ');
      errors.push(`Unknown section [${section}]. Valid sections: ${known}`);
      continue;
    }

    // 2. Section value must be a table
    if (!sectionObj || typeof sectionObj !== 'object') {
      errors.push(`[${section}] must be a table, got ${typeof sectionObj}`);
      continue;
    }

    // 3. Validate each key in the section
    for (const [key, value] of Object.entries(sectionObj as Record<string, unknown>)) {
      const expectedType = allowedKeys.get(key);
      if (!expectedType) {
        const known = [...allowedKeys.keys()].join(', ');
        errors.push(`Unknown key "${key}" in [${section}]. Valid keys: ${known}`);
        continue;
      }

      if (typeof value !== expectedType) {
        errors.push(`[${section}].${key} must be ${expectedType}, got ${typeof value}`);
        continue;
      }

      // Reject empty strings — they pass type checks but are never useful
      if (typeof value === 'string' && value.trim() === '') {
        errors.push(`[${section}].${key} must not be empty`);
      }
    }
  }

  // 4. core.model must parse and name a supported provider
  const modelValue = config.core?.model;
  if (modelValue !== undefined && typeof modelValue !== 'string') {
    return errors;
  }
  const spec = parseModelSpec(modelValue || DEFAULT_MODEL_SPEC);
  if (typeof spec === 'string') {
    errors.push(`[core].model — ${spec}`);
    return errors;
  }

  // 5. The selected provider's section must carry a credential
  validateProviderFields(config, spec.providerId, errors);

  return errors;
}

function assertNoCredentialConflict(toml: TOMLConfig): void {
  const tomlBaseUrl = typeof toml.core?.base_url === 'string' ? toml.core.base_url : undefined;
  if (!tomlBaseUrl || process.env.SHANNON_AI_BASE_URL) return;

  const tomlModel = typeof toml.core?.model === 'string' ? toml.core.model : DEFAULT_MODEL_SPEC;
  const spec = parseModelSpec(process.env.SHANNON_AI_MODEL ?? tomlModel);
  if (typeof spec === 'string' || !isCuratedProvider(spec.providerId)) return;

  for (const envVar of PROVIDER_API_KEY_ENV[spec.providerId]) {
    const mapping = CONFIG_MAP.find((entry) => entry.env === envVar);
    const tomlHasCredential = mapping ? getTomlValue(toml, mapping) !== undefined : false;
    const envHasCredential = Boolean(process.env[envVar]);
    if (!envHasCredential && !tomlHasCredential) continue;

    if (envHasCredential) {
      fail(
        `${envVar} in your environment conflicts with the gateway credential in config.toml (core.base_url = ${tomlBaseUrl}).`,
        `Unset ${envVar}, or set SHANNON_AI_BASE_URL to override both from the environment.`,
      );
    }
    return;
  }
}

// === Public API ===

/**
 * Resolve all config values into process.env (npx mode only).
 *
 * For each mapped variable: if not already set in the environment,
 * look it up in ~/.shannon/config.toml and inject it into process.env.
 * Local mode uses .env exclusively — TOML is skipped.
 * Exits with an error if the TOML contains unknown or invalid keys, or if an
 * ambient credential conflicts with a TOML-configured gateway credential.
 */
export function resolveConfig(): void {
  if (getMode() === 'local') return;

  const toml = loadTOML();
  if (!toml) return;

  // Validate before injecting
  const errors = validateConfig(toml);
  if (errors.length > 0) {
    fail(
      'Invalid configuration:',
      ...errors.map((err) => `  - ${err}`),
      `Run 'npx @keygraph/shannon setup' to reconfigure.`,
    );
  }

  assertNoCredentialConflict(toml);

  for (const mapping of CONFIG_MAP) {
    if (process.env[mapping.env]) continue;

    const value = getTomlValue(toml, mapping);
    if (value) {
      process.env[mapping.env] = value;
    }
  }
}
