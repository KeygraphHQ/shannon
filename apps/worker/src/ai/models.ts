// Copyright (C) 2026 Keygraph, Inc.
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
 *
 * The CLI cannot import this module (it ships as a separate bundle), so
 * `apps/cli/src/model-spec.ts` mirrors the parse rule and the provider/credential
 * tables by hand for its own `status` rendering and setup wizard. The two copies
 * have no shared compile-time link: a provider added or renamed on one side and
 * not the other does not fail to build, it just makes the CLI's guidance or
 * guard rails disagree with what the worker actually accepts at runtime.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import type { Api, Credential, CredentialInfo, CredentialStore, Model } from '@earendil-works/pi-ai';
import { getAgentDir, ModelRuntime } from '@earendil-works/pi-coding-agent';

/**
 * Providers Shannon curates with their own credential variables, config sections,
 * and setup flows. Each is a pi-ai provider id; any other pi provider is still
 * reachable through the generic credential path below.
 *
 * Kept identical to the CLI's own copy of this list (`apps/cli/src/model-spec.ts`),
 * which the CLI uses to decide whether "only one provider is configured" and to
 * gate its "Other provider" setup option. A curated provider missing from one
 * copy is silently treated as generic on that side.
 */
export const CURATED_PROVIDERS = ['anthropic', 'openai', 'xai', 'amazon-bedrock', 'antigravity'] as const;

export type CuratedProviderId = (typeof CURATED_PROVIDERS)[number];

function isCuratedProvider(value: string): value is CuratedProviderId {
  return (CURATED_PROVIDERS as readonly string[]).includes(value);
}

/** Generic API key, honored for any provider Shannon does not curate. */
export const GENERIC_API_KEY_ENV = 'SHANNON_AI_API_KEY';

/** Default local proxy endpoint for the Antigravity SDK/agent proxy. */
export const DEFAULT_ANTIGRAVITY_BASE_URL = 'http://127.0.0.1:8000/v1';

const ANTIGRAVITY_INPUT: ('text' | 'image')[] = ['text', 'image'];
const ANTIGRAVITY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function defModel(id: string, name: string, reasoning = true, maxTokens = 65536, contextWindow = 1048576) {
  return {
    id,
    name,
    contextWindow,
    maxTokens,
    reasoning,
    cost: ANTIGRAVITY_COST,
    input: ANTIGRAVITY_INPUT,
  };
}

/** Curated Antigravity model definitions and thinking-effort variants. */
export const ANTIGRAVITY_MODELS = [
  // Gemini 3.8 Flash series
  defModel('gemini-3.8-flash', 'Gemini 3.8 Flash (Default High)'),
  defModel('gemini-3.8-flash-high', 'Gemini 3.8 Flash (High Thinking)'),
  defModel('gemini-3.8-flash-medium', 'Gemini 3.8 Flash (Medium Thinking)'),
  defModel('gemini-3.8-flash-low', 'Gemini 3.8 Flash (Low Thinking)'),

  // Gemini 3.7 Flash series with thinking-level variants
  defModel('gemini-3.7-flash', 'Gemini 3.7 Flash'),
  defModel('gemini-3.7-flash-high', 'Gemini 3.7 Flash (High Thinking)'),
  defModel('gemini-3.7-flash-medium', 'Gemini 3.7 Flash (Medium Thinking)'),
  defModel('gemini-3.7-flash-low', 'Gemini 3.7 Flash (Low Thinking)'),

  // Gemini 3.1 Pro series with thinking-level variants
  defModel('gemini-3.1-pro', 'Gemini 3.1 Pro'),
  defModel('gemini-3.1-pro-preview', 'Gemini 3.1 Pro Preview'),
  defModel('gemini-3.1-pro-high', 'Gemini 3.1 Pro (High Thinking)'),
  defModel('gemini-3.1-pro-medium', 'Gemini 3.1 Pro (Medium Thinking)'),
  defModel('gemini-3.1-pro-low', 'Gemini 3.1 Pro (Low Thinking)'),

  // Gemini 2.5 series
  defModel('gemini-2.5-pro', 'Gemini 2.5 Pro'),
  defModel('gemini-2.5-flash', 'Gemini 2.5 Flash', false),
  defModel('gemini-2.5-flash-lite', 'Gemini 2.5 Flash Lite', false),

  // Default alias
  defModel('default', 'Antigravity Default (Gemini 3.8 Flash High)'),
];

/**
 * Env vars carrying each curated provider's API key, in precedence order. Shannon
 * does not invent credential names — these are the variables each provider's own
 * tooling uses. Bedrock pairs its bearer token with AWS_REGION, which is provider
 * config rather than a credential. Antigravity requires no API keys (uses SDK / proxy).
 *
 * Mirrored by the CLI's own table of the same name, used there to decide which
 * env vars to forward into the worker container. A variable added here without
 * its CLI counterpart never reaches the container: the worker looks for a
 * credential the CLI never forwarded, and preflight reports it as absent.
 */
export const PROVIDER_API_KEY_ENV: Readonly<Record<CuratedProviderId, readonly string[]>> = {
  anthropic: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN'],
  openai: ['OPENAI_API_KEY'],
  xai: ['XAI_API_KEY'],
  'amazon-bedrock': ['AWS_BEARER_TOKEN_BEDROCK'],
  antigravity: ['ANTIGRAVITY_API_KEY'],
};

/** Model used when SHANNON_AI_MODEL is unset. */
export const DEFAULT_MODEL_SPEC = 'anthropic:claude-sonnet-4-6';

/** Browsable pi model catalogue — the source of valid `<provider>:<model-id>` ids. */
export const PI_CATALOG_URL = 'https://pi.dev/models';

export interface ModelSpec {
  providerId: string;
  modelId: string;
}

/**
 * Parse a `<provider>:<model-id>` spec. Splits on the first colon only, so colons
 * inside a model ID survive. The provider id is passed through as given — pi's
 * registry validates it later — so this throws only on a malformed spec.
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

/**
 * Collect the API key and optional endpoint override for a provider. A curated
 * provider's own variables win, then the generic SHANNON_AI_API_KEY. Bedrock is
 * excluded — it authenticates through its AWS_ variables, which pi reads directly.
 */
export function resolveProviderCredentials(providerId: string): ProviderCredentials {
  const credentials: ProviderCredentials = {};

  if (providerId === 'antigravity') {
    credentials.baseUrl =
      process.env.ANTIGRAVITY_PROXY_URL || process.env.SHANNON_AI_BASE_URL || DEFAULT_ANTIGRAVITY_BASE_URL;
    credentials.apiKey = process.env.ANTIGRAVITY_API_KEY || process.env.SHANNON_AI_API_KEY || 'antigravity-local';
    return credentials;
  }

  const namedVars = isCuratedProvider(providerId) ? PROVIDER_API_KEY_ENV[providerId] : [];
  for (const name of namedVars) {
    const value = process.env[name];
    if (value) {
      credentials.apiKey = value;
      break;
    }
  }
  if (!credentials.apiKey && providerId !== 'amazon-bedrock' && process.env[GENERIC_API_KEY_ENV]) {
    credentials.apiKey = process.env[GENERIC_API_KEY_ENV];
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

/** The file pi reads credentials from: the agent dir's auth.json. */
function piAuthPath(): string {
  return path.join(getAgentDir(), 'auth.json');
}

/** Whether the host's pi credentials are mounted (auth.json present in the agent dir). */
export function piAuthPresent(): boolean {
  return existsSync(piAuthPath());
}

/**
 * Build a ModelRuntime whose only credential is the one supplied. Model catalogs
 * stay offline (`allowModelNetwork` defaults to false) so a scan never blocks on
 * a catalog refresh.
 *
 * When the host's pi auth.json is present, the runtime reads it instead: pi's
 * disk-backed store resolves the credential. The mount is writable so OAuth
 * refreshes persist to the host for subsequent runs.
 */
export async function createModelRuntime(providerId: string, apiKey: string | undefined): Promise<ModelRuntime> {
  const runtime = piAuthPresent()
    ? await ModelRuntime.create({ authPath: piAuthPath() })
    : await ModelRuntime.create({ credentials: new RuntimeCredentialStore(providerId, apiKey) });

  const antigravityBaseUrl =
    process.env.ANTIGRAVITY_PROXY_URL || process.env.SHANNON_AI_BASE_URL || DEFAULT_ANTIGRAVITY_BASE_URL;

  runtime.registerProvider('antigravity', {
    name: 'Google Antigravity',
    api: 'openai-responses',
    baseUrl: antigravityBaseUrl,
    models: ANTIGRAVITY_MODELS,
  });

  return runtime;
}

export interface ModelSelection {
  readonly model: Model<Api>;
  readonly modelRuntime: ModelRuntime;
  readonly modelId: string;
  readonly providerId: string;
  readonly credentialSource: 'api-key' | 'pi-auth' | 'ambient';
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
  providerId: string,
  modelId: string,
  baseUrl: string | undefined,
): Model<Api> | undefined {
  const found = modelRuntime.getModel(providerId, modelId);
  if (found) {
    return baseUrl ? { ...found, baseUrl } : found;
  }
  if (!baseUrl) return undefined;

  const reference = modelRuntime.getModels(providerId)[0];
  if (!reference) return undefined;

  return { ...reference, id: modelId, name: modelId, baseUrl };
}

/**
 * Resolve SHANNON_AI_MODEL, build a ModelRuntime primed with the provider's
 * credential, and look the model up in it.
 */
export async function resolveModelSelection(): Promise<ModelSelection> {
  const { providerId, modelId } = resolveModelSpec();
  const credentials = resolveProviderCredentials(providerId);

  const mountedPiAuth = piAuthPresent();
  const modelRuntime = await createModelRuntime(providerId, credentials.apiKey);

  const model = resolveModel(modelRuntime, providerId, modelId, credentials.baseUrl);
  if (!model) {
    throw new Error(
      `Model not found in pi registry: provider="${providerId}" model="${modelId}". Browse valid providers and models at ${PI_CATALOG_URL}.`,
    );
  }

  let credentialSource: ModelSelection['credentialSource'] = 'ambient';
  if (providerId === 'antigravity') {
    credentialSource = 'ambient';
  } else if (mountedPiAuth) {
    credentialSource = 'pi-auth';
  } else if (credentials.apiKey) {
    credentialSource = 'api-key';
  }

  return {
    model,
    modelRuntime,
    modelId,
    providerId,
    credentialSource,
  };
}
