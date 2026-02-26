import test from 'node:test';
import assert from 'node:assert/strict';
import { LLMRouter } from '../dist/core/llm/router.js';

test('router falls back when primary provider fails', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url) => {
    if (String(url).includes('groq')) return new Response('boom', { status: 500 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
  };

  const router = await LLMRouter.create();
  const response = await router.complete('default', {
    messages: [{ role: 'user', content: 'hi' }],
    temperature: 0,
    maxTokens: 32,
  });

  assert.equal(response.content, 'ok');
  global.fetch = originalFetch;
});
