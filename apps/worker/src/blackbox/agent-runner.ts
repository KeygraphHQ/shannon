// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { runPiPrompt } from '../ai/pi/pi-executor.js';
import { redactSensitive, type SensitiveTelemetryPolicy } from '../ai/sensitive-redaction.js';
import type { AuditSession } from '../audit/index.js';
import { PROMPTS_DIR } from '../paths.js';
import type { ActivityLogger } from '../types/activity-logger.js';
import type { PlannerTask, VerificationResult, WorkerContribution } from '../types/blackbox.js';
import {
  BLACKBOX_AGENTS,
  type BlackboxAgentKind,
  PLANNER_BATCH_SCHEMA,
  type PlannerBatch,
  VERIFICATION_RESULT_SCHEMA,
  WORKER_CONTRIBUTION_SCHEMA,
} from './agents.js';
import { createBlackboxSubmitTool } from './tools.js';

export interface RedactedBlackboxSlice {
  readonly revision: number;
  readonly routes: readonly unknown[];
  readonly identities: readonly unknown[];
  readonly resources: readonly unknown[];
  readonly ownershipLinks: readonly unknown[];
  readonly transitions: readonly unknown[];
  readonly hypotheses: readonly unknown[];
  readonly actionOutcomes: readonly unknown[];
  readonly candidateProofs: readonly unknown[];
  readonly verifierFailureReasons: readonly unknown[];
  readonly failedTasks: readonly {
    readonly taskId: string;
    readonly kind: PlannerTask['kind'];
    readonly objective: string;
    readonly identityLease: PlannerTask['identityLease'];
    readonly hypothesisId: string | null;
  }[];
  readonly evidenceExcerpts?: readonly { readonly evidenceId: string; readonly excerpt: string }[];
}

export interface RedactedIdentityContext {
  readonly name: string;
  readonly role: string;
  readonly loginInstructions: string;
  readonly credentials?: Readonly<Record<string, unknown>>;
  readonly sensitiveValues?: readonly string[];
}

export interface BlackboxAgentRunInput {
  readonly kind: BlackboxAgentKind;
  readonly targetOrigin: string;
  readonly candidateId?: string;
  readonly task: PlannerTask | null;
  readonly snapshot: RedactedBlackboxSlice;
  readonly identity: RedactedIdentityContext | null;
  readonly customTools: readonly ToolDefinition[];
  readonly auditSession: AuditSession;
  readonly logger: ActivityLogger;
  readonly cancellationSignal?: AbortSignal;
}

export interface BlackboxAgentFailure {
  readonly code: 'agent_failed' | 'missing_submission' | 'invalid_submission';
  readonly message: string;
  readonly retryable: boolean;
}

export class BlackboxAgentError extends Error {
  readonly failure: BlackboxAgentFailure;

  constructor(failure: BlackboxAgentFailure) {
    super(failure.message);
    this.name = 'BlackboxAgentError';
    this.failure = structuredClone(failure);
  }
}

export interface BlackboxAgentRunnerOptions {
  readonly syntheticRoot?: string;
  readonly promptDirectory?: string;
  readonly runPiPrompt?: typeof runPiPrompt;
}

const EXPECTED_CALLER_TOOLS: Readonly<Record<BlackboxAgentKind, readonly string[]>> = {
  planner: [],
  'blackbox-recon': ['read_target_history'],
  'blackbox-analysis': [],
  'blackbox-action': ['replay_target_request'],
  'blackbox-verifier': ['replay_verification_request'],
};

function collectSensitiveStrings(value: unknown, result: string[] = []): string[] {
  if (typeof value === 'string') {
    if (value.length > 0) result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSensitiveStrings(entry, result);
    return result;
  }
  if (value && typeof value === 'object') {
    for (const entry of Object.values(value)) collectSensitiveStrings(entry, result);
  }
  return result;
}

function containsReference(value: unknown, references: ReadonlySet<string>): boolean {
  if (typeof value === 'string') return references.has(value);
  if (Array.isArray(value)) return value.some((item) => containsReference(item, references));
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((item) => containsReference(item, references));
}

function linkedRecords(records: readonly unknown[], references: ReadonlySet<string>): unknown[] {
  return records.filter((record) => containsReference(record, references)).map((record) => structuredClone(record));
}

function recordsWithField(records: readonly unknown[], field: string, values: ReadonlySet<string>): unknown[] {
  return records
    .filter((record) => {
      if (record === null || typeof record !== 'object' || Array.isArray(record)) return false;
      const value = (record as Record<string, unknown>)[field];
      return typeof value === 'string' && values.has(value);
    })
    .map((record) => structuredClone(record));
}

function collectReferencedStrings(value: unknown, references: Set<string>): void {
  if (typeof value === 'string') {
    references.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectReferencedStrings(item, references);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const item of Object.values(value)) collectReferencedStrings(item, references);
}

function taskReferences(task: PlannerTask | null): ReadonlySet<string> {
  if (!task) return new Set<string>();
  const references = new Set(
    [...task.evidence.map(({ id }) => id), task.hypothesisId, task.identityLease].filter(
      (value): value is string => typeof value === 'string' && value.length > 0,
    ),
  );
  for (const step of task.replayPlan?.steps ?? []) {
    references.add(step.sourceExchangeId);
    references.add(step.actor);
  }
  if (task.replayPlan?.proofCondition.type === 'persistent_state') {
    references.add(task.replayPlan.proofCondition.verificationSourceExchangeId);
  }
  return references;
}

function projectVerifierInput(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(projectVerifierInput);
  if (!value || typeof value !== 'object') return structuredClone(value);
  const permitted = new Set([
    'candidateId',
    'actionId',
    'exchangeId',
    'routeSignature',
    'method',
    'origin',
    'queryKeys',
    'bodyShape',
    'sequence',
    'steps',
    'stepId',
    'sourceExchangeId',
    'actor',
    'mutations',
    'type',
    'path',
    'name',
    'value',
    'pointer',
    'proofCondition',
    'condition',
    'baselineExchangeId',
    'verificationSourceExchangeId',
    'victimIdentity',
    'attackerIdentity',
    'victimResourceId',
    'freshStateRefs',
    'identity',
    'stateRef',
  ]);
  const projected: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (permitted.has(key)) projected[key] = projectVerifierInput(item);
  }
  return projected;
}

function boundedSlice(
  kind: BlackboxAgentKind,
  task: PlannerTask | null,
  candidateId: string | undefined,
  snapshot: RedactedBlackboxSlice,
): Record<string, unknown> {
  const references = taskReferences(task);
  const routes = snapshot.routes.map((route) => {
    if (!route || typeof route !== 'object' || Array.isArray(route)) return structuredClone(route);
    const record = structuredClone(route) as Record<string, unknown>;
    if (typeof record.responseFingerprint === 'string') {
      record.responseFingerprint = record.responseFingerprint.slice(0, 160);
    }
    return record;
  });
  const evidenceExcerpts = snapshot.evidenceExcerpts?.map(({ evidenceId, excerpt }) => ({
    evidenceId,
    excerpt: excerpt.length <= 1_000 ? excerpt : `${excerpt.slice(0, 997)}...`,
  }));
  const candidateProofs =
    kind === 'blackbox-verifier' && candidateId
      ? recordsWithField(snapshot.candidateProofs, 'candidateId', new Set([candidateId]))
      : [];
  const actionIds = new Set<string>();
  for (const proof of candidateProofs) {
    if (proof && typeof proof === 'object' && !Array.isArray(proof)) {
      const actionId = (proof as Record<string, unknown>).actionId;
      if (typeof actionId === 'string') actionIds.add(actionId);
    }
  }
  const verifierActionOutcomes = recordsWithField(snapshot.actionOutcomes, 'actionId', actionIds);
  const verifierEvidenceReferences = new Set<string>();
  collectReferencedStrings(candidateProofs, verifierEvidenceReferences);
  collectReferencedStrings(verifierActionOutcomes, verifierEvidenceReferences);
  const visibleExcerpts =
    kind === 'planner'
      ? evidenceExcerpts
      : kind === 'blackbox-verifier'
        ? evidenceExcerpts?.filter(({ evidenceId }) => verifierEvidenceReferences.has(evidenceId))
        : evidenceExcerpts?.filter(({ evidenceId }) => references.has(evidenceId));
  const common = {
    revision: snapshot.revision,
    ...(visibleExcerpts ? { evidenceExcerpts: visibleExcerpts } : {}),
  };

  switch (kind) {
    case 'planner':
      return {
        ...common,
        routes,
        identities: structuredClone(snapshot.identities),
        resources: structuredClone(snapshot.resources),
        ownershipLinks: structuredClone(snapshot.ownershipLinks),
        transitions: structuredClone(snapshot.transitions),
        hypotheses: structuredClone(snapshot.hypotheses),
        actionOutcomes: structuredClone(snapshot.actionOutcomes),
        verifierFailureReasons: structuredClone(snapshot.verifierFailureReasons),
        failedTasks: structuredClone(snapshot.failedTasks),
      };
    case 'blackbox-recon':
      return {
        ...common,
        routes: linkedRecords(routes, references),
        resources: linkedRecords(snapshot.resources, references),
        ownershipLinks: linkedRecords(snapshot.ownershipLinks, references),
        transitions: linkedRecords(snapshot.transitions, references),
      };
    case 'blackbox-analysis': {
      const analysisRoutes = linkedRecords(routes, references);
      const analysisResources = linkedRecords(snapshot.resources, references);
      const analysisOwnershipLinks = linkedRecords(snapshot.ownershipLinks, references);
      const analysisTransitions = linkedRecords(snapshot.transitions, references);
      const analysisHypotheses = linkedRecords(snapshot.hypotheses, references);
      const linkedContext = [
        ...analysisRoutes,
        ...analysisResources,
        ...analysisOwnershipLinks,
        ...analysisTransitions,
        ...analysisHypotheses,
      ];
      const identities = snapshot.identities.filter((identity) => {
        if (!identity || typeof identity !== 'object' || Array.isArray(identity)) return false;
        const name = (identity as { readonly name?: unknown }).name;
        return typeof name === 'string' && containsReference(linkedContext, new Set([name]));
      });
      return {
        ...common,
        routes: analysisRoutes,
        identities: structuredClone(identities),
        resources: analysisResources,
        ownershipLinks: analysisOwnershipLinks,
        transitions: analysisTransitions,
        hypotheses: analysisHypotheses,
      };
    }
    case 'blackbox-action':
      return {
        ...common,
        routes: linkedRecords(routes, references),
        resources: linkedRecords(snapshot.resources, references),
        ownershipLinks: linkedRecords(snapshot.ownershipLinks, references),
        hypotheses: linkedRecords(snapshot.hypotheses, references),
      };
    case 'blackbox-verifier':
      return {
        ...common,
        routes: projectVerifierInput(linkedRecords(routes, verifierEvidenceReferences)),
        candidateProofs: projectVerifierInput(candidateProofs),
        actionOutcomes: projectVerifierInput(verifierActionOutcomes),
      };
  }
}

function promptIdentity(identity: RedactedIdentityContext | null): unknown {
  if (!identity) return null;
  return {
    name: identity.name,
    role: identity.role,
    loginInstructions: identity.loginInstructions,
    ...(identity.credentials ? { credentials: structuredClone(identity.credentials) } : {}),
  };
}

function submissionSchema(kind: BlackboxAgentKind): TSchema {
  const submitTool = BLACKBOX_AGENTS[kind].submitTool;
  if (submitTool === 'planner') return PLANNER_BATCH_SCHEMA;
  if (submitTool === 'verification') return VERIFICATION_RESULT_SCHEMA;
  return WORKER_CONTRIBUTION_SCHEMA;
}

function snapshotHypothesisIds(hypotheses: readonly unknown[]): string[] {
  return hypotheses.flatMap((hypothesis) => {
    if (!hypothesis || typeof hypothesis !== 'object' || Array.isArray(hypothesis)) return [];
    const hypothesisId = (hypothesis as { readonly hypothesisId?: unknown }).hypothesisId;
    return typeof hypothesisId === 'string' ? [hypothesisId] : [];
  });
}

function failure(code: BlackboxAgentFailure['code'], message: string, retryable: boolean): BlackboxAgentError {
  return new BlackboxAgentError({ code, message, retryable });
}

function containsSensitiveMaterial(value: unknown, policy: SensitiveTelemetryPolicy): boolean {
  const serialized = JSON.stringify(value);
  if (policy.sensitiveValues.some((candidate) => candidate.length > 0 && serialized.includes(candidate))) return true;
  return JSON.stringify(redactSensitive(value, policy)) !== serialized;
}

export class BlackboxAgentRunner {
  private readonly syntheticRoot: string;
  private readonly promptDirectory: string;
  private readonly executePrompt: typeof runPiPrompt;

  constructor(options: BlackboxAgentRunnerOptions = {}) {
    this.syntheticRoot = path.resolve(options.syntheticRoot ?? '/target');
    this.promptDirectory = path.resolve(options.promptDirectory ?? PROMPTS_DIR);
    this.executePrompt = options.runPiPrompt ?? runPiPrompt;
  }

  async run(input: BlackboxAgentRunInput): Promise<PlannerBatch | WorkerContribution | VerificationResult> {
    input.cancellationSignal?.throwIfAborted();
    const definition = BLACKBOX_AGENTS[input.kind];
    if (!definition) throw failure('invalid_submission', 'Unknown black-box agent kind', false);

    const actualTools = input.customTools.map(({ name }) => name).sort();
    const expectedTools = [...EXPECTED_CALLER_TOOLS[input.kind]].sort();
    if (JSON.stringify(actualTools) !== JSON.stringify(expectedTools)) {
      throw failure('invalid_submission', `Invalid tool surface for ${input.kind}`, false);
    }
    if (input.kind === 'planner' && input.task !== null) {
      throw failure('invalid_submission', 'Planner runs cannot receive a worker task', false);
    }
    if (input.kind === 'blackbox-verifier' && input.task !== null) {
      throw failure('invalid_submission', 'Verifier runs cannot receive planner task prose', false);
    }
    if (input.kind === 'blackbox-verifier' && !input.candidateId) {
      throw failure('invalid_submission', 'Verifier runs require an assigned candidate', false);
    }
    if (['blackbox-recon', 'blackbox-analysis', 'blackbox-action'].includes(input.kind) && !input.task) {
      throw failure('invalid_submission', `${input.kind} requires an assigned task`, false);
    }

    const sensitiveValues = [
      ...(input.identity?.sensitiveValues ?? []),
      ...collectSensitiveStrings(input.identity?.credentials),
    ];
    const telemetryPolicy = {
      sensitiveValues: [...new Set(sensitiveValues)],
      redactAuthenticationSyntax: true as const,
    };
    let prompt: string;
    try {
      const template = await readFile(path.join(this.promptDirectory, definition.promptFile), 'utf8');
      prompt = [
        template.trim(),
        '',
        'Assigned context:',
        JSON.stringify(
          {
            targetOrigin: input.targetOrigin,
            ...(input.kind === 'blackbox-verifier' ? { candidateId: input.candidateId } : {}),
            task: input.task,
            snapshot: boundedSlice(input.kind, input.task, input.candidateId, input.snapshot),
            identity: promptIdentity(input.identity),
          },
          null,
          2,
        ),
      ].join('\n');
      const auditPrompt = redactSensitive(prompt, telemetryPolicy);
      await input.auditSession.startAgent(input.kind, String(auditPrompt));
    } catch {
      input.cancellationSignal?.throwIfAborted();
      throw failure('agent_failed', `${input.kind} agent setup failed`, true);
    }

    const submitTool = createBlackboxSubmitTool(
      input.kind,
      input.kind === 'planner' ? { existingHypothesisIds: snapshotHypothesisIds(input.snapshot.hypotheses) } : {},
    );
    let result: Awaited<ReturnType<typeof runPiPrompt>>;
    try {
      result = await this.executePrompt(
        prompt,
        this.syntheticRoot,
        '',
        `Black-box ${input.kind}`,
        input.kind,
        input.auditSession,
        input.logger,
        [...input.customTools],
        undefined,
        input.cancellationSignal,
        submitTool,
        {
          toolPolicy: definition.policy,
          sensitiveTelemetryPolicy: telemetryPolicy,
          childTasks: false,
        },
      );
      input.cancellationSignal?.throwIfAborted();
    } catch {
      input.cancellationSignal?.throwIfAborted();
      throw failure('agent_failed', `${input.kind} agent failed`, true);
    }

    if (!result.success) {
      throw failure('agent_failed', `${input.kind} agent failed`, result.retryable ?? true);
    }
    const submitted = submitTool.getCaptured() ?? result.structuredOutput;
    if (submitted === undefined) {
      throw failure('missing_submission', `${input.kind} did not submit a structured result`, true);
    }
    const schema = submissionSchema(input.kind);
    if (!Value.Check(schema, submitted)) {
      throw failure('invalid_submission', `${input.kind} submitted an invalid result`, true);
    }
    if (containsSensitiveMaterial(submitted, telemetryPolicy)) {
      throw failure('invalid_submission', `${input.kind} submitted credential material`, false);
    }
    if (submitTool.getCallCount() !== 1) {
      throw failure(
        submitTool.getCallCount() === 0 ? 'missing_submission' : 'invalid_submission',
        `${input.kind} must submit exactly once`,
        true,
      );
    }
    return Value.Clean(schema, structuredClone(submitted)) as PlannerBatch | WorkerContribution | VerificationResult;
  }
}
