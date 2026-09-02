// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AuditSession } from '../audit/index.js';
import { isLoggableAgentName, type LoggableAgentName, type SafeErrorDetails } from '../audit/safe-fields.js';

/**
 * Per-agent-run error audit sink. `createAuditLogger` always returns one of these
 * (never null), so a caller can log unconditionally without checking whether
 * audit is actually wired up for this run.
 */
export interface AuditLogger {
  logError(error: SafeErrorDetails, duration: number, turns: number): Promise<void>;
  flush(): Promise<void>;
}

class RealAuditLogger implements AuditLogger {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly auditSession: AuditSession,
    private readonly agentName: LoggableAgentName,
    private readonly attemptNumber: number,
  ) {}

  // Serializes writes onto one chain so concurrent calls append in call order rather than racing
  // on the underlying audit session, and swallows failures so a broken audit write never surfaces
  // as the agent's own error: recording an error must not itself risk failing the run.
  private enqueue(operation: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(operation, operation).catch(() => undefined);
    return this.queue;
  }

  logError(error: SafeErrorDetails, duration: number, turns: number): Promise<void> {
    return this.enqueue(() =>
      this.auditSession.logAgentError(this.agentName, error.code, error.category, this.attemptNumber, duration, turns),
    );
  }

  async flush(): Promise<void> {
    await this.queue;
  }
}

/** No-op sink for a run with no audit session or an agent name unsafe to log. */
class NullAuditLogger implements AuditLogger {
  async logError(_error: SafeErrorDetails, _duration: number, _turns: number): Promise<void> {}

  async flush(): Promise<void> {}
}

/**
 * Build the error-audit sink for one agent attempt.
 *
 * Falls back to the null sink whenever real logging can't be done safely: no
 * audit session for this run, no agent name, or a name that isn't in the closed
 * loggable set (`isLoggableAgentName`). An unrecognized name is never written
 * to the durable audit trail, even as a bare string.
 */
export function createAuditLogger(
  auditSession: AuditSession | null,
  agentName: string | null,
  attemptNumber: number,
): AuditLogger {
  if (auditSession !== null && agentName !== null && isLoggableAgentName(agentName)) {
    return new RealAuditLogger(auditSession, agentName, attemptNumber);
  }
  return new NullAuditLogger();
}
