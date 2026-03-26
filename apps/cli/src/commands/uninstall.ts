/**
 * `shn uninstall` command — remove ~/.shannon/ after confirmation (npx only).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as p from '@clack/prompts';
import { stopInfra, stopWorkers } from '../docker.js';

const SHANNON_HOME = path.join(os.homedir(), '.shannon');

export async function uninstall(): Promise<void> {
  p.intro('Shannon Uninstall');

  if (!fs.existsSync(SHANNON_HOME)) {
    p.log.info('Nothing to remove. Shannon is not configured on this machine.');
    p.outro('Done.');
    return;
  }

  const confirmed = await p.confirm({
    message: 'This will permanently remove all past scan data, saved configurations, and API keys. Continue?',
  });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted.');
    process.exit(0);
  }

  // Stop any running containers first
  stopWorkers();
  stopInfra(false);

  fs.rmSync(SHANNON_HOME, { recursive: true, force: true });
  p.log.success('All Shannon data has been removed.');
  p.outro('Shannon has been uninstalled. Run `npx @keygraph/shannon setup` to start fresh.');
}
