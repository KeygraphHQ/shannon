/**
 * Workspace enumeration, default-target resolution, and scan identity proof.
 *
 * The action commands (`logs`, `status`, `stop`) each take a workspace name. When one
 * is omitted, `resolveDefaultWorkspace` picks the obvious candidate — the single running
 * scan, or the most recent workspace — so the common "I just started one scan, show me
 * its logs" path doesn't require retyping an auto-generated name. Target selection and
 * identity proof are separate steps: `resolveScanIdentity` turns a selected or explicit
 * string into the one canonical (workspace, workflowId) pair the session records prove.
 *
 * Running workers are identified by Docker workspace label for default-target selection.
 * `stop` supplements that local discovery with Temporal lifecycle state. Recency for
 * finished scans comes from each run's session.json createdAt,
 * with the workspace directory mtime as the fallback for runs that predate it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { runningScanWorkspaces } from './docker.js';
import { getWorkspacesDir } from './home.js';
import { resolveRunFile } from './paths.js';
import { resolveWorkflowId } from './session.js';

export interface WorkspaceInfo {
  readonly name: string;
  /** Creation time in ms — the recency sort key. Null when neither session.json nor stat is readable. */
  readonly createdMs: number | null;
}

/** Creation time of a workspace: session.json createdAt, else directory mtime, else null. */
function readCreatedMs(runDir: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(resolveRunFile(runDir, 'session.json'), 'utf-8'));
    const createdMs = Date.parse(parsed?.session?.createdAt ?? '');
    if (!Number.isNaN(createdMs)) {
      return createdMs;
    }
  } catch {
    // Fall through to the directory mtime.
  }

  try {
    return fs.statSync(runDir).mtimeMs;
  } catch {
    return null;
  }
}

/** Every workspace directory, newest-first by createdAt (directory mtime fallback). */
export function listWorkspaces(): WorkspaceInfo[] {
  const workspacesDir = getWorkspacesDir();

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
  } catch {
    // Workspaces directory does not exist yet — no scans have ever run.
    return [];
  }

  const workspaces: WorkspaceInfo[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    workspaces.push({ name: entry.name, createdMs: readCreatedMs(path.join(workspacesDir, entry.name)) });
  }

  // Newest first; workspaces with no known time sort last.
  workspaces.sort((a, b) => (b.createdMs ?? 0) - (a.createdMs ?? 0));
  return workspaces;
}

export type ScanIdentity =
  | { readonly kind: 'ok'; readonly workspace: string; readonly workflowId: string }
  | {
      readonly kind: 'not-found';
      readonly reason: 'no-match' | 'unreadable-record';
      /** For 'unreadable-record': the session.json path that could not prove the identity. */
      readonly sessionPath?: string;
    }
  | { readonly kind: 'ambiguous'; readonly claims: readonly string[] };

/** Every workflow id a run's session record has ever claimed: the original plus each resume. */
function readRecordedWorkflowIds(runDir: string): readonly string[] {
  try {
    const session = JSON.parse(fs.readFileSync(resolveRunFile(runDir, 'session.json'), 'utf-8'));
    const resumeAttempts: { workflowId?: string }[] = session.session?.resumeAttempts ?? [];
    const ids = [session.session?.originalWorkflowId, ...resumeAttempts.map((attempt) => attempt.workflowId)];
    return ids.filter((id): id is string => typeof id === 'string' && id.length > 0);
  } catch {
    return [];
  }
}

/**
 * Prove the canonical (workspace, workflowId) pair for a status target.
 *
 * A directory with a readable session record takes precedence and follows its latest
 * resume (an auto-named directory whose name equals its original workflow id resolves
 * here). Otherwise the input is matched exactly against every workflow id the session
 * records have claimed — session.json is the only trustworthy reverse mapping, and a
 * valid workspace name may itself end in `_shannon-<digits>`, so the id naming
 * convention is never used to guess.
 */
export function resolveScanIdentity(input: string): ScanIdentity {
  const runDir = path.join(getWorkspacesDir(), input);
  let isDirectory = false;
  try {
    isDirectory = fs.statSync(runDir).isDirectory();
  } catch {
    // Not a workspace directory — fall through to the exact workflow-id match.
  }

  if (isDirectory) {
    const workflowId = resolveWorkflowId(input);
    if (workflowId !== undefined) {
      return { kind: 'ok', workspace: input, workflowId };
    }
    return { kind: 'not-found', reason: 'unreadable-record', sessionPath: resolveRunFile(runDir, 'session.json') };
  }

  const claims: string[] = [];
  for (const workspace of listWorkspaces()) {
    const recorded = readRecordedWorkflowIds(path.join(getWorkspacesDir(), workspace.name));
    if (recorded.includes(input)) {
      claims.push(workspace.name);
    }
  }

  if (claims.length === 1) {
    // The exact requested id is kept, so an older workflow id keeps addressing that older execution.
    return { kind: 'ok', workspace: claims[0] as string, workflowId: input };
  }
  if (claims.length > 1) {
    return { kind: 'ambiguous', claims: [...claims].sort() };
  }
  return { kind: 'not-found', reason: 'no-match' };
}

export type DefaultTarget =
  | { readonly kind: 'ok'; readonly workspace: string; readonly running: boolean }
  | { readonly kind: 'none' }
  | { readonly kind: 'ambiguous'; readonly running: readonly string[] };

/**
 * Pick the default workspace when the user gave none.
 *
 * Exactly one scan running → that scan. Multiple running → ambiguous, so the caller can
 * list them and ask for an explicit name. None running → the most recent workspace when
 * `allowFinished` (viewing commands), otherwise none (stopping a finished scan is a no-op).
 */
export function resolveDefaultWorkspace(opts: { readonly allowFinished: boolean }): DefaultTarget {
  const running = runningScanWorkspaces();
  if (running.length === 1) {
    return { kind: 'ok', workspace: running[0] as string, running: true };
  }
  if (running.length > 1) {
    return { kind: 'ambiguous', running };
  }

  if (!opts.allowFinished) {
    return { kind: 'none' };
  }

  const workspaces = listWorkspaces();
  const mostRecent = workspaces[0];
  if (!mostRecent) {
    return { kind: 'none' };
  }
  return { kind: 'ok', workspace: mostRecent.name, running: false };
}
