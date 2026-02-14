/**
 * Temporal Client Bridge
 *
 * Manages a connection to the Temporal gRPC server at localhost:7233.
 * Provides workflow start, query, cancel, and list operations.
 */

import { Connection, Client, type WorkflowExecutionInfo } from '@temporalio/client';
import type { PipelineInput, PipelineState, PipelineProgress } from '../types.js';

const TASK_QUEUE = 'shannon-pipeline';
const WORKFLOW_TYPE = 'pentestPipelineWorkflow';
const PROGRESS_QUERY = 'getProgress';

export class TemporalBridge {
  private connection: Connection | null = null;
  private client: Client | null = null;
  private readonly address: string;

  constructor(address?: string) {
    this.address = address ?? process.env['TEMPORAL_ADDRESS'] ?? 'localhost:7233';
  }

  /**
   * Lazily connect to the Temporal server.
   */
  async connect(): Promise<Client> {
    if (this.client) {
      return this.client;
    }

    this.connection = await Connection.connect({ address: this.address });
    this.client = new Client({ connection: this.connection });
    return this.client;
  }

  /**
   * Check if we can connect to Temporal.
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.connect();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start a new pentest pipeline workflow.
   */
  async startWorkflow(input: PipelineInput, workflowId: string): Promise<string> {
    const client = await this.connect();

    const handle = await client.workflow.start<(input: PipelineInput) => Promise<PipelineState>>(
      WORKFLOW_TYPE,
      {
        taskQueue: TASK_QUEUE,
        workflowId,
        args: [input],
      }
    );

    return handle.workflowId;
  }

  /**
   * Query workflow progress.
   */
  async queryProgress(workflowId: string): Promise<PipelineProgress> {
    const client = await this.connect();
    const handle = client.workflow.getHandle(workflowId);
    return await handle.query<PipelineProgress>(PROGRESS_QUERY);
  }

  /**
   * Cancel a running workflow.
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const client = await this.connect();
    const handle = client.workflow.getHandle(workflowId);
    await handle.cancel();
  }

  /**
   * Terminate a running workflow.
   */
  async terminateWorkflow(workflowId: string, reason?: string): Promise<void> {
    const client = await this.connect();
    const handle = client.workflow.getHandle(workflowId);
    await handle.terminate(reason);
  }

  /**
   * List workflows with optional status filter.
   */
  async listWorkflows(
    statusFilter?: 'Running' | 'Completed' | 'Failed' | 'Terminated' | 'Cancelled',
    limit: number = 10
  ): Promise<WorkflowInfo[]> {
    const client = await this.connect();

    let query = `WorkflowType = '${WORKFLOW_TYPE}'`;
    if (statusFilter) {
      query += ` AND ExecutionStatus = '${statusFilter}'`;
    }

    const results: WorkflowInfo[] = [];
    for await (const workflow of client.workflow.list({ query })) {
      results.push(toWorkflowInfo(workflow));
      if (results.length >= limit) break;
    }

    return results;
  }

  /**
   * Close the Temporal connection.
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
      this.client = null;
    }
  }
}

// --- Simplified workflow info for MCP responses ---

export interface WorkflowInfo {
  workflowId: string;
  runId: string;
  status: string;
  startTime: string;
  closeTime: string | null;
  taskQueue: string;
}

function toWorkflowInfo(execution: WorkflowExecutionInfo): WorkflowInfo {
  return {
    workflowId: execution.workflowId,
    runId: execution.runId,
    status: execution.status.name,
    startTime: execution.startTime.toISOString(),
    closeTime: execution.closeTime?.toISOString() ?? null,
    taskQueue: execution.taskQueue,
  };
}
