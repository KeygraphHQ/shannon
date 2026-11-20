// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Per-scan limits for slow model servers. Pure, so safe in workflow code.
 * Mirrored by apps/cli/src/run-limits.ts; keep the two in sync.
 */

export const MAX_CONCURRENCY_ENV = 'SHANNON_MAX_CONCURRENCY';
export const AGENT_TIMEOUT_ENV = 'SHANNON_AGENT_TIMEOUT_HOURS';

/** The five class lanes plus the miscellaneous lane. */
export const PIPELINE_LANE_COUNT = 6;
export const MAX_CONCURRENCY_LIMIT = PIPELINE_LANE_COUNT;

export const DEFAULT_AGENT_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const MAX_AGENT_TIMEOUT_HOURS = 12;

export type RunLimitParse<T> =
  | { readonly ok: true; readonly value: T | undefined }
  | { readonly ok: false; readonly error: string };

function parseWholeNumber(raw: string | undefined, envName: string, max: number): RunLimitParse<number> {
  const value = raw?.trim() ?? '';
  if (value === '') return { ok: true, value: undefined };
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    return { ok: false, error: `${envName} must be a whole number from 1 to ${max}.` };
  }
  return { ok: true, value: parsed };
}

export function parseMaxConcurrency(raw: string | undefined): RunLimitParse<number> {
  return parseWholeNumber(raw, MAX_CONCURRENCY_ENV, MAX_CONCURRENCY_LIMIT);
}

/** Returns milliseconds. */
export function parseAgentTimeout(raw: string | undefined): RunLimitParse<number> {
  const hours = parseWholeNumber(raw, AGENT_TIMEOUT_ENV, MAX_AGENT_TIMEOUT_HOURS);
  if (!hours.ok || hours.value === undefined) return hours;
  return { ok: true, value: hours.value * 60 * 60 * 1000 };
}

export function limitedWorkers(poolDefault: number, maxConcurrency: number | undefined): number {
  if (maxConcurrency === undefined) return poolDefault;
  return Math.min(poolDefault, maxConcurrency);
}
