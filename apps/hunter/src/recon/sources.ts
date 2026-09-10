/**
 * Recon source abstraction + capability detection.
 *
 * `ReconSource` is the common interface for every passive/active recon
 * input (subfinder, amass, chaos, certificate transparency, gau/
 * waybackurls, httpx, katana, …). The only implementation this package
 * exercises automatically is `LocalFixtureReconSource`, which reads a local
 * JSON file of discoveries — this is what backs the offline simulation and
 * dry-run mode. `isToolInstalled` genuinely checks (via `which`, no
 * arguments to the tool itself) whether a real binary is present on PATH,
 * so a future `CommandLineReconSource` can decide whether it is even
 * possible to run before doing so — "detect capabilities before execution,"
 * never assume a tool is installed.
 */

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import type { RawDiscovery, ToolCapability, WorldModelNodeKind } from '../types.js';

const execFileAsync = promisify(execFile);

export interface ReconSource {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  discover(): Promise<readonly RawDiscovery[]>;
}

/** Checks whether a binary is on PATH. Never executes the tool itself. */
export async function isToolInstalled(binaryName: string): Promise<boolean> {
  try {
    await execFileAsync('which', [binaryName], { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

export interface ToolIdentityCheck {
  readonly binary: string;
  readonly versionArgs: readonly string[];
  /** Matched against combined stdout+stderr of the version/help invocation to confirm this is really the expected tool, not a same-named unrelated binary. */
  readonly expectedSignature: RegExp;
}

/**
 * Verifies both that a binary is on PATH *and* that it is actually the
 * expected tool — several common recon tool names (e.g. `httpx`) collide
 * with unrelated binaries on a general-purpose system. Never assumes
 * identity from the name alone, and never runs the tool against any target;
 * it only inspects the tool's own version/help output.
 */
export async function verifyToolIdentity(check: ToolIdentityCheck, timeoutMs = 5000): Promise<ToolCapability> {
  const installed = await isToolInstalled(check.binary);
  if (!installed) {
    return { available: false, reason: `"${check.binary}" was not found on PATH`, version: undefined };
  }
  try {
    const { stdout, stderr } = await execFileAsync(check.binary, [...check.versionArgs], { timeout: timeoutMs });
    const combined = `${stdout}\n${stderr}`;
    if (!check.expectedSignature.test(combined)) {
      return {
        available: false,
        reason: `a binary named "${check.binary}" is on PATH but its output does not match the expected tool's signature — it is likely a different, unrelated program`,
        version: undefined,
      };
    }
    const versionMatch = combined.match(/v?\d+\.\d+(?:\.\d+)?/);
    return {
      available: true,
      reason: `identity verified via ${[check.binary, ...check.versionArgs].join(' ')}`,
      version: versionMatch?.[0],
    };
  } catch (error) {
    return {
      available: false,
      reason: `capability check for "${check.binary}" failed: ${(error as Error).message}`,
      version: undefined,
    };
  }
}

interface FixtureDiscoveryRecord {
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly confidence: number;
  readonly attributes?: Readonly<Record<string, unknown>>;
}

function isFixtureDiscoveryRecord(value: unknown): value is FixtureDiscoveryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.kind === 'string' && typeof record.label === 'string' && typeof record.confidence === 'number';
}

/**
 * A recon source backed entirely by a local JSON fixture file — used for
 * every source in the offline simulation, and for a real source before its
 * live command-line integration is written. Never touches the network.
 */
export class LocalFixtureReconSource implements ReconSource {
  constructor(
    readonly name: string,
    private readonly fixturePath: string,
  ) {}

  async isAvailable(): Promise<boolean> {
    try {
      await readFile(this.fixturePath, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  async discover(): Promise<readonly RawDiscovery[]> {
    const raw = JSON.parse(await readFile(this.fixturePath, 'utf8'));
    if (!Array.isArray(raw) || !raw.every(isFixtureDiscoveryRecord)) {
      throw new Error(`fixture recon source "${this.name}" at "${this.fixturePath}" is not a valid discovery list`);
    }
    const discoveredAt = new Date().toISOString();
    return raw.map((record) => ({
      source: this.name,
      kind: record.kind,
      label: record.label,
      attributes: record.attributes ?? {},
      confidence: record.confidence,
      discoveredAt,
    }));
  }
}

/** Runs every available source and concatenates their raw discoveries. */
export async function runReconSources(sources: readonly ReconSource[]): Promise<readonly RawDiscovery[]> {
  const results: RawDiscovery[] = [];
  for (const source of sources) {
    if (!(await source.isAvailable())) {
      continue;
    }
    results.push(...(await source.discover()));
  }
  return results;
}
