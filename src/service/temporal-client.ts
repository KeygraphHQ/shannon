/**
 * Temporal Client Wrapper for Shannon Service
 * Provides workflow management capabilities for the service layer
 */

import { Connection, Client, WorkflowHandle } from '@temporalio/client';
import type { PipelineInput, PipelineProgress, PipelineState } from '../temporal/shared.js';

// Temporal connection configuration
const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS || 'localhost:7233';
const TASK_QUEUE = 'shannon-pipeline';
const WORKFLOW_NAME = 'pentestPipelineWorkflow';
const PROGRESS_QUERY = 'getProgress';

// Singleton instances
let connection: Connection | null = null;
let client: Client | null = null;

/**
 * Get the Temporal connection singleton
 */
async function getConnection(): Promise<Connection> {
  if (!connection) {
    connection = await Connection.connect({ address: TEMPORAL_ADDRESS });
  }
  return connection;
}

/**
 * Get the Temporal client singleton
 */
export async function getTemporalClient(): Promise<Client> {
  if (!client) {
    const conn = await getConnection();
    client = new Client({ connection: conn });
  }
  return client;
}

/**
 * Close the Temporal connection
 * Should be called during graceful shutdown
 */
export async function disconnectTemporal(): Promise<void> {
  if (connection) {
    await connection.close();
    connection = null;
    client = null;
  }
}

/**
 * Check Temporal server connectivity
 * Returns true if Temporal is reachable
 */
export async function checkTemporalHealth(): Promise<boolean> {
  try {
    const temporalClient = await getTemporalClient();
    // Try to list workflows as a health check
    await temporalClient.workflowService.getSystemInfo({});
    return true;
  } catch (error) {
    console.error('Temporal health check failed:', error);
    return false;
  }
}

/**
 * Start a new scan workflow
 */
export async function startScanWorkflow(
  input: PipelineInput,
  workflowId: string
): Promise<{ workflowId: string; runId: string }> {
  const temporalClient = await getTemporalClient();

  const handle = await temporalClient.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
    WORKFLOW_NAME,
    {
      taskQueue: TASK_QUEUE,
      workflowId,
      args: [input],
    }
  );

  return {
    workflowId: handle.workflowId,
    runId: handle.firstExecutionRunId,
  };
}

/**
 * Get a workflow handle by ID
 */
export async function getWorkflowHandle(
  workflowId: string
): Promise<WorkflowHandle<(input: PipelineInput) => Promise<PipelineState>>> {
  const temporalClient = await getTemporalClient();
  return temporalClient.workflow.getHandle(workflowId);
}

/**
 * Query workflow progress
 */
export async function getWorkflowProgress(workflowId: string): Promise<PipelineProgress> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.query<PipelineProgress>(PROGRESS_QUERY);
}

/**
 * Cancel a running workflow
 */
export async function cancelWorkflow(workflowId: string): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.cancel();
}

/**
 * Terminate a workflow immediately
 */
export async function terminateWorkflow(
  workflowId: string,
  reason: string
): Promise<void> {
  const handle = await getWorkflowHandle(workflowId);
  await handle.terminate(reason);
}

/**
 * Wait for a workflow to complete
 */
export async function waitForWorkflow(workflowId: string): Promise<PipelineState> {
  const handle = await getWorkflowHandle(workflowId);
  return handle.result();
}

/**
 * Get workflow execution status
 */
export async function getWorkflowStatus(
  workflowId: string
): Promise<'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELED' | 'UNKNOWN'> {
  try {
    const handle = await getWorkflowHandle(workflowId);
    const description = await handle.describe();

    const statusName = description.status.name;

    // Map Temporal status to our simplified status
    if (statusName === 'RUNNING') return 'RUNNING';
    if (statusName === 'COMPLETED') return 'COMPLETED';
    if (statusName === 'FAILED') return 'FAILED';
    if (statusName === 'CANCELLED') return 'CANCELED';
    if (statusName === 'TERMINATED') return 'FAILED';
    if (statusName === 'TIMED_OUT') return 'FAILED';

    return 'UNKNOWN';
  } catch (error) {
    // Workflow not found or other error
    return 'UNKNOWN';
  }
}

/**
 * Generate a workflow ID for a scan
 */
export function generateWorkflowId(organizationId: string, scanId: string): string {
  return `scan-${organizationId}-${scanId}-${Date.now()}`;
}

/**
 * List running workflows for an organization
 */
export async function listOrgWorkflows(
  organizationId: string,
  status?: 'Running' | 'Completed' | 'Failed'
): Promise<Array<{ workflowId: string; runId: string; status: string; startTime: Date }>> {
  const temporalClient = await getTemporalClient();

  let query = `WorkflowId STARTS_WITH "scan-${organizationId}"`;
  if (status) {
    query += ` AND ExecutionStatus = "${status}"`;
  }

  const results: Array<{ workflowId: string; runId: string; status: string; startTime: Date }> = [];

  try {
    const iterator = temporalClient.workflow.list({ query });
    for await (const workflow of iterator) {
      results.push({
        workflowId: workflow.workflowId,
        runId: workflow.runId,
        status: workflow.status.name,
        startTime: workflow.startTime,
      });
    }
  } catch (error) {
    console.error('Failed to list workflows:', error);
  }

  return results;
}

export default {
  getTemporalClient,
  disconnectTemporal,
  checkTemporalHealth,
  startScanWorkflow,
  getWorkflowHandle,
  getWorkflowProgress,
  cancelWorkflow,
  terminateWorkflow,
  waitForWorkflow,
  getWorkflowStatus,
  generateWorkflowId,
  listOrgWorkflows,
};
