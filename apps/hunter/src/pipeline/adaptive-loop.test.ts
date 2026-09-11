import assert from 'node:assert/strict';
import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { appendMemory, recordMemory } from '../memory/hunt-memory.js';
import { HeuristicReasoningProvider } from '../reasoning/heuristic-provider.js';
import type { ReasoningProvider } from '../reasoning/provider.js';
import type { ReasoningRouter } from '../reasoning/router.js';
import type { SpawnFn } from '../shannon/execution-adapter.js';
import { buildDefaultToolRegistry } from '../tools/default-registry.js';
import type { ActionProposal } from '../types.js';
import { crossSourceCorrelatedNodes, findNode } from '../worldmodel/graph.js';
import { runAdaptiveHunt } from './adaptive-loop.js';
import { buildBundledSimulationInput } from './simulation-loader.js';

async function withTempWorkspace<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), 'hunter-adaptive-loop-test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('full bundled simulation: recon builds a correlated world model, hypotheses compete, one is validated and drafted', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-1', workspaceDir, maxRounds: 6 });
    const result = await runAdaptiveHunt(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const { worldModel, checkpoint, finding, reportDraftPath, metrics, log } = result.value;

    // DISCOVER / CORRELATE
    assert.ok(findNode(worldModel, 'host', 'app.example.com'));
    assert.ok(findNode(worldModel, 'host', 'admin.example.com'), 'out-of-scope host is still recorded, just tagged');
    assert.equal(findNode(worldModel, 'host', 'admin.example.com')?.scopeStatus, 'out-of-scope');
    assert.equal(
      findNode(worldModel, 'endpoint', '/admin/panel'),
      undefined,
      'active recon must skip out-of-scope endpoints entirely',
    );
    assert.ok(crossSourceCorrelatedNodes(worldModel).length >= 2);
    assert.equal(metrics.crossSourceCorrelatedAssetCount, 2);

    // HYPOTHESIZE
    assert.ok(checkpoint.hypotheses.length >= 6);
    const xssHypothesis = checkpoint.hypotheses.find((h) => h.vulnClass === 'xss');
    const authzHypothesis = checkpoint.hypotheses.find((h) => h.vulnClass === 'authz');
    assert.ok(xssHypothesis);
    assert.ok(authzHypothesis);

    // LEARN / UPDATE MODEL: the authz lead gets refuted and abandoned
    const finalAuthz = checkpoint.hypotheses.find((h) => h.id === authzHypothesis?.id);
    assert.equal(finalAuthz?.status, 'contradicted');

    // VALIDATE -> EVIDENCE -> DEDUPLICATE -> REPORT DRAFT
    assert.ok(finding);
    assert.equal(finding?.vulnClass, 'xss');
    assert.equal(finding?.status, 'reported');
    assert.ok(finding && finding.evidenceIds.length >= 2);
    assert.ok(reportDraftPath);

    if (reportDraftPath) {
      const draft = await readFile(reportDraftPath, 'utf8');
      assert.match(draft, /DRAFT — NOT SUBMITTED/);
      assert.match(draft, /`candidate` at/);
      assert.match(
        draft,
        /`report_ready` at/,
        'the draft is written one step before the final "reported" transition, so its own history stops at report_ready',
      );
    }

    assert.equal(metrics.validatedFindingRate, 1);
    assert.equal(metrics.evidenceCompletenessRate, 1);

    // The log should read as a legible trace of the whole pipeline.
    const joined = log.join('\n');
    assert.match(joined, /scope: /);
    assert.match(joined, /discover \(passive\)/);
    assert.match(joined, /enumerate \(active/);
    assert.match(joined, /understand \(js-intelligence\)/);
    assert.match(joined, /observe \(behavioral\)/);
    assert.match(joined, /hypothesize:/);
    assert.match(joined, /next-best-action/);
    assert.match(joined, /validate:/);
    assert.match(joined, /evidence:/);
    assert.match(joined, /deduplicate:/);
    assert.match(joined, /report-draft:/);
    assert.doesNotMatch(
      joined,
      /https?:\/\/(?!app\.example\.com|api\.example\.com|staging\.example\.com|admin\.example\.com|partner-api\.example\.com)/,
      'log must never reference a real external host',
    );
  });
});

test('resuming a hunt reloads world model and hypotheses instead of re-running recon', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const firstInput = await buildBundledSimulationInput({ engagementId: 'sim-resume', workspaceDir, maxRounds: 1 });
    const first = await runAdaptiveHunt(firstInput);
    assert.equal(first.ok, true);
    if (!first.ok) return;
    assert.equal(first.value.checkpoint.round, 1);
    assert.equal(first.value.finding, undefined, 'one round is not enough to reach a validated finding');

    const secondInput = await buildBundledSimulationInput({ engagementId: 'sim-resume', workspaceDir, maxRounds: 10 });
    const second = await runAdaptiveHunt(secondInput);
    assert.equal(second.ok, true);
    if (!second.ok) return;

    assert.match(second.value.log.join('\n'), /resuming hunt/);
    assert.equal(
      second.value.log.some((line) => line.includes('discover (passive)')),
      false,
      'recon bootstrap must not re-run on resume',
    );
    assert.ok(second.value.checkpoint.round > first.value.checkpoint.round);
    assert.equal(second.value.finding?.vulnClass, 'xss');
    assert.equal(second.value.finding?.status, 'reported');
  });
});

test('Shannon is skipped, not executed, when no local repository is available for a black-box target', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-blackbox', workspaceDir, maxRounds: 6 });
    const result = await runAdaptiveHunt({ ...input, repoPath: undefined });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const shannonAction = result.value.checkpoint.actions.find((a) => a.kind === 'shannon');
    assert.ok(shannonAction);
    assert.equal(shannonAction?.status, 'skipped');
    assert.match(shannonAction?.resultSummary ?? '', /black-box/);
    // Without Shannon's verified observation, nothing can be reproduced.
    assert.equal(result.value.finding, undefined);
  });
});

test('scope validation rejects a target that is not in scope before any recon runs', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-oos', workspaceDir, maxRounds: 6 });
    const result = await runAdaptiveHunt({ ...input, url: 'https://not-in-scope.other.org' });
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.error, /scope validation failed/);
  });
});

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

test('live Shannon execution only runs when explicitly confirmed, and its (mocked) captured output reaches the finding', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const reportDir = join(workspaceDir, 'shannon-run', '.shannon', 'deliverables');
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      join(reportDir, 'report.json'),
      JSON.stringify({
        report_meta: {
          target: 'https://app.example.com/search',
          assessment_date: '2026-01-01',
          scope: 'https://app.example.com/search',
          executive_summary: 'Live-executed DOM XSS confirmed.',
          exploit: true,
        },
        findings: [
          {
            finding_id: 'XSS-01',
            title: 'Live-executed DOM XSS',
            category: 'XSS',
            owasp_category: 'A05:2025 — Injection',
            severity: 'medium',
            vulnerable_location: '/search',
            http_location: { method: 'GET', url: 'https://app.example.com/search', parameter: 'q' },
            overview: 'Confirmed live by a (mocked) Shannon process.',
            impact: 'Arbitrary script execution.',
            remediation: 'Encode output.',
            status: 'exploited',
          },
        ],
      }),
      'utf8',
    );

    const input = await buildBundledSimulationInput({ engagementId: 'sim-live-shannon', workspaceDir, maxRounds: 6 });
    let spawnedCommand: string | undefined;
    let spawnedArgs: readonly string[] | undefined;
    const spawnImpl: SpawnFn = (command, args) => {
      spawnedCommand = command;
      spawnedArgs = args;
      return mockChildProcess(0);
    };

    const result = await runAdaptiveHunt({ ...input, liveShannon: { confirmed: true, spawnImpl } });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const shannonAction = result.value.checkpoint.actions.find((a) => a.kind === 'shannon');
    assert.match(shannonAction?.resultSummary ?? '', /executed live/);
    assert.equal(spawnedCommand, 'npx');
    assert.ok(spawnedArgs?.includes('start'));
    assert.equal(result.value.finding?.vulnClass, 'xss');
    assert.equal(result.value.finding?.status, 'reported');
  });
});

class HallucinatingReasoningProvider implements ReasoningProvider {
  readonly source = 'claude' as const;
  selectNextBestAction(): Promise<ActionProposal | undefined> {
    return Promise.resolve({
      kind: 'shannon',
      targetRef: 'https://not-a-real-target.example.com',
      hypothesisId: 'not-a-real-hypothesis-id',
      whyThisAction: 'fabricated',
      hypothesisTested: 'fabricated',
      uncertaintyReduced: 'fabricated',
      confirmingObservation: 'fabricated',
      contradictingObservation: 'fabricated',
      nextStepIfConfirmed: 'fabricated',
      nextStepIfContradicted: 'fabricated',
    });
  }
  generateHypotheses(): Promise<readonly []> {
    return Promise.resolve([]);
  }
}

test('a hallucinated action proposal is rejected by the policy gate and the loop falls back to deterministic selection, still reaching the correct outcome', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-hallucination', workspaceDir, maxRounds: 6 });
    const router: ReasoningRouter = {
      primary: new HallucinatingReasoningProvider(),
      fallback: new HeuristicReasoningProvider(),
      configuredSource: 'claude',
    };
    const result = await runAdaptiveHunt({ ...input, reasoningRouter: router });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok(
      result.value.checkpoint.decisions.some((d) => !d.accepted && d.acceptanceReason.includes('hallucination guard')),
      'every proposal from the hallucinating provider must be rejected as not matching a real queued action',
    );
    assert.equal(result.value.finding?.vulnClass, 'xss');
    assert.equal(result.value.finding?.status, 'reported');
  });
});

test('the research track is genuinely wired into runAdaptiveHunt: it analyzes real bootstrap data and produces its own hypotheses', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-research', workspaceDir, maxRounds: 6 });
    const result = await runAdaptiveHunt(input);
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const { research } = result.value;
    assert.ok(research, 'AdaptiveHuntOutput must expose research-track output');
    assert.ok(
      research.hypotheses.length > 0,
      'client-side feature-flag/auth-logic provenance in the bundled JS should produce at least one research hypothesis',
    );
    assert.ok(research.provenanceEdges.length > 0, 'JS intelligence provenance edges must reach the research track');
    // The research track never touches the primary loop's own winner selection.
    assert.equal(result.value.finding?.vulnClass, 'xss');
    assert.equal(result.value.finding?.status, 'reported');
    // Real experiment execution is opt-in — without researchTrack.live, no research finding is fabricated.
    assert.equal(research.findings.length, 0);
  });
});

test('a Shannon-kind research experiment executes live through runAdaptiveHunt, via the exact same confirmed spawn seam as the primary loop', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const reportDir = join(workspaceDir, 'shannon-research-run', '.shannon', 'deliverables');
    await mkdir(reportDir, { recursive: true });
    await writeFile(
      join(reportDir, 'report.json'),
      JSON.stringify({
        report_meta: {
          target: 'https://app.example.com/search',
          assessment_date: '2026-01-01',
          scope: 'https://app.example.com/search',
          executive_summary: 'Research-track-driven Shannon run confirmed a DOM XSS.',
          exploit: true,
        },
        findings: [
          {
            finding_id: 'XSS-RESEARCH-01',
            title: 'DOM XSS confirmed via the research track',
            category: 'XSS',
            owasp_category: 'A05:2025 — Injection',
            severity: 'medium',
            vulnerable_location: '/search',
            http_location: { method: 'GET', url: 'https://app.example.com/search', parameter: 'q' },
            overview: 'Confirmed by a (mocked) Shannon process invoked by the research track.',
            impact: 'Arbitrary script execution.',
            remediation: 'Encode output.',
            status: 'exploited',
          },
        ],
      }),
      'utf8',
    );

    const input = await buildBundledSimulationInput({
      engagementId: 'sim-research-shannon',
      workspaceDir,
      maxRounds: 6,
    });
    let spawnCalls = 0;
    const spawnImpl: SpawnFn = (command, args) => {
      spawnCalls += 1;
      const child = new EventEmitter() as unknown as ChildProcess & { stdout: EventEmitter; stderr: EventEmitter };
      (child as unknown as { stdout: EventEmitter }).stdout = new EventEmitter();
      (child as unknown as { stderr: EventEmitter }).stderr = new EventEmitter();
      (child as unknown as { kill: () => void }).kill = () => child.emit('close', 143);
      assert.equal(command, 'npx');
      assert.ok(args.includes('start'));
      setTimeout(() => child.emit('close', 0), 0);
      return child;
    };

    const result = await runAdaptiveHunt({
      ...input,
      // The primary loop's own liveShannon is deliberately left unset —
      // this proves the research track's Shannon confirmation is genuinely
      // separate, not inherited.
      researchTrack: { live: { registry: buildDefaultToolRegistry(), shannon: { confirmed: true, spawnImpl } } },
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(spawnCalls, 1, 'Shannon must be invoked exactly once, through the shared adapter');
    // The primary loop's own finding is completely unaffected by the research track's Shannon run.
    assert.equal(result.value.finding?.vulnClass, 'xss');
    assert.equal(result.value.finding?.status, 'reported');
    assert.ok(result.value.research.log.some((line) => line.includes('Shannon executed live')));
    assert.equal(result.value.research.findings.length, 1);
    assert.equal(result.value.research.findings[0]?.status, 'reproduced');
  });
});

test('hunt memory from a prior engagement genuinely biases hypothesis prioritization in a later hunt, through the real runAdaptiveHunt entry point', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const baselineInput = await buildBundledSimulationInput({
      engagementId: 'sim-memory-baseline',
      workspaceDir,
      maxRounds: 1,
    });
    const baseline = await runAdaptiveHunt(baselineInput);
    assert.equal(baseline.ok, true);
    if (!baseline.ok) return;
    const baselineAuthz = baseline.value.checkpoint.hypotheses.find((h) => h.vulnClass === 'authz');
    assert.ok(baselineAuthz, 'the bundled simulation must produce an authz hypothesis to compare against');

    // hunt-memory.jsonl is workspace-level, not engagement-level — seeding
    // it here affects every subsequent engagement in this same workspace.
    await appendMemory(
      workspaceDir,
      recordMemory({
        kind: 'false-positive-pattern',
        description: 'authz leads on this program have repeatedly been false positives',
        outcome: 'negative',
        confidence: 0.6,
        source: 'test',
        vulnClass: 'authz',
      }),
    );
    await appendMemory(
      workspaceDir,
      recordMemory({
        kind: 'false-positive-pattern',
        description: 'authz leads on this program have repeatedly been false positives',
        outcome: 'negative',
        confidence: 0.6,
        source: 'test',
        vulnClass: 'authz',
      }),
    );

    const biasedInput = await buildBundledSimulationInput({
      engagementId: 'sim-memory-biased',
      workspaceDir,
      maxRounds: 1,
    });
    const biased = await runAdaptiveHunt(biasedInput);
    assert.equal(biased.ok, true);
    if (!biased.ok) return;
    const biasedAuthz = biased.value.checkpoint.hypotheses.find((h) => h.vulnClass === 'authz');
    assert.ok(biasedAuthz);

    assert.ok(
      biasedAuthz.priorityScore < baselineAuthz.priorityScore,
      "a program-wide history of authz false positives must lower this run's own authz priority score",
    );
    // Memory must never fabricate or suppress confidence — only reprioritize.
    assert.equal(biasedAuthz.confidence, baselineAuthz.confidence);
    assert.ok(biased.value.log.some((line) => line.includes('memory: loaded 2 prior experience')));
  });
});

test('the hunt stops once the action budget is exhausted, even with rounds remaining', async () => {
  await withTempWorkspace(async (workspaceDir) => {
    const input = await buildBundledSimulationInput({ engagementId: 'sim-budget', workspaceDir, maxRounds: 6 });
    const result = await runAdaptiveHunt({ ...input, budget: { maxActions: 1 } });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.checkpoint.actions.length, 1);
    assert.equal(result.value.checkpoint.status, 'completed');
  });
});
