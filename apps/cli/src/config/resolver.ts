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

interface ConfigMapping {
  readonly env: string;
  readonly toml: string;
  readonly type: TOMLType;
}

/** Maps every supported env var to its TOML path (section.key) and expected type. */
const CONFIG_MAP: readonly ConfigMapping[] = [
  // Core
  { env: 'CLAUDE_CODE_MAX_OUTPUT_TOKENS', toml: 'core.max_tokens', type: 'number' },

  // Anthropic
  { env: 'ANTHROPIC_API_KEY', toml: 'anthropic.api_key', type: 'string' },
  { env: 'CLAUDE_CODE_OAUTH_TOKEN', toml: 'anthropic.oauth_token', type: 'string' },

  // Bedrock
  { env: 'CLAUDE_CODE_USE_BEDROCK', toml: 'bedrock.use', type: 'boolean' },
  { env: 'AWS_REGION', toml: 'bedrock.region', type: 'string' },
  { env: 'AWS_BEARER_TOKEN_BEDROCK', toml: 'bedrock.token', type: 'string' },

  // Vertex
  { env: 'CLAUDE_CODE_USE_VERTEX', toml: 'vertex.use', type: 'boolean' },
  { env: 'CLOUD_ML_REGION', toml: 'vertex.region', type: 'string' },
  { env: 'ANTHROPIC_VERTEX_PROJECT_ID', toml: 'vertex.project_id', type: 'string' },
  { env: 'GOOGLE_APPLICATION_CREDENTIALS', toml: 'vertex.key_path', type: 'string' },

  // Custom Base URL
  { env: 'ANTHROPIC_BASE_URL', toml: 'custom_base_url.base_url', type: 'string' },
  { env: 'ANTHROPIC_AUTH_TOKEN', toml: 'custom_base_url.auth_token', type: 'string' },

  // Router
  { env: 'ROUTER_DEFAULT', toml: 'router.default', type: 'string' },
  { env: 'OPENAI_API_KEY', toml: 'router.openai_key', type: 'string' },
  { env: 'OPENROUTER_API_KEY', toml: 'router.openrouter_key', type: 'string' },

  // Model tiers
  { env: 'ANTHROPIC_SMALL_MODEL', toml: 'models.small', type: 'string' },
  { env: 'ANTHROPIC_MEDIUM_MODEL', toml: 'models.medium', type: 'string' },
  { env: 'ANTHROPIC_LARGE_MODEL', toml: 'models.large', type: 'string' },
] as const;

// === TOML Parsing ===

type TOMLValue = string | number | boolean;
type TOMLSection = Record<string, TOMLValue>;
type TOMLConfig = Record<string, TOMLSection>;

/** Read a nested TOML value by dotted path (e.g. "anthropic.api_key"). */
function getTomlValue(config: TOMLConfig, path: string): string | undefined {
  const [section, key] = path.split('.');
  if (!section || !key) return undefined;

  const sectionObj = config[section];
  if (!sectionObj || typeof sectionObj !== 'object') return undefined;

  const value = sectionObj[key];
  if (value === undefined || value === null) return undefined;

  // NOTE: env.ts checks bedrock/vertex via `=== '1'`, so booleans must map to "1"/"0"
  if (typeof value === 'boolean') return value ? '1' : '0';

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
      console.error(`\nInsecure permissions (${actual}) on ${configPath}. Run: chmod 600 ${configPath}\n`);
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
    case 'anthropic':
      if (!keys.includes('api_key') && !keys.includes('oauth_token')) {
        errors.push('[anthropic] requires either api_key or oauth_token');
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

    case 'vertex': {
      const required = ['use', 'region', 'project_id', 'key_path'];
      const missing = required.filter((k) => !keys.includes(k));
      if (missing.length > 0) {
        errors.push(`[vertex] missing required keys: ${missing.join(', ')}`);
      }
      validateModelTiers(config, 'vertex', errors);
      break;
    }

    case 'router': {
      if (!keys.includes('default')) {
        errors.push('[router] missing required key: default');
      }
      if (!keys.includes('openai_key') && !keys.includes('openrouter_key')) {
        errors.push('[router] requires either openai_key or openrouter_key');
      }
      const models = config.models as Record<string, unknown> | undefined;
      if (models && typeof models === 'object' && Object.keys(models).length > 0) {
        errors.push('[models] is not supported with [router]');
      }
      break;
    }
  }
}

/** Bedrock and Vertex require a [models] section with all three tiers. */
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

  // 4. Only one provider section allowed (ignore empty sections)
  const PROVIDER_SECTIONS = ['anthropic', 'custom_base_url', 'bedrock', 'vertex', 'router'] as const;
  const present = PROVIDER_SECTIONS.filter((s) => {
    const section = config[s];
    return section && typeof section === 'object' && Object.keys(section).length > 0;
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
    console.error(`\nRun 'shn setup' to reconfigure.\n`);
    process.exit(1);
  }

  for (const mapping of CONFIG_MAP) {
    if (process.env[mapping.env]) continue;

    const value = getTomlValue(toml, mapping.toml);
    if (value) {
      process.env[mapping.env] = value;
    }
  }
}
