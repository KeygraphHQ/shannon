// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AssistantMessage, Context, ToolCall } from '@earendil-works/pi-ai';
import { Value } from 'typebox/value';
import { providerFailureSentence } from '../../services/error-handling.js';
import { type ModelHost, modelHost } from '../model-host.js';
import type {
  StructuredGenerationPort,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../structured-generation.js';
import { type CapturedSubmitTool, createGenericSubmitTool } from '../submit-tool.js';

const ZERO_USAGE = { inputTokens: 0, outputTokens: 0, costUsd: 0 } as const;

function isSignalCancellation(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted !== true) return false;

  let current: unknown = error;
  const seen = new Set<unknown>();
  for (let depth = 0; depth < 8 && current !== undefined && current !== null && !seen.has(current); depth++) {
    if (current === signal.reason) return true;
    seen.add(current);
    const errorName = current instanceof Error ? current.name : undefined;
    if (errorName === 'AbortError' || errorName === 'CancelledFailure') return true;
    current = current instanceof Error ? current.cause : undefined;
  }
  return false;
}

function responseUsage(response: AssistantMessage): StructuredGenerationResult['usage'] {
  return {
    inputTokens: response.usage.input,
    outputTokens: response.usage.output,
    costUsd: response.usage.cost.total,
  };
}

type SubmitExecutor = (toolCallId: string, parameters: Record<string, unknown>) => Promise<unknown>;

async function captureSingleValidSubmission(
  toolCalls: readonly ToolCall[],
  submitTool: CapturedSubmitTool,
): Promise<Array<{ name: string; arguments: unknown }>> {
  const returnedCalls = toolCalls.map((call) => ({ name: call.name, arguments: call.arguments }));
  const call = toolCalls.length === 1 ? toolCalls[0] : undefined;
  if (call?.name !== submitTool.tool.name) return returnedCalls;

  if (!Value.Check(submitTool.tool.parameters, call.arguments)) return returnedCalls;

  // completeSimple returns tool calls but does not execute them. Invoke the captured
  // definition only after its TypeBox validator accepts the sole submission.
  const execute = submitTool.tool.execute as unknown as SubmitExecutor;
  await execute(call.id, call.arguments);
  const captured = submitTool.getCaptured();
  return [{ name: call.name, arguments: captured }];
}

async function generate(host: ModelHost, request: StructuredGenerationRequest): Promise<StructuredGenerationResult> {
  const submitTool = createGenericSubmitTool(request.tool.parametersJsonSchema);
  const context: Context = {
    ...(request.systemPrompt !== undefined && { systemPrompt: request.systemPrompt }),
    messages: [{ role: 'user', content: request.userContent, timestamp: Date.now() }],
    tools: [
      {
        name: submitTool.tool.name,
        description: request.tool.description,
        parameters: submitTool.tool.parameters,
      },
    ],
  };

  let response: AssistantMessage;
  try {
    const selection = await host.resolve('small');
    // One enrichment batch is one billable provider request. Temporal owns any
    // retry after this boundary, so provider-level retries stay disabled here.
    response = await selection.modelRuntime.completeSimple(selection.model, context, {
      maxTokens: request.maxTokens,
      maxRetries: 0,
      ...(request.signal !== undefined && { signal: request.signal }),
    });
  } catch (error) {
    if (isSignalCancellation(error, request.signal)) {
      return { stopReason: 'aborted', toolCalls: [], usage: ZERO_USAGE };
    }
    const failure = host.classify(error);
    return {
      stopReason: 'error',
      toolCalls: [],
      usage: ZERO_USAGE,
      errorMessage: providerFailureSentence(failure),
      providerFailure: { type: failure.type, retryable: failure.retryable },
    };
  }

  if (response.stopReason === 'error') {
    const failure = host.classify(response);
    return {
      stopReason: 'error',
      toolCalls: [],
      usage: responseUsage(response),
      errorMessage: providerFailureSentence(failure),
      providerFailure: { type: failure.type, retryable: failure.retryable },
    };
  }
  if (response.stopReason === 'aborted') {
    if (request.signal?.aborted === true) {
      return { stopReason: 'aborted', toolCalls: [], usage: responseUsage(response) };
    }
    const failure = host.classify(response);
    return {
      stopReason: 'error',
      toolCalls: [],
      usage: responseUsage(response),
      errorMessage: providerFailureSentence(failure),
      providerFailure: { type: failure.type, retryable: failure.retryable },
    };
  }

  const toolCalls = response.content.filter((block): block is ToolCall => block.type === 'toolCall');
  const capturedCalls = await captureSingleValidSubmission(toolCalls, submitTool);
  return {
    stopReason: response.stopReason,
    toolCalls: capturedCalls,
    usage: responseUsage(response),
  };
}

/** Build the one-request Pi adapter used by SAST enrichment. */
export function createPiStructuredGenerationPort(host: ModelHost = modelHost): StructuredGenerationPort<void> {
  return {
    generate(request: StructuredGenerationRequest): Promise<StructuredGenerationResult> {
      return generate(host, request);
    },
  };
}
