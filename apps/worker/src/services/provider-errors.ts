// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import type { ProviderId } from '../ai/models.js';
import { ErrorCode } from '../types/errors.js';
import { err, type Result } from '../types/result.js';
import { matchesBillingApiPattern, matchesBillingTextPattern } from '../utils/billing-detection.js';
import { PentestError } from './error-handling.js';

function providerName(providerId: ProviderId): string {
  switch (providerId) {
    case 'openai':
      return 'OpenAI';
    case 'amazon-bedrock':
      return 'AWS Bedrock';
    default:
      return 'Anthropic';
  }
}

function modelOverrideHint(providerId: ProviderId): string {
  return providerId === 'openai' ? 'OPENAI_*_MODEL or SHANNON_*_MODEL' : 'ANTHROPIC_*_MODEL or SHANNON_*_MODEL';
}

/** Classify a provider error message (thrown or from a failed turn) into a PentestError. */
export function classifyCredentialError(
  text: string,
  authType: string,
  providerId: ProviderId,
): Result<void, PentestError> {
  const lower = text.toLowerCase();
  const provider = providerName(providerId);
  if (matchesBillingApiPattern(text) || matchesBillingTextPattern(text)) {
    return err(
      new PentestError(
        `${provider} account has a billing or quota issue during ${authType} validation. Add credits or wait and retry.`,
        'billing',
        true,
        { authType, provider },
        ErrorCode.BILLING_ERROR,
      ),
    );
  }
  if (/401|403|invalid[ _-]?api[ _-]?key|unauthorized|authentication|forbidden|not allowed|x-api-key/.test(lower)) {
    return err(
      new PentestError(
        `Invalid ${authType}. Check your credentials in .env and try again.`,
        'config',
        false,
        { authType, provider },
        ErrorCode.AUTH_FAILED,
      ),
    );
  }
  if (/model/.test(lower) && /not found|not available|unknown/.test(lower)) {
    return err(
      new PentestError(
        `Configured model is not available for this account. Check ${modelOverrideHint(providerId)} in .env.`,
        'config',
        false,
        { authType, provider },
        ErrorCode.CONFIG_VALIDATION_FAILED,
      ),
    );
  }
  if (/429|rate[ _-]?limit|too many requests/.test(lower)) {
    return err(
      new PentestError(
        `${provider} API is rate-limited during ${authType} validation. Wait and retry.`,
        'billing',
        true,
        { authType, provider },
        ErrorCode.API_RATE_LIMITED,
      ),
    );
  }
  if (
    /network|timeout|enotfound|econnrefused|fetch failed|getaddrinfo|socket|overloaded|unavailable|50\d/.test(lower)
  ) {
    return err(
      new PentestError(`${provider} API unreachable or temporarily unavailable. Try again shortly.`, 'network', true, {
        authType,
        provider,
      }),
    );
  }
  return err(
    new PentestError(
      `${authType} validation failed: ${text.slice(0, 150)}`,
      'config',
      false,
      { authType, provider },
      ErrorCode.AUTH_FAILED,
    ),
  );
}
