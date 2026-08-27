// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { ALL_AGENTS } from '../types/agents.js';
import { ErrorCode, type PentestErrorType } from '../types/errors.js';

export const WORKFLOW_PHASES = ['pre-recon', 'recon', 'vulnerability-exploitation', 'reporting'] as const;
export type WorkflowPhase = (typeof WORKFLOW_PHASES)[number];

export const LOGGABLE_AGENT_NAMES = [...ALL_AGENTS, 'validate-authentication'] as const;
export type LoggableAgentName = (typeof LOGGABLE_AGENT_NAMES)[number];

/** A log-safe error rendering: a known code paired with one of the fixed, generic messages below. */
export interface SafeErrorDetails {
  readonly code: ErrorCode;
  readonly category: PentestErrorType;
  readonly message: string;
}

const SAFE_ERROR_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  [ErrorCode.CONFIG_NOT_FOUND]: 'The requested configuration could not be loaded.',
  [ErrorCode.CONFIG_VALIDATION_FAILED]: 'The scan configuration is invalid.',
  [ErrorCode.CONFIG_PARSE_ERROR]: 'The scan configuration could not be parsed.',
  [ErrorCode.AGENT_EXECUTION_FAILED]: 'The agent could not complete its work.',
  [ErrorCode.OUTPUT_VALIDATION_FAILED]: 'The agent did not produce valid output.',
  [ErrorCode.GIT_CHECKPOINT_FAILED]: 'The scan checkpoint could not be saved.',
  [ErrorCode.GIT_ROLLBACK_FAILED]: 'The scan workspace could not be restored after a failed attempt.',
  [ErrorCode.PROMPT_LOAD_FAILED]: 'The agent instructions could not be loaded.',
  [ErrorCode.DELIVERABLE_NOT_FOUND]: 'The agent did not produce the required result.',
  [ErrorCode.REPO_NOT_FOUND]: 'The repository could not be opened.',
  [ErrorCode.TARGET_UNREACHABLE]: 'The target could not be reached.',
  [ErrorCode.AUTH_FAILED]: 'Authentication validation failed.',
  [ErrorCode.AUTH_LOGIN_FAILED]: 'The configured login could not be completed.',
};

const ERROR_CATEGORIES = new Set<PentestErrorType>([
  'config',
  'network',
  'prompt',
  'filesystem',
  'validation',
  'unknown',
]);

const AGENT_NAME_SET = new Set<string>(LOGGABLE_AGENT_NAMES);
const WORKFLOW_PHASE_SET = new Set<string>(WORKFLOW_PHASES);
const ERROR_CODE_SET = new Set<string>(Object.values(ErrorCode));

export function isWorkflowPhase(value: string): value is WorkflowPhase {
  return WORKFLOW_PHASE_SET.has(value);
}

export function isLoggableAgentName(value: string): value is LoggableAgentName {
  return AGENT_NAME_SET.has(value);
}

/**
 * A workflow id safe to print in a log header or interpolate into a marker line. Falls back to
 * a fixed placeholder rather than throwing, since an unparseable id must not stop the log from
 * being written at all.
 */
export function safeWorkflowIdentifier(value: string): string {
  if (/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value)) {
    return value;
  }
  return 'unknown';
}

export function containsControlCharacter(value: string): boolean {
  // Indexed scan, not a spread or regex: allocation-free over large tool arguments, and a
  // control-character regex literal is disallowed by lint.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/**
 * True when a token looks like a credential, hash, or key rather than an identifier or word:
 * a long unbroken alphanumeric run, a long digit-bearing token, or a long hex string. Used to
 * fail-closed on secret-shaped search patterns and labels the agent may have just discovered.
 */
export function looksSecretShaped(value: string): boolean {
  if (/[A-Za-z0-9]{20,}/u.test(value)) return true;
  const alphanumericLength = value.replace(/[^A-Za-z0-9]/gu, '').length;
  if (/[0-9]/u.test(value) && alphanumericLength >= 12) return true;
  if (/^[0-9a-fA-F]{12,}$/u.test(value)) return true;
  return false;
}

/**
 * The origin of a target URL, safe to print in a log header. Only `http`/`https` are accepted so
 * an exotic scheme (or credentials embedded in the URL) never reaches the log; anything else, or
 * anything unparseable, degrades to a placeholder instead of leaking the raw input.
 */
export function safeTargetUrl(value: string): string {
  if (containsControlCharacter(value)) return 'unavailable';
  try {
    const parsedUrl = new URL(value);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return 'unavailable';
    }
    return parsedUrl.origin;
  } catch {
    return 'unavailable';
  }
}

/**
 * Map an error code to its fixed, pre-approved log message rather than logging the error's own
 * message text. The underlying error can carry a file path, a stack frame, or other repo-specific
 * detail; only the closed `SAFE_ERROR_MESSAGES` table is allowed into a log line. An unrecognized
 * code or category falls back to a generic entry instead of being dropped, so a fault always gets
 * a log line, just not one repeating unvetted text.
 */
export function safeErrorFromCode(code: ErrorCode, category: PentestErrorType = 'unknown'): SafeErrorDetails {
  const safeCode = ERROR_CODE_SET.has(code) ? code : ErrorCode.AGENT_EXECUTION_FAILED;
  return {
    code: safeCode,
    category: ERROR_CATEGORIES.has(category) ? category : 'unknown',
    message: SAFE_ERROR_MESSAGES[safeCode],
  };
}

/**
 * Recover a code and category from an error of unknown shape, then defer to
 * {@link safeErrorFromCode} for the actual safe rendering. The duck-typed field reads only ever
 * pick out values that are already in the closed code/category sets, so a caught error's message
 * or other properties can never flow through into the log.
 */
export function safeErrorFromUnknown(
  error: unknown,
  fallbackCode: ErrorCode = ErrorCode.AGENT_EXECUTION_FAILED,
): SafeErrorDetails {
  let code = fallbackCode;
  let category: PentestErrorType = 'unknown';
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { readonly code?: unknown; readonly type?: unknown };
    if (typeof candidate.code === 'string' && ERROR_CODE_SET.has(candidate.code)) {
      code = candidate.code as ErrorCode;
    }
    if (typeof candidate.type === 'string' && ERROR_CATEGORIES.has(candidate.type as PentestErrorType)) {
      category = candidate.type as PentestErrorType;
    }
  }
  return safeErrorFromCode(code, category);
}

/**
 * Reduce a free-text human description (child-task description, active todo label) to a
 * short, safe semantic label, or `undefined` when it is structurally unsafe.
 *
 * Ordinary security vocabulary — `authorization`, `password`, `token` — is allowed; the
 * rejection is structural, not a word blocklist. Fail-closed: anything carrying a URL,
 * path, domain, assignment, colon, secret-shaped token, control character, or excessive
 * length is rejected rather than partially sanitized.
 */
export function normalizeSemanticLabel(value: unknown): string | undefined {
  if (typeof value !== 'string' || containsControlCharacter(value)) return undefined;
  const collapsed = value.trim().replace(/\s+/gu, ' ');
  if (collapsed.length === 0 || collapsed.length > 48) return undefined;
  // Paths, domains/filenames, assignments, colons, and addresses are structurally unsafe.
  if (/[./\\=:@]/u.test(collapsed)) return undefined;
  // A long unbroken alphanumeric run is secret/hash/base64-shaped, never a real word.
  if (/[A-Za-z0-9_-]{20,}/u.test(collapsed)) return undefined;
  const words = collapsed.toLowerCase().split(' ');
  if (words.length > 6) return undefined;
  if (!words.every((word) => /^[a-z0-9][a-z0-9'-]{0,19}$/u.test(word))) return undefined;
  if (words.some(looksSecretShaped)) return undefined;
  return words.join(' ');
}
