// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { mkdir, open, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { ApplicationFailure, CancelledFailure, Context, heartbeat } from '@temporalio/activity';
import type { LogStream } from '../../../../audit/log-stream.js';
import { WorkflowLogger } from '../../../../audit/workflow-logger.js';
import { CapellaAgentError, capellaAgentExecutor } from '../../../pi/capella-agent-executor.js';
import type {
  CapellaAgentExecutor,
  CapellaAgentRequest,
  CapellaAgentResponse,
  CapellaStageTrace,
  CapellaTraceLog,
} from '../../../pi/capella-agent-types.js';
import type { CapellaStage, CapellaUsage } from '../../types.js';
import {
  buildRunInputFingerprint,
  recordRunFailure,
  recordStageUsageAccounting,
  repositoryIdentity,
  stableJson,
} from '../artifacts.js';
import {
  CapellaRetryableError,
  ConfigurationError,
  capellaClassifiedFailureCode,
  capellaFailureCode,
  InvalidInputError,
  SastContractError,
} from '../errors.js';
import { capellaSafeFailureMessage } from '../safe-failures.js';
import { runArchitectureStage, runPlanStage, runThreatModelStage } from '../stages/architecture.js';
import { runExportStage } from '../stages/export.js';
import { runResearchStage } from '../stages/research.js';
import {
  runCalibrateStage,
  runConfirmStage,
  runCriticStage,
  runDedupeStage,
  runReviewStage,
} from '../stages/verdicts.js';
import { createCapellaRepositoryTools } from '../tools/repository-tools.js';
import type { CapellaStageInput, CapellaStageRuntime, CompletedStage, StageUsageSummary } from '../types.js';
import { usageAccountingWarning, ZERO_CAPELLA_USAGE } from '../types.js';
import {
  CAPELLA_ACTIVITY_POLICIES,
  type CapellaActivityFailureDetails,
  type CapellaActivityInput,
  type CapellaActivityResult,
  type CapellaArchitectureActivityResult,
  type CapellaCalibrateActivityResult,
  type CapellaConfirmActivityResult,
  type CapellaCriticActivityResult,
  type CapellaDedupeActivityResult,
  type CapellaExportActivityInput,
  type CapellaExportActivityResult,
  type CapellaFindingActivityInput,
  type CapellaKnowledgeFindingActivityInput,
  type CapellaPlanActivityInput,
  type CapellaPlanActivityResult,
  type CapellaResearchActivityInput,
  type CapellaResearchActivityResult,
  type CapellaReviewActivityResult,
  type CapellaThreatModelActivityInput,
  type CapellaThreatModelActivityResult,
} from './activity-types.js';
import { createCapellaStageTrace } from './stage-trace.js';

// Must stay well under the smallest policy heartbeatTimeoutMs (one minute, for export).
const HEARTBEAT_INTERVAL_MS = 2_000;
const USAGE_RECORD_SCHEMA_VERSION = 1;

/**
 * Scan-local directories that the pentest writes into the target repository while Capella is
 * reading it. Each pattern denies the directory and everything beneath it. These are
 * confinement-only: they never join the user's avoid rules, prompts, export filtering, input
 * fingerprints, or public configuration.
 */
const CONFINEMENT_ONLY_DENIED_PATHS: readonly string[] = Object.freeze(['.shannon/**', '.playwright/**']);

interface UsageRecordIdentity {
  readonly inputFingerprint: string;
  readonly stage: CapellaStage;
  readonly executionKey: string;
  readonly attempt: number;
  readonly workloadId: string;
  readonly sessionNumber: number;
}

interface StartedUsageRecord extends UsageRecordIdentity {
  readonly schemaVersion: 1;
  readonly state: 'started';
}

interface FinalUsageRecord extends UsageRecordIdentity {
  readonly schemaVersion: 1;
  readonly state: 'final';
  readonly usage: CapellaUsage;
  readonly complete: boolean;
}

interface ActivityAttemptRecord {
  readonly schemaVersion: 1;
  readonly state: 'activity-attempt';
  readonly inputFingerprint: string;
  readonly stage: CapellaStage;
  readonly executionKey: string;
  readonly attempt: number;
}

interface ClassifiedActivityError {
  readonly type: string;
  readonly code: string;
  readonly retryable: boolean;
  readonly message: string;
}

type StageRunner<T> = (runtime: CapellaStageRuntime) => Promise<CompletedStage<T>>;

function addUsage(left: CapellaUsage, right: CapellaUsage): CapellaUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    costUsd: left.costUsd + right.costUsd,
    turns: left.turns + right.turns,
  };
}

function isUsage(value: unknown): value is CapellaUsage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const integerFields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'turns'];
  return (
    integerFields.every((field) => Number.isSafeInteger(record[field]) && Number(record[field]) >= 0) &&
    typeof record.costUsd === 'number' &&
    Number.isFinite(record.costUsd) &&
    record.costUsd >= 0
  );
}

function sha256Parts(...parts: readonly string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(part);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function usageRecordDirectory(artifactRoot: string, identity: UsageRecordIdentity): string {
  return resolve(
    artifactRoot,
    '.usage',
    identity.inputFingerprint,
    identity.stage,
    identity.executionKey,
    `attempt-${identity.attempt}`,
  );
}

function usageRecordPath(artifactRoot: string, identity: UsageRecordIdentity, state: 'started' | 'final'): string {
  return resolve(
    usageRecordDirectory(artifactRoot, identity),
    `${identity.workloadId}-${identity.sessionNumber}.${state}.json`,
  );
}

/**
 * Write-once ledger entry. Opening with 'wx' plus a byte comparison on EEXIST makes
 * retries idempotent: an identical replay is adopted silently, while different bytes
 * under the same identity mean two executions claimed one slot, which is terminal.
 * Transient I/O surfaces as retryable so Temporal re-drives the attempt.
 */
async function writeImmutableUsageRecord(
  artifactRoot: string,
  identity: UsageRecordIdentity,
  record: StartedUsageRecord | FinalUsageRecord,
): Promise<void> {
  const directory = usageRecordDirectory(artifactRoot, identity);
  const path = usageRecordPath(artifactRoot, identity, record.state);
  const bytes = stableJson(record);
  await mkdir(directory, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      let existing: string;
      try {
        existing = await readFile(path, 'utf8');
      } catch {
        throw new CapellaRetryableError('Capella usage record could not be verified', 'USAGE_LEDGER_IO');
      }
      if (existing === bytes) return;
      throw new SastContractError('Capella usage record conflicts with immutable bytes', 'USAGE_RECORD_CONFLICT');
    }
    throw new CapellaRetryableError('Capella usage record could not be published', 'USAGE_LEDGER_IO');
  }
}

/** Same write-once discipline as usage records, keyed by activity attempt so retries stay visible in the ledger. */
async function writeActivityAttemptRecord(artifactRoot: string, record: ActivityAttemptRecord): Promise<void> {
  const directory = resolve(artifactRoot, '.usage', record.inputFingerprint, record.stage, 'activity-attempts');
  const path = resolve(directory, `${record.executionKey}-${record.attempt}.activity-attempt.json`);
  const bytes = stableJson(record);
  await mkdir(directory, { recursive: true });
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    handle = await open(path, 'wx', 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
  } catch (error) {
    await handle?.close().catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      let existing: string;
      try {
        existing = await readFile(path, 'utf8');
      } catch {
        throw new CapellaRetryableError('Capella attempt record could not be verified', 'ATTEMPT_LEDGER_IO');
      }
      if (existing === bytes) return;
      throw new SastContractError('Capella attempt record conflicts with immutable bytes', 'ATTEMPT_RECORD_CONFLICT');
    }
    throw new CapellaRetryableError('Capella attempt record could not be published', 'ATTEMPT_LEDGER_IO');
  }
}

function isFinalUsageRecord(value: unknown, inputFingerprint: string, stage: CapellaStage): value is FinalUsageRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record.schemaVersion === USAGE_RECORD_SCHEMA_VERSION &&
    record.state === 'final' &&
    record.inputFingerprint === inputFingerprint &&
    record.stage === stage &&
    typeof record.executionKey === 'string' &&
    /^[0-9a-f]{32}$/.test(record.executionKey) &&
    Number.isSafeInteger(record.attempt) &&
    Number(record.attempt) >= 1 &&
    typeof record.workloadId === 'string' &&
    /^[0-9a-f]{32}$/.test(record.workloadId) &&
    Number.isSafeInteger(record.sessionNumber) &&
    Number(record.sessionNumber) >= 1 &&
    typeof record.complete === 'boolean' &&
    isUsage(record.usage)
  );
}

async function collectFiles(directory: string): Promise<string[]> {
  let entries: Dirent<string>[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const child = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(child)));
    } else if (entry.isFile()) {
      files.push(child);
    }
  }
  return files;
}

/**
 * Fold the stage's ledger into a spend summary. `complete` requires a valid, matching
 * final record for every started one. `retried` reports whether more than one activity
 * attempt touched the stage; callers downgrade usageComplete on any retry because an
 * attempt that died mid-session cannot prove its spend was fully captured.
 */
async function aggregateStageUsage(
  artifactRoot: string,
  inputFingerprint: string,
  stage: CapellaStage,
): Promise<StageUsageSummary> {
  const root = resolve(artifactRoot, '.usage', inputFingerprint, stage);
  const files = await collectFiles(root);
  const started = files.filter((path) => path.endsWith('.started.json'));
  const final = files.filter((path) => path.endsWith('.final.json'));
  const activityAttempts = files.filter((path) => path.endsWith('.activity-attempt.json'));
  let usage = ZERO_CAPELLA_USAGE;
  let complete = started.length === final.length;
  let retried = activityAttempts.length > 1;

  for (const path of activityAttempts.sort()) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        complete = false;
        continue;
      }
      const record = parsed as Record<string, unknown>;
      if (
        record.schemaVersion !== USAGE_RECORD_SCHEMA_VERSION ||
        record.state !== 'activity-attempt' ||
        record.inputFingerprint !== inputFingerprint ||
        record.stage !== stage ||
        typeof record.executionKey !== 'string' ||
        !/^[0-9a-f]{32}$/.test(record.executionKey) ||
        !Number.isSafeInteger(record.attempt) ||
        Number(record.attempt) < 1
      ) {
        complete = false;
        continue;
      }
      retried ||= Number(record.attempt) > 1;
    } catch {
      complete = false;
    }
  }

  for (const path of final.sort()) {
    try {
      const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
      if (!isFinalUsageRecord(parsed, inputFingerprint, stage)) {
        complete = false;
        continue;
      }
      usage = addUsage(usage, parsed.usage);
      complete &&= parsed.complete;
    } catch {
      complete = false;
    }
  }
  return { usage, complete, retried };
}

function usageFromError(error: unknown): CapellaUsage | undefined {
  if (error instanceof CapellaAgentError && error.usage) return error.usage;
  if (!error || typeof error !== 'object' || !('usage' in error)) return undefined;
  const usage = (error as { readonly usage?: unknown }).usage;
  return isUsage(usage) ? usage : undefined;
}

/**
 * Decorates the Capella agent executor with ledger writes on both sides of every
 * session. workloadId identifies the logical model call (stage, role, prompts) across
 * attempts; sessionNumber separates repeats of that call within one activity attempt.
 */
class UsageRecordingExecutor implements CapellaAgentExecutor {
  private readonly sessionCounts = new Map<string, number>();

  constructor(
    private readonly delegate: CapellaAgentExecutor,
    private readonly artifactRoot: string,
    private readonly baseIdentity: Omit<UsageRecordIdentity, 'workloadId' | 'sessionNumber'>,
    private readonly stageTrace?: CapellaStageTrace,
  ) {}

  async run<T>(request: CapellaAgentRequest<T>): Promise<CapellaAgentResponse<T>> {
    // The label is display-only and is deliberately excluded from this hash: two sessions that
    // differ only by label are the same logical workload.
    const workloadId = sha256Parts(request.stage, request.role, request.systemPrompt, request.userPrompt).slice(0, 32);
    const sessionNumber = (this.sessionCounts.get(workloadId) ?? 0) + 1;
    this.sessionCounts.set(workloadId, sessionNumber);
    const identity: UsageRecordIdentity = { ...this.baseIdentity, workloadId, sessionNumber };
    const started: StartedUsageRecord = {
      schemaVersion: USAGE_RECORD_SCHEMA_VERSION,
      state: 'started',
      ...identity,
    };
    await writeImmutableUsageRecord(this.artifactRoot, identity, started);

    const sessionLog: CapellaTraceLog | undefined = this.stageTrace?.forSession(request.sessionLabel);
    let response: CapellaAgentResponse<T> | undefined;
    let caught: unknown;
    try {
      const correlatedRequest = {
        ...request,
        executionKey: this.baseIdentity.executionKey,
        attempt: this.baseIdentity.attempt,
        ...(sessionLog !== undefined && { log: sessionLog }),
      } as CapellaAgentRequest<T>;
      response = await this.delegate.run(correlatedRequest);
    } catch (error) {
      caught = error;
    } finally {
      // Drain this session's trace writes before the run returns, so the activity cannot complete
      // with lines still buffered in memory.
      await this.stageTrace?.drain();
    }

    const errorUsage = usageFromError(caught);
    const final: FinalUsageRecord = {
      schemaVersion: USAGE_RECORD_SCHEMA_VERSION,
      state: 'final',
      ...identity,
      usage: response?.usage ?? errorUsage ?? ZERO_CAPELLA_USAGE,
      complete: response !== undefined || errorUsage !== undefined,
    };
    try {
      await writeImmutableUsageRecord(this.artifactRoot, identity, final);
    } catch (recordError) {
      // A ledger failure after a successful session fails the activity: using the
      // response while its spend went unrecorded would corrupt accounting. When the
      // session itself already failed, the original error stays primary and the
      // ledger gap surfaces later as incomplete usage.
      if (caught === undefined) {
        const terminal = recordError instanceof SastContractError;
        throw new CapellaAgentError(
          terminal ? 'SastContractError' : 'AgentExecutionError',
          'USAGE_LEDGER_FAILURE',
          terminal ? 'Capella usage ledger conflicted with immutable bytes.' : 'Capella usage ledger write failed.',
          !terminal,
          response?.usage,
        );
      }
    }

    if (caught !== undefined) throw caught;
    if (!response) throw new SastContractError('Capella executor returned no response');
    return response;
  }
}

function classifyActivityError(error: unknown): ClassifiedActivityError {
  if (error instanceof CapellaAgentError) {
    return {
      type: error.name,
      code: capellaClassifiedFailureCode(error.code, error.providerCategory),
      retryable: error.retryable,
      message: capellaSafeFailureMessage(error.name),
    };
  }
  // Matched by name so this layer stays independent of the provider harness's error classes.
  if (error instanceof Error && error.name === 'AuthenticationError') {
    return {
      type: 'AuthenticationError',
      code: 'AUTHENTICATION',
      retryable: false,
      message: capellaSafeFailureMessage('AuthenticationError'),
    };
  }
  if (error instanceof CapellaRetryableError) {
    return {
      type: 'AgentExecutionError',
      code: error.code,
      retryable: true,
      message: capellaSafeFailureMessage('AgentExecutionError'),
    };
  }
  // A confinement violation means the model requested a path outside its granted
  // root; retrying the same request cannot succeed.
  if (error instanceof Error && error.name === 'ConfinementError') {
    return {
      type: 'InvalidInputError',
      code: 'CONFINEMENT',
      retryable: false,
      message: capellaSafeFailureMessage('InvalidInputError'),
    };
  }
  if (error instanceof ConfigurationError) {
    return {
      type: 'ConfigurationError',
      code: error.code,
      retryable: false,
      message: capellaSafeFailureMessage('ConfigurationError'),
    };
  }
  if (error instanceof InvalidInputError) {
    return {
      type: 'InvalidInputError',
      code: error.code,
      retryable: false,
      message: capellaSafeFailureMessage('InvalidInputError'),
    };
  }
  if (error instanceof SastContractError) {
    return {
      type: 'SastContractError',
      code: error.code,
      retryable: false,
      message: capellaSafeFailureMessage('SastContractError'),
    };
  }
  if (error instanceof ApplicationFailure) {
    const type = error.type ?? 'AgentExecutionError';
    return {
      type,
      code: capellaFailureCode(error, 'APPLICATION_FAILURE'),
      retryable: !error.nonRetryable,
      message: capellaSafeFailureMessage(type),
    };
  }
  // Anything unrecognized is presumed transient; the policy's attempt cap bounds the retries.
  return {
    type: 'AgentExecutionError',
    code: capellaFailureCode(error, 'ACTIVITY_FAILURE'),
    retryable: true,
    message: capellaSafeFailureMessage('AgentExecutionError'),
  };
}

function cancellationInCauseChain(error: unknown): CancelledFailure | undefined {
  let current = error;
  const seen = new Set<unknown>();
  let depth = 0;
  while (current && typeof current === 'object' && !seen.has(current) && depth < 20) {
    if (current instanceof CancelledFailure) return current;
    seen.add(current);
    current = 'cause' in current ? (current as { readonly cause?: unknown }).cause : undefined;
    depth += 1;
  }
  return undefined;
}

/**
 * Treat an error as cancellation only when Temporal's own signal has fired. Provider
 * timeouts and aborted requests can look like cancellation but must stay ordinary
 * failures, or a timed-out stage would be reported as a cancelled scan.
 */
function activityCancellation(error: unknown, signal: AbortSignal): CancelledFailure | undefined {
  if (!signal.aborted) return undefined;
  return cancellationInCauseChain(signal.reason) ?? cancellationInCauseChain(error);
}

async function stageInputFingerprint(input: CapellaStageInput): Promise<string> {
  return buildRunInputFingerprint(input, await repositoryIdentity(input.repoPath));
}

async function runStageActivity<T, V>(
  stage: CapellaStage,
  input: CapellaStageInput,
  run: StageRunner<T>,
  compact: (value: T) => V,
): Promise<CapellaActivityResult<V>> {
  const context = Context.current();
  const attempt = context.info.attempt;
  const signal = context.cancellationSignal;
  const policy = Object.values(CAPELLA_ACTIVITY_POLICIES).find((candidate) => candidate.stage === stage);
  const maximumAttempts = policy?.retry.maximumAttempts ?? attempt;
  const startedAt = Date.now();
  let heartbeatInterval: NodeJS.Timeout | undefined;
  let inputFingerprint: string | undefined;
  let stageTrace: CapellaStageTrace | undefined;
  let completedStageReturned = false;

  // Hold the stage's per-agent file open for the life of the activity so its concurrent sessions'
  // trace lines ride one reference count. openStageAgentLog never throws (it returns null on
  // failure); everything after it runs inside the try so the finally always releases the lease.
  const stageAgentLog: LogStream | null = await WorkflowLogger.openStageAgentLog(input.workflowLogPath, stage);

  try {
    // Log the start line after opening the lease so the per-agent file header leads.
    await WorkflowLogger.logAgenticSastStart(input.workflowLogPath, stage, attempt, maximumAttempts);

    // A missing policy row heartbeats too; only an explicit null opts a stage out.
    if (policy?.heartbeatTimeoutMs !== null) {
      heartbeat({ stage, attempt, elapsedSeconds: 0 });
      heartbeatInterval = setInterval(() => {
        heartbeat({ stage, attempt, elapsedSeconds: Math.floor((Date.now() - startedAt) / 1_000) });
      }, HEARTBEAT_INTERVAL_MS);
    }

    const initialCancellation = activityCancellation(signal.reason, signal);
    if (initialCancellation) throw initialCancellation;

    inputFingerprint = await stageInputFingerprint(input);
    const fallbackFailure = stage === 'export' ? (input as CapellaExportActivityInput).fallbackFailure : undefined;
    if (fallbackFailure !== undefined) {
      await recordRunFailure(input, inputFingerprint, fallbackFailure, true);
    }
    const executionKey = sha256Parts(context.info.workflowExecution.runId, context.info.activityId).slice(0, 32);
    await writeActivityAttemptRecord(input.artifactRoot, {
      schemaVersion: USAGE_RECORD_SCHEMA_VERSION,
      state: 'activity-attempt',
      inputFingerprint,
      stage,
      executionKey,
      attempt,
    });
    stageTrace = createCapellaStageTrace(input.workflowLogPath, stage);
    const executor = new UsageRecordingExecutor(
      capellaAgentExecutor,
      input.artifactRoot,
      { inputFingerprint, stage, executionKey, attempt },
      stageTrace,
    );
    const repositoryTools = await createCapellaRepositoryTools({
      repositoryRoot: input.repoPath,
      deniedPaths: [...input.codePathAvoids, ...CONFINEMENT_ONLY_DENIED_PATHS],
    });
    const result = await run({ executor, repositoryTools, signal });
    // Stage runners return only after they publish their artifact and run.json completion.
    // Later accounting or logging failures must not overwrite that terminal success, while
    // a failed cache verification before this point must still replace stale success state.
    completedStageReturned = true;
    // A stage that finished while cancellation raced in must not report success;
    // the workflow would record a completed stage on a cancelled scan.
    const completionCancellation = activityCancellation(signal.reason, signal);
    if (completionCancellation) throw completionCancellation;

    const summary = await aggregateStageUsage(input.artifactRoot, inputFingerprint, stage);
    // Heal run.json's per-stage figure, written from the successful attempt alone, to the
    // ledger aggregate that also counts any failed attempts of this stage.
    await recordStageUsageAccounting(input, inputFingerprint, stage, summary);
    const compactValue = compact(result.value);
    const researchValue = stage === 'research' ? (compactValue as Record<string, unknown>) : undefined;
    const dispatchedCount = researchValue?.dispatchedCount;
    const resumedCount = researchValue?.resumedCount;
    const counts =
      Number.isSafeInteger(dispatchedCount) && Number.isSafeInteger(resumedCount)
        ? { dispatchedCount: Number(dispatchedCount), resumedCount: Number(resumedCount) }
        : undefined;
    await WorkflowLogger.logAgenticSastComplete(input.workflowLogPath, stage, result.durationMs, result.reused, counts);
    return {
      status: 'completed',
      durationMs: result.durationMs,
      reused: result.reused,
      artifact: result.artifact,
      value: compactValue,
      attempts: attempt,
      usage: summary.usage,
      usageComplete: !summary.retried && summary.complete,
    };
  } catch (error) {
    const cancellation = activityCancellation(error, signal);
    if (cancellation) {
      await WorkflowLogger.logAgenticSastCancelled(input.workflowLogPath, stage, attempt, maximumAttempts);
      throw cancellation;
    }

    const classified = classifyActivityError(error);
    let summary: StageUsageSummary = { usage: ZERO_CAPELLA_USAGE, complete: true, retried: attempt > 1 };
    if (inputFingerprint) {
      summary = await aggregateStageUsage(input.artifactRoot, inputFingerprint, stage).catch(() => ({
        usage: ZERO_CAPELLA_USAGE,
        complete: false,
        retried: true,
      }));
      const terminal = !classified.retryable || attempt >= maximumAttempts;
      // run.json shows 'failed' only for a terminal failure; a live retry keeps
      // finalState 'running' so an operator does not read an in-flight recovery as a
      // dead scan. Best-effort: failing to record the failure must not replace it.
      const fallbackFailure = stage === 'export' ? (input as CapellaExportActivityInput).fallbackFailure : undefined;
      if (fallbackFailure !== undefined) {
        await recordRunFailure(input, inputFingerprint, fallbackFailure, true, undefined, {
          preserveExistingFailure: true,
          preserveExistingSuccess: completedStageReturned,
        }).catch(() => undefined);
      } else {
        await recordRunFailure(
          input,
          inputFingerprint,
          {
            stage,
            code: classified.code,
            error: classified.message,
            attempt,
            retryable: classified.retryable,
          },
          terminal,
          summary,
          { preserveExistingSuccess: completedStageReturned },
        ).catch(() => undefined);
      }
    }
    const stageComplete = !summary.retried && summary.complete;
    const details: CapellaActivityFailureDetails & { readonly code: string } = {
      stage,
      code: classified.code,
      attempts: attempt,
      usage: summary.usage,
      usageComplete: stageComplete,
      warnings: stageComplete ? [] : [usageAccountingWarning(stage)],
    };
    const retrying = classified.retryable && attempt < maximumAttempts;
    await WorkflowLogger.logAgenticSastFailure(
      input.workflowLogPath,
      stage,
      attempt,
      maximumAttempts,
      classified.code,
      retrying,
    );
    // The message crossing the Temporal boundary comes from the fixed safe-message
    // table; raw provider and filesystem text never enters workflow history.
    throw ApplicationFailure.create({
      message: classified.message,
      type: classified.type,
      nonRetryable: !classified.retryable,
      details: [details],
    });
  } finally {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    // Drain any trailing trace writes, then release the stage's file lease, before the activity
    // returns — so no line is still buffered and the stream closes with the stage.
    if (stageTrace) await stageTrace.drain();
    await WorkflowLogger.closeStageAgentLog(stageAgentLog);
  }
}

export async function capellaArchitecture(input: CapellaActivityInput): Promise<CapellaArchitectureActivityResult> {
  return runStageActivity(
    'architecture',
    input,
    (runtime) => runArchitectureStage(input, runtime),
    (value) => ({
      componentCount: value.componentCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaThreatModel(
  input: CapellaThreatModelActivityInput,
): Promise<CapellaThreatModelActivityResult> {
  return runStageActivity(
    'threat-model',
    input,
    (runtime) => runThreatModelStage(input, runtime),
    (value) => ({
      intent: value.intent,
    }),
  );
}

export async function capellaPlan(input: CapellaPlanActivityInput): Promise<CapellaPlanActivityResult> {
  return runStageActivity(
    'plan',
    input,
    (runtime) => runPlanStage(input, runtime),
    (value) => ({
      investigationCount: value.investigationCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaResearch(input: CapellaResearchActivityInput): Promise<CapellaResearchActivityResult> {
  return runStageActivity(
    'research',
    input,
    (runtime) => runResearchStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      flaggedFileCount: value.flaggedFiles.length,
      dispatchedCount: value.dispatchedCount,
      resumedCount: value.resumedCount,
      coverage: value.coverage,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaDedupe(input: CapellaFindingActivityInput): Promise<CapellaDedupeActivityResult> {
  return runStageActivity(
    'dedupe',
    input,
    (runtime) => runDedupeStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      duplicateCount: value.duplicateCount,
      survivorCount: value.survivorCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaReview(input: CapellaFindingActivityInput): Promise<CapellaReviewActivityResult> {
  return runStageActivity(
    'review',
    input,
    (runtime) => runReviewStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      validCount: value.validCount,
      provisionalCount: value.provisionalCount,
      falsePositiveCount: value.falsePositiveCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaCritic(input: CapellaKnowledgeFindingActivityInput): Promise<CapellaCriticActivityResult> {
  return runStageActivity(
    'critic',
    input,
    (runtime) => runCriticStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      viableCount: value.viableCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaConfirm(input: CapellaFindingActivityInput): Promise<CapellaConfirmActivityResult> {
  return runStageActivity(
    'confirm',
    input,
    (runtime) => runConfirmStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      confirmedCount: value.confirmedCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaCalibrate(
  input: CapellaKnowledgeFindingActivityInput,
): Promise<CapellaCalibrateActivityResult> {
  return runStageActivity(
    'calibrate',
    input,
    (runtime) => runCalibrateStage(input, runtime),
    (value) => ({
      findingCount: value.findings.length,
      calibratedCount: value.calibratedCount,
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}

export async function capellaExport(input: CapellaExportActivityInput): Promise<CapellaExportActivityResult> {
  return runStageActivity(
    'export',
    input,
    async (runtime) => {
      let repositoryLabel: string;
      try {
        repositoryLabel = basename(await realpath(input.repoPath));
      } catch {
        throw new InvalidInputError('Capella repository root does not exist', 'REPOSITORY_UNAVAILABLE');
      }
      const stageInput = { ...input, repositoryLabel };
      return runExportStage(stageInput, runtime.signal);
    },
    (value) => ({
      sarif: value.sarif,
      findingCount: value.findingCount,
      coverage: value.coverage,
      warnings: [...value.warnings],
      ...(value.reduction !== undefined && { reduction: value.reduction }),
    }),
  );
}
