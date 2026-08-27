// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Current-release Temporal orchestration for the Shannon pentest pipeline.
 *
 * Every side effect (network, filesystem, git, model calls) is confined to an activity, reached
 * only through the proxied namespaces below (`acts`, `testActs`, `preflightActs`, and the rest)
 * or through `executeChild` for the Capella child workflow. The functions in this file must stay
 * deterministic: Temporal replays them from recorded history instead of re-running real time or
 * I/O, so calling `Date.now()` directly in workflow code is safe (the SDK records and replays the
 * value), but a raw file read, network call, or `Math.random()` is not.
 */

import type { ActivityOptions } from '@temporalio/workflow';
import {
  ActivityCancellationType,
  ApplicationFailure,
  CancellationScope,
  executeChild,
  isCancellation,
  log,
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type { StageMetrics } from '../ai/reconciliation/stage-contracts.js';
import { capellaTerminalStageLabel, isCapellaSafeFailureMessage } from '../ai/sast/capella/safe-failures.js';
import type { CapellaWorkflowInput } from '../ai/sast/capella/temporal/activity-types.js';
import { CAPELLA_CHILD_WORKFLOW_OPTIONS, capellaWorkflow } from '../ai/sast/capella/temporal/workflow.js';
import type { CapellaRunResult, SarifRef } from '../ai/sast/types.js';
import type { WorkflowPhase } from '../audit/safe-fields.js';
import type { AgentName, VulnType } from '../types/agents.js';
import { ALL_AGENTS } from '../types/agents.js';
import { ALL_VULN_CLASSES, type VulnClass } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import {
  appendPartialReasons,
  type MiscellaneousOutcome,
  miscellaneousLaneIsSettled,
  type PartialReason,
  partialReasonFromReduction,
  projectPartialReasons,
  renderSafeMessage,
  reportIsAuthored,
} from '../types/run-state.js';
import type * as activities from './activities.js';
import type { ActivityInput } from './activities.js';
import {
  isAcceptedTaskFormationFallbackReason,
  RECONCILIATION_ACTIVITY_PROFILES,
  type ReconciliationActivityRegistry,
  type ReconciliationClassActivityName,
  reconciliationClassDeadlineFrom,
  resolveReconciliationActivityBudget,
} from './reconcile-activity-types.js';
import {
  type AgentMetrics,
  type DurableStateSummary,
  type FinalizeReportActivityResult,
  getProgress,
  type NonFatalFailure,
  type OperationalMetrics,
  type PipelineInput,
  type PipelineProgress,
  type PipelineState,
  type PipelineSummary,
  type ResumeState,
  type VulnExploitPipelineResult,
} from './shared.js';
import { toWorkflowSummary } from './summary-mapper.js';
import { classifyErrorCode, formatWorkflowError } from './workflow-errors.js';

export { capellaWorkflow };

// Ordinary agent activities get long timeouts and Temporal's own retry loop, since an
// individual agent run (a model conversation plus tool calls) can legitimately take a long
// time and the workflow, not the agent process, owns restart decisions. The error types listed
// as non-retryable are ones a retry can never fix (bad credentials, invalid config, an
// unreachable target, a failed login), so retrying them would only burn time before failing anyway.
const PRODUCTION_RETRY = {
  initialInterval: '5 minutes',
  maximumInterval: '30 minutes',
  backoffCoefficient: 2,
  maximumAttempts: 50,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'ConfigurationError',
    'InvalidTargetError',
    'AuthLoginFailedError',
    'PermanentError',
  ],
};

const TESTING_RETRY = {
  initialInterval: '10 seconds',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 5,
  nonRetryableErrorTypes: PRODUCTION_RETRY.nonRetryableErrorTypes,
};

const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '60 minutes',
  retry: PRODUCTION_RETRY,
  cancellationType: ActivityCancellationType.TRY_CANCEL,
});

const testActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '30 minutes',
  retry: TESTING_RETRY,
  cancellationType: ActivityCancellationType.TRY_CANCEL,
});

const SHORT_RETRY = {
  initialInterval: '10 seconds',
  maximumInterval: '1 minute',
  backoffCoefficient: 2,
  maximumAttempts: 3,
  nonRetryableErrorTypes: PRODUCTION_RETRY.nonRetryableErrorTypes,
};

const preflightActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  heartbeatTimeout: '2 minutes',
  retry: SHORT_RETRY,
  cancellationType: ActivityCancellationType.TRY_CANCEL,
});

const authValidationActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '10 minutes',
  retry: SHORT_RETRY,
  cancellationType: ActivityCancellationType.TRY_CANCEL,
});

// From here down, every proxied namespace mutates durable, git-checkpointed state (report
// progress, reconciliation artifacts, finalization). They use WAIT_CANCELLATION_COMPLETED so a
// cancelled scan lets an in-flight write finish cleanly instead of racing a mid-commit abort;
// the agent activities above use the cheaper TRY_CANCEL because an agent process can simply be
// killed without leaving a half-written checkpoint behind.
const deterministicReportActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumAttempts: 5 },
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
});

const finalReportActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumAttempts: 3 },
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
});

const surfaceReportActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 minutes',
  retry: { initialInterval: '1 second', backoffCoefficient: 2, maximumAttempts: 3 },
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
});

const seedMiscellaneousActs = proxyActivities<Pick<ReconciliationActivityRegistry, 'seedEmptyProducerQueue'>>({
  startToCloseTimeout: RECONCILIATION_ACTIVITY_PROFILES.seedEmptyProducerQueue.startToCloseTimeoutMs,
  scheduleToCloseTimeout: '12 minutes',
  retry: {
    initialInterval: RECONCILIATION_ACTIVITY_PROFILES.seedEmptyProducerQueue.retryInitialIntervalMs,
    backoffCoefficient: RECONCILIATION_ACTIVITY_PROFILES.seedEmptyProducerQueue.retryBackoffCoefficient,
    maximumAttempts: RECONCILIATION_ACTIVITY_PROFILES.seedEmptyProducerQueue.maximumAttempts,
  },
  cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
});

const MAX_CONCURRENT_PIPELINES = 5;
const MAX_NON_FATAL_FAILURES = 32;

const CAPELLA_OPERATION_KEY = 'agentic-sast';
const CAPELLA_OPERATION_LABEL = 'Agentic SAST';
const CAPELLA_INFRASTRUCTURE_FAILURE = 'Agentic SAST infrastructure failed before producing a usable result.';
const CAPELLA_UNFINISHED = 'Agentic SAST had not finished when the scan stopped.';
const OPERATION_FAILURE = 'This scan step could not be completed.';
const CLASS_PIPELINE_FAILURE = 'A vulnerability analysis lane could not be completed.';
const CLASS_RECONCILIATION_FAILURE = 'Findings reconciliation could not be completed.';
const MISCELLANEOUS_PIPELINE_FAILURE = 'The additional findings lane could not be completed.';
const REPORT_RENUMBER_FAILURE = 'Report finding identifiers could not be refreshed for this class.';
const REPORT_COMPACTION_FAILURE = 'Report findings could not be compacted.';

/**
 * The single Capella outcome every vulnerability class joins on. Agentic SAST overlaps the
 * pentest, so its result is settled once and read by all five classes: a usable SARIF, no
 * SARIF, or the original cancellation that every waiter rethrows unchanged.
 */
type CapellaSettlement =
  | { readonly outcome: 'settled'; readonly sarif?: SarifRef }
  | { readonly outcome: 'cancelled'; readonly error: unknown };

/** Walk a rejection's `.cause` chain into an array, deduped and depth-bounded against a cycle. */
function failureChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current !== undefined && current !== null && !visited.has(current) && chain.length < 20) {
    chain.push(current);
    visited.add(current);
    current = current instanceof Error ? current.cause : undefined;
  }
  return chain;
}

function hasCancellationInCauseChain(error: unknown): boolean {
  return failureChain(error).some((cause) => isCancellation(cause));
}

function applicationFailureInChain(error: unknown): ApplicationFailure | undefined {
  return failureChain(error).find((cause): cause is ApplicationFailure => cause instanceof ApplicationFailure);
}

function failureDetailRecord(failure: ApplicationFailure | undefined): Record<string, unknown> | undefined {
  const first = failure?.details?.[0];
  if (first === null || typeof first !== 'object' || Array.isArray(first)) return undefined;
  return first as Record<string, unknown>;
}

/**
 * Semantic fallback is restricted to the executor's closed set of accepted Pass 1
 * model-failure reasons. A bare Temporal timeout (heartbeat, schedule-to-close, dead
 * worker), an infrastructure failure, a cancellation, or a deterministic integrity error
 * must fail the class instead of silently publishing a zero-dedup queue as success.
 */
function shouldUseSingletonFallback(error: unknown): boolean {
  if (hasCancellationInCauseChain(error)) return false;
  const failure = applicationFailureInChain(error);
  if (failure?.type !== 'TaskFormationModelError' || failure.nonRetryable) return false;
  return isAcceptedTaskFormationFallbackReason(failureDetailRecord(failure)?.fallbackReason);
}

function fallbackMetrics(error: unknown): StageMetrics | undefined {
  const details = applicationFailureInChain(error)?.details;
  if (!Array.isArray(details)) return undefined;
  const first = details[0];
  if (first === null || typeof first !== 'object') return undefined;
  const metrics = (first as { metrics?: unknown }).metrics;
  if (metrics === null || typeof metrics !== 'object') return undefined;
  const value = metrics as Partial<StageMetrics>;
  if (
    typeof value.costUsd !== 'number' ||
    typeof value.modelCalls !== 'number' ||
    typeof value.inputTokens !== 'number' ||
    typeof value.outputTokens !== 'number'
  ) {
    return undefined;
  }
  return {
    costUsd: value.costUsd,
    modelCalls: value.modelCalls,
    inputTokens: value.inputTokens,
    outputTokens: value.outputTokens,
  };
}

function reconciliationActivityOptions(
  activityName: ReconciliationClassActivityName,
  classDeadlineMs: number,
  vulnerabilityClass: ReconciliationClass,
): ActivityOptions {
  const budget = resolveReconciliationActivityBudget(activityName, classDeadlineMs, Date.now());
  if (!budget.shouldSchedule) {
    throw ApplicationFailure.nonRetryable(
      renderSafeMessage(
        '{Class} findings took too long to process and the scan stopped that class. Re-running this workspace retries it.',
        { vulnerabilityClass },
      ),
      'ConfigurationError',
      [{ activityName }],
    );
  }
  const profile = RECONCILIATION_ACTIVITY_PROFILES[activityName];
  return {
    scheduleToCloseTimeout: budget.scheduleToCloseTimeoutMs,
    startToCloseTimeout: budget.startToCloseTimeoutMs,
    ...(budget.heartbeatTimeoutMs !== null && { heartbeatTimeout: budget.heartbeatTimeoutMs }),
    retry: {
      initialInterval: profile.retryInitialIntervalMs,
      backoffCoefficient: profile.retryBackoffCoefficient,
      maximumAttempts: profile.maximumAttempts,
    },
    cancellationType: ActivityCancellationType.WAIT_CANCELLATION_COMPLETED,
  };
}

function reconciliationActs(
  activityName: ReconciliationClassActivityName,
  classDeadlineMs: number,
  vulnerabilityClass: ReconciliationClass,
): ReconciliationActivityRegistry {
  return proxyActivities<ReconciliationActivityRegistry>(
    reconciliationActivityOptions(activityName, classDeadlineMs, vulnerabilityClass),
  );
}

function capellaMetrics(result: CapellaRunResult, model: string): OperationalMetrics {
  return {
    durationMs: result.durationMs,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens,
    costUsd: result.usage.costUsd,
    numTurns: result.usage.turns,
    model,
    usageComplete: result.usageComplete,
  };
}

/**
 * A reconciliation stage's priced metrics. `StageMetrics` records spend only, so the duration
 * stays zero rather than being invented here; the stage's real wall-clock is carried separately
 * by `operationalStages` and is what terminal accounting reads.
 */
function stageMetrics(metrics: StageMetrics): OperationalMetrics {
  return {
    durationMs: 0,
    inputTokens: metrics.inputTokens,
    outputTokens: metrics.outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    costUsd: metrics.costUsd,
    numTurns: metrics.modelCalls,
    usageComplete: true,
  };
}

function computeSummary(state: PipelineState, usageAccountingComplete: boolean): PipelineSummary {
  const metrics = [...Object.values(state.agentMetrics), ...Object.values(state.operationalMetrics)];
  return {
    totalCostUsd: metrics.reduce((sum, metric) => sum + (metric.costUsd ?? 0), 0),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: metrics.reduce((sum, metric) => sum + (metric.numTurns ?? 0), 0),
    agentCount: state.completedAgents.length + state.skippedAgents.length,
    usageAccountingComplete,
  };
}

function isAgentName(value: string): value is AgentName {
  return (ALL_AGENTS as readonly string[]).includes(value);
}

/** Core current-release pipeline orchestration. */
export async function pentestPipeline(input: PipelineInput): Promise<PipelineState> {
  if (!input.repoPath || input.repoPath.includes('..')) {
    throw ApplicationFailure.nonRetryable('Invalid repository path.', 'ConfigurationError');
  }
  if (!input.repoPath.startsWith('/')) {
    throw ApplicationFailure.nonRetryable('An absolute repository path is required.', 'ConfigurationError');
  }
  if (input.agenticSast !== undefined && input.sastSarif !== undefined) {
    throw ApplicationFailure.nonRetryable(
      'Agentic SAST cannot run when a static-analysis report is already supplied. Remove the agentic_sast block from your config file, or remove the supplied report.',
      'ConfigurationError',
    );
  }
  if (input.customerOutputPath !== undefined && input.customerOutputPath !== '/app/output') {
    throw ApplicationFailure.nonRetryable(
      'The customer output mount must use the stable worker path.',
      'ConfigurationError',
    );
  }

  const { workflowId } = workflowInfo();
  const a = input.pipelineTestingMode ? testActs : acts;
  const exploit = input.exploit ?? true;
  const sessionId = input.sessionId || input.resumeFromWorkspace || workflowId;
  const stateContext: 'fresh' | 'resume' = input.resumeFromWorkspace ? 'resume' : 'fresh';

  const state: PipelineState = {
    status: 'running',
    currentPhase: null,
    currentAgent: null,
    completedAgents: [],
    expectedAgents: [],
    participatingClasses: [],
    failedPipelines: [],
    failedReconciliations: [],
    failedAgent: null,
    error: null,
    startTime: Date.now(),
    skippedAgents: [],
    agentMetrics: {},
    operationalMetrics: {},
    operationalStages: {},
    agenticSast: { status: 'disabled' },
    nonFatalFailures: [],
    partialReasons: [],
    summary: null,
  };

  // The durable degradation record. Codes plus bounded context are the identity; the
  // projection into state carries derived safe messages for every consumer surface.
  let partialReasons: readonly PartialReason[] = [];
  // True once reconciliation adopted a prior run's publication, whose model spend is not
  // visible to this run's metrics. Surfaced instead of inventing the missing spend.
  let operationalSpendMissing = false;

  function addPartialReason(reason: PartialReason): void {
    partialReasons = appendPartialReasons(partialReasons, [reason]);
    state.partialReasons = [...projectPartialReasons(partialReasons)];
  }

  function adoptDurableReasons(durable: readonly PartialReason[]): void {
    partialReasons = appendPartialReasons(partialReasons, durable);
    state.partialReasons = [...projectPartialReasons(partialReasons)];
  }

  function usageAccountingComplete(): boolean {
    const everyOperationalMetricComplete = Object.values(state.operationalMetrics).every(
      (metric) => metric.usageComplete !== false,
    );
    return everyOperationalMetricComplete && !operationalSpendMissing;
  }

  setHandler(
    getProgress,
    (): PipelineProgress => ({
      ...state,
      workflowId,
      elapsedMs: Date.now() - state.startTime,
    }),
  );

  const activityInput: ActivityInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    assessmentDate: new Date(state.startTime).toISOString().slice(0, 10),
    workflowId,
    sessionId,
    analysisClasses: [...ALL_VULN_CLASSES],
    stateContext,
    customerOutputRoute: input.customerOutputPath === undefined ? 'workspace' : 'mounted',
    ...(input.configPath !== undefined && { configPath: input.configPath }),
    ...(input.pipelineTestingMode !== undefined && { pipelineTestingMode: input.pipelineTestingMode }),
    ...(input.configYAML !== undefined && { configYAML: input.configYAML }),
    ...(input.deliverablesSubdir !== undefined && { deliverablesSubdir: input.deliverablesSubdir }),
    ...(input.auditDir !== undefined && { auditDir: input.auditDir }),
    ...(input.promptDir !== undefined && { promptDir: input.promptDir }),
  };

  let resumeState: ResumeState | null = null;
  // The one shared Capella settlement, once analysis has started it. The terminal paths read
  // it so a stopping run can account for a child that is still working.
  let capellaSettlement: Promise<CapellaSettlement> | null = null;
  // What durable state records for the internal `miscellaneous` class, kept current by every
  // durable summary this run reads or writes. The lane consults it before deciding admission,
  // rather than re-deciding from a queue an earlier run already settled.
  let miscellaneousOutcome: MiscellaneousOutcome | undefined;
  // Latched when a stopped run has recorded the terminal Capella state. The hard-failure path
  // does not wait for the child, so the child can still return while the terminal activity
  // yields; from that point the recorded state is final and no continuation may rewrite it.
  let capellaTerminallyProjected = false;

  function applyDurableSummary(summary: DurableStateSummary): void {
    state.expectedAgents = [...summary.expectedAgents];
    state.participatingClasses = [...summary.participatingClasses];
    if (summary.miscellaneousOutcome !== undefined) miscellaneousOutcome = summary.miscellaneousOutcome;
  }

  /** An agent that actually ran and finished. Mutually exclusive from markSkipped. */
  function markCompleted(agentName: AgentName): void {
    if (!state.expectedAgents.includes(agentName)) return;
    if (!state.completedAgents.includes(agentName)) state.completedAgents.push(agentName);
  }

  /**
   * An expected agent that never ran because its class had nothing to exploit. It is tracked
   * only in `skippedAgents`, mutually exclusive from `completedAgents`. Pipeline resolution is
   * the union of the two lists; the summary counts them together.
   */
  function markSkipped(agentName: AgentName): void {
    if (!state.expectedAgents.includes(agentName)) return;
    if (!state.skippedAgents.includes(agentName)) state.skippedAgents.push(agentName);
  }

  function shouldSkip(agentName: AgentName): boolean {
    return resumeState?.completedAgents.includes(agentName) ?? false;
  }

  // Bounded so a pathological run cannot grow workflow state, and workflow history, without
  // limit; an entry past the cap is dropped silently rather than turned into a failure of its own.
  function addNonFatal(failure: NonFatalFailure): void {
    if (state.nonFatalFailures.length >= MAX_NON_FATAL_FAILURES) return;
    state.nonFatalFailures.push(failure);
  }

  function startOperation(key: string, label: string): number {
    const startedAt = Date.now();
    state.operationalStages[key] = { key, label, status: 'running', startedAt };
    return startedAt;
  }

  function completeOperation(key: string, label: string, startedAt: number): void {
    state.operationalStages[key] = {
      key,
      label,
      status: 'completed',
      startedAt,
      durationMs: Date.now() - startedAt,
    };
  }

  function failOperation(key: string, label: string, startedAt: number, message: string = OPERATION_FAILURE): void {
    state.operationalStages[key] = {
      key,
      label,
      status: 'failed',
      startedAt,
      durationMs: Date.now() - startedAt,
      error: message,
    };
  }

  /** A stage an earlier run already settled. It records no span, so it contributes no wall time. */
  function skipOperation(key: string, label: string): void {
    state.operationalStages[key] = { key, label, status: 'skipped' };
  }

  async function runOperation<T>(key: string, label: string, operation: () => Promise<T>): Promise<T> {
    const startedAt = startOperation(key, label);
    try {
      const result = await operation();
      completeOperation(key, label, startedAt);
      return result;
    } catch (error) {
      failOperation(key, label, startedAt);
      throw error;
    }
  }

  function addReconciliationMetrics(
    vulnerabilityClass: ReconciliationClass,
    stage: 'enrich' | 'form',
    metrics: StageMetrics,
  ): void {
    state.operationalMetrics[`reconciliation:${vulnerabilityClass}:${stage}`] = stageMetrics(metrics);
  }

  async function runSequentialPhase(
    phaseName: WorkflowPhase,
    agentName: AgentName,
    runAgent: (input: ActivityInput) => Promise<AgentMetrics>,
  ): Promise<void> {
    if (shouldSkip(agentName)) {
      log.info(`Skipping ${agentName} (already complete)`);
      markCompleted(agentName);
      return;
    }
    state.currentPhase = phaseName;
    state.currentAgent = agentName;
    await a.logPhaseTransition(activityInput, phaseName, 'start');
    state.agentMetrics[agentName] = await runAgent(activityInput);
    markCompleted(agentName);
    if (input.checkpointsEnabled) await a.saveCheckpoint(activityInput, agentName, phaseName, state);
    await a.logPhaseTransition(activityInput, phaseName, 'complete');
  }

  async function reconcileClass(vulnerabilityClass: ReconciliationClass, sarif?: SarifRef): Promise<void> {
    const key = `reconciliation:${vulnerabilityClass}`;
    const label = `Reconcile ${vulnerabilityClass}`;
    await runOperation(key, label, async () => {
      const classDeadlineMs = reconciliationClassDeadlineFrom(Date.now());
      const baseInput = { sessionId, vulnerabilityClass, classDeadlineMs };
      const prepared = await reconciliationActs(
        'prepareClassReconciliation',
        classDeadlineMs,
        vulnerabilityClass,
      ).prepareClassReconciliation({
        ...baseInput,
        includeSastProvenance: sarif !== undefined,
      });
      if (prepared.outcome === 'already_published') {
        // A prior run paid for this publication; its model spend is absent from this
        // run's metrics, so the cost total is surfaced as incomplete rather than invented.
        operationalSpendMissing = true;
        return;
      }

      const enriched = await reconciliationActs(
        'enrichClassSastObservations',
        classDeadlineMs,
        vulnerabilityClass,
      ).enrichClassSastObservations({
        ...baseInput,
        ...(sarif !== undefined && { sarif }),
      });
      addReconciliationMetrics(vulnerabilityClass, 'enrich', enriched.metrics);

      let formation:
        | Awaited<ReturnType<ReconciliationActivityRegistry['formClassExploitTasks']>>
        | 'singleton_fallback';
      try {
        formation = await reconciliationActs(
          'formClassExploitTasks',
          classDeadlineMs,
          vulnerabilityClass,
        ).formClassExploitTasks({
          ...baseInput,
          producerRef: prepared.ref,
          supplementalRef: enriched.ref,
        });
        addReconciliationMetrics(vulnerabilityClass, 'form', formation.metrics);
      } catch (error) {
        if (!shouldUseSingletonFallback(error)) throw error;
        const metrics = fallbackMetrics(error);
        if (metrics !== undefined) addReconciliationMetrics(vulnerabilityClass, 'form', metrics);
        formation = 'singleton_fallback';
        // Make the degradation visible in queryable state: every observation becomes its
        // own task, so duplicates are expected instead of silently absent dedup.
        const fallbackKey = `reconciliation:${vulnerabilityClass}:fallback`;
        completeOperation(fallbackKey, `Grouping skipped (${vulnerabilityClass})`, Date.now());
        log.info(
          renderSafeMessage(
            '{Class} findings could not be grouped, so each one will be tested separately. Expect duplicates in the results.',
            { vulnerabilityClass },
          ),
        );
      }

      const materialized = await reconciliationActs(
        'materializeClassExploitTasks',
        classDeadlineMs,
        vulnerabilityClass,
      ).materializeClassExploitTasks({
        ...baseInput,
        producerRef: prepared.ref,
        supplementalRef: enriched.ref,
        form: formation,
      });
      await reconciliationActs(
        'publishClassReconciliationOss',
        classDeadlineMs,
        vulnerabilityClass,
      ).publishClassReconciliationOss({
        ...baseInput,
        producerRef: prepared.ref,
        supplementalRef: enriched.ref,
        fixedTasksRef: materialized.ref,
      });
    });
  }

  function buildPipelineConfigs(): Array<{
    vulnType: VulnType;
    runVuln: () => Promise<AgentMetrics>;
    runExploit: () => Promise<AgentMetrics>;
  }> {
    return [
      {
        vulnType: 'injection',
        runVuln: () => a.runInjectionVulnAgent(activityInput),
        runExploit: () => a.runInjectionExploitAgent(activityInput),
      },
      {
        vulnType: 'xss',
        runVuln: () => a.runXssVulnAgent(activityInput),
        runExploit: () => a.runXssExploitAgent(activityInput),
      },
      {
        vulnType: 'auth',
        runVuln: () => a.runAuthVulnAgent(activityInput),
        runExploit: () => a.runAuthExploitAgent(activityInput),
      },
      {
        vulnType: 'authz',
        runVuln: () => a.runAuthzVulnAgent(activityInput),
        runExploit: () => a.runAuthzExploitAgent(activityInput),
      },
      {
        vulnType: 'ssrf',
        runVuln: () => a.runSsrfVulnAgent(activityInput),
        runExploit: () => a.runSsrfExploitAgent(activityInput),
      },
    ];
  }

  /**
   * One vulnerability class's full lane: the vuln agent, joining the shared Capella settlement,
   * reconciliation, the exploitation decision, and (if warranted) the exploit agent. Every
   * failure except cancellation is caught here and turned into a per-class result instead of
   * being rethrown, so one class failing never aborts the classes running alongside it. Whether
   * reconciliation had already started when the failure hit picks which of the two safe messages
   * and partial-reason codes the class is recorded under.
   */
  async function runVulnExploitPipeline(
    vulnType: VulnType,
    runVulnAgent: () => Promise<AgentMetrics>,
    runExploitAgent: () => Promise<AgentMetrics>,
    capella: Promise<CapellaSettlement>,
  ): Promise<VulnExploitPipelineResult> {
    const vulnAgentName = `${vulnType}-vuln` as AgentName;
    const exploitAgentName = `${vulnType}-exploit` as AgentName;
    let reconciliationStarted = false;
    let reconciliationCompleted = false;
    try {
      let vulnMetrics: AgentMetrics | null = null;
      if (shouldSkip(vulnAgentName)) {
        markCompleted(vulnAgentName);
      } else {
        vulnMetrics = await runVulnAgent();
        state.agentMetrics[vulnAgentName] = vulnMetrics;
        markCompleted(vulnAgentName);
        if (input.checkpointsEnabled)
          await a.saveCheckpoint(activityInput, vulnAgentName, 'vulnerability-analysis', state);
      }

      // The class joins the shared Capella outcome here: reconciliation needs the settled
      // SARIF, and every class awaits the same promise, so no class waits on another class.
      const settled = await capella;
      if (settled.outcome === 'cancelled') throw settled.error;

      reconciliationStarted = true;
      await reconcileClass(vulnType, settled.sarif);
      reconciliationCompleted = true;
      const decision = await a.checkExploitationQueue(activityInput, vulnType);
      let exploitMetrics: AgentMetrics | null = null;
      if (exploit && shouldSkip(exploitAgentName)) {
        markCompleted(exploitAgentName);
      } else if (exploit && decision.shouldExploit) {
        exploitMetrics = await runExploitAgent();
        state.agentMetrics[exploitAgentName] = exploitMetrics;
        markCompleted(exploitAgentName);
        if (input.checkpointsEnabled) await a.saveCheckpoint(activityInput, exploitAgentName, 'exploitation', state);
      } else if (exploit) {
        markSkipped(exploitAgentName);
        if (input.checkpointsEnabled) await a.saveCheckpoint(activityInput, exploitAgentName, 'exploitation', state);
      }

      return {
        vulnType,
        vulnMetrics,
        exploitMetrics,
        exploitDecision: { shouldExploit: decision.shouldExploit, vulnerabilityCount: decision.vulnerabilityCount },
        error: null,
      };
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      const message =
        reconciliationStarted && !reconciliationCompleted ? CLASS_RECONCILIATION_FAILURE : CLASS_PIPELINE_FAILURE;
      if (reconciliationStarted && !reconciliationCompleted) {
        state.failedReconciliations.push({ vulnerabilityClass: vulnType, error: message });
        addPartialReason({ code: 'class_reconciliation_failed', vulnerabilityClass: vulnType });
      } else {
        addPartialReason({ code: 'class_pipeline_failed', vulnerabilityClass: vulnType });
      }
      return {
        vulnType,
        vulnMetrics: state.agentMetrics[vulnAgentName] ?? null,
        exploitMetrics: state.agentMetrics[exploitAgentName] ?? null,
        exploitDecision: null,
        error: message,
      };
    }
  }

  /**
   * Run `thunks` with at most `limit` in flight, collecting every settlement instead of
   * failing fast, so one class's rejection never cancels the classes still running alongside it.
   */
  async function runWithConcurrencyLimit(
    thunks: Array<() => Promise<VulnExploitPipelineResult>>,
    limit: number,
  ): Promise<PromiseSettledResult<VulnExploitPipelineResult>[]> {
    const results: PromiseSettledResult<VulnExploitPipelineResult>[] = [];
    const inFlight = new Set<Promise<void>>();
    for (const thunk of thunks) {
      const slot = thunk()
        .then(
          (value) => results.push({ status: 'fulfilled', value }),
          (reason: unknown) => results.push({ status: 'rejected', reason }),
        )
        .then(() => undefined)
        .finally(() => inFlight.delete(slot));
      inFlight.add(slot);
      if (inFlight.size >= limit) await Promise.race(inFlight);
    }
    await Promise.allSettled(inFlight);
    return results;
  }

  function aggregatePipelineResults(results: PromiseSettledResult<VulnExploitPipelineResult>[]): void {
    const cancelled = results.find(
      (result): result is PromiseRejectedResult =>
        result.status === 'rejected' && hasCancellationInCauseChain(result.reason),
    );
    if (cancelled) throw cancelled.reason;

    const failed: { vulnType: VulnClass; error: string }[] = [];
    const unattributable: string[] = [];
    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value.error !== null) failed.push({ vulnType: result.value.vulnType, error: result.value.error });
      } else {
        unattributable.push(CLASS_PIPELINE_FAILURE);
      }
    }
    if (failed.length === 0 && unattributable.length === 0) return;
    // Fail the whole phase when every class failed, or when any result is unattributable.
    // A class pipeline catches its own errors and reports them in `error`, so a rejected
    // thunk means a failure escaped that path and cannot be pinned to one class, which is
    // never safe to downgrade to a partial run.
    if (failed.length + unattributable.length === ALL_VULN_CLASSES.length || unattributable.length > 0) {
      const errors = [...failed.map((failure) => `${failure.vulnType}: ${failure.error}`), ...unattributable];
      throw ApplicationFailure.nonRetryable(
        'The vulnerability analysis phase failed and the scan cannot continue. Re-running this workspace retries it from the last checkpoint.',
        'PipelineFailedError',
        [{ failures: errors }],
      );
    }
    state.failedPipelines = failed;
  }

  /**
   * The failed projection shared by every Capella outcome that produced no usable result:
   * an infrastructure failure, and a parent that stopped while the child was still running.
   * `startedAt` is the operation's real start, so a projection made after the status already
   * moved on still records the true duration.
   */
  function projectCapellaWorkflowFailure(message: string, startedAt: number): void {
    if (capellaTerminallyProjected) return;
    state.agenticSast = {
      status: 'failed',
      failedStage: 'workflow',
      failedStageLabel: capellaTerminalStageLabel('workflow'),
      error: message,
      completedStages: [],
      warnings: [],
      durationMs: Date.now() - startedAt,
    };
    failOperation(CAPELLA_OPERATION_KEY, CAPELLA_OPERATION_LABEL, startedAt, message);
  }

  /**
   * The one recovery for a Capella failure that returned no result of its own: the failed
   * projection, its single durable reason, and one non-fatal entry.
   */
  function projectCapellaInfrastructureFailure(startedAt: number): void {
    if (capellaTerminallyProjected) return;
    projectCapellaWorkflowFailure(CAPELLA_INFRASTRUCTURE_FAILURE, startedAt);
    addPartialReason({ code: 'agentic_sast_failed', stage: 'workflow' });
    addNonFatal({ phase: 'agentic-sast', error: CAPELLA_INFRASTRUCTURE_FAILURE });
  }

  /**
   * Run Capella as a child workflow when agentic SAST is configured, or pass through a
   * pre-supplied SARIF report unchanged when it is not. Every outcome this function can observe,
   * whether success, reduced coverage, a Capella-reported failure, or an escaped exception, is
   * projected into `state.agenticSast` and, where relevant, a durable partial reason before
   * returning, so a caller reads the settled SARIF (`undefined` on anything but success) without
   * needing its own failure-handling path.
   */
  async function runCapella(): Promise<SarifRef | undefined> {
    if (input.agenticSast === undefined) {
      state.agenticSast = { status: 'disabled' };
      return input.sastSarif;
    }

    const startedAt = startOperation(CAPELLA_OPERATION_KEY, CAPELLA_OPERATION_LABEL);
    state.agenticSast = { status: 'running', startedAt };
    const auditRoot = (input.auditDir ?? '/app/workspaces').replace(/\/+$/, '');
    const capellaInput: CapellaWorkflowInput = {
      repoPath: input.repoPath,
      artifactRoot: `${auditRoot}/${sessionId}/.shannon/capella`,
      workflowLogPath: `${auditRoot}/${sessionId}/.shannon/workflow.log`,
      promptDir: input.promptDir ?? '/app/apps/worker/prompts',
      codePathAvoids: [...input.agenticSast.codePathAvoids],
      codePathFocus: [...input.agenticSast.codePathFocus],
      modelSpec: input.agenticSast.modelSpec,
      capellaFormatVersion: input.agenticSast.capellaFormatVersion,
      promptSetVersion: input.agenticSast.promptSetVersion,
      pipelineTestingMode: input.pipelineTestingMode ?? false,
    };

    try {
      const result = await executeChild(capellaWorkflow, {
        ...CAPELLA_CHILD_WORKFLOW_OPTIONS,
        workflowId: `${workflowId}-capella`,
        args: [capellaInput],
      });
      // A run that already stopped owns the terminal Capella state. Its projection is made
      // while this child is still working, so a late result must write nothing: not the
      // status, not the operational stage, not the metrics the summary was computed from.
      if (capellaTerminallyProjected) return undefined;

      const metricKey = result.status === 'succeeded' ? 'agentic-sast:export' : `agentic-sast:${result.failedStage}`;
      state.operationalMetrics[metricKey] = capellaMetrics(result, input.agenticSast.modelSpec);
      if (result.status === 'succeeded') {
        state.agenticSast = {
          status: 'succeeded',
          findingCount: result.findingCount,
          sarifSha256: result.sarif.sha256,
          coverage: result.coverage,
          warnings: [...result.warnings],
          durationMs: result.durationMs,
          ...(result.reductions !== undefined && { reductions: result.reductions }),
          ...(result.recoveredFailure !== undefined && { recoveredFailure: result.recoveredFailure }),
        };
        completeOperation(CAPELLA_OPERATION_KEY, CAPELLA_OPERATION_LABEL, startedAt);
        if (result.coverage === 'reduced') {
          // One durable reason per reduction (research before export); each renders its own
          // bounded safe message. A reduced run with no structured reduction keeps the bare code.
          const reasons: PartialReason[] =
            result.reductions === undefined || result.reductions.length === 0
              ? [{ code: 'agentic_sast_reduced' }]
              : result.reductions.map(partialReasonFromReduction);
          for (const reason of reasons) {
            addPartialReason(reason);
            addNonFatal({ phase: 'agentic-sast', error: projectPartialReasons([reason])[0]?.message ?? '' });
          }
        }
        return result.sarif;
      }

      const safeFailureMessage = isCapellaSafeFailureMessage(result.error)
        ? result.error
        : 'An agentic SAST step failed.';
      state.agenticSast = {
        status: 'failed',
        failedStage: result.failedStage,
        failedStageLabel: capellaTerminalStageLabel(result.failedStage),
        error: safeFailureMessage,
        ...(result.errorCode !== undefined && { errorCode: result.errorCode }),
        completedStages: [...result.completedStages],
        warnings: [...result.warnings],
        durationMs: result.durationMs,
      };
      addPartialReason({ code: 'agentic_sast_failed', stage: result.failedStage });
      failOperation(CAPELLA_OPERATION_KEY, CAPELLA_OPERATION_LABEL, startedAt, safeFailureMessage);
      addNonFatal({
        phase: 'agentic-sast',
        error: safeFailureMessage,
      });
      return undefined;
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      projectCapellaInfrastructureFailure(startedAt);
      return undefined;
    }
  }

  /**
   * Start the one shared Capella settlement. The returned promise is total: the classes that
   * join it later must never observe a background rejection, so a non-cancellation failure
   * resolves as the shared no-SARIF outcome and only cancellation is carried through.
   */
  async function settleCapella(): Promise<CapellaSettlement> {
    try {
      const sarif = await runCapella();
      if (sarif === undefined) return { outcome: 'settled' };
      return { outcome: 'settled', sarif };
    } catch (error) {
      if (hasCancellationInCauseChain(error)) return { outcome: 'cancelled', error };
      // `runCapella` projects every failure it can see, so an escape means that projection
      // itself failed partway; only the part it never reached is recovered here, and it is one
      // shared Capella outcome, never five separate class failures. Nothing in this recovery
      // may reject: on some paths no class ever joins, and an unobserved rejection in the
      // workflow VM is escalated rather than dropped.
      const running = state.agenticSast;
      try {
        if (running.status === 'running') projectCapellaInfrastructureFailure(running.startedAt);
      } catch {
        try {
          log.warn('Capella failure projection did not complete', { code: 'CAPELLA_PROJECTION_FAILED' });
        } catch {
          // Even the warning is best-effort. A log that cannot be written must not turn the
          // settlement every class joins into a rejected promise.
        }
      }
      return { outcome: 'settled' };
    }
  }

  /**
   * The Capella child runs under wait-for-cancellation, so a cancelled parent observes its
   * settlement before projecting the terminal state. Waiting never replaces the cancellation
   * this path is already reporting.
   */
  async function awaitCapellaSettlement(settlement: Promise<CapellaSettlement>): Promise<void> {
    try {
      await settlement;
    } catch {
      log.warn('Capella settlement did not resolve while the scan was stopping', {
        code: 'CAPELLA_SETTLEMENT_FAILED',
      });
    }
  }

  /**
   * A Capella child that never returned recorded no complete operational metric, so a run that
   * stops while it is still running reports the stage as failed and its spend as incomplete
   * rather than inventing either. A stopped run carries no partial reasons, so none is added.
   */
  function projectUnfinishedCapella(): void {
    const running = state.agenticSast;
    if (running.status !== 'running') return;
    projectCapellaWorkflowFailure(CAPELLA_UNFINISHED, running.startedAt);
    capellaTerminallyProjected = true;
    operationalSpendMissing = true;
  }

  /**
   * The internal `miscellaneous` class: findings outside the five fixed vulnerability classes,
   * carried through the same reconciliation and exploitation-decision path those classes use.
   * Its outcome is durably recorded (not just success/failure) so a resumed run knows whether
   * the class was ever admitted for exploitation, rather than re-deciding admission from scratch.
   */
  async function runMiscellaneousPipeline(effectiveSarif: SarifRef): Promise<void> {
    const key = 'miscellaneous-pipeline';
    const label = 'Miscellaneous findings';
    // An earlier run already settled this class. Re-deciding admission would ask durable state to
    // move backwards, which fails closed and would be recorded as a class failure that never
    // happened; re-running the lane would also repeat work that run already paid for.
    if (miscellaneousLaneIsSettled(miscellaneousOutcome)) {
      if (miscellaneousOutcome === 'completed') markCompleted('miscellaneous-exploit');
      skipOperation(key, label);
      return;
    }
    const startedAt = startOperation(key, label);
    let reconciliationCompleted = false;
    try {
      await seedMiscellaneousActs.seedEmptyProducerQueue({ sessionId });
      await reconcileClass('miscellaneous', effectiveSarif);
      reconciliationCompleted = true;
      const decision = await a.checkExploitationQueue(activityInput, 'miscellaneous' as VulnType);
      let outcome: MiscellaneousOutcome;
      if (!exploit) {
        outcome = 'exploitation_disabled';
      } else if (!decision.shouldExploit) {
        outcome = 'not_actionable';
      } else {
        const admitted = await deterministicReportActs.persistMiscellaneousOutcome(activityInput, 'expected');
        applyDurableSummary(admitted);
        if (!shouldSkip('miscellaneous-exploit'))
          state.agentMetrics['miscellaneous-exploit'] = await a.runMiscellaneousExploitAgent(activityInput);
        markCompleted('miscellaneous-exploit');
        outcome = 'completed';
      }
      const persisted = await deterministicReportActs.persistMiscellaneousOutcome(activityInput, outcome);
      applyDurableSummary(persisted);
      completeOperation(key, label, startedAt);
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      const message = reconciliationCompleted ? MISCELLANEOUS_PIPELINE_FAILURE : CLASS_RECONCILIATION_FAILURE;
      failOperation(key, label, startedAt, message);
      if (!reconciliationCompleted) {
        state.failedReconciliations.push({ vulnerabilityClass: 'miscellaneous', error: message });
        addPartialReason({ code: 'class_reconciliation_failed', vulnerabilityClass: 'miscellaneous' });
      } else {
        addPartialReason({ code: 'class_pipeline_failed', vulnerabilityClass: 'miscellaneous' });
      }
      addNonFatal({
        phase: reconciliationCompleted ? 'miscellaneous-pipeline' : 'reconciliation:miscellaneous',
        error: message,
      });
    }
  }

  /**
   * The sixth exploitation lane. It joins the same settled Capella SARIF the five fixed classes
   * join and runs concurrently with them, rather than trailing them serially. Only cancellation
   * escapes; runMiscellaneousPipeline reports every other outcome as durable state and non-fatal reasons.
   */
  async function runMiscellaneousExploitLane(capella: Promise<CapellaSettlement>): Promise<void> {
    const settled = await capella;
    if (settled.outcome === 'cancelled') throw settled.error;
    if (settled.sarif !== undefined) await runMiscellaneousPipeline(settled.sarif);
  }

  function recordAssemblyOmissions(failedClasses: readonly ReconciliationClass[]): void {
    for (const vulnerabilityClass of failedClasses) {
      // The append rules drop the omission when the class already carries an upstream reason.
      addPartialReason({ code: 'report_class_omitted', vulnerabilityClass });
      const isAnalysisClass = (ALL_VULN_CLASSES as readonly string[]).includes(vulnerabilityClass);
      if (isAnalysisClass && !(activityInput.failedClasses ?? []).includes(vulnerabilityClass as VulnClass)) {
        activityInput.failedClasses = [...(activityInput.failedClasses ?? []), vulnerabilityClass as VulnClass];
      }
    }
  }

  /** True only for the exact retryable SARIF-render failure type after its own activity retry policy exhausted; nothing else may trigger degraded finalization. */
  function isSarifRenderExhaustion(error: unknown): boolean {
    return applicationFailureInChain(error)?.type === 'ReportSarifRenderError';
  }

  /**
   * Drive the durable report state machine from wherever a fresh or resumed run finds it
   * (pending, draft, or finalized) through to a finalized, surfaced report. Each stage below
   * persists its result before the next stage begins, so a crash mid-pipeline resumes from the
   * last persisted stage instead of re-running work that already completed.
   */
  async function finalizeReportPipeline(): Promise<void> {
    state.currentPhase = 'reporting';
    state.currentAgent = 'report';
    await a.logPhaseTransition(activityInput, 'reporting', 'start');

    if (state.reportProgress === undefined) {
      const renumberFailed: ReconciliationClass[] = [];
      if (exploit) {
        for (const vulnerabilityClass of state.participatingClasses) {
          const key = `report:renumber:${vulnerabilityClass}`;
          try {
            await runOperation(key, `Renumber ${vulnerabilityClass}`, () =>
              deterministicReportActs.renumberClassFindings(activityInput, vulnerabilityClass),
            );
          } catch (error) {
            if (hasCancellationInCauseChain(error)) throw error;
            renumberFailed.push(vulnerabilityClass);
            addPartialReason({ code: 'report_renumber_failed', vulnerabilityClass });
            addNonFatal({ phase: key, error: REPORT_RENUMBER_FAILURE });
          }
        }
      }
      state.reportProgress = await runOperation('report:initialize', 'Initialize report state', () =>
        deterministicReportActs.initializeReportProgress(activityInput, renumberFailed, partialReasons),
      );
      adoptDurableReasons(state.reportProgress.partial_reasons);
    }

    if (state.reportProgress.stage === 'pending') {
      const assembled = await runOperation('report:assemble', 'Assemble report inputs', () =>
        deterministicReportActs.assembleReportActivity(activityInput, exploit),
      );
      recordAssemblyOmissions(assembled.failedClasses);
      const reportMetrics = await a.runReportAgent(activityInput, exploit);
      state.agentMetrics.report = reportMetrics;
      if (reportMetrics.checkpoint === undefined) {
        throw ApplicationFailure.nonRetryable(
          'The report was written but could not be saved. Re-running this workspace retries the reporting phase without repeating the analysis.',
          'ReportDraftError',
        );
      }
      state.reportProgress = {
        stage: 'draft',
        renumber_failed_classes: [...state.reportProgress.renumber_failed_classes],
        partial_reasons: [...state.reportProgress.partial_reasons],
        model_checkpoint: reportMetrics.checkpoint,
      };
    }

    if (state.reportProgress.stage === 'draft' && state.reportProgress.canonical_checkpoint === undefined) {
      let canonicalCheckpoint = state.reportProgress.model_checkpoint;
      if (exploit) {
        try {
          const compacted = await runOperation('report:compact', 'Compact report findings', () =>
            deterministicReportActs.compactReportFindings(activityInput),
          );
          canonicalCheckpoint = compacted.checkpoint ?? canonicalCheckpoint;
        } catch (error) {
          if (hasCancellationInCauseChain(error)) throw error;
          addPartialReason({ code: 'report_compaction_failed' });
          addNonFatal({ phase: 'report:compact', error: REPORT_COMPACTION_FAILURE });
        }
      }
      state.reportProgress = await runOperation('report:checkpoint', 'Saving report progress', () =>
        deterministicReportActs.persistCanonicalReportProgress(activityInput, canonicalCheckpoint, partialReasons),
      );
      adoptDurableReasons(state.reportProgress.partial_reasons);
    }

    let finalized: FinalizeReportActivityResult;
    try {
      finalized = await runOperation('report:finalize', 'Finalize report outputs', () =>
        finalReportActs.finalizeReportOutputs(activityInput),
      );
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      // Only the exact retryable SARIF render type may degrade, and only after its ordinary
      // three-attempt policy exhausted. The degraded call still adopts a coherent earlier
      // commit first, so a prior committed finalization keeps its committed disposition.
      if (!isSarifRenderExhaustion(error)) throw error;
      addPartialReason({ code: 'report_sarif_failed' });
      const canonicalProgress = state.reportProgress;
      if (canonicalProgress.stage !== 'draft' || canonicalProgress.canonical_checkpoint === undefined) {
        throw ApplicationFailure.nonRetryable(
          'The report could not save its reduced-output state. Re-running this workspace retries reporting.',
          'ReportDraftError',
        );
      }
      // Persist the limitation before producing replacement outputs so report.json, Markdown,
      // PDF, session state, and CLI status all derive from the same durable reason set.
      state.reportProgress = await deterministicReportActs.persistCanonicalReportProgress(
        activityInput,
        canonicalProgress.canonical_checkpoint,
        partialReasons,
      );
      adoptDurableReasons(state.reportProgress.partial_reasons);
      finalized = await runOperation('report:finalize-degraded', 'Finalize report without SARIF', () =>
        finalReportActs.finalizeReportOutputs(activityInput, true),
      );
    }
    state.reportProgress = await runOperation('report:terminal', 'Saving final report state', () =>
      deterministicReportActs.persistFinalizedReportProgress(
        activityInput,
        finalized.checkpoint,
        finalized.manifestSha256,
        {
          sarifDisposition: finalized.sarifDisposition,
          pdfProvenance: finalized.pdfProvenance,
          partialReasons,
        },
      ),
    );
    adoptDurableReasons(state.reportProgress.partial_reasons);
    markCompleted('report');

    if (finalized.warningCount > 0) {
      addNonFatal({ phase: 'report-output', error: 'One or more derived report outputs emitted warnings.' });
    }
    try {
      const surfaced = await runOperation('report:surface', 'Surface customer report', () =>
        surfaceReportActs.surfaceReportOutputs(activityInput),
      );
      if (surfaced.warningCount > 0) {
        addNonFatal({ phase: 'report-surface', error: 'One or more customer report copies emitted warnings.' });
      }
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      addNonFatal({
        phase: 'report-surface',
        error: 'Customer report copies could not be refreshed; canonical outputs remain finalized.',
      });
    }
    await a.logPhaseTransition(activityInput, 'reporting', 'complete');
  }

  try {
    const durable = await deterministicReportActs.initializeDurableScanState(activityInput, exploit, stateContext);
    applyDurableSummary(durable);

    if (input.resumeFromWorkspace) {
      // The new workflow id lands in session.json before anything that can reject the resume, so a
      // validation or checkpoint-restore failure still leaves the CLI an attempt to follow.
      await deterministicReportActs.registerResumeAttempt(activityInput, input.terminatedWorkflows ?? []);
      resumeState = await deterministicReportActs.loadResumeState(
        input.resumeFromWorkspace,
        input.webUrl,
        input.repoPath,
        {
          ...(input.deliverablesSubdir !== undefined && { deliverablesSubdir: input.deliverablesSubdir }),
          expectedExploit: exploit,
        },
      );
      state.expectedAgents = [...resumeState.expectedAgents];
      state.participatingClasses = [...resumeState.participatingClasses];
      if (resumeState.miscellaneousOutcome !== undefined) miscellaneousOutcome = resumeState.miscellaneousOutcome;
      if (resumeState.reportProgress !== undefined) {
        state.reportProgress = resumeState.reportProgress;
        // Durable reasons are restored, never reconstructed from session status or errors.
        adoptDurableReasons(resumeState.reportProgress.partial_reasons);
      }

      const expectedAgentNames = resumeState.expectedAgents.filter(isAgentName);
      const incompleteAgents = expectedAgentNames.filter(
        (agentName) => !resumeState?.completedAgents.includes(agentName),
      );
      await deterministicReportActs.restoreGitCheckpoint(
        input.repoPath,
        resumeState.checkpointHash,
        incompleteAgents,
        input.deliverablesSubdir,
        {
          expectedAgents: expectedAgentNames,
          participatingClasses: resumeState.participatingClasses,
          ...(resumeState.reportProgress !== undefined && { reportProgress: resumeState.reportProgress }),
        },
      );
      await deterministicReportActs.recordResumeAttempt(
        activityInput,
        resumeState.checkpointHash,
        resumeState.originalWorkflowId,
        resumeState.completedAgents,
      );
      for (const agentName of resumeState.completedAgents) {
        if (isAgentName(agentName)) markCompleted(agentName);
      }
    }

    state.currentPhase = 'preflight';
    state.currentAgent = null;
    await preflightActs.runPreflightValidation(activityInput);
    await preflightActs.syncPlaywrightStealthConfig(activityInput);

    state.currentPhase = 'auth-validation';
    state.currentAgent = 'validate-authentication';
    const authMetrics = await authValidationActs.runAuthenticationValidation(activityInput);
    if (authMetrics !== null) state.agentMetrics['validate-authentication'] = authMetrics;
    state.currentAgent = null;

    await a.initDeliverableGit(activityInput);
    await a.syncCodePathDenyRules(activityInput);

    const allExpectedDone = state.expectedAgents.every((agentName) => state.completedAgents.includes(agentName));
    // A durable draft means report.json is already committed, so re-running the pentest phase
    // cannot change what the report says. It would only re-pay for the analysis and observe new
    // degradation reasons that the finalized deliverable, rendered from durable state, could never
    // carry — leaving the report claiming complete coverage while the session records a partial
    // run. An invalid draft is rolled back to `pending` during resume, so it still re-runs here.
    const reportAlreadyAuthored = reportIsAuthored(resumeState?.reportProgress?.stage);
    if (!allExpectedDone && !reportAlreadyAuthored) {
      // Agentic SAST overlaps the pentest: it starts here and is joined per class before
      // reconciliation, so preliminary analysis and reconnaissance never wait on it.
      const settlement = settleCapella();
      capellaSettlement = settlement;
      await runSequentialPhase('pre-recon', 'pre-recon', a.runPreReconAgent);
      await runSequentialPhase('recon', 'recon', a.runReconAgent);

      state.currentPhase = 'vulnerability-exploitation';
      state.currentAgent = 'pipelines';
      await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');
      const pipelineThunks = buildPipelineConfigs().map(
        (config) => () => runVulnExploitPipeline(config.vulnType, config.runVuln, config.runExploit, settlement),
      );
      // Launch the Miscellaneous lane concurrently with the five fixed classes; it shares the same
      // settled SARIF and joins the common barrier below.
      const miscellaneousLane = runMiscellaneousExploitLane(settlement);
      const pipelineResults = await runWithConcurrencyLimit(pipelineThunks, MAX_CONCURRENT_PIPELINES);
      // Join the sixth lane before aggregation so its outcome is always observed (never a
      // dropped rejection in the workflow VM) and a cancellation from either path propagates.
      await miscellaneousLane;
      aggregatePipelineResults(pipelineResults);
      if (state.failedPipelines.length > 0) {
        activityInput.failedClasses = state.failedPipelines.map((failure) => failure.vulnType);
      }
      await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');
    }

    await finalizeReportPipeline();

    // One terminal contract everywhere: reaching this point proved the canonical report
    // (a failed proof throws), so the durable reason set alone decides completed vs partial.
    // PDF and customer-copy warnings never create reasons and never change the status.
    const terminalStatus: 'completed' | 'partial' = partialReasons.length > 0 ? 'partial' : 'completed';
    state.status = terminalStatus;
    state.currentPhase = null;
    state.currentAgent = null;
    state.summary = computeSummary(state, usageAccountingComplete());
    await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, terminalStatus));
    return state;
  } catch (error) {
    if (hasCancellationInCauseChain(error)) {
      // A cancelled parent lets the child settle first; its cancellation is only complete once
      // the child's own promise settles. The cancellation being reported is unchanged by it.
      if (capellaSettlement !== null) await awaitCapellaSettlement(capellaSettlement);
      projectUnfinishedCapella();
      state.status = 'cancelled';
      state.error = `Cancelled during phase: ${state.currentPhase ?? 'unknown'}`;
      state.summary = computeSummary(state, usageAccountingComplete());
      await CancellationScope.nonCancellable(async () => {
        try {
          await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'cancelled'));
        } catch {
          log.warn('Failed to finalize cancelled workflow', { code: 'WORKFLOW_LOG_WRITE_FAILED' });
        }
      });
      return state;
    }

    // A hard failure does not wait for the child; parent-close termination is its cleanup.
    projectUnfinishedCapella();
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = formatWorkflowError(error, state.currentPhase, state.currentAgent);
    const errorCode = classifyErrorCode(error);
    if (errorCode) state.errorCode = errorCode;
    state.summary = computeSummary(state, usageAccountingComplete());
    try {
      await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'failed'));
    } catch {
      log.warn('Failed to finalize failed workflow', { code: 'WORKFLOW_LOG_WRITE_FAILED' });
    }
    // Terminate the workflow in Temporal's FAILED state. WARNING: this must be an
    // ApplicationFailure — any other thrown type becomes an unhandled workflow-task failure
    // that Temporal retries indefinitely, leaving the run stuck in RUNNING.
    throw ApplicationFailure.nonRetryable(state.error ?? 'Pipeline failed', 'PipelineExecutionError');
  }
}

/** OSS workflow entry point. */
export async function pentestPipelineWorkflow(input: PipelineInput): Promise<PipelineState> {
  return pentestPipeline(input);
}
