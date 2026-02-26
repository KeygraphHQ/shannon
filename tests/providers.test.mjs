import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAICompatibleProvider } from '../dist/core/llm/providers/openai-compatible.js';
import { OllamaProvider } from '../dist/core/llm/providers/ollama.js';

test('openai-compatible provider sends json schema response_format', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (_url, init) => {
    captured = JSON.parse(init.body);
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200 });
  };

  const provider = new OpenAICompatibleProvider({ providerName: 'openai_compatible', baseUrl: 'https://example.com/v1', apiKey: 'k', model: 'm' });
  await provider.complete({
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
    maxTokens: 8,
    jsonSchema: { type: 'object' },
  });

  assert.equal(captured.response_format.type, 'json_schema');
  global.fetch = originalFetch;
});

test('ollama provider handles model missing fallback condition', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('model not found', { status: 404 });

  const provider = new OllamaProvider({ host: 'http://localhost:11434', model: 'missing', contextWindow: undefined });
  await assert.rejects(() => provider.complete({
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
    maxTokens: 8,
  }), /Ollama model not installed/);

  global.fetch = originalFetch;
});
