// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Consolidated billing/spending cap detection utilities.
 *
 * Anthropic's spending cap behavior is inconsistent:
 * - Sometimes a proper SDK error (billing_error)
 * - Sometimes Claude responds with text about the cap
 * - Sometimes partial billing before cutoff
 *
 * This module provides defense-in-depth detection with shared pattern lists
 * to prevent drift between detection points.
 *
 * The text-pattern guard can produce false positives when pentest output
 * contains billing-sounding phrases (e.g. "password reset", "usage limit
 * per user"). Set SHANNON_DISABLE_SPENDING_GUARD=1 to bypass the
 * text-pattern checks entirely while still preserving structured-error
 * and behavioral (zero-cost) detection.
 */

/**
 * When true, all text-pattern spending guard checks are skipped.
 * Structured SDK error detection (billing_error, rate_limit, etc.) and
 * the behavioral heuristic (turns <= 2 && cost === 0) remain active.
 */
export const spendingGuardDisabled = process.env.SHANNON_DISABLE_SPENDING_GUARD === '1';

/**
 * Text patterns for SDK output sniffing (what Claude says).
 * Used by message-handlers.ts and the behavioral heuristic.
 *
 * NOTE: Only patterns that are unambiguous in a pentesting context belong
 * here.  "resets" was removed because it matches innocuous pentest
 * vocabulary like "password reset" / "reset token" (see #263).
 */
export const BILLING_TEXT_PATTERNS = [
  'spending cap',
  'spending limit',
  'cap reached',
  'budget exceeded',
  'usage limit reached',
] as const;

/**
 * API patterns for error message classification (what the API returns).
 * Used by classifyErrorForTemporal in error-handling.ts.
 */
export const BILLING_API_PATTERNS = [
  'billing_error',
  'credit balance is too low',
  'insufficient credits',
  'usage is blocked due to insufficient credits',
  'please visit plans & billing',
  'please visit plans and billing',
  'usage limit reached',
  'quota exceeded',
  'daily rate limit',
  'limit will reset',
  'billing limit reached',
] as const;

/**
 * Checks if text matches any billing text pattern.
 * Used for sniffing SDK output content for spending cap messages.
 *
 * Returns false immediately when SHANNON_DISABLE_SPENDING_GUARD=1,
 * letting the caller fall through to structured-error or behavioral
 * detection instead.
 */
export function matchesBillingTextPattern(text: string): boolean {
  if (spendingGuardDisabled) {
    return false;
  }
  const lowerText = text.toLowerCase();
  return BILLING_TEXT_PATTERNS.some((pattern) => lowerText.includes(pattern));
}

/**
 * Checks if an error message matches any billing API pattern.
 * Used for classifying API error messages.
 */
export function matchesBillingApiPattern(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return BILLING_API_PATTERNS.some((pattern) => lowerMessage.includes(pattern));
}

/**
 * Behavioral heuristic for detecting spending cap.
 *
 * When Claude hits a spending cap, it often returns a short message
 * with $0 cost. Legitimate agent work NEVER costs $0 with only 1-2 turns.
 *
 * This combines three signals:
 * 1. Very low turn count (<=2)
 * 2. Zero cost ($0)
 * 3. Text matches billing patterns
 *
 * NOTE: The text-pattern leg respects SHANNON_DISABLE_SPENDING_GUARD;
 * when the guard is disabled, this function can only return true if
 * the caller adds an additional check.
 *
 * @param turns - Number of turns the agent took
 * @param cost - Total cost in USD
 * @param resultText - The result text from the agent
 * @returns true if this looks like a spending cap hit
 */
export function isSpendingCapBehavior(turns: number, cost: number, resultText: string): boolean {
  // Only check if turns <= 2 AND cost is exactly 0
  if (turns > 2 || cost !== 0) {
    return false;
  }

  return matchesBillingTextPattern(resultText);
}
