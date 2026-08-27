// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

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
import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';
import { captureToolInvocation, decideToolOutcome } from '../../audit/trace.js';
import type { ProviderFailureCategory } from '../../types/errors.js';
import { type ModelHost, modelHost } from '../model-host.js';
import type { ModelSelection } from '../models.js';
import type { CapellaAgentErrorName as SharedCapellaAgentErrorName } from '../sast/capella/error-contract.js';
import { CAPELLA_REPOSITORY_TOOL_NAMES, isCapellaRepositoryTool } from '../sast/capella/tools/repository-tools.js';
import type { CapellaUsage } from '../sast/types.js';
import type {
  CapellaAgentExecutor,
  CapellaAgentRequest,
  CapellaAgentResponse,
  CapellaTool,
} from './capella-agent-types.js';
import { PI_RETRY_SETTINGS } from './retry-settings.js';

const MAX_ERROR_LENGTH = 2_000;
const MAX_TOOLS_PER_SESSION = 32;
const MAX_TURNS_PER_SESSION = 1_000;
const MAX_TIMEOUT_MS = 24 * 60 * 60 * 1_000;

const CAPELLA_COLLECTOR_TOOL_NAMES = new Set([
  'report_finding',
  'record_duplicates',
  'record_review_verdict',
  'record_viability',
  'record_static_confirmation',
  'record_calibration',
]);

const FORBIDDEN_TOOL_NAMES = new Set([
  'bash',
  'browser',
  'edit',
  'glob',
  'ls',
  'network',
  'shell',
  'task',
  'todo',
  'todo_write',
  'web_search',
  'write',
]);

export type CapellaAgentErrorName = SharedCapellaAgentErrorName;

export type CapellaAgentErrorCode =
  | 'DUPLICATE_RESULT'
  | 'INVALID_REQUEST'
  | 'INVALID_RESULT'
  | 'INVALID_TOOL_SET'
  | 'MISSING_RESULT'
  | 'PROVIDER_FAILURE'
  | 'SESSION_FAILURE'
  | 'TIMEOUT'
  | 'TURN_LIMIT'
  | 'USAGE_LEDGER_FAILURE';

/** Typed, bounded executor failure suitable for Temporal error-name mapping. */
export class CapellaAgentError extends Error {
  constructor(
    override readonly name: CapellaAgentErrorName,
    readonly code: CapellaAgentErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly usage?: CapellaUsage,
    readonly providerCategory?: ProviderFailureCategory,
  ) {
    super(message.slice(0, MAX_ERROR_LENGTH));
  }
}

type TerminationReason = 'cancellation' | 'timeout' | 'turn-limit';

interface CapturedSubmission {
  readonly tool: ToolDefinition;
  readonly getCount: () => number;
  readonly getInvalid: () => boolean;
  readonly getValue: () => unknown;
}

interface SessionOutcome {
  readonly submissionCount: number;
  readonly submissionValue: unknown;
  readonly invalidSubmission: boolean;
  readonly pendingProviderError: unknown;
  readonly promptError: unknown;
  readonly usage: CapellaUsage;
}

class CapellaCancellationError extends Error {
  override readonly name = 'AbortError';

  constructor(
    readonly usage: CapellaUsage,
    cause: Error,
  ) {
    super('Capella session cancelled.', { cause });
  }
}

function agentError(
  name: CapellaAgentErrorName,
  code: CapellaAgentErrorCode,
  message: string,
  retryable: boolean,
  usage?: CapellaUsage,
  providerCategory?: ProviderFailureCategory,
): CapellaAgentError {
  return new CapellaAgentError(name, code, message, retryable, usage, providerCategory);
}

function assertRequest(request: CapellaAgentRequest<unknown>): void {
  if (!Number.isInteger(request.maxTurns) || request.maxTurns < 1 || request.maxTurns > MAX_TURNS_PER_SESSION) {
    throw agentError('InvalidInputError', 'INVALID_REQUEST', 'Capella maxTurns is outside its bounded range.', false);
  }
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1 || request.timeoutMs > MAX_TIMEOUT_MS) {
    throw agentError('InvalidInputError', 'INVALID_REQUEST', 'Capella timeoutMs is outside its bounded range.', false);
  }
  if (!request.cwd || !request.systemPrompt || !request.userPrompt) {
    throw agentError('InvalidInputError', 'INVALID_REQUEST', 'Capella request is incomplete.', false);
  }
  if (request.tools.length > MAX_TOOLS_PER_SESSION) {
    throw agentError('InvalidInputError', 'INVALID_TOOL_SET', 'Capella tool count exceeds its bounded limit.', false);
  }
}

// Gate the caller's tool set before a session starts. Repository tools must come from the confined
// factory (never a caller-built look-alike), collectors must be known by name, and nothing outside
// that closed set is allowed. `submit_result` is executor-owned, so a caller supplying one alongside
// an output schema is rejected. Any violation fails the request as invalid input, not a model error.
function validateCallerTools(tools: readonly CapellaTool[], hasOutputSchema: boolean): void {
  const names = new Set<string>();
  for (const tool of tools) {
    const name = tool.name;
    if (!name || names.has(name) || FORBIDDEN_TOOL_NAMES.has(name) || name === 'submit_result') {
      throw agentError('InvalidInputError', 'INVALID_TOOL_SET', 'Capella tool set contains a forbidden name.', false);
    }
    names.add(name);

    if ((CAPELLA_REPOSITORY_TOOL_NAMES as readonly string[]).includes(name)) {
      if (!isCapellaRepositoryTool(tool)) {
        throw agentError(
          'InvalidInputError',
          'INVALID_TOOL_SET',
          'Capella repository tools must come from the confined tool factory.',
          false,
        );
      }
      continue;
    }
    if (!CAPELLA_COLLECTOR_TOOL_NAMES.has(name)) {
      throw agentError(
        'InvalidInputError',
        'INVALID_TOOL_SET',
        'Capella tool set contains an unknown collector.',
        false,
      );
    }
  }

  if (hasOutputSchema && names.has('submit_result')) {
    throw agentError('InvalidInputError', 'INVALID_TOOL_SET', 'Capella submit_result is executor-owned.', false);
  }
}

function createCapturedSubmission(schema: TSchema): CapturedSubmission {
  let count = 0;
  let invalid = false;
  let value: unknown;
  return {
    tool: defineTool({
      name: 'submit_result',
      label: 'Submit result',
      description: 'Return the final structured result exactly once.',
      promptSnippet: 'submit_result: return the final structured result exactly once',
      promptGuidelines: ['Call submit_result exactly once as the final action. Do not print JSON as text.'],
      parameters: schema,
      async execute(_toolCallId, parameters) {
        if (!Value.Check(schema, parameters)) {
          invalid = true;
          throw agentError(
            'AgentExecutionError',
            'INVALID_RESULT',
            'Capella submit_result arguments failed schema validation.',
            true,
          );
        }
        count += 1;
        if (count === 1) value = parameters;
        return {
          content: [{ type: 'text' as const, text: 'Result submitted.' }],
          details: undefined,
          terminate: true,
        };
      },
    }),
    getCount: () => count,
    getInvalid: () => invalid,
    getValue: () => value,
  };
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function frozenUsage(session: AgentSession, turns: number): CapellaUsage {
  const stats = session.getSessionStats();
  return Object.freeze({
    inputTokens: finiteNonNegative(stats.tokens.input),
    outputTokens: finiteNonNegative(stats.tokens.output),
    cacheReadTokens: finiteNonNegative(stats.tokens.cacheRead),
    cacheWriteTokens: finiteNonNegative(stats.tokens.cacheWrite),
    costUsd: finiteNonNegative(stats.cost),
    turns: finiteNonNegative(turns),
  });
}

function isAbortLike(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function isRetryableSetupIo(error: unknown): boolean {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  return code === 'EAGAIN' || code === 'EBUSY' || code === 'EIO' || code === 'EMFILE' || code === 'ENFILE';
}

function cancellationError(signal: AbortSignal): Error {
  if (signal.reason instanceof Error) return signal.reason;
  return new DOMException('Capella session cancelled.', 'AbortError');
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

function classifiedModelFailure(
  host: ModelHost,
  error: unknown,
  code: 'PROVIDER_FAILURE' | 'SESSION_FAILURE',
  usage?: CapellaUsage,
  contextWindow?: number,
): CapellaAgentError {
  const failure = host.classify(error, contextWindow);
  if (isAbortLike(error) || isRetryableSetupIo(error)) {
    return agentError(
      'AgentExecutionError',
      code,
      'The model session ended because of a retryable local or provider failure.',
      true,
      usage,
    );
  }
  return agentError(failure.type, code, failure.message, failure.retryable, usage, failure.category);
}

// Map the raw failure to its true cause, with the termination reason taking priority. When the
// session was cancelled or timed out, the caught error is typically the induced abort; surface the
// cancellation or timeout identity instead of misreporting it as a provider or session failure.
function normalizeRunFailure(
  error: unknown,
  termination: TerminationReason | undefined,
  signal: AbortSignal,
  host: ModelHost,
): Error {
  if (termination === 'cancellation') {
    return error instanceof CapellaCancellationError ? error : cancellationError(signal);
  }
  if (error instanceof CapellaAgentError) return error;
  if (termination === 'timeout') {
    return agentError('AgentExecutionError', 'TIMEOUT', 'Capella session timed out.', true);
  }
  if (termination === 'turn-limit') {
    return agentError(
      'AgentExecutionError',
      'TURN_LIMIT',
      'An agentic SAST step ran out of turns before finishing.',
      true,
    );
  }
  return classifiedModelFailure(host, error, 'SESSION_FAILURE');
}

class StandaloneCapellaAgentExecutor implements CapellaAgentExecutor {
  constructor(private readonly host: ModelHost) {}

  async run<T>(request: CapellaAgentRequest<T>): Promise<CapellaAgentResponse<T>> {
    assertRequest(request as CapellaAgentRequest<unknown>);
    validateCallerTools(request.tools, request.outputSchema !== undefined);

    const controller = new AbortController();
    let termination: TerminationReason | undefined;
    let session: AgentSession | undefined;
    let unsubscribe: (() => void) | undefined;
    let timeout: NodeJS.Timeout | undefined;
    let turnCount = 0;
    let operationCount = 0;
    const terminate = (reason: TerminationReason): void => {
      if (termination !== undefined) return;
      termination = reason;
      controller.abort(new DOMException(`Capella session ${reason}.`, 'AbortError'));
      void session?.abort().catch(() => undefined);
    };
    const onCancellation = (): void => terminate('cancellation');

    if (request.signal.aborted) throw cancellationError(request.signal);
    request.signal.addEventListener('abort', onCancellation, { once: true });
    timeout = setTimeout(() => terminate('timeout'), request.timeoutMs);

    try {
      let selection: ModelSelection;
      try {
        selection = await raceWithAbort(this.host.resolve(request.role), controller.signal);
      } catch (error) {
        if (termination === 'cancellation') throw cancellationError(request.signal);
        if (termination === 'timeout') {
          throw agentError('AgentExecutionError', 'TIMEOUT', 'Capella session timed out.', true);
        }
        throw classifiedModelFailure(this.host, error, 'PROVIDER_FAILURE');
      }

      const submit = request.outputSchema ? createCapturedSubmission(request.outputSchema) : undefined;
      const customTools = [...request.tools, ...(submit ? [submit.tool] : [])];
      const toolNames = customTools.map((tool) => tool.name);
      const systemPrompt = submit
        ? `${request.systemPrompt}\n\nYou MUST call submit_result exactly once as your final action. Do not output JSON as text.`
        : request.systemPrompt;
      const agentDir = getAgentDir();
      const settingsManager = SettingsManager.inMemory({
        retry: PI_RETRY_SETTINGS,
        compaction: { enabled: true },
      });

      const resourceLoader = new DefaultResourceLoader({
        cwd: request.cwd,
        agentDir,
        settingsManager,
        systemPrompt,
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
            try {
              lateSession.dispose();
            } catch {
              // The late session is already aborted; cleanup remains best effort.
            }
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

      // Re-check the live session's tools against the intended set. If pi registered anything extra
      // or dropped one, tool isolation broke, so fail closed before the model runs.
      const configuredToolNames = session
        .getAllTools()
        .map((tool) => tool.name)
        .sort();
      if (configuredToolNames.join('\0') !== [...toolNames].sort().join('\0')) {
        throw agentError(
          'ConfigurationError',
          'INVALID_TOOL_SET',
          'An agentic SAST step could not start with the tools it needs.',
          false,
        );
      }

      let invalidSubmission = false;
      let pendingProviderError: unknown;
      // Per-session trace correlation lives here in the executor; the injected sink is a
      // stateless emitter, safe to share across the stage's sessions.
      const traceLog = request.log;
      const pendingTrace = new Map<string, { readonly tool: string; readonly startedAt: number }>();
      unsubscribe = session.subscribe((event: AgentSessionEvent) => {
        if (event.type === 'tool_execution_start') {
          operationCount += 1;
          if (traceLog !== undefined) {
            const invocation = captureToolInvocation(event.toolName, event.args);
            pendingTrace.set(event.toolCallId, { tool: event.toolName, startedAt: Date.now() });
            if (invocation !== undefined) traceLog.toolCall(invocation);
          }
          return;
        }
        if (event.type === 'tool_execution_end') {
          if (event.toolName === 'submit_result' && event.isError) invalidSubmission = true;
          if (traceLog !== undefined) {
            const pending = pendingTrace.get(event.toolCallId);
            if (pending !== undefined) {
              pendingTrace.delete(event.toolCallId);
              const outcome = decideToolOutcome(pending.tool, event.isError, Date.now() - pending.startedAt, undefined);
              if (outcome !== undefined) traceLog.toolOutcome(outcome);
            }
          }
          return;
        }
        if (event.type !== 'turn_end') return;

        turnCount += 1;
        const message: AgentMessage = event.message;
        if (message.role === 'assistant' && message.stopReason === 'error') {
          pendingProviderError ??= message;
        }
        const needsAnotherTurn = message.role === 'assistant' && message.stopReason === 'toolUse';
        if (turnCount >= request.maxTurns && needsAnotherTurn && (submit?.getCount() ?? 0) === 0) {
          terminate('turn-limit');
        }
      });

      const runStartedAt = Date.now();
      let promptError: unknown;
      try {
        await raceWithAbort(session.prompt(request.userPrompt, { expandPromptTemplates: false }), controller.signal);
      } catch (error) {
        promptError = error;
      }

      const outcome: SessionOutcome = {
        submissionCount: submit?.getCount() ?? 0,
        submissionValue: submit?.getValue(),
        invalidSubmission: invalidSubmission || (submit?.getInvalid() ?? false),
        pendingProviderError,
        promptError,
        usage: frozenUsage(session, turnCount),
      };
      const output = this.resolveOutcome<T>(request, outcome, termination, selection.model.contextWindow);

      // Emitted only past resolveOutcome so a failed, cancelled, timed-out, or turn-capped
      // session (all of which throw above) never reports a truthful-looking completion.
      if (traceLog !== undefined) {
        traceLog.sessionComplete(Date.now() - runStartedAt, turnCount, operationCount);
      }

      return { output, usage: outcome.usage };
    } catch (error) {
      const surfacedError = normalizeRunFailure(error, termination, request.signal, this.host);
      throw surfacedError;
    } finally {
      if (timeout) clearTimeout(timeout);
      request.signal.removeEventListener('abort', onCancellation);
      try {
        unsubscribe?.();
      } catch {
        // Subscription cleanup is best effort after the session has ended.
      }
      try {
        session?.dispose();
      } catch {
        // Session cleanup is best effort after abort or completion.
      }
    }
  }

  private resolveOutcome<T>(
    request: CapellaAgentRequest<T>,
    outcome: SessionOutcome,
    termination: TerminationReason | undefined,
    contextWindow?: number,
  ): T {
    if (termination === 'cancellation') {
      throw new CapellaCancellationError(outcome.usage, cancellationError(request.signal));
    }
    if (termination === 'timeout') {
      throw agentError('AgentExecutionError', 'TIMEOUT', 'Capella session timed out.', true, outcome.usage);
    }
    if (termination === 'turn-limit') {
      throw agentError(
        'AgentExecutionError',
        'TURN_LIMIT',
        'An agentic SAST step ran out of turns before finishing.',
        true,
        outcome.usage,
      );
    }
    if (outcome.invalidSubmission && outcome.submissionCount === 0) {
      throw agentError(
        'AgentExecutionError',
        'INVALID_RESULT',
        'Capella submit_result arguments failed schema validation.',
        true,
        outcome.usage,
      );
    }
    if (outcome.submissionCount > 1) {
      throw agentError(
        'AgentExecutionError',
        'DUPLICATE_RESULT',
        'An agentic SAST step returned its result twice.',
        true,
        outcome.usage,
      );
    }
    if (outcome.pendingProviderError !== undefined) {
      const failure = this.host.classify(outcome.pendingProviderError, contextWindow);
      throw agentError(
        failure.type,
        'PROVIDER_FAILURE',
        failure.message,
        failure.retryable,
        outcome.usage,
        failure.category,
      );
    }
    // An abort after exactly one accepted submission is the normal end of a good run: the submit tool
    // terminates the session. Treat it as success; any other prompt error is a real session failure.
    if (outcome.promptError !== undefined && !(outcome.submissionCount === 1 && isAbortLike(outcome.promptError))) {
      throw classifiedModelFailure(this.host, outcome.promptError, 'SESSION_FAILURE', outcome.usage, contextWindow);
    }
    if (request.outputSchema !== undefined) {
      if (outcome.submissionCount !== 1 || outcome.submissionValue === undefined) {
        throw agentError(
          'AgentExecutionError',
          'MISSING_RESULT',
          'Capella session ended without one structured result.',
          true,
          outcome.usage,
        );
      }
      return outcome.submissionValue as T;
    }
    return undefined as T;
  }
}

/** Create a Capella executor over the process-local credential-preserving model host. */
export function createCapellaAgentExecutor(host: ModelHost = modelHost): CapellaAgentExecutor {
  return new StandaloneCapellaAgentExecutor(host);
}

/** Process-local standalone Capella executor. */
export const capellaAgentExecutor: CapellaAgentExecutor = createCapellaAgentExecutor();
