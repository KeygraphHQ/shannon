// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Workflow error formatting utilities.
 * Pure functions with no side effects — safe for Temporal workflow sandbox.
 */

/** Maps Temporal error type strings to actionable remediation hints. */
const REMEDIATION_HINTS: Record<string, string> = {
  AuthenticationError:
    'Verify ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in .env is valid and not expired.',
  ConfigurationError: 'Check your CONFIG file path and contents.',
  BillingError:
    'Check your Anthropic billing dashboard. Add credits or wait for spending cap reset.',
  GitError: 'Check repository path and git state.',
  InvalidTargetError: 'Verify the target URL is correct and accessible.',
  PermissionError: 'Check file and network permissions.',
  ExecutionLimitError: 'Agent exceeded maximum turns or budget. Review prompt complexity.',
};

/**
 * Walk the .cause chain to find the innermost error with a .type property.
 * Temporal wraps ApplicationFailure in ActivityFailure — the useful info is inside.
 *
 * Uses duck-typing because workflow code cannot import @temporalio/activity types.
 */
function unwrapActivityError(error: unknown): {
  message: string;
  type: string | null;
} {
  let current: unknown = error;
  let typed: { message: string; type: string } | null = null;

  while (current instanceof Error) {
    if ('type' in current && typeof (current as { type: unknown }).type === 'string') {
      typed = {
        message: current.message,
        type: (current as { type: string }).type,
      };
    }
    current = (current as { cause?: unknown }).cause;
  }

  if (typed) {
    return typed;
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    type: null,
  };
}

/**
 * Format a structured error string from workflow catch context.
 * Segments are delimited by | for multi-line rendering by WorkflowLogger.
 */
export function formatWorkflowError(
  error: unknown,
  currentPhase: string | null,
  currentAgent: string | null
): string {
  const unwrapped = unwrapActivityError(error);

  // Phase context (first segment)
  let phaseContext = 'Pipeline failed';
  if (currentPhase && currentAgent && currentPhase !== currentAgent) {
    phaseContext = `${currentPhase} failed (agent: ${currentAgent})`;
  } else if (currentPhase) {
    phaseContext = `${currentPhase} failed`;
  }

  const segments: string[] = [phaseContext];

  if (unwrapped.type) {
    segments.push(unwrapped.type);
  }

  // Sanitize pipe characters from message to preserve delimiter format
  segments.push(unwrapped.message.replaceAll('|', '/'));

  if (unwrapped.type) {
    const hint = REMEDIATION_HINTS[unwrapped.type];
    if (hint) {
      segments.push(`Hint: ${hint}`);
    }
  }

  return segments.join('|');
}
