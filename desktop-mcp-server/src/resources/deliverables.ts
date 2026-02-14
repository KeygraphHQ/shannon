/**
 * Deliverables Resource Provider
 *
 * Exposes deliverable files from completed scans as MCP resources.
 * URI pattern: shannon://deliverables/{workflowId}/{filename}
 */

import fs from 'fs/promises';
import path from 'path';
import type { PathResolver } from '../infrastructure/path-resolver.js';
import type { ResourceEntry } from './audit-logs.js';

/**
 * List all deliverable resources for a specific workflow.
 */
export async function listDeliverableResources(
  paths: PathResolver,
  workflowId: string
): Promise<ResourceEntry[]> {
  const auditPath = await paths.resolveAuditLog(workflowId);
  if (!auditPath) return [];

  const deliverablesDir = path.join(auditPath, 'deliverables');
  let entries: string[];
  try {
    entries = await fs.readdir(deliverablesDir);
  } catch {
    return [];
  }

  return entries.map((name) => ({
    uri: `shannon://deliverables/${workflowId}/${name}`,
    name,
    mimeType: name.endsWith('.json')
      ? 'application/json'
      : name.endsWith('.md')
        ? 'text/markdown'
        : 'text/plain',
    description: describeDeliverable(name),
  }));
}

/**
 * Read a specific deliverable resource.
 */
export async function readDeliverableResource(
  paths: PathResolver,
  workflowId: string,
  filename: string
): Promise<string | null> {
  const auditPath = await paths.resolveAuditLog(workflowId);
  if (!auditPath) return null;

  const filePath = path.join(auditPath, 'deliverables', filename);

  // Prevent path traversal
  const resolved = path.resolve(filePath);
  const expectedDir = path.join(auditPath, 'deliverables');
  if (!resolved.startsWith(expectedDir)) return null;

  try {
    return await fs.readFile(resolved, 'utf8');
  } catch {
    return null;
  }
}

function describeDeliverable(filename: string): string {
  if (filename.includes('report')) return 'Executive security report';
  if (filename.includes('injection')) return 'Injection vulnerability analysis';
  if (filename.includes('xss')) return 'XSS vulnerability analysis';
  if (filename.includes('auth') && filename.includes('authz')) return 'Authorization vulnerability analysis';
  if (filename.includes('auth')) return 'Authentication vulnerability analysis';
  if (filename.includes('ssrf')) return 'SSRF vulnerability analysis';
  if (filename.includes('exploit')) return 'Exploitation results';
  if (filename.includes('queue')) return 'Exploitation queue';
  if (filename.includes('recon')) return 'Reconnaissance findings';
  return 'Scan deliverable';
}
