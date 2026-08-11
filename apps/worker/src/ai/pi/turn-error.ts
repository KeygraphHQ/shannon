// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type AssistantMessage, isContextOverflow, isRetryableAssistantError } from '@earendil-works/pi-ai';
import { PentestError } from '../../services/error-handling.js';
import { ErrorCode } from '../../types/errors.js';

/**
 * Wrap a failed assistant turn, taking the verdict from pi.
 *
 * Overflow is separated first, as pi's retry contract requires: it means the
 * request was too large, not that the provider faltered, so an identical retry
 * would overflow again. Everything else goes to pi's classifier, which treats
 * quota, billing, and auth exhaustion as terminal and load, throttling, and
 * transport faults as transient — those were already retried in-session, so
 * reaching here means the attempts were exhausted.
 *
 * `contextWindow` is omitted where overflow cannot apply, such as a one-word
 * credential probe.
 */
export function providerTurnError(message: AssistantMessage, label: string, contextWindow?: number): PentestError {
  const detail = (message.errorMessage ?? 'unknown provider error').slice(0, 300);

  if (contextWindow !== undefined && isContextOverflow(message, contextWindow)) {
    return new PentestError(
      `${label}: context window exceeded after compaction: ${detail}`,
      'unknown',
      false,
      { contextWindow },
      ErrorCode.AGENT_EXECUTION_FAILED,
    );
  }

  return new PentestError(
    `${label}: ${detail}`,
    'unknown',
    isRetryableAssistantError(message),
    {},
    ErrorCode.AGENT_EXECUTION_FAILED,
  );
}
