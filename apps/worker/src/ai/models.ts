// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Model tier definitions and resolution for the pi harness.
 *
 * Three tiers mapped to capability levels:
 * - "small"  (Haiku — summarization, structured extraction)
 * - "medium" (Sonnet — tool use, general analysis)
 * - "large"  (Opus — deep reasoning, complex analysis)
 *
 * Users override per tier via ANTHROPIC_SMALL_MODEL / ANTHROPIC_MEDIUM_MODEL /
 * ANTHROPIC_LARGE_MODEL, which works across all providers (Anthropic, Bedrock,
 * custom base URL).
 *
 * The active provider is chosen from an injected `providerConfig` (the Pro consumer)
 * or, in OSS, from the env-var contract the CLI forwards (`CLAUDE_CODE_USE_BEDROCK`,
 * `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`, else direct Anthropic). Resolution
 * returns a pi `Model` via `ModelRegistry.find`, the `thinkingLevel`, and an
 * `AuthStorage` primed with the right credential. Bedrock authenticates from the
 * AWS_ env vars via pi-ai.
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import { AuthStorage, type ModelRegistry } from '@earendil-works/pi-coding-agent';
import type { ProviderConfig } from '../types/config.js';

export type ModelTier = 'small' | 'medium' | 'large';

const DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  small: 'claude-haiku-4-5-20251001',
  medium: 'claude-sonnet-4-6',
  large: 'claude-opus-4-8',
};

interface EffectiveProvider {
  /** pi-ai provider id: 'anthropic' or 'amazon-bedrock'. */
  providerId: string;
  /** Custom-base-URL override applied to the resolved anthropic model. */
  baseUrl?: string;
  /** Runtime credential to prime on AuthStorage for the 'anthropic' provider. */
  anthropicToken?: string;
}

/**
 * Determine the active provider + auth.
 *
 * An explicit `providerConfig` (injected by the Pro consumer) wins; otherwise we
 * fall back to the OSS env-var contract the CLI forwards: `CLAUDE_CODE_USE_BEDROCK`
 * → Bedrock; `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN` → custom base URL; else
 * direct Anthropic (`ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`). Bedrock
 * authenticates from the AWS_ env vars via pi-ai, so it needs no anthropic token.
 */
function resolveEffectiveProvider(apiKey?: string, providerConfig?: ProviderConfig): EffectiveProvider {
  const anthropicKey = apiKey ?? providerConfig?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  const type = providerConfig?.providerType;

  // Bedrock — explicit providerConfig or the env flag.
  if (type === 'bedrock' || (!type && process.env.CLAUDE_CODE_USE_BEDROCK === '1')) {
    return { providerId: 'amazon-bedrock' };
  }

  // Custom base URL — explicit providerConfig.
  if (type === 'custom_base_url') {
    const eff: EffectiveProvider = { providerId: 'anthropic' };
    if (providerConfig?.baseUrl) eff.baseUrl = providerConfig.baseUrl;
    const token = providerConfig?.authToken ?? anthropicKey;
    if (token) eff.anthropicToken = token;
    return eff;
  }

  // Custom base URL — OSS env contract (no providerConfig).
  if (!type && process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN) {
    return {
      providerId: 'anthropic',
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicToken: process.env.ANTHROPIC_AUTH_TOKEN,
    };
  }

  // Direct Anthropic (API key, or — env only — OAuth token).
  const eff: EffectiveProvider = { providerId: 'anthropic' };
  const token = anthropicKey ?? (type ? undefined : process.env.CLAUDE_CODE_OAUTH_TOKEN);
  if (token) eff.anthropicToken = token;
  return eff;
}

/** Resolve a model tier to a concrete model ID (env override → providerConfig → default). */
export function resolveModelId(tier: ModelTier = 'medium', providerConfig?: ProviderConfig): string {
  const override = providerConfig?.modelOverrides?.[tier];
  if (override) return override;
  switch (tier) {
    case 'small':
      return process.env.ANTHROPIC_SMALL_MODEL || DEFAULT_MODELS.small;
    case 'large':
      return process.env.ANTHROPIC_LARGE_MODEL || DEFAULT_MODELS.large;
    default:
      return process.env.ANTHROPIC_MEDIUM_MODEL || DEFAULT_MODELS.medium;
  }
}

/**
 * Resolve the thinking level for a run.
 *
 * The Claude Agent SDK enabled "adaptive" thinking only on capable models; pi uses
 * explicit levels and clamps to model capability internally. We default to 'medium'
 * and honour the existing CLAUDE_ADAPTIVE_THINKING=false kill switch (→ 'off'). An
 * explicit CLAUDE_THINKING_LEVEL wins when set.
 */
export function resolveThinkingLevel(): ThinkingLevel {
  if (process.env.CLAUDE_ADAPTIVE_THINKING === 'false') return 'off';
  const explicit = process.env.CLAUDE_THINKING_LEVEL as ThinkingLevel | undefined;
  if (explicit) return explicit;
  return 'medium';
}

export interface ModelSelection {
  model: Model<Api>;
  thinkingLevel: ThinkingLevel;
  authStorage: AuthStorage;
  modelId: string;
  providerId: string;
}

/**
 * Resolve the active provider (see resolveEffectiveProvider), prime an AuthStorage
 * with its credential, and resolve the tier's model from a fresh ModelRegistry.
 * Anthropic / custom-base-URL use a runtime anthropic key; Bedrock authenticates
 * from the AWS_ env vars (bearer token primed explicitly as a belt-and-suspenders).
 */
export function resolveModelSelection(
  registryFactory: (authStorage: AuthStorage) => ModelRegistry,
  modelTier: ModelTier,
  apiKey?: string,
  providerConfig?: ProviderConfig,
): ModelSelection {
  const eff = resolveEffectiveProvider(apiKey, providerConfig);
  const modelId = resolveModelId(modelTier, providerConfig);

  const authStorage = AuthStorage.inMemory();
  if (eff.providerId === 'anthropic' && eff.anthropicToken) {
    authStorage.setRuntimeApiKey('anthropic', eff.anthropicToken);
  }
  // Bedrock auth flows from the AWS_ env vars; prime the bearer token explicitly so
  // it resolves via AuthStorage in addition to pi-ai's own env fallback.
  if (eff.providerId === 'amazon-bedrock' && process.env.AWS_BEARER_TOKEN_BEDROCK) {
    authStorage.setRuntimeApiKey('amazon-bedrock', process.env.AWS_BEARER_TOKEN_BEDROCK);
  }

  const registry = registryFactory(authStorage);
  const found = registry.find(eff.providerId, modelId);
  if (!found) {
    throw new Error(`Model not found in pi registry: provider="${eff.providerId}" model="${modelId}"`);
  }

  // Custom base URL: override the resolved model's endpoint.
  const model: Model<Api> = eff.baseUrl ? { ...found, baseUrl: eff.baseUrl } : found;

  return {
    model,
    thinkingLevel: resolveThinkingLevel(),
    authStorage,
    modelId,
    providerId: eff.providerId,
  };
}

/**
 * Whether a model is in the Fable family. Fable's safety classifiers flag
 * cybersecurity tasks and route them to Opus 4.8, so a security scan on Fable
 * largely runs on Opus 4.8 anyway.
 */
export function isFableModel(model: string): boolean {
  return /fable/i.test(model);
}
