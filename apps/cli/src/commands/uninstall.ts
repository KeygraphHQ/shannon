/**
 * `npx @keygraph/shannon uninstall` command — remove ~/.shannon/ after confirmation (npx only).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { stopInfra, stopWorkers } from '../docker.js';
import { requireInteractive } from '../tty.js';

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

  if (interactive) {
    requireInteractive('uninstall', 'Re-run with --yes to skip this confirmation.');
    const confirmed = await p.confirm({
      message: 'This will permanently remove all past scan data, saved configurations, and API keys. Continue?',
    });
    if (p.isCancel(confirmed) || !confirmed) {
      p.cancel('Aborted.');
      process.exit(0);
    }
  }

  // Stop any running containers first
  stopWorkers();
  stopInfra(false);

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
