/**
 * Shared data model for the hunter controller foundation.
 *
 * This module intentionally has zero runtime dependencies: every phase of the
 * pipeline (scope validation, intake, state, recon, world modeling,
 * reasoning, Shannon invocation, ingestion, evidence, findings, dedup,
 * reporting) reads and writes these plain, serializable types so engagement
 * state can be persisted as JSON and inspected by a human at any point.
 */

export type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// === Scope ===

export type ScopeAssetType = 'domain' | 'wildcard-domain' | 'url' | 'repo' | 'ip' | 'cidr';
export type ScopeInstruction = 'in-scope' | 'out-of-scope';
export type ScopeTier = 'critical' | 'standard' | 'low';

export interface ScopeAsset {
  readonly identifier: string;
  readonly type: ScopeAssetType;
  readonly instruction: ScopeInstruction;
  readonly tier: ScopeTier;
  readonly bountyEligible: boolean;
  readonly requiresAuthentication: boolean;
}

export interface ProgramScope {
  readonly programId: string;
  readonly programName: string;
  readonly platform: 'hackerone';
  readonly authorizationConfirmed: boolean;
  readonly assets: readonly ScopeAsset[];
  readonly rulesOfEngagement: readonly string[];
  readonly disallowedTechniques: readonly string[];
  readonly rateLimitPerMinute: number;
}

export interface ValidatedTarget {
  readonly url: string;
  readonly repoPath: string;
  readonly matchedAsset: ScopeAsset;
}

// === Pipeline phases (linear dry-run pipeline only — see WorldModel/HuntCheckpoint for the adaptive loop) ===

export const PIPELINE_PHASES = [
  'scope-validation',
  'recon',
  'attack-surface',
  'application-understanding',
  'observations',
  'hypothesis-generation',
  'hypothesis-prioritization',
  'next-best-investigation',
  'security-testing',
  'validation',
  'evidence',
  'deduplication',
  'report-draft',
  'human-review',
] as const;

export type PipelinePhase = (typeof PIPELINE_PHASES)[number];

// === Engagement ===

export interface Engagement {
  readonly id: string;
  readonly programId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly phase: PipelinePhase;
  readonly targets: readonly ValidatedTarget[];
  readonly observationIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly hypothesisIds: readonly string[];
}

// === Observations (normalized signal, pre-finding, from any recon layer) ===

export type ObservationSource =
  | 'shannon'
  | 'manual'
  | 'fixture'
  | 'passive-recon'
  | 'active-recon'
  | 'js-intelligence'
  | 'behavioral-diff';

export interface Observation {
  readonly id: string;
  readonly engagementId: string;
  readonly source: ObservationSource;
  readonly assetRef: string;
  readonly vulnClass: string;
  readonly title: string;
  readonly description: string;
  readonly severityHint: string;
  readonly confidenceHint: string;
  readonly verified: boolean;
  readonly tags: readonly string[];
  readonly collectedAt: string;
  /** The untransformed source record this observation was derived from (e.g. a Shannon finding), kept for provenance/audit — never re-derived, never trusted more than the normalized fields above. */
  readonly raw?: Readonly<Record<string, unknown>>;
}

// === World model ===
//
// program -> asset -> host -> application -> endpoint -> parameter -> js-artifact
// -> source-location -> auth-state -> role -> resource -> workflow -> integration
//
// A generic typed node/edge graph rather than one class per entity kind, so
// correlation and traversal code does not need to special-case thirteen
// different shapes. Every node carries provenance (who discovered it, when,
// with what confidence) plus scope/verification status, per the requirement
// that discovery never implies authorization.

export type WorldModelNodeKind =
  | 'program'
  | 'asset'
  | 'host'
  | 'application'
  | 'endpoint'
  | 'parameter'
  | 'js-artifact'
  | 'source-location'
  | 'auth-state'
  | 'role'
  | 'resource'
  | 'workflow'
  | 'integration';

export interface Provenance {
  readonly source: string;
  readonly discoveredAt: string;
  readonly confidence: number;
}

export type ScopeStatus = 'in-scope' | 'out-of-scope' | 'unknown';
export type VerificationStatus = 'unverified' | 'verified' | 'contradicted';

export interface WorldModelNode {
  readonly id: string;
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly provenance: readonly Provenance[];
  readonly scopeStatus: ScopeStatus;
  readonly verificationStatus: VerificationStatus;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
}

export type WorldModelRelation =
  | 'belongs-to'
  | 'hosts'
  | 'exposes'
  | 'has-parameter'
  | 'references'
  | 'reachable-from'
  | 'defined-in'
  | 'requires'
  | 'grants'
  | 'part-of';

export interface WorldModelEdge {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly relation: WorldModelRelation;
  readonly discoveredAt: string;
}

export interface WorldModel {
  readonly nodes: readonly WorldModelNode[];
  readonly edges: readonly WorldModelEdge[];
}

// === Recon ===

export interface RawDiscovery {
  readonly source: string;
  readonly kind: WorldModelNodeKind;
  readonly label: string;
  readonly attributes: Readonly<Record<string, unknown>>;
  readonly confidence: number;
  readonly discoveredAt: string;
}

// === Findings ===

export type FindingStatus =
  | 'candidate'
  | 'investigated'
  | 'reproduced'
  | 'independently_validated'
  | 'impact_demonstrated'
  | 'duplicate'
  | 'deduplicated'
  | 'report_ready'
  | 'reported'
  | 'rejected';

export interface FindingTransitionRecord {
  readonly status: FindingStatus;
  readonly at: string;
  readonly reason: string;
}

export interface Finding {
  readonly id: string;
  readonly engagementId: string;
  readonly title: string;
  readonly vulnClass: string;
  readonly assetRef: string;
  readonly status: FindingStatus;
  readonly confidence: number;
  readonly observationIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly transitionLog: readonly FindingTransitionRecord[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

// === Evidence ===

/** A redacted request/response pair captured as evidence. Never carries credential material. */
export interface RedactedHttpExchange {
  readonly method: string;
  readonly url: string;
  readonly statusCode: number | undefined;
  readonly requestHeaders: Readonly<Record<string, string>>;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly bodyExcerpt: string | undefined;
}

/** Evidence that an action moved the application from one observed state to another — the proof engine's structured form of "before/after," for a workflow/authorization transition specifically. */
export interface StateTransitionEvidence {
  readonly beforeState: string;
  readonly afterState: string;
  readonly trigger: string;
}

/** Content-level before/after evidence (e.g. a resource's representation pre- and post-action) — hashed, never the raw content, consistent with the rest of this store. */
export interface BeforeAfterEvidence {
  readonly beforeDescription: string;
  readonly afterDescription: string;
  readonly beforeHash: string | undefined;
  readonly afterHash: string | undefined;
}

/** Two identities' outcomes for the same action/object, captured together as one piece of evidence — the authorization-matrix analogue of before/after. */
export interface AuthorizationComparisonEvidence {
  readonly actorA: string;
  readonly actorB: string;
  readonly outcomeA: string;
  readonly outcomeB: string;
}

export interface EvidenceEntry {
  readonly id: string;
  readonly engagementId: string;
  readonly findingId: string;
  readonly source: ObservationSource;
  readonly collectedAt: string;
  readonly description: string;
  readonly redacted: boolean;
  readonly httpExchange: RedactedHttpExchange | undefined;
  readonly contentHash: string | undefined;
  readonly stateTransition?: StateTransitionEvidence;
  readonly beforeAfter?: BeforeAfterEvidence;
  readonly authorizationComparison?: AuthorizationComparisonEvidence;
}

// === Hypotheses ===

export type HypothesisStatus = 'open' | 'investigating' | 'supported' | 'contradicted' | 'resolved' | 'discarded';
export type ImpactLevel = 'low' | 'medium' | 'high' | 'critical';

/** A structured contradiction — preserved even after a hypothesis is discarded, since a failed hypothesis remains useful as negative evidence (see `reasoning/cascade.ts`). */
export interface HypothesisContradiction {
  readonly observationId: string;
  readonly note: string;
  readonly at: string;
}

export interface Hypothesis {
  readonly id: string;
  readonly engagementId: string;
  readonly statement: string;
  readonly vulnClass: string;
  readonly assetRef: string;
  readonly supportingObservationIds: readonly string[];
  readonly contradictingObservationIds: readonly string[];
  readonly potentialImpact: ImpactLevel;
  readonly confidence: number;
  readonly priorityScore: number;
  readonly informationGain: number;
  readonly requiredEvidence: readonly string[];
  readonly nextInvestigation: string;
  readonly status: HypothesisStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
  /**
   * Everything below is optional and additive — populated only by the
   * research-cascade engine (`reasoning/cascade.ts`) and read defensively
   * (`?? default`) everywhere else, so every pre-existing construction site
   * (deterministic scoring, the Claude/heuristic providers, every existing
   * test) is unaffected.
   */
  readonly assumptions?: readonly string[];
  readonly structuredContradictions?: readonly HypothesisContradiction[];
  readonly parentHypothesisId?: string;
  readonly cascadeDepth?: number;
  /** Other open hypotheses proposed as alternative explanations for the same anomaly/observation cluster — never merged away, so contradiction and convergence both stay visible. */
  readonly competingHypothesisIds?: readonly string[];
  readonly risk?: ToolRisk;
  readonly cost?: number;
}

// === Next-best-action ===

export type ActionKind =
  | 'passive-recon'
  | 'active-recon'
  | 'js-intelligence'
  | 'behavioral-diff'
  | 'shannon'
  | 'manual-review';
export type ActionStatus = 'queued' | 'in-progress' | 'done' | 'skipped' | 'failed';

export interface HuntAction {
  readonly id: string;
  readonly engagementId: string;
  readonly kind: ActionKind;
  readonly targetRef: string;
  readonly hypothesisId: string;
  readonly rationale: string;
  readonly expectedInformationGain: number;
  readonly cost: number;
  readonly status: ActionStatus;
  readonly createdAt: string;
  readonly completedAt: string | undefined;
  readonly resultSummary: string | undefined;
}

// === Reasoning provider ===
//
// A `ReasoningProvider` only ever *proposes* an action or hypothesis set; it
// never executes anything itself. `reasoning/policy.ts` is the deterministic
// layer that decides whether a proposal is actually allowed to run (must
// match a real queued action built from the real world model — never an
// arbitrary/hallucinated target — and must be in scope, authorized,
// available, and within budget) before `ToolRegistry` touches it.

export type ReasoningSource = 'claude' | 'heuristic';

/** A bounded, structured snapshot of what the controller currently believes — the entire input a reasoning provider sees. */
export interface WorldModelSnapshot {
  readonly programId: string;
  readonly nodes: readonly WorldModelNode[];
  readonly edges: readonly WorldModelEdge[];
  readonly hypotheses: readonly Hypothesis[];
  readonly recentObservations: readonly Observation[];
  readonly completedActions: readonly HuntAction[];
  readonly candidateActions: readonly HuntAction[];
  readonly round: number;
}

export interface ActionProposal {
  readonly kind: ActionKind;
  readonly targetRef: string;
  readonly hypothesisId: string;
  readonly whyThisAction: string;
  readonly hypothesisTested: string;
  readonly uncertaintyReduced: string;
  readonly confirmingObservation: string;
  readonly contradictingObservation: string;
  readonly nextStepIfConfirmed: string;
  readonly nextStepIfContradicted: string;
}

export interface HypothesisProposal {
  readonly statement: string;
  readonly vulnClass: string;
  readonly assetRef: string;
  readonly potentialImpact: ImpactLevel;
  readonly confidence: number;
  readonly informationGain: number;
  readonly requiredEvidence: readonly string[];
  readonly nextInvestigation: string;
  readonly supportingObservationIds: readonly string[];
}

export interface ReasoningDecision {
  readonly id: string;
  readonly at: string;
  readonly round: number;
  readonly source: ReasoningSource;
  readonly proposal: ActionProposal | undefined;
  readonly accepted: boolean;
  readonly acceptanceReason: string;
}

// === Budget / safety controls ===

export interface HuntBudget {
  readonly maxRounds: number;
  readonly maxActions: number;
  readonly maxRuntimeMs: number;
  readonly maxShannonExecutions: number;
  readonly perToolMinIntervalMs: number;
}

// === Observability ===

/**
 * The outcome of attempting to run one action's underlying tool, always
 * distinguished explicitly rather than folded into a generic "done"/"failed"
 * pair — see `pipeline/tool-bridge.ts`.
 *
 * - `EXECUTED_WITH_RESULTS` — a real adapter genuinely ran (a live binary,
 *   live HTTP request, or a live Shannon invocation) and produced at least
 *   one discovery or observation.
 * - `EXECUTED_NO_RESULTS` — a real adapter genuinely ran and completed
 *   successfully, but found nothing this time (e.g. a scan/probe that
 *   legitimately matched zero targets). This is still a real execution,
 *   never conflated with `FAILED`: a tool that ran fine and found nothing
 *   is a different fact from a tool that errored, and treating the two the
 *   same would make "no results" look like a broken tool on every clean
 *   scan.
 * - `MOCKED` — a caller-supplied investigation fixture or captured Shannon
 *   output stood in for a real run; never presented as "executed".
 * - `UNAVAILABLE` — a real adapter was selected but reported itself not
 *   capable (binary missing/misidentified, credential absent) before ever
 *   running.
 * - `BLOCKED_BY_SCOPE` — the target failed the pre-execution scope check.
 * - `BLOCKED_BY_POLICY` — budget, rate limit, or another deterministic
 *   policy rule stopped execution before the tool ran.
 * - `FAILED` — the tool genuinely ran and exited with an error.
 */
export type ExecutionStatus =
  | 'EXECUTED_WITH_RESULTS'
  | 'EXECUTED_NO_RESULTS'
  | 'MOCKED'
  | 'UNAVAILABLE'
  | 'BLOCKED_BY_SCOPE'
  | 'BLOCKED_BY_POLICY'
  | 'FAILED';

export interface HuntEvent {
  readonly id: string;
  readonly at: string;
  readonly round: number;
  readonly phase: string;
  readonly action: ActionKind | undefined;
  readonly tool: string | undefined;
  readonly target: string | undefined;
  readonly scopeDecision: ScopeStatus | undefined;
  readonly authorizationDecision: boolean | undefined;
  readonly executionStatus: ExecutionStatus | undefined;
  readonly policyDecision: string | undefined;
  readonly reason: string;
  readonly hypothesisId: string | undefined;
  readonly expectedInformationGain: number | undefined;
  readonly resultSummary: string | undefined;
  readonly newObservationCount: number | undefined;
}

// === Disclosed-report intelligence ===

export type DisclosedReportStatus = 'NO_PROVIDER' | 'PROVIDER_DISABLED' | 'PROVIDER_ERROR' | 'MATCH_FOUND' | 'NO_MATCH';

export interface DisclosedReportResult {
  readonly status: DisclosedReportStatus;
  readonly detail: string;
  readonly matchedReportUrl: string | undefined;
  readonly confidence: number | undefined;
}

// === Tool capability ===

export type ToolRisk = 'none' | 'low' | 'medium' | 'high';
export type ToolScopeRequirement = 'none' | 'passive-only' | 'active-in-scope';

export interface ToolCapability {
  readonly available: boolean;
  readonly reason: string;
  readonly version: string | undefined;
}

// === Recon quality metrics ===

export interface ReconMetrics {
  readonly uniqueAssetCount: number;
  readonly crossSourceCorrelatedAssetCount: number;
  readonly verificationRate: number;
  readonly endpointCoverageCount: number;
  readonly averageHypothesisConfidence: number;
  readonly validatedFindingRate: number;
  readonly evidenceCompletenessRate: number;
  readonly timeToFirstUsefulDiscoveryMs: number | undefined;
}
