// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Per-session trace emitter. Owns the PI `toolCallId` correlation and the ordering
 * of one agent or subagent's trace lines, then writes them through the stateless
 * `WorkflowLogger` formatter. One instance per parent agent run or per delegated
 * child session, so parallel calls never cross.
 */

import { captureToolInvocation, decideToolOutcome } from '../../audit/trace.js';
import { type ChildTaskFailureCode, type TraceActor, WorkflowLogger } from '../../audit/workflow-logger.js';

interface PendingCall {
  readonly tool: string;
  readonly startedAt: number;
  readonly count?: (() => number | undefined) | undefined;
}

export class TraceEmitter {
  private queue: Promise<void> = Promise.resolve();
  private readonly pending = new Map<string, PendingCall>();

  constructor(
    private readonly logPath: string,
    private readonly actor: TraceActor,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Snapshot and log a tool call's complete arguments. `count`, when supplied, is an
   * accessor for that specific collector's existing submitted-array count outcome.
   */
  toolStart(toolCallId: string, toolName: string, args: unknown, count?: () => number | undefined): void {
    const invocation = captureToolInvocation(toolName, args);
    this.pending.set(toolCallId, { tool: toolName, startedAt: this.now(), count });
    if (invocation !== undefined) this.enqueue(() => WorkflowLogger.logToolCall(this.logPath, this.actor, invocation));
  }

  toolEnd(toolCallId: string, isError: boolean): void {
    const call = this.pending.get(toolCallId);
    if (call === undefined) return;
    this.pending.delete(toolCallId);
    const outcome = decideToolOutcome(call.tool, isError, this.now() - call.startedAt, call.count?.());
    if (outcome !== undefined) this.enqueue(() => WorkflowLogger.logToolOutcome(this.logPath, this.actor, outcome));
  }

  /** Queue and await delegation on the parent emitter before a child session can start. */
  delegationStart(child: string): Promise<void> {
    const actor = this.actor;
    if (actor.kind !== 'agent') return Promise.resolve();
    return this.enqueue(() => WorkflowLogger.logDelegationStart(this.logPath, actor.agent, child));
  }

  sessionComplete(durationMs: number, turns: number, operations: number): void {
    this.enqueue(() => WorkflowLogger.logSessionComplete(this.logPath, this.actor, durationMs, turns, operations));
  }

  sessionFailure(code: ChildTaskFailureCode, durationMs: number): void {
    this.enqueue(() => WorkflowLogger.logSessionFailure(this.logPath, this.actor, code, durationMs));
  }

  // Chained regardless of outcome (`then(operation, operation)`) so one write's rejection cannot
  // stall the ones queued after it, and the trailing catch swallows the failure entirely: a trace
  // line is diagnostic only, so losing one must never surface as, or block, the agent's own result.
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(operation, operation).catch(() => undefined);
    return this.queue;
  }

  /** Await all queued writes so a caller can order a terminal line after them. */
  async flush(): Promise<void> {
    await this.queue;
  }
}
