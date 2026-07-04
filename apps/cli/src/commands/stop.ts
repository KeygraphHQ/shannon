/**
 * `shannon stop` command — stop workers and infrastructure.
 */

import * as p from '@clack/prompts';
import { stopInfra, stopWorkers } from '../docker.js';
import { requireInteractive } from '../tty.js';

export async function stop(clean: boolean, yes: boolean): Promise<void> {
  if (clean && !yes) {
    requireInteractive('stop --clean', 'Re-run with --yes to skip this confirmation.');
    const confirmed = await p.confirm({
      message: 'This will stop all running scans and remove the Temporal data. Continue?',
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Aborted.');
      process.exit(0);
    }
  }

  stopWorkers();
  stopInfra(clean);
}
