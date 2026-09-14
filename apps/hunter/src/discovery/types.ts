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
