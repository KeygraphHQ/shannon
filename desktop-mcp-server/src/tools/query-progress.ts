/**
 * query_progress Tool
 *
 * Queries the status and progress of a running or completed workflow.
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import type { TemporalBridge } from '../infrastructure/temporal-client.js';
import { toolSuccess, toolError, type ToolResult, type PipelineProgress } from '../types.js';

export async function queryProgress(
  workflowId: string,
  paths: PathResolver,
  temporal: TemporalBridge
): Promise<ToolResult> {
  // Try Temporal query first
  let progress: PipelineProgress | null = null;
  try {
    progress = await temporal.queryProgress(workflowId);
  } catch (error) {
    // Temporal query may fail if workflow is gone or Temporal is down
    const errMsg = error instanceof Error ? error.message : String(error);

    // Try reading from audit-logs as fallback
    const auditPath = await paths.resolveAuditLog(workflowId);
    if (auditPath) {
      return await readAuditProgress(auditPath, workflowId);
    }

    return toolError(`Failed to query workflow: ${errMsg}`, {
      workflowId,
      suggestion: 'Ensure the workflow ID is correct and Temporal is running',
    });
  }

  const elapsed = formatElapsed(progress.elapsedMs);
  const totalAgents = 13;
  const completedCount = progress.completedAgents.length;

  // Compute cost summary from agent metrics
  let totalCost = 0;
  let totalTurns = 0;
  for (const metrics of Object.values(progress.agentMetrics)) {
    if (metrics.costUsd) totalCost += metrics.costUsd;
    if (metrics.numTurns) totalTurns += metrics.numTurns;
  }

  return toolSuccess({
    workflowId: progress.workflowId,
    status: progress.status,
    elapsed,
    currentPhase: progress.currentPhase,
    currentAgent: progress.currentAgent,
    progress: `${completedCount}/${totalAgents} agents completed`,
    completedAgents: progress.completedAgents,
    failedAgent: progress.failedAgent,
    error: progress.error,
    metrics: {
      totalCostUsd: `$${totalCost.toFixed(4)}`,
      totalTurns,
      agentDetails: progress.agentMetrics,
    },
    summary: progress.summary,
  });
}

/**
 * Read progress from audit-logs when Temporal is unavailable.
 */
async function readAuditProgress(auditPath: string, workflowId: string): Promise<ToolResult> {
  try {
    const sessionJsonPath = path.join(auditPath, 'session.json');
    const content = await fs.readFile(sessionJsonPath, 'utf8');
    const session = JSON.parse(content) as Record<string, unknown>;

    return toolSuccess({
      workflowId,
      source: 'audit-logs (Temporal unavailable)',
      session,
    });
  } catch {
    return toolError('Workflow not found in Temporal or audit-logs', { workflowId });
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}
