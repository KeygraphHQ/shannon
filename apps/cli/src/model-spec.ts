/**
 * Parsing for the single model setting, `SHANNON_AI_MODEL=<provider>:<model-id>`.
 *
 * Mirrors apps/worker/src/ai/models.ts. The CLI cannot import from the worker
 * package (it ships as a standalone bundle), so the provider list and the parse
 * rule are duplicated here deliberately and must stay in sync.
 */

/**
 * Providers Shannon curates with their own credential variables, config sections,
 * and setup flows. Any other pi provider is reachable via the generic credential
 * path. Mirrors CURATED_PROVIDERS in apps/worker/src/ai/models.ts.
 */
export const CURATED_PROVIDERS = ['anthropic', 'openai', 'xai', 'amazon-bedrock'] as const;

export type CuratedProviderId = (typeof CURATED_PROVIDERS)[number];

export function isCuratedProvider(value: string): value is CuratedProviderId {
  return (CURATED_PROVIDERS as readonly string[]).includes(value);
}

/** Generic API key, honored for any provider Shannon does not curate. Mirrors the worker. */
export const GENERIC_API_KEY_ENV = 'SHANNON_AI_API_KEY';

/**
 * Env vars carrying each curated provider's API key, in precedence order. Any one of
 * them satisfies the provider. Mirrors PROVIDER_API_KEY_ENV in apps/worker/src/ai/models.ts.
 */
export const PROVIDER_API_KEY_ENV: Readonly<Record<CuratedProviderId, readonly string[]>> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  'amazon-bedrock': ['AWS_BEARER_TOKEN_BEDROCK'],
};

/** Additional env vars a curated provider requires beyond its API key. All must be set. */
export const PROVIDER_EXTRA_ENV: Readonly<Record<CuratedProviderId, readonly string[]>> = {
  anthropic: [],
  openai: [],
  xai: [],
  'amazon-bedrock': ['AWS_REGION'],
};

/** Human-readable credential requirement, used in "nothing configured" errors. */
export const PROVIDER_CREDENTIAL_HINT: Readonly<Record<CuratedProviderId, string>> = {
  anthropic: 'ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN)',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  'amazon-bedrock': 'AWS_REGION and AWS_BEARER_TOKEN_BEDROCK',
};

/** Model used when SHANNON_AI_MODEL is unset. */
export const DEFAULT_MODEL_SPEC = 'anthropic:claude-sonnet-4-6';

export interface ModelSpec {
  providerId: string;
  modelId: string;
}

/**
 * Parse a `<provider>:<model-id>` spec. Splits on the first colon only, so colons
 * inside a model ID survive (`amazon-bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`).
 * The provider id is passed through as given — the worker's preflight validates it
 * against pi. Returns an error string rather than throwing, for the CLI's flow.
 */
export function parseModelSpec(spec: string): ModelSpec | string {
  const trimmed = spec.trim();
  const separator = trimmed.indexOf(':');
  const malformed = `SHANNON_AI_MODEL must be "<provider>:<model-id>", got "${trimmed}". Example: ${DEFAULT_MODEL_SPEC}`;
  if (separator === -1) return malformed;

  const providerId = trimmed.slice(0, separator).trim();
  const modelId = trimmed.slice(separator + 1).trim();
  if (!providerId || !modelId) return malformed;

  return { providerId, modelId };
}

/** Resolve the run's model spec from the environment, or an error string. */
export function resolveModelSpec(): ModelSpec | string {
  return parseModelSpec(process.env.SHANNON_AI_MODEL || DEFAULT_MODEL_SPEC);
}
