/**
 * Configuration resolver with environment-first, TOML-fallback precedence.
 *
 * Priority: process.env > ~/.shannon/config.toml
 * Env var names match .env.example exactly; TOML uses nested sections.
 */

import fs from 'node:fs';
import { parse as parseTOML } from 'smol-toml';
import { getConfigFile } from '../home.js';
import { getMode } from '../mode.js';

// === TOML ↔ Env Mapping ===

type TOMLType = 'string' | 'number' | 'boolean';
type ProviderSection = 'openai' | 'anthropic' | 'custom_base_url' | 'bedrock';

interface ConfigMapping {
  readonly env: string;
  readonly toml: string;
  readonly type: TOMLType;
  readonly boolFormat?: 'numeric' | 'literal';
  readonly provider?: ProviderSection;
}

/** Maps every supported env var to its TOML path (section.key) and expected type. */
const CONFIG_MAP: readonly ConfigMapping[] = [
  // Core
  { env: 'CLAUDE_ADAPTIVE_THINKING', toml: 'core.adaptive_thinking', type: 'boolean', boolFormat: 'literal' },

  // OpenAI
  { env: 'OPENAI_API_KEY', toml: 'openai.api_key', type: 'string', provider: 'openai' },

  // Anthropic
  { env: 'ANTHROPIC_API_KEY', toml: 'anthropic.api_key', type: 'string', provider: 'anthropic' },
  { env: 'CLAUDE_CODE_OAUTH_TOKEN', toml: 'anthropic.oauth_token', type: 'string', provider: 'anthropic' },

  // Bedrock
  { env: 'CLAUDE_CODE_USE_BEDROCK', toml: 'bedrock.use', type: 'boolean', provider: 'bedrock' },
  { env: 'AWS_REGION', toml: 'bedrock.region', type: 'string', provider: 'bedrock' },
  { env: 'AWS_BEARER_TOKEN_BEDROCK', toml: 'bedrock.token', type: 'string', provider: 'bedrock' },

  // Custom Base URL
  { env: 'ANTHROPIC_BASE_URL', toml: 'custom_base_url.base_url', type: 'string', provider: 'custom_base_url' },
  { env: 'ANTHROPIC_AUTH_TOKEN', toml: 'custom_base_url.auth_token', type: 'string', provider: 'custom_base_url' },

  // Provider-neutral model tiers. Provider-specific environment variables still
  // take precedence in the worker.
  { env: 'SHANNON_SMALL_MODEL', toml: 'models.small', type: 'string' },
  { env: 'SHANNON_MEDIUM_MODEL', toml: 'models.medium', type: 'string' },
  { env: 'SHANNON_LARGE_MODEL', toml: 'models.large', type: 'string' },
] as const;

/** Provider sections selected by authentication values already present in the shell. */
function explicitProviderSections(): Set<ProviderSection> {
  const providers = new Set<ProviderSection>();
  if (process.env.OPENAI_API_KEY) providers.add('openai');
  if (process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN) providers.add('anthropic');
  if (process.env.ANTHROPIC_BASE_URL || process.env.ANTHROPIC_AUTH_TOKEN) providers.add('custom_base_url');
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') providers.add('bedrock');
  return providers;
}

// === TOML Parsing ===

type TOMLValue = string | number | boolean;
type TOMLSection = Record<string, TOMLValue>;
type TOMLConfig = Record<string, TOMLSection>;

function configuredProviderSection(config: TOMLConfig): ProviderSection | undefined {
  const providers = (['openai', 'anthropic', 'custom_base_url', 'bedrock'] as const).filter((section) => {
    const value = config[section];
    return value && typeof value === 'object';
  });
  return providers.length === 1 ? providers[0] : undefined;
}

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
      console.error(
        `\nYour config file is readable by other users on this machine (${actual}). Lock it down: chmod 600 ${configPath}\n`,
      );
      process.exit(1);
    }
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return parseTOML(content) as TOMLConfig;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFailed to parse ${configPath}: ${message}`);
    console.error(`\nRun 'npx @keygraph/shannon setup' to reconfigure.\n`);
    process.exit(1);
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

/** Check that a provider section has all required fields and dependencies. */
function validateProviderFields(config: TOMLConfig, provider: string, errors: string[]): void {
  const section = config[provider] as Record<string, unknown> | undefined;
  if (!section) return;
  const keys = Object.keys(section);

  switch (provider) {
    case 'openai':
      if (!keys.includes('api_key')) {
        errors.push('[openai] requires api_key');
      }
      break;

    case 'anthropic':
      if (!keys.includes('api_key') && !keys.includes('oauth_token')) {
        errors.push('[anthropic] requires either api_key or oauth_token');
      } else if (keys.includes('api_key') && keys.includes('oauth_token')) {
        errors.push('[anthropic] must configure only one of api_key or oauth_token');
      }
      break;

    case 'custom_base_url': {
      const required = ['base_url', 'auth_token'];
      const missing = required.filter((k) => !keys.includes(k));
      if (missing.length > 0) {
        errors.push(`[custom_base_url] missing required keys: ${missing.join(', ')}`);
      }
      break;
    }

    case 'bedrock': {
      const required = ['use', 'region', 'token'];
      const missing = required.filter((k) => !keys.includes(k));
      if (missing.length > 0) {
        errors.push(`[bedrock] missing required keys: ${missing.join(', ')}`);
      }
      validateModelTiers(config, 'bedrock', errors);
      break;
    }
  }
}

/** Bedrock requires a [models] section with all three tiers. */
function validateModelTiers(config: TOMLConfig, provider: string, errors: string[]): void {
  const models = config.models as Record<string, unknown> | undefined;
  if (!models || typeof models !== 'object') {
    errors.push(`[${provider}] requires a [models] section with small, medium, and large`);
    return;
  }

  const required = ['small', 'medium', 'large'];
  const missing = required.filter((k) => !Object.keys(models).includes(k));
  if (missing.length > 0) {
    errors.push(`[models] missing required keys for ${provider}: ${missing.join(', ')}`);
  }
}

/**
 * Validate a parsed TOML config against the known schema.
 * Returns an array of human-readable error messages (empty = valid).
 */
export function validateConfig(config: TOMLConfig): string[] {
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

  // 4. Only one provider section allowed. Empty provider sections are still
  // present so the required-field checks can fail closed.
  const PROVIDER_SECTIONS = ['openai', 'anthropic', 'custom_base_url', 'bedrock'] as const;
  const present = PROVIDER_SECTIONS.filter((s) => {
    const section = config[s];
    return section && typeof section === 'object';
  });
  if (present.length > 1) {
    errors.push(
      `Multiple providers configured: [${present.join('], [')}]. Only one provider section is allowed at a time`,
    );
  }

  // 5. Required fields per provider
  const singleProvider = present.length === 1 ? present[0] : undefined;
  if (singleProvider) {
    validateProviderFields(config, singleProvider, errors);
  }

  return errors;
}

/** Inject validated TOML values without overriding an explicit shell provider. */
export function applyConfigToEnvironment(toml: TOMLConfig): void {
  const explicitProviders = explicitProviderSections();
  const selectedProvider = explicitProviders.size === 1 ? [...explicitProviders][0] : undefined;
  const savedProvider = configuredProviderSection(toml);
  const skipSavedModels =
    explicitProviders.size > 0 &&
    (!selectedProvider || (savedProvider !== undefined && savedProvider !== selectedProvider));

  for (const mapping of CONFIG_MAP) {
    if (process.env[mapping.env]) continue;

    if (mapping.provider && explicitProviders.size > 0) {
      // Never combine a shell-selected provider with credentials saved for a
      // different provider. If the shell itself conflicts, inject no saved
      // provider values and let credential validation report that conflict.
      if (!selectedProvider || mapping.provider !== selectedProvider) continue;

      // Anthropic's two fields are alternative authentication methods, not
      // complementary fields. A shell-selected method must not gain the other
      // method from TOML. Bedrock and custom endpoints, by contrast, may safely
      // fill their remaining same-provider fields from TOML.
      if (selectedProvider === 'anthropic') continue;
    }

    // Model keys are syntactically provider-neutral, but their values are model
    // IDs chosen for the provider saved in this TOML file. Do not leak them into
    // a different provider selected by the shell.
    if (mapping.toml.startsWith('models.') && skipSavedModels) continue;

    const value = getTomlValue(toml, mapping);
    if (value) {
      process.env[mapping.env] = value;
    }
  }
}

// === Public API ===

/**
 * Resolve all config values into process.env (npx mode only).
 *
 * For each mapped variable: if not already set in the environment,
 * look it up in ~/.shannon/config.toml and inject it into process.env.
 * Local mode uses .env exclusively — TOML is skipped.
 * Exits with an error if the TOML contains unknown or invalid keys.
 */
export function resolveConfig(): void {
  if (getMode() === 'local') return;

  const toml = loadTOML();
  if (!toml) return;

  // Validate before injecting
  const errors = validateConfig(toml);
  if (errors.length > 0) {
    console.error('\nInvalid configuration:');
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    console.error(`\nRun 'npx @keygraph/shannon setup' to reconfigure.\n`);
    process.exit(1);
  }

  applyConfigToEnvironment(toml);
}
