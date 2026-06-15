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
 * Resolution returns a pi `Model` object via `ModelRegistry.find`, plus the
 * `thinkingLevel` and an `AuthStorage` primed with runtime credentials. Bedrock
 * authenticates from the process environment (the AWS_ vars the CLI forwards), so
 * it needs no runtime API key.
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

/** pi-ai provider id for a Shannon ProviderConfig.providerType. Default: anthropic. */
function piProviderId(providerConfig?: ProviderConfig): string {
  switch (providerConfig?.providerType) {
    case 'bedrock':
      return 'amazon-bedrock';
    default:
      // 'anthropic_api', 'custom_base_url', or unset all resolve to the anthropic
      // provider; custom_base_url overrides baseUrl/auth below.
      return 'anthropic';
  }
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
 * Build an AuthStorage primed with the right credential for the active provider,
 * then resolve the tier's model from a fresh ModelRegistry.
 *
 * - Anthropic: runtime API key from ContainerConfig.apiKey → ProviderConfig.apiKey
 *   → ANTHROPIC_API_KEY env. OAuth (CLAUDE_CODE_OAUTH_TOKEN) is read from env by pi.
 * - Custom base URL (custom_base_url): the auth token is set as the anthropic
 *   runtime key and the model's baseUrl is overridden.
 * - Bedrock: authenticates from the process environment (the AWS_ vars), no
 *   runtime key needed.
 */
export function resolveModelSelection(
  registryFactory: (authStorage: AuthStorage) => ModelRegistry,
  modelTier: ModelTier,
  apiKey?: string,
  providerConfig?: ProviderConfig,
): ModelSelection {
  const providerId = piProviderId(providerConfig);
  const modelId = resolveModelId(modelTier, providerConfig);

  const authStorage = AuthStorage.inMemory();

  const anthropicKey = apiKey ?? providerConfig?.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (providerId === 'anthropic') {
    const token =
      providerConfig?.providerType === 'custom_base_url' ? (providerConfig.authToken ?? anthropicKey) : anthropicKey;
    if (token) authStorage.setRuntimeApiKey('anthropic', token);
  }

  const registry = registryFactory(authStorage);
  const found = registry.find(providerId, modelId);
  if (!found) {
    throw new Error(`Model not found in pi registry: provider="${providerId}" model="${modelId}"`);
  }

  // Custom base URL: override the resolved model's endpoint.
  const baseUrl = providerConfig?.providerType === 'custom_base_url' ? providerConfig.baseUrl : undefined;
  const model: Model<Api> = baseUrl ? { ...found, baseUrl } : found;

  return {
    model,
    thinkingLevel: resolveThinkingLevel(),
    authStorage,
    modelId,
    providerId,
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
