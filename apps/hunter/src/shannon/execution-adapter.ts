/**
 * Shannon execution adapter — the real live-execution lifecycle.
 *
 * `planShannonAction` is always safe to call: it checks eligibility (a real
 * local repo must exist) and builds the exact verified invocation, without
 * running anything. `executeShannonAction` is the only function in this
 * entire package that can actually spawn the Shannon CLI, and it refuses
 * outright unless `confirmed: true` is passed explicitly — nothing in
 * `pipeline/adaptive-loop.ts` ever sets that automatically just because a
 * reasoning provider (Claude or heuristic) selected a "shannon" action.
 * Live execution requires a separate, explicit operator confirmation on
 * top of the normal scope/eligibility gates.
 *
 * `spawnImpl` is injectable so tests can verify the full lifecycle
 * (argument construction, stdout/stderr capture, exit-code handling,
 * report discovery) without ever spawning a real process.
 */

import { type ChildProcess, spawn } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ingestShannonOutput, parseShannonReport } from '../ingestion/shannon-output.js';
import { err, type Observation, ok, type Result } from '../types.js';
import {
  buildShannonInvocation,
  formatInvocation,
  type ShannonInvocation,
  type ShannonInvocationInput,
} from './config.js';
import { checkShannonEligibility } from './eligibility.js';

export interface ShannonExecutionPlan {
  readonly eligible: boolean;
  readonly reason: string;
  readonly invocation: ShannonInvocation | undefined;
  readonly commandLine: string | undefined;
}

/** Always safe: checks eligibility and builds the invocation, but never runs anything. */
export async function planShannonAction(input: ShannonInvocationInput): Promise<Result<ShannonExecutionPlan, string>> {
  const eligibility = await checkShannonEligibility(input.repo);
  if (!eligibility.eligible) {
    return ok({ eligible: false, reason: eligibility.reason, invocation: undefined, commandLine: undefined });
  }
  const built = buildShannonInvocation(input);
  if (!built.ok) {
    return err(built.error);
  }
  return ok({
    eligible: true,
    reason: eligibility.reason,
    invocation: built.value,
    commandLine: formatInvocation(built.value),
  });
}

export type SpawnFn = (command: string, args: readonly string[]) => ChildProcess;

const defaultSpawn: SpawnFn = (command, args) => spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });

export interface ShannonExecutionOptions {
  readonly confirmed: boolean;
  readonly engagementId: string;
  readonly workspaceDir: string;
  readonly timeoutMs?: number;
  readonly spawnImpl?: SpawnFn;
}

export interface ShannonExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly reportPath: string | undefined;
  readonly observations: readonly Observation[];
}

/** Depth-bounded search for a file literally named report.json under workspaceDir (Shannon's structured findings output). */
async function findReportJson(dir: string, depthRemaining: number): Promise<string | undefined> {
  if (depthRemaining < 0) return undefined;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (entry.isFile() && entry.name === 'report.json') {
      return join(dir, entry.name);
    }
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const found = await findReportJson(join(dir, entry.name), depthRemaining - 1);
      if (found) return found;
    }
  }
  return undefined;
}

interface CapturedProcess {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;
}

function runProcess(
  spawnImpl: SpawnFn,
  command: string,
  args: readonly string[],
  timeoutMs: number | undefined,
): Promise<CapturedProcess> {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args);
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer =
      timeoutMs !== undefined
        ? setTimeout(() => {
            timedOut = true;
            child.kill('SIGTERM');
          }, timeoutMs)
        : undefined;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1, timedOut });
    });
  });
}

/**
 * Executes Shannon for real. Requires `confirmed: true`; nothing else in
 * this package ever sets that. After the process exits, searches
 * `workspaceDir` for a `report.json` and — if one parses against the
 * expected shape (see `ingestion/shannon-output.ts` for known limitations
 * there) — ingests it into observations.
 */
export async function executeShannonAction(
  invocation: ShannonInvocation,
  options: ShannonExecutionOptions,
): Promise<Result<ShannonExecutionResult, string>> {
  if (!options.confirmed) {
    return err('refusing to execute Shannon: caller did not pass confirmed: true');
  }

  let captured: CapturedProcess;
  try {
    captured = await runProcess(
      options.spawnImpl ?? defaultSpawn,
      invocation.command,
      invocation.args,
      options.timeoutMs,
    );
  } catch (error) {
    return err(`failed to start Shannon: ${(error as Error).message}`);
  }

  const reportPath = await findReportJson(options.workspaceDir, 6);
  let observations: readonly Observation[] = [];
  if (reportPath) {
    try {
      const raw = JSON.parse(await readFile(reportPath, 'utf8'));
      const parsed = parseShannonReport(raw);
      if (parsed.ok) {
        observations = ingestShannonOutput(parsed.value, options.engagementId);
      }
    } catch {
      // A report.json that fails to read/parse yields no observations rather than failing the whole execution result — exitCode/stdout/stderr are still meaningful.
    }
  }

  return ok({
    exitCode: captured.exitCode,
    stdout: captured.stdout,
    stderr: captured.stderr,
    timedOut: captured.timedOut,
    reportPath,
    observations,
  });
}
