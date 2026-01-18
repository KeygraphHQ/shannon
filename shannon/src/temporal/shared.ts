import { defineQuery } from '@temporalio/workflow';

// === Types ===

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId?: string; // Added by client, used for audit correlation
  scanId?: string; // Database scan ID for web application integration
  organizationId?: string; // Organization ID for multi-tenant isolation

  // Container isolation settings (Epic 006)
  containerIsolationEnabled?: boolean | undefined; // Enable container isolation for this scan
  planId?: string | undefined; // Subscription plan for resource limits (free, pro, enterprise)
  containerImage?: string | undefined; // Override default scanner image
  containerImageDigest?: string | undefined; // Pin to specific image digest
  targetHostname?: string | undefined; // Hostname for network policy egress rules
}

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
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

  // Container isolation state (Epic 006)
  containerInfo?: {
    containerId: string;
    podName: string;
    namespace: string;
    status: string;
  };
}

// Extended state returned by getProgress query (includes computed fields)
export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
  scanId?: string; // Database scan ID (when triggered from web app)
  organizationId?: string; // Organization ID (when triggered from web app)
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

// === Queries ===

export const getProgress = defineQuery<PipelineProgress>('getProgress');
