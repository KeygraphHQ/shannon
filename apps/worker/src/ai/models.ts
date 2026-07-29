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
 * direct Anthropic). When the custom base URL points at a MiniMax Anthropic-compatible
 * endpoint, the first-class `minimax` (global) / `minimax-cn` provider is selected so
 * models resolve from the MiniMax catalog with the correct endpoint instead of the
 * Anthropic registry. Resolution returns a pi `Model` via `ModelRegistry.find`, the
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
  /** pi-ai provider id: 'anthropic', 'amazon-bedrock', 'minimax', or 'minimax-cn'. */
  providerId: string;
  /** Custom-base-URL override applied to the resolved anthropic model. */
  baseUrl?: string;
  /**
   * Runtime credential to prime on AuthStorage for the resolved anthropic-compatible
   * provider ('anthropic', 'minimax', or 'minimax-cn').
   */
  anthropicToken?: string;
}

/**
 * MiniMax exposes an Anthropic-compatible endpoint per region. Map the configured
 * base URL host to the matching first-class pi provider so models resolve from the
 * MiniMax catalog. Exact host match only, so a look-alike host is never routed here.
 */
function resolveMiniMaxProvider(baseUrl: string): 'minimax' | 'minimax-cn' | undefined {
  let host: string;
  try {
    host = new URL(baseUrl).host.toLowerCase();
  } catch {
    return undefined;
  }
  if (host === 'api.minimaxi.com') return 'minimax-cn';
  if (host === 'api.minimax.io') return 'minimax';
  return undefined;
}

/** MiniMax-M2.7 reasons on every request; its thinking cannot be disabled. */
const MINIMAX_ALWAYS_ON_THINKING = /^minimax-m2\.7/i;

/** MiniMax-M3 supports adaptive thinking (adaptive / disabled). */
const MINIMAX_ADAPTIVE_THINKING = /^minimax-m3/i;

/**
 * Determine the active provider + auth from the env-var contract the CLI forwards:
 * `CLAUDE_CODE_USE_BEDROCK` → Bedrock; `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN`
 * → custom base URL (a MiniMax endpoint selects the first-class `minimax`/`minimax-cn`
 * provider; any other endpoint stays on Anthropic with a base-URL override); else
 * direct Anthropic (`ANTHROPIC_API_KEY`, or `CLAUDE_CODE_OAUTH_TOKEN`). Bedrock
 * authenticates from the AWS_ env vars via pi-ai, so it needs no anthropic token.
 */
export function resolveEffectiveProvider(): EffectiveProvider {
  // Bedrock — env flag.
  if (process.env.CLAUDE_CODE_USE_BEDROCK === '1') {
    return { providerId: 'amazon-bedrock' };
  }

  // Custom base URL — env contract.
  if (process.env.ANTHROPIC_BASE_URL && process.env.ANTHROPIC_AUTH_TOKEN) {
    // MiniMax Anthropic-compatible endpoint → resolve from the first-class MiniMax
    // catalog (correct endpoint baked in), not the Anthropic registry.
    const miniMaxProvider = resolveMiniMaxProvider(process.env.ANTHROPIC_BASE_URL);
    if (miniMaxProvider) {
      return {
        providerId: miniMaxProvider,
        anthropicToken: process.env.ANTHROPIC_AUTH_TOKEN,
      };
    }
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

/** Whether a model supports adaptive thinking. Opus 4.6/4.7/4.8 and MiniMax-M3. */
export function supportsAdaptiveThinking(model: string): boolean {
  return /opus-4-[678]/.test(model) || MINIMAX_ADAPTIVE_THINKING.test(model);
}

/**
 * Resolve the thinking level for a run.
 *
 * MiniMax-M2.7 reasons on every request, so it always runs with thinking on
 * regardless of the kill switch. Otherwise adaptive thinking is enabled only on
 * capable models (Opus 4.6/4.7/4.8, MiniMax-M3), mapped to pi's 'medium' level;
 * every other model runs with thinking 'off'. The CLAUDE_ADAPTIVE_THINKING=false
 * kill switch forces 'off' for the adaptive models.
 */
export function resolveThinkingLevel(modelId: string): ThinkingLevel {
  if (MINIMAX_ALWAYS_ON_THINKING.test(modelId)) return 'medium';
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
  // Anthropic and the MiniMax providers all authenticate with a runtime bearer token
  // primed under their own provider id.
  const usesRuntimeToken =
    eff.providerId === 'anthropic' || eff.providerId === 'minimax' || eff.providerId === 'minimax-cn';
  if (usesRuntimeToken && eff.anthropicToken) {
    authStorage.setRuntimeApiKey(eff.providerId, eff.anthropicToken);
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
