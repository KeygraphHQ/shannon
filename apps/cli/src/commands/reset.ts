/**
 * `shannon reset` command — stop everything and wipe all Temporal data and volumes,
 * returning the machine to a clean slate. The destructive counterpart to `stop`.
 */

import * as p from '@clack/prompts';
import { ensureDocker, stopInfra, stopWorkers } from '../docker.js';
import { requireInteractive } from '../tty.js';

export interface ResetOptions {
  yes: boolean;
}

export async function reset(opts: ResetOptions): Promise<void> {
  ensureDocker();

  if (!opts.yes) {
    requireInteractive('reset', 'Re-run with --yes to skip this confirmation.');
    const confirmed = await p.confirm({
      message: 'This will stop all running scans and permanently remove all Temporal data and volumes. Continue?',
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Aborted.');
      process.exit(0);
    }
  }

  stopWorkers();
  stopInfra(true);
  console.log('Reset complete. All scans stopped and Temporal data removed.');
}
