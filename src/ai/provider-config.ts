// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Provider selection and configuration for AI execution.
 * Supports 'claude' (Claude Agent SDK) and 'openai' (OpenAI-compatible APIs).
 */

export type AIProvider = 'claude' | 'openai';

export interface OpenAIProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ProviderConfig {
  provider: AIProvider;
  openai?: OpenAIProviderConfig;
}

/**
 * Get the current AI provider configuration from environment variables.
 */
export function getProviderConfig(): ProviderConfig {
  const provider = (process.env.AI_PROVIDER ?? 'claude').toLowerCase() as AIProvider;

  if (provider === 'openai') {
    const baseUrl = process.env.AI_BASE_URL ?? 'https://api.openai.com/v1';
    const apiKey = process.env.AI_API_KEY ?? '';
    const model = process.env.AI_MODEL ?? 'gpt-4o';

    return {
      provider: 'openai',
      openai: {
        baseUrl: baseUrl.replace(/\/$/, ''), // trim trailing slash
        apiKey,
        model,
      },
    };
  }

  return { provider: 'claude' };
}

/**
 * Check if the OpenAI-compatible provider is active.
 */
export function isOpenAIProvider(): boolean {
  return getProviderConfig().provider === 'openai';
}
