// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type TSchema, Type } from 'typebox';
import { Value } from 'typebox/value';
import type { CapturedSubmitTool } from '../ai/submit-tool.js';
import type { PlannerTask } from '../types/blackbox.js';
import {
  BLACKBOX_AGENTS,
  type BlackboxAgentKind,
  PLANNER_BATCH_SCHEMA,
  type PlannerBatch,
  VERIFICATION_RESULT_SCHEMA,
  WORKER_CONTRIBUTION_SCHEMA,
} from './agents.js';

export interface CapturedBlackboxSubmitTool<T = unknown> extends CapturedSubmitTool {
  readonly getCaptured: () => T | undefined;
  readonly getCallCount: () => number;
}

const textResult = (text: string, details: unknown = undefined) => ({
  content: [{ type: 'text' as const, text }],
  details,
});

function capturedSubmitTool<T>(
  name: string,
  schema: TSchema,
  description: string,
  contributionRole?: BlackboxAgentKind,
): CapturedBlackboxSubmitTool<T> {
  let captured: T | undefined;
  let callCount = 0;
  const tool = defineTool({
    name,
    label: 'Submit structured result',
    description,
    promptSnippet: `${name}: submit one structured result`,
    promptGuidelines: [
      `Call ${name} exactly once as your final action.`,
      'Use only evidence IDs supplied in the prompt.',
    ],
    parameters: Type.Unsafe(schema),
    async execute(_toolCallId, params) {
      if (!Value.Check(schema, params)) throw new Error(`${name} received an invalid structured result`);
      if (name === 'submit_worker_contribution' && contributionRole) {
        validateContribution(contributionRole, params as Record<string, unknown>);
      }
      if (name === 'submit_verification') validateVerification(params as Record<string, unknown>);
      callCount += 1;
      captured = params as T;
      return { ...textResult('Structured result submitted.', params), terminate: true };
    },
  });
  return {
    tool,
    getCaptured: () => captured,
    getCallCount: () => callCount,
    directive: `\n\nYou MUST call ${name} exactly once as your final action to submit the structured result.`,
  };
}

function validateVerification(value: Record<string, unknown>): void {
  const impactFields = ['demonstratedAction', 'concreteEffect', 'affectedParty'] as const;
  if (value.verdict === 'verified') {
    for (const field of impactFields) {
      if (typeof value[field] !== 'string' || value[field].trim().length === 0) {
        throw new Error(`Verified result requires concrete impact field ${field}`);
      }
    }
    if (
      !value.observation ||
      typeof value.observation !== 'object' ||
      (value.observation as { passed?: unknown }).passed !== true ||
      !Array.isArray(value.replayActionIds) ||
      value.replayActionIds.length === 0 ||
      !Array.isArray(value.replayExchangeIds) ||
      value.replayExchangeIds.length === 0 ||
      !Array.isArray(value.freshStateRefs) ||
      value.freshStateRefs.length === 0
    ) {
      throw new Error('Verified result requires a passing fresh-state replay observation');
    }
    return;
  }
  if (impactFields.some((field) => field in value)) {
    throw new Error('Only a verified result may state concrete impact');
  }
}

export function createBlackboxSubmitTool(
  kind: BlackboxAgentKind | 'contribution' | 'verification',
): CapturedBlackboxSubmitTool<PlannerBatch | unknown> {
  switch (kind) {
    case 'planner':
      return capturedSubmitTool<PlannerBatch>(
        'submit_planner_tasks',
        PLANNER_BATCH_SCHEMA,
        'Submit the bounded planner task batch.',
      );
    case 'blackbox-verifier':
    case 'verification':
      return capturedSubmitTool(
        'submit_verification',
        VERIFICATION_RESULT_SCHEMA,
        'Submit the independent verification result.',
      );
    default: {
      return capturedSubmitTool(
        'submit_worker_contribution',
        contributionSchema(kind),
        'Submit one role-permitted worker contribution.',
        kind === 'contribution' ? undefined : kind,
      );
    }
  }
}

function contributionSchema(kind: BlackboxAgentKind | 'contribution'): TSchema {
  switch (kind) {
    case 'blackbox-recon':
      return Type.Omit(WORKER_CONTRIBUTION_SCHEMA, ['hypotheses', 'actions', 'candidateProofs']);
    case 'blackbox-analysis':
      return Type.Omit(WORKER_CONTRIBUTION_SCHEMA, [
        'exchanges',
        'resources',
        'transitions',
        'actions',
        'candidateProofs',
      ]);
    case 'blackbox-action':
      return Type.Omit(WORKER_CONTRIBUTION_SCHEMA, ['exchanges', 'resources', 'transitions', 'hypotheses']);
    default:
      return WORKER_CONTRIBUTION_SCHEMA;
  }
}

function validateContribution(kind: BlackboxAgentKind, value: Record<string, unknown>): void {
  if (typeof value.role !== 'string' || value.role !== kind) {
    throw new Error(`Contribution role is not bound to ${kind}`);
  }
  const permitted: Readonly<Record<string, readonly string[]>> = {
    planner: [],
    'blackbox-recon': ['exchanges', 'resources', 'transitions'],
    'blackbox-analysis': ['hypotheses'],
    'blackbox-action': ['actions', 'candidateProofs'],
    'blackbox-verifier': [],
  };
  const allowed = new Set(permitted[kind]);
  for (const key of ['exchanges', 'resources', 'transitions', 'hypotheses', 'actions', 'candidateProofs']) {
    if (key in value && !allowed.has(key)) {
      throw new Error(`${kind} cannot submit ${key}`);
    }
  }
}

export interface BlackboxToolFactoryOptions {
  readonly role: BlackboxAgentKind;
  readonly task?: PlannerTask | null;
  readonly candidateId?: string;
  readonly readTargetHistory?: () => unknown | Promise<unknown>;
  readonly replayTargetRequest?: () => unknown | Promise<unknown>;
  readonly replayVerificationRequest?: () => unknown | Promise<unknown>;
}

const EMPTY_PARAMS = Type.Object({}, { additionalProperties: false });
const ACTION_PARAMS = Type.Object({ actionId: Type.String({ minLength: 1 }) }, { additionalProperties: false });
const CANDIDATE_PARAMS = Type.Object({ candidateId: Type.String({ minLength: 1 }) }, { additionalProperties: false });

function callbackTool(
  name: string,
  description: string,
  parameters: TSchema,
  callback: (value: Record<string, string>) => unknown | Promise<unknown>,
): ToolDefinition {
  return defineTool({
    name,
    label: name,
    description,
    promptSnippet: `${name}: ${description}`,
    parameters: Type.Unsafe(parameters),
    async execute(_toolCallId, params) {
      const result = await callback(params as Record<string, string>);
      return textResult(
        typeof result === 'string' ? result : JSON.stringify(result ?? { status: 'completed' }),
        result,
      );
    },
  });
}

function boundedReplayTool(
  name: 'replay_target_request' | 'replay_verification_request',
  expectedId: string,
  parameterName: 'actionId' | 'candidateId',
  callback: () => unknown | Promise<unknown>,
): ToolDefinition {
  let calls = 0;
  let retryPermitted = false;
  const parameters = parameterName === 'actionId' ? ACTION_PARAMS : CANDIDATE_PARAMS;
  return callbackTool(
    name,
    `Execute the orchestrator-approved ${parameterName} replay.`,
    parameters,
    async (params) => {
      const supplied = params[parameterName];
      if (supplied !== expectedId) throw new Error(`Replay ${parameterName} is not bound to this assignment`);
      if (calls >= 2 || (calls > 0 && !retryPermitted)) throw new Error(`Only one ${name} retry is allowed`);
      calls += 1;
      const result = await callback();
      retryPermitted = isFreshActorRetry(result);
      return result;
    },
  );
}

function isFreshActorRetry(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { status?: unknown }).status === 'needs_fresh_actor_request'
  );
}

/** Build only the tools permitted to the selected black-box role. */
export function createBlackboxTools(options: BlackboxToolFactoryOptions): ToolDefinition[] {
  const definition = BLACKBOX_AGENTS[options.role];
  if (!definition) throw new Error(`Unknown black-box role ${options.role}`);

  const tools: ToolDefinition[] = [];
  if (options.role === 'blackbox-recon') {
    if (!options.readTargetHistory) throw new Error('blackbox-recon requires a configured history callback');
    tools.push(
      callbackTool(
        'read_target_history',
        'Read the bounded target-origin history slice assigned by the orchestrator.',
        EMPTY_PARAMS,
        options.readTargetHistory,
      ),
    );
  }
  if (options.role === 'blackbox-action') {
    const actionId = options.task?.taskId;
    if (!actionId) throw new Error('blackbox-action requires an assigned task');
    if (!options.replayTargetRequest) throw new Error('blackbox-action requires a configured replay callback');
    tools.push(boundedReplayTool('replay_target_request', actionId, 'actionId', options.replayTargetRequest));
  }
  if (options.role === 'blackbox-verifier') {
    const candidateId = options.candidateId;
    if (!candidateId) throw new Error('blackbox-verifier requires an assigned candidate');
    if (!options.replayVerificationRequest) {
      throw new Error('blackbox-verifier requires a configured replay callback');
    }
    tools.push(
      boundedReplayTool('replay_verification_request', candidateId, 'candidateId', options.replayVerificationRequest),
    );
  }

  tools.push(createBlackboxSubmitTool(options.role).tool);
  return tools;
}
