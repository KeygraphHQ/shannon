/** One bounded structured-generation request for one nonempty class batch. */

import type { ReconciliationClass } from '../../../../types/reconciliation.js';
import type {
  StructuredGenerationPort,
  StructuredGenerationRequest,
  StructuredGenerationResult,
} from '../../../structured-generation.js';
import { SAST_ENRICHMENT_TOOL_DESCRIPTION, sastEnrichmentToolSchema } from './schema.js';
import { extractVulnerabilities } from './validate.js';

export interface SastEnrichmentUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type SastEnrichmentBatchOutcome =
  | { status: 'ok'; vulnerabilities: unknown[]; usage: SastEnrichmentUsage }
  | { status: 'aborted'; usage: SastEnrichmentUsage; message: string }
  | { status: 'failed'; usage: SastEnrichmentUsage; message: string; terminal: boolean };

export interface SastEnrichmentBatchRequest {
  vulnerabilityClass: ReconciliationClass;
  prompt: string;
  findingsJson: string;
  maxTokens: number;
  signal?: AbortSignal;
}

// `terminal` marks a failure the stage should not retry. It is set only when the provider itself
// reported a non-retryable failure; an incomplete or empty response defaults to non-terminal so
// Temporal drives another attempt.
function isTerminalProviderFailure(result: StructuredGenerationResult): boolean {
  return result.providerFailure?.retryable === false;
}

export async function runSastEnrichmentBatch<TModelContext>(
  port: StructuredGenerationPort<TModelContext>,
  modelContext: TModelContext,
  request: SastEnrichmentBatchRequest,
): Promise<SastEnrichmentBatchOutcome> {
  const generationRequest: StructuredGenerationRequest = {
    userContent: `${request.prompt}\n${request.findingsJson}`,
    tool: {
      name: 'submit_result',
      description: SAST_ENRICHMENT_TOOL_DESCRIPTION,
      parametersJsonSchema: sastEnrichmentToolSchema(request.vulnerabilityClass),
    },
    maxTokens: request.maxTokens,
    ...(request.signal !== undefined && { signal: request.signal }),
  };
  const result = await port.generate(generationRequest, modelContext);
  const usage = result.usage;

  if (result.stopReason === 'aborted') {
    if (request.signal?.aborted === true) {
      return { status: 'aborted', usage, message: 'SAST enrichment was cancelled' };
    }
    return {
      status: 'failed',
      usage,
      message: 'SAST enrichment request ended before producing a result',
      terminal: false,
    };
  }
  if (
    result.stopReason !== 'toolUse' ||
    result.toolCalls.length !== 1 ||
    result.toolCalls[0]?.name !== 'submit_result'
  ) {
    return {
      status: 'failed',
      usage,
      message: 'SAST enrichment did not return one complete submit_result call',
      terminal: isTerminalProviderFailure(result),
    };
  }

  try {
    return { status: 'ok', vulnerabilities: extractVulnerabilities(result.toolCalls[0].arguments), usage };
  } catch {
    return {
      status: 'failed',
      usage,
      message: 'SAST enrichment returned an invalid response envelope',
      terminal: false,
    };
  }
}
