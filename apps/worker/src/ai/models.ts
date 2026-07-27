// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Model selection and resolution for the pi harness.
 *
 * One model runs the entire workflow. Users name it with a single setting:
 *
 *   SHANNON_AI_MODEL=<provider>:<model-id>
 *
 * The provider half decides the endpoint, the credential, and the API dialect;
 * the model half is passed to pi's registry as-is. The separator is a colon
 * because model IDs routinely contain slashes, and it is the *first* colon that
 * splits, because Bedrock model IDs contain colons of their own
 * (`amazon-bedrock:us.anthropic.claude-opus-4-5-20251101-v1:0`).
 *
 * Resolution returns a pi `Model` plus the `ModelRuntime` that owns its auth,
 * built over an in-memory credential store primed from the environment.
 */

import type { Api, Credential, CredentialInfo, CredentialStore, Model } from '@earendil-works/pi-ai';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';

/** Providers Shannon can currently reach. Each is a pi-ai provider id. */
export const SUPPORTED_PROVIDERS = ['anthropic', 'openai', 'xai', 'google', 'amazon-bedrock'] as const;

export type ProviderId = (typeof SUPPORTED_PROVIDERS)[number];

/**
 * Env vars carrying each provider's API key, in precedence order. Shannon does not
 * invent credential names — these are the variables each provider's own tooling
 * uses. Bedrock pairs its bearer token with AWS_REGION, which is provider config
 * rather than a credential.
 */
export const PROVIDER_API_KEY_ENV: Readonly<Record<ProviderId, readonly string[]>> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  google: ['GEMINI_API_KEY'],
  'amazon-bedrock': ['AWS_BEARER_TOKEN_BEDROCK'],
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
 * Parse a `<provider>:<model-id>` spec. Splits on the first colon only, so
 * colons inside a model ID survive. Throws with the supported provider list on
 * a malformed or unknown provider.
 */
export function parseModelSpec(spec: string): ModelSpec {
  const trimmed = spec.trim();
  const separator = trimmed.indexOf(':');
  if (separator === -1) {
    throw new Error(
      `SHANNON_AI_MODEL must be "<provider>:<model-id>", got "${trimmed}". Example: ${DEFAULT_MODEL_SPEC}`,
    );
  }

  const providerId = trimmed.slice(0, separator).trim();
  const modelId = trimmed.slice(separator + 1).trim();

  if (!providerId || !modelId) {
    throw new Error(
      `SHANNON_AI_MODEL must be "<provider>:<model-id>", got "${trimmed}". Example: ${DEFAULT_MODEL_SPEC}`,
    );
  }
  if (!isSupportedProvider(providerId)) {
    throw new Error(
      `Unsupported provider "${providerId}" in SHANNON_AI_MODEL. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
  }

  return { providerId, modelId };
}

/** Resolve the run's model from SHANNON_AI_MODEL, falling back to the default. */
export function resolveModelSpec(): ModelSpec {
  return parseModelSpec(process.env.SHANNON_AI_MODEL || DEFAULT_MODEL_SPEC);
}

export interface ProviderCredentials {
  /** Endpoint override, applied whatever the provider (proxies, gateways). */
  baseUrl?: string;
  /** Runtime API key primed into the ModelRuntime's credential store. */
  apiKey?: string;
}

/** Collect the API key and optional endpoint override for a provider. */
export function resolveProviderCredentials(providerId: ProviderId): ProviderCredentials {
  const credentials: ProviderCredentials = {};

  for (const name of PROVIDER_API_KEY_ENV[providerId]) {
    const value = process.env[name];
    if (value) {
      credentials.apiKey = value;
      break;
    }
  }
  if (process.env.SHANNON_AI_BASE_URL) credentials.baseUrl = process.env.SHANNON_AI_BASE_URL;

  return credentials;
}

/**
 * In-memory credential store holding the selected provider's API key.
 *
 * pi ships the `CredentialStore` interface but no in-memory implementation — its
 * own store reads `auth.json` from disk. Shannon's credentials arrive as env vars
 * in an ephemeral container, so nothing may be read from or written to disk.
 */
class RuntimeCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, Credential>();

  constructor(providerId: string, apiKey: string | undefined) {
    if (apiKey) {
      this.credentials.set(providerId, { type: 'api_key', key: apiKey });
    }
  }

  async read(providerId: string): Promise<Credential | undefined> {
    return this.credentials.get(providerId);
  }

  async list(): Promise<readonly CredentialInfo[]> {
    return [...this.credentials].map(([providerId, credential]) => ({ providerId, type: credential.type }));
  }

  /** Serialized read-modify-write. `fn` returning undefined leaves the entry alone. */
  async modify(
    providerId: string,
    fn: (current: Credential | undefined) => Promise<Credential | undefined>,
  ): Promise<Credential | undefined> {
    const next = await fn(this.credentials.get(providerId));
    if (next !== undefined) {
      this.credentials.set(providerId, next);
    }
    return this.credentials.get(providerId);
  }

  async delete(providerId: string): Promise<void> {
    this.credentials.delete(providerId);
  }
}

/**
 * Build a ModelRuntime whose only credential is the one supplied. Model catalogs
 * stay offline (`allowModelNetwork` defaults to false) so a scan never blocks on
 * a catalog refresh.
 */
export async function createModelRuntime(providerId: string, apiKey: string | undefined): Promise<ModelRuntime> {
  return ModelRuntime.create({ credentials: new RuntimeCredentialStore(providerId, apiKey) });
}

export interface ModelSelection {
  model: Model<Api>;
  modelRuntime: ModelRuntime;
  modelId: string;
  providerId: ProviderId;
}

/**
 * Point a model descriptor at a gateway.
 *
 * OpenAI's catalogue is built for the Responses API, but a gateway advertising
 * itself as OpenAI-compatible serves chat completions, so the dialect switches
 * for those runs. The stored `compat` block describes Responses and is dropped
 * along with it: pi's own `detectCompat` then derives the completions settings
 * from the provider and the endpoint. Every other provider keeps its dialect and
 * only changes address.
 */
function pointAtGateway(model: Model<Api>, providerId: ProviderId, baseUrl: string): Model<Api> {
  if (providerId !== 'openai') return { ...model, baseUrl };

  const { compat: _responsesCompat, ...withoutCompat } = model;
  return { ...withoutCompat, baseUrl, api: 'openai-completions' };
}

/**
 * Resolve a model against a runtime.
 *
 * Direct to a provider, the model must exist in the catalogue. Behind a custom
 * endpoint it need not: a gateway may serve models under its own names, so an
 * unknown id is passed through on a descriptor borrowed from the provider's
 * catalogue for its API dialect. Cost and context window on such a descriptor
 * are the reference model's, so spend figures are approximate there.
 *
 * Returns undefined when the id is unresolvable — unknown with no endpoint
 * override, or a provider carrying no models at all.
 */
export function resolveModel(
  modelRuntime: ModelRuntime,
  providerId: ProviderId,
  modelId: string,
  baseUrl: string | undefined,
): Model<Api> | undefined {
  const found = modelRuntime.getModel(providerId, modelId);
  if (found) {
    return baseUrl ? pointAtGateway(found, providerId, baseUrl) : found;
  }
  if (!baseUrl) return undefined;

  const reference = modelRuntime.getModels(providerId)[0];
  return reference ? pointAtGateway({ ...reference, id: modelId, name: modelId }, providerId, baseUrl) : undefined;
}

/**
 * Resolve SHANNON_AI_MODEL, build a ModelRuntime primed with the provider's
 * credential, and look the model up in it.
 */
export async function resolveModelSelection(): Promise<ModelSelection> {
  const { providerId, modelId } = resolveModelSpec();
  const credentials = resolveProviderCredentials(providerId);

  const modelRuntime = await createModelRuntime(providerId, credentials.apiKey);

  const model = resolveModel(modelRuntime, providerId, modelId, credentials.baseUrl);
  if (!model) {
    throw new Error(`Model not found in pi registry: provider="${providerId}" model="${modelId}"`);
  }

  return {
    model,
    modelRuntime,
    modelId,
    providerId,
  };
}
