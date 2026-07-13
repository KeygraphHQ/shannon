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
 * The active provider is chosen from the env-var contract the CLI forwards
 * (`CLAUDE_CODE_USE_BEDROCK`, `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`, else
 * direct Anthropic). Resolution returns a pi `Model` via `ModelRegistry.find`, the
 * `thinkingLevel`, and an `AuthStorage` primed with the right credential. Bedrock
 * authenticates from the AWS_ env vars via pi-ai.
 */

import type { ThinkingLevel } from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import { AuthStorage, type ModelRegistry } from '@earendil-works/pi-coding-agent';

export type ModelTier = 'small' | 'medium' | 'large';

const DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  small: 'claude-haiku-4-5-20251001',
  medium: 'claude-sonnet-4-6',
  large: 'claude-opus-4-8',
};

export interface EffectiveProvider {
  /** pi-ai provider id: 'anthropic' or 'amazon-bedrock'. */
  providerId: string;
  /** Custom-base-URL override applied to the resolved anthropic model. */
  baseUrl?: string;
  /** Runtime credential to prime on AuthStorage for the 'anthropic' provider. */
  anthropicToken?: string;
}

/**
 * Determine the active provider + auth from the env-var contract the CLI forwards:
 * `CLAUDE_CODE_USE_BEDROCK` → Bedrock; `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`
 * → custom base URL; else direct Anthropic (`ANTHROPIC_API_KEY`, or
 * `CLAUDE_CODE_OAUTH_TOKEN`). Bedrock authenticates from the AWS_ env vars via
 * pi-ai, so it needs no anthropic token.
 */
export function resolveEffectiveProvider(): EffectiveProvider {
  // Bedrock — env flag.
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    return { providerId: 'amazon-bedrock' };
  }

  // Custom base URL — env contract.
  if (process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN) {
    return {
      providerId: 'anthropic',
      baseUrl: process.env.ANTHROPIC_BASE_URL,
      anthropicToken: process.env.ANTHROPIC_AUTH_TOKEN,
    };
  }

  // Direct Anthropic (API key, or OAuth token).
  const eff: EffectiveProvider = { providerId: 'anthropic' };
  const token = process.env.ANTHROPIC_API_KEY ?? process.env.CLAUDE_CODE_OAUTH_TOKEN;
  if (token) eff.anthropicToken = token;
  return eff;
}

/** Resolve a model tier to a concrete model ID (env override → default). */
export function resolveModelId(tier: ModelTier = 'medium'): string {
  switch (tier) {
    case 'small':
      return process.env.ANTHROPIC_SMALL_MODEL || DEFAULT_MODELS.small;
    case 'large':
      return process.env.ANTHROPIC_LARGE_MODEL || DEFAULT_MODELS.large;
    default:
      return process.env.ANTHROPIC_MEDIUM_MODEL || DEFAULT_MODELS.medium;
  }
}

/** Whether a model supports adaptive thinking. Opus 4.6, 4.7, and 4.8 only. */
export function supportsAdaptiveThinking(model: string): boolean {
  return /opus-4-[678]/.test(model);
}

/**
 * Resolve the thinking level for a run.
 *
 * Adaptive thinking is enabled only on capable models (Opus 4.6/4.7/4.8), mapped to
 * pi's 'medium' level; every other model runs with thinking 'off'. The
 * CLAUDE_ADAPTIVE_THINKING=false kill switch forces 'off' regardless of model.
 */
export function resolveThinkingLevel(modelId: string): ThinkingLevel {
  if (process.env.CLAUDE_ADAPTIVE_THINKING === 'false') return 'off';
  return supportsAdaptiveThinking(modelId) ? 'medium' : 'off';
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
): ModelSelection {
  const eff = resolveEffectiveProvider();
  const modelId = resolveModelId(modelTier);

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
    thinkingLevel: resolveThinkingLevel(modelId),
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
