/**
 * Splash screen display — pure terminal output, no npm dependencies.
 */

/**
 * Decide whether to emit ANSI color codes.
 *
 * Honors the NO_COLOR convention (https://no-color.org): any non-empty value
 * disables color. FORCE_COLOR opts back in even when stdout is not a terminal.
 * Otherwise color is only emitted when writing to an interactive TTY, so the
 * escape codes don't leak into piped or redirected output.
 */
function shouldUseColor(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR) return true;
  return process.stdout.isTTY === true;
}

export function displaySplash(version?: string): void {
  const useColor = shouldUseColor();
  const GOLD = useColor ? '\x1b[38;2;244;197;66m' : '';
  const CYAN = useColor ? '\x1b[36;1m' : '';
  const WHITE = useColor ? '\x1b[1;37m' : '';
  const GRAY = useColor ? '\x1b[0;37m' : '';
  const YELLOW = useColor ? '\x1b[1;33m' : '';
  const RESET = useColor ? '\x1b[0m' : '';

  const B = `${CYAN}\u2551${RESET}`;
  const S67 = ' '.repeat(67);
  const HR = '\u2550'.repeat(67);

  const lines = [
    '',
    `  ${CYAN}\u2554${HR}\u2557${RESET}`,
    `  ${B}${S67}${B}`,
    `  ${B}  ${GOLD}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2557  \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557\u2588\u2588\u2588\u2557   \u2588\u2588\u2557 \u2588\u2588\u2588\u2588\u2588\u2588\u2557 \u2588\u2588\u2588\u2557   \u2588\u2588\u2557${RESET}  ${B}`,
    `  ${B}  ${GOLD}\u2588\u2588\u2554\u2550\u2550\u2550\u2550\u255D\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2550\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2557  \u2588\u2588\u2551${RESET}  ${B}`,
    `  ${B}  ${GOLD}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2557\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2554\u2588\u2588\u2557 \u2588\u2588\u2551${RESET}  ${B}`,
    `  ${B}  ${GOLD}\u255A\u2550\u2550\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2554\u2550\u2550\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551\u2588\u2588\u2551   \u2588\u2588\u2551\u2588\u2588\u2551\u255A\u2588\u2588\u2557\u2588\u2588\u2551${RESET}  ${B}`,
    `  ${B}  ${GOLD}\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551  \u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551\u255A\u2588\u2588\u2588\u2588\u2588\u2588\u2554\u255D\u2588\u2588\u2551 \u255A\u2588\u2588\u2588\u2588\u2551${RESET}  ${B}`,
    `  ${B}  ${GOLD}\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D\u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D \u255A\u2550\u2550\u2550\u2550\u2550\u255D \u255A\u2550\u255D  \u255A\u2550\u2550\u2550\u255D${RESET}  ${B}`,
    `  ${B}${S67}${B}`,
    `  ${B}              ${CYAN}\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557${RESET}               ${B}`,
    `  ${B}              ${CYAN}\u2551${RESET}  ${WHITE}AI Penetration Testing Framework${RESET}  ${CYAN}\u2551${RESET}               ${B}`,
    `  ${B}              ${CYAN}\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D${RESET}               ${B}`,
    `  ${B}${S67}${B}`,
  ];

  if (version) {
    const verStr = `v${version}`;
    const verPadLeft = Math.floor((67 - verStr.length) / 2);
    const verPadRight = 67 - verStr.length - verPadLeft;
    lines.push(`  ${B}${' '.repeat(verPadLeft)}${GRAY}${verStr}${RESET}${' '.repeat(verPadRight)}${B}`);
  }

  lines.push(
    `  ${B}${S67}${B}`,
    `  ${B}                    ${YELLOW}\uD83D\uDD10 DEFENSIVE SECURITY ONLY \uD83D\uDD10${RESET}                  ${B}`,
    `  ${B}${S67}${B}`,
    `  ${CYAN}\u255A${HR}\u255D${RESET}`,
    '',
  );

  console.log(lines.join('\n'));
}
