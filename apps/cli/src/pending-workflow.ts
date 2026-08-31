/** Durable CLI-owned workflow candidates that bridge Docker launch and session registration. */

import fs from 'node:fs';
import path from 'node:path';
import { INTERNAL_DIR } from './paths.js';

const SCHEMA_VERSION = 1 as const;
const PENDING_DIR = 'pending-workflows';

export interface PendingWorkflowIdentity {
  readonly schema_version: typeof SCHEMA_VERSION;
  readonly workflow_id: string;
  readonly task_queue: string;
  readonly created_at: string;
}

export interface PendingWorkflowReadResult {
  readonly identities: readonly PendingWorkflowIdentity[];
  readonly unreadableCount: number;
}

function pendingDir(workspacePath: string): string {
  return path.join(workspacePath, INTERNAL_DIR, PENDING_DIR);
}

function pendingFile(workspacePath: string, taskQueue: string): string {
  return path.join(pendingDir(workspacePath), `launch-${encodeURIComponent(taskQueue)}.json`);
}

function syncDirectory(directory: string): void {
  const descriptor = fs.openSync(directory, 'r');
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

/** Persist the candidate before docker run, so a vanished pre-registration worker remains addressable. */
export function writePendingWorkflowIdentity(workspacePath: string, workflowId: string, taskQueue: string): void {
  const directory = pendingDir(workspacePath);
  const directoryAlreadyExisted = fs.existsSync(directory);
  fs.mkdirSync(directory, { recursive: true });
  if (!directoryAlreadyExisted) syncDirectory(path.dirname(directory));
  const destination = pendingFile(workspacePath, taskQueue);
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  const identity: PendingWorkflowIdentity = {
    schema_version: SCHEMA_VERSION,
    workflow_id: workflowId,
    task_queue: taskQueue,
    created_at: new Date().toISOString(),
  };

  const descriptor = fs.openSync(temporary, 'wx', 0o600);
  try {
    fs.writeFileSync(descriptor, `${JSON.stringify(identity, null, 2)}\n`, 'utf8');
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  try {
    // Link installs the fully-fsynced inode without replacing an existing task-queue record.
    fs.linkSync(temporary, destination);
    fs.unlinkSync(temporary);
    syncDirectory(directory);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

/** Remove one candidate only after session registration or a fully verified stop. */
export function clearPendingWorkflowIdentity(workspacePath: string, taskQueue: string): void {
  const directory = pendingDir(workspacePath);
  fs.rmSync(pendingFile(workspacePath, taskQueue), { force: true });
  if (fs.existsSync(directory)) syncDirectory(directory);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isPendingWorkflowIdentity(
  value: unknown,
  workspace: string,
  expectedFilename: string,
): value is PendingWorkflowIdentity {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate).sort();
  const workflowId = candidate.workflow_id;
  const workflowPattern = new RegExp(`^${escapeRegExp(workspace)}_(?:shannon-|resume_)\\d+$`);
  const workspaceIsWorkflowId = workflowId === workspace && /_shannon-\d+$/.test(workspace);
  return (
    keys.length === 4 &&
    keys[0] === 'created_at' &&
    keys[1] === 'schema_version' &&
    keys[2] === 'task_queue' &&
    keys[3] === 'workflow_id' &&
    candidate.schema_version === SCHEMA_VERSION &&
    typeof workflowId === 'string' &&
    (workspaceIsWorkflowId || workflowPattern.test(workflowId)) &&
    typeof candidate.task_queue === 'string' &&
    /^shannon-[0-9a-f]{8}$/.test(candidate.task_queue) &&
    expectedFilename === `launch-${encodeURIComponent(candidate.task_queue)}.json` &&
    typeof candidate.created_at === 'string' &&
    !Number.isNaN(Date.parse(candidate.created_at)) &&
    new Date(candidate.created_at).toISOString() === candidate.created_at
  );
}

/** Read every outstanding launch candidate, preserving corrupt records as an explicit failure count. */
export function readPendingWorkflowIdentities(workspacePath: string): PendingWorkflowReadResult {
  let entries: string[];
  try {
    entries = fs.readdirSync(pendingDir(workspacePath)).filter((entry) => entry.endsWith('.json'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { identities: [], unreadableCount: 0 };
    return { identities: [], unreadableCount: 1 };
  }

  const identities: PendingWorkflowIdentity[] = [];
  let unreadableCount = 0;
  for (const entry of entries) {
    try {
      const value: unknown = JSON.parse(fs.readFileSync(path.join(pendingDir(workspacePath), entry), 'utf8'));
      if (!isPendingWorkflowIdentity(value, path.basename(workspacePath), entry)) {
        unreadableCount++;
        continue;
      }
      identities.push(value);
    } catch {
      unreadableCount++;
    }
  }
  // Atomic-write temp files are intentionally ignored: start cannot spawn Docker until the
  // final .json rename and fsync above have both completed.
  return { identities, unreadableCount };
}
