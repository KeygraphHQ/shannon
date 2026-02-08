// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createOpencode } from '@opencode-ai/sdk';
import type { AssistantMessage, Part, ToolPart } from '@opencode-ai/sdk';
import chalk, { type ChalkInstance } from 'chalk';

import { Timer } from '../../utils/metrics.js';
import { filterJsonToolCalls } from '../../utils/output-formatter.js';
import { detectApiError } from '../message-handlers.js';
import {
  formatAssistantOutput,
  formatResultOutput,
  formatToolResultOutput,
  formatToolUseOutput,
} from '../output-formatters.js';
import type { ExecutionContext } from '../types.js';
import type { AuditLogger } from '../audit-logger.js';
import type { ProgressManager } from '../progress-manager.js';

interface OpenCodeMessageLoopDeps {
  execContext: ExecutionContext;
  description: string;
  colorFn: ChalkInstance;
  progress: ProgressManager;
  auditLogger: AuditLogger;
}

interface OpenCodeMessageLoopResult {
  turnCount: number;
  result: string | null;
  apiErrorDetected: boolean;
  cost: number;
  model?: string | undefined;
}

interface OpenCodeModel {
  providerID: string;
  modelID: string;
}

interface OpenCodePromptResponse {
  info: AssistantMessage;
  parts: Part[];
}

interface OpenCodeSession {
  id: string;
}

interface OpenCodeResponseEnvelope<T> {
  data: T;
}

const MIN_OPENCODE_PORT = 19000;
const MAX_OPENCODE_PORT = 29000;
const MAX_START_ATTEMPTS = 5;

function outputLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

function unwrapData<T>(value: unknown): T {
  if (value && typeof value === 'object' && 'data' in value) {
    return (value as OpenCodeResponseEnvelope<T>).data;
  }
  return value as T;
}

function getRandomPort(): number {
  const range = MAX_OPENCODE_PORT - MIN_OPENCODE_PORT;
  return MIN_OPENCODE_PORT + Math.floor(Math.random() * range);
}

function isAddressInUseError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const lower = error.message.toLowerCase();
  return lower.includes('eaddrinuse') || lower.includes('address already in use');
}

function parseModelFromEnv(): OpenCodeModel | undefined {
  const model = process.env.OPENCODE_MODEL?.trim();
  if (!model) {
    return undefined;
  }

  let providerID = '';
  let modelID = '';

  if (model.includes('/')) {
    const parts = model.split('/');
    providerID = parts[0] ?? '';
    modelID = parts.slice(1).join('/');
  } else if (model.includes(',')) {
    const parts = model.split(',');
    providerID = parts[0] ?? '';
    modelID = parts.slice(1).join(',');
  }

  if (!providerID || !modelID) {
    console.log(chalk.yellow(`    Invalid OPENCODE_MODEL format: ${model}`));
    console.log(chalk.yellow('    Expected format: provider/model or provider,model'));
    return undefined;
  }

  return { providerID, modelID };
}

function extractAssistantText(parts: Part[]): string {
  return parts
    .filter((part): part is Part & { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
    .trim();
}

function formatModelName(message: AssistantMessage): string | undefined {
  if (message.providerID && message.modelID) {
    return `${message.providerID}/${message.modelID}`;
  }
  return undefined;
}

async function handleToolPart(
  part: ToolPart,
  deps: OpenCodeMessageLoopDeps,
  toolStarts: Set<string>,
  toolEnds: Set<string>
): Promise<void> {
  const { auditLogger } = deps;
  const state = part.state;
  const input = state.input || {};

  if ((state.status === 'pending' || state.status === 'running') && !toolStarts.has(part.callID)) {
    toolStarts.add(part.callID);
    outputLines(formatToolUseOutput(part.tool, input));
    await auditLogger.logToolStart(part.tool, input);
  }

  if ((state.status === 'completed' || state.status === 'error') && !toolEnds.has(part.callID)) {
    if (!toolStarts.has(part.callID)) {
      toolStarts.add(part.callID);
      outputLines(formatToolUseOutput(part.tool, input));
      await auditLogger.logToolStart(part.tool, input);
    }

    toolEnds.add(part.callID);

    const resultContent = state.status === 'completed' ? state.output : state.error;
    outputLines(formatToolResultOutput(String(resultContent || '')));
    await auditLogger.logToolEnd(resultContent);
  }
}

async function startOpenCodeSession() {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt++) {
    const port = getRandomPort();
    try {
      const instance = await createOpencode({
        hostname: '127.0.0.1',
        port,
        timeout: 15000,
      });
      return instance;
    } catch (error) {
      if (isAddressInUseError(error) && attempt < MAX_START_ATTEMPTS) {
        continue;
      }

      if (error instanceof Error) {
        lastError = error;
      } else {
        lastError = new Error(String(error));
      }
      break;
    }
  }

  if (lastError && lastError.message.includes('spawn opencode ENOENT')) {
    throw new Error('OpenCode CLI not installed. Install opencode and ensure it is on PATH.');
  }

  throw lastError ?? new Error('Failed to start OpenCode server');
}

export async function processOpenCodeMessageStream(
  fullPrompt: string,
  sourceDir: string,
  deps: OpenCodeMessageLoopDeps,
  timer: Timer
): Promise<OpenCodeMessageLoopResult> {
  const { execContext, description, colorFn, progress, auditLogger } = deps;
  const opencode = await startOpenCodeSession();

  try {
    const session = unwrapData<OpenCodeSession>(await opencode.client.session.create({
      body: { title: description },
      query: { directory: sourceDir },
      responseStyle: 'data',
      throwOnError: true,
    }));

    const configuredModel = parseModelFromEnv();
    const agent = process.env.OPENCODE_AGENT?.trim() || 'build';

    const responseBody: {
      agent: string;
      parts: Array<{ type: 'text'; text: string }>;
      model?: OpenCodeModel;
    } = {
      agent,
      parts: [{ type: 'text', text: fullPrompt }],
    };

    if (configuredModel) {
      responseBody.model = configuredModel;
    }

    const response = unwrapData<OpenCodePromptResponse>(await opencode.client.session.prompt({
      path: { id: session.id },
      query: { directory: sourceDir },
      body: responseBody,
      responseStyle: 'data',
      throwOnError: true,
    }));

    if (response.info.error) {
      const errorData = response.info.error.data as { message?: string } | undefined;
      const message = errorData?.message || response.info.error.name || 'OpenCode execution failed';
      throw new Error(message);
    }

    const toolStarts = new Set<string>();
    const toolEnds = new Set<string>();
    for (const part of response.parts) {
      if (part.type === 'tool') {
        await handleToolPart(part, deps, toolStarts, toolEnds);
      }
    }

    const rawContent = extractAssistantText(response.parts);
    const cleanedContent = filterJsonToolCalls(rawContent);

    if (cleanedContent.trim()) {
      progress.stop();
      outputLines(
        formatAssistantOutput(cleanedContent, execContext, 1, description, colorFn)
      );
      progress.start();
    }

    if (rawContent.trim()) {
      await auditLogger.logLlmResponse(1, rawContent);
    }

    const apiError = detectApiError(rawContent);
    if (apiError.shouldThrow) {
      throw apiError.shouldThrow;
    }

    const durationMs = Math.max(0, Date.now() - timer.startTime);
    const cost = response.info.cost || 0;

    outputLines(
      formatResultOutput(
        {
          result: rawContent || null,
          cost,
          duration_ms: durationMs,
          permissionDenials: 0,
        },
        !execContext.useCleanOutput
      )
    );

    const model = formatModelName(response.info);
    return {
      turnCount: rawContent ? 1 : 0,
      result: rawContent || null,
      apiErrorDetected: apiError.detected,
      cost,
      ...(model && { model }),
    };
  } finally {
    opencode.server.close();
  }
}
