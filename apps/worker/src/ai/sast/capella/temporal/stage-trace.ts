// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** The per-stage trace surface that fans Capella session lines into the scan log. */

import { type TraceActor, WorkflowLogger } from '../../../../audit/workflow-logger.js';
import type { CapellaStageTrace, CapellaTraceLog } from '../../../pi/capella-agent-types.js';
import type { CapellaStage } from '../../types.js';

/**
 * A raw trace surface for one stage's PI sessions. It holds no per-`toolCallId` state — the
 * executor owns correlation — so it is safe to share across a stage's concurrent sessions. One
 * serialization queue keeps every line intact and lets `drain` guarantee no line is still buffered
 * when the activity returns; a failed write cannot fail the stage. Each `forSession` view carries
 * its display label into the trace prefix's session component.
 */
export function createCapellaStageTrace(workflowLogPath: string, stage: CapellaStage): CapellaStageTrace {
  let queue: Promise<void> = Promise.resolve();
  const enqueue = (operation: () => Promise<void>): void => {
    queue = queue.then(operation, operation).catch(() => undefined);
  };
  const forSession = (sessionLabel: string | undefined): CapellaTraceLog => {
    const actor: TraceActor =
      sessionLabel !== undefined ? { kind: 'sast', stage, session: sessionLabel } : { kind: 'sast', stage };
    return {
      toolCall: (invocation) => enqueue(() => WorkflowLogger.logToolCall(workflowLogPath, actor, invocation)),
      toolOutcome: (outcome) => enqueue(() => WorkflowLogger.logToolOutcome(workflowLogPath, actor, outcome)),
      sessionComplete: (durationMs, turns, operations) =>
        enqueue(() => WorkflowLogger.logSessionComplete(workflowLogPath, actor, durationMs, turns, operations)),
    };
  };
  return {
    forSession,
    drain: async () => {
      await queue;
    },
  };
}
