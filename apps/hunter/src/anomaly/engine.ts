/**
 * Anomaly engine.
 *
 * Compares two structured, controlled observations of the same target
 * (a baseline and a variant — e.g. anonymous vs. privileged, unmodified vs.
 * parameter-mutated, before vs. after a workflow action) across a fixed set
 * of behavioral dimensions and reports exactly what changed, how unusual
 * that is, and what would distinguish between competing explanations.
 *
 * This is deliberately not restricted to any known vulnerability class: an
 * `Anomaly` never claims a vulnerability, only a structural difference.
 * `reasoning/cascade.ts` is what turns an anomaly into competing
 * hypotheses; this module only ever answers "what changed, and how
 * unusual is it" — never "is this exploitable."
 */

import type { Provenance } from '../types.js';

export type AnomalyDimension =
  | 'http-status'
  | 'body-structure'
  | 'body-length'
  | 'headers'
  | 'cookies'
  | 'redirects'
  | 'content-type'
  | 'error-behavior'
  | 'timing'
  | 'auth-state'
  | 'authorization-outcome'
  | 'application-state'
  | 'workflow-transition'
  | 'resource-state'
  | 'cache-behavior'
  | 'protocol-parsing';

export type AuthorizationOutcome = 'allowed' | 'denied' | 'unknown';

/**
 * A single controlled observation of a target — never a full HTTP capture:
 * only the normalized dimensions this engine reasons about. Header/cookie
 * *values* are deliberately not part of this shape; only names and derived
 * signals (a structure fingerprint, a body length) are compared, so nothing
 * sensitive ever flows through anomaly detection or its persisted output.
 */
export interface ObservationSample {
  readonly label: string;
  readonly httpStatus?: number;
  readonly headerNames?: readonly string[];
  readonly cookieNames?: readonly string[];
  readonly redirectLocation?: string;
  readonly contentType?: string;
  readonly bodyLength?: number;
  /** A structural fingerprint of the body (e.g. JSON key-shape hash, tag-sequence hash) — never the raw body. */
  readonly bodyStructureFingerprint?: string;
  readonly timingMs?: number;
  readonly authState?: string;
  readonly authorizationOutcome?: AuthorizationOutcome;
  readonly applicationState?: string;
  readonly workflowTransition?: string;
  readonly resourceState?: string;
  readonly cacheHeaderNames?: readonly string[];
  readonly errorSignature?: string;
}

export interface DimensionChange {
  readonly dimension: AnomalyDimension;
  readonly baselineValue: string | undefined;
  readonly variantValue: string | undefined;
  /** How much this dimension's change contributes to overall significance (0..1). */
  readonly weight: number;
  /** How reliable a signal this dimension is on its own (0..1) — e.g. timing is noisy, status is not. */
  readonly reliability: number;
}

export interface Anomaly {
  readonly id: string;
  readonly baseline: ObservationSample;
  readonly variant: ObservationSample;
  readonly changedDimensions: readonly DimensionChange[];
  /** How unusual this difference is overall, 0..1 — a weighted fraction of comparable dimensions that changed. */
  readonly significance: number;
  /** How much this anomaly can be trusted as real (not noise/flakiness), 0..1. */
  readonly confidence: number;
  readonly provenance: Provenance;
  readonly possibleExplanations: readonly string[];
  readonly suggestedExperiments: readonly string[];
  readonly detectedAt: string;
}

const DIMENSION_WEIGHT: Readonly<Record<AnomalyDimension, number>> = {
  'http-status': 1.0,
  'body-structure': 0.9,
  'body-length': 0.35,
  headers: 0.5,
  cookies: 0.6,
  redirects: 0.8,
  'content-type': 0.65,
  'error-behavior': 0.9,
  timing: 0.3,
  'auth-state': 0.4,
  'authorization-outcome': 1.0,
  'application-state': 0.7,
  'workflow-transition': 0.85,
  'resource-state': 0.6,
  'cache-behavior': 0.45,
  'protocol-parsing': 0.75,
};

const DIMENSION_RELIABILITY: Readonly<Record<AnomalyDimension, number>> = {
  'http-status': 0.95,
  'body-structure': 0.85,
  'body-length': 0.6,
  headers: 0.75,
  cookies: 0.8,
  redirects: 0.9,
  'content-type': 0.9,
  'error-behavior': 0.8,
  timing: 0.4,
  'auth-state': 0.85,
  'authorization-outcome': 0.95,
  'application-state': 0.7,
  'workflow-transition': 0.75,
  'resource-state': 0.7,
  'cache-behavior': 0.65,
  'protocol-parsing': 0.6,
};

const EXPLANATIONS_BY_DIMENSION: Readonly<Record<AnomalyDimension, readonly string[]>> = {
  'http-status': [
    'a legitimate difference in how the endpoint validates this request',
    'an access-control decision that differs from what was expected',
    'transient server-side error unrelated to the change under test',
  ],
  'body-structure': [
    'the endpoint returned a different resource shape (e.g. an error page vs. real data)',
    'a code path was reached that would not normally be reachable',
    'a template/serializer difference unrelated to security',
  ],
  'body-length': [
    'a different amount of data was returned (could be more or less content, or an error page)',
    'whitespace/formatting differences with no security meaning',
  ],
  headers: [
    'a different middleware/handler processed the request',
    'caching or a CDN layer altered the response independently of the application',
  ],
  cookies: [
    'a new session or state was established as a side effect of the request',
    'a cookie was set/rotated for reasons unrelated to the change under test',
  ],
  redirects: [
    'the request was routed to a different destination than expected',
    'an open-redirect or workflow-bypass path was reached',
  ],
  'content-type': [
    'the endpoint negotiated a different representation',
    'an error handler returned a different content type than the normal handler',
  ],
  'error-behavior': [
    'the request triggered a different error handling path',
    'input validation behaves differently for this input',
  ],
  timing: [
    'normal variance/network jitter',
    'a different code path with different cost (e.g. a cache miss, an extra query)',
  ],
  'auth-state': [
    'a session was silently upgraded/downgraded',
    'authentication state was not correctly re-checked at this step',
  ],
  'authorization-outcome': [
    'a genuine authorization inconsistency between comparable requests',
    'the two requests were not actually equivalent (different resource, different owner)',
  ],
  'application-state': [
    'the application transitioned to a state it should not be reachable from here',
    'expected state progression for this workflow',
  ],
  'workflow-transition': [
    'a workflow step was reachable out of its intended order',
    'legitimate alternate path through the workflow',
  ],
  'resource-state': [
    'a side effect on the resource occurred that was not expected from this action',
    'expected state change from a legitimate action',
  ],
  'cache-behavior': [
    'a shared cache is serving a response across a boundary it should not cross',
    'ordinary cache configuration with no security effect',
  ],
  'protocol-parsing': [
    'a parser discrepancy between two components handling the same input differently',
    'benign difference in how a client library normalized the request',
  ],
};

const EXPERIMENTS_BY_DIMENSION: Readonly<Record<AnomalyDimension, readonly string[]>> = {
  'http-status': ['repeat the request 3x to rule out flakiness', 'vary one factor at a time to isolate the cause'],
  'body-structure': ['diff the two bodies structurally (not byte-for-byte) to localize what changed'],
  'body-length': ['compare structural fingerprints, not just length, to rule out incidental formatting'],
  headers: ['repeat the request through a different path/proxy to see whether headers still differ'],
  cookies: ['inspect cookie names only (never values) across repeated requests for consistency'],
  redirects: ['follow the redirect destination manually to confirm it is in scope before doing so automatically'],
  'content-type': ['request the same resource with explicit Accept headers to see whether negotiation explains it'],
  'error-behavior': ['submit a minimally-different input to localize which part of the input changes the behavior'],
  timing: ['repeat the timing comparison multiple times and use the median, not a single sample'],
  'auth-state': ['re-check authentication state immediately before and after the action under test'],
  'authorization-outcome': [
    'test the same action with a third, independent identity to triangulate whether this is a real inconsistency',
  ],
  'application-state': ['attempt the same transition from a third, independently-reachable starting state'],
  'workflow-transition': ['attempt the same transition starting from every other known application state'],
  'resource-state': ['re-read the resource independently (not via the same request path) to confirm the state change'],
  'cache-behavior': ['repeat the request from a distinct client identity/session to see whether the cache is shared'],
  'protocol-parsing': ['send the same input through a second, independent parser/client to compare interpretation'],
};

function compareField(
  dimension: AnomalyDimension,
  baselineValue: string | undefined,
  variantValue: string | undefined,
): DimensionChange | undefined {
  if (baselineValue === undefined && variantValue === undefined) return undefined;
  if (baselineValue === variantValue) return undefined;
  return {
    dimension,
    baselineValue,
    variantValue,
    weight: DIMENSION_WEIGHT[dimension],
    reliability: DIMENSION_RELIABILITY[dimension],
  };
}

function namesSignature(names: readonly string[] | undefined): string | undefined {
  if (names === undefined) return undefined;
  return [...names].sort().join(',');
}

const TIMING_NOISE_THRESHOLD_MS = 50;

function compareTiming(baseline?: number, variant?: number): DimensionChange | undefined {
  if (baseline === undefined || variant === undefined) return undefined;
  if (Math.abs(baseline - variant) < TIMING_NOISE_THRESHOLD_MS) return undefined;
  return {
    dimension: 'timing',
    baselineValue: String(baseline),
    variantValue: String(variant),
    weight: DIMENSION_WEIGHT.timing,
    reliability: DIMENSION_RELIABILITY.timing,
  };
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `anomaly-${counter}`;
}

export interface DetectAnomalyOptions {
  readonly source: string;
  readonly confidenceOfSource?: number;
}

/**
 * Compares one baseline/variant pair and returns a structured `Anomaly` iff
 * at least one comparable dimension differs — a pair with no observable
 * difference is not an anomaly and this returns `undefined`. Deterministic:
 * the same two samples always produce the same result.
 */
export function detectAnomaly(
  baseline: ObservationSample,
  variant: ObservationSample,
  options: DetectAnomalyOptions,
): Anomaly | undefined {
  const changes: DimensionChange[] = [];
  const push = (change: DimensionChange | undefined) => {
    if (change) changes.push(change);
  };

  push(compareField('http-status', baseline.httpStatus?.toString(), variant.httpStatus?.toString()));
  push(compareField('body-structure', baseline.bodyStructureFingerprint, variant.bodyStructureFingerprint));
  push(
    compareField(
      'body-length',
      baseline.bodyLength !== undefined ? String(baseline.bodyLength) : undefined,
      variant.bodyLength !== undefined ? String(variant.bodyLength) : undefined,
    ),
  );
  push(compareField('headers', namesSignature(baseline.headerNames), namesSignature(variant.headerNames)));
  push(compareField('cookies', namesSignature(baseline.cookieNames), namesSignature(variant.cookieNames)));
  push(compareField('redirects', baseline.redirectLocation, variant.redirectLocation));
  push(compareField('content-type', baseline.contentType, variant.contentType));
  push(compareField('error-behavior', baseline.errorSignature, variant.errorSignature));
  push(compareTiming(baseline.timingMs, variant.timingMs));
  push(compareField('auth-state', baseline.authState, variant.authState));
  push(compareField('authorization-outcome', baseline.authorizationOutcome, variant.authorizationOutcome));
  push(compareField('application-state', baseline.applicationState, variant.applicationState));
  push(compareField('workflow-transition', baseline.workflowTransition, variant.workflowTransition));
  push(compareField('resource-state', baseline.resourceState, variant.resourceState));
  push(
    compareField('cache-behavior', namesSignature(baseline.cacheHeaderNames), namesSignature(variant.cacheHeaderNames)),
  );

  if (changes.length === 0) {
    return undefined;
  }

  const totalWeight = changes.reduce((sum, c) => sum + c.weight, 0);
  const maxPossibleWeight = Object.values(DIMENSION_WEIGHT).reduce((sum, w) => sum + w, 0);
  const significance = Number(Math.min(1, totalWeight / (maxPossibleWeight * 0.35)).toFixed(4));
  const avgReliability = changes.reduce((sum, c) => sum + c.reliability, 0) / changes.length;
  const confidence = Number((avgReliability * (options.confidenceOfSource ?? 1)).toFixed(4));

  const possibleExplanations = Array.from(new Set(changes.flatMap((c) => EXPLANATIONS_BY_DIMENSION[c.dimension])));
  const suggestedExperiments = Array.from(new Set(changes.flatMap((c) => EXPERIMENTS_BY_DIMENSION[c.dimension])));

  return {
    id: nextId(),
    baseline,
    variant,
    changedDimensions: changes,
    significance,
    confidence,
    provenance: { source: options.source, discoveredAt: new Date().toISOString(), confidence },
    possibleExplanations,
    suggestedExperiments,
    detectedAt: new Date().toISOString(),
  };
}

/** Detects anomalies across every variant against one shared baseline — the common "one baseline, many probes" shape. */
export function detectAnomaliesAgainstBaseline(
  baseline: ObservationSample,
  variants: readonly ObservationSample[],
  options: DetectAnomalyOptions,
): readonly Anomaly[] {
  const anomalies: Anomaly[] = [];
  for (const variant of variants) {
    const anomaly = detectAnomaly(baseline, variant, options);
    if (anomaly) anomalies.push(anomaly);
  }
  return anomalies;
}

/** A stable, order-independent structural fingerprint for a JSON-shaped body — never the content itself. */
export function jsonStructureFingerprint(value: unknown): string {
  function shape(input: unknown): unknown {
    if (Array.isArray(input)) {
      return input.length === 0 ? [] : [shape(input[0])];
    }
    if (input !== null && typeof input === 'object') {
      const keys = Object.keys(input as Record<string, unknown>).sort();
      const out: Record<string, unknown> = {};
      for (const key of keys) {
        out[key] = shape((input as Record<string, unknown>)[key]);
      }
      return out;
    }
    return typeof input;
  }
  return JSON.stringify(shape(value));
}
