/**
 * `shannon reset` command — stop everything and wipe all Temporal data and volumes,
 * returning the machine to a clean slate. The destructive counterpart to `stop`.
 */

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

  stopWorkers();
  stopInfra(true);
  console.log('Reset complete. All scans stopped and Temporal data removed.');
}
