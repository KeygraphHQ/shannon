// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DefaultResourceLoader, type ExtensionContext, ModelRegistry } from '@earendil-works/pi-coding-agent';
import { resolveModelSelection } from '../src/ai/models.js';
import { createTaskTool } from '../src/ai/pi/task-tool.js';
import type { AgentUsageMetrics } from '../src/types/metrics.js';

function writeResponse(response: http.ServerResponse): void {
  const message = {
    type: 'message',
    id: 'msg_child_1',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: 'OK', annotations: [] }],
  };
  const events = [
    { type: 'response.created', response: { id: 'resp_child_1' } },
    { type: 'response.output_item.added', output_index: 0, item: message },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
    { type: 'response.output_item.done', output_index: 0, item: message },
    {
      type: 'response.completed',
      response: {
        id: 'resp_child_1',
        status: 'completed',
        output: [message],
        usage: {
          input_tokens: 20,
          input_tokens_details: { cached_tokens: 5, cache_write_tokens: 2 },
          output_tokens: 8,
          output_tokens_details: { reasoning_tokens: 3 },
          total_tokens: 28,
        },
      },
    },
  ];

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.write('data: [DONE]\n\n');
  response.end();
}

test('task child reports Pi-normalized usage once with its independent model and reasoning route', async () => {
  let requestBody: Record<string, unknown> | undefined;
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      requestBody = JSON.parse(raw) as Record<string, unknown>;
      writeResponse(response);
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind');

  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'shannon-task-usage-'));
  try {
    const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), 'small', 'low');
    const model = { ...selection.model, baseUrl: `http://127.0.0.1:${address.port}/v1` };
    const resourceLoader = new DefaultResourceLoader({ cwd: tempDir, agentDir: tempDir, noSkills: true });
    await resourceLoader.reload();

    const usageEvents: AgentUsageMetrics[] = [];
    const taskTool = createTaskTool({
      cwd: tempDir,
      model,
      thinkingLevel: selection.thinkingLevel,
      authStorage: selection.authStorage,
      resourceLoader,
      onUsage: (usage) => usageEvents.push(usage),
    });

    const result = await taskTool.execute(
      'call_child_1',
      { prompt: 'Reply exactly OK.' },
      undefined,
      undefined,
      {} as ExtensionContext,
    );
    assert.equal(result.content[0]?.type, 'text');
    assert.match(result.content[0]?.type === 'text' ? result.content[0].text : '', /OK/);
    assert.equal(usageEvents.length, 1);

    const usage = usageEvents[0];
    assert.ok(usage);
    assert.deepEqual(
      {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        cacheReadTokens: usage.cacheReadTokens,
        cacheWriteTokens: usage.cacheWriteTokens,
        numTurns: usage.numTurns,
      },
      {
        inputTokens: 13,
        outputTokens: 8,
        reasoningTokens: 3,
        cacheReadTokens: 5,
        cacheWriteTokens: 2,
        numTurns: 1,
      },
    );
    assert.ok(usage.costUsd > 0);
    assert.equal(requestBody?.model, 'gpt-5.6-luna');
    assert.deepEqual(requestBody?.reasoning, { effort: 'low', summary: 'auto' });
  } finally {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
    await rm(tempDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
