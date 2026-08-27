// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** One structured-generation request with exactly one output-schema tool. */
export interface StructuredGenerationRequest {
  systemPrompt?: string;
  userContent: string;
  tool: {
    name: 'submit_result';
    description: string;
    parametersJsonSchema: Record<string, unknown>;
  };
  maxTokens: number;
  signal?: AbortSignal;
}

/** Typed classification of a failed provider request, set whenever `errorMessage` is. */
export interface StructuredGenerationProviderFailure {
  readonly type: 'AuthenticationError' | 'ConfigurationError' | 'AgentExecutionError';
  readonly retryable: boolean;
}

/** Host-neutral outcome of one structured generation request. */
export interface StructuredGenerationResult {
  stopReason: 'toolUse' | 'stop' | 'length' | 'error' | 'aborted';
  toolCalls: Array<{ name: string; arguments: unknown }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
  errorMessage?: string;
  /** Consumers branch on this typed flag, never on `errorMessage` text. */
  providerFailure?: StructuredGenerationProviderFailure;
}

/** Host-supplied transport that makes exactly one model request per call. */
export interface StructuredGenerationPort<TModelContext> {
  generate(request: StructuredGenerationRequest, modelContext: TModelContext): Promise<StructuredGenerationResult>;
}
