/**
 * php2shell upgrade-verification probe orchestrator.
 *
 * The probe sends a benign control request to the target URL, then a crafted CVE-2026-109618 probe
 * request, and classifies the pair. It reproduces only the parser-startup crash (step 1); it never
 * sends the follow-up request, so the stale-pointer code-execution step (CVE-2026-109619) is never
 * reached. To test more than one path, run the probe once per URL.
 */

import { classify } from './classify.js';
import { buildControlBody, buildProbeBody, PROBE_HEADER_COUNT, PROBE_SMALL_HEADER_COUNT } from './multipart.js';
import { sendMultipart } from './transport.js';
import type { Php2shellReport, ProbeLogger } from './types.js';

/** Default per-request timeout. A worker that hangs on the probe body should not stall the run. */
export const DEFAULT_PROBE_TIMEOUT_MS = 20_000;

/** The probe sends POST; PHP's multipart parser runs on the request body regardless of the path. */
const PROBE_METHOD = 'POST';

export interface Php2shellProbeOptions {
  readonly url: string;
  readonly timeoutMs?: number;
  readonly logger?: ProbeLogger;
}

const SILENT_LOGGER: ProbeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

/** Derive the caveats from the probe signal and version, deduplicated and order-stable. */
function collectCaveats(report: Omit<Php2shellReport, 'caveats'>): string[] {
  const caveats = new Set<string>();
  caveats.add(
    'This probe reproduces only the first step of the chain (crashing a worker via memory exhaustion). It never sends the follow-up request required for code execution.',
  );
  if (report.signal === 'edge-blocked') {
    caveats.add(
      'An edge layer rejected the probe. That blocks this payload shape, but the underlying PHP runtime is not confirmed patched. Upgrade remains necessary.',
    );
  }
  if (report.signal === 'no-observable-signal') {
    caveats.add(
      'The probe produced no observable signal. With expose_php and display_errors both off, the crash can occur server-side with nothing visible from outside. Confirm the version with a server-side `php -v`.',
    );
  }
  if (report.version?.backportCaveat === true) {
    caveats.add(
      'The reported version is below its branch fix, but a distro may have backported the fix under the same number. Resolve patch status against the vendor security tracker.',
    );
  }
  return [...caveats];
}

/**
 * Probe the single target URL and return the structured result. Sends a control/probe pair, tries
 * the smaller probe body first, then escalates to the full body unless the small one already
 * detected the crash.
 */
export async function runPhp2shellProbe(options: Php2shellProbeOptions): Promise<Php2shellReport> {
  const logger = options.logger ?? SILENT_LOGGER;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const url = options.url;
  logger.info(`Probing ${url}`);

  // Control first to establish the healthy baseline. Then try the smaller ~1 MiB probe, which
  // reaches targets whose post_max_size has been lowered below the full body's ~7.4 MiB. Escalate
  // to the full-size probe unless the small one already produced a detection.
  const control = await sendMultipart(url, PROBE_METHOD, buildControlBody(), timeoutMs);
  let probe = await sendMultipart(url, PROBE_METHOD, buildProbeBody(PROBE_SMALL_HEADER_COUNT), timeoutMs);
  let classification = classify(control, probe);
  if (classification.verdict !== 'detected') {
    // Escalate, but keep the small probe's result only when the full body is rejected at the edge
    // while the small probe reached PHP and produced a usable verdict. This fallback is limited to
    // edge rejection: a full probe that timed out or hit an unhealthy baseline is a real inconclusive
    // result that must surface, not be masked by the smaller probe, which is too small to crash the
    // worker on its own.
    const smallProbe = probe;
    const smallClassification = classification;
    probe = await sendMultipart(url, PROBE_METHOD, buildProbeBody(PROBE_HEADER_COUNT), timeoutMs);
    classification = classify(control, probe);
    if (classification.signal === 'edge-blocked' && smallClassification.verdict !== 'inconclusive') {
      probe = smallProbe;
      classification = smallClassification;
    }
  }

  logger.info(`  ${url}: ${classification.verdict} (${classification.signal})`);
  const result: Omit<Php2shellReport, 'caveats'> = {
    url,
    method: PROBE_METHOD,
    verdict: classification.verdict,
    signal: classification.signal,
    detail: classification.detail,
    control: { reachable: control.reachable, status: control.status, bodyLength: control.bodyLength },
    probe: { reachable: probe.reachable, status: probe.status, bodyLength: probe.bodyLength },
    ...(classification.version !== undefined && { version: classification.version }),
  };

  return { ...result, caveats: collectCaveats(result) };
}
