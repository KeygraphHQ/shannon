/**
 * get_report Tool
 *
 * Retrieves the final pentest report from a completed scan.
 * Checks both the audit-logs deliverables and the repo deliverables directory.
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import { toolSuccess, toolError, type ToolResult } from '../types.js';

export interface GetReportInput {
  workflow_id: string;
  deliverable?: string;
}

export async function getReport(
  input: GetReportInput,
  paths: PathResolver
): Promise<ToolResult> {
  const auditPath = await paths.resolveAuditLog(input.workflow_id);
  if (!auditPath) {
    return toolError(`No audit logs found for workflow: ${input.workflow_id}`, {
      suggestion: 'Check the workflow ID with list_scans',
    });
  }

  // If specific deliverable requested, read it directly
  if (input.deliverable) {
    return await readDeliverable(auditPath, input.deliverable, input.workflow_id);
  }

  // Otherwise, try to find the main report
  const deliverablesDir = path.join(auditPath, 'deliverables');

  // List available deliverables
  let deliverables: string[];
  try {
    deliverables = await fs.readdir(deliverablesDir);
  } catch {
    return toolError('No deliverables found for this workflow', {
      workflowId: input.workflow_id,
      suggestion: 'The scan may not have completed yet. Check with query_progress.',
    });
  }

  if (deliverables.length === 0) {
    return toolError('Deliverables directory is empty', {
      workflowId: input.workflow_id,
    });
  }

  // Try to find the main report (usually the largest .md file or one with "report" in the name)
  const reportFile = deliverables.find((f) => f.includes('report') && f.endsWith('.md'))
    ?? deliverables.find((f) => f.endsWith('.md'))
    ?? deliverables[0];

  if (!reportFile) {
    return toolSuccess({
      workflowId: input.workflow_id,
      available_deliverables: deliverables,
      message: 'No report file found. Use the deliverable parameter to read a specific file.',
    });
  }

  const reportPath = path.join(deliverablesDir, reportFile);
  try {
    const content = await fs.readFile(reportPath, 'utf8');
    return toolSuccess({
      workflowId: input.workflow_id,
      deliverable: reportFile,
      content,
      all_deliverables: deliverables,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    return toolError(`Failed to read report: ${errMsg}`);
  }
}

async function readDeliverable(
  auditPath: string,
  deliverableName: string,
  workflowId: string
): Promise<ToolResult> {
  const filePath = path.join(auditPath, 'deliverables', deliverableName);
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return toolSuccess({
      workflowId,
      deliverable: deliverableName,
      content,
    });
  } catch {
    // List what's available
    try {
      const available = await fs.readdir(path.join(auditPath, 'deliverables'));
      return toolError(`Deliverable not found: ${deliverableName}`, {
        available_deliverables: available,
      });
    } catch {
      return toolError(`Deliverable not found: ${deliverableName}`);
    }
  }
}
