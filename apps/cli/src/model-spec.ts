/**
 * Parsing for the single model setting, `SHANNON_AI_MODEL=<provider>:<model-id>`.
 *
 * Mirrors apps/worker/src/ai/models.ts. The CLI cannot import from the worker
 * package (it ships as a standalone bundle), so the provider list and the parse
 * rule are duplicated here deliberately and must stay in sync.
 */

/** Providers Shannon can currently reach. Each is a pi-ai provider id. */
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'xai', 'google', 'amazon-bedrock'] as const;

export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Env vars carrying each provider's API key, in precedence order. Any one of them
 * satisfies the provider. Mirrors PROVIDER_API_KEY_ENV in apps/worker/src/ai/models.ts.
 */
export const PROVIDER_API_KEY_ENV: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  'amazon-bedrock': ['AWS_BEARER_TOKEN_BEDROCK'],
};

/** Additional env vars a provider requires beyond its API key. All must be set. */
export const PROVIDER_EXTRA_ENV: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: [],
  openai: [],
  xai: [],
  google: [],
  'amazon-bedrock': ['AWS_REGION'],
};

/** Human-readable credential requirement, used in "nothing configured" errors. */
export const PROVIDER_CREDENTIAL_HINT: Readonly<Record<ProviderId, string>> = {
  anthropic: 'ANTHROPIC_API_KEY (or CLAUDE_CODE_OAUTH_TOKEN)',
  openai: 'OPENAI_API_KEY',
  xai: 'XAI_API_KEY',
  google: 'GEMINI_API_KEY',
  'amazon-bedrock': 'AWS_REGION and AWS_BEARER_TOKEN_BEDROCK',
};

/** Model used when SHANNON_AI_MODEL is unset. */
export const DEFAULT_MODEL_SPEC = 'anthropic:claude-sonnet-4-6';

export interface ModelSpec {
  providerId: ProviderId;
  modelId: string;
}

function isSupportedProvider(value: string): value is ProviderId {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Parse a `<provider>:<model-id>` spec. Splits on the first colon only, so colons
 * inside a model ID survive (`amazon-bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`).
 * Returns an error string rather than throwing, for the CLI's validation flow.
 */
export function parseModelSpec(spec: string): ModelSpec | string {
  const trimmed = spec.trim();
  const separator = trimmed.indexOf(':');
  const malformed = `SHANNON_AI_MODEL must be "<provider>:<model-id>", got "${trimmed}". Example: ${DEFAULT_MODEL_SPEC}`;
  if (separator === -1) return malformed;

  const providerId = trimmed.slice(0, separator).trim();
  const modelId = trimmed.slice(separator + 1).trim();
  if (!providerId || !modelId) return malformed;

  if (!isSupportedProvider(providerId)) {
    return `Unsupported provider "${providerId}" in SHANNON_AI_MODEL. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`;
  }
  return { providerId, modelId };
}

/** Resolve the run's model spec from the environment, or an error string. */
export function resolveModelSpec(): ModelSpec | string {
  return parseModelSpec(process.env.SHANNON_AI_MODEL || DEFAULT_MODEL_SPEC);
}
