/**
 * Real recon tool adapters.
 *
 * Every class here constructs a genuine, documented invocation of the named
 * tool and parses its real output format — these are not stubs. What makes
 * them safe to ship in this repository is that `run()` is never called
 * against a live target anywhere in this package's own code or tests: this
 * module's own tests exercise only `capability()` (which never contacts a
 * target — it just checks the binary's own `-version`/`-h` output) and the
 * exported pure parser functions (fed canned sample output). The one
 * exception is `FfufAdapter`, which the test suite genuinely executes
 * against a local Node HTTP server started for that test — never against
 * any external host.
 *
 * Flags reflect each tool's public CLI as of implementation time, cross-
 * checked against local `--help`/`-h` output for the tools actually
 * installed on the development machine (amass, ffuf, nuclei). A maintainer
 * should re-verify flags against the exact installed version before the
 * first live, authorized use of a tool this could not be checked against
 * here (subfinder, chaos, gau, waybackurls, httpx, katana, naabu).
 *
 * No adapter here ever executes without the caller first confirming scope
 * and authorization — that gate lives in `pipeline/adaptive-loop.ts`, not
 * in these adapters, which only know how to run one command.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ToolAdapter, ToolRunResult } from '../tools/registry.js';
import type {
  ActionKind,
  Observation,
  ObservationSource,
  RawDiscovery,
  ToolCapability,
  ToolRisk,
  ToolScopeRequirement,
} from '../types.js';
import { verifyToolIdentity } from './sources.js';

const execFileAsync = promisify(execFile);

export interface CaptureResult {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

/** Runs a binary with a bounded timeout, never throwing — a non-zero exit or a timeout is reported, not thrown. */
export async function spawnCapture(binary: string, args: readonly string[], timeoutMs: number): Promise<CaptureResult> {
  try {
    const { stdout, stderr } = await execFileAsync(binary, [...args], {
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout, stderr, exitCode: 0, timedOut: false };
  } catch (error) {
    const execError = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number;
      killed?: boolean;
      signal?: string;
    };
    return {
      stdout: execError.stdout ?? '',
      stderr: execError.stderr ?? execError.message,
      exitCode: typeof execError.code === 'number' ? execError.code : 1,
      timedOut: execError.signal === 'SIGTERM' || execError.killed === true,
    };
  }
}

function parseJsonLines(stdout: string): unknown[] {
  const records: unknown[] = [];
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // Tolerate a stray non-JSON line (banners, progress) rather than failing the whole parse.
    }
  }
  return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// === Passive: subfinder ===

export function parseSubfinderOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .filter((r) => typeof r.host === 'string')
    .map((r) => ({
      source: 'subfinder',
      kind: 'host' as const,
      label: r.host as string,
      attributes: typeof r.source === 'string' ? { subfinderSource: r.source } : {},
      confidence: 0.7,
      discoveredAt: now,
    }));
}

export class SubfinderAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly name = 'subfinder';
  readonly kind: ActionKind = 'passive-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'passive-only';
  readonly requiresAuthorization = false;
  readonly cost = 0.15;
  readonly risk: ToolRisk = 'none';
  readonly timeoutMs = 60_000;

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({ binary: 'subfinder', versionArgs: ['-version'], expectedSignature: /subfinder/i });
  }

  async run(input: { readonly domain: string }): Promise<ToolRunResult> {
    const result = await spawnCapture('subfinder', ['-d', input.domain, '-json', '-silent'], this.timeoutMs);
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `subfinder exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseSubfinderOutput(result.stdout);
    return {
      ok: true,
      summary: `subfinder found ${discoveries.length} host(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

// === Passive: amass ===
//
// Modern OWASP Amass (v4/v5) writes structured output to a directory
// (`-dir`) rather than stdout, and by default expects a local collection
// engine (`-engine`, default http://127.0.0.1:4000). Parsing here targets
// Amass's documented per-line JSON asset record shape; it has not been
// exercised against a live engine in this repository (no engine is
// configured or started by Hunter).

export function parseAmassOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .filter((r) => typeof r.name === 'string')
    .map((r) => ({
      source: 'amass',
      kind: 'host' as const,
      label: r.name as string,
      attributes: Array.isArray(r.sources) ? { amassSources: r.sources } : {},
      confidence: 0.75,
      discoveredAt: now,
    }));
}

export class AmassAdapter implements ToolAdapter<{ readonly domain: string; readonly outputDir: string }> {
  readonly name = 'amass';
  readonly kind: ActionKind = 'passive-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'passive-only';
  readonly requiresAuthorization = false;
  readonly cost = 0.3;
  readonly risk: ToolRisk = 'none';
  readonly timeoutMs = 120_000;

  capability(): Promise<ToolCapability> {
    // amass's own `-version` prints only a bare version number (no tool
    // name), so identity cannot be confirmed from it; `-h` prints the real
    // "OWASP Amass" banner and still includes the version at the end.
    return verifyToolIdentity({ binary: 'amass', versionArgs: ['-h'], expectedSignature: /owasp amass/i });
  }

  async run(input: { readonly domain: string; readonly outputDir: string }): Promise<ToolRunResult> {
    const result = await spawnCapture(
      'amass',
      ['enum', '-d', input.domain, '-dir', input.outputDir, '-silent'],
      this.timeoutMs,
    );
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `amass exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    // Amass v4/v5 write results under outputDir rather than stdout; the
    // caller is responsible for reading and passing that file's content to
    // parseAmassOutput once a real engine-backed run has been validated.
    return {
      ok: true,
      summary: `amass run completed; read ${input.outputDir} for results`,
      discoveries: [],
      observations: [],
      raw: result,
    };
  }
}

// === Passive: chaos (ProjectDiscovery) — requires PDCP_API_KEY ===

export function parseChaosOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .filter((r) => typeof r.input === 'string' || typeof r.host === 'string')
    .map((r) => ({
      source: 'chaos',
      kind: 'host' as const,
      label: (r.input ?? r.host) as string,
      attributes: {},
      confidence: 0.7,
      discoveredAt: now,
    }));
}

export class ChaosAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly name = 'chaos';
  readonly kind: ActionKind = 'passive-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'passive-only';
  readonly requiresAuthorization = false;
  readonly cost = 0.1;
  readonly risk: ToolRisk = 'none';
  readonly timeoutMs = 60_000;

  constructor(private readonly apiKeyEnvVar: string = 'PDCP_API_KEY') {}

  async capability(): Promise<ToolCapability> {
    const identity = await verifyToolIdentity({
      binary: 'chaos',
      versionArgs: ['-version'],
      expectedSignature: /chaos/i,
    });
    if (!identity.available) return identity;
    if (!process.env[this.apiKeyEnvVar]) {
      return {
        available: false,
        reason: `chaos binary present but ${this.apiKeyEnvVar} is not configured`,
        version: identity.version,
      };
    }
    return identity;
  }

  async run(input: { readonly domain: string }): Promise<ToolRunResult> {
    const result = await spawnCapture('chaos', ['-d', input.domain, '-json', '-silent'], this.timeoutMs);
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `chaos exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseChaosOutput(result.stdout);
    return {
      ok: true,
      summary: `chaos found ${discoveries.length} host(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

// === Passive: certificate transparency (crt.sh) — HTTP, not a binary ===

interface CrtShRecord {
  readonly name_value?: string;
  readonly common_name?: string;
}

export function parseCrtShOutput(json: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) return [];
  const labels = new Set<string>();
  for (const entry of parsed) {
    if (!isRecord(entry)) continue;
    const record = entry as CrtShRecord;
    for (const raw of [record.name_value, record.common_name]) {
      if (typeof raw !== 'string') continue;
      for (const name of raw.split('\n')) {
        const trimmed = name.trim().toLowerCase().replace(/^\*\./, '');
        if (trimmed.length > 0) labels.add(trimmed);
      }
    }
  }
  return Array.from(labels).map((label) => ({
    source: 'certificate-transparency',
    kind: 'host' as const,
    label,
    attributes: {},
    confidence: 0.6,
    discoveredAt: now,
  }));
}

export class CertificateTransparencyAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly name = 'certificate-transparency';
  readonly kind: ActionKind = 'passive-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'passive-only';
  readonly requiresAuthorization = false;
  readonly cost = 0.05;
  readonly risk: ToolRisk = 'none';
  readonly timeoutMs = 15_000;

  capability(): Promise<ToolCapability> {
    // No binary is required — availability depends only on outbound network access, which this adapter does not itself verify.
    return Promise.resolve({ available: true, reason: 'HTTP-based; no local binary required', version: undefined });
  }

  async run(input: { readonly domain: string }): Promise<ToolRunResult> {
    try {
      const response = await fetch(`https://crt.sh/?q=%25.${encodeURIComponent(input.domain)}&output=json`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!response.ok) {
        return {
          ok: false,
          summary: `crt.sh responded ${response.status}`,
          discoveries: [],
          observations: [],
          raw: undefined,
        };
      }
      const body = await response.text();
      const discoveries = parseCrtShOutput(body);
      return {
        ok: true,
        summary: `certificate transparency found ${discoveries.length} host(s)`,
        discoveries,
        observations: [],
        raw: undefined,
      };
    } catch (error) {
      return {
        ok: false,
        summary: `crt.sh request failed: ${(error as Error).message}`,
        discoveries: [],
        observations: [],
        raw: undefined,
      };
    }
  }
}

// === Passive: gau / waybackurls ===

export function parseUrlListOutput(source: 'gau' | 'waybackurls', stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  const urls = stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return urls.map((url) => ({
    source,
    kind: 'endpoint' as const,
    label: url,
    attributes: {},
    confidence: 0.4,
    discoveredAt: now,
  }));
}

class UrlArchiveAdapter implements ToolAdapter<{ readonly domain: string }> {
  readonly kind: ActionKind = 'passive-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'passive-only';
  readonly requiresAuthorization = false;
  readonly cost = 0.15;
  readonly risk: ToolRisk = 'none';
  readonly timeoutMs = 60_000;

  constructor(
    readonly name: 'gau' | 'waybackurls',
    private readonly buildArgs: (domain: string) => readonly string[],
  ) {}

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({
      binary: this.name,
      versionArgs: ['-version'],
      expectedSignature: new RegExp(this.name, 'i'),
    });
  }

  async run(input: { readonly domain: string }): Promise<ToolRunResult> {
    const result = await spawnCapture(this.name, this.buildArgs(input.domain), this.timeoutMs);
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `${this.name} exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseUrlListOutput(this.name, result.stdout);
    return {
      ok: true,
      summary: `${this.name} found ${discoveries.length} archived URL(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

export class GauAdapter extends UrlArchiveAdapter {
  constructor() {
    super('gau', (domain) => [domain]);
  }
}

export class WaybackurlsAdapter extends UrlArchiveAdapter {
  constructor() {
    super('waybackurls', (domain) => [domain]);
  }
}

// === Active: httpx (ProjectDiscovery) ===

interface HttpxRecord {
  readonly url?: string;
  readonly host?: string;
  readonly 'status-code'?: number;
  readonly status_code?: number;
  readonly title?: string;
  readonly tech?: readonly string[];
}

export function parseHttpxOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .map((raw) => raw as HttpxRecord)
    .filter((r) => typeof r.url === 'string' || typeof r.host === 'string')
    .map((r) => ({
      source: 'httpx',
      kind: 'application' as const,
      label: (r.url ?? r.host) as string,
      attributes: {
        ...(r.host !== undefined ? { host: r.host } : {}),
        ...(r['status-code'] !== undefined ? { statusCode: r['status-code'] } : {}),
        ...(r.status_code !== undefined ? { statusCode: r.status_code } : {}),
        ...(r.title !== undefined ? { title: r.title } : {}),
        ...(r.tech !== undefined ? { tech: r.tech } : {}),
      },
      confidence: 0.85,
      discoveredAt: now,
    }));
}

export class HttpxAdapter implements ToolAdapter<{ readonly url: string }> {
  readonly name = 'httpx';
  readonly kind: ActionKind = 'active-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.2;
  readonly risk: ToolRisk = 'low';
  readonly timeoutMs = 30_000;

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({ binary: 'httpx', versionArgs: ['-version'], expectedSignature: /projectdiscovery/i });
  }

  async run(input: { readonly url: string }): Promise<ToolRunResult> {
    const result = await spawnCapture(
      'httpx',
      ['-u', input.url, '-json', '-silent', '-status-code', '-title', '-tech-detect'],
      this.timeoutMs,
    );
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `httpx exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseHttpxOutput(result.stdout);
    return {
      ok: true,
      summary: `httpx probed ${discoveries.length} target(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

// === Active: katana (ProjectDiscovery) ===

export function parseKatanaOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .map((r) => {
      const endpoint = isRecord(r.request) ? r.request : r;
      return typeof endpoint.endpoint === 'string'
        ? (endpoint.endpoint as string)
        : typeof r.url === 'string'
          ? (r.url as string)
          : undefined;
    })
    .filter((url): url is string => url !== undefined)
    .map((url) => ({
      source: 'katana',
      kind: 'endpoint' as const,
      label: url,
      attributes: {},
      confidence: 0.75,
      discoveredAt: now,
    }));
}

export class KatanaAdapter implements ToolAdapter<{ readonly url: string }> {
  readonly name = 'katana';
  readonly kind: ActionKind = 'active-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.3;
  readonly risk: ToolRisk = 'low';
  readonly timeoutMs = 60_000;

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({ binary: 'katana', versionArgs: ['-version'], expectedSignature: /katana/i });
  }

  async run(input: { readonly url: string }): Promise<ToolRunResult> {
    const result = await spawnCapture('katana', ['-u', input.url, '-jsonl', '-silent'], this.timeoutMs);
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `katana exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseKatanaOutput(result.stdout);
    return {
      ok: true,
      summary: `katana crawled ${discoveries.length} endpoint(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

// === Active: naabu (ProjectDiscovery) ===

export function parseNaabuOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  return parseJsonLines(stdout)
    .filter(isRecord)
    .filter((r) => typeof r.host === 'string' && typeof r.port === 'number')
    .map((r) => ({
      source: 'naabu',
      kind: 'host' as const,
      label: `${r.host}:${r.port}`,
      attributes: { host: r.host, port: r.port },
      confidence: 0.9,
      discoveredAt: now,
    }));
}

export class NaabuAdapter implements ToolAdapter<{ readonly host: string }> {
  readonly name = 'naabu';
  readonly kind: ActionKind = 'active-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.35;
  readonly risk: ToolRisk = 'medium';
  readonly timeoutMs = 60_000;

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({ binary: 'naabu', versionArgs: ['-version'], expectedSignature: /naabu/i });
  }

  async run(input: { readonly host: string }): Promise<ToolRunResult> {
    const result = await spawnCapture('naabu', ['-host', input.host, '-json', '-silent'], this.timeoutMs);
    if (result.exitCode !== 0) {
      return {
        ok: false,
        summary: `naabu exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const discoveries = parseNaabuOutput(result.stdout);
    return {
      ok: true,
      summary: `naabu found ${discoveries.length} open port(s)`,
      discoveries,
      observations: [],
      raw: result,
    };
  }
}

// === Active: ffuf ===
//
// `ffuf -json` prints newline-delimited JSON — one complete match record
// per line (fields include `url`, `status`, `length`, `words`, `lines`,
// `content-type`) — not a single summary object with a `results` array
// (that shape belongs to the older `-o out.json -of json` file output).
// Verified against a real local `ffuf` run against `testing/local-app-server.ts`.

interface FfufRecord {
  readonly url?: string;
  readonly status?: number;
  readonly length?: number;
}

export function parseFfufOutput(stdout: string): readonly RawDiscovery[] {
  const now = new Date().toISOString();
  const discoveries: RawDiscovery[] = [];
  for (const rawLine of stdout.split('\n')) {
    // ffuf can prefix a line with terminal control codes even in non-interactive use; find the JSON object rather than requiring the line to start with it.
    const start = rawLine.indexOf('{');
    const end = rawLine.lastIndexOf('}');
    if (start === -1 || end === -1 || end < start) continue;
    let record: FfufRecord;
    try {
      record = JSON.parse(rawLine.slice(start, end + 1)) as FfufRecord;
    } catch {
      continue;
    }
    if (typeof record.url !== 'string') continue;
    discoveries.push({
      source: 'ffuf',
      kind: 'endpoint',
      label: record.url,
      attributes: {
        ...(record.status !== undefined ? { statusCode: record.status } : {}),
        ...(record.length !== undefined ? { contentLength: record.length } : {}),
      },
      confidence: 0.8,
      discoveredAt: now,
    });
  }
  return discoveries;
}

export interface FfufInput {
  readonly url: string;
  readonly wordlistPath: string;
  readonly matchCodes?: string;
}

/**
 * Interprets a completed ffuf run. `-json -s` (silent) prints nothing at
 * all to stdout when zero words matched `-mc` — that is a normal, successful
 * outcome (the scan ran to completion and genuinely found nothing), not a
 * failure, so success/failure here is decided purely by exit code, never by
 * "was stdout empty". `parseFfufOutput('')` already correctly returns `[]`,
 * so a zero-match run naturally produces `ok: true` with `discoveries: []` —
 * distinguished from a real error (non-zero exit: bad flags, unreachable
 * target, wordlist not found, ...) which is `ok: false` regardless of
 * whatever partial stdout it produced. Exported and pure so every branch is
 * unit-testable without spawning a process — see `cli-adapters.test.ts`.
 */
export function interpretFfufResult(result: CaptureResult): ToolRunResult {
  if (result.exitCode !== 0) {
    return {
      ok: false,
      summary: `ffuf exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
      discoveries: [],
      observations: [],
      raw: result,
    };
  }
  const discoveries = parseFfufOutput(result.stdout);
  return {
    ok: true,
    summary:
      discoveries.length > 0
        ? `ffuf found ${discoveries.length} matching path(s)`
        : 'ffuf completed successfully with zero matching paths',
    discoveries,
    observations: [],
    raw: result,
  };
}

export class FfufAdapter implements ToolAdapter<FfufInput> {
  readonly name = 'ffuf';
  readonly kind: ActionKind = 'active-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.4;
  readonly risk: ToolRisk = 'medium';
  readonly timeoutMs = 30_000;

  capability(): Promise<ToolCapability> {
    return verifyToolIdentity({ binary: 'ffuf', versionArgs: ['-V'], expectedSignature: /ffuf/i });
  }

  async run(input: FfufInput): Promise<ToolRunResult> {
    const args = [
      '-u',
      input.url,
      '-w',
      input.wordlistPath,
      '-json',
      '-s',
      '-mc',
      input.matchCodes ?? '200,301,302,401,403',
    ];
    const result = await spawnCapture('ffuf', args, this.timeoutMs);
    return interpretFfufResult(result);
  }
}

// === Active: nuclei (ProjectDiscovery) ===

interface NucleiRecord {
  readonly 'template-id'?: string;
  readonly info?: { readonly name?: string; readonly severity?: string };
  readonly 'matched-at'?: string;
  readonly host?: string;
}

export function parseNucleiOutput(
  stdout: string,
  engagementId: string,
): { readonly discoveries: readonly RawDiscovery[]; readonly observations: readonly Observation[] } {
  const now = new Date().toISOString();
  const records = parseJsonLines(stdout)
    .filter(isRecord)
    .map((r) => r as NucleiRecord);

  const discoveries: RawDiscovery[] = records
    .filter((r) => typeof r['matched-at'] === 'string')
    .map((r) => ({
      source: 'nuclei',
      kind: 'endpoint' as const,
      label: r['matched-at'] as string,
      attributes: {},
      confidence: 0.7,
      discoveredAt: now,
    }));

  const observationSource: ObservationSource = 'active-recon';
  const observations: Observation[] = records.map((r, index) => ({
    id: `obs-nuclei-${index}-${now}`,
    engagementId,
    source: observationSource,
    assetRef: (r['matched-at'] ?? r.host ?? 'unknown') as string,
    vulnClass: r['template-id'] ?? 'nuclei-finding',
    title: r.info?.name ?? r['template-id'] ?? 'nuclei finding',
    description: `nuclei template "${r['template-id'] ?? 'unknown'}" matched at ${r['matched-at'] ?? r.host ?? 'unknown'}. A template match is a candidate, not a confirmed vulnerability — requires independent reproduction.`,
    severityHint: r.info?.severity ?? 'unknown',
    confidenceHint: 'medium',
    verified: false,
    tags: ['nuclei'],
    collectedAt: now,
  }));

  return { discoveries, observations };
}

export class NucleiAdapter
  implements ToolAdapter<{ readonly url: string; readonly engagementId: string; readonly severity?: string }>
{
  readonly name = 'nuclei';
  readonly kind: ActionKind = 'active-recon';
  readonly scopeRequirement: ToolScopeRequirement = 'active-in-scope';
  readonly requiresAuthorization = true;
  readonly cost = 0.5;
  readonly risk: ToolRisk = 'medium';
  readonly timeoutMs = 120_000;

  capability(): Promise<ToolCapability> {
    // nuclei's own startup (config/template/cache directory setup) takes
    // several seconds even for `-version` — verified locally to take ~7s —
    // so this needs a longer timeout than most tools' identity checks.
    // `-duc` (disable-update-check) is passed even here so a mere
    // capability check can never trigger an outbound template-update
    // request.
    return verifyToolIdentity(
      { binary: 'nuclei', versionArgs: ['-version', '-duc'], expectedSignature: /nuclei/i },
      15_000,
    );
  }

  async run(input: {
    readonly url: string;
    readonly engagementId: string;
    readonly severity?: string;
  }): Promise<ToolRunResult> {
    // -duc (disable-update-check) is mandatory here: without it nuclei may
    // attempt to fetch template/engine updates from the network on its own,
    // which this package must never do implicitly.
    const args = ['-target', input.url, '-jsonl', '-silent', '-duc'];
    if (input.severity) args.push('-severity', input.severity);
    const result = await spawnCapture('nuclei', args, this.timeoutMs);
    if (result.exitCode !== 0 && result.stdout.trim().length === 0) {
      return {
        ok: false,
        summary: `nuclei exited ${result.exitCode}: ${result.stderr.slice(0, 500)}`,
        discoveries: [],
        observations: [],
        raw: result,
      };
    }
    const { discoveries, observations } = parseNucleiOutput(result.stdout, input.engagementId);
    return {
      ok: true,
      summary: `nuclei produced ${observations.length} candidate finding(s)`,
      discoveries,
      observations,
      raw: result,
    };
  }
}
