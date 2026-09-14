/**
 * Deterministic, offline `ProgramDiscoveryProvider`.
 *
 * Reads a local JSON array of `DiscoveredProgram`-shaped records — this is
 * what backs every discovery/ranking test, the bundled synthetic multi-
 * program dataset (`fixtures/discovery/programs.json`), and safe local
 * simulation of the full "discover -> rank -> select" flow. Never touches
 * the network, exactly like `intake/hackerone.ts:LocalFileIntake`.
 */

import { readFile } from 'node:fs/promises';
import { err, ok, type Result } from '../types.js';
import type { DiscoveredProgram, ProgramDiscoveryProvider } from './types.js';

const VALID_ASSET_TYPES = new Set(['domain', 'wildcard-domain', 'url', 'repo', 'ip', 'cidr', 'unsupported']);
const VALID_INSTRUCTIONS = new Set(['in-scope', 'out-of-scope', 'unclear']);
const SIGNAL_KEYS = [
  'bountyAttractiveness',
  'competitionPressure',
  'disclosedReportDensity',
  'vulnClassHistory',
  'assetSurfaceBreadth',
  'researchCost',
  'programFreshness',
  'capabilityFit',
] as const;

function isSignal(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.value === 'number' &&
    typeof s.confidence === 'number' &&
    typeof s.freshnessAt === 'string' &&
    typeof s.detail === 'string'
  );
}

function isValidRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  if (typeof p.programId !== 'string' || p.programId.length === 0) return false;
  if (typeof p.programName !== 'string' || p.programName.length === 0) return false;
  if (p.platform !== 'hackerone') return false;
  if (typeof p.offersBounty !== 'boolean') return false;
  if (!Array.isArray(p.assets)) return false;
  for (const asset of p.assets) {
    if (typeof asset !== 'object' || asset === null) return false;
    const a = asset as Record<string, unknown>;
    if (typeof a.identifier !== 'string') return false;
    if (typeof a.type !== 'string' || !VALID_ASSET_TYPES.has(a.type)) return false;
    if (typeof a.instruction !== 'string' || !VALID_INSTRUCTIONS.has(a.instruction)) return false;
  }
  if (!Array.isArray(p.rulesOfEngagement) || !p.rulesOfEngagement.every((v) => typeof v === 'string')) return false;
  if (!Array.isArray(p.disallowedTechniques) || !p.disallowedTechniques.every((v) => typeof v === 'string')) {
    return false;
  }
  if (typeof p.signals !== 'object' || p.signals === null) return false;
  const signals = p.signals as Record<string, unknown>;
  for (const key of Object.keys(signals)) {
    if (!(SIGNAL_KEYS as readonly string[]).includes(key)) return false;
    if (!isSignal(signals[key])) return false;
  }
  if (typeof p.discoveredAt !== 'string') return false;
  return true;
}

export class FixtureDiscoveryProvider implements ProgramDiscoveryProvider {
  readonly name = 'fixture';

  constructor(private readonly filePath: string) {}

  async discoverPrograms(): Promise<Result<readonly DiscoveredProgram[], string>> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, 'utf8');
    } catch (error) {
      return err(`could not read discovery fixture "${this.filePath}": ${(error as Error).message}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      return err(`discovery fixture "${this.filePath}" is not valid JSON: ${(error as Error).message}`);
    }
    if (!Array.isArray(parsed) || !parsed.every(isValidRecord)) {
      return err(`discovery fixture "${this.filePath}" is not a valid array of discovered-program records`);
    }
    return ok(
      parsed.map((record) => ({
        ...record,
        sourceProvider: this.name,
      })) as unknown as readonly DiscoveredProgram[],
    );
  }
}
