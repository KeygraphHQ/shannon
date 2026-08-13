/**
 * `npx @keygraph/shannon uninstall` command — remove ~/.shannon/ after confirmation (npx only).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { confirmOrExit } from '../confirm.js';
import { runningContainers, stopContainers, stopInfra, WORKER_FILTER } from '../docker.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

export async function uninstall(yes: boolean): Promise<void> {
  const interactive = !yes;
  if (interactive) p.intro('Shannon Uninstall');

  if (!fs.existsSync(SHANNON_HOME)) {
    const message = 'Nothing to remove. Shannon is not configured on this machine.';
    if (interactive) {
      p.log.info(message);
      p.outro('Done.');
    } else {
      console.log(message);
    }
    return;
  }

  await confirmOrExit(
    'uninstall',
    'This will permanently remove all past scan data, saved configurations, and API keys. Continue?',
    yes,
  );

  // Stop any running containers first
  const spinner = p.spinner();
  spinner.start('Stopping scans');
  const running = runningContainers(WORKER_FILTER);
  await stopContainers(running);
  spinner.stop(
    running.length > 0 ? `Stopped ${running.length} scan${running.length === 1 ? '' : 's'}` : 'No scans running',
  );
  await stopInfra(false);

  fs.rmSync(SHANNON_HOME, { recursive: true, force: true });

  const done = 'All Shannon data has been removed.';
  const hint = 'Shannon has been uninstalled. Run `npx @keygraph/shannon setup` to start fresh.';
  if (interactive) {
    p.log.success(done);
    p.outro(hint);
  } else {
    console.log(done);
    console.log(hint);
  }
}
