/**
 * Types for the php2shell probe.
 *
 * The verdict vocabulary is "detected / not_detected / inconclusive": the probe reports whether the
 * crash behavior was reachable from outside, not whether the host is definitively exploitable.
 */

export const PROBE_VERDICTS = ['detected', 'not_detected', 'inconclusive'] as const;
export type Php2shellProbeVerdict = (typeof PROBE_VERDICTS)[number];

export const PROBE_SIGNALS = [
  'fatal-error-in-band',
  'empty-body-200',
  'empty-body-500',
  'gateway-5xx',
  'connection-dropped',
  'edge-blocked',
  'control-unreachable',
  'baseline-unhealthy',
  'probe-timeout',
  'version-below-fix',
  'version-patched',
  'no-observable-signal',
] as const;
export type Php2shellProbeSignal = (typeof PROBE_SIGNALS)[number];

export type Php2shellVersionVerdict = 'affected' | 'not_affected' | 'unknown';

/** Supplementary PHP version read from the control response headers, assessed against the fixed-version table. */
export interface Php2shellVersionSignal {
  readonly header: string;
  readonly rawValue: string;
  readonly verdict: Php2shellVersionVerdict;
  readonly recommendedVersion?: string;
  readonly backportCaveat: boolean;
}

/** One request's observed response. `reachable` is false when the transport itself failed. */
export interface Php2shellResponseObservation {
  readonly reachable: boolean;
  readonly status: number;
  readonly bodyLength: number;
}

/** The probe result for the one URL that was tested, plus any caveats on interpreting it. */
export interface Php2shellReport {
  readonly url: string;
  readonly method: string;
  readonly verdict: Php2shellProbeVerdict;
  readonly signal: Php2shellProbeSignal;
  readonly detail: string;
  readonly control: Php2shellResponseObservation;
  readonly probe: Php2shellResponseObservation;
  readonly version?: Php2shellVersionSignal;
  readonly caveats: readonly string[];
}

/** Minimal logger interface so the probe can report progress through any caller-supplied sink. */
export interface ProbeLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}
