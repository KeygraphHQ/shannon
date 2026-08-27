// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { AssistantMessage } from '@earendil-works/pi-ai';
import { classifyProviderFailure, PentestError } from '../../services/error-handling.js';
import { ErrorCode } from '../../types/errors.js';

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
