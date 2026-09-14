/**
 * Program discovery types.
 *
 * A `DiscoveredProgram` is deliberately *not* `ProgramScope` (types.ts):
 * discovery produces raw, possibly-incomplete, possibly-stale candidate
 * data about many programs, before any one of them has been selected,
 * scoped, or authorized. `discovery/normalize.ts` is the one function that
 * turns a selected `DiscoveredProgram` into a real `ProgramScope`, through
 * the existing `parseProgramScope` validator — discovery never bypasses it,
 * and never itself sets `authorizationConfirmed`.
 *
 * `ProgramSignal` is the unit every opportunity-score component is built
 * from: a bare number is not inspectable, so every signal always carries
 * where it came from, how sure we are, and how stale it might be.
 */

import type { Result } from '../types.js';

export type DiscoveredAssetType = 'domain' | 'wildcard-domain' | 'url' | 'repo' | 'ip' | 'cidr' | 'unsupported';
export type DiscoveredAssetInstruction = 'in-scope' | 'out-of-scope' | 'unclear';

export interface DiscoveredScopeAsset {
  readonly identifier: string;
  readonly type: DiscoveredAssetType;
  /**
   * `'unclear'` exists so a provider can report an asset it could not
   * confidently classify without guessing — `discovery/normalize.ts` always
   * drops these rather than defaulting them to `'in-scope'`, per the
   * existing "unknown scope must never silently become in-scope" rule
   * (`recon/scope-tagging.ts`).
   */
  readonly instruction: DiscoveredAssetInstruction;
  readonly tier?: 'critical' | 'standard' | 'low';
  readonly bountyEligible?: boolean;
  readonly requiresAuthentication?: boolean;
}

/**
 * One structured, sourced input to the opportunity score. `value` is always
 * pre-oriented so that 1.0 is maximally attractive to a researcher and 0.0
 * is maximally unattractive — a raw statistic that is "bad when high" (e.g.
 * competition pressure, research cost) must already be inverted by whatever
 * produced this signal, so `discovery/scoring.ts` never has to guess a
 * signal's polarity.
 */
export interface ProgramSignal {
  readonly value: number;
  readonly confidence: number;
  readonly freshnessAt: string;
  readonly detail: string;
}

export interface ProgramSignals {
  readonly bountyAttractiveness?: ProgramSignal;
  readonly competitionPressure?: ProgramSignal;
  readonly disclosedReportDensity?: ProgramSignal;
  readonly vulnClassHistory?: ProgramSignal;
  readonly assetSurfaceBreadth?: ProgramSignal;
  readonly researchCost?: ProgramSignal;
  readonly programFreshness?: ProgramSignal;
  readonly capabilityFit?: ProgramSignal;
}

export interface DiscoveredProgram {
  readonly programId: string;
  readonly programName: string;
  readonly platform: 'hackerone';
  readonly offersBounty: boolean;
  readonly assets: readonly DiscoveredScopeAsset[];
  readonly rulesOfEngagement: readonly string[];
  readonly disallowedTechniques: readonly string[];
  readonly rateLimitPerMinute?: number;
  readonly signals: ProgramSignals;
  readonly sourceProvider: string;
  readonly discoveredAt: string;
  /**
   * The structured weakness-type labels a disclosure-history provider found
   * for this program (e.g. `["Cross-site Scripting (XSS) - Stored", "SSRF"]`)
   * — kept as data, not just folded into `vulnClassHistory.detail`'s prose,
   * so `discovery/opportunity.ts`'s capability-fit model can match it against
   * `hunt-memory` without re-parsing a human-readable sentence. Absent (not
   * empty) when no disclosure-history data is available at all — see
   * `discovery/data-quality.ts`.
   */
  readonly disclosedWeaknessTypes?: readonly string[];
  /**
   * A real, provider-published bounty range in US dollars — present only
   * when a discovery provider actually returned one (see
   * `discovery/h1-brain-provider.ts`'s `bounty_min`/`bounty_max`). This is
   * kept as raw dollars *in addition to* the normalized 0..1
   * `bountyAttractiveness` signal so `discovery/opportunity.ts`'s economics
   * model can report a real figure instead of only a normalized score —
   * never derived, never estimated; absent whenever the provider did not
   * supply one.
   */
  readonly bountyRangeUsd?: { readonly min: number | undefined; readonly max: number };
  /**
   * Provider-reported data-quality caveats that apply to this program as a
   * whole (e.g. "disclosed-report data quarantined: provider returned
   * another program's results") — surfaced verbatim to the opportunity
   * layer and to a human reviewer, never silently absorbed into a signal.
   */
  readonly dataQualityNotes?: readonly string[];
}

/**
 * A source of candidate programs. Every implementation is local/offline —
 * see `discovery/fixture-provider.ts` (a synthetic/local dataset) and
 * `discovery/h1-brain-provider.ts` (a pre-fetched HackerOne snapshot). There
 * is deliberately no implementation in this package that makes a live
 * HackerOne API call itself — see that module's docstring for why.
 */
export interface ProgramDiscoveryProvider {
  readonly name: string;
  discoverPrograms(): Promise<Result<readonly DiscoveredProgram[], string>>;
}
