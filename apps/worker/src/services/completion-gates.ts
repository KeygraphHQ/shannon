// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AddExploitInput } from '../collectors/exploit-collector.js';
import type { PreReconCallStatus } from '../collectors/pre-recon-collector.js';
import type { ReconCallStatus } from '../collectors/recon-collector.js';
import type { VulnCallStatus } from '../collectors/vuln-collector.js';
import { ErrorCode } from '../types/errors.js';
import { PentestError } from './error-handling.js';

function incomplete(
  phase: string,
  details: Record<string, unknown>,
  retryable = true,
  code: ErrorCode = ErrorCode.OUTPUT_VALIDATION_FAILED,
): never {
  throw new PentestError(
    `${phase} did not emit all required structured results`,
    'validation',
    retryable,
    { phase, ...details },
    code,
  );
}

function skippedTools(status: Readonly<Record<string, 'called' | 'skipped'>>): string[] {
  return Object.entries(status)
    .filter(([, value]) => value !== 'called')
    .map(([name]) => name);
}

export function assertPreReconComplete(status: PreReconCallStatus): void {
  const missingTools = skippedTools(status);
  if (missingTools.length > 0) {
    incomplete('pre-recon', { missingTools });
  }
}

export function assertReconComplete(status: ReconCallStatus): void {
  const { add_endpoints: endpointStatus, ...oneShotStatus } = status;
  const missingTools = skippedTools(oneShotStatus);
  if (endpointStatus.calls < 1) {
    missingTools.push('add_endpoints');
  }
  if (missingTools.length > 0 || endpointStatus.endpoints_seen < 1) {
    incomplete('recon', {
      missingTools,
      endpointCalls: endpointStatus.calls,
      endpointsSeen: endpointStatus.endpoints_seen,
      ...(endpointStatus.endpoints_seen < 1 && { reason: 'At least one unique network endpoint is required' }),
    });
  }
}

export function assertVulnAnalysisComplete(vulnClass: string, status: VulnCallStatus): void {
  const missingTools = skippedTools(status);
  if (missingTools.length > 0) {
    incomplete(`${vulnClass} vulnerability analysis`, { vulnClass, missingTools });
  }
}

export function assertExploitComplete(
  vulnClass: string,
  queueIds: ReadonlySet<string>,
  verdicts: readonly AddExploitInput[],
): void {
  const verdictIds = verdicts.map((verdict) => verdict.vulnerability_id);
  const uniqueVerdictIds = new Set(verdictIds);
  const missingIds = [...queueIds].filter((id) => !uniqueVerdictIds.has(id));
  const unexpectedIds = [...uniqueVerdictIds].filter((id) => !queueIds.has(id));
  const duplicateIds = [...uniqueVerdictIds].filter(
    (id) => verdictIds.filter((candidate) => candidate === id).length > 1,
  );

  if (missingIds.length > 0 || unexpectedIds.length > 0 || duplicateIds.length > 0) {
    incomplete(
      `${vulnClass} exploitation`,
      {
        vulnClass,
        missingIds,
        unexpectedIds,
        duplicateIds,
        queueSize: queueIds.size,
        verdictCount: verdicts.length,
      },
      false,
      ErrorCode.AGENT_EXECUTION_FAILED,
    );
  }
}
