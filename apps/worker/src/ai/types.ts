// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

// Type definitions for Claude executor message processing pipeline

import type { SDKAssistantMessageError } from '@anthropic-ai/claude-agent-sdk';

export interface ExecutionContext {
  isParallelExecution: boolean;
  useCleanOutput: boolean;
  agentType: string;
  agentKey: string;
}

export interface AssistantResult {
  content: string;
  cleanedContent: string;
  apiErrorDetected: boolean;
  shouldThrow?: Error;
  logData: {
    turn: number;
    content: string;
    timestamp: string;
  };
}

export interface ResultData {
  result: string | null;
  cost: number;
  duration_ms: number;
  subtype?: string;
  stop_reason?: string | null;
  permissionDenials: number;
  structuredOutput?: unknown;
}

export interface ToolUseData {
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResultData {
  content: unknown;
  displayContent: string;
  timestamp: string;
}

export interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  data?: string;
}

export interface AssistantMessage {
  type: 'assistant';
  error?: SDKAssistantMessageError;
  message: {
    content: ContentBlock[] | string;
  };
}

export interface ResultMessage {
  type: 'result';
  result?: string;
  total_cost_usd?: number;
  duration_ms?: number;
  subtype?: string;
  stop_reason?: string | null;
  permission_denials?: unknown[];
  structured_output?: unknown;
}

export interface ToolUseMessage {
  type: 'tool_use';
  name: string;
  input?: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'tool_result';
  content?: unknown;
}

export interface ApiErrorDetection {
  detected: boolean;
  shouldThrow?: Error;
}

export interface SystemInitMessage {
  type: 'system';
  subtype: 'init';
  model?: string;
  permissionMode?: string;
}

/** Emitted when a model refuses a request and the SDK falls back to another model (e.g. Fable 5 routing cybersecurity tasks to Opus 4.8). */
export interface ModelRefusalFallbackMessage {
  type: 'system';
  subtype: 'model_refusal_fallback';
  original_model: string;
  fallback_model: string;
  api_refusal_category?: string | null;
}

export interface UserMessage {
  type: 'user';
}
