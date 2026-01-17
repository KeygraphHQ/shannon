/**
 * Temporal types for Shannon web application.
 *
 * These types mirror the types in src/temporal/shared.ts but are
 * standalone to avoid importing @temporalio/workflow in the web app.
 */

export interface AgentMetrics {
  durationMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  numTurns: number | null;
}

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number;
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

export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
  scanId?: string;
  organizationId?: string;
}

export interface PipelineInput {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  outputPath?: string;
  pipelineTestingMode?: boolean;
  workflowId?: string;
  scanId?: string;
  organizationId?: string;
}
