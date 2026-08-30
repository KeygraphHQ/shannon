// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

export type BlackboxWorkerRole = 'blackbox-recon' | 'blackbox-analysis' | 'blackbox-action' | 'blackbox-verifier';

export type BlackboxTaskKind = 'recon' | 'analysis' | 'action';
export type HypothesisStatus =
  | 'open'
  | 'queued'
  | 'tested'
  | 'verified'
  | 'disproved'
  | 'blocked'
  | 'no_demonstrated_impact';
export type BlackboxRunStatus = 'running' | 'complete' | 'incomplete' | 'failed';

export interface EvidenceProvenance {
  readonly actor: BlackboxWorkerRole | 'orchestrator';
  readonly taskId: string;
  readonly baseRevision: number;
}

export interface EvidenceRef {
  readonly id: string;
  readonly kind: 'exchange' | 'resource' | 'transition' | 'action' | 'proof';
}

export interface NormalizedExchange {
  readonly exchangeId: string;
  readonly routeSignature: string;
  readonly identity: string | 'anonymous';
  readonly captureSequence: number;
  readonly method: string;
  readonly origin: string;
  readonly path: string;
  readonly queryKeys: readonly string[];
  readonly bodyShape: string;
  readonly requestContentType: string | null;
  readonly responseStatus: number;
  readonly responseContentType: string | null;
  readonly responseFingerprint: string;
  readonly candidateObjectReferences: readonly string[];
  readonly rawRecordRef: string;
  readonly provenance: EvidenceProvenance;
}

export interface BlackboxHypothesis {
  readonly hypothesisId: string;
  readonly kind: 'horizontal' | 'vertical' | 'workflow';
  readonly summary: string;
  readonly preconditions: readonly string[];
  readonly attackerCapability: string;
  readonly evidence: readonly EvidenceRef[];
  readonly priority: 'high' | 'medium' | 'low';
  readonly status: HypothesisStatus;
  readonly provenance: EvidenceProvenance;
}

export interface BlackboxResource {
  readonly resourceId: string;
  readonly resourceType: string;
  readonly objectReferences: readonly string[];
  readonly ownerIdentity: string | null;
  readonly visibility: 'private' | 'role-scoped' | 'public' | 'unknown';
  readonly evidence: readonly EvidenceRef[];
  readonly provenance: EvidenceProvenance;
}

export interface WorkflowTransition {
  readonly transitionId: string;
  readonly identity: string | 'anonymous';
  readonly fromState: string;
  readonly toState: string;
  readonly triggerExchangeId: string;
  readonly captureSequence: number;
  readonly resourceId: string | null;
  readonly provenance: EvidenceProvenance;
}

export type RequestMutation =
  | { readonly type: 'set_path'; readonly path: string }
  | { readonly type: 'set_query'; readonly name: string; readonly value: string }
  | { readonly type: 'remove_query'; readonly name: string }
  | { readonly type: 'set_header'; readonly name: string; readonly value: string }
  | { readonly type: 'remove_header'; readonly name: string }
  | { readonly type: 'set_form_field'; readonly name: string; readonly value: string }
  | { readonly type: 'set_json_pointer'; readonly pointer: string; readonly value: unknown };

export type ProofCondition =
  | { readonly type: 'body_contains'; readonly marker: string }
  | { readonly type: 'json_pointer_equals'; readonly pointer: string; readonly value: unknown }
  | {
      readonly type: 'persistent_state';
      readonly verificationSourceExchangeId: string;
      readonly marker: string;
    };

export interface ReplayStep {
  readonly stepId: string;
  readonly sourceExchangeId: string;
  readonly actor: string | 'anonymous';
  readonly mutations: readonly RequestMutation[];
}

export interface ReplayPlan {
  readonly steps: readonly ReplayStep[];
  readonly proofCondition: ProofCondition;
}

export interface ReplaySequence extends ReplayPlan {
  readonly actionId: string;
}

export interface DeterministicProofObservation {
  readonly condition: ProofCondition;
  readonly passed: boolean;
  /** Present on host-generated replay evidence. Optional only for pre-upgrade workspaces. */
  readonly baselineExchangeId?: string;
  /** Whether the same proof condition held in the captured baseline response. */
  readonly baselinePassed?: boolean;
  /** Pre-action, cross-identity baseline controls evaluated by the replay host. */
  readonly controlExchangeIds?: readonly string[];
  /** Whether the proof condition also held in any evaluated control. */
  readonly controlPassed?: boolean;
  /** Identity-insensitive digest of the captured proof-source request. */
  readonly proofSourceRequestDigest?: string;
  /** Identity-insensitive digest of the request actually sent for the proof. */
  readonly proofSentRequestDigest?: string;
  readonly observedMarkerDigest: string | null;
  readonly observedTransitionId: string | null;
  readonly verificationExchangeId: string | null;
}

export interface BlackboxActionResult {
  readonly actionId: string;
  readonly hypothesisId: string;
  readonly sequence: ReplaySequence;
  readonly status: 'completed' | 'needs_fresh_actor_request' | 'delivery_unknown' | 'failed';
  readonly exchangeIds: readonly string[];
  readonly observation: DeterministicProofObservation | null;
  readonly provenance: EvidenceProvenance;
}

export interface CandidateProof {
  readonly candidateId: string;
  readonly hypothesisId: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string | 'anonymous';
  readonly victimResourceId: string;
  readonly baselineExchangeId: string;
  readonly actionId: string;
  readonly verificationSourceExchangeId: string;
  readonly demonstratedAction: string;
  readonly concreteEffect: string;
  readonly affectedParty: 'customer' | 'application' | 'users';
  readonly preconditions: readonly string[];
  readonly provenance: EvidenceProvenance;
}

export interface VerifiedBlackboxFinding {
  readonly findingId: string;
  readonly hypothesisId: string;
  readonly victimIdentity: string;
  readonly attackerIdentity: string | 'anonymous';
  readonly baselineExchangeId: string;
  readonly attackExchangeIds: readonly string[];
  readonly verificationExchangeIds: readonly string[];
  readonly replaySequence: ReplaySequence;
  readonly demonstratedAction: string;
  readonly concreteEffect: string;
  readonly affectedParty: 'customer' | 'application' | 'users';
  readonly impactStatement: string;
  readonly preconditions: readonly string[];
  readonly verifierResultId: string;
}

interface VerificationResultBase {
  readonly verificationId: string;
  readonly candidateId: string;
  readonly freshStateRefs: readonly { readonly identity: string; readonly stateRef: string }[];
  readonly replayActionIds: readonly string[];
  readonly replayExchangeIds: readonly string[];
  readonly observation: DeterministicProofObservation | null;
  readonly failureReason: string | null;
}

export type VerificationResult =
  | (VerificationResultBase & {
      readonly verdict: 'verified';
      readonly demonstratedAction: string;
      readonly concreteEffect: string;
      readonly affectedParty: 'customer' | 'application' | 'users';
    })
  | (VerificationResultBase & {
      readonly verdict: 'disproved' | 'blocked';
      readonly demonstratedAction?: never;
      readonly concreteEffect?: never;
      readonly affectedParty?: never;
    });

export interface PlannerTask {
  readonly taskId: string;
  readonly kind: BlackboxTaskKind;
  readonly objective: string;
  readonly evidence: readonly EvidenceRef[];
  readonly identityLease: string | 'anonymous' | null;
  readonly hypothesisId: string | null;
  readonly status: 'pending' | 'running' | 'completed' | 'failed' | 'rejected';
  readonly replayPlan?: ReplayPlan;
}

export interface WorkerContribution {
  readonly taskId: string;
  readonly role: BlackboxWorkerRole;
  readonly baseRevision: number;
  readonly exchanges?: readonly NormalizedExchange[];
  readonly resources?: readonly BlackboxResource[];
  readonly transitions?: readonly WorkflowTransition[];
  readonly hypotheses?: readonly BlackboxHypothesis[];
  readonly actions?: readonly BlackboxActionResult[];
  readonly candidateProofs?: readonly CandidateProof[];
}

export interface TaskRegistrationBatch {
  readonly operationKey: string;
  readonly accepted: readonly PlannerTask[];
  readonly rejected: readonly { readonly task: PlannerTask; readonly reason: string }[];
  readonly closedHypothesisIds?: readonly string[];
  readonly planningWave?: {
    readonly waveNumber: number;
    readonly plannerStop: boolean;
  };
}

export interface ContributionBatch {
  readonly operationKey: string;
  readonly baseRevision: number;
  readonly contributions: readonly WorkerContribution[];
  readonly failures: readonly { readonly taskId: string; readonly reason: string }[];
  readonly identityCaptures?: readonly { readonly identity: string; readonly stateRef: string }[];
}

export interface RedactedBlackboxIdentity {
  readonly name: string;
  readonly role: string;
  readonly authenticated: boolean;
  readonly stateRef: string | null;
}

export interface BlackboardInitialization {
  readonly targetOrigin: string;
  readonly runScope: BlackboxRunScope;
  readonly identities: readonly RedactedBlackboxIdentity[];
  /** Used only to reject accidental persistence. Never written to the document. */
  readonly configuredSecrets: readonly string[];
}

export interface BlackboxRunScope {
  readonly mode: 'blackbox';
  readonly targetOrigin: string;
  readonly identities: readonly string[];
  readonly burpMcpUrl: string;
  readonly burpMcpHostHeader: string;
  readonly burpProxyUrl: string;
}

export interface RejectedPlannerTask {
  readonly task: PlannerTask;
  readonly reason: string;
}

export interface BlackboxOperationReceipt {
  readonly operationKey: string;
  readonly requestDigest: string;
  readonly revision: number;
}

export interface BlackboxPlanningDecision {
  readonly waveNumber: number;
  readonly decision: 'continue' | 'complete' | 'incomplete';
}

export type BlackboxPlanningWave =
  | {
      readonly waveNumber: number;
      readonly phase: 'reserved';
      readonly plannerStop: null;
    }
  | {
      readonly waveNumber: number;
      readonly phase: 'registered';
      readonly plannerStop: boolean;
    };

export interface BlackboxVerificationAttempt {
  readonly verification: VerificationResult;
  readonly exchanges: readonly NormalizedExchange[];
}

export interface BlackboxDocument {
  readonly schemaVersion: 1;
  readonly revision: number;
  readonly targetOrigin: string;
  readonly runScope: BlackboxRunScope;
  readonly identities: readonly RedactedBlackboxIdentity[];
  readonly exchanges: readonly NormalizedExchange[];
  readonly resources: readonly BlackboxResource[];
  readonly transitions: readonly WorkflowTransition[];
  readonly hypotheses: readonly BlackboxHypothesis[];
  readonly actions: readonly BlackboxActionResult[];
  readonly candidateProofs: readonly CandidateProof[];
  readonly verifications: readonly VerificationResult[];
  readonly tasks: readonly PlannerTask[];
  readonly rejectedTasks: readonly RejectedPlannerTask[];
  readonly runStatus: BlackboxRunStatus;
  /** Optional for schema-version-1 workspaces created before durable planning decisions existed. */
  readonly planningDecision?: BlackboxPlanningDecision | null;
  /** Optional for schema-version-1 workspaces created before durable planning-wave reservations existed. */
  readonly planningWave?: BlackboxPlanningWave | null;
  /** Optional for schema-version-1 workspaces created before operation receipts existed. */
  readonly operationReceipts?: readonly BlackboxOperationReceipt[];
}

export type BlackboxSnapshot = BlackboxDocument;

export interface BlackboardStore {
  initialize(input: BlackboardInitialization): Promise<BlackboxSnapshot>;
  read(): Promise<BlackboxSnapshot>;
  merge(contribution: WorkerContribution): Promise<BlackboxSnapshot>;
  reservePlanningWave(baseRevision: number, operationKey: string, waveNumber: number): Promise<BlackboxSnapshot>;
  registerTasks(baseRevision: number, batch: TaskRegistrationBatch): Promise<BlackboxSnapshot>;
  startTasks(baseRevision: number, operationKey: string, taskIds: readonly string[]): Promise<BlackboxSnapshot>;
  recoverInterruptedTasks(baseRevision: number, operationKey: string): Promise<BlackboxSnapshot>;
  refreshIdentityCapture(baseRevision: number, operationKey: string, identity: string): Promise<BlackboxSnapshot>;
  settleTasks(batch: ContributionBatch): Promise<BlackboxSnapshot>;
  recordVerification(
    baseRevision: number,
    operationKey: string,
    attempt: BlackboxVerificationAttempt,
  ): Promise<BlackboxSnapshot>;
  recordPlanningDecision(
    baseRevision: number,
    operationKey: string,
    waveNumber: number,
    decision: BlackboxPlanningDecision['decision'],
  ): Promise<BlackboxSnapshot>;
  setRunStatus(baseRevision: number, operationKey: string, status: BlackboxRunStatus): Promise<BlackboxSnapshot>;
}
