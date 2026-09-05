// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Workflow-safe public failure projection for Agentic SAST. */

export const CAPELLA_SAFE_FAILURE_MESSAGES = Object.freeze({
  AuthenticationError: 'Provider authentication failed. Verify the configured credential.',
  ConfigurationError: 'Agentic SAST configuration is invalid.',
  InvalidInputError: 'Agentic SAST received invalid input.',
  SastContractError: 'An agentic SAST step returned an unusable result.',
  AgentExecutionError: 'An agentic SAST step failed.',
} as const);

export type CapellaSafeFailureType = keyof typeof CAPELLA_SAFE_FAILURE_MESSAGES;

const CAPELLA_TERMINAL_STAGE_LABELS = Object.freeze({
  architecture: 'architecture',
  'threat-model': 'threat model',
  plan: 'planning',
  research: 'audit wave',
  dedupe: 'deduplication',
  review: 'review',
  critic: 'critic',
  confirm: 'confirmation',
  calibrate: 'calibration',
  export: 'export',
  workflow: 'orchestration',
} as const);

export function capellaTerminalStageLabel(stage: keyof typeof CAPELLA_TERMINAL_STAGE_LABELS): string {
  return CAPELLA_TERMINAL_STAGE_LABELS[stage];
}

export function isCapellaTerminalStageLabel(value: string): boolean {
  return (Object.values(CAPELLA_TERMINAL_STAGE_LABELS) as readonly string[]).includes(value);
}

export function capellaSafeFailureMessage(type: string | null | undefined): string {
  if (type !== undefined && type !== null && type in CAPELLA_SAFE_FAILURE_MESSAGES) {
    return CAPELLA_SAFE_FAILURE_MESSAGES[type as CapellaSafeFailureType];
  }
  return CAPELLA_SAFE_FAILURE_MESSAGES.AgentExecutionError;
}

// The two literal strings below are not produced by this module: they are emitted by the parent
// pentest pipeline when Capella never got far enough to fail its own way (a scan cancelled before
// the child workflow started, or infrastructure that failed before any stage ran). Listing them
// here keeps this predicate the single place that recognizes every message the workflow-safe
// surface is allowed to show, not just this file's own table.
export function isCapellaSafeFailureMessage(message: string): boolean {
  return (
    (Object.values(CAPELLA_SAFE_FAILURE_MESSAGES) as readonly string[]).includes(message) ||
    message === 'Agentic SAST infrastructure failed before producing a usable result.' ||
    message === 'Agentic SAST had not finished when the scan stopped.'
  );
}
