/**
 * Shared confirmation prompt for destructive or batch commands.
 *
 * `stop` and `reset` gate their action behind the same "confirm unless --yes"
 * flow. Centralizing it here keeps the behavior identical across commands and
 * impossible to change in only one place by accident.
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

/**
 * Severe-tier confirmation: the user must type `word` exactly to proceed. Unlike
 * `confirmOrExit` there is no `--yes` bypass. Off a TTY it fails fast; exits 0 if declined.
 */
export async function confirmByTyping(command: string, word: string): Promise<void> {
  requireInteractive(command, `'${command}' cannot be run non-interactively.`);
  const typed = await p.text({
    message: `Type ${word} to confirm — this cannot be undone:`,
    validate: (value) => (value === word ? undefined : `Type ${word} to proceed, or press Ctrl-C to abort.`),
  });
  if (p.isCancel(typed) || typed !== word) {
    p.cancel('Aborted.');
    process.exit(0);
  }
}
