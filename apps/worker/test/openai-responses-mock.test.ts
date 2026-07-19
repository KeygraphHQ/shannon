// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import { test } from 'node:test';
import { Type } from '@earendil-works/pi-ai';
import {
  createAgentSession,
  defineTool,
  ModelRegistry,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { resolveModelSelection } from '../src/ai/models.js';

interface MockRequest {
  body: Record<string, unknown>;
  authorization?: string | undefined;
  method?: string | undefined;
  url?: string | undefined;
}

function writeEvents(response: http.ServerResponse, events: Array<Record<string, unknown>>): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
  for (const event of events) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.write('data: [DONE]\n\n');
  response.end();
}

function reasoningItem() {
  return {
    type: 'reasoning',
    id: 'rs_mock_1',
    status: 'completed',
    summary: [{ type: 'summary_text', text: 'Call the echo tool.' }],
    encrypted_content: 'encrypted-mock-reasoning',
  };
}

function functionCallItem() {
  return {
    type: 'function_call',
    id: 'fc_mock_1',
    call_id: 'call_mock_1',
    name: 'echo',
    arguments: '{"value":"ping"}',
    status: 'completed',
  };
}

function firstTurnEvents(): Array<Record<string, unknown>> {
  const reasoning = reasoningItem();
  const functionCall = functionCallItem();
  return [
    { type: 'response.created', response: { id: 'resp_mock_1' } },
    { type: 'response.output_item.added', output_index: 0, item: reasoning },
    { type: 'response.output_item.done', output_index: 0, item: reasoning },
    { type: 'response.output_item.added', output_index: 1, item: functionCall },
    { type: 'response.function_call_arguments.done', output_index: 1, arguments: functionCall.arguments },
    { type: 'response.output_item.done', output_index: 1, item: functionCall },
    {
      type: 'response.completed',
      response: {
        id: 'resp_mock_1',
        status: 'completed',
        output: [reasoning, functionCall],
        usage: {
          input_tokens: 20,
          input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
          output_tokens: 8,
          output_tokens_details: { reasoning_tokens: 3 },
          total_tokens: 28,
        },
      },
    },
  ];
}

function secondTurnEvents(): Array<Record<string, unknown>> {
  const message = {
    type: 'message',
    id: 'msg_mock_2',
    role: 'assistant',
    status: 'completed',
    content: [{ type: 'output_text', text: 'OK', annotations: [] }],
  };
  return [
    { type: 'response.created', response: { id: 'resp_mock_2' } },
    { type: 'response.output_item.added', output_index: 0, item: message },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'OK' },
    { type: 'response.output_item.done', output_index: 0, item: message },
    {
      type: 'response.completed',
      response: {
        id: 'resp_mock_2',
        status: 'completed',
        output: [message],
        usage: {
          input_tokens: 30,
          input_tokens_details: { cached_tokens: 5, cache_write_tokens: 0 },
          output_tokens: 2,
          output_tokens_details: { reasoning_tokens: 0 },
          total_tokens: 32,
        },
      },
    },
  ];
}

test('Pi executes a mocked OpenAI Responses tool roundtrip with stateless reasoning replay', async () => {
  const requests: MockRequest[] = [];
  const server = http.createServer((request, response) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      requests.push({
        body: JSON.parse(raw) as Record<string, unknown>,
        authorization: request.headers.authorization,
        method: request.method,
        url: request.url,
      });
      if (requests.length === 1) writeEvents(response, firstTurnEvents());
      else if (requests.length === 2) writeEvents(response, secondTurnEvents());
      else {
        response.writeHead(500).end('unexpected request');
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Mock server did not bind to a TCP port');

  const previous = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = 'test-openai-key';
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    const selection = resolveModelSelection((auth) => ModelRegistry.create(auth), 'large');
    const model = { ...selection.model, baseUrl: `http://127.0.0.1:${address.port}/v1` };
    const echo = defineTool({
      name: 'echo',
      label: 'Echo',
      description: 'Return a fixed mocked value.',
      parameters: Type.Object({ value: Type.String() }),
      async execute(_toolCallId, params) {
        assert.equal(params.value, 'ping');
        return { content: [{ type: 'text' as const, text: 'pong' }], details: undefined };
      },
    });

    ({ session } = await createAgentSession({
      cwd: os.tmpdir(),
      model,
      thinkingLevel: selection.thinkingLevel,
      customTools: [echo],
      authStorage: selection.authStorage,
      sessionManager: SessionManager.inMemory(),
      settingsManager: SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: false } }),
    }));

    await session.prompt('Use the echo tool, then reply OK.');
    assert.equal(session.getLastAssistantText(), 'OK');
    assert.equal(requests.length, 2);

    const first = requests[0];
    const second = requests[1];
    assert.ok(first && second);
    assert.equal(first.method, 'POST');
    assert.equal(first.url, '/v1/responses');
    assert.equal(first.authorization, 'Bearer test-openai-key');
    assert.equal(first.body.model, 'gpt-5.6-sol');
    assert.equal(first.body.store, false);
    assert.deepEqual(first.body.reasoning, { effort: 'medium', summary: 'auto' });

    const firstTools = first.body.tools as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(firstTools));
    const echoTool = firstTools.find((tool) => tool.type === 'function' && tool.name === 'echo');
    assert.ok(echoTool);
    const parameters = echoTool.parameters as Record<string, unknown>;
    assert.equal(parameters.type, 'object');
    assert.deepEqual(parameters.required, ['value']);
    const properties = parameters.properties as Record<string, Record<string, unknown>>;
    assert.equal(properties.value?.type, 'string');

    assert.equal(second.method, 'POST');
    assert.equal(second.url, '/v1/responses');
    assert.equal(second.authorization, 'Bearer test-openai-key');
    assert.equal(second.body.model, 'gpt-5.6-sol');
    assert.equal(second.body.store, false);
    const secondInput = second.body.input as Array<Record<string, unknown>>;
    assert.ok(
      secondInput.some((item) => item.type === 'reasoning' && item.encrypted_content === 'encrypted-mock-reasoning'),
    );
    const replayedCall = secondInput.find((item) => item.type === 'function_call');
    assert.ok(replayedCall);
    assert.equal(replayedCall.call_id, 'call_mock_1');
    assert.equal(replayedCall.name, 'echo');
    assert.equal(replayedCall.arguments, '{"value":"ping"}');
    const toolOutput = secondInput.find((item) => item.type === 'function_call_output');
    assert.ok(toolOutput);
    assert.equal(toolOutput.call_id, 'call_mock_1');
    assert.equal(toolOutput.output, 'pong');
    assert.ok(session.getSessionStats().cost > 0);
  } finally {
    session?.dispose();
    if (previous === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});
