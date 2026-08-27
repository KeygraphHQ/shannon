// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import type { ToolInvocation, ToolOutcome } from '../../audit/trace.js';
import type { ModelRole } from '../model-host.js';
import type { CapellaStage, CapellaUsage } from '../sast/types.js';

/** A Capella-owned collector or repository tool installed in one confined session. */
export type CapellaTool = ToolDefinition;

/**
 * A sink for one Capella session's technical trace. The executor owns `toolCallId`
 * correlation and synchronously snapshots complete tool arguments before handing the
 * immutable invocation to the sink.
 */
export interface CapellaTraceLog {
  toolCall(invocation: ToolInvocation): void;
  toolOutcome(outcome: ToolOutcome): void;
  sessionComplete(durationMs: number, turns: number, operations: number): void;
}

/**
 * One stage's trace surface. `forSession` binds a per-session view (its label becomes the trace
 * prefix's session component); all views share one serialized queue that `drain` awaits, so no
 * session's lines can still be buffered when its activity returns.
 */
export interface CapellaStageTrace {
  forSession(sessionLabel: string | undefined): CapellaTraceLog;
  drain(): Promise<void>;
}

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
  readonly log?: CapellaTraceLog;
  /**
   * Display-only session name for the trace prefix. Never hashed into `workloadId`, a checkpoint
   * key, a usage record, or a prompt; a stage may repeat or omit it without changing execution.
   */
  readonly sessionLabel?: string;
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
