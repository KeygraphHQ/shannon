/**
 * Temporal client for Shannon web application.
 *
 * Provides functions to interact with the Temporal workflow engine
 * for scan orchestration, progress tracking, and cancellation.
 */

import { Client, Connection } from '@temporalio/client';
import type { PipelineProgress, PipelineInput } from '../../../src/temporal/shared';

let clientInstance: Client | null = null;
let connectionInstance: Connection | null = null;

/**
 * Get or create a singleton Temporal client.
 * Uses TEMPORAL_ADDRESS environment variable for connection.
 */
export async function getTemporalClient(): Promise<Client> {
  if (!clientInstance) {
    const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

    connectionInstance = await Connection.connect({ address });
    clientInstance = new Client({ connection: connectionInstance });
  }
  return clientInstance;
}

/**
 * Query a workflow's progress state.
 *
 * @param workflowId - The Temporal workflow ID (typically the scan's temporalWorkflowId)
 * @returns The current progress state including phase, agent, and metrics
 */
export async function getWorkflowProgress(
  workflowId: string
): Promise<PipelineProgress> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);
  return handle.query<PipelineProgress>('getProgress');
}

/**
 * Start a new scan workflow.
 *
 * @param params - Scan parameters
 * @returns The workflow ID and run ID
 */
export async function startScanWorkflow(params: {
  projectId: string;
  organizationId: string;
  targetUrl: string;
  repositoryUrl?: string;
  scanId: string;
}): Promise<{ workflowId: string; runId: string }> {
  const client = await getTemporalClient();

  const workflowId = `scan-${params.scanId}`;

  const workflowInput: PipelineInput = {
    webUrl: params.targetUrl,
    repoPath: params.repositoryUrl || '',
    workflowId,
  };

  const handle = await client.workflow.start('pentestPipelineWorkflow', {
    taskQueue: 'shannon-pipeline',
    workflowId,
    args: [workflowInput],
  });

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  };
}

/**
 * Cancel a running scan workflow.
 *
 * @param workflowId - The Temporal workflow ID to cancel
 */
export async function cancelScanWorkflow(workflowId: string): Promise<void> {
  const client = await getTemporalClient();
  const handle = client.workflow.getHandle(workflowId);
  await handle.cancel();
}

/**
 * Close the Temporal connection.
 * Call this during application shutdown.
 */
export async function closeTemporalConnection(): Promise<void> {
  if (connectionInstance) {
    await connectionInstance.close();
    connectionInstance = null;
    clientInstance = null;
  }
}
