/**
 * Snapshot-based bridge from real HackerOne program intelligence into
 * `ProgramDiscoveryProvider`.
 *
 * This package has zero third-party dependencies and makes no network calls
 * of its own anywhere (see `intake/hackerone.ts`'s `HackerOneApiIntake`
 * stub, and the root README's safety model) — that stays true here too.
 * `h1-brain` (the `mcp__h1-brain__*` tools: `search_programs`,
 * `fetch_program_scopes`, `hack`, `search_disclosed_reports`, …) is only
 * reachable by the orchestrating agent session, not by this Node package,
 * so it cannot be called from inside `discoverPrograms()` no matter how
 * this module is written.
 *
 * The honest integration point is a snapshot file: the operator or
 * orchestrating agent calls the real h1-brain tools, and writes what they
 * returned to a local JSON file shaped like `H1BrainSnapshot` below — then
 * `H1BrainSnapshotProvider` reads it exactly like
 * `discovery/fixture-provider.ts` reads its own fixture, with the same
 * "never touches the network" property. This is the same shape of honesty
 * `intake/hackerone.ts:LocalFileIntake` already has for a single program's
 * scope, extended to many candidate programs.
 *
 * `normalizeSnapshotProgram` only ever derives a signal from a field that is
 * actually present in the snapshot — a program with no bounty range in its
 * snapshot gets no `bountyAttractiveness` signal at all, never an invented
 * one (see `discovery/scoring.ts`'s handling of `missingSignals`).
 */

import { readFile } from 'node:fs/promises';
import { err, ok, type Result } from '../types.js';
import type {
  DiscoveredAssetInstruction,
  DiscoveredAssetType,
  DiscoveredProgram,
  ProgramDiscoveryProvider,
  ProgramSignal,
  ProgramSignals,
} from './types.js';

/** One in-scope/out-of-scope asset as h1-brain's `fetch_program_scopes`/`search_scopes` output naturally shapes it. */
export interface H1BrainScopeRecord {
  readonly asset_identifier: string;
  readonly asset_type: string;
  readonly eligible_for_bounty?: boolean;
  readonly instruction?: string;
}

/** One program, as the operator/agent assembles it from `search_programs` + `fetch_program_scopes` + (optionally) `hack(handle)`/`search_disclosed_reports`. Every field beyond `handle`/`name` is optional — an absent field simply yields no signal for it, never a guess. */
export interface H1BrainProgramRecord {
  readonly handle: string;
  readonly name: string;
  readonly offers_bounty?: boolean;
  readonly scopes?: readonly H1BrainScopeRecord[];
  readonly rules_of_engagement?: readonly string[];
  readonly disallowed_techniques?: readonly string[];
  readonly rate_limit_per_minute?: number;
  /** Lowest documented bounty for the program, if published (from program policy). */
  readonly bounty_min?: number;
  /** Highest documented bounty for the program, if published. */
  readonly bounty_max?: number;
  /** Count of disclosed reports found via `search_disclosed_reports(program: handle)` — a real, if partial, competition/activity proxy. */
  readonly disclosed_report_count?: number;
  /** Distinct weakness types seen across those disclosed reports. */
  readonly disclosed_weakness_types?: readonly string[];
  /** ISO timestamp of the program's most recent scope/policy update, if known. */
  readonly last_updated_at?: string;
  /** When the snapshot itself was taken. */
  readonly snapshot_at: string;
}

export interface H1BrainSnapshot {
  readonly programs: readonly H1BrainProgramRecord[];
}

function mapAssetType(raw: string): DiscoveredAssetType {
  const normalized = raw.trim().toUpperCase();
  switch (normalized) {
    case 'URL':
      return 'url';
    case 'CIDR':
      return 'cidr';
    case 'IP_ADDRESS':
      return 'ip';
    case 'SOURCE_CODE':
    case 'OTHER':
      return 'repo';
    case 'WILDCARD':
    case 'DOMAIN':
      // h1-brain's own asset-type vocabulary does not distinguish an exact
      // hostname from a wildcard, so identifiers spelled with a leading
      // "*." are treated as wildcards and everything else as an exact
      // domain — see normalizeSnapshotProgram.
      return 'domain';
    default:
      return 'unsupported';
  }
}

function mapInstruction(raw: string | undefined): DiscoveredAssetInstruction {
  if (!raw) return 'unclear';
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'in-scope' || normalized === 'in_scope' || normalized === 'eligible') return 'in-scope';
  if (normalized === 'out-of-scope' || normalized === 'out_of_scope' || normalized === 'ineligible') {
    return 'out-of-scope';
  }
  return 'unclear';
}

function boundedRatio(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

/**
 * Every threshold below is a documented, fixed normalization choice, not a
 * fitted model — see each signal's `detail` for exactly what it means.
 */
const BOUNTY_ATTRACTIVENESS_CEILING_USD = 5000;
const HIGH_COMPETITION_REPORT_COUNT = 200;
const RICH_HISTORY_WEAKNESS_TYPES = 8;
const LARGE_SURFACE_ASSET_COUNT = 15;
const FRESH_PROGRAM_MAX_AGE_DAYS = 30;

export function normalizeSnapshotProgram(record: H1BrainProgramRecord): DiscoveredProgram {
  const assets = (record.scopes ?? []).map((scope) => {
    const isWildcard = scope.asset_type.trim().toUpperCase() === 'WILDCARD' || scope.asset_identifier.startsWith('*.');
    return {
      identifier: scope.asset_identifier,
      type:
        isWildcard && mapAssetType(scope.asset_type) === 'domain'
          ? ('wildcard-domain' as const)
          : mapAssetType(scope.asset_type),
      instruction: mapInstruction(scope.instruction),
      ...(scope.eligible_for_bounty !== undefined ? { bountyEligible: scope.eligible_for_bounty } : {}),
    };
  });

  const signals: ProgramSignals = {};
  const freshnessAt = record.snapshot_at;

  if (record.bounty_max !== undefined) {
    const value: ProgramSignal = {
      value: boundedRatio(record.bounty_max, BOUNTY_ATTRACTIVENESS_CEILING_USD),
      confidence: record.bounty_min !== undefined ? 0.8 : 0.55,
      freshnessAt,
      detail: `published bounty up to $${record.bounty_max}${record.bounty_min !== undefined ? ` (min $${record.bounty_min})` : ''}`,
    };
    (signals as { bountyAttractiveness?: ProgramSignal }).bountyAttractiveness = value;
  }

  if (record.disclosed_report_count !== undefined) {
    // Higher disclosed volume => more researcher attention => less
    // attractive on a pure competition basis, so this is inverted before
    // storage (scoring.ts always expects 1.0 = attractive).
    (signals as { competitionPressure?: ProgramSignal }).competitionPressure = {
      value: 1 - boundedRatio(record.disclosed_report_count, HIGH_COMPETITION_REPORT_COUNT),
      confidence: 0.6,
      freshnessAt,
      detail: `${record.disclosed_report_count} disclosed report(s) found via search_disclosed_reports`,
    };
    (signals as { disclosedReportDensity?: ProgramSignal }).disclosedReportDensity = {
      value: boundedRatio(record.disclosed_report_count, HIGH_COMPETITION_REPORT_COUNT),
      confidence: 0.6,
      freshnessAt,
      detail: `${record.disclosed_report_count} disclosed report(s) — a real, if partial, activity signal (not proof of a current vulnerability)`,
    };
  }

  if (record.disclosed_weakness_types && record.disclosed_weakness_types.length > 0) {
    (signals as { vulnClassHistory?: ProgramSignal }).vulnClassHistory = {
      value: boundedRatio(record.disclosed_weakness_types.length, RICH_HISTORY_WEAKNESS_TYPES),
      confidence: 0.55,
      freshnessAt,
      detail: `${record.disclosed_weakness_types.length} distinct disclosed weakness type(s): ${record.disclosed_weakness_types.join(', ')}`,
    };
  }

  if (assets.length > 0) {
    (signals as { assetSurfaceBreadth?: ProgramSignal }).assetSurfaceBreadth = {
      value: boundedRatio(assets.length, LARGE_SURFACE_ASSET_COUNT),
      confidence: 0.9,
      freshnessAt,
      detail: `${assets.length} scoped asset(s) reported`,
    };
    // A larger surface is more attractive to explore but also costs more to
    // research — researchCost is intentionally the near-inverse of
    // assetSurfaceBreadth rather than a duplicate of it.
    (signals as { researchCost?: ProgramSignal }).researchCost = {
      value: 1 - boundedRatio(assets.length, LARGE_SURFACE_ASSET_COUNT * 2),
      confidence: 0.5,
      freshnessAt,
      detail: `estimated from ${assets.length} scoped asset(s) — more assets imply more research time to cover them`,
    };
  }

  if (record.last_updated_at) {
    const ageDays = (new Date(record.snapshot_at).getTime() - new Date(record.last_updated_at).getTime()) / 86_400_000;
    (signals as { programFreshness?: ProgramSignal }).programFreshness = {
      value: Number.isFinite(ageDays) ? 1 - boundedRatio(Math.max(0, ageDays), FRESH_PROGRAM_MAX_AGE_DAYS * 6) : 0.5,
      confidence: 0.5,
      freshnessAt,
      detail: `scope/policy last updated ${record.last_updated_at}`,
    };
  }

  // capabilityFit is deliberately conservative: it only ever credits a
  // program for having at least one web-shaped (domain/wildcard/url) asset,
  // since that is the only asset shape Hunter's shipped recon/JS/behavioral
  // adapters can act on today (see tools/default-registry.ts). It is never
  // inflated by asset count — that is assetSurfaceBreadth's job.
  const hasWebAsset = assets.some((a) => a.type === 'domain' || a.type === 'wildcard-domain' || a.type === 'url');
  (signals as { capabilityFit?: ProgramSignal }).capabilityFit = {
    value: hasWebAsset ? 1 : 0.1,
    confidence: 0.9,
    freshnessAt,
    detail: hasWebAsset
      ? "at least one web-shaped (domain/wildcard/url) asset — Hunter's shipped recon/JS/behavioral adapters apply"
      : "no web-shaped asset found — Hunter's shipped adapters (all web-only today) would have little to act on",
  };

  return {
    programId: record.handle,
    programName: record.name,
    platform: 'hackerone',
    offersBounty: record.offers_bounty ?? false,
    assets,
    rulesOfEngagement: record.rules_of_engagement ?? [],
    disallowedTechniques: record.disallowed_techniques ?? [],
    ...(record.rate_limit_per_minute !== undefined ? { rateLimitPerMinute: record.rate_limit_per_minute } : {}),
    signals,
    sourceProvider: 'h1-brain-snapshot',
    discoveredAt: record.snapshot_at,
  };
}

/**
 * Reads a pre-fetched `H1BrainSnapshot` from disk and normalizes every
 * program in it. Never calls h1-brain itself — see this module's docstring.
 */
export class H1BrainSnapshotProvider implements ProgramDiscoveryProvider {
  readonly name = 'h1-brain-snapshot';

  constructor(private readonly snapshotPath: string) {}

  async discoverPrograms(): Promise<Result<readonly DiscoveredProgram[], string>> {
    let raw: string;
    try {
      raw = await readFile(this.snapshotPath, 'utf8');
    } catch (error) {
      return err(`could not read h1-brain snapshot "${this.snapshotPath}": ${(error as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return err(`h1-brain snapshot "${this.snapshotPath}" is not valid JSON: ${(error as Error).message}`);
    }
    const snapshot = parsed as Partial<H1BrainSnapshot>;
    if (!Array.isArray(snapshot.programs)) {
      return err(`h1-brain snapshot "${this.snapshotPath}" is missing a "programs" array`);
    }
    for (const record of snapshot.programs) {
      if (typeof record !== 'object' || record === null) {
        return err(`h1-brain snapshot "${this.snapshotPath}" contains a non-object program record`);
      }
      const r = record as Record<string, unknown>;
      if (typeof r.handle !== 'string' || r.handle.length === 0) {
        return err(`h1-brain snapshot "${this.snapshotPath}" has a program record missing a non-empty "handle"`);
      }
      if (typeof r.name !== 'string' || r.name.length === 0) {
        return err(`h1-brain snapshot "${this.snapshotPath}" has a program record missing a non-empty "name"`);
      }
      if (typeof r.snapshot_at !== 'string') {
        return err(`h1-brain snapshot "${this.snapshotPath}" has a program record missing "snapshot_at"`);
      }
    }
    return ok((snapshot.programs as H1BrainProgramRecord[]).map(normalizeSnapshotProgram));
  }
}
