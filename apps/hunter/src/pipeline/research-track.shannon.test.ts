/**
 * Shannon-kind research-track experiments.
 *
 * Proves the research track's Shannon integration end to end through the
 * exact same `shannon/execution-adapter.ts:executeShannonAction` the
 * primary loop uses — never a second implementation, never a real
 * subprocess. Every scenario here injects a fake `spawnImpl` (the same
 * seam `pipeline/adaptive-loop.test.ts`'s own live-Shannon test uses) so
 * "live execution" means "genuinely reached `executeShannonAction` and its
 * confirmation gate," not "contacted a real target."
 */

import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { analyzeJavaScript } from '../recon/js-intel.js';
import type { SpawnFn } from '../shannon/execution-adapter.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import type { ProgramScope } from '../types.js';
import { emptyWorldModel } from '../worldmodel/graph.js';
import { runResearchTrack } from './research-track.js';

function program(): ProgramScope {
  return {
    programId: 'prog-1',
    programName: 'Test Program',
    platform: 'hackerone',
    authorizationConfirmed: true,
    assets: [
      {
        identifier: 'app.example.com',
        type: 'domain',
        instruction: 'in-scope',
        tier: 'standard',
        bountyEligible: true,
        requiresAuthentication: false,
      },
    ],
    rulesOfEngagement: [],
    disallowedTechniques: [],
    rateLimitPerMinute: 60,
  };
}

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-research-shannon-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** A real local directory Shannon's eligibility check accepts — never actually read by Shannon itself in these tests. */
async function makeFakeRepo(workspaceDir: string): Promise<string> {
  const repo = join(workspaceDir, 'repo');
  await mkdir(repo, { recursive: true });
  return repo;
}

function mockChildProcess(exitCode: number): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess & { stdout: EventEmitter; stderr: EventEmitter };
  (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
  (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
  (child as unknown as { kill: () => void }).kill = () => {
    child.emit('close', 143);
  };
  setTimeout(() => child.emit('close', exitCode), 0);
  return child;
}

function countingSpawn(exitCode: number): { readonly spawnImpl: SpawnFn; readonly calls: () => number } {
  let calls = 0;
  const spawnImpl: SpawnFn = () => {
    calls += 1;
    return mockChildProcess(exitCode);
  };
  return { spawnImpl, calls: () => calls };
}

async function writeReportJson(workspaceDir: string, report: unknown): Promise<void> {
  const dir = join(workspaceDir, 'shannon-run', '.shannon', 'deliverables');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'report.json'), JSON.stringify(report), 'utf8');
}

function exploitedReport(assetRef: string) {
  return {
    report_meta: {
      target: assetRef,
      assessment_date: '2026-01-01',
      scope: assetRef,
      executive_summary: 'Shannon confirmed a DOM XSS.',
      exploit: true,
    },
    findings: [
      {
        finding_id: 'XSS-01',
        title: 'DOM XSS confirmed',
        category: 'XSS',
        owasp_category: 'A05:2025 — Injection',
        severity: 'medium',
        vulnerable_location: '/search',
        http_location: { method: 'GET', url: assetRef, parameter: 'q' },
        overview: 'Confirmed by a (mocked) Shannon process.',
        impact: 'Arbitrary script execution.',
        remediation: 'Encode output.',
        status: 'exploited',
      },
    ],
  };
}

function nonExploitedReport(assetRef: string) {
  return {
    report_meta: {
      target: assetRef,
      assessment_date: '2026-01-01',
      scope: assetRef,
      executive_summary: 'Shannon investigated but could not confirm exploitation.',
      exploit: true,
    },
    findings: [
      {
        finding_id: 'XSS-02',
        title: 'Possible DOM XSS, not confirmed',
        category: 'XSS',
        owasp_category: 'A05:2025 — Injection',
        severity: 'medium',
        vulnerable_location: '/search',
        http_location: { method: 'GET', url: assetRef, parameter: 'q' },
        overview: 'Static signal only; dynamic exploitation was not achieved.',
        impact: 'None demonstrated.',
        remediation: 'N/A',
        status: 'false_positive',
      },
    ],
  };
}

/** Produces a real "xss"-vulnClass, "shannon"-actionKind research hypothesis by feeding a genuine DOM-XSS pattern through js-intel.ts, exactly as the bundled simulation does. */
function shannonEligibleProvenanceEdges(assetRef: string, sourceRef: string) {
  const result = analyzeJavaScript(
    'const q = new URLSearchParams(location.search).get("q"); resultsDiv.innerHTML = q;',
    sourceRef,
    assetRef,
    'e1',
  );
  return result.provenanceEdges;
}

test('a real DOM-XSS lead becomes a Shannon-kind hypothesis, and confirmed live execution ingests an exploited finding through the shared adapter', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    await writeReportJson(workspaceDir, exploitedReport(assetRef));
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 1, 'Shannon must actually be invoked exactly once through the injected spawn seam');
    assert.ok(output.log.some((line) => line.includes('Shannon executed live')));
    const hypothesis = output.hypotheses.find((h) => h.vulnClass === 'xss' && h.assetRef === assetRef);
    assert.ok(hypothesis, 'the research track must have generated a real Shannon-routable xss hypothesis');
    assert.ok(
      hypothesis && hypothesis.supportingObservationIds.length > 0,
      'the ingested observation must fold back into the hypothesis',
    );
    assert.equal(output.findings.length, 1);
    assert.equal(output.findings[0]?.vulnClass, 'xss');
    assert.equal(output.findings[0]?.status, 'reproduced');
    assert.ok(output.log.some((line) => line.includes('adversarial-validation') && line.includes('passed')));
  });
});

test('a failed Shannon execution is reported as FAILED and never becomes a finding', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    const spy = countingSpawn(1); // non-zero exit

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 1);
    assert.ok(output.log.some((line) => line.includes('[FAILED]')));
    assert.equal(output.findings.length, 0);
  });
});

test('a valid but non-exploited Shannon result never verifies the observation, so adversarial validation stays inconclusive and no finding is produced', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    await writeReportJson(workspaceDir, nonExploitedReport(assetRef));
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 1);
    assert.ok(
      output.log.some((line) => line.includes('EXECUTED_WITH_RESULTS') || line.includes('EXECUTED_NO_RESULTS')),
    );
    assert.ok(output.log.some((line) => line.includes('adversarial-validation') && line.includes('inconclusive')));
    assert.equal(output.findings.length, 0);
  });
});

test('malformed Shannon output yields zero observations without failing the execution, and never becomes a finding', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    const dir = join(workspaceDir, 'shannon-run', '.shannon', 'deliverables');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'report.json'), '{not valid json', 'utf8');
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 1);
    assert.ok(output.log.some((line) => line.includes('EXECUTED_NO_RESULTS')));
    assert.equal(output.findings.length, 0);
  });
});

test('Shannon is never invoked when unavailable (no eligible local repository) — the spawn seam is never reached', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      // repoPath omitted entirely — Shannon is source-aware only.
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 0, 'no local repository is eligible; Shannon must never be spawned');
    assert.ok(output.log.some((line) => line.includes('[UNAVAILABLE]') || line.includes('UNAVAILABLE')));
    assert.equal(output.findings.length, 0);
  });
});

test('without live.shannon.confirmed, a captured fixture is safely ingested but the spawn seam is never reached — confirmation is not implied by other live options', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://app.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    const fixturePath = join(workspaceDir, 'captured-report.json');
    await writeFile(fixturePath, JSON.stringify(exploitedReport(assetRef)), 'utf8');
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      shannonOutputsByAsset: new Map([[assetRef, fixturePath]]),
      // live.registry is configured (so non-Shannon experiments could run),
      // but live.shannon (confirmation) is deliberately omitted.
      live: { registry: buildDefaultToolRegistry() },
    });

    assert.equal(spy.calls(), 0, 'spawnImpl was never even supplied to this run — nothing could have called it');
    assert.ok(
      output.log.some((line) => line.includes('MOCKED')),
      'the dry-run/fixture path must still safely ingest the captured output',
    );
    // A single-source, exploited observation is still enough to reach "reproduced" — proving ingestion genuinely worked without a live spawn.
    assert.equal(output.findings.length, 1);
    assert.equal(output.findings[0]?.status, 'reproduced');
  });
});

test('the research track enforces its own, independent Shannon execution budget', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetA = 'https://app.example.com/search';
    const assetB = 'https://app.example.com/other-search';
    const repoPath = await makeFakeRepo(workspaceDir);
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: [
        ...shannonEligibleProvenanceEdges(assetA, 'bundle-a.js'),
        ...shannonEligibleProvenanceEdges(assetB, 'bundle-b.js'),
      ],
      behavioralFixtures: [],
      isInScope: () => true,
      repoPath,
      budget: { maxShannonExecutions: 1, maxExperiments: 10 },
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 1, 'only one Shannon execution may occur once the research track budget is exhausted');
    assert.ok(output.log.some((line) => line.includes('Shannon execution budget exhausted')));
  });
});

test('an out-of-scope Shannon-kind experiment is blocked before any execution is attempted', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const assetRef = 'https://out-of-scope.example.com/search';
    const repoPath = await makeFakeRepo(workspaceDir);
    const spy = countingSpawn(0);

    const output = await runResearchTrack({
      engagementId: 'e1',
      workspaceDir,
      program: program(),
      worldModel: emptyWorldModel(),
      jsProvenanceEdges: shannonEligibleProvenanceEdges(assetRef, 'bundle-search.js'),
      behavioralFixtures: [],
      isInScope: (ref) => !ref.includes('out-of-scope'),
      repoPath,
      live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl: spy.spawnImpl } },
    });

    assert.equal(spy.calls(), 0);
    assert.equal(output.hypotheses.length, 0, 'an out-of-scope hypothesis must never even be generated');
  });
});

test('the research track never imports a process-spawning module directly — Shannon execution is only reachable through the shared adapter', async () => {
  const compiled = await readFile(new URL('./research-track.js', import.meta.url), 'utf8');
  assert.doesNotMatch(compiled, /from ['"]node:child_process['"]/);
  assert.doesNotMatch(compiled, /\bspawn\s*\(/);
});
