import { defineQuery } from '@temporalio/workflow';

export type { AgentMetrics } from '../types/metrics.js';
import type { AgentMetrics } from '../types/metrics.js';
import type { PipelineConfig } from '../types/config.js';

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  pipelineConfig?: PipelineConfig;
  workflowId?: string; // Used for audit correlation
  sessionId?: string; // Workspace directory name (distinct from workflowId for named workspaces)
  resumeFromWorkspace?: string; // Workspace name to resume from
  terminatedWorkflows?: string[]; // Workflows terminated during resume
}

export interface ResumeState {
  workspaceName: string;
  originalUrl: string;
  completedAgents: string[];
  checkpointHash: string;
  originalWorkflowId: string;
}

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number; // Wall-clock time (end - start)
  totalTurns: number;
  agentCount: number;
}

export interface PipelineState {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  summary: PipelineSummary | null;
}

// Extended state returned by getProgress query (includes computed fields)
export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
}

// Result from a single vuln→exploit pipeline
export interface VulnExploitPipelineResult {
  vulnType: string;
  vulnMetrics: AgentMetrics | null;
  exploitMetrics: AgentMetrics | null;
  exploitDecision: {
    shouldExploit: boolean;
    vulnerabilityCount: number;
  } | null;
  error: string | null;
}

export const getProgress = defineQuery<PipelineProgress>('getProgress');
