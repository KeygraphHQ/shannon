import assert from 'node:assert/strict';
import test from 'node:test';

import { createModelRuntime, resolveModel } from '../dist/ai/models.js';

const sol = {
  provider: 'openai-codex',
  id: 'gpt-5.6-sol',
  name: 'GPT-5.6 Sol',
  api: 'openai-codex-responses',
  reasoning: true,
  input: ['text', 'image'],
  contextWindow: 272_000,
  maxTokens: 128_000,
  cost: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 6.25 },
  compat: { supportsOpenAIGrammarTools: true, supportsAdditionalTools: true, supportsToolSearch: true },
};

function runtime(models) {
  return {
    getModel(provider, id) {
      return models.find((model) => model.provider === provider && model.id === id);
    },
    getModels(provider) {
      return models.filter((model) => model.provider === provider);
    },
  };
}

test('Daybreak Blue uses the OpenAI Codex descriptor while the pinned catalog catches up', () => {
  const selected = resolveModel(runtime([sol]), 'openai-codex', 'gpt-daybreak-blue-latest', undefined);

  assert.deepEqual(selected, {
    ...sol,
    id: 'gpt-daybreak-blue-latest',
    name: 'GPT Daybreak Blue',
  });
});

test('Daybreak Blue compatibility still honors an explicit endpoint override', () => {
  const selected = resolveModel(
    runtime([sol]),
    'openai-codex',
    'gpt-daybreak-blue-latest',
    'https://gateway.example/v1',
  );

  assert.equal(selected.baseUrl, 'https://gateway.example/v1');
});

test('Daybreak Blue inherits the pinned Sol transport contract', async () => {
  const modelRuntime = await createModelRuntime('openai-codex', undefined);
  const reference = modelRuntime.getModel('openai-codex', 'gpt-5.6-sol');
  const selected = resolveModel(modelRuntime, 'openai-codex', 'gpt-daybreak-blue-latest', undefined);

  assert.ok(reference);
  assert.ok(selected);
  assert.equal(selected.id, 'gpt-daybreak-blue-latest');
  for (const field of ['api', 'baseUrl', 'thinkingLevelMap', 'compat']) {
    assert.deepEqual(selected[field], reference[field]);
  }
});

test('unknown direct-provider models remain rejected', () => {
  assert.equal(resolveModel(runtime([sol]), 'openai-codex', 'not-a-real-model', undefined), undefined);
});
