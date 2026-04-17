import { defineQuery } from '@temporalio/workflow';

export type { AgentMetrics } from '../types/metrics.js';

import type { DistributedConfig, PipelineConfig, ProviderConfig } from '../types/config.js';
import type { ErrorCode } from '../types/errors.js';
import type { AgentMetrics } from '../types/metrics.js';

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

  // Config fields — serializable, flow through to ActivityInput → getOrCreateContainer()
  configYAML?: string; // Raw YAML string (parsed in activity, not workflow — workflow sandbox can't use Node.js)
  configData?: DistributedConfig; // Pre-parsed config (bypasses file loading)
  apiKey?: string; // API key override (avoids process.env mutation)
  deliverablesSubdir?: string; // Override deliverables path (default: '.shannon/deliverables')
  auditDir?: string; // Override audit log directory (default: './workspaces')
  promptDir?: string; // Override prompt template directory
  sastSarifPath?: string; // Optional path for consumer-supplied findings input
  checkpointsEnabled?: boolean; // Enable checkpoint activities (default: false)
  skipGitCheck?: boolean; // Skip .git directory validation in preflight (e.g. when .git is removed after clone)
  providerConfig?: ProviderConfig; // LLM provider configuration (Bedrock, Vertex, etc.)
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
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  errorCode?: ErrorCode;
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
