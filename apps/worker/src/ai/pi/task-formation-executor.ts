// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Dedicated read-only Pi executor and live tool policy for Pass 1 task formation. */

import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AgentMessage } from '@earendil-works/pi-agent-core';
import {
  type AgentSession,
  type AgentSessionEvent,
  createAgentSession,
  DefaultResourceLoader,
  defineTool,
  getAgentDir,
  SessionManager,
  SettingsManager,
  type ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { providerFailureSentence } from '../../services/error-handling.js';
import type { ProviderFailure } from '../../types/errors.js';
import { type ModelHost, modelHost } from '../model-host.js';
import type { ModelSelection } from '../models.js';
import type { ValidatingSubmitTool } from '../reconciliation/submit-validation.js';
import { ConfinementError, compileRepositoryGlob, RepositoryConfinement } from '../sast/capella/tools/confinement.js';
import { createCapellaRepositoryTools } from '../sast/capella/tools/repository-tools.js';
import { PI_RETRY_SETTINGS } from './retry-settings.js';

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1_000;
const DEFAULT_MAX_TURNS = 64;
const MAX_TIMEOUT_MS = 30 * 60 * 1_000;
const MAX_TURNS = 128;
const MAX_LIST_RESULTS = 500;
const DEFAULT_LIST_RESULTS = 200;
const MAX_OUTPUT_BYTES = 64 * 1024;
// The live-tool-side counterpart of the source jail's copy-time exclusion (source-jail.ts): even if
// one of these somehow existed in the jailed tree, the read/grep/find/ls/glob tools built below must
// still refuse to serve it. `.git` is deliverables history, `.shannon` is scan internals, `.pi` is
// provider credentials.
const ALWAYS_DENIED_PATHS = Object.freeze(['.git', '.shannon', '.pi'] as const);
const TRANSIENT_IO_CODES = new Set([
  'EAGAIN',
  'EBUSY',
  'ECONNREFUSED',
  'ECONNRESET',
  'EIO',
  'EMFILE',
  'ENFILE',
  'ENOMEM',
  'ENOSPC',
  'EPIPE',
  'EROFS',
  'ETIMEDOUT',
]);

export const TASK_FORMATION_TOOL_NAMES = Object.freeze([
  'read',
  'grep',
  'find',
  'ls',
  'glob',
  'submit_result',
] as const);

// The closed set of failure reasons the integration layer accepts as grounds to fall back to a
// single-agent formation. Only a failure carrying one of these becomes a fallback; any other
// failure propagates. Keep this in sync with the reasons the Temporal caller recognizes.
export const TASK_FORMATION_FALLBACK_REASONS = Object.freeze([
  'retryable_model_failure',
  'missing_accepted_submission',
  'model_stage_timeout',
] as const);

export type TaskFormationFallbackReason = (typeof TASK_FORMATION_FALLBACK_REASONS)[number];

export type TaskFormationExecutorFailureKind = 'model' | 'input' | 'confinement' | 'infrastructure';

/** Safe, bounded fields supplied by the activity wrapper for per-attempt executor correlation. */
export interface TaskFormationExecutionContext {
  readonly executionKey?: string;
  readonly attempt?: number;
  readonly stage?: string;
  readonly vulnerabilityClass?: string;
}

export interface TaskFormationUsage {
  readonly costUsd: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export class TaskFormationExecutorError extends Error {
  override readonly name = 'TaskFormationExecutorError';
  readonly code: string;
  readonly retryable: boolean;
  readonly failureKind: TaskFormationExecutorFailureKind;
  readonly fallbackReason: TaskFormationFallbackReason | undefined;
  readonly usage: TaskFormationUsage;
  readonly modelCalls: number;

  constructor(options: {
    code: string;
    message: string;
    retryable: boolean;
    failureKind: TaskFormationExecutorFailureKind;
    fallbackReason?: TaskFormationFallbackReason;
    usage?: TaskFormationUsage;
    modelCalls?: number;
  }) {
    super(options.message);
    this.code = options.code;
    this.retryable = options.retryable;
    this.failureKind = options.failureKind;
    this.fallbackReason = options.fallbackReason;
    this.usage = options.usage ?? zeroUsage();
    this.modelCalls = options.modelCalls ?? 0;
  }
}

export interface TaskFormationExecutorRequest {
  readonly cwd: string;
  readonly systemPrompt: string;
  readonly modelContext: string;
  readonly deniedPaths: readonly string[];
  readonly submitTool: ValidatingSubmitTool;
  readonly signal: AbortSignal;
  readonly timeoutMs?: number;
  readonly maxTurns?: number;
  readonly correlation?: TaskFormationExecutionContext;
}

export interface TaskFormationExecutorResult {
  readonly output: unknown;
  readonly usage: TaskFormationUsage;
  readonly providerId: string;
  readonly modelId: string;
  readonly modelCalls: 1;
  readonly registeredTools: readonly string[];
}

export interface TaskFormationExecutor {
  run(request: TaskFormationExecutorRequest): Promise<TaskFormationExecutorResult>;
}

interface SessionOutcome {
  readonly pendingProviderError: unknown;
  readonly promptError: unknown;
  readonly usage: TaskFormationUsage;
}

interface ToolFactoryOptions {
  readonly cwd: string;
  readonly deniedPaths: readonly string[];
}

function zeroUsage(): TaskFormationUsage {
  return { costUsd: 0, inputTokens: 0, outputTokens: 0 };
}

/** Reject unknown values from Temporal failure details instead of widening semantic fallback. */
export function isTaskFormationFallbackReason(value: unknown): value is TaskFormationFallbackReason {
  return (TASK_FORMATION_FALLBACK_REASONS as readonly unknown[]).includes(value);
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  return typeof error.code === 'string' ? error.code : undefined;
}

function isTransientIoFailure(error: unknown): boolean {
  const code = errorCode(error);
  if (code !== undefined && TRANSIENT_IO_CODES.has(code)) return true;
  if (error instanceof Error && error.cause !== undefined) return isTransientIoFailure(error.cause);
  return false;
}

function safeIdentifier(value: string | undefined): string | undefined {
  if (value === undefined || !/^[A-Za-z0-9._:-]{1,128}$/u.test(value)) return undefined;
  return value;
}

// Emit only bounded, format-checked correlation fields. Prompt text, model context, and source
// content never enter the log line. An unsafe or missing identifier falls back to a synthetic one
// rather than logging the caller's raw value.
function executionLogContext(context: TaskFormationExecutionContext | undefined): Readonly<Record<string, unknown>> {
  const attempt = context?.attempt;
  return Object.freeze({
    executionKey: safeIdentifier(context?.executionKey) ?? randomUUID(),
    attempt: Number.isSafeInteger(attempt) && (attempt ?? 0) > 0 ? attempt : null,
    stage: safeIdentifier(context?.stage) ?? 'task-formation',
    class: safeIdentifier(context?.vulnerabilityClass) ?? 'unknown',
  });
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function sessionUsage(session: AgentSession): TaskFormationUsage {
  const stats = session.getSessionStats();
  return {
    costUsd: finiteNonNegative(stats.cost),
    inputTokens: finiteNonNegative(stats.tokens.input),
    outputTokens: finiteNonNegative(stats.tokens.output),
  };
}

function boundedText(value: string): string {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.byteLength <= MAX_OUTPUT_BYTES) return value;
  return bytes.subarray(0, MAX_OUTPUT_BYTES).toString('utf8');
}

function uniqueDeniedPaths(deniedPaths: readonly string[]): readonly string[] {
  return Object.freeze([...new Set([...ALWAYS_DENIED_PATHS, ...deniedPaths])]);
}

// The session must register exactly the allowlisted tools. This is checked against the built tool
// set and again against the live session's registered tools, so an injected or dropped tool fails
// the session closed before the model runs.
function hasExactToolSet(toolNames: readonly string[]): boolean {
  const expected = [...TASK_FORMATION_TOOL_NAMES].sort();
  const actual = [...toolNames].sort();
  return actual.length === expected.length && actual.every((name, index) => name === expected[index]);
}

function createListTool(confinement: RepositoryConfinement): ToolDefinition {
  return defineTool({
    name: 'ls',
    label: 'List source directory',
    description: 'List bounded repository-relative entries without following symlinks.',
    promptSnippet: 'ls: list entries below one source directory',
    promptGuidelines: ['Use a repository-relative directory. Absolute paths and traversal are rejected.'],
    parameters: Type.Object(
      {
        path: Type.Optional(Type.String({ minLength: 1, maxLength: 1_024 })),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_LIST_RESULTS })),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, parameters, signal) {
      const requestedPath = parameters.path ?? '.';
      const budget = confinement.createBudget(signal);
      const searchRoot = await confinement.resolveExisting(requestedPath, true, budget);
      const entries = await confinement.enumerate(requestedPath, signal, budget);
      const names = new Set<string>();
      for (const entry of entries) {
        confinement.checkBudget(budget);
        const relativePath = pathRelative(searchRoot, entry.absolutePath);
        const [first, ...remaining] = relativePath.split('/');
        if (first) names.add(remaining.length > 0 ? `${first}/` : first);
      }

      const limit = parameters.limit ?? DEFAULT_LIST_RESULTS;
      const output = [...names].sort().slice(0, limit);
      return {
        content: [{ type: 'text' as const, text: boundedText(output.join('\n') || 'No entries found.') }],
        details: { count: output.length, truncated: names.size > output.length },
      };
    },
  });
}

function pathRelative(root: string, candidate: string): string {
  const relativePath = path.relative(root, candidate);
  if (
    !relativePath ||
    relativePath.startsWith(`..${path.sep}`) ||
    relativePath === '..' ||
    path.isAbsolute(relativePath)
  ) {
    throw new TaskFormationExecutorError({
      code: 'TOOL_PATH_RACE',
      message: 'Task-formation source path changed during access.',
      retryable: false,
      failureKind: 'confinement',
    });
  }
  return relativePath.split(path.sep).join('/');
}

function createGlobTool(confinement: RepositoryConfinement): ToolDefinition {
  return defineTool({
    name: 'glob',
    label: 'Glob source files',
    description: 'Match bounded file globs from the source-jail root without following symlinks.',
    promptSnippet: 'glob: match source files from the jail root',
    promptGuidelines: ['Patterns are always rooted in the source jail.'],
    parameters: Type.Object(
      {
        pattern: Type.String({ minLength: 1, maxLength: 256 }),
        limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_LIST_RESULTS })),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, parameters, signal) {
      const budget = confinement.createBudget(signal);
      const matcher = compileRepositoryGlob(parameters.pattern);
      const entries = await confinement.enumerate('.', signal, budget);
      const limit = parameters.limit ?? DEFAULT_LIST_RESULTS;
      const matches: string[] = [];
      let truncated = false;
      for (const entry of entries) {
        confinement.checkBudget(budget);
        if (!matcher.test(entry.path)) continue;
        if (matches.length >= limit) {
          truncated = true;
          break;
        }
        matches.push(entry.path);
      }
      return {
        content: [{ type: 'text' as const, text: boundedText(matches.join('\n') || 'No files found.') }],
        details: { count: matches.length, truncated },
      };
    },
  });
}

/** Create the five code-owned source tools that share one canonical jail policy. */
export async function createTaskFormationSourceTools(options: ToolFactoryOptions): Promise<readonly ToolDefinition[]> {
  const deniedPaths = uniqueDeniedPaths(options.deniedPaths);
  const capellaTools = await createCapellaRepositoryTools({
    repositoryRoot: options.cwd,
    deniedPaths,
  });
  const confinement = await RepositoryConfinement.create({
    repositoryRoot: options.cwd,
    deniedPaths,
  });
  const byName = new Map(capellaTools.map((tool) => [tool.name, tool]));
  const tools = [
    byName.get('read'),
    byName.get('grep'),
    byName.get('find'),
    createListTool(confinement),
    createGlobTool(confinement),
  ];
  if (tools.some((tool) => tool === undefined)) {
    throw new TaskFormationExecutorError({
      code: 'TOOL_FACTORY_MISMATCH',
      message: 'Task-formation source tool factory returned an incomplete set.',
      retryable: false,
      failureKind: 'confinement',
    });
  }
  return Object.freeze(tools as ToolDefinition[]);
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('Task formation was cancelled.', 'AbortError');
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(cancellationError(signal));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(cancellationError(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
  });
}

function validateRequest(request: TaskFormationExecutorRequest): { timeoutMs: number; maxTurns: number } {
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxTurns = request.maxTurns ?? DEFAULT_MAX_TURNS;
  if (!request.cwd || !request.systemPrompt || !request.modelContext) {
    throw new TaskFormationExecutorError({
      code: 'INVALID_REQUEST',
      message: 'Task-formation executor input is incomplete.',
      retryable: false,
      failureKind: 'input',
    });
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new TaskFormationExecutorError({
      code: 'INVALID_TIMEOUT',
      message: `Task-formation timeout must be a positive integer no greater than ${MAX_TIMEOUT_MS} milliseconds.`,
      retryable: false,
      failureKind: 'input',
    });
  }
  if (!Number.isInteger(maxTurns) || maxTurns < 1 || maxTurns > MAX_TURNS) {
    throw new TaskFormationExecutorError({
      code: 'INVALID_TURN_LIMIT',
      message: 'Task-formation turn limit is outside its bounded range.',
      retryable: false,
      failureKind: 'input',
    });
  }
  return { timeoutMs, maxTurns };
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function classifyModelFailure(host: ModelHost, error: unknown): ProviderFailure {
  if (isAbortLike(error)) {
    return {
      type: 'AgentExecutionError',
      category: 'transport',
      retryable: true,
      message: 'The provider request ended before task formation completed.',
    };
  }
  return host.classify(error);
}

function executorLog(level: 'info' | 'warn', fields: Readonly<Record<string, unknown>>): void {
  console[level](JSON.stringify({ component: 'task-formation-executor', ...fields }));
}

class StandaloneTaskFormationExecutor implements TaskFormationExecutor {
  private readonly host: ModelHost;

  constructor(host: ModelHost) {
    this.host = host;
  }

  async run(request: TaskFormationExecutorRequest): Promise<TaskFormationExecutorResult> {
    const logContext = executionLogContext(request.correlation);
    let timeoutMs: number;
    let maxTurns: number;
    try {
      ({ timeoutMs, maxTurns } = validateRequest(request));
    } catch (error) {
      const failure = this.normalizeFailure(error);
      executorLog('warn', {
        ...logContext,
        event: 'finished',
        outcome: 'failed',
        code: failure.code,
        failureKind: failure.failureKind,
        retryable: failure.retryable,
      });
      throw failure;
    }
    const controller = new AbortController();
    let termination: 'cancellation' | 'timeout' | 'turn-limit' | undefined;
    let session: AgentSession | undefined;
    let unsubscribe: (() => void) | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let requestStarted = false;
    let turnCount = 0;

    const terminate = (reason: 'cancellation' | 'timeout' | 'turn-limit'): void => {
      if (termination !== undefined) return;
      termination = reason;
      controller.abort(new DOMException(`Task-formation session ${reason}.`, 'AbortError'));
      void session?.abort().catch(() => undefined);
    };
    const onCancellation = (): void => terminate('cancellation');

    if (request.signal.aborted) {
      executorLog('info', { ...logContext, event: 'finished', outcome: 'cancelled' });
      throw cancellationError(request.signal);
    }
    request.signal.addEventListener('abort', onCancellation, { once: true });
    timeout = setTimeout(() => terminate('timeout'), timeoutMs);

    try {
      let selection: ModelSelection;
      try {
        selection = await raceWithAbort(this.host.resolve('medium'), controller.signal);
      } catch (error) {
        if (termination === 'cancellation') throw cancellationError(request.signal);
        if (termination === 'timeout') throw this.timeoutError(zeroUsage(), 0);
        const failure = classifyModelFailure(this.host, error);
        throw new TaskFormationExecutorError({
          code: 'MODEL_SELECTION_FAILURE',
          message: providerFailureSentence(failure),
          retryable: failure.retryable,
          failureKind: 'model',
          ...(failure.retryable && { fallbackReason: 'retryable_model_failure' }),
        });
      }

      const sourceTools = await raceWithAbort(
        createTaskFormationSourceTools({ cwd: request.cwd, deniedPaths: request.deniedPaths }),
        controller.signal,
      );
      const customTools = [...sourceTools, request.submitTool.tool];
      const toolNames = customTools.map((tool) => tool.name);
      if (!hasExactToolSet(toolNames)) {
        throw new TaskFormationExecutorError({
          code: 'TOOL_POLICY_MISMATCH',
          message: 'Task-formation source tool policy does not match the exact allowlist.',
          retryable: false,
          failureKind: 'confinement',
        });
      }

      const agentDir = getAgentDir();
      const settingsManager = SettingsManager.inMemory({
        retry: PI_RETRY_SETTINGS,
        compaction: { enabled: true },
      });
      const resourceLoader = new DefaultResourceLoader({
        cwd: request.cwd,
        agentDir,
        settingsManager,
        systemPrompt: `${request.systemPrompt}${request.submitTool.directive ?? ''}`,
        appendSystemPrompt: [],
        noExtensions: true,
        noSkills: true,
        noPromptTemplates: true,
        noThemes: true,
        noContextFiles: true,
      });
      await raceWithAbort(resourceLoader.reload(), controller.signal);

      const sessionPromise = createAgentSession({
        cwd: request.cwd,
        agentDir,
        model: selection.model,
        modelRuntime: selection.modelRuntime,
        noTools: 'all',
        tools: toolNames,
        customTools,
        resourceLoader,
        sessionManager: SessionManager.inMemory(),
        settingsManager,
      });
      try {
        ({ session } = await raceWithAbort(sessionPromise, controller.signal));
      } catch (error) {
        void sessionPromise.then(
          async ({ session: lateSession }) => {
            await lateSession.abort().catch(() => undefined);
            lateSession.dispose();
          },
          () => undefined,
        );
        throw error;
      }

      if (controller.signal.aborted) {
        await session.abort().catch(() => undefined);
      } else {
        controller.signal.addEventListener('abort', () => void session?.abort().catch(() => undefined), {
          once: true,
        });
      }

      const registeredTools = session.getAllTools().map((tool) => tool.name);
      if (!hasExactToolSet(registeredTools)) {
        throw new TaskFormationExecutorError({
          code: 'LIVE_TOOL_POLICY_MISMATCH',
          message: 'The live task-formation session registered a tool outside the exact allowlist.',
          retryable: false,
          failureKind: 'confinement',
        });
      }

      executorLog('info', {
        ...logContext,
        event: 'started',
        provider: selection.providerId,
        model: selection.modelId,
        tools: registeredTools,
        resources: { context: false, extensions: false, prompts: false, skills: false },
      });

      let pendingProviderError: unknown;
      unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        if (event.type !== 'turn_end') return;
        turnCount += 1;
        const message: AgentMessage = event.message;
        if (message.role === 'assistant' && message.stopReason === 'error') {
          pendingProviderError ??= message;
        }
        const needsAnotherTurn = message.role === 'assistant' && message.stopReason === 'toolUse';
        if (turnCount >= maxTurns && needsAnotherTurn && request.submitTool.getAcceptedCount() === 0) {
          terminate('turn-limit');
        }
      });

      let promptError: unknown;
      requestStarted = true;
      try {
        await raceWithAbort(session.prompt(request.modelContext, { expandPromptTemplates: false }), controller.signal);
      } catch (error) {
        promptError = error;
      }

      const outcome: SessionOutcome = {
        pendingProviderError,
        promptError,
        usage: sessionUsage(session),
      };
      const output = this.resolveOutcome(request, outcome, termination, requestStarted);
      executorLog('info', { ...logContext, event: 'finished', outcome: 'succeeded', usage: outcome.usage });
      return {
        output,
        usage: outcome.usage,
        providerId: selection.providerId,
        modelId: selection.modelId,
        modelCalls: 1,
        registeredTools: Object.freeze([...registeredTools]),
      };
    } catch (error) {
      // Termination reason wins over whatever error surfaced. A local timeout or an abort aborts the
      // in-flight provider call, so the caught error is usually that induced abort; reporting it as a
      // model failure would erase the real cause. Cancellation keeps its own identity ahead of timeout.
      if (termination === 'cancellation') {
        executorLog('info', { ...logContext, event: 'finished', outcome: 'cancelled' });
        throw cancellationError(request.signal);
      }

      let failure: TaskFormationExecutorError;
      if (termination === 'timeout') {
        const usage = session ? sessionUsage(session) : zeroUsage();
        const modelCalls = requestStarted ? 1 : 0;
        failure = this.timeoutError(usage, modelCalls);
      } else {
        failure = this.normalizeFailure(error);
      }
      executorLog('warn', {
        ...logContext,
        event: 'finished',
        outcome: 'failed',
        code: failure.code,
        failureKind: failure.failureKind,
        retryable: failure.retryable,
        ...(failure.fallbackReason !== undefined && { fallbackReason: failure.fallbackReason }),
        usage: failure.usage,
        modelCalls: failure.modelCalls,
      });
      throw failure;
    } finally {
      if (timeout) clearTimeout(timeout);
      request.signal.removeEventListener('abort', onCancellation);
      unsubscribe?.();
      try {
        session?.dispose();
      } catch {
        executorLog('warn', { ...logContext, event: 'cleanup-failed' });
      }
    }
  }

  private normalizeFailure(error: unknown): TaskFormationExecutorError {
    if (error instanceof TaskFormationExecutorError) return error;
    if (error instanceof ConfinementError) {
      return new TaskFormationExecutorError({
        code: `CONFINEMENT_${error.code}`,
        message: error.message,
        retryable: false,
        failureKind: 'confinement',
      });
    }
    if (isTransientIoFailure(error)) {
      return new TaskFormationExecutorError({
        code: 'SESSION_INFRASTRUCTURE_FAILURE',
        message: 'Task-formation session setup encountered a retryable infrastructure failure.',
        retryable: true,
        failureKind: 'infrastructure',
      });
    }

    const failure = classifyModelFailure(this.host, error);
    if (failure.type === 'ConfigurationError') {
      return new TaskFormationExecutorError({
        code: 'MODEL_CONFIGURATION_FAILURE',
        message: providerFailureSentence(failure),
        retryable: false,
        failureKind: 'input',
      });
    }
    return new TaskFormationExecutorError({
      code: failure.type === 'AuthenticationError' ? 'PROVIDER_AUTHENTICATION_FAILURE' : 'MODEL_SESSION_FAILURE',
      message: providerFailureSentence(failure),
      retryable: failure.retryable,
      failureKind: 'model',
      ...(failure.retryable && { fallbackReason: 'retryable_model_failure' }),
    });
  }

  private timeoutError(usage: TaskFormationUsage, modelCalls: number): TaskFormationExecutorError {
    return new TaskFormationExecutorError({
      code: 'MODEL_STAGE_TIMEOUT',
      message: 'Task formation exceeded its model-stage timeout.',
      retryable: true,
      failureKind: 'model',
      fallbackReason: 'model_stage_timeout',
      usage,
      modelCalls,
    });
  }

  private resolveOutcome(
    request: TaskFormationExecutorRequest,
    outcome: SessionOutcome,
    termination: 'cancellation' | 'timeout' | 'turn-limit' | undefined,
    requestStarted: boolean,
  ): unknown {
    const modelCalls = requestStarted ? 1 : 0;
    if (termination === 'cancellation') throw cancellationError(request.signal);
    if (termination === 'timeout') throw this.timeoutError(outcome.usage, modelCalls);
    if (termination === 'turn-limit') {
      throw new TaskFormationExecutorError({
        code: 'TURN_LIMIT',
        message: 'Task formation exhausted its bounded model turn limit.',
        retryable: true,
        failureKind: 'model',
        fallbackReason: 'retryable_model_failure',
        usage: outcome.usage,
        modelCalls,
      });
    }
    if (request.submitTool.getAcceptedCount() > 1) {
      throw new TaskFormationExecutorError({
        code: 'DUPLICATE_ACCEPTED_SUBMISSION',
        message: 'Task formation accepted more than one submission.',
        retryable: true,
        failureKind: 'model',
        fallbackReason: 'retryable_model_failure',
        usage: outcome.usage,
        modelCalls,
      });
    }
    if (outcome.pendingProviderError !== undefined) {
      const failure = classifyModelFailure(this.host, outcome.pendingProviderError);
      throw new TaskFormationExecutorError({
        code: 'PROVIDER_FAILURE',
        message: providerFailureSentence(failure),
        retryable: failure.retryable,
        failureKind: 'model',
        ...(failure.retryable && { fallbackReason: 'retryable_model_failure' }),
        usage: outcome.usage,
        modelCalls,
      });
    }
    // A prompt error is a real failure unless exactly one submission was already accepted and the
    // error is an abort: the submit tool terminates the session, so that abort is the expected end of
    // a successful run, not a fault.
    if (
      outcome.promptError !== undefined &&
      !(request.submitTool.getAcceptedCount() === 1 && isAbortLike(outcome.promptError))
    ) {
      const failure = classifyModelFailure(this.host, outcome.promptError);
      throw new TaskFormationExecutorError({
        code: 'MODEL_SESSION_FAILURE',
        message: providerFailureSentence(failure),
        retryable: failure.retryable,
        failureKind: 'model',
        ...(failure.retryable && { fallbackReason: 'retryable_model_failure' }),
        usage: outcome.usage,
        modelCalls,
      });
    }

    const output = request.submitTool.getCaptured();
    if (request.submitTool.getAcceptedCount() !== 1 || output === undefined) {
      throw new TaskFormationExecutorError({
        code: 'MISSING_ACCEPTED_SUBMISSION',
        message: 'Task formation ended without one accepted submission.',
        retryable: true,
        failureKind: 'model',
        fallbackReason: 'missing_accepted_submission',
        usage: outcome.usage,
        modelCalls,
      });
    }
    return output;
  }
}

export function createTaskFormationExecutor(host: ModelHost = modelHost): TaskFormationExecutor {
  return new StandaloneTaskFormationExecutor(host);
}

export const taskFormationExecutor: TaskFormationExecutor = createTaskFormationExecutor();
