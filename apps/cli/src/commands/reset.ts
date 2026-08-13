/**
 * `shannon reset` command — stop everything and wipe all Temporal data and volumes,
 * returning the machine to a clean slate. The destructive counterpart to `stop`.
 */

import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import { ensureDocker, runningContainers, stopContainers, stopInfra, WORKER_FILTER } from '../docker.js';

export interface ResetOptions {
  yes: boolean;
}

export async function reset(opts: ResetOptions): Promise<void> {
  ensureDocker();

  await confirmOrExit(
    'reset',
    'This will stop all running scans and permanently remove all Temporal data and volumes. Continue?',
    opts.yes,
  );

  const spinner = p.spinner();
  spinner.start('Stopping scans');
  const running = runningContainers(WORKER_FILTER);
  await stopContainers(running);
  spinner.stop(
    running.length > 0 ? `Stopped ${running.length} scan${running.length === 1 ? '' : 's'}` : 'No scans running',
  );

  await stopInfra(true);
  console.log('Reset complete.');
}
