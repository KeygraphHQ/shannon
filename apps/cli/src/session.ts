/**
 * Workspace → Temporal workflow-id resolution.
 *
 * A workspace name is not always its workflow id: a fresh scan's id equals the
 * workspace name, but each resume spawns a new workflow (`<workspace>_resume_<ts>`).
 * The workspace's session.json records the authoritative id — the latest resume
 * attempt, or the original — so commands that query Temporal (status, stop) resolve
 * through here instead of assuming the name is the id.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getWorkspacesDir } from './home.js';
import { resolveRunFile } from './paths.js';

/** Latest workflow id recorded for a workspace: last resume attempt, else the original. */
export function resolveWorkflowId(workspace: string): string | undefined {
  const sessionPath = resolveRunFile(path.join(getWorkspacesDir(), workspace), 'session.json');
  try {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));
    const resumeAttempts: { workflowId?: string }[] = session.session?.resumeAttempts ?? [];
    return resumeAttempts.at(-1)?.workflowId ?? session.session?.originalWorkflowId ?? undefined;
  } catch {
    return undefined;
  }
}
