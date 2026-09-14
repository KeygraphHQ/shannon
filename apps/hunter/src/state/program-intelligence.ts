/**
 * Persistent program intelligence.
 *
 * Discovery/ranking should never require re-fetching and re-scoring all 222
 * programs from scratch on every hunt (mission Phase 12/25). This module is
 * the workspace-local record of what is already known about each program
 * and when each facet of it (scope, disclosures, policy, bounty) was last
 * refreshed, so a caller can ask `needsRefresh` and only re-query h1-brain
 * for the programs/facets that are actually stale or changed — mirroring
 * `memory/hunt-memory.ts`'s file convention (one JSON artifact per
 * workspace, not per engagement).
 *
 * Every hash here is a content fingerprint (`fingerprint()`, SHA-256 of a
 * stably-ordered JSON encoding), used only to detect *whether something
 * changed*, never to identify or de-anonymize anything.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DiscoveredProgram } from '../discovery/types.js';
import { err, ok, type Result } from '../types.js';

export type ProgramLifecycleStatus =
  | 'NEW'
  | 'ACTIVE'
  | 'UNCHANGED'
  | 'CHANGED'
  | 'SCOPE_CHANGED'
  | 'BOUNTY_CHANGED'
  | 'POLICY_CHANGED'
  | 'REPORT_ACTIVITY_CHANGED'
  | 'PAUSED'
  | 'CLOSED'
  | 'REOPENED';

export interface ProgramIntelHistoryEntry {
  readonly at: string;
  readonly lifecycleStatus: ProgramLifecycleStatus;
  readonly note: string;
}

export interface ProgramIntelRecord {
  readonly programId: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly lastSeenAt: string;
  readonly lastScopeRefreshAt: string | undefined;
  readonly lastDisclosureRefreshAt: string | undefined;
  readonly lastPolicyRefreshAt: string | undefined;
  readonly lastBountyRefreshAt: string | undefined;
  readonly scopeHash: string | undefined;
  readonly policyHash: string | undefined;
  readonly disclosureFingerprint: string | undefined;
  readonly bountyFingerprint: string | undefined;
  readonly assetFingerprint: string | undefined;
  readonly sourceVersion: string;
  readonly lifecycleStatus: ProgramLifecycleStatus;
  readonly history: readonly ProgramIntelHistoryEntry[];
}

export type ProgramIntelStore = Readonly<Record<string, ProgramIntelRecord>>;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** A short, stable content fingerprint — order-independent for objects/arrays-of-comparable-shape, so re-fetching the same underlying facts in a different order never registers as a change. */
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex').slice(0, 16);
}

// === TTL / refresh policy ===

export interface RefreshPolicy {
  readonly scopeTtlMs: number;
  readonly disclosureTtlMs: number;
  readonly policyTtlMs: number;
  readonly bountyTtlMs: number;
  readonly statusTtlMs: number;
}

/** Deliberately a plain, overridable options object — TTLs are configuration, never hard-coded into `needsRefresh`'s logic (mission Phase 12). */
export const DEFAULT_REFRESH_POLICY: RefreshPolicy = {
  scopeTtlMs: 7 * 86_400_000,
  disclosureTtlMs: 3 * 86_400_000,
  policyTtlMs: 14 * 86_400_000,
  bountyTtlMs: 14 * 86_400_000,
  statusTtlMs: 1 * 86_400_000,
};

export interface RefreshNeeds {
  readonly scope: boolean;
  readonly disclosures: boolean;
  readonly policy: boolean;
  readonly bounty: boolean;
  readonly status: boolean;
  readonly reasons: readonly string[];
}

export function needsRefresh(
  record: ProgramIntelRecord | undefined,
  policy: RefreshPolicy = DEFAULT_REFRESH_POLICY,
  now: number = Date.now(),
): RefreshNeeds {
  if (!record) {
    return {
      scope: true,
      disclosures: true,
      policy: true,
      bounty: true,
      status: true,
      reasons: ['no prior intelligence record for this program — full refresh required'],
    };
  }
  const reasons: string[] = [];
  const isStale = (at: string | undefined, ttlMs: number, label: string): boolean => {
    if (!at) {
      reasons.push(`${label} was never refreshed`);
      return true;
    }
    const ageMs = now - Date.parse(at);
    if (!Number.isFinite(ageMs) || ageMs > ttlMs) {
      reasons.push(
        `${label} is stale (age ${(ageMs / 86_400_000).toFixed(1)}d, ttl ${(ttlMs / 86_400_000).toFixed(1)}d)`,
      );
      return true;
    }
    return false;
  };
  return {
    scope: isStale(record.lastScopeRefreshAt, policy.scopeTtlMs, 'scope'),
    disclosures: isStale(record.lastDisclosureRefreshAt, policy.disclosureTtlMs, 'disclosures'),
    policy: isStale(record.lastPolicyRefreshAt, policy.policyTtlMs, 'policy'),
    bounty: isStale(record.lastBountyRefreshAt, policy.bountyTtlMs, 'bounty'),
    status: isStale(record.lastSeenAt, policy.statusTtlMs, 'status'),
    reasons,
  };
}

// === Change detection ===

export function detectLifecycleChange(
  previous: ProgramIntelRecord | undefined,
  current: {
    readonly scopeHash: string | undefined;
    readonly policyHash: string | undefined;
    readonly disclosureFingerprint: string | undefined;
    readonly bountyFingerprint: string | undefined;
  },
): { readonly status: ProgramLifecycleStatus; readonly note: string } {
  if (!previous) return { status: 'NEW', note: 'first time this program has been recorded' };
  const changed: string[] = [];
  if (previous.scopeHash !== current.scopeHash) changed.push('SCOPE_CHANGED');
  if (previous.policyHash !== current.policyHash) changed.push('POLICY_CHANGED');
  if (previous.bountyFingerprint !== current.bountyFingerprint) changed.push('BOUNTY_CHANGED');
  if (previous.disclosureFingerprint !== current.disclosureFingerprint) changed.push('REPORT_ACTIVITY_CHANGED');
  if (changed.length === 0)
    return { status: 'UNCHANGED', note: 'no fingerprint changes detected since the last refresh' };
  if (changed.length === 1) {
    const only = changed[0] as ProgramLifecycleStatus;
    return { status: only, note: `${only} only` };
  }
  return { status: 'CHANGED', note: `multiple facets changed: ${changed.join(', ')}` };
}

const MAX_HISTORY_ENTRIES = 20;

/**
 * Folds one freshly-discovered `DiscoveredProgram` into the store, computing
 * fresh fingerprints, detecting what (if anything) changed since the
 * previous record, and appending a bounded history trail. Every
 * `lastXRefreshAt` timestamp is only advanced for the facets this program
 * actually carried data for this round — a program with no disclosure data
 * this round keeps its previous `lastDisclosureRefreshAt` rather than being
 * marked freshly refreshed for data it does not have.
 */
export function upsertProgramIntel(
  store: ProgramIntelStore,
  program: DiscoveredProgram,
  now: number,
  sourceVersion: string,
): ProgramIntelStore {
  const previous = store[program.programId];
  const nowIso = new Date(now).toISOString();

  const scopeHash = fingerprint(program.assets);
  const policyHash = fingerprint({ roe: program.rulesOfEngagement, disallowed: program.disallowedTechniques });
  const disclosureFingerprint = program.disclosedWeaknessTypes
    ? fingerprint(program.disclosedWeaknessTypes)
    : undefined;
  const bountyFingerprint = program.bountyRangeUsd ? fingerprint(program.bountyRangeUsd) : undefined;

  const { status: lifecycleStatus, note } = detectLifecycleChange(previous, {
    scopeHash,
    policyHash,
    disclosureFingerprint,
    bountyFingerprint,
  });

  const record: ProgramIntelRecord = {
    programId: program.programId,
    slug: program.programId,
    name: program.programName,
    status: program.offersBounty ? 'bounty' : 'vdp',
    lastSeenAt: nowIso,
    lastScopeRefreshAt: nowIso,
    lastDisclosureRefreshAt: program.disclosedWeaknessTypes ? nowIso : previous?.lastDisclosureRefreshAt,
    lastPolicyRefreshAt: nowIso,
    lastBountyRefreshAt: program.bountyRangeUsd ? nowIso : previous?.lastBountyRefreshAt,
    scopeHash,
    policyHash,
    disclosureFingerprint,
    bountyFingerprint,
    assetFingerprint: scopeHash,
    sourceVersion,
    lifecycleStatus,
    history: [...(previous?.history ?? []), { at: nowIso, lifecycleStatus, note }].slice(-MAX_HISTORY_ENTRIES),
  };

  return { ...store, [program.programId]: record };
}

// === Persistence ===

export function programIntelFilePath(workspaceDir: string): string {
  return join(workspaceDir, 'program-intelligence.json');
}

export async function loadProgramIntel(workspaceDir: string): Promise<Result<ProgramIntelStore, string>> {
  const filePath = programIntelFilePath(workspaceDir);
  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ok({});
    return err(`could not read program intelligence store "${filePath}": ${(error as Error).message}`);
  }
  try {
    return ok(JSON.parse(raw) as ProgramIntelStore);
  } catch (error) {
    return err(`program intelligence store "${filePath}" contains invalid JSON: ${(error as Error).message}`);
  }
}

export async function saveProgramIntel(workspaceDir: string, store: ProgramIntelStore): Promise<void> {
  const filePath = programIntelFilePath(workspaceDir);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}
