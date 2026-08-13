/**
 * `shannon reset` command — stop everything and wipe all Temporal data and volumes,
 * returning the machine to a clean slate. The destructive counterpart to `stop`.
 */

import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import { ensureDocker, stopInfra, stopWorkers } from '../docker.js';

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
  const stopped = await stopWorkers();
  spinner.stop(stopped > 0 ? `Stopped ${stopped} scan${stopped === 1 ? '' : 's'}` : 'No scans running');

  await stopInfra(true);
  console.log('Reset complete.');
}
