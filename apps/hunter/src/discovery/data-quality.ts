/**
 * Provider data-quality classification.
 *
 * The live 222-program h1-brain run found a real, reproducible bug: querying
 * `search_disclosed_reports(program: "uber")` deterministically returned
 * Kubernetes' disclosed reports ("uber" is a literal substring of
 * "kubernetes"), and `program: "x"` returned a mixed bag from several
 * unrelated programs (a one-character handle over-matches). Both were caught
 * by hand — spot-checking returned content against the requested program —
 * and manually excluded from that run's dataset. This module is what makes
 * that fix structural: a provider result is never trusted just because a
 * call returned `ok`; it is classified into one of a fixed set of statuses,
 * and only `OK`/`NO_MATCH`/`PARTIAL_DATA`/`STALE_DATA` may ever contribute a
 * scoring signal. `CONTAMINATED_DATA` and `PROVIDER_ERROR` results are
 * quarantined — `discovery/opportunity.ts` treats them exactly like
 * `UNKNOWN` (reduces confidence, contributes no directional evidence),
 * never like a confirmed zero.
 *
 * The critical distinction this module exists to enforce:
 * `NO_MATCH` ("we asked, and there really are zero disclosed reports") and
 * `PROVIDER_ERROR`/`CONTAMINATED_DATA` ("we don't actually know") must never
 * be collapsed into the same "0 reports" fact — that collapse is exactly
 * how Uber/X could otherwise have silently been scored as "verified
 * zero-competition" instead of "we have no idea."
 */

export type ProviderStatus =
  | 'OK'
  | 'NO_DATA'
  | 'NO_MATCH'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_DISABLED'
  | 'STALE_DATA'
  | 'PARTIAL_DATA'
  | 'CONTAMINATED_DATA';

/** Statuses whose payload (if any) may legitimately feed a scoring signal. Everything else must be treated as unknown, never as a confirmed value. */
const USABLE_STATUSES: ReadonlySet<ProviderStatus> = new Set(['OK', 'NO_MATCH', 'PARTIAL_DATA', 'STALE_DATA']);

export function isUsableForScoring(status: ProviderStatus): boolean {
  return USABLE_STATUSES.has(status);
}

export interface DataQuality {
  readonly source: string;
  readonly retrievedAt: string;
  readonly providerStatus: ProviderStatus;
  readonly parseStatus: 'ok' | 'error';
  /** 0..1 — fraction of the fields this call was expected to return that actually came back populated. */
  readonly completeness: number;
  /** 0..1 — this call's own trustworthiness, independent of the value it returned (a NO_MATCH can be fully confident; a CONTAMINATED_DATA result is never above a low ceiling regardless of what it contains). */
  readonly confidence: number;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

const CONFIDENCE_CEILING: Readonly<Record<ProviderStatus, number>> = {
  OK: 1,
  NO_MATCH: 0.9,
  PARTIAL_DATA: 0.7,
  STALE_DATA: 0.6,
  NO_DATA: 0,
  PROVIDER_DISABLED: 0,
  PROVIDER_ERROR: 0.1,
  CONTAMINATED_DATA: 0.05,
};

export function dataQuality(
  status: ProviderStatus,
  options: {
    readonly source: string;
    readonly retrievedAt: string;
    readonly completeness?: number;
    readonly confidence?: number;
    readonly errors?: readonly string[];
    readonly warnings?: readonly string[];
  },
): DataQuality {
  const ceiling = CONFIDENCE_CEILING[status];
  return {
    source: options.source,
    retrievedAt: options.retrievedAt,
    providerStatus: status,
    parseStatus: status === 'PROVIDER_ERROR' || status === 'CONTAMINATED_DATA' ? 'error' : 'ok',
    completeness: Math.max(0, Math.min(1, options.completeness ?? (isUsableForScoring(status) ? 1 : 0))),
    confidence: Math.max(0, Math.min(ceiling, options.confidence ?? ceiling)),
    errors: options.errors ?? [],
    warnings: options.warnings ?? [],
  };
}

/**
 * Structured, incremental disclosure-history intelligence — the honest
 * replacement for a bare `disclosed_report_count: number`. `lowerBound`
 * (not "the" count) plus `isCapped` is what makes `limit=15` representable
 * without fabricating an exact figure: a provider call that hit its result
 * cap tells you "at least 15", never "exactly 15".
 */
export interface DisclosureIntel {
  readonly reportCountLowerBound: number;
  readonly reportCountIsCapped: boolean;
  readonly weaknessClassSet: readonly string[];
  readonly lastKnownReportId: string | undefined;
  readonly quality: DataQuality;
}
