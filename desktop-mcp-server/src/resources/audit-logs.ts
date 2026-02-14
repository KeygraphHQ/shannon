/**
 * Audit Logs Resource Provider
 *
 * Exposes audit log files as MCP resources.
 * URI pattern: shannon://audit-logs/{workflowId}/{path}
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';

export interface ResourceEntry {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

/**
 * List all audit log resources for a specific workflow.
 */
export async function listAuditLogResources(
  paths: PathResolver,
  workflowId?: string
): Promise<ResourceEntry[]> {
  const resources: ResourceEntry[] = [];

  if (workflowId) {
    // List files for a specific workflow
    const auditPath = await paths.resolveAuditLog(workflowId);
    if (!auditPath) return resources;

    await collectFiles(auditPath, workflowId, '', resources);
  } else {
    // List all workflow directories as top-level resources
    const workflows = await paths.listAuditLogs();
    for (const wfId of workflows) {
      resources.push({
        uri: `shannon://audit-logs/${wfId}/session.json`,
        name: `${wfId} - Session Info`,
        mimeType: 'application/json',
        description: `Session metadata for workflow ${wfId}`,
      });
    }
  }

  return resources;
}

/**
 * Read a specific audit log resource.
 */
export async function readAuditLogResource(
  paths: PathResolver,
  workflowId: string,
  filePath: string
): Promise<string | null> {
  const auditDir = await paths.resolveAuditLog(workflowId);
  if (!auditDir) return null;

  // Prevent path traversal
  const resolved = path.resolve(auditDir, filePath);
  if (!resolved.startsWith(auditDir)) return null;

  try {
    return await fs.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

async function collectFiles(
  dirPath: string,
  workflowId: string,
  relativePath: string,
  resources: ResourceEntry[]
): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isFile()) {
      const mimeType = entry.name.endsWith('.json')
        ? 'application/json'
        : entry.name.endsWith('.md')
          ? 'text/markdown'
          : 'text/plain';

      resources.push({
        uri: `shannon://audit-logs/${workflowId}/${entryRelative}`,
        name: entryRelative,
        mimeType,
        description: describeFile(entryRelative),
      });
    } else if (entry.isDirectory()) {
      await collectFiles(
        path.join(dirPath, entry.name),
        workflowId,
        entryRelative,
        resources
      );
    }
  }
}

function describeFile(relativePath: string): string {
  if (relativePath === 'session.json') return 'Session metadata and metrics';
  if (relativePath === 'workflow.log') return 'Workflow-level event log';
  if (relativePath.startsWith('agents/')) return 'Agent execution log';
  if (relativePath.startsWith('prompts/')) return 'Agent prompt snapshot';
  if (relativePath.startsWith('deliverables/')) return 'Agent deliverable output';
  return 'Audit log file';
}
