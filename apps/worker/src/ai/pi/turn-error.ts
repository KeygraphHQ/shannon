// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AssistantMessage } from '@earendil-works/pi-ai';
import { classifyProviderFailure, PentestError } from '../../services/error-handling.js';
import { ErrorCode, type ProviderFailureCategory } from '../../types/errors.js';

/**
 * Wrap a failed assistant turn, taking the retry verdict from pi.
 *
 * There is one decision point: the shared classifier. It defers retryability to pi's own
 * helper (load, throttling, and transport faults are transient; quota, billing, and context
 * overflow are terminal — the transient ones were already retried in-session, so reaching here
 * means the attempts were exhausted) and derives a separate observational category.
 *
 * A raw provider message never carries an auth/config ErrorCode — only the observational
 * category may say so — so it stays AGENT_EXECUTION_FAILED and cannot trip Temporal's
 * non-retryable type gate on a guess. `contextWindow` lets the classifier detect overflow;
 * it is omitted where overflow cannot apply, such as a one-word credential probe.
 */
export function providerTurnError(message: AssistantMessage, label: string, contextWindow?: number): PentestError {
  const failure = classifyProviderFailure(message, contextWindow);
  const error = new PentestError(
    `${label}: ${failure.message}`,
    'unknown',
    failure.retryable,
    {},
    ErrorCode.AGENT_EXECUTION_FAILED,
  );
  error.providerCategory = failure.category;
  return error;
}

/** One diagnostic entry reduced to bounded, non-prose tokens. */
interface SafeDiagnostic {
  readonly type?: string;
  readonly errorName?: string;
  readonly errorCode?: string | number;
}

/**
 * Bounded, non-sensitive observability facts about a failed assistant turn, safe to persist.
 *
 * Carries only closed enums (stop reason, provider category), opaque ids (response id), short
 * provider/harness tokens (raw stop reason, diagnostic type/name/code), and structural booleans
 * (redacted thinking, tool call in flight). It never carries the provider's error prose, the
 * model's generated text, prompts, or credentials. `errorMessage` is reduced to its length, so a
 * silent empty failure stays distinguishable from one that returned text.
 */
export interface SafeProviderTurnDetails {
  readonly provider?: string;
  readonly model?: string;
  readonly responseModel?: string;
  readonly responseId?: string;
  readonly stopReason?: string;
  readonly rawStopReason?: string;
  readonly endTurn?: boolean;
  /** True when a thinking block was redacted by the provider's safety filters. */
  readonly thinkingRedacted: boolean;
  /** Names of tool calls the model was emitting when the turn errored (own allowlist). */
  readonly toolCallsInFlight: readonly string[];
  readonly errorMessageLength: number;
  /** Present only when SHANNON_DEBUG_PROVIDER_ERRORS is set: a bounded, sanitized error snippet. */
  readonly errorMessageSnippet?: string;
  readonly diagnostics?: readonly SafeDiagnostic[];
  readonly providerCategory: ProviderFailureCategory;
  readonly retryable: boolean;
}

/** Whether the operator opted into persisting a bounded snippet of raw provider error text. */
function debugProviderErrorsEnabled(): boolean {
  return process.env.SHANNON_DEBUG_PROVIDER_ERRORS === '1' || process.env.SHANNON_DEBUG_PROVIDER_ERRORS === 'true';
}

/** Collapse whitespace, strip control characters, and truncate. A debug-only view of error prose. */
function boundedSnippet(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const collapsed = value.replace(/\s+/gu, ' ').trim();
  return boundedToken(collapsed, max);
}

/** Strip control characters and truncate, so a provider-controlled token can never carry prose or blobs. */
function boundedToken(value: unknown, max = 120): string | undefined {
  if (typeof value !== 'string') return undefined;
  let out = '';
  for (let index = 0; index < value.length && out.length < max; index += 1) {
    const code = value.charCodeAt(index);
    if (code > 31 && code !== 127) out += value[index];
  }
  return out.length > 0 ? out : undefined;
}

function safeDiagnostics(message: AssistantMessage): SafeDiagnostic[] | undefined {
  const raw = message.diagnostics;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const entries: SafeDiagnostic[] = [];
  for (const diagnostic of raw.slice(0, 5)) {
    const type = boundedToken(diagnostic?.type);
    const errorName = boundedToken(diagnostic?.error?.name);
    const rawCode = diagnostic?.error?.code;
    const errorCode = typeof rawCode === 'number' ? rawCode : boundedToken(rawCode, 60);
    entries.push({
      ...(type !== undefined && { type }),
      ...(errorName !== undefined && { errorName }),
      ...(errorCode !== undefined && { errorCode }),
    });
  }
  return entries;
}

/**
 * Extract the bounded observability record from a failed assistant turn. Shares the classifier
 * with {@link providerTurnError} so the persisted category and retry verdict match the thrown
 * error exactly.
 */
export function safeProviderTurnDetails(message: AssistantMessage, contextWindow?: number): SafeProviderTurnDetails {
  const failure = classifyProviderFailure(message, contextWindow);
  const content = Array.isArray(message.content) ? message.content : [];
  const toolCallsInFlight: string[] = [];
  for (const block of content) {
    if (block?.type === 'toolCall') {
      const name = boundedToken(block.name, 60);
      if (name !== undefined && toolCallsInFlight.length < 10) toolCallsInFlight.push(name);
    }
  }
  const thinkingRedacted = content.some((block) => block?.type === 'thinking' && block.redacted === true);
  const diagnostics = safeDiagnostics(message);

  const provider = boundedToken(message.provider);
  const model = boundedToken(message.model);
  const responseModel = boundedToken(message.responseModel);
  const responseId = boundedToken(message.responseId);
  const stopReason = boundedToken(message.stopReason);
  const rawStopReason = boundedToken(message.rawStopReason);
  const errorMessageSnippet = debugProviderErrorsEnabled() ? boundedSnippet(message.errorMessage) : undefined;

  return {
    ...(provider !== undefined && { provider }),
    ...(model !== undefined && { model }),
    ...(responseModel !== undefined && { responseModel }),
    ...(responseId !== undefined && { responseId }),
    ...(stopReason !== undefined && { stopReason }),
    ...(rawStopReason !== undefined && { rawStopReason }),
    ...(typeof message.endTurn === 'boolean' && { endTurn: message.endTurn }),
    thinkingRedacted,
    toolCallsInFlight,
    errorMessageLength: typeof message.errorMessage === 'string' ? message.errorMessage.length : 0,
    ...(errorMessageSnippet !== undefined && { errorMessageSnippet }),
    ...(diagnostics !== undefined && { diagnostics }),
    providerCategory: failure.category,
    retryable: failure.retryable,
  };
}
