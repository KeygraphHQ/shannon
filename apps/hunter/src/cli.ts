#!/usr/bin/env node

/**
 * hunter CLI — thin command surface over the pipeline modules, for use by
 * the /hunt slash command or direct invocation. Every command is local and
 * offline except where explicitly noted; there is no command in this MVP
 * that contacts a target or submits anything to HackerOne. There is
 * deliberately no `--live` flag: live Shannon execution
 * (`pipeline/adaptive-loop.ts`'s `liveShannon` option) is reachable only by
 * calling `runAdaptiveHunt()` programmatically, which forces a deliberate
 * integration decision rather than a casual command-line flag.
 *
 * `discover`/`rank`/`lifecycle` are the exception to "offline except where
 * explicitly noted": they drive `orchestration/lifecycle.ts`'s
 * discover -> rank -> select -> authorize -> hunt flow. `discover`/`rank`
 * are always read-only/offline (a `ProgramDiscoveryProvider` never touches
 * the network from inside this package — see `discovery/h1-brain-provider.ts`'s
 * docstring). `lifecycle` stays offline/simulate-only until the operator
 * supplies `--authorize <file>` — a real, human-authored `AuthorizationRecord`
 * — at which point it can drive a genuinely live engagement if `--live-recon`/
 * `--live-shannon` are also given, exactly as deliberate and explicit as
 * `hunt`'s own `liveRecon`/`liveShannon` options, just reachable from the
 * command line instead of requiring a hand-written script.
 */

import { readFile } from 'node:fs/promises';
import { FixtureDiscoveryProvider } from './discovery/fixture-provider.js';
import { H1BrainSnapshotProvider } from './discovery/h1-brain-provider.js';
import { explainSelection, rankPrograms, selectBestProgram } from './discovery/scoring.js';
import type { ProgramDiscoveryProvider } from './discovery/types.js';
import { ingestShannonOutput, parseShannonReport } from './ingestion/shannon-output.js';
import { LocalFileIntake } from './intake/hackerone.js';
import type { AuthorizationRecord } from './orchestration/lifecycle.js';
import { runHuntLifecycle } from './orchestration/lifecycle.js';
import { runAdaptiveHunt } from './pipeline/adaptive-loop.js';
import { buildBundledSimulationInput } from './pipeline/simulation-loader.js';
import { buildLiveBootstrapSources } from './recon/live-bootstrap-sources.js';
import { validateTarget } from './scope/validator.js';
import { buildShannonInvocation } from './shannon/config.js';
import { planInvocation } from './shannon/invoke.js';
import { loadCheckpoint } from './state/checkpoint.js';
import { buildDefaultToolRegistry } from './tools/default-registry.js';
import { loadWorldModel } from './worldmodel/graph.js';

function parseFlags(argv: readonly string[]): Map<string, string> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token?.startsWith('--')) {
      const name = token.slice(2);
      const value = argv[i + 1];
      if (value !== undefined && !value.startsWith('--')) {
        flags.set(name, value);
        i += 1;
      } else {
        flags.set(name, 'true');
      }
    }
  }
  return flags;
}

function requireFlag(flags: Map<string, string>, name: string): string {
  const value = flags.get(name);
  if (value === undefined) {
    throw new Error(`missing required --${name}`);
  }
  return value;
}

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function runScopeValidate(flags: Map<string, string>): Promise<number> {
  const programPath = requireFlag(flags, 'program');
  const url = requireFlag(flags, 'url');
  const repo = requireFlag(flags, 'repo');

  const intake = new LocalFileIntake();
  const program = await intake.loadProgram(programPath);
  if (!program.ok) {
    printJson({ ok: false, error: program.error });
    return 1;
  }

  const result = validateTarget({ program: program.value, url, repoPath: repo });
  printJson(result.ok ? { ok: true, target: result.value } : { ok: false, error: result.error });
  return result.ok ? 0 : 1;
}

async function runShannonPlan(flags: Map<string, string>): Promise<number> {
  const url = requireFlag(flags, 'url');
  const repo = requireFlag(flags, 'repo');
  const workspace = flags.get('workspace');

  const built = buildShannonInvocation({ url, repo, ...(workspace !== undefined ? { workspace } : {}) });
  if (!built.ok) {
    printJson({ ok: false, error: built.error });
    return 1;
  }
  const plan = planInvocation(built.value);
  printJson({ ok: true, commandLine: plan.commandLine, note: 'dry-run only — Shannon was not invoked' });
  return 0;
}

async function runIngest(flags: Map<string, string>): Promise<number> {
  const inputPath = requireFlag(flags, 'input');
  const engagementId = flags.get('engagement-id') ?? 'cli-ingest';

  const raw = JSON.parse(await readFile(inputPath, 'utf8'));
  const parsed = parseShannonReport(raw);
  if (!parsed.ok) {
    printJson({ ok: false, error: parsed.error });
    return 1;
  }
  const observations = ingestShannonOutput(parsed.value, engagementId);
  printJson({ ok: true, observations });
  return 0;
}

function buildDiscoveryProvider(flags: Map<string, string>): ProgramDiscoveryProvider {
  const programsPath = requireFlag(flags, 'programs');
  const kind = flags.get('provider') ?? 'fixture';
  if (kind === 'h1-brain') {
    return new H1BrainSnapshotProvider(programsPath);
  }
  if (kind !== 'fixture') {
    throw new Error(`unknown --provider "${kind}" (expected "fixture" or "h1-brain")`);
  }
  return new FixtureDiscoveryProvider(programsPath);
}

async function runDiscover(flags: Map<string, string>): Promise<number> {
  const provider = buildDiscoveryProvider(flags);
  const result = await provider.discoverPrograms();
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  printJson({ ok: true, provider: provider.name, programCount: result.value.length, programs: result.value });
  return 0;
}

async function runRank(flags: Map<string, string>): Promise<number> {
  const provider = buildDiscoveryProvider(flags);
  const result = await provider.discoverPrograms();
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  const ranked = rankPrograms(result.value);
  const winner = selectBestProgram(ranked);
  printJson({
    ok: true,
    ranked: ranked.map((r) => ({
      rank: r.rank,
      programId: r.program.programId,
      programName: r.program.programName,
      totalScore: r.score.totalScore,
      evidenceWeight: r.score.evidenceWeight,
      missingSignals: r.score.missingSignals,
      components: r.score.components,
    })),
    selected: winner?.program.programId,
    rationale: explainSelection(ranked),
  });
  return 0;
}

/**
 * Runs `orchestration/lifecycle.ts:runHuntLifecycle` end to end: discover ->
 * rank -> select -> (stop at AWAITING_AUTHORIZATION unless `--authorize` is
 * given) -> normalize/write scope -> run the real adaptive loop. This is
 * the CLI's answer to "the user should not need to hand-write TypeScript"
 * for a live engagement — see this file's module docstring.
 *
 * `--authorize <file>` must point at a JSON file shaped like
 * `AuthorizationRecord` (`{ confirmed: true, confirmedBy, confirmedAt,
 * scopeReviewed: true }`) that the operator writes by hand after reviewing
 * the scope/ROE/rationale a prior `--provider`/`--programs`-only run (or
 * this same run without `--authorize`) printed. This is deliberately not a
 * boolean flag: an operator cannot "just pass true" without having actually
 * produced the file.
 */
async function runLifecycle(flags: Map<string, string>): Promise<number> {
  const provider = buildDiscoveryProvider(flags);
  const workspaceDir = requireFlag(flags, 'workspace-dir');
  const engagementId = flags.get('engagement-id') ?? `lifecycle-${Date.now()}`;
  const maxRounds = Number(flags.get('max-rounds') ?? '6');
  const repo = flags.get('repo');

  let authorization: AuthorizationRecord | undefined;
  const authorizePath = flags.get('authorize');
  if (authorizePath) {
    const raw = JSON.parse(await readFile(authorizePath, 'utf8')) as AuthorizationRecord;
    authorization = raw;
  }

  const wordlistPath = flags.get('wordlist');
  const nucleiSeverity = flags.get('nuclei-severity');
  const amassOutputDir = flags.get('amass-output-dir');
  const liveRecon = flags.has('live-recon');
  const liveShannon = flags.has('live-shannon');

  const result = await runHuntLifecycle({
    providers: [provider],
    workspaceDir,
    engagementId,
    maxRounds,
    ...(authorization !== undefined ? { authorization } : {}),
    ...(repo !== undefined ? { repoPath: repo } : {}),
    ...(liveShannon ? { liveShannon: { confirmed: true } } : {}),
    ...(liveRecon
      ? {
          bootstrapSourcesFromTarget: (target: { domain: string; url: string }) =>
            buildLiveBootstrapSources(buildDefaultToolRegistry(), target.domain, target.url, {
              ...(amassOutputDir !== undefined ? { amassOutputDir } : {}),
            }),
          liveReconFromTarget: () => ({
            registry: buildDefaultToolRegistry(),
            ...(wordlistPath !== undefined ? { wordlistPath } : {}),
            ...(nucleiSeverity !== undefined ? { nucleiSeverity } : {}),
            ...(amassOutputDir !== undefined ? { amassOutputDir } : {}),
          }),
        }
      : {}),
  });

  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  const output = result.value;
  printJson({
    ok: true,
    finalState: output.finalState,
    transitions: output.transitions,
    selected: output.selected
      ? {
          programId: output.selected.program.programId,
          programName: output.selected.program.programName,
          rank: output.selected.rank,
          totalScore: output.selected.score.totalScore,
        }
      : undefined,
    selectionRationale: output.selectionRationale,
    droppedAssets: output.droppedAssets,
    normalizedScopePath: output.normalizedScopePath,
    targetUrl: output.targetUrl,
    hunt: output.huntResult
      ? {
          rounds: output.huntResult.checkpoint.round,
          checkpointStatus: output.huntResult.checkpoint.status,
          hypothesisCount: output.huntResult.checkpoint.hypotheses.length,
          finding: output.huntResult.finding,
          reportDraftPath: output.huntResult.reportDraftPath,
          metrics: output.huntResult.metrics,
          log: output.huntResult.log,
        }
      : undefined,
  });
  if (output.finalState === 'AWAITING_AUTHORIZATION') {
    process.stderr.write(
      'AWAITING_AUTHORIZATION: review the printed scope/ROE/rationale, then write an AuthorizationRecord JSON file and re-run with --authorize <file> to proceed.\n',
    );
  }
  return output.finalState === 'BLOCKED' || output.finalState === 'FAILED' ? 1 : 0;
}

/**
 * Runs the adaptive recon + reasoning loop. The MVP only wires up the
 * bundled offline simulation (`--simulate`) — every discovery, JS bundle,
 * behavioral fixture, and Shannon output is a local file under
 * fixtures/simulation/, and Shannon is only ever planned, never executed.
 * A real engagement plugs real recon-source adapters and a real captured
 * Shannon output into `runAdaptiveHunt()` directly (see
 * apps/hunter/README.md).
 *
 * Re-running with the same `--workspace-dir` and `--engagement-id` resumes
 * automatically (the adaptive loop reloads its checkpoint); `--resume`
 * only asserts that an existing engagement is expected, failing loudly if
 * one is not found, so a typo in `--engagement-id` cannot silently start a
 * fresh hunt.
 */
async function runHunt(flags: Map<string, string>): Promise<number> {
  if (!flags.has('simulate')) {
    throw new Error(
      'only --simulate is implemented in this MVP; a real engagement wires runAdaptiveHunt() up with real recon sources and a captured Shannon output directly (see apps/hunter/README.md)',
    );
  }

  const workspaceDir = requireFlag(flags, 'workspace-dir');
  const engagementId = flags.get('engagement-id') ?? `hunt-${Date.now()}`;
  const maxRounds = Number(flags.get('max-rounds') ?? '6');
  const maxActions = flags.get('max-actions');

  if (flags.has('resume')) {
    const checkpoint = await loadCheckpoint(workspaceDir, engagementId);
    if (!checkpoint.ok || checkpoint.value.round === 0) {
      printJson({
        ok: false,
        error: `no existing engagement "${engagementId}" found under "${workspaceDir}" to resume`,
      });
      return 1;
    }
  }

  const input = await buildBundledSimulationInput({ engagementId, workspaceDir, maxRounds });
  const result = await runAdaptiveHunt({
    ...input,
    ...(maxActions !== undefined ? { budget: { maxActions: Number(maxActions) } } : {}),
  });

  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  printJson({
    ok: true,
    engagementId: result.value.engagement.id,
    rounds: result.value.checkpoint.round,
    checkpointStatus: result.value.checkpoint.status,
    hypothesisCount: result.value.checkpoint.hypotheses.length,
    hypotheses: result.value.checkpoint.hypotheses.map((h) => ({
      vulnClass: h.vulnClass,
      assetRef: h.assetRef,
      status: h.status,
      confidence: h.confidence,
    })),
    actions: result.value.checkpoint.actions.map((a) => ({
      kind: a.kind,
      targetRef: a.targetRef,
      status: a.status,
      resultSummary: a.resultSummary,
    })),
    decisions: result.value.checkpoint.decisions,
    finding: result.value.finding,
    reportDraftPath: result.value.reportDraftPath,
    metrics: result.value.metrics,
    log: result.value.log,
    research: {
      hypothesisCount: result.value.research.hypotheses.length,
      hypotheses: result.value.research.hypotheses.map((h) => ({
        vulnClass: h.vulnClass,
        assetRef: h.assetRef,
        status: h.status,
        confidence: h.confidence,
        assumptions: h.assumptions,
        competingHypothesisIds: h.competingHypothesisIds,
      })),
      anomalyCount: result.value.research.anomalies.length,
      attackChainCount: result.value.research.attackChains.length,
      findings: result.value.research.findings,
    },
  });
  return 0;
}

async function runWorldModel(flags: Map<string, string>): Promise<number> {
  const workspaceDir = requireFlag(flags, 'workspace-dir');
  const engagementId = requireFlag(flags, 'engagement-id');
  const result = await loadWorldModel(workspaceDir, engagementId);
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  printJson({ ok: true, worldModel: result.value });
  return 0;
}

async function runHypotheses(flags: Map<string, string>): Promise<number> {
  const workspaceDir = requireFlag(flags, 'workspace-dir');
  const engagementId = requireFlag(flags, 'engagement-id');
  const result = await loadCheckpoint(workspaceDir, engagementId);
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  printJson({ ok: true, hypotheses: result.value.hypotheses });
  return 0;
}

async function runCheckpoint(flags: Map<string, string>): Promise<number> {
  const workspaceDir = requireFlag(flags, 'workspace-dir');
  const engagementId = requireFlag(flags, 'engagement-id');
  const result = await loadCheckpoint(workspaceDir, engagementId);
  if (!result.ok) {
    printJson({ ok: false, error: result.error });
    return 1;
  }
  printJson({ ok: true, checkpoint: result.value });
  return 0;
}

const COMMANDS: Readonly<Record<string, (flags: Map<string, string>) => Promise<number>>> = {
  'scope-validate': runScopeValidate,
  'shannon-plan': runShannonPlan,
  ingest: runIngest,
  hunt: runHunt,
  discover: runDiscover,
  rank: runRank,
  lifecycle: runLifecycle,
  'world-model': runWorldModel,
  hypotheses: runHypotheses,
  checkpoint: runCheckpoint,
};

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);
  if (command === undefined || !(command in COMMANDS)) {
    process.stderr.write(`usage: hunter <${Object.keys(COMMANDS).join('|')}> [--flag value ...]\n`);
    return 1;
  }
  try {
    return (await COMMANDS[command]?.(parseFlags(rest))) ?? 1;
  } catch (error) {
    process.stderr.write(`error: ${(error as Error).message}\n`);
    return 1;
  }
}

main().then((code) => {
  process.exitCode = code;
});
