/**
 * Live hunt lifecycle orchestrator.
 *
 * This is the one function a CLI/skill entry point needs to call to go from
 * "here are some program-discovery providers" all the way to a completed
 * `runAdaptiveHunt()` run, without the operator hand-writing any
 * TypeScript: `cli.ts`'s `lifecycle` command is a thin wrapper over
 * `runHuntLifecycle` below, exactly the way `hunt --simulate` is a thin
 * wrapper over `runAdaptiveHunt` directly.
 *
 * It never invents a new execution path — discovery
 * (`discovery/*-provider.ts`), ranking (`discovery/scoring.ts`),
 * normalization (`discovery/normalize.ts`), and the hunt itself
 * (`pipeline/adaptive-loop.ts:runAdaptiveHunt`) are all reused exactly as
 * they exist elsewhere in this package. What this module adds is the
 * *sequencing* between them, plus one thing none of those modules may ever
 * do on their own: flip `ProgramScope.authorizationConfirmed` to `true`.
 *
 * ## The authorization boundary
 *
 * `runHuntLifecycle` always stops at `AWAITING_AUTHORIZATION` unless the
 * caller supplies an explicit `AuthorizationRecord` with `confirmed: true`
 * and `scopeReviewed: true`. This is the one place in the whole codebase
 * allowed to write `authorizationConfirmed: true` into a program scope file
 * — and it only ever does so onto a program that has already been
 * discovered, ranked, and normalized, never by trusting a raw discovery
 * record directly. "Start hunting" (discovery + ranking) is never itself
 * interpreted as permission to run anything active; that permission is a
 * separate, explicit, human-supplied fact.
 *
 * A caller that wants the CLI to *feel* automatic still has to produce a
 * real `AuthorizationRecord` — see `cli.ts`'s `lifecycle --authorize
 * <file>` — which is a deliberate artifact the operator writes after
 * reading the printed scope/ROE/rationale, not a flag that skips the
 * decision.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildOpportunityReport, type OpportunityReport } from '../discovery/decision.js';
import { deriveTargetUrl, normalizeDiscoveredProgram } from '../discovery/normalize.js';
import type { RecommendedAction } from '../discovery/opportunity.js';
import {
  explainSelection,
  type RankedProgram,
  rankPrograms,
  type SignalKey,
  selectBestProgram,
} from '../discovery/scoring.js';
import type { DiscoveredProgram, ProgramDiscoveryProvider } from '../discovery/types.js';
import { type AdaptiveHuntInput, type AdaptiveHuntOutput, runAdaptiveHunt } from '../pipeline/adaptive-loop.js';
import { err, ok, type Result } from '../types.js';

export type LifecycleState =
  | 'DISCOVERY'
  | 'RANKING'
  | 'AWAITING_AUTHORIZATION'
  | 'READY'
  | 'RUNNING'
  | 'PAUSED'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'FAILED';

export interface LifecycleTransition {
  readonly state: LifecycleState;
  readonly at: string;
  readonly reason: string;
}

/**
 * The one human-supplied fact that turns a ranked, normalized candidate
 * into an active engagement. `scopeReviewed` is deliberately a separate
 * flag from `confirmed` — a caller must affirmatively say they reviewed the
 * printed scope/ROE, not merely that they clicked "yes."
 */
export interface AuthorizationRecord {
  readonly confirmed: boolean;
  readonly confirmedBy: string;
  readonly confirmedAt: string;
  readonly scopeReviewed: boolean;
  readonly note?: string;
}

export interface HuntLifecycleInput {
  readonly providers: readonly ProgramDiscoveryProvider[];
  readonly weights?: Readonly<Partial<Record<SignalKey, number>>>;
  readonly workspaceDir: string;
  readonly engagementId: string;
  readonly maxRounds: number;
  /** `undefined` (the default) stops the lifecycle at AWAITING_AUTHORIZATION — see this module's docstring. */
  readonly authorization?: AuthorizationRecord;
  /**
   * Everything below is forwarded verbatim to `runAdaptiveHunt` once
   * authorization clears — see `pipeline/adaptive-loop.ts:AdaptiveHuntInput`
   * for what each does. `url`/`repoPath`/`programScopePath` are never
   * accepted here: the lifecycle derives `url` from the selected program's
   * own scope (`discovery/normalize.ts:deriveTargetUrl`) and writes
   * `programScopePath` itself, so a caller cannot silently point the hunt
   * at a target that was never actually discovered/ranked/authorized.
   */
  readonly repoPath?: string;
  readonly passiveSources?: AdaptiveHuntInput['passiveSources'];
  readonly activeSources?: AdaptiveHuntInput['activeSources'];
  readonly jsArtifacts?: AdaptiveHuntInput['jsArtifacts'];
  readonly behavioralFixtures?: AdaptiveHuntInput['behavioralFixtures'];
  readonly investigationFixtures?: AdaptiveHuntInput['investigationFixtures'];
  readonly shannonOutputsByAsset?: AdaptiveHuntInput['shannonOutputsByAsset'];
  readonly budget?: AdaptiveHuntInput['budget'];
  readonly reasoningRouter?: AdaptiveHuntInput['reasoningRouter'];
  readonly liveShannon?: AdaptiveHuntInput['liveShannon'];
  readonly liveRecon?: AdaptiveHuntInput['liveRecon'];
  readonly researchTrack?: AdaptiveHuntInput['researchTrack'];
  /**
   * Bootstrap `passiveSources`/`activeSources` and round-loop `liveRecon`
   * cannot be built until the selected program's target domain/URL is
   * known — which only happens *inside* this function, after discovery and
   * ranking. Supplying these deferred builders (rather than requiring the
   * caller to run discovery/ranking themselves first, just to learn the
   * target, before calling this function a second time with real sources)
   * is what lets a single CLI invocation go straight from "here are some
   * providers" to a fully live bootstrap — see `cli.ts`'s `lifecycle
   * --live-recon`. Ignored when `liveRecon`/`passiveSources`/`activeSources`
   * above are already supplied directly.
   */
  readonly liveReconFromTarget?: (target: { domain: string; url: string }) => AdaptiveHuntInput['liveRecon'];
  readonly bootstrapSourcesFromTarget?: (target: { domain: string; url: string }) => {
    readonly passiveSources: AdaptiveHuntInput['passiveSources'];
    readonly activeSources: AdaptiveHuntInput['activeSources'];
  };
}

export interface HuntLifecycleOutput {
  readonly transitions: readonly LifecycleTransition[];
  readonly finalState: LifecycleState;
  readonly discovered: readonly DiscoveredProgram[];
  readonly ranked: readonly RankedProgram[];
  readonly selected: RankedProgram | undefined;
  readonly selectionRationale: string | undefined;
  /**
   * The full uncertainty-aware assessment (confidence, completeness,
   * economics, research cost, capability fit, and cross-scenario
   * robustness) for every scored candidate — see `discovery/decision.ts`.
   * `selected` above is still always `selectBestProgram(ranked)` (the raw
   * top `totalScore`, unchanged from before this field existed) — this
   * report is additive, surfaced so a human reviewing the printed
   * scope/ROE/rationale before writing an `AuthorizationRecord` can also
   * see whether that top score is a *robust* winner or a fragile one/part
   * of a statistical tie. Ranking is never itself authorization; this only
   * makes what the ranking actually knows (and does not know) visible.
   */
  readonly opportunityReport: OpportunityReport | undefined;
  /**
   * `opportunityReport`'s own verdict for `selected` specifically — the
   * confidence-gated recommendation (`HUNT_NOW`/`INVESTIGATE_MORE`/`WATCH`/
   * `SKIP`) and its reason, looked up by `selected.program.programId`.
   * Named distinctly from `selected` (never a `rawSelected` rename, per the
   * read-only audit that preceded this fix) so a caller has an unambiguous,
   * structured signal to consult before authorizing — `selected` remains
   * exactly the raw top-`totalScore` candidate it always was, for backward
   * compatibility with existing consumers/tests. Consulting `decision` is
   * still advisory, not a hard gate: see this file's module docstring — the
   * only hard gate remains a human-supplied `AuthorizationRecord`.
   */
  readonly decision: RecommendedAction | undefined;
  readonly decisionReason: string | undefined;
  readonly droppedAssets: readonly string[];
  readonly normalizedScopePath: string | undefined;
  readonly targetUrl: string | undefined;
  readonly huntResult: AdaptiveHuntOutput | undefined;
}

function transition(state: LifecycleState, reason: string): LifecycleTransition {
  return { state, at: new Date().toISOString(), reason };
}

function normalizedScopeFilePath(workspaceDir: string, engagementId: string): string {
  return join(workspaceDir, 'engagements', engagementId, 'selected-program.json');
}

/** Looks up one program's entry in an `OpportunityReport.top` by id — `undefined` when the program was never scored (e.g. no signal data at all) or no program was selected. */
function decisionFor(
  report: OpportunityReport,
  programId: string | undefined,
): { readonly decision: RecommendedAction | undefined; readonly decisionReason: string | undefined } {
  if (!programId) return { decision: undefined, decisionReason: undefined };
  const entry = report.top.find((e) => e.assessment.programId === programId);
  return { decision: entry?.finalAction, decisionReason: entry?.assessment.recommendationReason };
}

export async function runHuntLifecycle(input: HuntLifecycleInput): Promise<Result<HuntLifecycleOutput, string>> {
  const transitions: LifecycleTransition[] = [];

  // === DISCOVERY ===
  transitions.push(transition('DISCOVERY', `querying ${input.providers.length} discovery provider(s)`));
  const discovered: DiscoveredProgram[] = [];
  const providerErrors: string[] = [];
  for (const provider of input.providers) {
    const result = await provider.discoverPrograms();
    if (result.ok) {
      discovered.push(...result.value);
    } else {
      providerErrors.push(`${provider.name}: ${result.error}`);
    }
  }

  if (discovered.length === 0) {
    transitions.push(
      transition(
        'BLOCKED',
        providerErrors.length > 0
          ? `every discovery provider failed or returned nothing: ${providerErrors.join('; ')}`
          : 'no discovery provider returned any candidate program',
      ),
    );
    return ok({
      transitions,
      finalState: 'BLOCKED',
      discovered,
      ranked: [],
      selected: undefined,
      selectionRationale: undefined,
      opportunityReport: undefined,
      decision: undefined,
      decisionReason: undefined,
      droppedAssets: [],
      normalizedScopePath: undefined,
      targetUrl: undefined,
      huntResult: undefined,
    });
  }

  // === RANKING ===
  transitions.push(transition('RANKING', `scoring ${discovered.length} candidate program(s)`));
  const ranked = rankPrograms(discovered, input.weights ?? {});
  const selected = selectBestProgram(ranked);
  // The uncertainty-aware assessment is additive: `selected` above is still always the raw
  // top-`totalScore` candidate (unchanged behavior). This report is what lets a human reviewing
  // the printed rationale before authorizing see whether that top score is a robust winner, a
  // fragile one, or part of a statistical tie — see this file's `HuntLifecycleOutput` docstring.
  // `topN` is set to the full candidate count (never the default 20) so `decisionFor` below can
  // always find `selected` regardless of how many programs were discovered.
  const opportunityReport = buildOpportunityReport(discovered, {
    weights: input.weights ?? {},
    topN: discovered.length,
  });
  const selectionRationale = `${explainSelection(ranked)} Robustness: ${opportunityReport.robustnessReason}`;
  const { decision, decisionReason } = decisionFor(opportunityReport, selected?.program.programId);

  if (!selected) {
    transitions.push(transition('BLOCKED', 'no candidate program had enough signal data to be scored/selected'));
    return ok({
      transitions,
      finalState: 'BLOCKED',
      discovered,
      ranked,
      selected: undefined,
      selectionRationale,
      opportunityReport,
      decision,
      decisionReason,
      droppedAssets: [],
      normalizedScopePath: undefined,
      targetUrl: undefined,
      huntResult: undefined,
    });
  }

  // === AWAITING_AUTHORIZATION ===
  transitions.push(
    transition(
      'AWAITING_AUTHORIZATION',
      `selected "${selected.program.programName}" (${selected.program.programId}); awaiting explicit human authorization before any active testing`,
    ),
  );
  const normalized = normalizeDiscoveredProgram(selected.program);
  if (!normalized.ok) {
    transitions.push(transition('FAILED', normalized.error));
    return err(normalized.error);
  }

  const authorized = input.authorization?.confirmed === true && input.authorization.scopeReviewed === true;
  if (!authorized) {
    return ok({
      transitions,
      finalState: 'AWAITING_AUTHORIZATION',
      discovered,
      ranked,
      selected,
      selectionRationale,
      opportunityReport,
      decision,
      decisionReason,
      droppedAssets: normalized.value.droppedAssets,
      normalizedScopePath: undefined,
      targetUrl: deriveTargetUrl(normalized.value.scope),
      huntResult: undefined,
    });
  }

  // === READY ===
  const authorizedScope = { ...normalized.value.scope, authorizationConfirmed: true };
  const targetUrl = deriveTargetUrl(authorizedScope);
  if (!targetUrl) {
    const reason = `selected program "${authorizedScope.programId}" has no web-shaped (domain/wildcard-domain/url) in-scope asset for Hunter's scope validator to accept`;
    transitions.push(transition('BLOCKED', reason));
    return ok({
      transitions,
      finalState: 'BLOCKED',
      discovered,
      ranked,
      selected,
      selectionRationale,
      opportunityReport,
      decision,
      decisionReason,
      droppedAssets: normalized.value.droppedAssets,
      normalizedScopePath: undefined,
      targetUrl: undefined,
      huntResult: undefined,
    });
  }

  const normalizedScopePath = normalizedScopeFilePath(input.workspaceDir, input.engagementId);
  await mkdir(dirname(normalizedScopePath), { recursive: true });
  await writeFile(normalizedScopePath, `${JSON.stringify(authorizedScope, null, 2)}\n`, 'utf8');
  transitions.push(
    transition(
      'READY',
      `authorized by ${input.authorization?.confirmedBy} at ${input.authorization?.confirmedAt}; normalized scope written to "${normalizedScopePath}"`,
    ),
  );

  // === RUNNING ===
  const targetDomain = (() => {
    try {
      return new URL(targetUrl).hostname;
    } catch {
      return targetUrl;
    }
  })();
  const deferredBootstrap = input.bootstrapSourcesFromTarget?.({ domain: targetDomain, url: targetUrl });
  const deferredLiveRecon = input.liveReconFromTarget?.({ domain: targetDomain, url: targetUrl });

  transitions.push(
    transition('RUNNING', `starting runAdaptiveHunt for "${authorizedScope.programId}" against "${targetUrl}"`),
  );
  const huntResult = await runAdaptiveHunt({
    engagementId: input.engagementId,
    programScopePath: normalizedScopePath,
    url: targetUrl,
    repoPath: input.repoPath,
    workspaceDir: input.workspaceDir,
    maxRounds: input.maxRounds,
    passiveSources: input.passiveSources ?? deferredBootstrap?.passiveSources ?? [],
    activeSources: input.activeSources ?? deferredBootstrap?.activeSources ?? [],
    jsArtifacts: input.jsArtifacts ?? [],
    behavioralFixtures: input.behavioralFixtures ?? [],
    investigationFixtures: input.investigationFixtures ?? new Map(),
    shannonOutputsByAsset: input.shannonOutputsByAsset ?? new Map(),
    ...(input.budget !== undefined ? { budget: input.budget } : {}),
    ...(input.reasoningRouter !== undefined ? { reasoningRouter: input.reasoningRouter } : {}),
    ...(input.liveShannon !== undefined ? { liveShannon: input.liveShannon } : {}),
    ...(input.liveRecon !== undefined
      ? { liveRecon: input.liveRecon }
      : deferredLiveRecon !== undefined
        ? { liveRecon: deferredLiveRecon }
        : {}),
    ...(input.researchTrack !== undefined ? { researchTrack: input.researchTrack } : {}),
  });

  if (!huntResult.ok) {
    transitions.push(transition('FAILED', huntResult.error));
    return ok({
      transitions,
      finalState: 'FAILED',
      discovered,
      ranked,
      selected,
      selectionRationale,
      opportunityReport,
      decision,
      decisionReason,
      droppedAssets: normalized.value.droppedAssets,
      normalizedScopePath,
      targetUrl,
      huntResult: undefined,
    });
  }

  // `checkpoint.status === 'stopped'` means the round/action budget ran out
  // with real work still queued — genuinely resumable (re-running this same
  // engagement id continues it, per `pipeline/adaptive-loop.ts`), so it is
  // surfaced as PAUSED rather than folded into COMPLETED, which is reserved
  // for a queue that is genuinely empty or a policy/budget decision that
  // ended the hunt outright.
  const finalState: LifecycleState = huntResult.value.checkpoint.status === 'stopped' ? 'PAUSED' : 'COMPLETED';
  transitions.push(
    transition(
      finalState,
      `hunt ${finalState === 'PAUSED' ? 'paused' : 'finished'} after ${huntResult.value.checkpoint.round} round(s), checkpoint status "${huntResult.value.checkpoint.status}"`,
    ),
  );
  return ok({
    transitions,
    finalState,
    discovered,
    ranked,
    selected,
    selectionRationale,
    opportunityReport,
    decision,
    decisionReason,
    droppedAssets: normalized.value.droppedAssets,
    normalizedScopePath,
    targetUrl,
    huntResult: huntResult.value,
  });
}
