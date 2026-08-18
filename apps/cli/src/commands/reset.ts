/**
 * `shannon reset` command — stop everything and wipe all Temporal data and volumes,
 * returning the machine to a clean slate. The destructive counterpart to `stop`.
 */

import * as p from '@clack/prompts';
import { confirmByTyping } from '../confirm.js';
import { ensureDocker, runningContainers, stopContainers, stopInfra, WORKER_FILTER } from '../docker.js';

export async function reset(): Promise<void> {
  ensureDocker();

  console.log('This will stop all running scans and permanently remove all Temporal data and volumes.');
  await confirmByTyping('reset', 'confirm');

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
