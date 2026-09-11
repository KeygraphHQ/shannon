/**
 * Deduplication interface.
 *
 * `Deduplicator` is the synchronous, local-only contract used by the MVP
 * pipeline: it compares a candidate finding against findings already known
 * to this engagement, using a deterministic signature. `DisclosedReportProvider`
 * is the extension point for a future duplicate search against HackerOne's
 * own disclosed/rewarded reports — see the module docstring below for why
 * that stays disabled rather than pretending to work.
 */

import type { DisclosedReportResult, Finding } from '../types.js';

export type DedupResult =
  | { readonly isDuplicate: true; readonly signature: string; readonly matchedFindingId: string }
  | { readonly isDuplicate: false; readonly signature: string };

export interface Deduplicator {
  checkDuplicate(candidate: Finding, existing: readonly Finding[]): DedupResult;
}

function normalizeAssetRef(assetRef: string): string {
  try {
    const url = new URL(assetRef);
    return `${url.hostname.toLowerCase()}${url.pathname.toLowerCase().replace(/\/+$/, '')}`;
  } catch {
    return assetRef.trim().toLowerCase();
  }
}

export function computeSignature(finding: Pick<Finding, 'vulnClass' | 'assetRef'>): string {
  return `${finding.vulnClass.trim().toLowerCase()}::${normalizeAssetRef(finding.assetRef)}`;
}

/**
 * Local signature-based deduplication: two findings against the same asset
 * with the same vulnerability class are treated as duplicates of each
 * other. This is intentionally conservative for the MVP — it will produce
 * false "not duplicate" results across engagements or against reports
 * already on HackerOne, which is why report drafts still require human
 * review before submission.
 */
export class LocalSignatureDeduplicator implements Deduplicator {
  checkDuplicate(candidate: Finding, existing: readonly Finding[]): DedupResult {
    const signature = computeSignature(candidate);
    const match = existing.find((other) => other.id !== candidate.id && computeSignature(other) === signature);
    if (match) {
      return { isDuplicate: true, signature, matchedFindingId: match.id };
    }
    return { isDuplicate: false, signature };
  }
}

/**
 * A search against HackerOne's own disclosed/rewarded report history — the
 * seam for a future, real duplicate-intelligence integration. Every
 * implementation must return one of the honest `DisclosedReportStatus`
 * values rather than pretending a match was ruled out; a `PROVIDER_ERROR`
 * or `PROVIDER_DISABLED`/`NO_PROVIDER` result must never be treated as
 * `NO_MATCH` by a caller — the report draft generator surfaces the raw
 * status precisely so a human reviewer knows dedup was *not* actually
 * checked against HackerOne.
 */
export interface DisclosedReportProvider {
  search(candidate: Finding): Promise<DisclosedReportResult>;
}

/** The default provider: always reports disabled, never contacts anything. */
export class DisabledDisclosedReportProvider implements DisclosedReportProvider {
  search(_candidate: Finding): Promise<DisclosedReportResult> {
    return Promise.resolve({
      status: 'PROVIDER_DISABLED',
      detail: 'HackerOne disclosed-report search is disabled by default; review report drafts manually for duplicates',
      matchedReportUrl: undefined,
      confidence: undefined,
    });
  }
}

export interface HackerOneApiCredentials {
  readonly apiUsername: string;
  readonly apiToken: string;
}

/**
 * Seam for a real HackerOne API-backed disclosed-report search. No HTTP
 * call is implemented yet — even with credentials present, this reports
 * `PROVIDER_ERROR` rather than silently returning `NO_MATCH`, so nothing
 * downstream can mistake "not implemented" for "checked and clear."
 */
export class HackerOneApiDisclosedReportProvider implements DisclosedReportProvider {
  constructor(private readonly credentials: HackerOneApiCredentials | undefined) {}

  search(_candidate: Finding): Promise<DisclosedReportResult> {
    if (!this.credentials) {
      return Promise.resolve({
        status: 'NO_PROVIDER',
        detail: 'no HackerOne API credentials configured (HACKERONE_API_USERNAME / HACKERONE_API_TOKEN)',
        matchedReportUrl: undefined,
        confidence: undefined,
      });
    }
    return Promise.resolve({
      status: 'PROVIDER_ERROR',
      detail:
        'HackerOne API disclosed-report search is not implemented; credentials were present but no request was made',
      matchedReportUrl: undefined,
      confidence: undefined,
    });
  }
}

/** Reads HackerOne API credentials from the environment (never hard-coded) and returns the appropriate provider. */
export function createDisclosedReportProvider(
  env: Readonly<Record<string, string | undefined>> = process.env,
): DisclosedReportProvider {
  const apiUsername = env.HACKERONE_API_USERNAME;
  const apiToken = env.HACKERONE_API_TOKEN;
  if (apiUsername && apiToken) {
    return new HackerOneApiDisclosedReportProvider({ apiUsername, apiToken });
  }
  return new DisabledDisclosedReportProvider();
}
