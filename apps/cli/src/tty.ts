/**
 * Terminal capability detection — output coloring, cursor animation, and
 * whether the user can be prompted interactively.
 */

/** True when stdout is a real terminal — safe for color, cursor moves, and spinners. */
export function stdoutIsTerminal(): boolean {
  return !!process.stdout.isTTY;
}

/** True when both stdin and stdout are terminals, so interactive prompts can run. */
function isInteractive(): boolean {
  return !!process.stdin.isTTY && !!process.stdout.isTTY;
}

/** True when color escapes should be emitted. NO_COLOR disables; FORCE_COLOR overrides (0/false/empty = off). */
export function supportsColor(): boolean {
  if (process.env.NO_COLOR !== undefined) return false;

  const force = process.env.FORCE_COLOR;
  if (force !== undefined) {
    return force !== '0' && force !== 'false' && force !== '';
  }

  return stdoutIsTerminal();
}

/** Exit with a clear error when an interactive-only command has no terminal, instead of hanging on a prompt. */
export function requireInteractive(command: string, alternative: string): void {
  if (isInteractive()) return;
  console.error(`ERROR: '${command}' needs an interactive terminal.`);
  console.error(alternative);
  process.exit(1);
}
