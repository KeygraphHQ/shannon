// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Temporal workflow for Shannon pentest pipeline.
 *
 * Orchestrates the 5-phase penetration testing workflow:
 * 1. Pre-Reconnaissance (sequential)
 * 2. Reconnaissance (sequential)
 * 3. Vulnerability Analysis (parallel - 5 agents)
 * 4. Exploitation (parallel - 5 agents)
 * 5. Reporting (sequential)
 *
 * Features:
 * - Queryable state via getProgress
 * - Automatic retry with backoff for transient/billing errors
 * - Non-retryable classification for permanent errors
 * - Audit correlation via workflowId
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
} from './shared.js';

// Activity proxy with retry configuration
const acts = proxyActivities<typeof activities>({
  startToCloseTimeout: '2 hours',
  heartbeatTimeout: '30 seconds',
  retry: {
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
  },
});

export async function pentestPipelineWorkflow(
  input: PipelineInput
): Promise<PipelineState> {
  const { workflowId } = workflowInfo();

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
    state.agentMetrics['pre-recon'] =
      await acts.runPreReconAgent(activityInput);
    state.completedAgents.push('pre-recon');

    // === Phase 2: Reconnaissance ===
    state.currentPhase = 'recon';
    state.currentAgent = 'recon';
    state.agentMetrics['recon'] = await acts.runReconAgent(activityInput);
    state.completedAgents.push('recon');

    // === Phase 3: Vulnerability Analysis (Parallel) ===
    state.currentPhase = 'vulnerability-analysis';
    state.currentAgent = 'vuln-agents';

    const vulnResults = await Promise.all([
      acts.runInjectionVulnAgent(activityInput),
      acts.runXssVulnAgent(activityInput),
      acts.runAuthVulnAgent(activityInput),
      acts.runSsrfVulnAgent(activityInput),
      acts.runAuthzVulnAgent(activityInput),
    ]);

    const vulnAgents = [
      'injection-vuln',
      'xss-vuln',
      'auth-vuln',
      'ssrf-vuln',
      'authz-vuln',
    ] as const;
    for (let i = 0; i < vulnAgents.length; i++) {
      const agentName = vulnAgents[i];
      const metrics = vulnResults[i];
      if (agentName && metrics) {
        state.agentMetrics[agentName] = metrics;
        state.completedAgents.push(agentName);
      }
    }

    // === Phase 4: Exploitation (Parallel) ===
    state.currentPhase = 'exploitation';
    state.currentAgent = 'exploit-agents';

    const exploitResults = await Promise.all([
      acts.runInjectionExploitAgent(activityInput),
      acts.runXssExploitAgent(activityInput),
      acts.runAuthExploitAgent(activityInput),
      acts.runSsrfExploitAgent(activityInput),
      acts.runAuthzExploitAgent(activityInput),
    ]);

    const exploitAgents = [
      'injection-exploit',
      'xss-exploit',
      'auth-exploit',
      'ssrf-exploit',
      'authz-exploit',
    ] as const;
    for (let i = 0; i < exploitAgents.length; i++) {
      const agentName = exploitAgents[i];
      const metrics = exploitResults[i];
      if (agentName && metrics) {
        state.agentMetrics[agentName] = metrics;
        state.completedAgents.push(agentName);
      }
    }

    // === Phase 5: Reporting ===
    state.currentPhase = 'reporting';
    state.currentAgent = 'report';

    // First, assemble the concatenated report from exploitation evidence files
    await acts.assembleReportActivity(activityInput);

    // Then run the report agent to add executive summary and clean up
    state.agentMetrics['report'] = await acts.runReportAgent(activityInput);
    state.completedAgents.push('report');

    // === Complete ===
    state.status = 'completed';
    state.currentPhase = null;
    state.currentAgent = null;
    return state;
  } catch (error) {
    state.status = 'failed';
    state.failedAgent = state.currentAgent;
    state.error = error instanceof Error ? error.message : String(error);
    throw error;
  }
}
