// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal workflow for Shannon pentest pipeline.
 *
 * Orchestrates the penetration testing workflow:
 * 1. Pre-Reconnaissance (sequential)
 * 2. Reconnaissance (sequential)
 * 3-4. Vulnerability + Exploitation (5 pipelined pairs in parallel)
 *      Each pair: vuln agent → queue check → conditional exploit
 *      No synchronization barrier - exploits start when their vuln finishes
 * 5. Reporting (sequential)
 *
 * Features:
 * - Queryable state via getProgress
 * - Automatic retry with backoff for transient/billing errors
 * - Non-retryable classification for permanent errors
 * - Audit correlation via workflowId
 * - Graceful failure handling: pipelines continue if one fails
 */

import {
  proxyActivities,
  setHandler,
  workflowInfo,
} from '@temporalio/workflow';
import type * as activities from './activities.js';
import type { ActivityInput } from './activities.js';
import {
  getProgress,
  type PipelineInput,
  type PipelineState,
  type PipelineProgress,
  type PipelineSummary,
  type VulnExploitPipelineResult,
  type AgentMetrics,
} from './shared.js';
import type { VulnType } from '../queue-validation.js';

// Retry configuration for production (long intervals for billing recovery)
const PRODUCTION_RETRY = {
  initialInterval: '5 minutes',
  maximumInterval: '30 minutes',
  backoffCoefficient: 2,
  maximumAttempts: 50,
  nonRetryableErrorTypes: [
    'AuthenticationError',
    'PermissionError',
    'InvalidRequestError',
    'RequestTooLargeError',
    'ConfigurationError',
    'InvalidTargetError',
    'ExecutionLimitError',
  ],
};

// Retry configuration for pipeline testing (fast iteration)
const TESTING_RETRY = {
  initialInterval: '10 seconds',
  maximumInterval: '30 seconds',
  backoffCoefficient: 2,
  maximumAttempts: 5,
  nonRetryableErrorTypes: PRODUCTION_RETRY.nonRetryableErrorTypes,
};

// Activity proxy with production retry configuration (default)
const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '10 minutes', // Long timeout for resource-constrained workers with many concurrent activities
  retry: PRODUCTION_RETRY,
});

// Activity proxy with testing retry configuration (fast)
const testActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '10 minutes',
  heartbeatTimeout: '5 minutes', // Shorter for testing but still tolerant of resource contention
  retry: TESTING_RETRY,
});

/**
 * Compute aggregated metrics from the current pipeline state.
 * Called on both success and failure to provide partial metrics.
 */
function computeSummary(state: PipelineState): PipelineSummary {
  const metrics = Object.values(state.agentMetrics);
  return {
    totalCostUsd: metrics.reduce((sum, m) => sum + (m.costUsd ?? 0), 0),
    totalDurationMs: Date.now() - state.startTime,
    totalTurns: metrics.reduce((sum, m) => sum + (m.numTurns ?? 0), 0),
    agentCount: state.completedAgents.length,
  };
}

export async function pentestPipelineWorkflow(
  input: PipelineInput
): Promise<PipelineState> {
  const { workflowId } = workflowInfo();

  // Select activity proxy based on testing mode
  // Pipeline testing uses fast retry intervals (10s) for quick iteration
  const a = input.pipelineTestingMode ? testActs : acts;

  // Workflow state (queryable)
  const state: PipelineState = {
    status: 'running',
    currentPhase: null,
    currentAgent: null,
    completedAgents: [],
    failedAgent: null,
    error: null,
    startTime: Date.now(),
    agentMetrics: {},
    summary: null,
  };

  // Register query handler for real-time progress inspection
  setHandler(getProgress, (): PipelineProgress => ({
    ...state,
    workflowId,
    elapsedMs: Date.now() - state.startTime,
  }));

  // Build ActivityInput with required workflowId for audit correlation
  // Activities require workflowId (non-optional), PipelineInput has it optional
  // Use spread to conditionally include optional properties (exactOptionalPropertyTypes)
  const activityInput: ActivityInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    workflowId,
    ...(input.configPath !== undefined && { configPath: input.configPath }),
    ...(input.outputPath !== undefined && { outputPath: input.outputPath }),
    ...(input.pipelineTestingMode !== undefined && {
      pipelineTestingMode: input.pipelineTestingMode,
    }),
  };

  try {
    // === Phase 1: Pre-Reconnaissance ===
    state.currentPhase = 'pre-recon';
    state.currentAgent = 'pre-recon';
    await a.logPhaseTransition(activityInput, 'pre-recon', 'start');
    state.agentMetrics['pre-recon'] =
      await a.runPreReconAgent(activityInput);
    state.completedAgents.push('pre-recon');
    await a.logPhaseTransition(activityInput, 'pre-recon', 'complete');

    // === Phase 2: Reconnaissance ===
    state.currentPhase = 'recon';
    state.currentAgent = 'recon';
    await a.logPhaseTransition(activityInput, 'recon', 'start');
    state.agentMetrics['recon'] = await a.runReconAgent(activityInput);
    state.completedAgents.push('recon');
    await a.logPhaseTransition(activityInput, 'recon', 'complete');

    // === Phases 3-4: Vulnerability Analysis + Exploitation (Pipelined) ===
    // Each vuln type runs as an independent pipeline:
    // vuln agent → queue check → conditional exploit agent
    // This eliminates the synchronization barrier between phases - each exploit
    // starts immediately when its vuln agent finishes, not waiting for all.
    state.currentPhase = 'vulnerability-exploitation';
    state.currentAgent = 'pipelines';
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');

    // Helper: Run a single vuln→exploit pipeline
    async function runVulnExploitPipeline(
      vulnType: VulnType,
      runVulnAgent: () => Promise<AgentMetrics>,
      runExploitAgent: () => Promise<AgentMetrics>
    ): Promise<VulnExploitPipelineResult> {
      // Step 1: Run vulnerability agent
      const vulnMetrics = await runVulnAgent();

      // Step 2: Check exploitation queue (starts immediately after vuln)
      const decision = await a.checkExploitationQueue(activityInput, vulnType);

      // Step 3: Conditionally run exploit agent
      let exploitMetrics: AgentMetrics | null = null;
      if (decision.shouldExploit) {
        exploitMetrics = await runExploitAgent();
      }

      return {
        vulnType,
        vulnMetrics,
        exploitMetrics,
        exploitDecision: {
          shouldExploit: decision.shouldExploit,
          vulnerabilityCount: decision.vulnerabilityCount,
        },
        error: null,
      };
    }

    // Run all 5 pipelines in parallel with graceful failure handling
    // Promise.allSettled ensures other pipelines continue if one fails
    const pipelineResults = await Promise.allSettled([
      runVulnExploitPipeline(
        'injection',
        () => a.runInjectionVulnAgent(activityInput),
        () => a.runInjectionExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'xss',
        () => a.runXssVulnAgent(activityInput),
        () => a.runXssExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'auth',
        () => a.runAuthVulnAgent(activityInput),
        () => a.runAuthExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'ssrf',
        () => a.runSsrfVulnAgent(activityInput),
        () => a.runSsrfExploitAgent(activityInput)
      ),
      runVulnExploitPipeline(
        'authz',
        () => a.runAuthzVulnAgent(activityInput),
        () => a.runAuthzExploitAgent(activityInput)
      ),
    ]);

    // Aggregate results from all pipelines
    const failedPipelines: string[] = [];
    for (const result of pipelineResults) {
      if (result.status === 'fulfilled') {
        const { vulnType, vulnMetrics, exploitMetrics } = result.value;

        // Record vuln agent metrics
        if (vulnMetrics) {
          state.agentMetrics[`${vulnType}-vuln`] = vulnMetrics;
          state.completedAgents.push(`${vulnType}-vuln`);
        }

        // Record exploit agent metrics (if it ran)
        if (exploitMetrics) {
          state.agentMetrics[`${vulnType}-exploit`] = exploitMetrics;
          state.completedAgents.push(`${vulnType}-exploit`);
        }
      } else {
        // Pipeline failed - log error but continue with others
        const errorMsg =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failedPipelines.push(errorMsg);
      }
    }

    // Log any pipeline failures (workflow continues despite failures)
    if (failedPipelines.length > 0) {
      console.log(
        `⚠️ ${failedPipelines.length} pipeline(s) failed:`,
        failedPipelines
      );
    }

    // Update phase markers
    state.currentPhase = 'exploitation';
    state.currentAgent = null;
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');

    // === Phase 5: Reporting ===
    state.currentPhase = 'reporting';
    state.currentAgent = 'report';
    await a.logPhaseTransition(activityInput, 'reporting', 'start');

    // First, assemble the concatenated report from exploitation evidence files
    await a.assembleReportActivity(activityInput);

    // Then run the report agent to add executive summary and clean up
    state.agentMetrics['report'] = await a.runReportAgent(activityInput);
    state.completedAgents.push('report');

    // Inject model metadata into the final report
    await a.injectReportMetadataActivity(activityInput);

    await a.logPhaseTransition(activityInput, 'reporting', 'complete');

    // === Complete ===
    state.status = 'completed';
    state.currentPhase = null;
    state.currentAgent = null;
    state.summary = computeSummary(state);

    // Log workflow completion summary
    await a.logWorkflowComplete(activityInput, {
      status: 'completed',
      totalDurationMs: state.summary.totalDurationMs,
      totalCostUsd: state.summary.totalCostUsd,
      completedAgents: state.completedAgents,
      agentMetrics: Object.fromEntries(
        Object.entries(state.agentMetrics).map(([name, m]) => [
          name,
          { durationMs: m.durationMs, costUsd: m.costUsd },
        ])
      ),
    });

    return state;
  } catch (error) {
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    state.summary = computeSummary(state);

    // Log workflow failure summary
    await a.logWorkflowComplete(activityInput, {
      status: 'failed',
      totalDurationMs: state.summary.totalDurationMs,
      totalCostUsd: state.summary.totalCostUsd,
      completedAgents: state.completedAgents,
      agentMetrics: Object.fromEntries(
        Object.entries(state.agentMetrics).map(([name, m]) => [
          name,
          { durationMs: m.durationMs, costUsd: m.costUsd },
        ])
      ),
      error: state.error ?? undefined,
    });

    throw error;
  }
}
