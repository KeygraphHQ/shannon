// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import type { ModelRole } from '../model-host.js';
import type { CapellaStage, CapellaUsage } from '../sast/types.js';

/** A Capella-owned collector or repository tool installed in one confined session. */
export type CapellaTool = ToolDefinition;

/** One bounded multi-turn Capella model session. */
export interface CapellaAgentRequest<_T> {
  readonly stage: CapellaStage;
  readonly role: ModelRole;
  readonly cwd: string;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly maxTurns: number;
  readonly timeoutMs: number;
  readonly tools: readonly CapellaTool[];
  readonly outputSchema?: TSchema;
  readonly signal: AbortSignal;
}

/** Schema-valid output and measured usage from one completed Capella session. */
export interface CapellaAgentResponse<T> {
  readonly output: T;
  readonly usage: CapellaUsage;
}

/** Standalone executor boundary consumed by the Capella stage implementation. */
export interface CapellaAgentExecutor {
  run<T>(request: CapellaAgentRequest<T>): Promise<CapellaAgentResponse<T>>;
}
