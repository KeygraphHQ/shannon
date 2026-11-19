// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow error formatting utilities.
 * Pure functions with no side effects — safe for Temporal workflow sandbox.
 */

import { safeWorkflowIdentifier, WORKFLOW_PHASES } from '../audit/safe-fields.js';
import { ALL_AGENTS } from '../types/agents.js';
import { ErrorCode } from '../types/errors.js';
import {
  isWorkflowFailureType,
  SAFE_WORKFLOW_FAILURE_MESSAGES,
  type TerminalFailureDetails,
  WORKFLOW_FAILURE_HINTS,
  type WorkflowFailureType,
} from '../types/workflow-failures.js';

/** Maps a failure type to an ErrorCode; types without a natural code are left out. */
const ERROR_TYPE_TO_CODE: Readonly<Partial<Record<WorkflowFailureType, ErrorCode>>> = {
  AuthenticationError: ErrorCode.AUTH_FAILED,
  ModelNotFoundError: ErrorCode.MODEL_NOT_FOUND,
  ModelConfigError: ErrorCode.MODEL_CONFIG_INVALID,
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
  OpenAiCyberAccessError: ErrorCode.PROVIDER_CYBER_ACCESS_REQUIRED,
  AnthropicCyberAccessError: ErrorCode.PROVIDER_CYBER_ACCESS_REQUIRED,
};

export function classifyErrorCode(error: unknown): ErrorCode | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    const type = (current as { type?: unknown }).type;
    if (isWorkflowFailureType(type)) {
      const code = ERROR_TYPE_TO_CODE[type];
      if (code) return code;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

/** The innermost known failure type in an error chain, plus the check code its details carry. */
export interface WorkflowFailure {
  readonly type: WorkflowFailureType;
  readonly checkCode?: string;
}

function checkCodeOf(error: Error): string | undefined {
  const details = (error as { details?: unknown }).details;
  if (!Array.isArray(details)) return undefined;
  // NOTE: throw sites pass their details as one array argument, so it arrives nested one level down.
  const first: unknown = Array.isArray(details[0]) ? details[0][0] : details[0];
  if (first === null || typeof first !== 'object') return undefined;
  const checkCode = (first as { checkCode?: unknown }).checkCode;
  if (typeof checkCode !== 'string') return undefined;
  return safeWorkflowIdentifier(checkCode) === checkCode ? checkCode : undefined;
}

/**
 * The innermost known failure type in the .cause chain (Temporal wraps ApplicationFailure in
 * ActivityFailure). Duck-typed because workflow code cannot import @temporalio/activity types.
 */
export function classifyWorkflowFailure(error: unknown): WorkflowFailure | undefined {
  let current: unknown = error;
  let failure: WorkflowFailure | undefined;
  while (current instanceof Error) {
    const type = (current as { type?: unknown }).type;
    if (isWorkflowFailureType(type)) {
      const checkCode = checkCodeOf(current);
      failure = { type, ...(checkCode !== undefined && { checkCode }) };
    }
    current = (current as { cause?: unknown }).cause;
  }
  return failure;
}

export function terminalFailureDetails(failure: WorkflowFailure): TerminalFailureDetails {
  return {
    failureType: failure.type,
    ...(failure.checkCode !== undefined && { failureCheckCode: failure.checkCode }),
  };
}

function workflowFailureReference(failure: WorkflowFailure): string {
  return failure.checkCode === undefined ? failure.type : `${failure.type} (${failure.checkCode})`;
}

const WORKFLOW_PHASE_SET = new Set<string>(WORKFLOW_PHASES);
const AGENT_NAME_SET = new Set<string>(ALL_AGENTS);

/**
 * Format a structured, closed-field error string from workflow catch context.
 * Segments are delimited by | for multi-line rendering by WorkflowLogger.
 */
export function formatWorkflowError(
  error: unknown,
  currentPhase: string | null,
  currentAgent: string | null,
  duringResume = false,
): string {
  const failure = classifyWorkflowFailure(error);

  // Phase context (first segment)
  let phaseContext = duringResume ? 'Resume failed' : 'Pipeline failed';
  const safePhase = currentPhase !== null && WORKFLOW_PHASE_SET.has(currentPhase) ? currentPhase : null;
  const safeAgent = currentAgent !== null && AGENT_NAME_SET.has(currentAgent) ? currentAgent : null;
  if (safePhase && safeAgent && safePhase !== safeAgent) {
    phaseContext = `${safePhase} failed (agent: ${safeAgent})`;
  } else if (safePhase) {
    phaseContext = `${safePhase} failed`;
  }

  const segments: string[] = [phaseContext];
  if (failure === undefined) {
    segments.push('The scan could not be completed.');
    return segments.join('|');
  }

  segments.push(SAFE_WORKFLOW_FAILURE_MESSAGES[failure.type]);
  const hint = WORKFLOW_FAILURE_HINTS[failure.type];
  if (hint) segments.push(`Hint: ${hint}`);
  segments.push(`Reference code: ${workflowFailureReference(failure)}`);
  return segments.join('|');
}
