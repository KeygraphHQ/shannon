/**
 * Shared confirmation prompt for destructive or batch commands.
 *
 * `stop`, `reset`, and `uninstall` all gate their action behind the same
 * "confirm unless --yes" flow. Centralizing it here keeps the behavior identical
 * across commands and impossible to change in only one place by accident.
 */

import * as p from '@clack/prompts';
import { requireInteractive } from './tty.js';

/**
 * Ask the user to confirm an action, unless `yes` was passed. Off a TTY without
 * `--yes`, fails fast rather than hanging on a prompt. Exits 0 if the user declines.
 */
export async function confirmOrExit(command: string, message: string, yes: boolean): Promise<void> {
  if (yes) {
    return;
  }

  requireInteractive(command, 'Re-run with --yes to skip this confirmation.');
  const confirmed = await p.confirm({ message });
  if (p.isCancel(confirmed) || !confirmed) {
    p.cancel('Aborted.');
    process.exit(0);
  }
}
