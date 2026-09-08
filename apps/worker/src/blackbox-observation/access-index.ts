// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { buildRecordedPopulation, buildStrongComparisons, orderComparisons } from './access-compare.js';
import { accessComparisonLimits } from './access-limits.js';
import type { AccessComparisonLimits, AccessComparisonResult } from './access-types.js';
import { associateRaw } from './raw.js';
import type { ObservationDiagnostic, ObservationInput, SourceManifest } from './types.js';
import { compare, ObservationValidationError, sourceRefs, validateObservation } from './validate.js';

export type { AccessComparisonFileOptions } from './access-files.js';
export { compareAccessDirectory } from './access-files.js';
export { accessComparisonLimits } from './access-limits.js';
export { renderAccessComparisonMarkdown } from './access-render.js';
export type { AccessComparisonReport } from './access-serialize.js';
export { AccessComparisonOutputError, serializeAccessComparison } from './access-serialize.js';
export type * from './access-types.js';
export type { AccessValidationSelection, ResolvedAccessValidation } from './access-validation.js';
export {
  AccessValidationError,
  accessValidationComparisonDigest,
  accessValidationResolvedDigest,
  accessValidationSelectionDigest,
  accessValidationSourceManifestDigest,
  assertResolvedAccessValidationScope,
  createAccessValidationSelection,
  parseAccessValidationSelection,
  parseResolvedAccessValidation,
  resolveAccessValidationSelection,
} from './access-validation.js';
export type { AccessValidationBundleCreateOptions } from './access-validation-bundle.js';
export {
  AccessValidationBundleCreateError,
  createAccessValidationBundle,
} from './access-validation-bundle.js';
export type { AccessValidationBundleOptions } from './access-validation-files.js';
export { AccessValidationBundleError, loadAccessValidationBundle } from './access-validation-files.js';

const SCOPE = Object.freeze({
  basis: 'supplied-saved-records',
  authorization: 'not-assessed',
  sessionValidity: 'not-assessed',
  expectedPolicy: 'unknown',
  semanticEquivalence: 'not-established',
  applicationCoverage: 'unknown',
} as const);

const MESSAGES: Record<string, string> = {
  'invalid-required-input': 'A required native observation envelope is missing or invalid.',
  'resource-limit': 'Saved observations exceed the enforced resource bounds.',
  'comparison-limit': 'The deterministic comparison population exceeds the enforced comparison bounds.',
};

function stableDiagnostics(items: readonly ObservationDiagnostic[]): ObservationDiagnostic[] {
  return [
    ...new Map(
      items.map((item) => {
        const projected = { code: item.code, message: item.message, sources: sourceRefs(item.sources) };
        return [JSON.stringify(projected), projected];
      }),
    ).values(),
  ].sort((left, right) =>
    compare(`${left.code}\0${JSON.stringify(left.sources)}`, `${right.code}\0${JSON.stringify(right.sources)}`),
  );
}

function failure(
  limits: AccessComparisonLimits,
  code: 'invalid-required-input' | 'resource-limit' | 'comparison-limit',
  sources: readonly SourceManifest[] = [],
): AccessComparisonResult {
  return {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: 'failed',
    limits,
    sources,
    scope: { ...SCOPE },
    counts: {
      groups: 0,
      comparisons: 0,
      recordedComparisons: 0,
      strongComparisons: 0,
      insufficientComparisons: 0,
    },
    identities: [],
    groups: [],
    comparisons: [],
    diagnostics: [{ code, message: MESSAGES[code] ?? MESSAGES['invalid-required-input'] ?? '', sources: [] }],
  };
}

/** Compare only validated saved observations; this function performs no I/O or replay. */
export function compareAccessObservation(
  input: ObservationInput,
  overrides?: Partial<AccessComparisonLimits>,
): AccessComparisonResult {
  const limits = accessComparisonLimits(overrides);
  let validated: ReturnType<typeof validateObservation>;
  try {
    validated = validateObservation(input, limits);
  } catch (error) {
    return failure(limits, error instanceof ObservationValidationError ? error.code : 'invalid-required-input');
  }
  const raw = associateRaw(validated.exchanges, input.rawRecords, input.rawRequested === true, limits);
  if (raw.diagnostics.some((diagnostic) => diagnostic.code === 'input-limit'))
    return failure(limits, 'resource-limit', validated.sources);
  const exchanges = [...raw.exchanges].sort((left, right) => compare(left.exchangeId, right.exchangeId));
  const outerGroups = new Set(
    exchanges.map((exchange) =>
      JSON.stringify([exchange.routeSignature, exchange.method, exchange.origin, exchange.path]),
    ),
  );
  if (outerGroups.size > limits.maxRoutes) return failure(limits, 'resource-limit', validated.sources);
  let population: ReturnType<typeof buildRecordedPopulation>;
  try {
    population = buildRecordedPopulation(
      validated.identities,
      exchanges,
      validated.resourceContexts,
      input.rawRequested === true,
      raw.diagnostics
        .filter((diagnostic) => diagnostic.code === 'shared-raw-source')
        .flatMap((diagnostic) => diagnostic.sources),
    );
  } catch {
    return failure(limits, 'invalid-required-input', validated.sources);
  }
  const strongComparisons = buildStrongComparisons(
    validated.identities,
    exchanges,
    raw.evidence,
    validated.resourceContexts,
    population.groups,
  );
  const comparisons = orderComparisons([...population.comparisons, ...strongComparisons]);
  if (
    comparisons.length > limits.maxComparisons ||
    comparisons.some((comparison) => comparison.sources.length > limits.maxSourcesPerComparison)
  )
    return failure(limits, 'comparison-limit', validated.sources);
  const diagnostics = stableDiagnostics([...validated.diagnostics, ...raw.diagnostics]);
  const result: AccessComparisonResult = {
    schemaVersion: 1,
    kind: 'offline-blackbox-cross-identity-triage',
    status: diagnostics.length === 0 ? 'completed' : 'partial',
    limits,
    sources: validated.sources,
    scope: { ...SCOPE },
    counts: {
      groups: population.groups.length,
      comparisons: comparisons.length,
      recordedComparisons: population.comparisons.length,
      strongComparisons: strongComparisons.length,
      insufficientComparisons: comparisons.filter((comparison) => comparison.signals.includes('insufficient-evidence'))
        .length,
    },
    identities: validated.identities,
    groups: population.groups,
    comparisons,
    diagnostics,
  };
  return result;
}
