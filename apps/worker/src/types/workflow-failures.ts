// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The closed vocabulary of failures that can end a scan. Each type has a fixed, user-safe
 * message, because an ApplicationFailure's own `.message` can carry raw activity or provider
 * detail and is never shown. Pure data, safe for the Temporal workflow sandbox.
 */

import { SAFE_RUN_STATE_MESSAGES } from './run-state.js';

export const WORKFLOW_FAILURE_TYPES = [
  'AuthenticationError',
  'ModelNotFoundError',
  'ModelConfigError',
  'ConfigurationError',
  'OutputValidationError',
  'AgentExecutionError',
  'GitError',
  'InvalidTargetError',
  'AuthLoginFailedError',
  'PipelineFailedError',
  'ReportDraftError',
  'ReportSarifRenderError',
  'ReportRenumberError',
  'ReportAssemblyError',
  'ReportCompactionError',
  'ReportFinalizationError',
  'ReportFinalizationIntegrityError',
  'UnmappableSurvivor',
  'KeySetDivergence',
  'IncompatibleWorkspaceError',
  'CorruptedSessionError',
  'DurableStateConflictError',
  'WorkspaceNotFoundError',
  'NoCheckpointsError',
  'URLMismatchError',
  'OpenAiCyberAccessError',
  'AnthropicCyberAccessError',
  'CyberAccessUnverifiedError',
  'TransientError',
  'PermanentError',
  'UnknownError',
] as const;

export type WorkflowFailureType = (typeof WORKFLOW_FAILURE_TYPES)[number];

const WORKFLOW_FAILURE_TYPE_SET: ReadonlySet<string> = new Set(WORKFLOW_FAILURE_TYPES);

export function isWorkflowFailureType(value: unknown): value is WorkflowFailureType {
  return typeof value === 'string' && WORKFLOW_FAILURE_TYPE_SET.has(value);
}

/**
 * Names the type of a failure that can end a scan. Throw sites use this instead of a bare string,
 * so a type that is missing from the closed list (and so has no user-safe message) fails to compile.
 */
export function failureType<T extends WorkflowFailureType>(type: T): T {
  return type;
}

export const SAFE_WORKFLOW_FAILURE_MESSAGES: Readonly<Record<WorkflowFailureType, string>> = Object.freeze({
  AuthenticationError: 'Provider authentication failed.',
  ModelNotFoundError: 'The selected model was not found in the harness catalogue.',
  ModelConfigError: 'The model configuration file could not be used.',
  ConfigurationError: 'The scan configuration is invalid.',
  OutputValidationError: 'A scan step returned an unusable result.',
  AgentExecutionError: 'An agent could not complete its work.',
  GitError: 'The scan checkpoint could not be updated.',
  InvalidTargetError: 'The target could not be reached.',
  AuthLoginFailedError: 'The configured login could not be completed.',
  PipelineFailedError: 'The vulnerability analysis phase could not be completed.',
  ReportDraftError: 'The report could not be saved.',
  ReportSarifRenderError: 'The report SARIF output could not be rendered.',
  ReportRenumberError: 'Report finding numbers could not be assigned.',
  ReportAssemblyError: 'The report inputs could not be assembled.',
  ReportCompactionError: 'Report finding numbers could not be compacted.',
  ReportFinalizationError: 'The report outputs could not be finalized.',
  ReportFinalizationIntegrityError: 'The finalized report outputs failed an integrity check.',
  UnmappableSurvivor: 'A report finding could not be matched to its exploitation result.',
  KeySetDivergence: 'The report outputs disagree with their committed records.',
  IncompatibleWorkspaceError: 'This workspace cannot be resumed.',
  CorruptedSessionError: SAFE_RUN_STATE_MESSAGES.CorruptedSessionError,
  DurableStateConflictError: SAFE_RUN_STATE_MESSAGES.DurableStateConflictError,
  WorkspaceNotFoundError: 'The requested workspace was not found.',
  NoCheckpointsError: 'This workspace has no completed work to resume.',
  URLMismatchError: 'This workspace was created for a different target URL.',
  OpenAiCyberAccessError: 'OpenAI declined the security workload behind its cyber-access program.',
  AnthropicCyberAccessError: 'Anthropic declined the security workload behind its cyber-access program.',
  CyberAccessUnverifiedError: 'OpenAI cyber access could not be confirmed for the selected model.',
  TransientError: 'A scan step kept failing on temporary errors and ran out of retries.',
  PermanentError: 'A scan step failed with an error that cannot be retried.',
  UnknownError: 'A scan step failed with an unclassified error.',
});

/** A type earns a hint only when the reader has a next step to take. */
export const WORKFLOW_FAILURE_HINTS: Readonly<Partial<Record<WorkflowFailureType, string>>> = Object.freeze({
  AuthenticationError: "Verify the selected provider's API key is valid and not expired.",
  ModelNotFoundError: 'Check SHANNON_AI_MODEL against pi.dev/models, or supply the model with --models-config.',
  ModelConfigError: 'Check the --models-config file parses and matches pi’s models.json schema.',
  ConfigurationError: 'Check your CONFIG file path and contents.',
  GitError: 'Check repository path and git state.',
  InvalidTargetError: 'Verify the target URL is correct and accessible.',
  PipelineFailedError: 're-run the same -w to retry from the last checkpoint.',
  ReportAssemblyError: 're-run the same -w to retry the report from the last checkpoint.',
  ReportFinalizationError: 're-run the same -w to retry the report from the last checkpoint.',
  ReportFinalizationIntegrityError: 'start a new scan with a different -w name.',
  IncompatibleWorkspaceError: 'start a new scan with a different -w name.',
  CorruptedSessionError: "start a new scan with a different -w name. This workspace's files are left untouched.",
  DurableStateConflictError: 'start a new scan with a different -w name.',
  WorkspaceNotFoundError: 'check the -w name against: shannon scans',
  NoCheckpointsError: 'start a new scan with a different -w name.',
  URLMismatchError: 'check -u, or start a new scan with a different -w name.',
  OpenAiCyberAccessError:
    'Your OpenAI organization must be approved for cyber use. Apply for cyber access at https://chatgpt.com/cyber, then retry. Or use the gpt-5.4 model instead.',
  AnthropicCyberAccessError:
    'Your Anthropic organization must complete cyber verification. See https://support.claude.com/en/articles/14604842-real-time-cyber-safeguards-on-claude-opus-and-sonnet, then retry. Or use the claude-sonnet-4-6 model instead.',
  CyberAccessUnverifiedError:
    'Check the OpenAI credential and endpoint, then retry. If SHANNON_AI_BASE_URL is set, that endpoint must forward the access_programs request field to OpenAI.',
  TransientError: 're-run the same -w to retry from the last checkpoint.',
});

/** Structured payload on the workflow's terminal failure, so consumers never parse its display text. */
export interface TerminalFailureDetails {
  readonly failureType: WorkflowFailureType;
  readonly failureCheckCode?: string;
}
