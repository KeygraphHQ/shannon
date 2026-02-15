import { Connection, Client } from '@temporalio/client';
import type { PipelineInput, PipelineState } from '../temporal/shared.js';
import { sanitizeHostname } from '../audit/utils.js';

const PROGRESS_QUERY = 'getProgress';

let connection: Connection | null = null;
let client: Client | null = null;

export async function getTemporalClient(): Promise<Client> {
  if (client) return client;

  const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
  connection = await Connection.connect({ address });
  client = new Client({ connection });
  return client;
}

export async function closeTemporalConnection(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
    client = null;
  }
}

export interface StartWorkflowResult {
  workflowId: string;
}

export async function startWorkflow(input: {
  webUrl: string;
  repoPath: string;
  configPath?: string;
  pipelineTestingMode?: boolean;
}): Promise<StartWorkflowResult> {
  const temporal = await getTemporalClient();

  const hostname = sanitizeHostname(input.webUrl);
  const workflowId = `${hostname}_shannon-${Date.now()}`;

  const pipelineInput: PipelineInput = {
    webUrl: input.webUrl,
    repoPath: input.repoPath,
    ...(input.configPath ? { configPath: input.configPath } : {}),
    ...(input.pipelineTestingMode ? { pipelineTestingMode: true } : {}),
  };

  await temporal.workflow.start<(i: PipelineInput) => Promise<PipelineState>>(
    'pentestPipelineWorkflow',
    {
      taskQueue: 'shannon-pipeline',
      workflowId,
      args: [pipelineInput],
    }
  );

  return { workflowId };
}

// Duplicated to avoid importing workflow-side code
interface WorkflowProgress {
  status: 'running' | 'completed' | 'failed';
  currentPhase: string | null;
  currentAgent: string | null;
  completedAgents: string[];
  failedAgent: string | null;
  error: string | null;
  startTime: number;
  agentMetrics: Record<string, {
    durationMs: number;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
    numTurns: number | null;
    model?: string;
  }>;
  summary: {
    totalCostUsd: number;
    totalDurationMs: number;
    totalTurns: number;
    agentCount: number;
  } | null;
  workflowId: string;
  elapsedMs: number;
}

export async function queryWorkflowProgress(workflowId: string): Promise<WorkflowProgress | null> {
  try {
    const temporal = await getTemporalClient();
    const handle = temporal.workflow.getHandle(workflowId);
    return await handle.query<WorkflowProgress>(PROGRESS_QUERY);
  } catch {
    return null;
  }
}
