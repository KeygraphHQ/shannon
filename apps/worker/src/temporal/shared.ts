import { defineQuery } from '@temporalio/workflow';

export type { AgentMetrics } from '../types/metrics.js';

import type { DistributedConfig, PipelineConfig, VulnClass } from '../types/config.js';
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
  deliverablesSubdir?: string; // Override deliverables path (default: '.shannon/deliverables')
  auditDir?: string; // Override audit log directory (default: './workspaces')
  promptDir?: string; // Override prompt template directory
  sastSarifPath?: string; // Optional path for consumer-supplied findings input
  checkpointsEnabled?: boolean; // Enable checkpoint activities (default: false)
  vulnClasses?: VulnClass[]; // omitted = all five
  exploit?: boolean; // false skips the exploitation phase
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
  status: 'running' | 'completed' | 'failed' | 'cancelled' | 'partial';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  // Vuln classes whose pipeline failed while at least one other succeeded. Drives the
  // partial terminal status so a crashed class isn't reported as if it fully passed.
  failedPipelines: { vulnType: VulnClass; error: string }[];
  failedAgent: string | null;
  error: string | null;
  errorCode?: ErrorCode;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  summary: PipelineSummary | null;
}

/**
 * Thrown by pentestPipeline() when the run fails, carrying the fully-populated
 * PipelineState (real agentMetrics, completedAgents, summary) so a consumer can
 * report actual spend instead of synthesizing a zeroed failed state. `cause`
 * preserves the original error for classification and Temporal failure reporting.
 */
export class PipelineExecutionError extends Error {
  override name = 'PipelineExecutionError' as const;
  readonly state: PipelineState;
  constructor(message: string, state: PipelineState, options?: { cause?: unknown }) {
    super(message, options);
    this.state = state;
  }
}

// Extended state returned by getProgress query (includes computed fields)
export interface PipelineProgress extends PipelineState {
  workflowId: string;
  elapsedMs: number;
}

// Result from a single vuln→exploit pipeline
export interface VulnExploitPipelineResult {
  vulnType: VulnClass;
  vulnMetrics: AgentMetrics | null;
  exploitMetrics: AgentMetrics | null;
  exploitDecision: {
    shouldExploit: boolean;
    vulnerabilityCount: number;
  } | null;
  error: string | null;
}

export const getProgress = defineQuery<PipelineProgress>('getProgress');
