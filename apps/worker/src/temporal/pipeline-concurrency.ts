// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The vulnerability-class pipeline fan-out knob. The workflow itself must stay deterministic
 * (no `process.env` in workflow code), so the worker entry point parses the environment here
 * and carries the resolved value into the workflow via `PipelineInput`.
 */

/** Environment variable overriding how many vulnerability-class pipelines run at once. */
export const MAX_CONCURRENT_PIPELINES_ENV = 'SHANNON_MAX_CONCURRENT_PIPELINES';

/** Default fan-out: the five fixed vulnerability classes run side by side. */
export const DEFAULT_MAX_CONCURRENT_PIPELINES = 5;

/** Whether a raw value is a usable override: a whole number of 1 or more. */
export function isDirectMaxConcurrentPipelines(raw: string): boolean {
  const trimmed = raw.trim();
  return /^\d+$/u.test(trimmed) && Number.parseInt(trimmed, 10) >= 1;
}

/**
 * Parse the fan-out override. `1` runs the vulnerability-class pipelines sequentially, which
 * is what small or slow local models need: five concurrent agents can exhaust their memory
 * (see discussion #508). Anything but a positive integer falls back to the default rather
 * than failing the scan over a tuning typo.
 */
export function parseMaxConcurrentPipelines(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (trimmed === undefined || trimmed === '') return DEFAULT_MAX_CONCURRENT_PIPELINES;
  if (!isDirectMaxConcurrentPipelines(trimmed)) return DEFAULT_MAX_CONCURRENT_PIPELINES;
  return Number.parseInt(trimmed, 10);
}
