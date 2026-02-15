import type { FastifyInstance } from 'fastify';
import {
  listScans,
  getScan,
  createScan,
  updateScan,
  type ScanRow,
} from '../db.js';
import {
  startWorkflow,
  queryWorkflowProgress,
} from '../temporal-client.js';

function formatScan(row: ScanRow) {
  return {
    id: row.id,
    workflowId: row.workflow_id,
    targetUrl: row.target_url,
    repoPath: row.repo_path,
    configPath: row.config_path,
    status: row.status,
    currentPhase: row.current_phase,
    currentAgent: row.current_agent,
    completedAgents: JSON.parse(row.completed_agents) as string[],
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    summary: row.summary ? JSON.parse(row.summary) : null,
  };
}

export async function scanRoutes(app: FastifyInstance): Promise<void> {
  // List all scans
  app.get('/api/scans', async () => {
    const rows = listScans();
    return rows.map(formatScan);
  });

  // Get a single scan
  app.get<{ Params: { id: string } }>('/api/scans/:id', async (request, reply) => {
    const row = getScan(request.params.id);
    if (!row) {
      return reply.status(404).send({ error: 'Scan not found' });
    }
    return formatScan(row);
  });

  // Create a new scan and start the Temporal workflow
  app.post<{
    Body: { targetUrl: string; repoPath: string; configPath?: string };
  }>('/api/scans', async (request, reply) => {
    const { targetUrl, repoPath, configPath } = request.body;

    if (!targetUrl || !repoPath) {
      return reply.status(400).send({ error: 'targetUrl and repoPath are required' });
    }

    // Create the scan record first
    const scan = createScan({
      targetUrl,
      repoPath,
      ...(configPath ? { configPath } : {}),
    });

    try {
      // Start the Temporal workflow
      const { workflowId } = await startWorkflow({
        webUrl: targetUrl,
        repoPath,
        ...(configPath ? { configPath } : {}),
      });

      // Update with workflow ID and running status
      const updated = updateScan(scan.id, {
        workflowId,
        status: 'running',
      });

      return reply.status(201).send(formatScan(updated!));
    } catch (error) {
      // Mark as failed if workflow couldn't start
      const errMsg = error instanceof Error ? error.message : String(error);
      const updated = updateScan(scan.id, {
        status: 'failed',
        error: `Failed to start workflow: ${errMsg}`,
      });
      return reply.status(500).send(formatScan(updated!));
    }
  });

  // Sync status of a single scan from Temporal
  app.post<{ Params: { id: string } }>('/api/scans/:id/sync', async (request, reply) => {
    const row = getScan(request.params.id);
    if (!row) {
      return reply.status(404).send({ error: 'Scan not found' });
    }

    if (!row.workflow_id) {
      return formatScan(row);
    }

    // Don't query completed/failed scans
    if (row.status === 'completed' || row.status === 'failed') {
      return formatScan(row);
    }

    const progress = await queryWorkflowProgress(row.workflow_id);
    if (!progress) {
      return formatScan(row);
    }

    const updated = updateScan(row.id, {
      status: progress.status,
      currentPhase: progress.currentPhase,
      currentAgent: progress.currentAgent,
      completedAgents: progress.completedAgents,
      error: progress.error,
      summary: progress.summary,
    });

    return formatScan(updated!);
  });

  // Sync all running scans
  app.post('/api/scans/sync', async () => {
    const rows = listScans();
    const running = rows.filter(
      (r) => r.status === 'running' && r.workflow_id
    );

    const results = await Promise.allSettled(
      running.map(async (row) => {
        const progress = await queryWorkflowProgress(row.workflow_id!);
        if (!progress) return;

        updateScan(row.id, {
          status: progress.status,
          currentPhase: progress.currentPhase,
          currentAgent: progress.currentAgent,
          completedAgents: progress.completedAgents,
          error: progress.error,
          summary: progress.summary,
        });
      })
    );

    return { synced: results.length };
  });
}
