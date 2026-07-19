import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyConfigToEnvironment, validateConfig } from '../src/config/resolver.js';
import { buildEnvFlags, validateCredentials } from '../src/env.js';

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

test('CLI accepts and forwards a single OpenAI credential with model overrides', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key', OPENAI_LARGE_MODEL: 'gpt-5.6-sol' }, () => {
    assert.deepEqual(validateCredentials(), { valid: true, mode: 'openai' });
    const flags = buildEnvFlags();
    assert.ok(flags.includes('OPENAI_API_KEY=test-openai-key'));
    assert.ok(flags.includes('OPENAI_LARGE_MODEL=gpt-5.6-sol'));
  });
});

test('CLI rejects simultaneous OpenAI and Anthropic authentication', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key', ANTHROPIC_API_KEY: 'test-anthropic-key' }, () => {
    const result = validateCredentials();
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Multiple providers detected/);
  });
});

test('CLI rejects OpenAI combined with a partial custom endpoint configuration', async () => {
  await withEnv({ OPENAI_API_KEY: 'test-openai-key', ANTHROPIC_BASE_URL: 'https://proxy.example' }, () => {
    const result = validateCredentials();
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /Multiple providers detected/);
  });
});

test('CLI reports missing fields for an incomplete custom endpoint', async () => {
  await withEnv({ ANTHROPIC_BASE_URL: 'https://proxy.example' }, () => {
    const result = validateCredentials();
    assert.equal(result.valid, false);
    assert.match(result.error ?? '', /ANTHROPIC_AUTH_TOKEN/);
  });
});

test('Bedrock accepts provider-neutral model tiers from TOML', async () => {
  await withEnv(
    {
      CLAUDE_CODE_USE_BEDROCK: '1',
      AWS_REGION: 'us-east-1',
      AWS_BEARER_TOKEN_BEDROCK: 'test-bedrock-key',
      SHANNON_SMALL_MODEL: 'bedrock-small',
      SHANNON_MEDIUM_MODEL: 'bedrock-medium',
      SHANNON_LARGE_MODEL: 'bedrock-large',
    },
    () => assert.deepEqual(validateCredentials(), { valid: true, mode: 'bedrock' }),
  );
});

test('TOML validates OpenAI and fails closed on incomplete or conflicting providers', () => {
  assert.deepEqual(validateConfig({ openai: { api_key: 'test-openai-key' } }), []);
  assert.match(validateConfig({ openai: {} }).join('\n'), /\[openai\] requires api_key/);
  assert.match(
    validateConfig({ openai: { api_key: 'test-openai-key' }, anthropic: { api_key: 'test-anthropic-key' } }).join('\n'),
    /Multiple providers configured/,
  );
  assert.match(
    validateConfig({ anthropic: { api_key: 'test-anthropic-key', oauth_token: 'test-oauth' } }).join('\n'),
    /must configure only one/,
  );
});

test('TOML cannot inject a saved provider or its model IDs over a different shell provider', async () => {
  await withEnv({ OPENAI_API_KEY: 'shell-openai-key' }, () => {
    applyConfigToEnvironment({
      anthropic: { api_key: 'saved-anthropic-key' },
      models: { small: 'shared-small', medium: 'shared-medium', large: 'shared-large' },
    });
    assert.equal(process.env.OPENAI_API_KEY, 'shell-openai-key');
    assert.equal(process.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(process.env.SHANNON_SMALL_MODEL, undefined);
    assert.equal(process.env.SHANNON_MEDIUM_MODEL, undefined);
    assert.equal(process.env.SHANNON_LARGE_MODEL, undefined);
    assert.equal(process.env.ANTHROPIC_SMALL_MODEL, undefined);
  });
});

test('TOML loads model IDs when the saved and shell-selected providers match', async () => {
  await withEnv({ OPENAI_API_KEY: 'shell-openai-key' }, () => {
    applyConfigToEnvironment({
      openai: { api_key: 'saved-openai-key' },
      models: { small: 'gpt-5.6-luna', medium: 'gpt-5.6-terra', large: 'gpt-5.6-sol' },
    });
    assert.equal(process.env.OPENAI_API_KEY, 'shell-openai-key');
    assert.equal(process.env.SHANNON_SMALL_MODEL, 'gpt-5.6-luna');
    assert.equal(process.env.SHANNON_MEDIUM_MODEL, 'gpt-5.6-terra');
    assert.equal(process.env.SHANNON_LARGE_MODEL, 'gpt-5.6-sol');
  });
});

test('saved Bedrock model IDs cannot leak into a shell-selected OpenAI run', async () => {
  await withEnv({ OPENAI_API_KEY: 'shell-openai-key' }, () => {
    applyConfigToEnvironment({
      bedrock: { use: true, region: 'us-east-1', token: 'saved-bedrock-token' },
      models: {
        small: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
        medium: 'us.anthropic.claude-sonnet-4-6',
        large: 'us.anthropic.claude-opus-4-8',
      },
    });
    assert.equal(process.env.AWS_BEARER_TOKEN_BEDROCK, undefined);
    assert.equal(process.env.SHANNON_SMALL_MODEL, undefined);
    assert.deepEqual(validateCredentials(), { valid: true, mode: 'openai' });
  });
});

test('TOML fills remaining fields for the same shell-selected Bedrock provider', async () => {
  await withEnv({ CLAUDE_CODE_USE_BEDROCK: '1' }, () => {
    applyConfigToEnvironment({
      bedrock: { use: true, region: 'us-east-1', token: 'saved-bedrock-token' },
      models: { small: 'bedrock-small', medium: 'bedrock-medium', large: 'bedrock-large' },
    });
    assert.equal(process.env.AWS_REGION, 'us-east-1');
    assert.equal(process.env.AWS_BEARER_TOKEN_BEDROCK, 'saved-bedrock-token');
    assert.deepEqual(validateCredentials(), { valid: true, mode: 'bedrock' });
  });
});

test('TOML fills a missing same-provider custom endpoint field without overriding the shell', async () => {
  await withEnv({ ANTHROPIC_BASE_URL: 'https://shell-proxy.example' }, () => {
    applyConfigToEnvironment({
      custom_base_url: { base_url: 'https://saved-proxy.example', auth_token: 'saved-proxy-token' },
    });
    assert.equal(process.env.ANTHROPIC_BASE_URL, 'https://shell-proxy.example');
    assert.equal(process.env.ANTHROPIC_AUTH_TOKEN, 'saved-proxy-token');
    assert.deepEqual(validateCredentials(), { valid: true, mode: 'custom-base-url' });
  });
});

test('TOML does not combine alternative Anthropic authentication methods', async () => {
  await withEnv({ ANTHROPIC_API_KEY: 'shell-anthropic-key' }, () => {
    applyConfigToEnvironment({ anthropic: { oauth_token: 'saved-oauth-token' } });
    assert.equal(process.env.ANTHROPIC_API_KEY, 'shell-anthropic-key');
    assert.equal(process.env.CLAUDE_CODE_OAUTH_TOKEN, undefined);
    assert.deepEqual(validateCredentials(), { valid: true, mode: 'api-key' });
  });
});
