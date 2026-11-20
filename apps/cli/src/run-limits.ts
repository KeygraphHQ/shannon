// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Launch-time check of the run limits. Mirrors apps/worker/src/types/run-limits.ts; keep the two in sync. */

export const MAX_CONCURRENCY_ENV = 'SHANNON_MAX_CONCURRENCY';
export const AGENT_TIMEOUT_ENV = 'SHANNON_AGENT_TIMEOUT_HOURS';

const MAX_CONCURRENCY_LIMIT = 6;
const MAX_AGENT_TIMEOUT_HOURS = 12;

function wholeNumberError(envName: string, max: number): string | undefined {
  const value = process.env[envName]?.trim() ?? '';
  if (value === '') return undefined;
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= max) return undefined;
  return `${envName} must be a whole number from 1 to ${max}.`;
}

/** The first invalid run limit's message, or undefined when all are valid. */
export function runLimitsError(): string | undefined {
  return (
    wholeNumberError(MAX_CONCURRENCY_ENV, MAX_CONCURRENCY_LIMIT) ??
    wholeNumberError(AGENT_TIMEOUT_ENV, MAX_AGENT_TIMEOUT_HOURS)
  );
}
