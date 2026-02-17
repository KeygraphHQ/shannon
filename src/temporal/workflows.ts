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
  log,
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
  type ResumeState,
} from './shared.js';
import type { VulnType } from '../queue-validation.js';
import type { AgentName } from '../types/agents.js';
import { ALL_AGENTS } from '../types/agents.js';
import { toWorkflowSummary } from './summary-mapper.js';

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
  heartbeatTimeout: '60 minutes', // Extended for sub-agent execution (SDK blocks event loop during Task tool calls)
  retry: PRODUCTION_RETRY,
});

// Activity proxy with testing retry configuration (fast)
const testActs = proxyActivities<typeof activities>({
  startToCloseTimeout: '30 minutes',
  heartbeatTimeout: '30 minutes', // Extended for sub-agent execution in testing
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
  // sessionId is workspace name for resume, or workflowId for new runs
  const sessionId = input.sessionId || input.resumeFromWorkspace || workflowId;

  const activityInput: ActivityInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    workflowId,
    sessionId,
    ...(input.configPath !== undefined && { configPath: input.configPath }),
    ...(input.outputPath !== undefined && { outputPath: input.outputPath }),
    ...(input.pipelineTestingMode !== undefined && {
      pipelineTestingMode: input.pipelineTestingMode,
    }),
  };

  // === RESUME LOGIC ===
  let resumeState: ResumeState | null = null;

  if (input.resumeFromWorkspace) {
    // Load resume state from existing workspace
    resumeState = await a.loadResumeState(
      input.resumeFromWorkspace,
      input.webUrl,
      input.repoPath
    );

    // Restore git checkpoint and clean up partial deliverables
    const incompleteAgents = ALL_AGENTS.filter(
      (agentName) => !resumeState!.completedAgents.includes(agentName)
    ) as AgentName[];

    await a.restoreGitCheckpoint(
      input.repoPath,
      resumeState.checkpointHash,
      incompleteAgents
    );

    // Check if all agents are already complete
    if (resumeState.completedAgents.length === ALL_AGENTS.length) {
      log.info(`All ${ALL_AGENTS.length} agents already completed. Nothing to resume.`);
      state.status = 'completed';
      state.completedAgents = [...resumeState.completedAgents];
      state.summary = computeSummary(state);
      return state;
    }

    // Record resume attempt in session.json and write resume header to workflow.log
    await a.recordResumeAttempt(
      activityInput,
      input.terminatedWorkflows || [],
      resumeState.checkpointHash,
      resumeState.originalWorkflowId,
      resumeState.completedAgents
    );

    log.info('Resume state loaded and workspace restored');
  }

  // Helper to check if an agent should be skipped
  const shouldSkip = (agentName: string): boolean => {
    return resumeState?.completedAgents.includes(agentName) ?? false;
  };

  try {
    // === Phase 1: Pre-Reconnaissance ===
    if (!shouldSkip('pre-recon')) {
      state.currentPhase = 'pre-recon';
      state.currentAgent = 'pre-recon';
      await a.logPhaseTransition(activityInput, 'pre-recon', 'start');
      state.agentMetrics['pre-recon'] =
        await a.runPreReconAgent(activityInput);
      state.completedAgents.push('pre-recon');
      await a.logPhaseTransition(activityInput, 'pre-recon', 'complete');
    } else {
      log.info('Skipping pre-recon (already complete)');
      state.completedAgents.push('pre-recon');
    }

    // === Phase 2: Reconnaissance ===
    if (!shouldSkip('recon')) {
      state.currentPhase = 'recon';
      state.currentAgent = 'recon';
      await a.logPhaseTransition(activityInput, 'recon', 'start');
      state.agentMetrics['recon'] = await a.runReconAgent(activityInput);
      state.completedAgents.push('recon');
      await a.logPhaseTransition(activityInput, 'recon', 'complete');
    } else {
      log.info('Skipping recon (already complete)');
      state.completedAgents.push('recon');
    }

    // === Phases 3-4: Vulnerability Analysis + Exploitation (Pipelined) ===
    // Each vuln type runs as an independent pipeline:
    // vuln agent → queue check → conditional exploit agent
    // This eliminates the synchronization barrier between phases - each exploit
    // starts immediately when its vuln agent finishes, not waiting for all.
    state.currentPhase = 'vulnerability-exploitation';
    state.currentAgent = 'pipelines';
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'start');

    // Helper: Run a single vuln→exploit pipeline with skip logic
    async function runVulnExploitPipeline(
      vulnType: VulnType,
      runVulnAgent: () => Promise<AgentMetrics>,
      runExploitAgent: () => Promise<AgentMetrics>
    ): Promise<VulnExploitPipelineResult> {
      const vulnAgentName = `${vulnType}-vuln`;
      const exploitAgentName = `${vulnType}-exploit`;

      // Step 1: Run vulnerability agent (or skip if completed)
      let vulnMetrics: AgentMetrics | null = null;
      if (!shouldSkip(vulnAgentName)) {
        vulnMetrics = await runVulnAgent();
      } else {
        log.info(`Skipping ${vulnAgentName} (already complete)`);
      }

      // Step 2: Check exploitation queue (only if vuln agent ran or completed previously)
      const decision = await a.checkExploitationQueue(activityInput, vulnType);

      // Step 3: Conditionally run exploit agent (skip if already completed)
      let exploitMetrics: AgentMetrics | null = null;
      if (decision.shouldExploit) {
        if (!shouldSkip(exploitAgentName)) {
          exploitMetrics = await runExploitAgent();
        } else {
          log.info(`Skipping ${exploitAgentName} (already complete)`);
        }
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

    // Determine which pipelines to run (skip if both vuln and exploit completed)
    const pipelinesToRun: Array<Promise<VulnExploitPipelineResult>> = [];

    // Only run pipeline if at least one agent (vuln or exploit) is incomplete
    const pipelineConfigs: Array<{
      vulnType: VulnType;
      vulnAgent: string;
      exploitAgent: string;
      runVuln: () => Promise<AgentMetrics>;
      runExploit: () => Promise<AgentMetrics>;
    }> = [
      {
        vulnType: 'injection',
        vulnAgent: 'injection-vuln',
        exploitAgent: 'injection-exploit',
        runVuln: () => a.runInjectionVulnAgent(activityInput),
        runExploit: () => a.runInjectionExploitAgent(activityInput),
      },
      {
        vulnType: 'xss',
        vulnAgent: 'xss-vuln',
        exploitAgent: 'xss-exploit',
        runVuln: () => a.runXssVulnAgent(activityInput),
        runExploit: () => a.runXssExploitAgent(activityInput),
      },
      {
        vulnType: 'auth',
        vulnAgent: 'auth-vuln',
        exploitAgent: 'auth-exploit',
        runVuln: () => a.runAuthVulnAgent(activityInput),
        runExploit: () => a.runAuthExploitAgent(activityInput),
      },
      {
        vulnType: 'ssrf',
        vulnAgent: 'ssrf-vuln',
        exploitAgent: 'ssrf-exploit',
        runVuln: () => a.runSsrfVulnAgent(activityInput),
        runExploit: () => a.runSsrfExploitAgent(activityInput),
      },
      {
        vulnType: 'authz',
        vulnAgent: 'authz-vuln',
        exploitAgent: 'authz-exploit',
        runVuln: () => a.runAuthzVulnAgent(activityInput),
        runExploit: () => a.runAuthzExploitAgent(activityInput),
      },
    ];

    for (const config of pipelineConfigs) {
      const vulnComplete = shouldSkip(config.vulnAgent);
      const exploitComplete = shouldSkip(config.exploitAgent);

      // Only run pipeline if at least one agent needs to run
      if (!vulnComplete || !exploitComplete) {
        pipelinesToRun.push(
          runVulnExploitPipeline(config.vulnType, config.runVuln, config.runExploit)
        );
      } else {
        log.info(
          `Skipping entire ${config.vulnType} pipeline (both agents complete)`
        );
        // Still need to mark them as completed in state
        state.completedAgents.push(config.vulnAgent, config.exploitAgent);
      }
    }

    // Run pipelines in parallel with graceful failure handling
    // Promise.allSettled ensures other pipelines continue if one fails
    const pipelineResults = await Promise.allSettled(pipelinesToRun);

    // Aggregate results from all pipelines
    const failedPipelines: string[] = [];
    for (const result of pipelineResults) {
      if (result.status === 'fulfilled') {
        const { vulnType, vulnMetrics, exploitMetrics } = result.value;

        // Record vuln agent
        const vulnAgentName = `${vulnType}-vuln`;
        if (vulnMetrics) {
          state.agentMetrics[vulnAgentName] = vulnMetrics;
          state.completedAgents.push(vulnAgentName);
        } else if (shouldSkip(vulnAgentName)) {
          // Agent was skipped because already complete
          state.completedAgents.push(vulnAgentName);
        }

        // Record exploit agent (if it ran)
        const exploitAgentName = `${vulnType}-exploit`;
        if (exploitMetrics) {
          state.agentMetrics[exploitAgentName] = exploitMetrics;
          state.completedAgents.push(exploitAgentName);
        } else if (shouldSkip(exploitAgentName)) {
          // Agent was skipped because already complete
          state.completedAgents.push(exploitAgentName);
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
      log.warn(`${failedPipelines.length} pipeline(s) failed`, {
        failures: failedPipelines,
      });
    }

    // Update phase markers
    state.currentPhase = 'exploitation';
    state.currentAgent = null;
    await a.logPhaseTransition(activityInput, 'vulnerability-exploitation', 'complete');

    // === Phase 5: Reporting ===
    if (!shouldSkip('report')) {
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
    } else {
      log.info('Skipping report (already complete)');
      state.completedAgents.push('report');
    }

    // === Complete ===
    state.status = 'completed';
    state.currentPhase = null;
    state.currentAgent = null;
    state.summary = computeSummary(state);

    // Log workflow completion summary
    await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'completed'));

    return state;
  } catch (error) {
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    state.summary = computeSummary(state);

    // Log workflow failure summary
    await a.logWorkflowComplete(activityInput, toWorkflowSummary(state, 'failed'));

    throw error;
  }
}
