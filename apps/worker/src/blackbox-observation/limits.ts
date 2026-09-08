// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { ObservationLimits } from './types.js';

export const OBSERVATION_LIMITS: ObservationLimits = Object.freeze({
  maxNativeBytes: 16 * 1024 * 1024,
  maxRawBytes: 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxDepth: 64,
  maxNodes: 500_000,
  maxExchanges: 10_000,
  maxRoutes: 2_000,
  maxIdentities: 16,
  maxTransitions: 5_000,
  maxRecords: 50_000,
  maxRawFiles: 512,
  maxOutputBytes: 16 * 1024 * 1024,
  timeoutMs: 60_000,
});

export function observationLimits(overrides?: Partial<ObservationLimits>): ObservationLimits {
  if (overrides === undefined) return { ...OBSERVATION_LIMITS };
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides))
    throw new Error('Invalid observation limits.');
  const result = { ...OBSERVATION_LIMITS };
  for (const [name, value] of Object.entries(overrides)) {
    if (
      !Object.hasOwn(OBSERVATION_LIMITS, name) ||
      typeof value !== 'number' ||
      !Number.isSafeInteger(value) ||
      value < 1 ||
      value > OBSERVATION_LIMITS[name as keyof ObservationLimits]
    )
      throw new Error('Invalid observation limits.');
    result[name as keyof ObservationLimits] = value;
  }
  return result;
}
