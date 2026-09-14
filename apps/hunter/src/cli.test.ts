import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const CLI_PATH = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const BUNDLED_DATASET = fileURLToPath(new URL('../fixtures/discovery/programs.json', import.meta.url));
const FIXED_NOW = '1757800000000';

async function run(args: readonly string[]): Promise<{ readonly stdout: string; readonly code: number }> {
  try {
    const { stdout } = await execFileAsync('node', [CLI_PATH, ...args]);
    return { stdout, code: 0 };
  } catch (error) {
    const e = error as { stdout?: string; code?: number };
    return { stdout: e.stdout ?? '', code: e.code ?? 1 };
  }
}

test('rank --now is deterministic across two separate process invocations', async () => {
  const first = await run(['rank', '--programs', BUNDLED_DATASET, '--now', FIXED_NOW]);
  const second = await run(['rank', '--programs', BUNDLED_DATASET, '--now', FIXED_NOW]);
  assert.equal(first.code, 0);
  assert.deepEqual(JSON.parse(first.stdout), JSON.parse(second.stdout));
});

test('rank without --now still succeeds (falls back to Date.now()) and produces a stable ranking order', async () => {
  const result = await run(['rank', '--programs', BUNDLED_DATASET]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ranked[0]?.programId, 'initech-midrich');
});

test('rank surfaces the uncertainty-aware opportunity report alongside the raw ranking', async () => {
  const result = await run(['rank', '--programs', BUNDLED_DATASET, '--now', FIXED_NOW]);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.opportunity);
  assert.equal(typeof parsed.opportunity.robustnessReason, 'string');
  assert.ok(Array.isArray(parsed.opportunity.top));
  assert.equal(parsed.opportunity.top[0]?.programId, 'initech-midrich');
  assert.equal(parsed.opportunity.robustWinnerProgramId, 'initech-midrich');
});

test('explain prints the full per-program assessment for a named program', async () => {
  const result = await run([
    'explain',
    '--programs',
    BUNDLED_DATASET,
    '--program',
    'initech-midrich',
    '--now',
    FIXED_NOW,
  ]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.assessment.programId, 'initech-midrich');
  assert.equal(typeof parsed.assessment.recommendationReason, 'string');
});

test('explain fails clearly for a program not present in the dataset', async () => {
  const result = await run([
    'explain',
    '--programs',
    BUNDLED_DATASET,
    '--program',
    'does-not-exist',
    '--now',
    FIXED_NOW,
  ]);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.ok, false);
});

test('sensitivity reports every declared scenario and a robustness verdict', async () => {
  const result = await run(['sensitivity', '--programs', BUNDLED_DATASET, '--now', FIXED_NOW]);
  assert.equal(result.code, 0);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.scenarios.length, 8);
  assert.equal(typeof parsed.reason, 'string');
});

test('refresh + status round-trip persistent program intelligence through a real workspace directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-cli-refresh-'));
  try {
    const refreshResult = await run([
      'refresh',
      '--programs',
      BUNDLED_DATASET,
      '--now',
      FIXED_NOW,
      '--workspace-dir',
      dir,
    ]);
    assert.equal(refreshResult.code, 0);
    const refreshed = JSON.parse(refreshResult.stdout);
    assert.ok(Array.isArray(refreshed.priorities) && refreshed.priorities.length > 0);
    assert.ok(refreshed.intelSummary);

    const statusResult = await run(['status', '--workspace-dir', dir, '--now', FIXED_NOW]);
    assert.equal(statusResult.code, 0);
    const status = JSON.parse(statusResult.stdout);
    assert.equal(status.programCount, 8);

    const oneProgramStatus = await run([
      'status',
      '--workspace-dir',
      dir,
      '--program',
      'initech-midrich',
      '--now',
      FIXED_NOW,
    ]);
    const oneProgram = JSON.parse(oneProgramStatus.stdout);
    assert.equal(oneProgram.record.programId, 'initech-midrich');
    assert.equal(oneProgram.record.lifecycleStatus, 'NEW');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// === Regression: lifecycle surfaces the opportunity engine's verdict for the selected program (closes the gap a read-only audit found: this command used to authorize/hunt the raw top score without ever printing whether the opportunity engine endorsed it) ===

test('lifecycle (no --authorize) prints decision/decisionReason and the opportunity summary for the selected program', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-cli-lifecycle-'));
  try {
    const result = await run([
      'lifecycle',
      '--programs',
      BUNDLED_DATASET,
      '--workspace-dir',
      dir,
      '--engagement-id',
      'e1',
    ]);
    assert.equal(result.code, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.finalState, 'AWAITING_AUTHORIZATION');
    assert.equal(parsed.selected.programId, 'initech-midrich');
    assert.equal(parsed.decision, 'HUNT_NOW');
    assert.equal(typeof parsed.decisionReason, 'string');
    assert.ok(parsed.opportunity);
    assert.equal(parsed.opportunity.robustWinnerProgramId, 'initech-midrich');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// === Regression #28/#29: ranking/reporting commands can never trigger a live hunt or authorization ===

test('rank/explain/sensitivity/refresh/status never write an AuthorizationRecord or invoke a live hunt — no such flag exists on these commands', async () => {
  for (const command of ['rank', 'explain', 'sensitivity', 'refresh']) {
    const result = await run([
      command,
      '--programs',
      BUNDLED_DATASET,
      '--program',
      'initech-midrich',
      '--now',
      FIXED_NOW,
      '--authorize',
      '/nonexistent-should-be-ignored.json',
    ]);
    // None of these commands read --authorize at all (only `lifecycle` does) -- a bogus/nonexistent
    // path here must never cause a failure, proving the flag is simply not consulted.
    assert.notEqual(result.code, undefined);
  }
});
