/**
 * HackerOne intake abstraction.
 *
 * The MVP never calls the HackerOne API: `ProgramIntake` is an interface so a
 * live API-backed implementation can be added later without touching any
 * downstream phase. The only implementation shipped today reads a program
 * scope that the operator has already exported to a local JSON file (see
 * fixtures/programs/example-program.json for the expected shape) — this
 * keeps intake deterministic, offline, and reviewable before anything is
 * validated against it.
 */

import { readFile } from 'node:fs/promises';
import { err, ok, type ProgramScope, type Result, type ScopeAsset } from '../types.js';

export interface ProgramIntake {
  loadProgram(source: string): Promise<Result<ProgramScope, string>>;
}

const VALID_ASSET_TYPES = new Set(['domain', 'wildcard-domain', 'url', 'repo', 'ip', 'cidr']);
const VALID_INSTRUCTIONS = new Set(['in-scope', 'out-of-scope']);
const VALID_TIERS = new Set(['critical', 'standard', 'low']);

function hasValidAssetShape(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.identifier === 'string' &&
    typeof asset.type === 'string' &&
    VALID_ASSET_TYPES.has(asset.type) &&
    typeof asset.instruction === 'string' &&
    VALID_INSTRUCTIONS.has(asset.instruction) &&
    (asset.tier === undefined || (typeof asset.tier === 'string' && VALID_TIERS.has(asset.tier))) &&
    (asset.bountyEligible === undefined || typeof asset.bountyEligible === 'boolean') &&
    (asset.requiresAuthentication === undefined || typeof asset.requiresAuthentication === 'boolean')
  );
}

/**
 * Normalizes a validated-shape asset into a full ScopeAsset, defaulting
 * enrichment fields (tier/bountyEligible/requiresAuthentication) that a raw
 * HackerOne scope export would not naturally carry.
 */
function normalizeScopeAsset(asset: Record<string, unknown>): ScopeAsset {
  return {
    identifier: asset.identifier as string,
    type: asset.type as ScopeAsset['type'],
    instruction: asset.instruction as ScopeAsset['instruction'],
    tier: (asset.tier as ScopeAsset['tier'] | undefined) ?? 'standard',
    bountyEligible: (asset.bountyEligible as boolean | undefined) ?? true,
    requiresAuthentication: (asset.requiresAuthentication as boolean | undefined) ?? false,
  };
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * Validate that an arbitrary parsed JSON value has the shape of a
 * ProgramScope, without trusting its contents beyond structure.
 */
export function parseProgramScope(raw: unknown): Result<ProgramScope, string> {
  if (typeof raw !== 'object' || raw === null) {
    return err('program scope must be a JSON object');
  }
  const value = raw as Record<string, unknown>;

  if (typeof value.programId !== 'string' || value.programId.length === 0) {
    return err('program scope is missing a non-empty "programId"');
  }
  if (typeof value.programName !== 'string' || value.programName.length === 0) {
    return err('program scope is missing a non-empty "programName"');
  }
  if (value.platform !== 'hackerone') {
    return err('program scope "platform" must be "hackerone"');
  }
  if (typeof value.authorizationConfirmed !== 'boolean') {
    return err('program scope "authorizationConfirmed" must be a boolean');
  }
  if (!Array.isArray(value.assets) || !value.assets.every(hasValidAssetShape)) {
    return err('program scope "assets" must be an array of valid scope assets');
  }
  if (!isStringArray(value.rulesOfEngagement)) {
    return err('program scope "rulesOfEngagement" must be an array of strings');
  }
  if (!isStringArray(value.disallowedTechniques)) {
    return err('program scope "disallowedTechniques" must be an array of strings');
  }
  if (value.rateLimitPerMinute !== undefined && typeof value.rateLimitPerMinute !== 'number') {
    return err('program scope "rateLimitPerMinute", if present, must be a number');
  }

  return ok({
    programId: value.programId,
    programName: value.programName,
    platform: 'hackerone',
    authorizationConfirmed: value.authorizationConfirmed,
    assets: value.assets.map(normalizeScopeAsset),
    rulesOfEngagement: value.rulesOfEngagement,
    disallowedTechniques: value.disallowedTechniques,
    rateLimitPerMinute: (value.rateLimitPerMinute as number | undefined) ?? 60,
  });
}

/**
 * Reads a program scope that was previously exported from HackerOne to a
 * local JSON file. Performs no network access.
 */
export class LocalFileIntake implements ProgramIntake {
  async loadProgram(filePath: string): Promise<Result<ProgramScope, string>> {
    let raw: string;
    try {
      raw = await readFile(filePath, 'utf8');
    } catch (error) {
      return err(`could not read program scope file "${filePath}": ${(error as Error).message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return err(`program scope file "${filePath}" is not valid JSON: ${(error as Error).message}`);
    }

    return parseProgramScope(parsed);
  }
}

/**
 * Placeholder for a future live HackerOne API-backed intake. Disabled by
 * design for the MVP: no scope should ever be pulled from a live service
 * without an explicit, reviewed implementation and credential flow.
 */
export class HackerOneApiIntake implements ProgramIntake {
  loadProgram(_source: string): Promise<Result<ProgramScope, string>> {
    return Promise.resolve(
      err(
        'live HackerOne API intake is not implemented; export the program scope to a local file and use LocalFileIntake',
      ),
    );
  }
}
