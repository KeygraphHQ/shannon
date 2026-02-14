/**
 * list_scans Tool
 *
 * Lists recent and active Shannon workflows from both
 * Temporal and the audit-logs directory.
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import type { TemporalBridge } from '../infrastructure/temporal-client.js';
import { toolSuccess, toolError, type ToolResult } from '../types.js';

export interface ListScansInput {
  status?: 'running' | 'completed' | 'failed' | 'all';
  limit?: number;
}

interface ScanEntry {
  workflowId: string;
  status: string;
  startTime: string;
  closeTime: string | null;
  source: 'temporal' | 'audit-logs';
  target?: string | undefined;
}

export async function listScans(
  input: ListScansInput,
  paths: PathResolver,
  temporal: TemporalBridge
): Promise<ToolResult> {
  const limit = input.limit ?? 10;
  const statusFilter = input.status ?? 'all';

  const scans: ScanEntry[] = [];
  const seenIds = new Set<string>();

  // 1. Try Temporal listing
  try {
    const temporalStatus = mapStatusFilter(statusFilter);
    const workflows = await temporal.listWorkflows(temporalStatus, limit);

    for (const w of workflows) {
      scans.push({
        workflowId: w.workflowId,
        status: w.status.toLowerCase(),
        startTime: w.startTime,
        closeTime: w.closeTime,
        source: 'temporal',
      });
      seenIds.add(w.workflowId);
    }
  } catch {
    // Temporal might not be running, fall back to audit-logs only
  }

  // 2. Supplement from audit-logs
  const auditLogDirs = await paths.listAuditLogs();
  for (const workflowId of auditLogDirs) {
    if (seenIds.has(workflowId)) continue;
    if (scans.length >= limit) break;

    const entry = await readAuditEntry(paths, workflowId);
    if (!entry) continue;

    // Apply status filter
    if (statusFilter !== 'all' && entry.status !== statusFilter) continue;

    scans.push(entry);
    seenIds.add(workflowId);
  }

  // Sort by start time (newest first)
  scans.sort((a, b) => {
    const timeA = new Date(a.startTime).getTime();
    const timeB = new Date(b.startTime).getTime();
    return timeB - timeA;
  });

  return toolSuccess({
    total: scans.length,
    scans: scans.slice(0, limit),
  });
}

async function readAuditEntry(paths: PathResolver, workflowId: string): Promise<ScanEntry | null> {
  try {
    const sessionPath = path.join(paths.auditLogsDir, workflowId, 'session.json');
    const content = await fs.readFile(sessionPath, 'utf8');
    const session = JSON.parse(content) as Record<string, unknown>;

    return {
      workflowId,
      status: (session['status'] as string) ?? 'unknown',
      startTime: (session['startTime'] as string) ?? new Date().toISOString(),
      closeTime: (session['endTime'] as string) ?? null,
      source: 'audit-logs',
      target: session['webUrl'] as string | undefined,
    };
  } catch {
    return null;
  }
}

function mapStatusFilter(
  filter: string
): 'Running' | 'Completed' | 'Failed' | 'Terminated' | 'Cancelled' | undefined {
  switch (filter) {
    case 'running':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    default:
      return undefined;
  }
}
