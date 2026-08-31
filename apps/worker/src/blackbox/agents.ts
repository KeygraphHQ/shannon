// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { type TSchema, Type } from 'typebox';
import type { PiToolPolicy } from '../ai/pi/pi-executor.js';
import type {
  BlackboxTaskKind,
  BlackboxWorkerRole,
  EvidenceRef,
  PlannerTask,
  VerificationResult,
  WorkerContribution,
} from '../types/blackbox.js';

/** The optional pi tool policy used by black-box roles. */
export type { PiToolPolicy } from '../ai/pi/pi-executor.js';

export type BlackboxAgentKind = 'planner' | BlackboxWorkerRole;

export interface BlackboxAgentDefinition {
  readonly kind: BlackboxAgentKind;
  readonly promptFile: string;
  readonly policy: PiToolPolicy;
  readonly submitTool: 'planner' | 'contribution' | 'verification';
}

const NO_SHARED_TOOLS = {
  includeTask: false,
  includeTodo: false,
  includeGlob: false,
} as const;

const PLANNER_POLICY: PiToolPolicy = {
  builtinTools: [],
  ...NO_SHARED_TOOLS,
  includeBrowserSkill: false,
};

const BROWSER_BASH_POLICY: PiToolPolicy = {
  builtinTools: ['bash'],
  ...NO_SHARED_TOOLS,
  includeBrowserSkill: true,
};

const ANALYSIS_POLICY: PiToolPolicy = {
  builtinTools: [],
  ...NO_SHARED_TOOLS,
  includeBrowserSkill: false,
};

export const BLACKBOX_AGENTS: Readonly<Record<BlackboxAgentKind, BlackboxAgentDefinition>> = {
  planner: {
    kind: 'planner',
    promptFile: 'blackbox-planner.txt',
    policy: PLANNER_POLICY,
    submitTool: 'planner',
  },
  'blackbox-recon': {
    kind: 'blackbox-recon',
    promptFile: 'blackbox-recon.txt',
    policy: BROWSER_BASH_POLICY,
    submitTool: 'contribution',
  },
  'blackbox-analysis': {
    kind: 'blackbox-analysis',
    promptFile: 'blackbox-analysis.txt',
    policy: ANALYSIS_POLICY,
    submitTool: 'contribution',
  },
  'blackbox-action': {
    kind: 'blackbox-action',
    promptFile: 'blackbox-action.txt',
    policy: BROWSER_BASH_POLICY,
    submitTool: 'contribution',
  },
  'blackbox-verifier': {
    kind: 'blackbox-verifier',
    promptFile: 'blackbox-verifier.txt',
    policy: BROWSER_BASH_POLICY,
    submitTool: 'verification',
  },
};

const SafeIdentifierSchema = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$',
});

const EvidenceRefSchema = Type.Object(
  {
    id: SafeIdentifierSchema,
    kind: Type.Union([
      Type.Literal('exchange'),
      Type.Literal('resource'),
      Type.Literal('transition'),
      Type.Literal('action'),
      Type.Literal('proof'),
    ]),
  },
  { additionalProperties: false },
);

const IdentityLeaseSchema = Type.Union([SafeIdentifierSchema, Type.Literal('anonymous'), Type.Null()]);

const ProvenanceSchema = Type.Object(
  {
    actor: Type.Union([
      Type.Literal('blackbox-recon'),
      Type.Literal('blackbox-analysis'),
      Type.Literal('blackbox-action'),
      Type.Literal('blackbox-verifier'),
      Type.Literal('orchestrator'),
    ]),
    taskId: SafeIdentifierSchema,
    baseRevision: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const NormalizedExchangeSchema = Type.Object(
  {
    exchangeId: SafeIdentifierSchema,
    routeSignature: Type.String({ minLength: 1 }),
    identity: Type.Union([SafeIdentifierSchema, Type.Literal('anonymous')]),
    captureSequence: Type.Integer({ minimum: 0 }),
    method: Type.String({ minLength: 1 }),
    origin: Type.String({ minLength: 1 }),
    path: Type.String({ minLength: 1 }),
    queryKeys: Type.Array(Type.String()),
    bodyShape: Type.String(),
    requestContentType: Type.Union([Type.String(), Type.Null()]),
    responseStatus: Type.Union([Type.Literal(0), Type.Integer({ minimum: 100, maximum: 599 })]),
    responseContentType: Type.Union([Type.String(), Type.Null()]),
    responseFingerprint: Type.String(),
    candidateObjectReferences: Type.Array(Type.String()),
    rawRecordRef: Type.String({ minLength: 1 }),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

const ResourceSchema = Type.Object(
  {
    resourceId: SafeIdentifierSchema,
    resourceType: Type.String({ minLength: 1 }),
    objectReferences: Type.Array(Type.String()),
    ownerIdentity: Type.Union([SafeIdentifierSchema, Type.Null()]),
    visibility: Type.Union([
      Type.Literal('private'),
      Type.Literal('role-scoped'),
      Type.Literal('public'),
      Type.Literal('unknown'),
    ]),
    evidence: Type.Array(EvidenceRefSchema),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

const TransitionSchema = Type.Object(
  {
    transitionId: SafeIdentifierSchema,
    identity: Type.Union([SafeIdentifierSchema, Type.Literal('anonymous')]),
    fromState: Type.String(),
    toState: Type.String(),
    triggerExchangeId: SafeIdentifierSchema,
    captureSequence: Type.Integer({ minimum: 0 }),
    resourceId: Type.Union([SafeIdentifierSchema, Type.Null()]),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

const HypothesisSchema = Type.Object(
  {
    hypothesisId: SafeIdentifierSchema,
    kind: Type.Union([Type.Literal('horizontal'), Type.Literal('vertical'), Type.Literal('workflow')]),
    summary: Type.String({ minLength: 1 }),
    preconditions: Type.Array(Type.String()),
    attackerCapability: Type.String({ minLength: 1 }),
    evidence: Type.Array(EvidenceRefSchema),
    priority: Type.Union([Type.Literal('high'), Type.Literal('medium'), Type.Literal('low')]),
    status: Type.Literal('open'),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

function jsonValueSchema(depth: number): TSchema {
  const scalar = [Type.Null(), Type.Boolean(), Type.Number(), Type.String()];
  if (depth === 0) return Type.Union(scalar);
  const child = jsonValueSchema(depth - 1);
  return Type.Union([...scalar, Type.Array(child), Type.Record(Type.String(), child)]);
}

const JsonValueSchema = jsonValueSchema(3);

const ProofConditionSchema = Type.Union([
  Type.Object(
    { type: Type.Literal('body_contains'), marker: Type.String({ minLength: 1 }) },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('json_pointer_equals'),
      pointer: Type.String(),
      value: JsonValueSchema,
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      type: Type.Literal('persistent_state'),
      verificationSourceExchangeId: SafeIdentifierSchema,
      marker: Type.String({ minLength: 1 }),
    },
    { additionalProperties: false },
  ),
]);

const RequestMutationSchema = Type.Union([
  Type.Object({ type: Type.Literal('set_path'), path: Type.String() }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('set_query'), name: Type.String(), value: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object({ type: Type.Literal('remove_query'), name: Type.String() }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('set_header'), name: Type.String(), value: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object({ type: Type.Literal('remove_header'), name: Type.String() }, { additionalProperties: false }),
  Type.Object(
    { type: Type.Literal('set_form_field'), name: Type.String(), value: Type.String() },
    { additionalProperties: false },
  ),
  Type.Object(
    { type: Type.Literal('set_json_pointer'), pointer: Type.String(), value: JsonValueSchema },
    { additionalProperties: false },
  ),
]);

const ReplayStepSchema = Type.Object(
  {
    stepId: SafeIdentifierSchema,
    sourceExchangeId: SafeIdentifierSchema,
    actor: Type.Union([SafeIdentifierSchema, Type.Literal('anonymous')]),
    mutations: Type.Array(RequestMutationSchema, { minItems: 0, maxItems: 8 }),
  },
  { additionalProperties: false },
);

const ReplayPlanSchema = Type.Object(
  {
    steps: Type.Array(ReplayStepSchema, { minItems: 1, maxItems: 4 }),
    proofCondition: ProofConditionSchema,
  },
  { additionalProperties: false },
);

const ReplaySequenceSchema = Type.Object(
  {
    actionId: SafeIdentifierSchema,
    ...ReplayPlanSchema.properties,
  },
  { additionalProperties: false },
);

const ObservationSchema = Type.Object(
  {
    condition: ProofConditionSchema,
    passed: Type.Boolean(),
    baselineExchangeId: Type.Optional(SafeIdentifierSchema),
    baselinePassed: Type.Optional(Type.Boolean()),
    controlExchangeIds: Type.Optional(Type.Array(SafeIdentifierSchema)),
    controlPassed: Type.Optional(Type.Boolean()),
    proofSourceRequestDigest: Type.Optional(Type.String()),
    proofSentRequestDigest: Type.Optional(Type.String()),
    observedMarkerDigest: Type.Union([Type.String(), Type.Null()]),
    observedTransitionId: Type.Union([SafeIdentifierSchema, Type.Null()]),
    verificationExchangeId: Type.Union([SafeIdentifierSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

const ActionResultSchema = Type.Object(
  {
    actionId: SafeIdentifierSchema,
    hypothesisId: SafeIdentifierSchema,
    sequence: ReplaySequenceSchema,
    status: Type.Union([
      Type.Literal('completed'),
      Type.Literal('needs_fresh_actor_request'),
      Type.Literal('delivery_unknown'),
      Type.Literal('failed'),
    ]),
    exchangeIds: Type.Array(SafeIdentifierSchema),
    observation: Type.Union([ObservationSchema, Type.Null()]),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

const CandidateProofSchema = Type.Object(
  {
    candidateId: SafeIdentifierSchema,
    hypothesisId: SafeIdentifierSchema,
    victimIdentity: SafeIdentifierSchema,
    attackerIdentity: Type.Union([SafeIdentifierSchema, Type.Literal('anonymous')]),
    victimResourceId: SafeIdentifierSchema,
    baselineExchangeId: SafeIdentifierSchema,
    actionId: SafeIdentifierSchema,
    verificationSourceExchangeId: SafeIdentifierSchema,
    demonstratedAction: Type.String({ minLength: 1 }),
    concreteEffect: Type.String({ minLength: 1 }),
    affectedParty: Type.Union([Type.Literal('customer'), Type.Literal('application'), Type.Literal('users')]),
    preconditions: Type.Array(Type.String()),
    provenance: ProvenanceSchema,
  },
  { additionalProperties: false },
);

const PlannerTaskSchema = Type.Object(
  {
    taskId: SafeIdentifierSchema,
    kind: Type.Union([Type.Literal('recon'), Type.Literal('analysis'), Type.Literal('action')]),
    objective: Type.String({ minLength: 1 }),
    evidence: Type.Array(EvidenceRefSchema),
    identityLease: IdentityLeaseSchema,
    hypothesisId: Type.Union([SafeIdentifierSchema, Type.Null()]),
    status: Type.Union([
      Type.Literal('pending'),
      Type.Literal('running'),
      Type.Literal('completed'),
      Type.Literal('failed'),
      Type.Literal('rejected'),
    ]),
    replayPlan: Type.Optional(ReplayPlanSchema),
  },
  { additionalProperties: false },
);

/** Planner output. The optional fields retain room for orchestrator metadata without weakening the core shape. */
export interface PlannerBatch {
  readonly baseRevision: number;
  readonly tasks: readonly PlannerTask[];
  readonly stop: boolean;
  readonly evidenceDependencies?: readonly EvidenceRef[];
  readonly identityLease?: string | 'anonymous' | null;
  readonly stopReason?: string | null;
  readonly closeHypothesisIds?: readonly string[];
}

export const PLANNER_BATCH_SCHEMA = Type.Object(
  {
    baseRevision: Type.Integer({ minimum: 0 }),
    tasks: Type.Array(PlannerTaskSchema, { minItems: 0, maxItems: 6 }),
    stop: Type.Boolean(),
    evidenceDependencies: Type.Optional(Type.Array(EvidenceRefSchema)),
    identityLease: Type.Optional(IdentityLeaseSchema),
    stopReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    closeHypothesisIds: Type.Optional(Type.Array(SafeIdentifierSchema, { maxItems: 6 })),
  },
  { additionalProperties: false },
);

/** Worker output. The schema's role union prevents a worker from submitting another role's records. */
export type WorkerContributionInput = WorkerContribution;

export const WORKER_CONTRIBUTION_SCHEMA = Type.Object(
  {
    taskId: SafeIdentifierSchema,
    role: Type.Union([
      Type.Literal('blackbox-recon'),
      Type.Literal('blackbox-analysis'),
      Type.Literal('blackbox-action'),
      Type.Literal('blackbox-verifier'),
    ]),
    baseRevision: Type.Integer({ minimum: 0 }),
    exchanges: Type.Optional(Type.Array(NormalizedExchangeSchema)),
    resources: Type.Optional(Type.Array(ResourceSchema)),
    transitions: Type.Optional(Type.Array(TransitionSchema)),
    hypotheses: Type.Optional(Type.Array(HypothesisSchema)),
    actions: Type.Optional(Type.Array(ActionResultSchema)),
    candidateProofs: Type.Optional(Type.Array(CandidateProofSchema)),
  },
  { additionalProperties: false },
);

const FreshStateRefSchema = Type.Object(
  {
    identity: SafeIdentifierSchema,
    stateRef: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const ProofObservationSchema = Type.Union([
  Type.Null(),
  Type.Object(
    {
      condition: ProofConditionSchema,
      passed: Type.Boolean(),
      baselineExchangeId: Type.Optional(SafeIdentifierSchema),
      baselinePassed: Type.Optional(Type.Boolean()),
      controlExchangeIds: Type.Optional(Type.Array(SafeIdentifierSchema)),
      controlPassed: Type.Optional(Type.Boolean()),
      proofSourceRequestDigest: Type.Optional(Type.String()),
      proofSentRequestDigest: Type.Optional(Type.String()),
      observedMarkerDigest: Type.Union([Type.String(), Type.Null()]),
      observedTransitionId: Type.Union([Type.String(), Type.Null()]),
      verificationExchangeId: Type.Union([Type.String(), Type.Null()]),
    },
    { additionalProperties: false },
  ),
]);

export const VERIFICATION_RESULT_SCHEMA = Type.Object(
  {
    verificationId: SafeIdentifierSchema,
    candidateId: SafeIdentifierSchema,
    verdict: Type.Union([Type.Literal('verified'), Type.Literal('disproved'), Type.Literal('blocked')]),
    freshStateRefs: Type.Array(FreshStateRefSchema),
    replayActionIds: Type.Array(SafeIdentifierSchema),
    replayExchangeIds: Type.Array(SafeIdentifierSchema),
    observation: ProofObservationSchema,
    failureReason: Type.Union([Type.String(), Type.Null()]),
    demonstratedAction: Type.Optional(Type.String({ minLength: 1 })),
    concreteEffect: Type.Optional(Type.String({ minLength: 1 })),
    affectedParty: Type.Optional(
      Type.Union([Type.Literal('customer'), Type.Literal('application'), Type.Literal('users')]),
    ),
  },
  { additionalProperties: false },
);

export type BlackboxVerificationResult = VerificationResult;
export type BlackboxTaskType = BlackboxTaskKind;
