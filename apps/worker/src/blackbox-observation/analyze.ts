// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only
import { observationLimits } from './limits.js';
import { associateRaw } from './raw.js';
import type {
  ObservationCounts,
  ObservationDiagnostic,
  ObservationInput,
  ObservationLimits,
  ObservationResult,
  ObservedExchange,
  ObservedRoute,
  SourceManifest,
  SourceRef,
} from './types.js';
import {
  compare,
  diagnostic,
  emptyRecorded,
  ObservationValidationError,
  sourceRefs,
  validateObservation,
} from './validate.js';
import { reconstructWorkflows } from './workflow.js';

export { selectRawExchangeIds } from './validate.js';

const SCOPE = Object.freeze({
  basis: 'supplied-saved-records',
  authorization: 'not-assessed',
  sessionValidity: 'not-assessed',
  causality: 'not-established',
  applicationCoverage: 'unknown',
} as const);
const REASONS: Record<string, string> = {
  'recorded-zero-findings':
    'The validated supplied findings array records zero findings; this is not a security conclusion.',
  'recorded-findings':
    'The validated supplied findings array records findings; their historical acceptance was not repeated.',
  'finding-count-unavailable': 'A validated findings array is unavailable, so the recorded finding count is unknown.',
  'recorded-blocked-work':
    'Saved records contain blocked, rejected or failed work; this does not establish why findings were or were not recorded.',
  'recorded-unresolved-work':
    'Saved records contain unresolved work; no additional execution or verification was performed.',
  'limited-response-evidence':
    'Some recorded requests lack usable response evidence; these inputs do not establish the cause.',
  'recorded-incomplete-run': 'The saved run is recorded as incomplete or still running; this is a historical status.',
  'recorded-failed-run': 'The saved run is recorded as failed; private failure details are not reproduced.',
  'recorded-termination':
    'The supplied run metadata records termination information; it is not a new causal determination.',
  'unknown-empty-result-reason':
    'These inputs do not establish why no findings were recorded; correlations are not causal explanations.',
  'no-recorded-exchanges':
    'The supplied inventory contains no usable recorded exchanges; application-wide coverage is unknown.',
};
function reason(code: string, sources: readonly SourceRef[]): ObservationDiagnostic {
  return {
    code,
    message: REASONS[code] ?? 'The saved evidence has a recorded availability limitation.',
    sources: sourceRefs(sources),
  };
}
function boundedOutput(result: ObservationResult): ObservationResult {
  if (Buffer.byteLength(JSON.stringify(result)) > result.limits.maxOutputBytes)
    throw new Error('Observation output exceeds the enforced limit.');
  return result;
}

/** A fixed bounded envelope for file/worker failures. No input error text is copied. */
export function failedObservation(
  code: string,
  overrides?: Partial<ObservationLimits>,
  sources: readonly SourceManifest[] = [],
): ObservationResult {
  const limits = observationLimits(overrides);
  const allowed = new Set([
    'invalid-required-input',
    'resource-limit',
    'unsafe-input',
    'input-limit',
    'read-failed',
    'source-changed',
    'processing-failed',
    'processing-timeout',
    'unsafe-output',
    'output-failed',
  ]);
  const safeCode = allowed.has(code) ? code : 'processing-failed';
  const manifests = sources.map((source) => ({
    source: source.source,
    file: source.file,
    availability: source.availability,
    sha256: source.sha256,
    bytes: source.bytes,
    ...(source.exchangeId === undefined ? {} : { exchangeId: source.exchangeId }),
  }));
  return boundedOutput({
    schemaVersion: 1,
    kind: 'offline-blackbox-observation',
    status: 'failed',
    limits,
    sources: manifests,
    inputs: { traffic: 'invalid', blackboard: 'invalid', findings: 'not-supplied', rawRequested: false },
    scope: { ...SCOPE },
    counts: { exchanges: 0, routes: 0, identities: 0, duplicates: 0, conflicts: 0, rejectedRecords: 0 },
    identities: [],
    exchanges: [],
    routes: [],
    workflows: [],
    recorded: emptyRecorded(),
    reasons: [],
    diagnostics: [diagnostic(safeCode, [])],
  });
}
function counts(exchanges: readonly ObservedExchange[]): ObservationCounts {
  return {
    requests: exchanges.length,
    usableNormalizedResponses: exchanges.filter((item) => item.normalizedResponse === 'usable').length,
    unavailableNormalizedResponses: exchanges.filter((item) => item.normalizedResponse === 'unavailable').length,
    invalidNormalizedResponses: exchanges.filter((item) => item.normalizedResponse === 'invalid').length,
    rawUsableResponses: exchanges.filter((item) => item.raw.response === 'usable').length,
    rawAbsentResponses: exchanges.filter((item) => item.raw.response === 'absent').length,
    rawTruncatedResponses: exchanges.filter((item) => item.raw.response === 'truncated').length,
    rawMalformedResponses: exchanges.filter((item) => item.raw.response === 'malformed').length,
    rawUnknownResponses: exchanges.filter((item) => ['unknown', 'conflicting'].includes(item.raw.response)).length,
  };
}

/** Interpret only supplied saved declarations and captures; never hydrate or execute a black-box engine state. */
export function analyzeObservation(input: ObservationInput, overrides?: Partial<ObservationLimits>): ObservationResult {
  const limits = observationLimits(overrides);
  let validated: ReturnType<typeof validateObservation>;
  try {
    validated = validateObservation(input, limits);
  } catch (error) {
    return failedObservation(
      error instanceof ObservationValidationError ? error.code : 'invalid-required-input',
      limits,
    );
  }
  const raw = associateRaw(validated.exchanges, input.rawRecords, input.rawRequested === true, limits);
  if (raw.diagnostics.some((item) => item.code === 'input-limit'))
    return failedObservation('resource-limit', limits, validated.sources);
  const exchanges = [...raw.exchanges].sort((a, b) => compare(a.exchangeId, b.exchangeId));
  const diagnostics = [...validated.diagnostics, ...raw.diagnostics.filter((item) => item.code !== 'raw-missing')];
  const reasons: ObservationDiagnostic[] = [...raw.diagnostics.filter((item) => item.code === 'raw-missing')];
  const workflows = reconstructWorkflows({
    identities: validated.identities,
    exchanges,
    transitions: validated.transitions,
    resources: validated.resources,
    conflictedExchangeIds: validated.conflictedExchangeIds,
    conflictedResourceIds: validated.conflictedResourceIds,
    conflictedTransitionIds: validated.conflictedTransitionIds,
  });
  if (workflows.hasReferenceProblems)
    diagnostics.push(
      diagnostic(
        'workflow-reference-problem',
        validated.transitions.flatMap((item) => item.sources),
      ),
    );
  const groups = new Map<string, ObservedExchange[]>();
  for (const exchange of exchanges) {
    const group = groups.get(exchange.routeSignature) ?? [];
    group.push(exchange);
    groups.set(exchange.routeSignature, group);
  }
  const routes: ObservedRoute[] = [...groups]
    .sort(([a], [b]) => compare(a, b))
    .map(([routeSignature, group]) => {
      const metadata = new Map<string, { method: string; origin: string; path: string; sources: SourceRef[] }>();
      for (const item of group) {
        const key = JSON.stringify([item.method, item.origin, item.path]);
        const previous = metadata.get(key);
        metadata.set(key, {
          method: item.method,
          origin: item.origin,
          path: item.path,
          sources: sourceRefs([...(previous?.sources ?? []), ...item.sources]),
        });
      }
      return {
        routeSignature,
        metadata: [...metadata.values()].sort((a, b) =>
          compare(`${a.method}\0${a.origin}\0${a.path}`, `${b.method}\0${b.origin}\0${b.path}`),
        ),
        cells: validated.identities.map((identity) => {
          const items = group.filter((item) => item.identityKey === identity.key);
          return {
            identityKey: identity.key,
            state: items.length ? 'observed' : 'not-observed',
            counts: counts(items),
            exchangeIds: items.map((item) => item.exchangeId),
            sources: sourceRefs(items.flatMap((item) => item.sources)),
          };
        }),
        sources: sourceRefs(group.flatMap((item) => item.sources)),
      };
    });
  const facts = validated.recorded;
  if (facts.findings.count === null) reasons.push(reason('finding-count-unavailable', facts.findings.sources));
  else
    reasons.push(
      reason(facts.findings.count === 0 ? 'recorded-zero-findings' : 'recorded-findings', facts.findings.sources),
    );
  if (facts.findings.count === 0) reasons.push(reason('unknown-empty-result-reason', facts.findings.sources));
  const blocked = [
    ...facts.hypotheses.filter((item) => item.state === 'blocked'),
    ...facts.verifications.filter((item) => item.state === 'blocked'),
    ...facts.tasks.filter((item) => item.state === 'failed' || item.state === 'rejected'),
    ...facts.rejectedTasks,
  ];
  if (blocked.length)
    reasons.push(
      reason(
        'recorded-blocked-work',
        blocked.flatMap((item) => item.sources),
      ),
    );
  const unresolved = [
    ...facts.hypotheses.filter((item) => ['open', 'queued', 'tested'].includes(item.state)),
    ...facts.tasks.filter((item) => ['pending', 'running', 'failed'].includes(item.state)),
  ];
  if (unresolved.length)
    reasons.push(
      reason(
        'recorded-unresolved-work',
        unresolved.flatMap((item) => item.sources),
      ),
    );
  const limited = exchanges.filter(
    (item) =>
      item.normalizedResponse !== 'usable' || (item.raw.availability === 'available' && item.raw.response !== 'usable'),
  );
  if (limited.length)
    reasons.push(
      reason(
        'limited-response-evidence',
        limited.flatMap((item) => [...item.sources, ...item.raw.sources]),
      ),
    );
  if (facts.runStatus === 'incomplete' || facts.runStatus === 'running')
    reasons.push(reason('recorded-incomplete-run', [{ source: 'blackboard', pointer: '/runStatus' }]));
  if (facts.runStatus === 'failed')
    reasons.push(reason('recorded-failed-run', [{ source: 'blackboard', pointer: '/runStatus' }]));
  if (facts.termination.state === 'recorded') reasons.push(reason('recorded-termination', facts.termination.sources));
  if (exchanges.length === 0)
    reasons.push(
      reason('no-recorded-exchanges', [
        { source: 'traffic', pointer: '' },
        { source: 'blackboard', pointer: '/exchanges' },
      ]),
    );
  const stable = (items: readonly ObservationDiagnostic[]): ObservationDiagnostic[] =>
    [
      ...new Map(
        items.map((item) => {
          const projected = { code: item.code, message: item.message, sources: sourceRefs(item.sources) };
          return [JSON.stringify(projected), projected];
        }),
      ).values(),
    ].sort((a, b) => compare(`${a.code}\0${JSON.stringify(a.sources)}`, `${b.code}\0${JSON.stringify(b.sources)}`));
  return boundedOutput({
    schemaVersion: 1,
    kind: 'offline-blackbox-observation',
    status: diagnostics.length ? 'partial' : 'completed',
    limits,
    sources: validated.sources,
    inputs: validated.inputs,
    scope: { ...SCOPE },
    counts: {
      exchanges: exchanges.length,
      routes: routes.length,
      identities: validated.identities.length,
      duplicates: validated.duplicates,
      conflicts: validated.conflicts,
      rejectedRecords: validated.rejectedRecords,
    },
    identities: validated.identities,
    exchanges,
    routes,
    workflows: workflows.workflows,
    recorded: facts,
    reasons: stable(reasons),
    diagnostics: stable(diagnostics),
  });
}
