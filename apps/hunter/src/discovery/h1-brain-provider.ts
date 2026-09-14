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
import { isUsableForScoring, type ProviderStatus } from './data-quality.js';
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
  /**
   * Same gating as `disclosed_report_provider_status`, applied to the
   * bounty figures: defaults to `'ok'` for backward compatibility when
   * `bounty_max` is present. Set to `'contaminated'` to quarantine a bounty
   * figure known/suspected to be wrong (e.g. attributed to the wrong
   * program) — when set, `bounty_min`/`bounty_max` are ignored outright, no
   * bountyAttractiveness signal or `bountyRangeUsd` is produced, and a
   * `dataQualityNotes` entry is attached instead. Adversarial regression:
   * fabricated/invalid-source bounty data must never silently score.
   */
  readonly bounty_provider_status?: 'ok' | 'contaminated' | 'provider_error';
  /** Count of disclosed reports found via `search_disclosed_reports(program: handle)` — a real, if partial, competition/activity proxy. Ignored entirely (never scored) unless `disclosed_report_provider_status` is a usable status — see this module's docstring. */
  readonly disclosed_report_count?: number;
  /**
   * `true` when `disclosed_report_count` is a lower bound because the
   * provider call hit its result cap (e.g. `limit=15` and the count returned
   * is exactly 15) rather than an exact total. Never silently treated as
   * exact — `normalizeSnapshotProgram` marks the resulting signal's detail
   * as "≥N" and discounts its confidence accordingly.
   */
  readonly disclosed_report_count_capped?: boolean;
  /**
   * How the disclosure-history provider call actually went. Defaults to
   * `'ok'` (or `'no_match'` when `disclosed_report_count` is `0`) for
   * backward compatibility with snapshots written before this field
   * existed — an operator/agent assembling a *new* snapshot should set this
   * explicitly whenever a call did not cleanly succeed.
   * `'contaminated'` is the permanent, structural fix for the Uber/X
   * pathology (see this module's docstring): when set, `disclosed_report_count`
   * and `disclosed_weakness_types` are ignored outright, no matter what they
   * contain, and a `dataQualityNotes` entry is attached instead.
   */
  readonly disclosed_report_provider_status?: 'ok' | 'no_match' | 'provider_error' | 'contaminated' | 'unavailable';
  /** Distinct weakness types seen across those disclosed reports. Same usability gating as `disclosed_report_count`. */
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
  const dataQualityNotes: string[] = [];

  // Resolve the actual provider status for this call, defaulting for
  // backward compatibility with snapshots that predate this field: a
  // present, non-zero count with no explicit status is assumed 'ok', a
  // present zero is assumed 'no_match' (a genuine confirmed zero) — either
  // way, `record` never *invents* a status; it can only be missing from an
  // older snapshot, never wrong.
  const declaredStatus = record.disclosed_report_provider_status;
  const disclosureStatus: ProviderStatus =
    declaredStatus === 'contaminated'
      ? 'CONTAMINATED_DATA'
      : declaredStatus === 'provider_error'
        ? 'PROVIDER_ERROR'
        : declaredStatus === 'unavailable'
          ? 'NO_DATA'
          : record.disclosed_report_count === undefined
            ? 'NO_DATA'
            : record.disclosed_report_count === 0
              ? 'NO_MATCH'
              : record.disclosed_report_count_capped
                ? 'PARTIAL_DATA'
                : 'OK';
  const disclosureUsable = isUsableForScoring(disclosureStatus);

  if (!disclosureUsable && declaredStatus !== undefined) {
    dataQualityNotes.push(
      `disclosed-report data quarantined (${disclosureStatus}): ${
        disclosureStatus === 'CONTAMINATED_DATA'
          ? 'provider returned results attributable to a different program (substring/attribution collision) — never scored, never treated as a confirmed zero'
          : disclosureStatus === 'PROVIDER_ERROR'
            ? 'provider call failed'
            : 'no disclosure data available'
      }`,
    );
  }

  const disclosedWeaknessTypes: string[] = [];

  const bountyStatus = record.bounty_provider_status ?? 'ok';
  const bountyUsable = bountyStatus === 'ok';
  if (!bountyUsable && record.bounty_max !== undefined) {
    dataQualityNotes.push(
      `bounty data quarantined (${bountyStatus}) — never scored, never surfaced as bountyRangeUsd, regardless of the figures present in the source record.`,
    );
  }

  if (bountyUsable && record.bounty_max !== undefined) {
    const value: ProgramSignal = {
      value: boundedRatio(record.bounty_max, BOUNTY_ATTRACTIVENESS_CEILING_USD),
      confidence: record.bounty_min !== undefined ? 0.8 : 0.55,
      freshnessAt,
      detail: `published bounty up to $${record.bounty_max}${record.bounty_min !== undefined ? ` (min $${record.bounty_min})` : ''}`,
    };
    (signals as { bountyAttractiveness?: ProgramSignal }).bountyAttractiveness = value;
  }

  if (disclosureUsable && record.disclosed_report_count !== undefined) {
    const capped = record.disclosed_report_count_capped === true;
    // A capped count is a lower bound, not an exact figure — both the label
    // ("≥N" rather than "N") and the confidence (discounted) must say so;
    // silently treating "≥15" as "=15" would be exactly the kind of
    // unearned precision this system is built to refuse.
    const countLabel = capped ? `≥${record.disclosed_report_count}` : `${record.disclosed_report_count}`;
    const countConfidence = capped ? 0.45 : 0.6;
    // Higher disclosed volume => more researcher attention => less
    // attractive on a pure competition basis, so this is inverted before
    // storage (scoring.ts always expects 1.0 = attractive).
    (signals as { competitionPressure?: ProgramSignal }).competitionPressure = {
      value: 1 - boundedRatio(record.disclosed_report_count, HIGH_COMPETITION_REPORT_COUNT),
      confidence: countConfidence,
      freshnessAt,
      detail: `${countLabel} disclosed report(s) found via search_disclosed_reports${capped ? ' (capped by provider limit — true count may be higher)' : ''}`,
    };
    (signals as { disclosedReportDensity?: ProgramSignal }).disclosedReportDensity = {
      value: boundedRatio(record.disclosed_report_count, HIGH_COMPETITION_REPORT_COUNT),
      confidence: countConfidence,
      freshnessAt,
      detail: `${countLabel} disclosed report(s) — a real, if partial, activity signal (not proof of a current vulnerability)${capped ? ' (capped, true count may be higher)' : ''}`,
    };
    if (capped) {
      dataQualityNotes.push(
        `disclosed-report count is a lower bound (≥${record.disclosed_report_count}, provider result limit reached) — never treated as exact`,
      );
    }
  }
  // A quarantined/errored/unavailable provider result (disclosureUsable ===
  // false) intentionally produces no competitionPressure/disclosedReportDensity
  // signal at all — that absence is what feeds UNKNOWN through
  // discovery/opportunity.ts. It must never be synthesized as a confirmed
  // zero, which is exactly the bug this gate exists to prevent.

  if (disclosureUsable && record.disclosed_weakness_types && record.disclosed_weakness_types.length > 0) {
    const capped = record.disclosed_report_count_capped === true;
    (signals as { vulnClassHistory?: ProgramSignal }).vulnClassHistory = {
      value: boundedRatio(record.disclosed_weakness_types.length, RICH_HISTORY_WEAKNESS_TYPES),
      confidence: capped ? 0.4 : 0.55,
      freshnessAt,
      detail: `${record.disclosed_weakness_types.length} distinct disclosed weakness type(s) seen${capped ? ' among a capped (lower-bound) sample' : ''}: ${record.disclosed_weakness_types.join(', ')}`,
    };
    disclosedWeaknessTypes.push(...record.disclosed_weakness_types);
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
    ...(disclosedWeaknessTypes.length > 0 ? { disclosedWeaknessTypes } : {}),
    ...(dataQualityNotes.length > 0 ? { dataQualityNotes } : {}),
    ...(bountyUsable && record.bounty_max !== undefined
      ? { bountyRangeUsd: { min: record.bounty_min, max: record.bounty_max } }
      : {}),
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
