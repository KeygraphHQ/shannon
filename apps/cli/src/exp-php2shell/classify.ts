/**
 * Classify a control/probe response pair into a php2shell verdict.
 *
 * The crash observation is primary. The version read from the control response headers is
 * supplementary: it can raise "no crash observed" to "detected" when the advertised version is
 * known-affected, but it never overrides a directly observed crash.
 */

import { assessPhpVersion } from './php-version.js';
import { type ProbeResponse, VERSION_HEADERS } from './transport.js';
import type { Php2shellProbeSignal, Php2shellProbeVerdict, Php2shellVersionSignal } from './types.js';

const EDGE_BLOCK_STATUSES: readonly number[] = [400, 403, 413];
const GATEWAY_DEAD_STATUSES: readonly number[] = [502, 503, 504];

export interface Classification {
  readonly verdict: Php2shellProbeVerdict;
  readonly signal: Php2shellProbeSignal;
  readonly detail: string;
  readonly version?: Php2shellVersionSignal;
}

/**
 * The in-band OOM banner a mod_php worker emits when it crashes during parsing. HTML tags are
 * stripped first because `html_errors=On` (the default) wraps the message in markup, which would
 * otherwise break the phrase match.
 */
function hasFatalMemoryError(body: string): boolean {
  const text = body.replace(/<[^>]+>/g, ' ');
  return /Fatal error/i.test(text) && /memory.*exhaust/i.test(text) && /Unknown\s+on\s+line\s+0/i.test(text);
}

function controlIsHealthy(control: ProbeResponse): boolean {
  return control.reachable && control.status < 500;
}

/**
 * Read a supplementary PHP version from the control response headers. `X-Powered-By` is preferred;
 * `Server` is a fallback. A header carrying more than one `PHP/<version>` banner is unresolvable.
 */
function readVersionSignal(control: ProbeResponse): Php2shellVersionSignal | undefined {
  for (const header of VERSION_HEADERS) {
    const value = control.headers[header];
    if (value === undefined) continue;
    const banners = [...value.matchAll(/\bPHP\/([^\s;,()]+)/gi)];
    if (banners.length === 0) continue;

    const headerLabel = header === 'x-powered-by' ? 'X-Powered-By' : 'Server';
    if (banners.length > 1) {
      return { header: headerLabel, rawValue: value, verdict: 'unknown', backportCaveat: false };
    }
    const rawVersion = banners[0]?.[1] ?? value;
    const assessment = assessPhpVersion(rawVersion);
    return {
      header: headerLabel,
      rawValue: `PHP/${rawVersion}`,
      verdict: assessment.verdict,
      backportCaveat: assessment.backportCaveat,
      ...(assessment.recommendedVersion !== undefined && { recommendedVersion: assessment.recommendedVersion }),
    };
  }
  return undefined;
}

function withVersion(
  base: Omit<Classification, 'version'>,
  version: Php2shellVersionSignal | undefined,
): Classification {
  return version === undefined ? base : { ...base, version };
}

/**
 * Compare a control response against a probe response and derive the verdict. Checks run in
 * precedence order: a baseline that never completed or is unhealthy is inconclusive, a probe that
 * hit the deadline is inconclusive, an edge rejection is inconclusive, a directly observed crash is
 * detected, otherwise the version header decides.
 */
export function classify(control: ProbeResponse, probe: ProbeResponse): Classification {
  const version = readVersionSignal(control);

  if (!control.reachable) {
    return withVersion(
      {
        verdict: 'inconclusive',
        signal: 'control-unreachable',
        detail: 'The baseline control request did not complete, so the probe response cannot be interpreted.',
      },
      version,
    );
  }

  // A baseline that returned a server error, or that already carries the fatal, is not a usable
  // reference: a failure in the probe response cannot be attributed to the probe. Version evidence
  // from the control headers is still preserved.
  if (!controlIsHealthy(control) || hasFatalMemoryError(control.bodyText)) {
    return withVersion(
      {
        verdict: 'inconclusive',
        signal: 'baseline-unhealthy',
        detail:
          'The baseline control request did not return a healthy response, so a failure in the probe response cannot be attributed to the probe.',
      },
      version,
    );
  }

  // A probe that hit the deadline is ambiguous: a crashed worker, or merely a slow server. It must
  // not read as a crash, so it is inconclusive rather than a dropped connection.
  if (probe.timedOut) {
    return withVersion(
      {
        verdict: 'inconclusive',
        signal: 'probe-timeout',
        detail:
          'The probe request did not complete before the deadline. Ordinary slowness can cause this, so the crash vector cannot be confirmed or ruled out from this run.',
      },
      version,
    );
  }

  if (probe.reachable && EDGE_BLOCK_STATUSES.includes(probe.status)) {
    return withVersion(
      {
        verdict: 'inconclusive',
        signal: 'edge-blocked',
        detail: `The probe was rejected with HTTP ${probe.status} before reaching PHP. The crash vector is not reachable through this layer, but the underlying PHP is not confirmed patched.`,
      },
      version,
    );
  }

  if (probe.reachable && hasFatalMemoryError(probe.bodyText)) {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'fatal-error-in-band',
        detail: 'The probe response contained an in-band PHP memory-exhaustion fatal error during request startup.',
      },
      version,
    );
  }
  if (probe.reachable && probe.status === 200 && probe.bodyLength === 0 && control.bodyLength > 0) {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'empty-body-200',
        detail:
          'The probe returned an empty 200 response where the control returned content, consistent with a worker that died mid-request.',
      },
      version,
    );
  }
  if (probe.reachable && probe.status === 500 && probe.bodyLength === 0 && control.bodyLength > 0) {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'empty-body-500',
        detail:
          'The probe returned an empty HTTP 500 response where the control returned content, consistent with a PHP worker crash with display_errors disabled.',
      },
      version,
    );
  }
  if (probe.reachable && GATEWAY_DEAD_STATUSES.includes(probe.status) && controlIsHealthy(control)) {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'gateway-5xx',
        detail: `The probe returned HTTP ${probe.status} while the control was healthy, consistent with a reverse proxy reporting a dead PHP backend.`,
      },
      version,
    );
  }
  if (!probe.reachable && controlIsHealthy(control)) {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'connection-dropped',
        detail:
          'The probe connection dropped while the control completed normally, consistent with the worker crashing during parsing.',
      },
      version,
    );
  }

  if (version?.verdict === 'affected') {
    return withVersion(
      {
        verdict: 'detected',
        signal: 'version-below-fix',
        detail:
          'No crash was observed, but the version header reports a PHP release below the fix. Treat as affected until the upgrade is confirmed server-side.',
      },
      version,
    );
  }
  if (version?.verdict === 'not_affected') {
    return withVersion(
      {
        verdict: 'not_detected',
        signal: 'version-patched',
        detail:
          'No crash was observed and the version header reports a fixed PHP release. This is the strongest "not detected" result.',
      },
      version,
    );
  }
  return withVersion(
    {
      verdict: 'not_detected',
      signal: 'no-observable-signal',
      detail:
        'No crash was observed and no usable version header was available for corroboration. The crash could still occur server-side with no observable signal (for example expose_php and display_errors both off).',
    },
    version,
  );
}
