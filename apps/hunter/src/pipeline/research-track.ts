/**
 * Research track.
 *
 * The upgrade from "advanced scanner" to "autonomous security researcher":
 * anomaly detection, the research cascade, the provenance graph, the
 * application state/workflow graph, the authorization matrix, attack-path
 * discovery, the experiment designer, adversarial validation, and hunt
 * memory, all genuinely wired into one executed pass rather than existing
 * as orphaned modules.
 *
 * Deliberately kept as its own hypothesis/action/finding space, separate
 * from `pipeline/adaptive-loop.ts`'s primary `checkpoint.hypotheses` and
 * winner-selection: the primary loop is a well-tested, working MVP
 * pipeline (one hypothesis per action, matched strictly by id) and this
 * track must never be able to steal an action slot from it or change which
 * hypothesis its own tests expect to win. Both tracks execute through the
 * exact same primitives, though — `pipeline/tool-bridge.ts:executeActionViaRegistry`,
 * `reasoning/policy.ts`'s rate limiter, `findings/lifecycle.ts`'s state
 * machine, `evidence/store.ts`'s redaction — never a parallel execution
 * implementation. Real experiment execution only happens when the caller
 * supplies `liveRecon`, exactly like the primary loop's own opt-in; without
 * it, this still genuinely computes anomalies, competing hypotheses,
 * provenance, state-graph inconsistencies, and attack chains from whatever
 * was already collected, and persists all of it for inspection.
 */

import { type Anomaly, detectAnomaliesAgainstBaseline, jsonStructureFingerprint } from '../anomaly/engine.js';
import { buildAuthorizationMatrix, findPrivilegeInversions, privilegeInversionsToHypotheses } from '../authz/matrix.js';
import { LocalSignatureDeduplicator } from '../dedup/local-dedup.js';
import { appendEvidence, createEvidenceEntry } from '../evidence/store.js';
import { createFinding, saveFinding, transitionFinding } from '../findings/lifecycle.js';
import {
  appendMemory,
  type HuntMemoryEntry,
  loadMemory,
  memoryFromFinding,
  prioritizationMultiplier,
} from '../memory/hunt-memory.js';
import {
  type AnomalyCascadeSeed,
  applyObservationWithContradictionTracking,
  type CascadeEvent,
  runResearchCascade,
} from '../reasoning/cascade.js';
import { designExperiments, experimentToHuntAction, selectBestExperiment } from '../reasoning/experiment.js';
import { DEFAULT_BUDGET, type ToolRateLimiter } from '../reasoning/policy.js';
import type { AuthState, StateResponseMap } from '../recon/behavioral.js';
import type { AuthStateHeaders } from '../recon/behavioral-live.js';
import type { ToolRegistry } from '../tools/registry.js';
import type {
  ExecutionStatus,
  Finding,
  HuntAction,
  Hypothesis,
  Observation,
  ProgramScope,
  WorldModel,
} from '../types.js';
import { runAdversarialReview } from '../validation/adversarial.js';
import { type AttackChain, findAttackChains } from '../worldmodel/attack-path.js';
import { nodesByKind } from '../worldmodel/graph.js';
import {
  findSuspiciousTransformations,
  loadProvenanceGraph,
  type ProvenanceEdge,
  provenanceToHypotheses,
  saveProvenanceGraph,
} from '../worldmodel/provenance.js';
import {
  detectAuthorizationInconsistencies,
  loadStateGraph,
  recordTransition,
  saveStateGraph,
  stateGraphAnomaliesToHypotheses,
  type WorkflowTransition,
} from '../worldmodel/state-graph.js';
import { executeShannonHuntAction, type LiveShannonOptions } from './shannon-action.js';
import { executeActionViaRegistry, type LiveReconOptions as ToolBridgeLiveReconOptions } from './tool-bridge.js';

export interface ResearchBehavioralFixture {
  readonly assetRef: string;
  readonly endpoint: string;
  readonly responses: StateResponseMap;
}

export interface ResearchTrackBudget {
  readonly maxNewHypotheses: number;
  readonly maxCascadeDepth: number;
  readonly maxExperiments: number;
  /** Independent of the primary loop's own `HuntBudget.maxShannonExecutions` — this track has its own hypothesis/action space (see module docstring) and so its own, deliberately small, Shannon execution cap. */
  readonly maxShannonExecutions: number;
}

export const DEFAULT_RESEARCH_BUDGET: ResearchTrackBudget = {
  maxNewHypotheses: 20,
  maxCascadeDepth: 4,
  maxExperiments: 5,
  maxShannonExecutions: 1,
};

export interface ResearchLiveOptions {
  readonly registry: ToolRegistry;
  /** Explicit, separate confirmation required before a "shannon"-kind experiment executes Shannon for real — mirrors `AdaptiveHuntInput.liveShannon` exactly. Omitted, a "shannon"-kind experiment (once `live` is otherwise configured) still safely plans/dry-runs via `pipeline/shannon-action.ts`, exactly like the primary loop. */
  readonly shannon?: LiveShannonOptions;
  readonly rateLimiter?: ToolRateLimiter;
  readonly preferredToolNames?: Readonly<Record<string, readonly string[]>>;
  readonly wordlistPath?: string;
  readonly nucleiSeverity?: string;
  readonly amassOutputDir?: string;
  readonly allowHighRisk?: boolean;
  /** Required for a live "behavioral-diff" experiment (the most common kind this track designs) to actually run — see `tools/live-adapters.ts:BehavioralTestAdapter`. Without an entry for a given targetRef, that experiment reports UNAVAILABLE, exactly like the primary loop's own liveRecon. */
  readonly behavioralAuthStatesByAsset?: ReadonlyMap<string, AuthStateHeaders>;
}

export interface ResearchTrackInput {
  readonly engagementId: string;
  readonly workspaceDir: string;
  readonly program: ProgramScope;
  readonly worldModel: WorldModel;
  readonly jsProvenanceEdges: readonly ProvenanceEdge[];
  readonly behavioralFixtures: readonly ResearchBehavioralFixture[];
  readonly isInScope: (assetRef: string) => boolean;
  readonly budget?: Partial<ResearchTrackBudget>;
  readonly live?: ResearchLiveOptions;
  /** Required for a "shannon"-kind experiment's eligibility check (`shannon/eligibility.ts`) to ever pass — mirrors `AdaptiveHuntInput.repoPath`. */
  readonly repoPath?: string;
  /** assetRef -> path to a captured Shannon report.json-shaped file — mirrors `AdaptiveHuntInput.shannonOutputsByAsset`, consulted only once `live` is configured and `live.shannon.confirmed` is not set. */
  readonly shannonOutputsByAsset?: ReadonlyMap<string, string>;
}

export interface ResearchTrackOutput {
  readonly hypotheses: readonly Hypothesis[];
  readonly anomalies: readonly Anomaly[];
  readonly provenanceEdges: readonly ProvenanceEdge[];
  readonly transitions: readonly WorkflowTransition[];
  readonly attackChains: readonly AttackChain[];
  readonly cascadeEvents: readonly CascadeEvent[];
  readonly findings: readonly Finding[];
  readonly memory: readonly HuntMemoryEntry[];
  readonly log: readonly string[];
}

const AUTH_STATE_ORDER: readonly AuthState[] = [
  'anonymous',
  'authenticated-user',
  'different-user',
  'resource-owner',
  'privileged-user',
];
const AUTH_STATE_PRIVILEGE_HIERARCHY: readonly string[] = [
  'anonymous',
  'authenticated-user',
  'resource-owner',
  'privileged-user',
];
const SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION = 2;

function fingerprintBody(text: string): string {
  try {
    return jsonStructureFingerprint(JSON.parse(text));
  } catch {
    return `text:${text.length}`;
  }
}

function observedStates(responses: StateResponseMap): readonly AuthState[] {
  return AUTH_STATE_ORDER.filter((state) => responses[state] !== undefined);
}

function authorizationOutcomeFor(status: number): 'allowed' | 'denied' | 'unknown' {
  if (status === 401 || status === 403) return 'denied';
  if (status >= 200 && status < 300) return 'allowed';
  return 'unknown';
}

/**
 * Runs the full anomaly -> cascade -> provenance -> state-graph -> authz-matrix
 * -> attack-path -> experiment-designer -> adversarial-validation -> memory
 * pipeline once, over whatever the caller has already collected. Bounded
 * and deterministic: every generation step respects `budget`, and
 * experiment execution only happens when `live` is supplied.
 */
export async function runResearchTrack(input: ResearchTrackInput): Promise<ResearchTrackOutput> {
  const budget: ResearchTrackBudget = { ...DEFAULT_RESEARCH_BUDGET, ...input.budget };
  const log: string[] = [];

  // `findings/lifecycle.ts:findingFilePath` (and `evidence/store.ts`'s
  // equivalent) key their on-disk path *only* by engagementId — reusing
  // `input.engagementId` verbatim here would put a research-track finding
  // in the exact same `engagements/<id>/findings/` directory the primary
  // loop's own `listFindings`-based dedup check reads from. Since the
  // research track runs *before* that check, its finding would be present
  // as a "prior" finding and could wrongly flip the primary loop's own
  // finding to "duplicate" — breaking the documented guarantee that the
  // research track can never change what the primary loop reports. A
  // distinct id keeps the two completely separate on disk — a research
  // finding's `engagementId` field shows this suffixed id rather than the
  // bare one, which doubles as a visible marker of provenance (a human or
  // log parser can still recover the real engagement by stripping the
  // suffix).
  const researchStorageId = `${input.engagementId}::research`;

  // Scope is enforced up front, not just inside the cascade engine: no
  // behavioral data or provenance edge for an out-of-scope asset may ever
  // reach anomaly detection, the state graph, or hypothesis generation —
  // the same firewall principle as `recon/scope-tagging.ts:filterInScopeObservations`.
  const inScopeBehavioralFixtures = input.behavioralFixtures.filter((f) => input.isInScope(f.assetRef));
  const skippedOutOfScopeFixtures = input.behavioralFixtures.length - inScopeBehavioralFixtures.length;
  const inScopeProvenanceEdges = input.jsProvenanceEdges.filter(
    (edge) => input.isInScope(edge.sourceRef) && input.isInScope(edge.sinkRef),
  );

  // === ANOMALY DETECTION (behavioral) ===
  const anomalies: Anomaly[] = [];
  const transitions: WorkflowTransition[] = [];
  const cascadeSeeds: AnomalyCascadeSeed[] = [];

  for (const fixture of inScopeBehavioralFixtures) {
    const states = observedStates(fixture.responses);
    if (states.length === 0) continue;
    const baselineState = states[0];
    if (baselineState === undefined) continue;
    const baselineResponse = fixture.responses[baselineState];
    if (!baselineResponse) continue;
    const baselineSample = {
      label: baselineState,
      httpStatus: baselineResponse.status,
      bodyLength: baselineResponse.bodySnippet.length,
      bodyStructureFingerprint: fingerprintBody(baselineResponse.bodySnippet),
      authorizationOutcome: authorizationOutcomeFor(baselineResponse.status),
    };
    const variantSamples = states.slice(1).flatMap((state) => {
      const response = fixture.responses[state];
      if (!response) return [];
      return [
        {
          label: state,
          httpStatus: response.status,
          bodyLength: response.bodySnippet.length,
          bodyStructureFingerprint: fingerprintBody(response.bodySnippet),
          authorizationOutcome: authorizationOutcomeFor(response.status),
        },
      ];
    });
    const foundAnomalies = detectAnomaliesAgainstBaseline(baselineSample, variantSamples, {
      source: 'behavioral-diff',
    });
    for (const anomaly of foundAnomalies) {
      anomalies.push(anomaly);
      cascadeSeeds.push({ anomaly, assetRef: fixture.assetRef });
    }

    for (const state of states) {
      const response = fixture.responses[state];
      if (!response) continue;
      transitions.push(
        recordTransition({
          engagementId: input.engagementId,
          actorRef: `${fixture.assetRef}::${state}`,
          role: state,
          authState: state,
          fromState: 'pre-request',
          action: `GET ${fixture.endpoint}`,
          toState: response.status < 300 ? 'success' : 'denied',
          authorizationOutcome: authorizationOutcomeFor(response.status),
          resourceRef: fixture.endpoint,
          source: 'behavioral-diff',
        }),
      );
    }
  }
  log.push(
    `research-track anomaly-detection: ${anomalies.length} anomaly/ies from ${inScopeBehavioralFixtures.length} in-scope behavioral fixture(s)${skippedOutOfScopeFixtures > 0 ? ` (${skippedOutOfScopeFixtures} skipped as out-of-scope)` : ''}`,
  );

  // === RESEARCH CASCADE ===
  const cascade = runResearchCascade(cascadeSeeds, {
    engagementId: input.engagementId,
    existingHypotheses: [],
    isInScope: input.isInScope,
    budget: { maxDepth: budget.maxCascadeDepth, maxNewHypotheses: budget.maxNewHypotheses },
  });
  log.push(`research-track cascade: ${cascade.newHypotheses.length} competing hypothesis/es generated from anomalies`);

  // === PROVENANCE GRAPH ===
  const existingProvenance = await loadProvenanceGraph(input.workspaceDir, input.engagementId);
  const priorProvenanceEdges = existingProvenance.ok ? existingProvenance.value : [];
  const allProvenanceEdges = [...priorProvenanceEdges, ...inScopeProvenanceEdges];
  await saveProvenanceGraph(input.workspaceDir, input.engagementId, allProvenanceEdges);
  const provenanceHypotheses = provenanceToHypotheses(allProvenanceEdges, input.engagementId);
  log.push(
    `research-track provenance: ${findSuspiciousTransformations(allProvenanceEdges).length} suspicious transformation(s) -> ${provenanceHypotheses.length} hypothesis/es`,
  );

  // === STATE GRAPH / AUTHORIZATION MATRIX ===
  const existingTransitions = await loadStateGraph(input.workspaceDir, input.engagementId);
  const priorTransitions = existingTransitions.ok ? existingTransitions.value : [];
  const allTransitions = [...priorTransitions, ...transitions];
  await saveStateGraph(input.workspaceDir, input.engagementId, allTransitions);
  const authzInconsistencies = detectAuthorizationInconsistencies(allTransitions);
  const matrix = buildAuthorizationMatrix(allTransitions);
  const inversions = findPrivilegeInversions(matrix, AUTH_STATE_PRIVILEGE_HIERARCHY);
  const stateGraphHypotheses = [
    ...stateGraphAnomaliesToHypotheses(authzInconsistencies, input.engagementId),
    ...privilegeInversionsToHypotheses(inversions, input.engagementId),
  ];
  log.push(
    `research-track state-graph: ${authzInconsistencies.length} authorization inconsistency/ies, ${inversions.length} privilege inversion(s)`,
  );

  // === ATTACK-PATH DISCOVERY ===
  const highValueRefs = new Set<string>([
    ...allProvenanceEdges
      .filter((e) => ['cookie', 'authorization-decision', 'dom-sink', 'workflow'].includes(e.sinkKind))
      .map((e) => e.sinkRef),
    ...allTransitions.filter((t) => t.resourceRef !== undefined).map((t) => t.resourceRef as string),
  ]);
  const startRefs = [...nodesByKind(input.worldModel, 'js-artifact'), ...nodesByKind(input.worldModel, 'endpoint')].map(
    (n) => n.label,
  );
  const attackChains = findAttackChains(
    { worldModel: input.worldModel, provenanceEdges: allProvenanceEdges, transitions: allTransitions },
    startRefs,
    { isInScope: input.isInScope, isHighValueTarget: (ref) => highValueRefs.has(ref) },
  );
  log.push(
    `research-track attack-path: ${attackChains.length} chain(s) discovered from ${startRefs.length} start point(s)`,
  );

  // === COMBINE HYPOTHESES ===
  // Defense in depth: every generator above already only sees in-scope
  // fixtures/edges, but this final filter is the same hard guarantee
  // `recon/scope-tagging.ts:filterInScopeObservations` gives the primary
  // loop — no hypothesis against an out-of-scope asset survives regardless
  // of which generator produced it.
  let researchHypotheses: Hypothesis[] = [...cascade.newHypotheses, ...provenanceHypotheses, ...stateGraphHypotheses]
    .filter((h) => input.isInScope(h.assetRef))
    .slice(0, budget.maxNewHypotheses);

  // === EXPERIMENT DESIGNER (+ opt-in real execution) ===
  const executedActionKeys = new Set<string>();
  const findings: Finding[] = [];
  const memoryEntries: HuntMemoryEntry[] = [];
  const evidenceKeeper: { readonly evidenceIds: string[] } = { evidenceIds: [] };

  // Loaded once, from prior engagements' concluded findings — never
  // updated mid-run from this run's own not-yet-concluded work, so a
  // hunt's own in-progress experiments can never bias its own selection.
  const priorMemory = await loadMemory(input.workspaceDir);
  const memory = priorMemory.ok ? priorMemory.value : [];
  if (memory.length > 0) {
    log.push(`research-track memory: loaded ${memory.length} prior experience entry/ies to bias experiment selection`);
  }

  // Counts only genuine attempts (a real spawn, or a dry-run/fixture
  // ingestion that could have spawned) toward the research track's own,
  // independent Shannon budget — never the primary loop's counter, and
  // never incremented for an experiment that was deferred/blocked before
  // reaching `pipeline/shannon-action.ts`.
  let shannonExecutionsSoFar = 0;

  for (let i = 0; i < budget.maxExperiments; i += 1) {
    const candidates = designExperiments(
      researchHypotheses.filter((h) => h.status === 'open' || h.status === 'investigating'),
      executedActionKeys,
    ).map((experiment) => {
      const hypothesis = researchHypotheses.find((h) => h.id === experiment.hypothesisId);
      const multiplier = hypothesis ? prioritizationMultiplier(memory, hypothesis.vulnClass, experiment.actionKind) : 1;
      return { ...experiment, informationGain: Number((experiment.informationGain * multiplier).toFixed(4)) };
    });
    const selection = selectBestExperiment(candidates);
    if (!selection.selected) break;
    const experiment = selection.selected;
    const action: HuntAction = experimentToHuntAction(experiment, input.engagementId);
    // Marked as attempted *before* any gate runs, exactly like
    // `pipeline/adaptive-loop.ts`'s `completedActionKeys` — a duplicate or
    // repeated experiment for the same (kind, target) is never re-selected
    // on a later iteration of this same loop, deferred or not.
    executedActionKeys.add(`${action.kind}::${action.targetRef}`);

    if (!input.isInScope(action.targetRef)) {
      log.push(`research-track experiment: blocked "${experiment.objective}" — target is not in scope`);
      continue;
    }

    if (!input.live) {
      log.push(
        `research-track experiment: deferred "${experiment.objective}" — no live execution configured for this run`,
      );
      continue;
    }

    interface NormalizedExecutionResult {
      readonly status: ExecutionStatus;
      readonly toolName: string | undefined;
      readonly summary: string;
      readonly observations: readonly Observation[];
    }

    let result: NormalizedExecutionResult;
    if (action.kind === 'shannon') {
      // The research track's own Shannon budget — separate from, and
      // enforced before, `shannon/eligibility.ts`/`shannon/execution-adapter.ts`
      // ever run, exactly like `reasoning/policy.ts:evaluateProposal` checks
      // `maxShannonExecutions` before the primary loop's action executes.
      if (shannonExecutionsSoFar >= budget.maxShannonExecutions) {
        log.push(
          `research-track experiment: deferred "${experiment.objective}" — Shannon execution budget exhausted (${shannonExecutionsSoFar}/${budget.maxShannonExecutions})`,
        );
        continue;
      }
      // The one authoritative Shannon execution path (see
      // `pipeline/shannon-action.ts`) — the research track never spawns
      // Shannon itself, and never sets `confirmed: true` on its own; that
      // can only come from the caller's explicit `live.shannon`.
      const shannonResult = await executeShannonHuntAction(action, {
        repoPath: input.repoPath,
        engagementId: input.engagementId,
        workspaceDir: input.workspaceDir,
        shannonOutputsByAsset: input.shannonOutputsByAsset ?? new Map(),
        liveShannon: input.live.shannon,
      });
      if (!shannonResult.skipped) {
        shannonExecutionsSoFar += 1;
      }
      result = {
        status: shannonResult.executionStatus,
        toolName: shannonResult.toolName,
        summary: shannonResult.resultSummary,
        observations: shannonResult.observations,
      };
    } else {
      result = await executeActionViaRegistry(action, input.program, DEFAULT_BUDGET, {
        registry: input.live.registry,
        ...(input.live.rateLimiter !== undefined ? { rateLimiter: input.live.rateLimiter } : {}),
        ...(input.live.preferredToolNames !== undefined ? { preferredToolNames: input.live.preferredToolNames } : {}),
        ...(input.live.wordlistPath !== undefined ? { wordlistPath: input.live.wordlistPath } : {}),
        ...(input.live.nucleiSeverity !== undefined ? { nucleiSeverity: input.live.nucleiSeverity } : {}),
        ...(input.live.amassOutputDir !== undefined ? { amassOutputDir: input.live.amassOutputDir } : {}),
        ...(input.live.allowHighRisk !== undefined ? { allowHighRisk: input.live.allowHighRisk } : {}),
        ...(input.live.behavioralAuthStatesByAsset !== undefined
          ? { behavioralAuthStatesByAsset: input.live.behavioralAuthStatesByAsset }
          : {}),
        engagementId: input.engagementId,
      } satisfies ToolBridgeLiveReconOptions & { engagementId: string });
    }

    log.push(`research-track experiment: ran "${experiment.objective}" -> [${result.status}] ${result.summary}`);

    const hypothesis = researchHypotheses.find((h) => h.id === experiment.hypothesisId);
    if (!hypothesis) continue;
    let updated = hypothesis;
    for (const observation of result.observations) {
      const supportive =
        observation.verified || observation.vulnClass.toLowerCase() === hypothesis.vulnClass.toLowerCase();
      updated = applyObservationWithContradictionTracking(
        updated,
        observation,
        supportive,
        supportive ? 'observation supports the hypothesis' : 'observation does not match the expected pattern',
      );
    }
    researchHypotheses = researchHypotheses.map((h) => (h.id === updated.id ? updated : h));

    const supportingObservations = result.observations.filter((o) => updated.supportingObservationIds.includes(o.id));
    const review = runAdversarialReview({
      hypothesis: updated,
      supportingObservations,
      contradictingObservations: result.observations.filter((o) => updated.contradictingObservationIds.includes(o.id)),
      satisfiedRequirements: new Set(supportingObservations.length > 0 ? updated.requiredEvidence : []),
    });
    log.push(`research-track adversarial-validation: "${updated.statement}" -> ${review.validationResult}`);

    if (review.validationResult !== 'passed') continue;

    let finding = createFinding({
      engagementId: researchStorageId,
      title: updated.statement,
      vulnClass: updated.vulnClass,
      assetRef: updated.assetRef,
      confidence: review.finalConfidence,
      observationIds: updated.supportingObservationIds,
      reason: 'selected by the research track after adversarial validation passed',
    });
    const toInvestigated = transitionFinding(
      finding,
      'investigated',
      'reviewed via the research track experiment designer',
    );
    if (!toInvestigated.ok) continue;
    finding = toInvestigated.value;
    const toReproduced = transitionFinding(
      finding,
      'reproduced',
      'a supporting observation was independently verified',
    );
    if (!toReproduced.ok) continue;
    finding = toReproduced.value;

    const distinctSources = new Set(supportingObservations.map((o) => o.source)).size;
    if (distinctSources >= SOURCE_DIVERSITY_FOR_INDEPENDENT_VALIDATION) {
      const toIndependent = transitionFinding(
        finding,
        'independently_validated',
        `corroborated by ${distinctSources} distinct sources`,
      );
      if (toIndependent.ok) {
        finding = toIndependent.value;
        const toImpact = transitionFinding(
          finding,
          'impact_demonstrated',
          `potential impact: ${updated.potentialImpact}`,
        );
        if (toImpact.ok) finding = toImpact.value;
      }
    }

    const dedup = new LocalSignatureDeduplicator();
    const dedupResult = dedup.checkDuplicate(finding, findings);
    if (dedupResult.isDuplicate) {
      const toDuplicate = transitionFinding(finding, 'duplicate', `matches "${dedupResult.matchedFindingId}"`);
      if (toDuplicate.ok) finding = toDuplicate.value;
    }

    for (const observation of supportingObservations) {
      const entry = createEvidenceEntry({
        engagementId: researchStorageId,
        findingId: finding.id,
        source: observation.source,
        description: observation.description,
      });
      await appendEvidence(input.workspaceDir, entry);
      evidenceKeeper.evidenceIds.push(entry.id);
    }

    await saveFinding(input.workspaceDir, finding);
    findings.push(finding);
    memoryEntries.push(...memoryFromFinding(finding, updated, 'research-track'));
  }

  for (const entry of memoryEntries) {
    await appendMemory(input.workspaceDir, entry);
  }

  return {
    hypotheses: researchHypotheses,
    anomalies,
    provenanceEdges: allProvenanceEdges,
    transitions: allTransitions,
    attackChains,
    cascadeEvents: cascade.events,
    findings,
    memory: memoryEntries,
    log,
  };
}
