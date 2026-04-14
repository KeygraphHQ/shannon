/**
 * Tests for billing-detection.ts
 *
 * Validates pattern matching, false-positive avoidance, and the
 * SHANNON_DISABLE_SPENDING_GUARD escape hatch.
 *
 * Run with: npx tsx --test apps/worker/src/utils/__tests__/billing-detection.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Import the functions under test.
// NOTE: spendingGuardDisabled is evaluated at module load time from
// process.env, so we test the disabled path in a separate subprocess.
import {
  BILLING_API_PATTERNS,
  BILLING_TEXT_PATTERNS,
  isSpendingCapBehavior,
  matchesBillingApiPattern,
  matchesBillingTextPattern,
  spendingGuardDisabled,
} from '../billing-detection.js';

// ---------------------------------------------------------------------------
// matchesBillingTextPattern
// ---------------------------------------------------------------------------
describe('matchesBillingTextPattern', () => {
  it('detects actual billing messages', () => {
    assert.ok(matchesBillingTextPattern('Spending cap reached. Resets at 8 AM PT.'));
    assert.ok(matchesBillingTextPattern('Your spending limit has been exceeded'));
    assert.ok(matchesBillingTextPattern('Budget exceeded, please upgrade'));
    assert.ok(matchesBillingTextPattern('Usage limit reached'));
  });

  it('does NOT false-positive on common pentest vocabulary', () => {
    // These are real phrases from pentesting output that previously
    // triggered false positives (see issue #263).
    assert.ok(!matchesBillingTextPattern('password reset'));
    assert.ok(!matchesBillingTextPattern('The reset token was expired'));
    assert.ok(!matchesBillingTextPattern('Account resets after 3 failed attempts'));
    assert.ok(!matchesBillingTextPattern('Usage limit per user is 100 requests'));
    assert.ok(!matchesBillingTextPattern('rate limit exceeded'));
  });

  it('returns false for empty / unrelated text', () => {
    assert.ok(!matchesBillingTextPattern(''));
    assert.ok(!matchesBillingTextPattern('Found SQL injection in login form'));
    assert.ok(!matchesBillingTextPattern('XSS payload executed successfully'));
  });
});

// ---------------------------------------------------------------------------
// matchesBillingApiPattern
// ---------------------------------------------------------------------------
describe('matchesBillingApiPattern', () => {
  it('detects API billing errors', () => {
    assert.ok(matchesBillingApiPattern('billing_error'));
    assert.ok(matchesBillingApiPattern('credit balance is too low'));
    assert.ok(matchesBillingApiPattern('insufficient credits'));
    assert.ok(matchesBillingApiPattern('quota exceeded'));
    assert.ok(matchesBillingApiPattern('limit will reset'));
  });

  it('is case-insensitive', () => {
    assert.ok(matchesBillingApiPattern('BILLING_ERROR'));
    assert.ok(matchesBillingApiPattern('Quota Exceeded'));
  });
});

// ---------------------------------------------------------------------------
// isSpendingCapBehavior
// ---------------------------------------------------------------------------
describe('isSpendingCapBehavior', () => {
  it('triggers on low-turn zero-cost billing message', () => {
    assert.ok(isSpendingCapBehavior(1, 0, 'Spending cap reached'));
    assert.ok(isSpendingCapBehavior(2, 0, 'Your spending limit hit'));
  });

  it('does NOT trigger when turns > 2', () => {
    assert.ok(!isSpendingCapBehavior(3, 0, 'Spending cap reached'));
  });

  it('does NOT trigger when cost > 0', () => {
    assert.ok(!isSpendingCapBehavior(1, 0.01, 'Spending cap reached'));
  });

  it('does NOT trigger on normal pentest output even with low turns', () => {
    assert.ok(!isSpendingCapBehavior(1, 0, 'Found password reset vulnerability'));
    assert.ok(!isSpendingCapBehavior(2, 0, 'Testing account resets'));
  });
});

// ---------------------------------------------------------------------------
// Pattern lists – sanity checks
// ---------------------------------------------------------------------------
describe('pattern lists', () => {
  it('BILLING_TEXT_PATTERNS does not contain bare "resets"', () => {
    const patterns: readonly string[] = BILLING_TEXT_PATTERNS;
    assert.ok(!patterns.includes('resets'), '"resets" should have been removed (see #263)');
  });

  it('BILLING_TEXT_PATTERNS uses "usage limit reached" not bare "usage limit"', () => {
    const patterns: readonly string[] = BILLING_TEXT_PATTERNS;
    assert.ok(!patterns.includes('usage limit'), 'bare "usage limit" is too broad');
    assert.ok(patterns.includes('usage limit reached'));
  });

  it('BILLING_API_PATTERNS is unchanged and contains expected entries', () => {
    const patterns: readonly string[] = BILLING_API_PATTERNS;
    assert.ok(patterns.includes('billing_error'));
    assert.ok(patterns.includes('quota exceeded'));
  });
});

// ---------------------------------------------------------------------------
// SHANNON_DISABLE_SPENDING_GUARD flag
// ---------------------------------------------------------------------------
describe('SHANNON_DISABLE_SPENDING_GUARD', () => {
  it('is disabled by default in test environment', () => {
    // Unless the test runner sets the env var, the guard should be active
    assert.equal(spendingGuardDisabled, false);
  });
});
