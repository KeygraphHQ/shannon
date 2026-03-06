// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Model tier definitions and resolution.
 *
 * Three tiers mapped to capability levels:
 * - "small"  (Haiku — summarization, structured extraction)
 * - "medium" (Sonnet — tool use, general analysis)
 * - "large"  (Opus — deep reasoning, complex analysis)
 *
 * Users override via ANTHROPIC_SMALL_MODEL / ANTHROPIC_MEDIUM_MODEL / ANTHROPIC_LARGE_MODEL,
 * which works across all providers (direct, Bedrock, Vertex).
 */

export type ModelTier = 'small' | 'medium' | 'large';

const DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  small: 'claude-haiku-4-5-20251001',
  medium: 'claude-sonnet-4-6',
  large: 'claude-opus-4-6',
};

// Copilot model IDs — available through the GitHub Copilot API
const COPILOT_DEFAULT_MODELS: Readonly<Record<ModelTier, string>> = {
  small: 'claude-haiku-4.5',
  medium: 'claude-sonnet-4.6',
  large: 'claude-opus-4.6',
};

/** All models available via the GitHub Copilot API. */
export const COPILOT_AVAILABLE_MODELS: ReadonlyArray<{ name: string; id: string }> = [
  // Claude
  { name: 'Claude Haiku 4.5', id: 'claude-haiku-4.5' },
  { name: 'Claude Sonnet 4', id: 'claude-sonnet-4' },
  { name: 'Claude Sonnet 4.5', id: 'claude-sonnet-4.5' },
  { name: 'Claude Sonnet 4.6', id: 'claude-sonnet-4.6' },
  { name: 'Claude Opus 4.1', id: 'claude-opus-41' },
  { name: 'Claude Opus 4.5', id: 'claude-opus-4.5' },
  { name: 'Claude Opus 4.6', id: 'claude-opus-4.6' },
  // GPT
  { name: 'GPT-4o', id: 'gpt-4o' },
  { name: 'GPT-4.1', id: 'gpt-4.1' },
  { name: 'GPT-5', id: 'gpt-5' },
  { name: 'GPT-5 Mini', id: 'gpt-5-mini' },
  { name: 'GPT-5.1', id: 'gpt-5.1' },
  { name: 'GPT-5.1 Codex', id: 'gpt-5.1-codex' },
  { name: 'GPT-5.1 Codex Max', id: 'gpt-5.1-codex-max' },
  { name: 'GPT-5.1 Codex Mini', id: 'gpt-5.1-codex-mini' },
  { name: 'GPT-5.2', id: 'gpt-5.2' },
  { name: 'GPT-5.2 Codex', id: 'gpt-5.2-codex' },
  // Gemini
  { name: 'Gemini 2.5 Pro', id: 'gemini-2.5-pro' },
  { name: 'Gemini 3 Flash', id: 'gemini-3-flash-preview' },
  { name: 'Gemini 3 Pro Preview', id: 'gemini-3-pro-preview' },
  { name: 'Gemini 3.1 Pro Preview', id: 'gemini-3.1-pro-preview' },
  // Other
  { name: 'Grok Code Fast 1', id: 'grok-code-fast-1' },
];

/** Resolve a model tier to a concrete model ID. */
export function resolveModel(tier: ModelTier = 'medium'): string {
  switch (tier) {
    case 'small':
      return process.env.ANTHROPIC_SMALL_MODEL || DEFAULT_MODELS.small;
    case 'large':
      return process.env.ANTHROPIC_LARGE_MODEL || DEFAULT_MODELS.large;
    default:
      return process.env.ANTHROPIC_MEDIUM_MODEL || DEFAULT_MODELS.medium;
  }
}

/** Resolve a model tier for the Copilot provider. */
export function resolveCopilotModel(tier: ModelTier = 'medium'): string {
  // User overrides take priority (same env vars)
  switch (tier) {
    case 'small':
      return process.env.COPILOT_SMALL_MODEL || process.env.ANTHROPIC_SMALL_MODEL || COPILOT_DEFAULT_MODELS.small;
    case 'large':
      return process.env.COPILOT_LARGE_MODEL || process.env.ANTHROPIC_LARGE_MODEL || COPILOT_DEFAULT_MODELS.large;
    default:
      return process.env.COPILOT_MEDIUM_MODEL || process.env.ANTHROPIC_MEDIUM_MODEL || COPILOT_DEFAULT_MODELS.medium;
  }
}
