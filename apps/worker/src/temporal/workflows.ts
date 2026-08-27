// Copyright (C) 2025 Keygraph, Inc.
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
import type { CapellaWorkflowInput } from '../ai/sast/capella/temporal/activity-types.js';
import { CAPELLA_CHILD_WORKFLOW_OPTIONS, capellaWorkflow } from '../ai/sast/capella/temporal/workflow.js';
import type { CapellaRunResult, SarifRef } from '../ai/sast/types.js';
import type { AgentName, VulnType } from '../types/agents.js';
import { ALL_AGENTS } from '../types/agents.js';
import { ALL_VULN_CLASSES, type VulnClass } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import {
  appendPartialReasons,
  capellaStageDisplayName,
  type MiscellaneousOutcome,
  miscellaneousLaneIsSettled,
  type PartialReason,
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
const MAX_PIPELINE_ERROR_MESSAGE_LENGTH = 2000;
const MAX_NON_FATAL_FAILURES = 32;

function truncatePipelineErrorMessage(message: string): string {
  if (message.length <= MAX_PIPELINE_ERROR_MESSAGE_LENGTH) return message;
  return `${message.slice(0, MAX_PIPELINE_ERROR_MESSAGE_LENGTH - 20)}\n[truncated]`;
}

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
  let miscellaneousOutcome: MiscellaneousOutcome | undefined;

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
    state.nonFatalFailures.push({
      phase: failure.phase,
      error: truncatePipelineErrorMessage(failure.error),
    });
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

  function failOperation(key: string, label: string, startedAt: number, error: unknown): void {
    const message = truncatePipelineErrorMessage(error instanceof Error ? error.message : String(error));
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
      failOperation(key, label, startedAt, error);
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
    phaseName: string,
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
    effectiveSarif?: SarifRef,
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

      reconciliationStarted = true;
      await reconcileClass(vulnType, effectiveSarif);
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
      const message = truncatePipelineErrorMessage(error instanceof Error ? error.message : String(error));
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
        unattributable.push(
          truncatePipelineErrorMessage(result.reason instanceof Error ? result.reason.message : String(result.reason)),
        );
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

    const key = 'agentic-sast';
    const label = 'Agentic SAST';
    const startedAt = startOperation(key, label);
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
        };
        completeOperation(key, label, startedAt);
        if (result.coverage === 'reduced') {
          addPartialReason({ code: 'agentic_sast_reduced' });
          addNonFatal({ phase: 'agentic-sast', error: 'Agentic SAST completed with reduced coverage.' });
        }
        return result.sarif;
      }

      state.agenticSast = {
        status: 'failed',
        failedStage: result.failedStage,
        failedStageLabel: capellaStageDisplayName(result.failedStage),
        error: result.error,
        ...(result.errorCode !== undefined && { errorCode: result.errorCode }),
        completedStages: [...result.completedStages],
        durationMs: result.durationMs,
      };
      addPartialReason({ code: 'agentic_sast_failed', stage: result.failedStage });
      failOperation(key, label, startedAt, new Error(result.error));
      addNonFatal({
        phase: 'agentic-sast',
        error: result.errorCode === undefined ? result.error : `${result.error} [${result.errorCode}]`,
      });
      return undefined;
    } catch (error) {
      if (hasCancellationInCauseChain(error)) throw error;
      const message = 'Agentic SAST infrastructure failed before producing a usable result.';
      state.agenticSast = {
        status: 'failed',
        failedStage: 'workflow',
        failedStageLabel: capellaStageDisplayName('workflow'),
        error: message,
        completedStages: [],
        durationMs: Date.now() - startedAt,
      };
      addPartialReason({ code: 'agentic_sast_failed', stage: 'workflow' });
      failOperation(key, label, startedAt, new Error(message));
      addNonFatal({ phase: 'agentic-sast', error: message });
      return undefined;
    }
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
      failOperation(key, label, startedAt, error);
      const message = truncatePipelineErrorMessage(error instanceof Error ? error.message : String(error));
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
            addNonFatal({ phase: key, error: error instanceof Error ? error.message : String(error) });
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
          addNonFatal({ phase: 'report:compact', error: error instanceof Error ? error.message : String(error) });
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
      finalized = await runOperation('report:finalize-degraded', 'Finalize report without SARIF', () =>
        finalReportActs.finalizeReportOutputs(activityInput, true),
      );
    }
    if (finalized.sarifDisposition === 'render_failed') {
      addPartialReason({ code: 'report_sarif_failed' });
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
      const effectiveSarif = await runCapella();
      await runSequentialPhase('pre-recon', 'pre-recon', a.runPreReconAgent);
      await runSequentialPhase('recon', 'recon', a.runReconAgent);

      state.currentPhase = 'vulnerability-exploitation';
      state.currentAgent = 'pipelines';
      await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');
      const pipelineThunks = buildPipelineConfigs().map(
        (config) => () => runVulnExploitPipeline(config.vulnType, config.runVuln, config.runExploit, effectiveSarif),
      );
      const pipelineResults = await runWithConcurrencyLimit(pipelineThunks, MAX_CONCURRENT_PIPELINES);
      aggregatePipelineResults(pipelineResults);
      if (state.failedPipelines.length > 0) {
        activityInput.failedClasses = state.failedPipelines.map((failure) => failure.vulnType);
      }
      await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');
      if (effectiveSarif !== undefined) await runMiscellaneousPipeline(effectiveSarif);
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
      state.status = 'cancelled';
      state.error = `Cancelled during phase: ${state.currentPhase ?? 'unknown'}`;
      state.summary = computeSummary(state, usageAccountingComplete());
      await CancellationScope.nonCancellable(async () => {
        try {
          await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'cancelled'));
        } catch (completionError) {
          log.warn('Failed to finalize cancelled workflow', {
            error: completionError instanceof Error ? completionError.message : String(completionError),
          });
        }
      });
      return state;
    }

    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = formatWorkflowError(error, state.currentPhase, state.currentAgent);
    const errorCode = classifyErrorCode(error);
    if (errorCode) state.errorCode = errorCode;
    state.summary = computeSummary(state, usageAccountingComplete());
    try {
      await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'failed'));
    } catch (completionError) {
      log.warn('Failed to finalize failed workflow', {
        error: completionError instanceof Error ? completionError.message : String(completionError),
      });
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
