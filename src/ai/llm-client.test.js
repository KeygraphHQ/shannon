/**
 * Tests for the LLM Client Provider Configuration
 * 
 * Run with: npm run test:llm
 * Or: node --test src/ai/llm-client.test.js
 */

import { strict as assert } from 'node:assert';
import { test, describe, it, beforeEach } from 'node:test';
import { getProviderConfig } from './llm-client.js';

// Helper to reset env between tests
function resetEnv() {
    delete process.env.LLM_PROVIDER;
    delete process.env.LLM_BASE_URL;
    delete process.env.LLM_MODEL;
    delete process.env.GITHUB_TOKEN;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
}

test('Auto-detection: should detect GitHub Models when GITHUB_TOKEN is set', () => {
    resetEnv();
    process.env.GITHUB_TOKEN = 'test-token';

    const config = getProviderConfig();

    assert.equal(config.provider, 'github');
    assert.equal(config.baseURL, 'https://models.github.ai/inference');
    assert.equal(config.model, 'openai/gpt-4.1');
    resetEnv();
});

test('Auto-detection: should detect OpenAI when OPENAI_API_KEY is set', () => {
    resetEnv();
    process.env.OPENAI_API_KEY = 'test-key';

    const config = getProviderConfig();

    assert.equal(config.provider, 'openai');
    assert.equal(config.baseURL, 'https://api.openai.com/v1');
    assert.equal(config.model, 'gpt-4o');
    resetEnv();
});

test('Auto-detection: should throw when no provider is configured', () => {
    resetEnv();

    assert.throws(() => getProviderConfig(), /No LLM provider configured/);
});

test('Explicit: should use Ollama when LLM_PROVIDER=ollama', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'ollama';

    const config = getProviderConfig();

    assert.equal(config.provider, 'ollama');
    assert.equal(config.baseURL, 'http://localhost:11434/v1');
    assert.equal(config.model, 'llama3.2');
    resetEnv();
});

test('Explicit: should use llama.cpp when LLM_PROVIDER=llamacpp', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'llamacpp';

    const config = getProviderConfig();

    assert.equal(config.provider, 'llamacpp');
    assert.equal(config.baseURL, 'http://localhost:8080/v1');
    resetEnv();
});

test('Explicit: should use LM Studio when LLM_PROVIDER=lmstudio', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'lmstudio';

    const config = getProviderConfig();

    assert.equal(config.provider, 'lmstudio');
    assert.equal(config.baseURL, 'http://localhost:1234/v1');
    resetEnv();
});

test('Explicit: should require LLM_BASE_URL for custom provider', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'custom';

    assert.throws(() => getProviderConfig(), /LLM_PROVIDER=custom requires LLM_BASE_URL/);
    resetEnv();
});

test('Explicit: should use custom endpoint when both are set', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'custom';
    process.env.LLM_BASE_URL = 'https://my-proxy.example.com/v1';
    process.env.OPENAI_API_KEY = 'my-key';

    const config = getProviderConfig();

    assert.equal(config.provider, 'custom');
    assert.equal(config.baseURL, 'https://my-proxy.example.com/v1');
    assert.equal(config.apiKey, 'my-key');
    resetEnv();
});

test('Override: should respect LLM_MODEL override', () => {
    resetEnv();
    process.env.LLM_PROVIDER = 'ollama';
    process.env.LLM_MODEL = 'codellama';

    const config = getProviderConfig();

    assert.equal(config.model, 'codellama');
    resetEnv();
});

test('Override: should allow LLM_BASE_URL to override default for any provider', () => {
    resetEnv();
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_BASE_URL = 'https://proxy.example.com/v1';

    const config = getProviderConfig();

    assert.equal(config.provider, 'github');
    assert.equal(config.baseURL, 'https://proxy.example.com/v1');
    resetEnv();
});
