// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import type { AccessComparisonLimits } from './access-types.js';
import { OBSERVATION_LIMITS, observationLimits } from './limits.js';
import type { ObservationLimits } from './types.js';

const DEFAULT_MAX_COMPARISONS = 5_000;
const DEFAULT_MAX_SOURCES_PER_COMPARISON = 256;
const INVALID_LIMITS = 'Invalid access comparison limits.';

export function accessComparisonLimits(overrides?: Partial<AccessComparisonLimits>): AccessComparisonLimits {
  if (overrides !== undefined && (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)))
    throw new Error(INVALID_LIMITS);
  const inherited: Partial<ObservationLimits> = {};
  let maxComparisons = DEFAULT_MAX_COMPARISONS;
  let maxSourcesPerComparison = DEFAULT_MAX_SOURCES_PER_COMPARISON;
  for (const [name, value] of Object.entries(overrides ?? {})) {
    if (Object.hasOwn(OBSERVATION_LIMITS, name)) {
      (inherited as Record<string, unknown>)[name] = value;
      continue;
    }
    const maximum =
      name === 'maxComparisons'
        ? DEFAULT_MAX_COMPARISONS
        : name === 'maxSourcesPerComparison'
          ? DEFAULT_MAX_SOURCES_PER_COMPARISON
          : null;
    if (maximum === null || typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > maximum)
      throw new Error(INVALID_LIMITS);
    if (name === 'maxComparisons') maxComparisons = value;
    else maxSourcesPerComparison = value;
  }
  try {
    return {
      ...observationLimits(inherited),
      maxComparisons,
      maxSourcesPerComparison,
    };
  } catch {
    throw new Error(INVALID_LIMITS);
  }
}
