/**
 * Temporal client for Shannon web application.
 *
 * Provides functions to interact with the Temporal workflow engine
 * for scan orchestration, progress tracking, and cancellation.
 *
 * Uses dynamic imports to avoid build failures when Temporal SDK
 * is not installed (e.g., during initial development).
 */

import type { PipelineProgress, PipelineInput } from './types';

// Cached client instances
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clientInstance: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let connectionInstance: any = null;

/**
 * Check if Temporal SDK is available.
 */
async function getTemporalModule(): Promise<{
  Client: new (options: { connection: unknown }) => unknown;
  Connection: { connect: (options: { address: string }) => Promise<unknown> };
} | null> {
  try {
    // Dynamic import to avoid build-time dependency
    // @ts-expect-error - Dynamic import may not have types available
    return await import('@temporalio/client');
  } catch {
    return null;
  }
}

/**
 * Get or create a singleton Temporal client.
 * Uses TEMPORAL_ADDRESS environment variable for connection.
 */
export async function getTemporalClient(): Promise<unknown> {
  if (!clientInstance) {
    const temporal = await getTemporalModule();
    if (!temporal) {
      throw new Error(
        'Temporal SDK (@temporalio/client) is not installed. ' +
          'Install it with: npm install @temporalio/client'
      );
    }

    const address = process.env.TEMPORAL_ADDRESS || 'localhost:7233';

    try {
      connectionInstance = await temporal.Connection.connect({ address });
      clientInstance = new temporal.Client({ connection: connectionInstance });
    } catch (error) {
      throw new Error(
        `Failed to connect to Temporal at ${address}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (await getTemporalClient()) as any;
  const handle = client.workflow.getHandle(workflowId);
  return handle.query('getProgress') as Promise<PipelineProgress>;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (await getTemporalClient()) as any;

  const workflowId = `scan-${params.scanId}`;

  const workflowInput: PipelineInput = {
    webUrl: params.targetUrl,
    repoPath: params.repositoryUrl || '',
    workflowId,
    scanId: params.scanId,
    organizationId: params.organizationId,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = (await getTemporalClient()) as any;
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
