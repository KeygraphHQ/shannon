// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyErrorForTemporal, isRetryableError, PentestError } from '../src/services/error-handling.js';
import { classifyCredentialError } from '../src/services/provider-errors.js';
import { ErrorCode } from '../src/types/errors.js';
import { isSpendingCapBehavior } from '../src/utils/billing-detection.js';

function credentialError(text: string): PentestError {
  const result = classifyCredentialError(text, 'API key', 'openai');
  if (result.ok) throw new Error('Expected credential classification to fail');
  return result.error;
}

test('OpenAI credential errors retain actionable codes', () => {
  assert.equal(credentialError('401 invalid_api_key').code, ErrorCode.AUTH_FAILED);
  assert.equal(credentialError('model gpt-5.6-sol not found').code, ErrorCode.CONFIG_VALIDATION_FAILED);
  assert.equal(credentialError('429 rate_limit_exceeded').code, ErrorCode.API_RATE_LIMITED);
  assert.equal(credentialError('429 insufficient_quota: exceeded your current quota').code, ErrorCode.BILLING_ERROR);
  assert.equal(credentialError('503 service unavailable').type, 'network');
});

test('quota exhaustion is billing while ordinary OpenAI throttling is a rate limit', () => {
  assert.deepEqual(classifyErrorForTemporal(new Error('429 insufficient_quota: exceeded your current quota')), {
    type: 'BillingError',
    retryable: true,
  });
  assert.deepEqual(classifyErrorForTemporal(new Error('429 rate_limit_exceeded')), {
    type: 'RateLimitError',
    retryable: true,
  });
});

test('PentestError retry intent is preserved without string matching', () => {
  const retryable = new PentestError('provider-specific wording', 'network', true, {}, ErrorCode.API_RATE_LIMITED);
  const permanent = new PentestError('provider-specific wording', 'config', false, {}, ErrorCode.AUTH_FAILED);
  assert.equal(isRetryableError(retryable), true);
  assert.equal(isRetryableError(permanent), false);
});

test('billing terminology in a paid pentest result is not a spending-cap signal', () => {
  const billingReport = 'The billing hard limit and exceeded your current quota paths need authorization tests.';
  assert.equal(isSpendingCapBehavior(2, 0.01, billingReport), false);
  assert.equal(isSpendingCapBehavior(3, 0, billingReport), false);
  assert.equal(isSpendingCapBehavior(1, 0, billingReport), true);
});
