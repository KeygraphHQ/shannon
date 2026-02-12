// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * OpenAI-compatible provider executor.
 * Implements agentic loop with tool calling, yielding messages in Claude SDK format.
 */

import OpenAI from 'openai';
import { getProviderConfig } from './provider-config.js';
import {
  getBuiltinOpenAITools,
  executeBuiltinTool,
  isBuiltinTool,
  type OpenAITool,
} from './openai-tools.js';
import { getShannonHelperTools, createPlaywrightMcpClient, type StdioMcpConfig } from './mcp-client.js';
import { getPromptNameForAgent } from '../types/agents.js';
import { MCP_AGENT_MAPPING } from '../constants.js';
import type { AgentName } from '../types/index.js';

const MAX_TURNS = 10_000;
const PLAYWRIGHT_MCP_TIMEOUT_MS = 45_000;

function createSemaphore(max: number): { acquire: () => Promise<void>; release: () => void } {
  let permits = max;
  const waitQueue: Array<() => void> = [];
  return {
    acquire: () => {
      if (permits > 0) {
        permits--;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        waitQueue.push(() => {
          permits--;
          resolve();
        });
      });
    },
    release: () => {
      permits++;
      if (waitQueue.length > 0) {
        const next = waitQueue.shift()!;
        next();
      }
    },
  };
}

let requestSemaphore: ReturnType<typeof createSemaphore> | null = null;

function getRequestSemaphore(): ReturnType<typeof createSemaphore> {
  if (!requestSemaphore) {
    const max = Math.max(1, parseInt(process.env.AI_MAX_CONCURRENT_REQUESTS ?? '2', 10) || 2);
    requestSemaphore = createSemaphore(max);
  }
  return requestSemaphore;
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId!));
}

export interface OpenAIOptions {
  cwd: string;
  maxTurns?: number;
  mcpServers?: Record<string, unknown> | undefined;
}

export interface OpenAIQueryParams {
  prompt: string;
  options: OpenAIOptions;
  sourceDir: string;
  agentName: string | null;
}

type MessageStreamYield =
  | { type: 'system'; subtype: 'init'; model?: string; permissionMode?: string; mcp_servers?: Array<{ name: string; status: string }> }
  | { type: 'assistant'; message: { content: Array<{ type?: string; text?: string }> | string } }
  | { type: 'tool_use'; name: string; input?: Record<string, unknown> }
  | { type: 'tool_result'; content?: unknown }
  | { type: 'result'; result?: string; total_cost_usd?: number; duration_ms?: number };

const SKIP_PLAYWRIGHT_PROMPTS = new Set(['pre-recon-code', 'report-executive']);

function buildPlaywrightStdioConfig(
  sourceDir: string,
  agentName: string | null
): StdioMcpConfig | null {
  if (!agentName) return null;

  const promptName = getPromptNameForAgent(agentName as AgentName);
  if (SKIP_PLAYWRIGHT_PROMPTS.has(promptName)) return null;

  const playwrightMcpName = MCP_AGENT_MAPPING[promptName as keyof typeof MCP_AGENT_MAPPING] || null;
  if (!playwrightMcpName) return null;

  const userDataDir = `/tmp/${playwrightMcpName}`;
  const isDocker = process.env.SHANNON_DOCKER === 'true';

  const mcpArgs: string[] = [
    '@playwright/mcp@latest',
    '--isolated',
    '--user-data-dir', userDataDir,
  ];

  if (isDocker) {
    mcpArgs.push('--executable-path', '/usr/bin/chromium-browser');
    mcpArgs.push('--browser', 'chromium');
  }

  const envVars: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...process.env,
      PLAYWRIGHT_HEADLESS: 'true',
      ...(isDocker && { PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' }),
    }).filter((entry): entry is [string, string] => entry[1] !== undefined)
  );

  return {
    command: 'npx',
    args: mcpArgs,
    env: envVars,
  };
}

async function* openaiQueryInternal(params: OpenAIQueryParams): AsyncGenerator<MessageStreamYield> {
  const { prompt, options, sourceDir, agentName } = params;
  const config = getProviderConfig();
  const openaiConfig = config.openai;
  if (!openaiConfig) {
    throw new Error('OpenAI provider config missing');
  }

  const requestTimeoutMs = parseInt(process.env.AI_REQUEST_TIMEOUT_MS ?? '120000', 10) || 120000;

  const client = new OpenAI({
    baseURL: openaiConfig.baseUrl,
    apiKey: openaiConfig.apiKey || 'dummy', // Some local servers accept any key
    timeout: requestTimeoutMs,
  });

  const ctx = { cwd: sourceDir };
  const tools: OpenAITool[] = [...getBuiltinOpenAITools()];
  const toolHandlers: Map<string, (args: Record<string, unknown>) => Promise<string>> = new Map();

  // Add Shannon helper tools
  const shannonHelper = getShannonHelperTools(sourceDir);
  tools.push(...shannonHelper.tools);
  for (const t of shannonHelper.tools) {
    toolHandlers.set(t.function.name, (args) => shannonHelper.execute(t.function.name, args));
  }

  // Optionally add Playwright MCP
  let playwrightClient: Awaited<ReturnType<typeof createPlaywrightMcpClient>> | null = null;
  const playwrightConfig = buildPlaywrightStdioConfig(sourceDir, agentName);
  if (playwrightConfig) {
    try {
      playwrightClient = await withTimeout(
        createPlaywrightMcpClient(playwrightConfig),
        PLAYWRIGHT_MCP_TIMEOUT_MS,
        `Playwright MCP failed to connect within ${PLAYWRIGHT_MCP_TIMEOUT_MS / 1000}s`
      );
      tools.push(...playwrightClient.tools);
      for (const t of playwrightClient.tools) {
        toolHandlers.set(t.function.name, (args) => playwrightClient!.executeTool(t.function.name, args));
      }
    } catch (err) {
      console.warn(`Playwright MCP failed to start: ${err instanceof Error ? err.message : err}`);
    }
  }

  const openaiTools = tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    },
  }));

  yield {
    type: 'system',
    subtype: 'init',
    model: openaiConfig.model,
    permissionMode: 'bypassPermissions',
    mcp_servers: [
      { name: 'shannon-helper', status: 'connected' },
      ...(playwrightClient ? [{ name: 'playwright', status: 'connected' as const }] : []),
    ],
  };

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'user', content: prompt },
  ];

  const maxTurns = options.maxTurns ?? MAX_TURNS;
  const startTime = Date.now();
  let lastAssistantContent = '';
  const savedDeliverableTypes = new Set<string>();

  for (let turn = 0; turn < maxTurns; turn++) {
    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: openaiConfig.model,
      messages,
      stream: false,
    };
    if (openaiTools.length > 0) {
      requestParams.tools = openaiTools;
    }
    const semaphore = getRequestSemaphore();
    await semaphore.acquire();
    let response: Awaited<ReturnType<typeof client.chat.completions.create>>;
    try {
      response = await client.chat.completions.create(requestParams);
    } finally {
      semaphore.release();
    }

    const choice = response.choices[0];
    if (!choice?.message) {
      throw new Error('Empty response from OpenAI-compatible API');
    }

    const msg = choice.message;
    const content = typeof msg.content === 'string' ? msg.content : msg.content ?? '';

    if (content) {
      lastAssistantContent = content;
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: content }] },
      };
    }

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      break;
    }

    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const name = tc.function?.name ?? 'unknown';
      let args: Record<string, unknown> = {};
      try {
        args = typeof tc.function?.arguments === 'string'
          ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
          : {};
      } catch {
        args = {};
      }

      yield { type: 'tool_use', name, input: args };

      let result: string;
      if (name === 'save_deliverable') {
        const deliverableType = String(args.deliverable_type ?? '');
        if (savedDeliverableTypes.has(deliverableType)) {
          result = JSON.stringify({
            status: 'success',
            message: 'This deliverable was already saved. Do not call save_deliverable again. Reply with your completion message only (e.g. "PRE-RECON CODE ANALYSIS COMPLETE" or "Done") and no further tool calls.',
          });
        } else {
          const handler = toolHandlers.get(name);
          result = handler ? await handler(args) : JSON.stringify({ error: 'Unknown tool' });
          try {
            const parsed = JSON.parse(result) as { status?: string };
            if (parsed.status === 'success') {
              savedDeliverableTypes.add(deliverableType);
            }
          } catch {
            // ignore parse errors
          }
        }
      } else {
        const handler = toolHandlers.get(name);
        if (handler) {
          result = await handler(args);
        } else if (isBuiltinTool(name)) {
          result = await executeBuiltinTool(name, args, ctx);
        } else {
          result = JSON.stringify({ error: `Unknown tool: ${name}` });
        }
      }

      yield { type: 'tool_result', content: result };

      messages.push({
        role: 'tool',
        tool_call_id: tc.id ?? `call_${turn}_${name}`,
        content: result,
      });
    }
  }

  playwrightClient?.close();

  const durationMs = Date.now() - startTime;

  yield {
    type: 'result',
    result: lastAssistantContent,
    total_cost_usd: 0,
    duration_ms: durationMs,
  };
}

/**
 * Async generator that yields messages in Claude SDK format.
 * Use with processMessageStream for compatibility with existing pipeline.
 */
export async function* openaiQuery(params: OpenAIQueryParams): AsyncGenerator<MessageStreamYield> {
  yield* openaiQueryInternal(params);
}
