/**
 * Adaptive recon + reasoning loop.
 *
 * This is the controller: SCOPE -> DISCOVER -> ENUMERATE -> CORRELATE ->
 * UNDERSTAND -> OBSERVE -> HYPOTHESIZE -> PRIORITIZE -> SELECT NEXT-BEST
 * ACTION -> INVESTIGATE -> LEARN -> UPDATE MODEL -> REPEAT -> VALIDATE ->
 * EVIDENCE -> DEDUPLICATE -> REPORT DRAFT.
 *
 * Everything before the round loop (recon bootstrap: passive/active
 * sources, JS intelligence, behavioral diffs) runs once, only on a fresh
 * hunt — a resumed hunt reloads the world model and hypotheses from disk
 * instead of re-discovering them.
 *
 * Each round, a `ReasoningProvider` (Claude-backed when `ANTHROPIC_API_KEY`
 * is configured, the deterministic heuristic provider otherwise — see
 * `reasoning/router.ts`) *proposes* the next-best action; the proposal is
 * never trusted directly. `reasoning/policy.ts:evaluateProposal` is the
 * deterministic gate: a proposal is only accepted if it matches, field for
 * field, a real entry already in this round's action queue (built straight
 * from the real world model) and fits the configured budget. A rejected
 * proposal (a hallucinated target, or none at all) falls back to the plain
 * deterministic selection over the same real queue — the hunt never stalls
 * because reasoning failed. Every round's decision, accepted or not, is
 * recorded in `checkpoint.decisions`.
 *
 * "Executing" an action means reading a caller-supplied investigation
 * fixture by default — including, for a `shannon` action, a captured
 * Shannon output file. A `shannon` action can instead run Shannon for
 * real, but only when the caller passes `liveShannon: { confirmed: true }`
 * explicitly; nothing in this loop ever sets that on its own, regardless
 * of which reasoning provider selected the action.
 *
 * No action ever runs against an asset that is not in scope: every
 * observation is passed through `recon/scope-tagging.ts:filterInScopeObservations`
 * before it can influence a hypothesis.
 */

import { readFile } from 'node:fs/promises';
import { LocalSignatureDeduplicator } from '../dedup/local-dedup.js';
import { appendEvidence, createEvidenceEntry } from '../evidence/store.js';
import { createFinding, listFindings, saveFinding, transitionFinding, withEvidence } from '../findings/lifecycle.js';
import { ingestShannonOutput, parseShannonReport } from '../ingestion/shannon-output.js';
import { LocalFileIntake } from '../intake/hackerone.js';
import { computeReconMetrics } from '../metrics/recon-quality.js';
import {
  actionKey,
  buildActionQueue,
  markActionDone,
  markActionFailed,
  markActionSkipped,
  selectNextBestAction,
} from '../reasoning/actions.js';
import { hypothesesFromObservations, updateHypothesisWithObservation } from '../reasoning/hypothesis.js';
import { DEFAULT_BUDGET, evaluateProposal, type PolicyContext, type ToolRateLimiter } from '../reasoning/policy.js';
import {
  createReasoningProvider,
  type ReasoningRouter,
  selectNextBestActionWithFallback,
} from '../reasoning/router.js';
import { compareAuthStates, type StateResponseMap } from '../recon/behavioral.js';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import { correlateDiscoveries, crossSourceCorrelated } from '../recon/correlate.js';
import { analyzeJavaScript } from '../recon/js-intel.js';
import {
  classifyDiscoveryScope,
  classifyRawDiscoveryScope,
  filterInScopeObservations,
} from '../recon/scope-tagging.js';
import { type ReconSource, runReconSources } from '../recon/sources.js';
import { writeDraft } from '../report/draft.js';
import { validateTarget } from '../scope/validator.js';
import { buildShannonInvocation } from '../shannon/config.js';
import { checkShannonEligibility } from '../shannon/eligibility.js';
import { executeShannonAction, type SpawnFn } from '../shannon/execution-adapter.js';
import { planInvocation } from '../shannon/invoke.js';
import { type HuntCheckpoint, loadCheckpoint, saveCheckpoint } from '../state/checkpoint.js';
import { loadEngagement, newEngagement, saveEngagement } from '../state/engagement-store.js';
import { appendObservations, listObservations } from '../state/observation-log.js';
import type { ToolRegistry } from '../tools/registry.js';
import {
  type Engagement,
  type ExecutionStatus,
  err,
  type Finding,
  type HuntAction,
  type HuntBudget,
  type HuntEvent,
  type Hypothesis,
  type Observation,
  ok,
  type ProgramScope,
  type RawDiscovery,
  type ReasoningDecision,
  type ReconMetrics,
  type Result,
  type WorldModel,
  type WorldModelSnapshot,
} from '../types.js';
import { addEdge, loadWorldModel, saveWorldModel, upsertNode } from '../worldmodel/graph.js';
import { executeActionViaRegistry } from './tool-bridge.js';

export interface JsArtifactInput {
  readonly sourceRef: string;
  readonly assetRef: string;
  readonly content: string;
}

export interface BehavioralFixtureInput {
  readonly assetRef: string;
  readonly endpoint: string;
  readonly responses: StateResponseMap;
}

export interface InvestigationFixture {
  readonly discoveries: readonly RawDiscovery[];
  readonly observations: readonly Observation[];
}

export interface LiveShannonOptions {
  readonly confirmed: boolean;
  readonly spawnImpl?: SpawnFn;
  readonly timeoutMs?: number;
}

/**
 * Opt-in real recon execution for every non-`shannon` action kind, via
 * `pipeline/tool-bridge.ts:executeActionViaRegistry`. Omitted entirely (the
 * default), the loop behaves exactly as before this option existed —
 * consulting only `investigationFixtures` — so no existing caller or test
 * changes behavior by upgrading. Supplied, a real adapter is tried first
 * each round; only when the bridge itself reports `UNAVAILABLE` (no
 * capable adapter, or missing per-tool config such as a wordlist) does the
 * loop fall back to `investigationFixtures`, if one is present for that
 * (kind, target).
 */
export interface LiveReconOptions {
  readonly registry: ToolRegistry;
  readonly rateLimiter?: ToolRateLimiter;
  readonly preferredToolNames?: Readonly<Record<string, readonly string[]>>;
  readonly wordlistPath?: string;
  readonly nucleiSeverity?: string;
  readonly amassOutputDir?: string;
  readonly behavioralAuthStatesByAsset?: ReadonlyMap<string, AuthStateHeaders>;
  readonly allowHighRisk?: boolean;
}

export interface AdaptiveHuntInput {
  readonly engagementId: string;
  readonly programScopePath: string;
  readonly url: string;
  readonly repoPath: string | undefined;
  readonly workspaceDir: string;
  readonly maxRounds: number;
  readonly passiveSources: readonly ReconSource[];
  readonly activeSources: readonly ReconSource[];
  readonly jsArtifacts: readonly JsArtifactInput[];
  readonly behavioralFixtures: readonly BehavioralFixtureInput[];
  /** action-kind::target -> fixture, consulted for every action kind except "shannon" (see shannonOutputsByAsset). */
  readonly investigationFixtures: ReadonlyMap<string, InvestigationFixture>;
  /** assetRef -> path to a captured Shannon report.json-shaped file, ingested only when a "shannon" action targets that asset and liveShannon is not confirmed. */
  readonly shannonOutputsByAsset: ReadonlyMap<string, string>;
  /** Additional deterministic safety limits beyond maxRounds; merged over DEFAULT_BUDGET. */
  readonly budget?: Partial<HuntBudget>;
  /** Overrides the default reasoning provider selection (Claude if ANTHROPIC_API_KEY is set, else heuristic). Mainly for tests. */
  readonly reasoningRouter?: ReasoningRouter;
  /** Explicit, separate confirmation required before any "shannon" action executes Shannon for real instead of reading shannonOutputsByAsset. */
  readonly liveShannon?: LiveShannonOptions;
  /** Opt-in real tool execution for non-"shannon" actions — see LiveReconOptions. Omitted by default. */
  readonly liveRecon?: LiveReconOptions;
}

export interface AdaptiveHuntOutput {
  readonly engagement: Engagement;
  readonly worldModel: WorldModel;
  readonly checkpoint: HuntCheckpoint;
  readonly finding: Finding | undefined;
  readonly reportDraftPath: string | undefined;
  readonly metrics: ReconMetrics;
  readonly log: readonly string[];
}

interface ActionExecutionResult {
  readonly discoveries: readonly RawDiscovery[];
  readonly observations: readonly Observation[];
  readonly resultSummary: string;
  readonly skipped: boolean;
  readonly failed: boolean;
  readonly executionStatus: ExecutionStatus;
  readonly toolName: string | undefined;
}

async function executeAction(
  action: HuntAction,
  ctx: {
    readonly program: ProgramScope;
    readonly repoPath: string | undefined;
    readonly engagementId: string;
    readonly workspaceDir: string;
    readonly investigationFixtures: ReadonlyMap<string, InvestigationFixture>;
    readonly shannonOutputsByAsset: ReadonlyMap<string, string>;
    readonly liveShannon: LiveShannonOptions | undefined;
    readonly liveRecon: LiveReconOptions | undefined;
    readonly budget: HuntBudget;
  },
): Promise<ActionExecutionResult> {
  if (action.kind === 'shannon') {
    const eligibility = await checkShannonEligibility(ctx.repoPath);
    if (!eligibility.eligible) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `Shannon skipped: ${eligibility.reason}`,
        skipped: true,
        failed: false,
        executionStatus: 'UNAVAILABLE',
        toolName: 'shannon',
      };
    }
    const built = buildShannonInvocation({ url: action.targetRef, repo: ctx.repoPath as string });
    if (!built.ok) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `Shannon skipped: ${built.error}`,
        skipped: true,
        failed: false,
        executionStatus: 'UNAVAILABLE',
        toolName: 'shannon',
      };
    }
    const plan = planInvocation(built.value);

    if (ctx.liveShannon?.confirmed) {
      const execResult = await executeShannonAction(built.value, {
        confirmed: true,
        engagementId: ctx.engagementId,
        workspaceDir: ctx.workspaceDir,
        ...(ctx.liveShannon.spawnImpl !== undefined ? { spawnImpl: ctx.liveShannon.spawnImpl } : {}),
        ...(ctx.liveShannon.timeoutMs !== undefined ? { timeoutMs: ctx.liveShannon.timeoutMs } : {}),
      });
      if (!execResult.ok) {
        return {
          discoveries: [],
          observations: [],
          resultSummary: `Shannon live execution failed: ${execResult.error}`,
          skipped: false,
          failed: true,
          executionStatus: 'FAILED',
          toolName: 'shannon',
        };
      }
      const { exitCode, timedOut, observations } = execResult.value;
      const shannonExecutionStatus: ExecutionStatus =
        exitCode !== 0 ? 'FAILED' : observations.length > 0 ? 'EXECUTED_WITH_RESULTS' : 'EXECUTED_NO_RESULTS';
      return {
        discoveries: [],
        observations,
        resultSummary: `Shannon executed live (${plan.commandLine}); exit ${exitCode}${timedOut ? ' (timed out)' : ''}; ingested ${observations.length} observation(s)`,
        skipped: false,
        failed: exitCode !== 0,
        executionStatus: shannonExecutionStatus,
        toolName: 'shannon',
      };
    }

    const fixturePath = ctx.shannonOutputsByAsset.get(action.targetRef);
    if (!fixturePath) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `planned Shannon invocation (dry-run, never executed): ${plan.commandLine}; no captured output available yet for this asset`,
        skipped: false,
        failed: false,
        executionStatus: 'UNAVAILABLE',
        toolName: 'shannon',
      };
    }
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(fixturePath, 'utf8'));
    } catch (error) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `Shannon output ingestion failed: ${(error as Error).message}`,
        skipped: true,
        failed: false,
        executionStatus: 'FAILED',
        toolName: 'shannon',
      };
    }
    const parsed = parseShannonReport(raw);
    if (!parsed.ok) {
      return {
        discoveries: [],
        observations: [],
        resultSummary: `Shannon output ingestion failed: ${parsed.error}`,
        skipped: true,
        failed: false,
        executionStatus: 'FAILED',
        toolName: 'shannon',
      };
    }
    const observations = ingestShannonOutput(parsed.value, ctx.engagementId);
    return {
      discoveries: [],
      observations,
      resultSummary: `planned Shannon invocation (dry-run, never executed): ${plan.commandLine}; ingested ${observations.length} observation(s) from captured output`,
      skipped: false,
      failed: false,
      executionStatus: 'MOCKED',
      toolName: 'shannon',
    };
  }

  // Real recon execution (opt-in): try the tool-bridge gate chain first. It
  // reports UNAVAILABLE for anything short of a real run (out of scope,
  // policy-blocked, no capable adapter, missing per-tool config) — only
  // then does the loop fall back to a caller-supplied fixture, exactly as
  // it always has when liveRecon is not configured at all.
  let liveUnavailableReason: string | undefined;
  if (ctx.liveRecon) {
    const live = await executeActionViaRegistry(action, ctx.program, ctx.budget, {
      ...ctx.liveRecon,
      engagementId: ctx.engagementId,
    });
    if (live.status !== 'UNAVAILABLE') {
      // BLOCKED_BY_SCOPE/BLOCKED_BY_POLICY are deliberate refusals (skipped), not a genuine tool failure — see markActionFailed's docstring.
      const isDeliberateRefusal = live.status === 'BLOCKED_BY_SCOPE' || live.status === 'BLOCKED_BY_POLICY';
      return {
        discoveries: live.discoveries,
        observations: live.observations,
        resultSummary: `[${live.status}${live.toolName ? `:${live.toolName}` : ''}] ${live.summary}`,
        skipped: isDeliberateRefusal,
        failed: live.status === 'FAILED',
        executionStatus: live.status,
        toolName: live.toolName,
      };
    }
    // Live recon was tried and genuinely reported UNAVAILABLE — keep its reason so a fixture-less
    // action's summary explains *why*, instead of only ever saying "no fixture available" as if
    // liveRecon were never consulted at all.
    liveUnavailableReason = live.summary;
  }

  const key = actionKey(action.kind, action.targetRef);
  const fixture = ctx.investigationFixtures.get(key);
  if (!fixture) {
    return {
      discoveries: [],
      observations: [],
      resultSummary: liveUnavailableReason
        ? `live recon unavailable (${liveUnavailableReason}); no investigation fixture available for "${key}" either (nothing to learn this round)`
        : `no investigation fixture available for "${key}" yet (nothing to learn this round)`,
      skipped: true,
      failed: false,
      executionStatus: 'UNAVAILABLE',
      toolName: undefined,
    };
  }
  return {
    discoveries: fixture.discoveries,
    observations: fixture.observations,
    resultSummary: `${action.kind} on "${action.targetRef}" produced ${fixture.observations.length} observation(s) and ${fixture.discoveries.length} new world-model discovery/ies`,
    skipped: false,
    failed: false,
    executionStatus: 'MOCKED',
    toolName: undefined,
  };
}

const SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION = 2;

export async function runAdaptiveHunt(input: AdaptiveHuntInput): Promise<Result<AdaptiveHuntOutput, string>> {
  const log: string[] = [];
  const budget: HuntBudget = { ...DEFAULT_BUDGET, ...input.budget };
  const reasoningRouter = input.reasoningRouter ?? createReasoningProvider();

  // === SCOPE ===
  const intake = new LocalFileIntake();
  const programResult = await intake.loadProgram(input.programScopePath);
  if (!programResult.ok) return err(programResult.error);
  const program = programResult.value;

  const targetResult = validateTarget({
    program,
    url: input.url,
    repoPath: input.repoPath ?? '(no local repository — black-box target)',
  });
  if (!targetResult.ok) return err(`scope validation failed: ${targetResult.error}`);
  log.push(
    `scope: "${input.url}" is in scope (matched "${targetResult.value.matchedAsset.identifier}", tier=${targetResult.value.matchedAsset.tier}, bounty-eligible=${targetResult.value.matchedAsset.bountyEligible})`,
  );

  const existingEngagement = await loadEngagement(input.workspaceDir, input.engagementId);
  let engagement: Engagement;
  if (existingEngagement.ok) {
    engagement = existingEngagement.value;
  } else {
    engagement = newEngagement({
      id: input.engagementId,
      programId: program.programId,
      targets: [{ ...targetResult.value, repoPath: input.repoPath ?? targetResult.value.repoPath }],
    });
    await saveEngagement(input.workspaceDir, engagement);
  }

  const worldModelResult = await loadWorldModel(input.workspaceDir, engagement.id);
  if (!worldModelResult.ok) return err(worldModelResult.error);
  let worldModel = worldModelResult.value;

  const checkpointResult = await loadCheckpoint(input.workspaceDir, engagement.id);
  if (!checkpointResult.ok) return err(checkpointResult.error);
  let checkpoint = checkpointResult.value;

  const observationsResult = await listObservations(input.workspaceDir, engagement.id);
  if (!observationsResult.ok) return err(observationsResult.error);
  let allObservations = [...observationsResult.value];

  const isFreshHunt = worldModel.nodes.length === 0 && checkpoint.hypotheses.length === 0;

  if (isFreshHunt) {
    // === DISCOVER / ENUMERATE / CORRELATE (passive) ===
    const programNode = upsertNode(worldModel, {
      kind: 'program',
      label: program.programId,
      source: 'intake',
      confidence: 1,
      scopeStatus: 'in-scope',
      verificationStatus: 'verified',
    });
    worldModel = programNode.model;
    const rootAsset = upsertNode(worldModel, {
      kind: 'asset',
      label: input.url,
      source: 'operator',
      confidence: 1,
      scopeStatus: 'in-scope',
      verificationStatus: 'verified',
    });
    worldModel = rootAsset.model;
    worldModel = addEdge(worldModel, programNode.node.id, rootAsset.node.id, 'belongs-to');

    const passiveDiscoveries = await runReconSources(input.passiveSources);
    for (const discovery of passiveDiscoveries) {
      const up = upsertNode(worldModel, {
        kind: discovery.kind,
        label: discovery.label,
        source: discovery.source,
        confidence: discovery.confidence,
        attributes: discovery.attributes,
        scopeStatus: classifyRawDiscoveryScope(program, discovery),
      });
      worldModel = up.model;
    }
    const correlatedPassive = correlateDiscoveries(passiveDiscoveries);
    log.push(
      `discover (passive): ${passiveDiscoveries.length} raw discoveries from ${input.passiveSources.length} source(s) -> ${correlatedPassive.length} unique node(s), ${crossSourceCorrelated(correlatedPassive).length} corroborated by 2+ independent sources`,
    );

    // === DISCOVER / ENUMERATE (active, authorized only) ===
    const activeDiscoveries = await runReconSources(input.activeSources);
    let skippedOutOfScope = 0;
    let skippedUnknownScope = 0;
    for (const discovery of activeDiscoveries) {
      const scopeStatus = classifyRawDiscoveryScope(program, discovery);
      if (scopeStatus !== 'in-scope') {
        if (scopeStatus === 'out-of-scope') skippedOutOfScope += 1;
        else skippedUnknownScope += 1;
        continue;
      }
      const up = upsertNode(worldModel, {
        kind: discovery.kind,
        label: discovery.label,
        source: discovery.source,
        confidence: discovery.confidence,
        attributes: discovery.attributes,
        scopeStatus,
      });
      worldModel = up.model;
    }
    log.push(
      `enumerate (active, in-scope targets only): ${activeDiscoveries.length - skippedOutOfScope - skippedUnknownScope} discoveries applied, ${skippedOutOfScope} skipped as out-of-scope, ${skippedUnknownScope} skipped as unknown-scope`,
    );

    // === UNDERSTAND (JavaScript intelligence) ===
    const jsObservations: Observation[] = [];
    for (const artifact of input.jsArtifacts) {
      if (classifyDiscoveryScope(program, 'asset', artifact.assetRef) === 'out-of-scope') continue;
      const result = analyzeJavaScript(artifact.content, artifact.sourceRef, artifact.assetRef, engagement.id);
      for (const discovery of result.discoveries) {
        const up = upsertNode(worldModel, {
          kind: discovery.kind,
          label: discovery.label,
          source: discovery.source,
          confidence: discovery.confidence,
          attributes: discovery.attributes,
          scopeStatus: classifyRawDiscoveryScope(program, discovery),
        });
        worldModel = up.model;
      }
      jsObservations.push(...result.observations);
    }
    log.push(
      `understand (js-intelligence): analyzed ${input.jsArtifacts.length} artifact(s), ${jsObservations.length} observation(s)`,
    );

    // === OBSERVE (behavioral state-diffing) ===
    const behavioralObservations: Observation[] = [];
    for (const fixture of input.behavioralFixtures) {
      if (classifyDiscoveryScope(program, 'asset', fixture.assetRef) === 'out-of-scope') continue;
      behavioralObservations.push(
        ...compareAuthStates(engagement.id, fixture.assetRef, fixture.endpoint, fixture.responses),
      );
    }
    log.push(
      `observe (behavioral): compared ${input.behavioralFixtures.length} endpoint/auth-state matrix/es, ${behavioralObservations.length} observation(s)`,
    );

    const bootstrapObservations = filterInScopeObservations(program, [...jsObservations, ...behavioralObservations]);
    await appendObservations(input.workspaceDir, engagement.id, bootstrapObservations);
    allObservations = [...allObservations, ...bootstrapObservations];

    // === HYPOTHESIZE / PRIORITIZE ===
    const hypotheses = hypothesesFromObservations(bootstrapObservations, engagement.id);
    log.push(`hypothesize: derived ${hypotheses.length} initial hypothesis/es`);

    checkpoint = { ...checkpoint, hypotheses, observationIds: bootstrapObservations.map((o) => o.id) };
    await saveWorldModel(input.workspaceDir, engagement.id, worldModel);
    await saveCheckpoint(input.workspaceDir, checkpoint);
  } else {
    log.push(
      `resuming hunt at round ${checkpoint.round} with ${checkpoint.hypotheses.length} known hypothesis/es and ${allObservations.length} known observation(s)`,
    );
  }

  // === SELECT NEXT-BEST ACTION -> INVESTIGATE -> LEARN -> UPDATE MODEL -> REPEAT ===
  //
  // "stopped" (a prior invocation ran out of its round budget, not out of
  // work) is resumable; only "completed" (the queue was genuinely empty,
  // or the budget/policy layer ended the hunt) is not. Resuming always
  // re-arms the loop before spending a fresh round budget.
  if (checkpoint.status === 'stopped') {
    checkpoint = { ...checkpoint, status: 'in-progress' };
  }
  for (let i = 0; i < input.maxRounds && checkpoint.status === 'in-progress'; i++) {
    checkpoint = { ...checkpoint, round: checkpoint.round + 1 };
    const completedKeys = new Set(checkpoint.completedActionKeys);
    const queue = buildActionQueue(checkpoint.hypotheses, engagement.id, completedKeys);

    const shannonExecutionsSoFar = checkpoint.actions.filter(
      (a) => a.kind === 'shannon' && (a.status === 'done' || a.status === 'failed'),
    ).length;
    const policyCtx: PolicyContext = {
      candidateActions: queue,
      actionsSoFar: checkpoint.actions.length,
      shannonExecutionsSoFar,
      elapsedMs: Date.now() - new Date(checkpoint.startedAt).getTime(),
      budget,
    };

    const snapshot: WorldModelSnapshot = {
      programId: program.programId,
      nodes: worldModel.nodes,
      edges: worldModel.edges,
      hypotheses: checkpoint.hypotheses,
      recentObservations: allObservations.slice(-50),
      completedActions: checkpoint.actions,
      candidateActions: queue,
      round: checkpoint.round,
    };

    const selection = await selectNextBestActionWithFallback(reasoningRouter, snapshot);
    const decision = evaluateProposal(selection.proposal, policyCtx);
    const decisionRecord: ReasoningDecision = {
      id: `decision-${engagement.id}-${checkpoint.round}`,
      at: new Date().toISOString(),
      round: checkpoint.round,
      source: selection.source,
      proposal: selection.proposal,
      accepted: decision.allowed,
      acceptanceReason: decision.reason,
    };
    checkpoint = { ...checkpoint, decisions: [...checkpoint.decisions, decisionRecord] };

    if (selection.fallbackReason) {
      log.push(
        `round ${checkpoint.round}: reasoning fallback (${selection.source} could not be used): ${selection.fallbackReason}`,
      );
    }

    if (decision.reason.includes('budget exhausted')) {
      log.push(`round ${checkpoint.round}: ${decision.reason}; stopping`);
      checkpoint = { ...checkpoint, status: 'completed', updatedAt: new Date().toISOString() };
      await saveCheckpoint(input.workspaceDir, checkpoint);
      break;
    }

    let nextAction: HuntAction | undefined;
    if (decision.allowed) {
      nextAction = decision.action;
    } else {
      nextAction = selectNextBestAction(queue);
      if (decision.reason !== 'no action was proposed') {
        log.push(
          `round ${checkpoint.round}: proposal rejected (${decision.reason}); using deterministic selection instead`,
        );
      }
    }

    if (!nextAction) {
      log.push(`round ${checkpoint.round}: no actionable hypothesis remains in the queue; stopping`);
      checkpoint = { ...checkpoint, status: 'completed', updatedAt: new Date().toISOString() };
      await saveCheckpoint(input.workspaceDir, checkpoint);
      break;
    }

    log.push(
      `round ${checkpoint.round}: next-best-action = ${nextAction.kind} on "${nextAction.targetRef}" (expected gain ${nextAction.expectedInformationGain}, cost ${nextAction.cost}, reasoning=${decision.allowed ? selection.source : 'heuristic-fallback'}) — ${nextAction.rationale}`,
    );

    const scopeDecision = classifyDiscoveryScope(program, 'asset', nextAction.targetRef);

    const executed = await executeAction(nextAction, {
      program,
      repoPath: input.repoPath,
      engagementId: engagement.id,
      workspaceDir: input.workspaceDir,
      investigationFixtures: input.investigationFixtures,
      shannonOutputsByAsset: input.shannonOutputsByAsset,
      liveShannon: input.liveShannon,
      liveRecon: input.liveRecon,
      budget,
    });

    for (const discovery of executed.discoveries) {
      const up = upsertNode(worldModel, {
        kind: discovery.kind,
        label: discovery.label,
        source: discovery.source,
        confidence: discovery.confidence,
        attributes: discovery.attributes,
        scopeStatus: classifyRawDiscoveryScope(program, discovery),
      });
      worldModel = up.model;
    }

    const newObservations = filterInScopeObservations(program, executed.observations);
    await appendObservations(input.workspaceDir, engagement.id, newObservations);
    allObservations = [...allObservations, ...newObservations];

    let hypotheses = checkpoint.hypotheses;
    const targetHypothesis = hypotheses.find((h) => h.id === nextAction.hypothesisId);
    if (targetHypothesis) {
      let updated = targetHypothesis;
      for (const observation of newObservations) {
        const refutes = observation.tags.includes('refutes');
        const supportive =
          !refutes &&
          (observation.verified || observation.vulnClass.toLowerCase() === targetHypothesis.vulnClass.toLowerCase());
        updated = updateHypothesisWithObservation(updated, observation, supportive);
      }
      hypotheses = hypotheses.map((h) => (h.id === updated.id ? updated : h));
    }

    const newVulnClasses = new Set(hypotheses.map((h) => `${h.vulnClass.toLowerCase()}::${h.assetRef}`));
    const unclaimedObservations = newObservations.filter(
      (o) => !newVulnClasses.has(`${o.vulnClass.toLowerCase()}::${o.assetRef}`),
    );
    const freshHypotheses = hypothesesFromObservations(unclaimedObservations, engagement.id);
    hypotheses = [...hypotheses, ...freshHypotheses];
    if (freshHypotheses.length > 0) {
      log.push(`round ${checkpoint.round}: new discovery spawned ${freshHypotheses.length} additional hypothesis/es`);
    }

    const finishedAction = executed.failed
      ? markActionFailed(nextAction, executed.resultSummary)
      : executed.skipped
        ? markActionSkipped(nextAction, executed.resultSummary)
        : markActionDone(nextAction, executed.resultSummary);

    const actionEvent: HuntEvent = {
      id: `event-${engagement.id}-${checkpoint.round}`,
      at: new Date().toISOString(),
      round: checkpoint.round,
      phase: 'investigate',
      action: nextAction.kind,
      tool: executed.toolName ?? nextAction.kind,
      target: nextAction.targetRef,
      scopeDecision,
      authorizationDecision: program.authorizationConfirmed,
      executionStatus: executed.executionStatus,
      policyDecision: decision.reason,
      reason: nextAction.rationale,
      hypothesisId: nextAction.hypothesisId,
      expectedInformationGain: nextAction.expectedInformationGain,
      resultSummary: executed.resultSummary,
      newObservationCount: newObservations.length,
    };

    checkpoint = {
      ...checkpoint,
      hypotheses,
      actions: [...checkpoint.actions, finishedAction],
      completedActionKeys: [...checkpoint.completedActionKeys, actionKey(nextAction.kind, nextAction.targetRef)],
      observationIds: [...checkpoint.observationIds, ...newObservations.map((o) => o.id)],
      events: [...checkpoint.events, actionEvent],
      updatedAt: new Date().toISOString(),
    };
    await saveWorldModel(input.workspaceDir, engagement.id, worldModel);
    await saveCheckpoint(input.workspaceDir, checkpoint);
    log.push(`round ${checkpoint.round}: ${executed.resultSummary}`);
  }

  if (checkpoint.status === 'in-progress') {
    checkpoint = { ...checkpoint, status: 'stopped', updatedAt: new Date().toISOString() };
    log.push(`stopping after ${checkpoint.round} round(s) (max-rounds reached) with hypotheses still open`);
    await saveCheckpoint(input.workspaceDir, checkpoint);
  }

  // === VALIDATE -> EVIDENCE -> DEDUPLICATE -> REPORT DRAFT ===
  //
  // The winner is the highest-confidence, not-contradicted hypothesis that
  // has at least one *verified* supporting observation — a concrete signal
  // something was actually reproduced, not merely a hypothesis-priority
  // heuristic crossing an arbitrary threshold. `Hypothesis.status` still
  // drives which hypotheses stay in the action queue; it does not by
  // itself decide what becomes a finding.
  const observationById = new Map(allObservations.map((o) => [o.id, o] as const));
  const candidateHypotheses = checkpoint.hypotheses
    .filter((h) => h.status !== 'contradicted' && h.status !== 'discarded')
    .filter((h) => h.supportingObservationIds.some((id) => observationById.get(id)?.verified === true))
    .sort((a, b) => b.confidence - a.confidence);
  const winner: Hypothesis | undefined = candidateHypotheses[0];

  let finding: Finding | undefined;
  let reportDraftPath: string | undefined;

  if (winner) {
    const supportingObservations = winner.supportingObservationIds
      .map((id) => observationById.get(id))
      .filter((o): o is Observation => o !== undefined);

    finding = createFinding({
      engagementId: engagement.id,
      title: winner.statement,
      vulnClass: winner.vulnClass,
      assetRef: winner.assetRef,
      confidence: winner.confidence,
      observationIds: winner.supportingObservationIds,
      reason: `selected as the strongest supported hypothesis after ${checkpoint.round} round(s) (confidence ${winner.confidence}, priority ${winner.priorityScore})`,
    });
    log.push(
      `validate: candidate finding created from hypothesis "${winner.id}" (${winner.vulnClass} on ${winner.assetRef})`,
    );

    const toInvestigated = transitionFinding(
      finding,
      'investigated',
      `reviewed ${supportingObservations.length} supporting observation(s) from ${new Set(supportingObservations.map((o) => o.source)).size} distinct source(s)`,
    );
    if (!toInvestigated.ok) return err(toInvestigated.error);
    finding = toInvestigated.value;

    const hasVerifiedObservation = supportingObservations.some((o) => o.verified);
    if (hasVerifiedObservation) {
      const toReproduced = transitionFinding(
        finding,
        'reproduced',
        'a supporting observation was independently verified during its own investigation (e.g. Shannon exploitation)',
      );
      if (!toReproduced.ok) return err(toReproduced.error);
      finding = toReproduced.value;
      log.push(`validate: "${finding.title}" reproduced`);

      const distinctSources = new Set(supportingObservations.map((o) => o.source)).size;
      if (distinctSources >= SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION) {
        const toIndependent = transitionFinding(
          finding,
          'independently_validated',
          `corroborated by ${distinctSources} distinct sources: ${[...new Set(supportingObservations.map((o) => o.source))].join(', ')}`,
        );
        if (!toIndependent.ok) return err(toIndependent.error);
        finding = toIndependent.value;
        log.push(`validate: "${finding.title}" independently validated (${distinctSources} distinct sources)`);

        const toImpact = transitionFinding(
          finding,
          'impact_demonstrated',
          `potential impact assessed as "${winner.potentialImpact}" based on ${winner.requiredEvidence.join(', ')}`,
        );
        if (!toImpact.ok) return err(toImpact.error);
        finding = toImpact.value;

        // === EVIDENCE ===
        const evidenceEntries = await Promise.all(
          supportingObservations.map(async (observation) => {
            const entry = createEvidenceEntry({
              engagementId: engagement.id,
              findingId: (finding as Finding).id,
              source: observation.source,
              description: observation.description,
            });
            await appendEvidence(input.workspaceDir, entry);
            return entry;
          }),
        );
        finding = withEvidence(
          finding,
          evidenceEntries.map((e) => e.id),
        );
        log.push(`evidence: recorded ${evidenceEntries.length} evidence entry/entries`);

        // === DEDUPLICATE ===
        const priorFindings = await listFindings(input.workspaceDir, engagement.id);
        const dedup = new LocalSignatureDeduplicator();
        const dedupResult = dedup.checkDuplicate(finding, priorFindings);
        if (dedupResult.isDuplicate) {
          const toDuplicate = transitionFinding(
            finding,
            'duplicate',
            `matches existing finding "${dedupResult.matchedFindingId}" (signature ${dedupResult.signature})`,
          );
          if (!toDuplicate.ok) return err(toDuplicate.error);
          finding = toDuplicate.value;
          log.push(`deduplicate: "${finding.title}" is a duplicate of "${dedupResult.matchedFindingId}"`);
        } else {
          const toDeduplicated = transitionFinding(
            finding,
            'deduplicated',
            `no existing finding shares signature "${dedupResult.signature}"`,
          );
          if (!toDeduplicated.ok) return err(toDeduplicated.error);
          finding = toDeduplicated.value;
          log.push(`deduplicate: "${finding.title}" is unique (signature ${dedupResult.signature})`);

          // === REPORT DRAFT ===
          const toReportReady = transitionFinding(
            finding,
            'report_ready',
            'passed the full validation chain and is ready for a report draft',
          );
          if (!toReportReady.ok) return err(toReportReady.error);
          finding = toReportReady.value;

          const draftResult = await writeDraft(input.workspaceDir, finding, evidenceEntries, {
            impact: winner.potentialImpact,
          });
          if (!draftResult.ok) return err(draftResult.error);
          reportDraftPath = draftResult.value;
          log.push(`report-draft: wrote ${reportDraftPath}`);

          const toReported = transitionFinding(
            finding,
            'reported',
            'draft generated; awaiting human review before manual HackerOne submission',
          );
          if (!toReported.ok) return err(toReported.error);
          finding = toReported.value;
        }
      } else {
        log.push(
          `validate: "${finding.title}" reproduced but only ${distinctSources} distinct source(s) support it (need ${SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION}) — stopping short of independent validation`,
        );
      }
    } else {
      log.push(`validate: "${finding.title}" has no verified supporting observation yet — stopping at "investigated"`);
    }

    await saveFinding(input.workspaceDir, finding);
  } else {
    log.push('validate: no hypothesis reached "supported" status within the round budget; no finding was created');
  }

  const allFindings = await listFindings(input.workspaceDir, engagement.id);
  const metrics = computeReconMetrics({
    worldModel,
    hypotheses: checkpoint.hypotheses,
    findings: allFindings,
    huntStartedAt: checkpoint.startedAt,
  });

  return ok({ engagement, worldModel, checkpoint, finding, reportDraftPath, metrics, log });
}
