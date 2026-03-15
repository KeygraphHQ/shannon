/**
 * Temporal client for the Shannon dashboard.
 *
 * Connects to the same Temporal server as the worker and queries
 * workflow state via the getProgress query + list workflows API.
 */

import { Connection, Client } from '@temporalio/client';

// Types mirrored from src/temporal/shared.ts (kept in sync manually —
// dashboard is a separate package so we don't import from the main project)

export interface PipelineSummary {
  totalCostUsd: number;
  totalDurationMs: number;
  totalTurns: number;
  agentCount: number;
}

export interface AgentMetrics {
  agentName: string;
  model: string;
  durationMs: number;
  costUsd: number;
  turns: number;
  success: boolean;
  error?: string;
}

export interface PipelineProgress {
  workflowId: string;
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, AgentMetrics>;
  summary: PipelineSummary | null;
  elapsedMs: number;
}

export interface WorkflowInfo {
  workflowId: string;
  runId: string;
  status: string;
  type: string;
  startTime: string;
  closeTime: string | null;
  executionTime: string | null;
  // Enriched from getProgress query (only for running workflows)
  progress?: PipelineProgress;
}

// Singleton connection — reused across requests
let clientPromise: Promise<Client> | null = null;

function getTemporalAddress(): string {
  return process.env.TEMPORAL_ADDRESS || 'localhost:7233';
}

export function getTemporalClient(): Promise<Client> {
  if (!clientPromise) {
    clientPromise = (async () => {
      const address = getTemporalAddress();
      const connection = await Connection.connect({ address });
      return new Client({ connection });
    })();
  }
  return clientPromise;
}

/**
 * List all workflows from Temporal, optionally filtered by status.
 */
export async function listWorkflows(options?: {
  status?: string;
  pageSize?: number;
}): Promise<WorkflowInfo[]> {
  const client = await getTemporalClient();
  const pageSize = options?.pageSize || 100;

  // Build query string for workflow list
  let query = 'WorkflowType = "pentestPipelineWorkflow"';
  if (options?.status) {
    const statusMap: Record<string, string> = {
      running: 'Running',
      completed: 'Completed',
      failed: 'Failed',
      terminated: 'Terminated',
      cancelled: 'Canceled',
    };
    const mapped = statusMap[options.status.toLowerCase()];
    if (mapped) {
      query += ` AND ExecutionStatus = "${mapped}"`;
    }
  }

  const workflows: WorkflowInfo[] = [];
  let count = 0;

  for await (const workflow of client.workflow.list({ query })) {
    if (count >= pageSize) break;

    workflows.push({
      workflowId: workflow.workflowId,
      runId: workflow.runId,
      status: workflow.status.name.toLowerCase(),
      type: workflow.workflowType || 'unknown',
      startTime: workflow.startTime?.toISOString() || '',
      closeTime: workflow.closeTime?.toISOString() || null,
      executionTime: workflow.executionTime?.toISOString() || null,
    });

    count++;
  }

  return workflows;
}

/**
 * Query a running workflow's progress via the getProgress query.
 */
export async function getWorkflowProgress(
  workflowId: string
): Promise<PipelineProgress | null> {
  try {
    const client = await getTemporalClient();
    const handle = client.workflow.getHandle(workflowId);
    const progress = await handle.query<PipelineProgress>('getProgress');
    return progress;
  } catch {
    // Workflow may have completed or query not available
    return null;
  }
}

/**
 * List workflows enriched with progress data for running ones.
 */
export async function listWorkflowsWithProgress(options?: {
  status?: string;
  pageSize?: number;
}): Promise<WorkflowInfo[]> {
  const workflows = await listWorkflows(options);

  // Enrich running workflows with progress data (in parallel)
  const enriched = await Promise.all(
    workflows.map(async (wf) => {
      if (wf.status === 'running') {
        const progress = await getWorkflowProgress(wf.workflowId);
        if (progress) {
          return { ...wf, progress };
        }
      }
      return wf;
    })
  );

  return enriched;
}
