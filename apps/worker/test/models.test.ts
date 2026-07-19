// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelRegistry } from '@earendil-works/pi-coding-agent';
import {
  resolveEffectiveProvider,
  resolveModelId,
  resolveModelSelection,
  resolveThinkingLevel,
} from '../src/ai/models.js';

const MANAGED_ENV = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'CLAUDE_CODE_USE_BEDROCK',
  'AWS_REGION',
  'AWS_BEARER_TOKEN_BEDROCK',
  'OPENAI_SMALL_MODEL',
  'OPENAI_MEDIUM_MODEL',
  'OPENAI_LARGE_MODEL',
  'ANTHROPIC_SMALL_MODEL',
  'ANTHROPIC_MEDIUM_MODEL',
  'ANTHROPIC_LARGE_MODEL',
  'SHANNON_SMALL_MODEL',
  'SHANNON_MEDIUM_MODEL',
  'SHANNON_LARGE_MODEL',
  'CLAUDE_ADAPTIVE_THINKING',
] as const;

async function withEnv(values: Record<string, string>, fn: () => void | Promise<void>): Promise<void> {
  const snapshot = new Map(MANAGED_ENV.map((key) => [key, process.env[key]]));
  for (const key of MANAGED_ENV) delete process.env[key];
  Object.assign(process.env, values);
  try {
    await fn();
  } finally {
    for (const key of MANAGED_ENV) {
      const value = snapshot.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('OpenAI is a first-class provider with Luna, Terra, and Sol tier defaults', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key' }, () => {
    assert.deepEqual(resolveEffectiveProvider(), { providerId: 'openai', apiKey: 'test-openai-key' });
    assert.equal(resolveModelId('small'), 'gpt-5.6-luna');
    assert.equal(resolveModelId('medium'), 'gpt-5.6-terra');
    assert.equal(resolveModelId('large'), 'gpt-5.6-sol');
    assert.equal(resolveThinkingLevel('gpt-5.6-luna', 'openai'), 'off');
    assert.equal(resolveThinkingLevel('gpt-5.6-terra', 'openai'), 'off');
    assert.equal(resolveThinkingLevel('gpt-5.6-sol', 'openai'), 'medium');
  });
});

test('provider-specific model overrides beat shared overrides without leaking across providers', async () => {
  await withEnv(
    {
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_SMALL_MODEL: 'gpt-openai-override',
      ANTHROPIC_SMALL_MODEL: 'claude-legacy-override',
      SHANNON_SMALL_MODEL: 'shared-override',
    },
    () => {
      assert.equal(resolveModelId('small', 'openai'), 'gpt-openai-override');
      assert.equal(resolveModelId('small', 'anthropic'), 'claude-legacy-override');
    },
  );

  await withEnv({ OPENAI_API_KEY: 'test-openai-key', SHANNON_MEDIUM_MODEL: 'shared-model' }, () => {
    assert.equal(resolveModelId('medium', 'openai'), 'shared-model');
  });
});

test('existing Bedrock and custom Anthropic provider precedence remains intact', async () => {
  await withEnv(
    {
      OPENAI_API_KEY: 'test-openai-key',
      ANTHROPIC_BASE_URL: 'https://proxy.example.test',
      ANTHROPIC_AUTH_TOKEN: 'test-proxy-key',
    },
    () => {
      assert.deepEqual(resolveEffectiveProvider(), {
        providerId: 'anthropic',
        baseUrl: 'https://proxy.example.test',
        apiKey: 'test-proxy-key',
      });
    },
  );

  await withEnv(
    {
      OPENAI_API_KEY: 'test-openai-key',
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock-key',
    },
    () => assert.deepEqual(resolveEffectiveProvider(), { providerId: 'amazon-bedrock' }),
  );
});

test('Anthropic and Bedrock model selection remain registry-compatible', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'test-anthropic-key' }, async () => {
    const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), 'medium');
    assert.equal(selection.providerId, 'anthropic');
    assert.equal(selection.model.id, 'claude-sonnet-4-6');
    assert.equal(await selection.authStorage.getApiKey('anthropic'), 'test-anthropic-key');
  });

  await withEnv(
    {
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'us-east-1',
      AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock-key',
      SHANNON_SMALL_MODEL: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      SHANNON_MEDIUM_MODEL: 'us.anthropic.claude-sonnet-4-6',
      SHANNON_LARGE_MODEL: 'us.anthropic.claude-opus-4-8',
    },
    async () => {
      const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), 'large');
      assert.equal(selection.providerId, 'amazon-bedrock');
      assert.equal(selection.model.id, 'us.anthropic.claude-opus-4-8');
      assert.equal(await selection.authStorage.getApiKey('amazon-bedrock'), 'test-bedrock-key');
    },
  );
});

test('OpenAI selection uses Pi Responses metadata, primes auth, and retains pricing tiers', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key' }, async () => {
    const tiers = [
      ['small', 'gpt-5.6-luna', 'off'],
      ['medium', 'gpt-5.6-terra', 'off'],
      ['large', 'gpt-5.6-sol', 'medium'],
    ] as const;

    for (const [tier, modelId, thinkingLevel] of tiers) {
      const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), tier);
      assert.equal(selection.model.id, modelId);
      assert.equal(selection.model.api, 'openai-responses');
      assert.equal(selection.model.provider, 'openai');
      assert.equal(selection.thinkingLevel, thinkingLevel);
      assert.equal(await selection.authStorage.getApiKey('openai'), 'test-openai-key');
      assert.ok(selection.model.cost.cacheWrite > 0);
      assert.ok((selection.model.cost.tiers?.length ?? 0) > 0);
    }
  });
});

test('unknown OpenAI model overrides fail closed at registry resolution', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key', OPENAI_SMALL_MODEL: 'does-not-exist' }, () => {
    assert.throws(
      () => resolveModelSelection((auth) => ModelRegistry.create(auth), 'small'),
      /Model not found in pi registry: provider="openai" model="does-not-exist"/,
    );
  });
});
