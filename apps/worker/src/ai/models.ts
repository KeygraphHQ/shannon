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
 * A model too new for the pinned pi release is reachable by passing its descriptor in a
 * pi `models.json` (the CLI's `--models-config`), which merges over the catalogue. The
 * credential store below outranks any `apiKey` that file carries, so it describes the
 * model while the environment still supplies the secret.
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
import { MODELS_CONFIG_PATH } from '../paths.js';

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
export const CURATED_PROVIDERS = ['anthropic', 'openai', 'xai', 'amazon-bedrock'] as const;

export type CuratedProviderId = (typeof CURATED_PROVIDERS)[number];

function isCuratedProvider(value: string): value is CuratedProviderId {
  return (CURATED_PROVIDERS as readonly string[]).includes(value);
}

/** Generic API key, honored for any provider Shannon does not curate. */
export const GENERIC_API_KEY_ENV = 'SHANNON_AI_API_KEY';

/**
 * Env vars carrying each curated provider's API key, in precedence order. Shannon
 * does not invent credential names — these are the variables each provider's own
 * tooling uses. Bedrock pairs its bearer token with AWS_REGION, which is provider
 * config rather than a credential.
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

/** Path of the mounted pi model config, or undefined when the scan supplied none. */
export function modelsConfigPath(): string | undefined {
  return existsSync(MODELS_CONFIG_PATH) ? MODELS_CONFIG_PATH : undefined;
}

/**
 * Where pi persists remote model catalogues. Pinned to the writable agent dir because pi
 * otherwise derives it from `dirname(modelsPath)`, which is a read-only mount.
 */
function modelsStorePath(): string {
  return path.join(getAgentDir(), 'models-store.json');
}

/**
 * Build a ModelRuntime whose only credential is the one supplied. Model catalogs
 * stay offline (`allowModelNetwork` defaults to false) so a scan never blocks on
 * a catalog refresh.
 *
 * `modelsPath` is always explicit, never pi's default of `<agent dir>/models.json`: with no
 * `--models-config` it is null, which switches models.json off outright, so a stray file in
 * that shared dir cannot feed model definitions to a run that did not ask for them.
 *
 * When the host's pi auth.json is present, the runtime reads it instead: pi's
 * disk-backed store resolves the credential. The mount is writable so OAuth
 * refreshes persist to the host for subsequent runs.
 */
export async function createModelRuntime(providerId: string, apiKey: string | undefined): Promise<ModelRuntime> {
  const modelsPath = modelsConfigPath();
  const modelSources = {
    modelsPath: modelsPath ?? null,
    ...(modelsPath ? { modelsStorePath: modelsStorePath() } : {}),
  };

  if (piAuthPresent()) {
    return ModelRuntime.create({ ...modelSources, authPath: piAuthPath() });
  }
  return ModelRuntime.create({ ...modelSources, credentials: new RuntimeCredentialStore(providerId, apiKey) });
}

export interface ModelSelection {
  readonly model: Model<Api>;
  readonly modelRuntime: ModelRuntime;
  readonly modelId: string;
  readonly providerId: string;
  readonly credentialSource: 'api-key' | 'pi-auth' | 'ambient';
}

/**
 * Resolve a model against a runtime, returning undefined when the id is unknown.
 *
 * The model must exist in the runtime's registry, whether or not an endpoint override
 * is in play — a base URL changes the address and nothing else. A gateway serving a
 * model under its own name, or one newer than the pinned pi release, is described in a
 * `--models-config` file, which puts a real descriptor in the registry rather than
 * guessing one from an unrelated model.
 */
export function resolveModel(
  modelRuntime: ModelRuntime,
  providerId: string,
  modelId: string,
  baseUrl: string | undefined,
): Model<Api> | undefined {
  const found = modelRuntime.getModel(providerId, modelId);
  if (!found) return undefined;

  return baseUrl ? { ...found, baseUrl } : found;
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
  if (mountedPiAuth) {
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
