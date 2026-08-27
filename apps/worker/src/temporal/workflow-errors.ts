// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow error formatting utilities.
 * Pure functions with no side effects — safe for Temporal workflow sandbox.
 */

import { WORKFLOW_PHASES } from '../audit/safe-fields.js';
import { ALL_AGENTS } from '../types/agents.js';
import { ErrorCode } from '../types/errors.js';

/**
 * Maps an ApplicationFailure type string to a structured ErrorCode.
 *
 * Activities classify errors via classifyErrorForTemporal() and throw
 * ApplicationFailure with a type string. This function maps those strings
 * to stable ErrorCode values so consumers can switch on codes instead of
 * string-matching error messages.
 */
const ERROR_TYPE_TO_CODE: Record<string, ErrorCode> = {
  AuthenticationError: ErrorCode.AUTH_FAILED,
  ConfigurationError: ErrorCode.CONFIG_VALIDATION_FAILED,
  OutputValidationError: ErrorCode.OUTPUT_VALIDATION_FAILED,
  AgentExecutionError: ErrorCode.AGENT_EXECUTION_FAILED,
  GitError: ErrorCode.GIT_CHECKPOINT_FAILED,
  InvalidTargetError: ErrorCode.TARGET_UNREACHABLE,
  AuthLoginFailedError: ErrorCode.AUTH_LOGIN_FAILED,
  PipelineFailedError: ErrorCode.AGENT_EXECUTION_FAILED,
  ReportDraftError: ErrorCode.AGENT_EXECUTION_FAILED,
  ReportSarifRenderError: ErrorCode.OUTPUT_VALIDATION_FAILED,
  IncompatibleWorkspaceError: ErrorCode.CONFIG_VALIDATION_FAILED,
  WorkspaceNotFoundError: ErrorCode.CONFIG_NOT_FOUND,
};

export function classifyErrorCode(error: unknown): ErrorCode | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if ('type' in current && typeof (current as { type: unknown }).type === 'string') {
      const code = ERROR_TYPE_TO_CODE[(current as { type: string }).type];
      if (code) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/**
 * Maps Temporal error type strings to actionable remediation hints. A type earns an entry
 * only when the reader has a next step to take; the rest print without a hint line.
 */
const REMEDIATION_HINTS: Record<string, string> = {
  AuthenticationError: "Verify the selected provider's API key is valid and not expired.",
  ConfigurationError: 'Check your CONFIG file path and contents.',
  GitError: 'Check repository path and git state.',
  InvalidTargetError: 'Verify the target URL is correct and accessible.',
  IncompatibleWorkspaceError: 'start a new scan with a different -w name.',
  WorkspaceNotFoundError: 'check the -w name against: shannon scans',
  PipelineFailedError: 're-run the same -w to retry from the last checkpoint.',
};

const SAFE_WORKFLOW_FAILURE_MESSAGES: Readonly<Record<string, string>> = {
  AuthenticationError: 'Provider authentication failed.',
  ConfigurationError: 'The scan configuration is invalid.',
  OutputValidationError: 'A scan step returned an unusable result.',
  AgentExecutionError: 'An agent could not complete its work.',
  GitError: 'The scan checkpoint could not be updated.',
  InvalidTargetError: 'The target could not be reached.',
  AuthLoginFailedError: 'The configured login could not be completed.',
  PipelineFailedError: 'The vulnerability analysis phase could not be completed.',
  ReportDraftError: 'The report could not be saved.',
  ReportSarifRenderError: 'The report SARIF output could not be rendered.',
  IncompatibleWorkspaceError: 'This workspace cannot be resumed.',
  WorkspaceNotFoundError: 'The requested workspace was not found.',
};

const WORKFLOW_PHASE_SET = new Set<string>(WORKFLOW_PHASES);
const AGENT_NAME_SET = new Set<string>(ALL_AGENTS);

/**
 * Walk the .cause chain to find the innermost approved failure type.
 * Temporal wraps ApplicationFailure in ActivityFailure, so classification must inspect causes.
 *
 * Uses duck-typing because workflow code cannot import @temporalio/activity types.
 */
function unwrapActivityError(error: unknown): { type: string | null } {
  let current: unknown = error;
  let type: string | null = null;

  while (current instanceof Error) {
    if ('type' in current && typeof (current as { type: unknown }).type === 'string') {
      const candidate = (current as { type: string }).type;
      if (candidate in SAFE_WORKFLOW_FAILURE_MESSAGES) type = candidate;
    }
    current = (current as { cause?: unknown }).cause;
  }

  return { type };
}

/**
 * Format a structured, closed-field error string from workflow catch context.
 * Segments are delimited by | for multi-line rendering by WorkflowLogger.
 */
export function formatWorkflowError(error: unknown, currentPhase: string | null, currentAgent: string | null): string {
  const unwrapped = unwrapActivityError(error);

  // Phase context (first segment)
  let phaseContext = 'Pipeline failed';
  const safePhase = currentPhase !== null && WORKFLOW_PHASE_SET.has(currentPhase) ? currentPhase : null;
  const safeAgent = currentAgent !== null && AGENT_NAME_SET.has(currentAgent) ? currentAgent : null;
  if (safePhase && safeAgent && safePhase !== safeAgent) {
    phaseContext = `${safePhase} failed (agent: ${safeAgent})`;
  } else if (safePhase) {
    phaseContext = `${safePhase} failed`;
  }

  const segments: string[] = [phaseContext];

  if (unwrapped.type) {
    segments.push(unwrapped.type);
  }

  segments.push(
    unwrapped.type === null
      ? 'The scan could not be completed.'
      : (SAFE_WORKFLOW_FAILURE_MESSAGES[unwrapped.type] ?? 'The scan could not be completed.'),
  );

  if (unwrapped.type) {
    const hint = REMEDIATION_HINTS[unwrapped.type];
    if (hint) {
      segments.push(`Hint: ${hint}`);
    }
  }

  return segments.join('|');
}
