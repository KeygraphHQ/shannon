/**
 * Reads workspace data from audit-logs session.json files.
 *
 * This provides historical data (cost, duration, resume attempts) that
 * complements the live workflow data from Temporal.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface SessionData {
  session: {
    id: string;
    webUrl: string;
    status: 'in-progress' | 'completed' | 'failed';
    createdAt: string;
    completedAt?: string;
    originalWorkflowId?: string;
    resumeAttempts?: Array<{
      workflowId: string;
      timestamp: string;
    }>;
  };
  metrics: {
    total_duration_ms: number;
    total_cost_usd: number;
    phases?: Record<string, {
      duration_ms: number;
      duration_percentage: number;
      cost_usd: number;
      agent_count: number;
    }>;
    agents?: Record<string, {
      status: string;
      final_duration_ms: number;
      total_cost_usd: number;
      model: string;
    }>;
  };
}

export interface WorkspaceInfo {
  name: string;
  url: string;
  status: 'in-progress' | 'completed' | 'failed';
  createdAt: Date;
  completedAt: Date | null;
  costUsd: number;
  durationMs: number;
  resumeAttempts: number;
}

function getAuditLogsDir(): string {
  return process.env.AUDIT_LOGS_DIR || './audit-logs';
}

/**
 * List all workspaces from audit-logs directory.
 */
export async function listWorkspaces(): Promise<WorkspaceInfo[]> {
  const auditDir = getAuditLogsDir();

  let entries: string[];
  try {
    entries = await fs.readdir(auditDir);
  } catch {
    return [];
  }

  const workspaces: WorkspaceInfo[] = [];

  for (const entry of entries) {
    const sessionPath = path.join(auditDir, entry, 'session.json');
    try {
      const content = await fs.readFile(sessionPath, 'utf8');
      const data = JSON.parse(content) as SessionData;

      const createdAt = new Date(data.session.createdAt);
      const completedAt = data.session.completedAt ? new Date(data.session.completedAt) : null;
      const durationMs = completedAt
        ? completedAt.getTime() - createdAt.getTime()
        : Date.now() - createdAt.getTime();

      workspaces.push({
        name: entry,
        url: data.session.webUrl,
        status: data.session.status,
        createdAt,
        completedAt,
        costUsd: data.metrics.total_cost_usd,
        durationMs,
        resumeAttempts: data.session.resumeAttempts?.length || 0,
      });
    } catch {
      // Skip directories without valid session.json
    }
  }

  // Sort by creation date (most recent first)
  workspaces.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return workspaces;
}

/**
 * Get detailed session data for a specific workspace.
 */
export async function getWorkspaceDetail(name: string): Promise<SessionData | null> {
  const auditDir = getAuditLogsDir();
  const sessionPath = path.join(auditDir, name, 'session.json');

  try {
    const content = await fs.readFile(sessionPath, 'utf8');
    return JSON.parse(content) as SessionData;
  } catch {
    return null;
  }
}
