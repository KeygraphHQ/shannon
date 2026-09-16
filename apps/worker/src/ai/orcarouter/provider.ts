// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OrcaRouter as a first-class provider in the harness registry.
 *
 * The inference wire format is OpenAI-compatible, so the provider is registered as an
 * `openai-completions` endpoint on the inference origin. That is a deliberate choice
 * over pi's builtin `openai` provider: the builtin dispatches on the *provider* rather
 * than on `model.api` and therefore always speaks Responses, while a gateway reached
 * through it would have been forced onto one dialect.
 *
 * The registered catalogue is built from the live `GET /models` response, so the model
 * list a run can select is the list that workspace can actually call. Discovery failure
 * falls back to the verified seed rather than to an empty registry — an outage must
 * degrade the catalog, not make the provider look like it has no models.
 *
 * Credentials arrive through `credentials.ts`; nothing here reads a key, logs one, or
 * decides which entry point produced it.
 */

import type { Api, OpenAICompletionsCompat } from '@earendil-works/pi-ai';
import { openAICompletionsApi } from '@earendil-works/pi-ai/api/openai-completions.lazy';
import type { ModelRuntime, ProviderConfig } from '@earendil-works/pi-coding-agent';
import { filterCatalog, loadOrcaCatalog, type OrcaCatalogModel, type OrcaCatalogResult, toPiInput } from './catalog.js';
import {
  ORCAROUTER_API_KEY_ENV,
  ORCAROUTER_API_KEY_ENV_ALIASES,
  type OrcaCredential,
  type OrcaCredentialSource,
  type OrcaEnv,
  resolveOrcaCredential,
} from './credentials.js';
import { type OrcaEndpoints, resolveOrcaEndpoints } from './endpoints.js';

/**
 * The registration shape `ModelRuntime.registerProvider` accepts. pi does not export the
 * input type directly, so it is taken from the method signature itself.
 */
export type RegisterableProviderConfig = Parameters<ModelRuntime['registerProvider']>[1];

/** Provider id used in `SHANNON_AI_MODEL`, e.g. `orcarouter:openai/gpt-5.5`. */
export const ORCAROUTER_PROVIDER_ID = 'orcarouter';

/** Label shown in status output and errors. */
export const ORCAROUTER_PROVIDER_NAME = 'OrcaRouter';

/** API dialect every OrcaRouter model is registered under. */
export const ORCAROUTER_API: Api = 'openai-completions';

/** Cost metadata. OrcaRouter bills the user's own account, so pi is not a cost oracle here. */
const ZERO_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } as const;

/**
 * Compatibility flags for an OpenAI-compatible gateway.
 *
 * Stated explicitly rather than auto-detected from the URL, because the detection is
 * keyed on known vendor hostnames and a self-hosted OrcaRouter origin is not one of
 * them. These are the conservative values: no `store`, the `system` role rather than
 * `developer`, `max_completion_tokens`, and usage reported in streaming responses.
 */
export const ORCAROUTER_COMPAT: OpenAICompletionsCompat = {
  supportsStore: false,
  supportsDeveloperRole: false,
  supportsReasoningEffort: true,
  supportsUsageInStreaming: true,
  supportsFinishReason: true,
  maxTokensField: 'max_completion_tokens',
  thinkingFormat: 'openai',
};

/** Map one catalog entry onto the descriptor shape the registry accepts. */
export function toProviderModel(model: OrcaCatalogModel): NonNullable<ProviderConfig['models']>[number] {
  return {
    id: model.id,
    name: model.name,
    api: ORCAROUTER_API,
    reasoning: model.reasoning,
    ...(model.thinkingLevelMap ? { thinkingLevelMap: model.thinkingLevelMap } : {}),
    input: toPiInput(model.inputModalities),
    cost: { ...ZERO_COST },
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    compat: ORCAROUTER_COMPAT,
  };
}

export interface OrcaProviderConfig {
  readonly endpoints: OrcaEndpoints;
  readonly models: readonly OrcaCatalogModel[];
}

/**
 * Build the extension registration. `apiKey` names the environment variable pi resolves
 * the credential from, so the secret stays in the environment and never enters a
 * descriptor, a log line, or a serialized config.
 */
export function createOrcaProvider(config: OrcaProviderConfig): RegisterableProviderConfig {
  return {
    name: ORCAROUTER_PROVIDER_NAME,
    baseUrl: config.endpoints.apiBaseUrl,
    api: ORCAROUTER_API,
    apiKey: `$${ORCAROUTER_API_KEY_ENV}`,
    authHeader: true,
    models: config.models.map(toProviderModel),
    streamSimple: openAICompletionsApi().streamSimple,
  };
}

export interface PrepareOrcaProviderOptions {
  readonly env?: OrcaEnv;
  /** Overrides how the credential is read. Tests inject one; production uses the seam. */
  readonly credential?: OrcaCredentialSource;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
  /** Overrides the capability the catalog is read for. Defaults to `chat`. */
  readonly capability?: 'chat' | 'embedding' | 'image' | 'video' | 'rerank';
}

export interface PreparedOrcaProvider {
  readonly config: RegisterableProviderConfig;
  readonly credential: OrcaCredential;
  /** `live` when the registered catalogue came from the API, `seed` when it did not. */
  readonly catalogSource: OrcaCatalogResult['source'];
  readonly catalogReason?: OrcaCatalogResult['reason'];
  /** Number of models registered, after capability filtering. */
  readonly modelCount: number;
}

/**
 * Resolve the credential, read the catalog, and register a provider for this run.
 *
 * Returns undefined when no OrcaRouter credential is present, which is how a caller
 * distinguishes "OrcaRouter was not chosen" from "OrcaRouter failed".
 */
export async function prepareOrcaProvider(
  options: PrepareOrcaProviderOptions = {},
): Promise<PreparedOrcaProvider | undefined> {
  const env = options.env ?? (process.env as OrcaEnv);
  const credential = options.credential ? options.credential(env) : resolveOrcaCredential(env);
  if (!credential) return undefined;

  const endpoints = resolveOrcaEndpoints(env as NodeJS.ProcessEnv);
  const capability = options.capability ?? 'chat';
  const catalog = await loadOrcaCatalog({
    endpoints,
    apiKey: credential.apiKey,
    capability,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  // The endpoint filters coarsely and the seed carries every capability, so the
  // client's own rule is applied to both: a model is offered only when its declared
  // endpoint types prove this adapter can speak to it.
  const models = filterCatalog(catalog.models, { capability });

  const prepared: PreparedOrcaProvider = {
    config: createOrcaProvider({ endpoints, models }),
    credential,
    catalogSource: catalog.source,
    ...(catalog.reason ? { catalogReason: catalog.reason } : {}),
    modelCount: models.length,
  };
  return prepared;
}

/**
 * Adopt a key supplied under any accepted alias into `ORCAROUTER_API_KEY`.
 *
 * The registered provider resolves its credential from that one variable, so an alias
 * set by hand would otherwise leave a configured provider looking unconfigured. An
 * existing value is never overwritten.
 */
export function adoptOrcaEnv(env: NodeJS.ProcessEnv = process.env): void {
  if (env[ORCAROUTER_API_KEY_ENV]?.trim()) return;
  for (const alias of ORCAROUTER_API_KEY_ENV_ALIASES) {
    const value = env[alias]?.trim();
    if (value) {
      env[ORCAROUTER_API_KEY_ENV] = value;
      return;
    }
  }
}

/** Model ids as they appear in `SHANNON_AI_MODEL`, for errors and status output. */
export function orcaModelIds(models: readonly { id: string }[]): readonly string[] {
  return models.map((model) => `${ORCAROUTER_PROVIDER_ID}:${model.id}`);
}
