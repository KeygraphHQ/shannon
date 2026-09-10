/**
 * Shannon eligibility check.
 *
 * Shannon 1.9.0 is a source-aware white-box pentester: it needs a real
 * local repository. A black-box target with no legitimate source available
 * must never be silently routed through Shannon's normal mode — that would
 * misrepresent what actually ran. This module is the single place that
 * decides "is Shannon appropriate right now," so the adaptive loop and any
 * CLI/slash-command surface make the same call the same way.
 */

import { stat } from 'node:fs/promises';

export interface ShannonEligibility {
  readonly eligible: boolean;
  readonly reason: string;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    const info = await stat(path);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function checkShannonEligibility(repoPath: string | undefined): Promise<ShannonEligibility> {
  if (repoPath === undefined || repoPath.trim().length === 0) {
    return {
      eligible: false,
      reason:
        'no local source repository was provided for this target; Shannon requires source-aware access and cannot run in a black-box mode',
    };
  }
  if (repoPath.includes('://')) {
    return { eligible: false, reason: `repo path "${repoPath}" is a URL, not a local filesystem path` };
  }
  if (!(await isDirectory(repoPath))) {
    return { eligible: false, reason: `repo path "${repoPath}" does not exist or is not a directory` };
  }
  return { eligible: true, reason: `local repository found at "${repoPath}"` };
}
