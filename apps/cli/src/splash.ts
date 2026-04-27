/**
 * Splash screen display — pure terminal output, no npm dependencies.
 *
 * Renders Unicode box-drawing + block art when the terminal advertises
 * UTF-8 support, and falls back to a plain-ASCII variant otherwise. The
 * fallback exists because raw cmd.exe, some CI log streams, and locale-
 * less SSH sessions render the Unicode glyphs as `?` or mojibake.
 */

function supportsUtf8(): boolean {
  const lang = process.env.LANG ?? process.env.LC_ALL ?? process.env.LC_CTYPE ?? '';
  if (/utf-?8/i.test(lang)) return true;
  // Windows Terminal and VS Code's integrated terminal report UTF-8
  // capability via env even without a POSIX locale.
  if (process.env.WT_SESSION) return true;
  if (process.env.TERM_PROGRAM === 'vscode') return true;
  return false;
}

export function displaySplash(version?: string): void {
  if (supportsUtf8()) {
    renderUnicodeSplash(version);
  } else {
    renderAsciiSplash(version);
  }
}

function renderUnicodeSplash(version?: string): void {
  const GOLD = '\x1b[38;2;244;197;66m';
  const CYAN = '\x1b[36;1m';
  const WHITE = '\x1b[1;37m';
  const GRAY = '\x1b[0;37m';
  const YELLOW = '\x1b[1;33m';
  const RESET = '\x1b[0m';

  const B = `${CYAN}║${RESET}`;
  const S67 = ' '.repeat(67);
  const HR = '═'.repeat(67);

  const lines = [
    '',
    `  ${CYAN}╔${HR}╗${RESET}`,
    `  ${B}${S67}${B}`,
    `  ${B}  ${GOLD}███████╗██╗  ██╗ █████╗ ███╗   ██╗███╗   ██╗ ██████╗ ███╗   ██╗${RESET}  ${B}`,
    `  ${B}  ${GOLD}██╔════╝██║  ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗████╗  ██║${RESET}  ${B}`,
    `  ${B}  ${GOLD}███████╗███████║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██╔██╗ ██║${RESET}  ${B}`,
    `  ${B}  ${GOLD}╚════██║██╔══██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║╚██╗██║${RESET}  ${B}`,
    `  ${B}  ${GOLD}███████║██║  ██║██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██║ ╚████║${RESET}  ${B}`,
    `  ${B}  ${GOLD}╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝${RESET}  ${B}`,
    `  ${B}${S67}${B}`,
    `  ${B}              ${CYAN}╔═══════════════════════════════════╗${RESET}               ${B}`,
    `  ${B}              ${CYAN}║${RESET}  ${WHITE}AI Penetration Testing Framework${RESET}  ${CYAN}║${RESET}               ${B}`,
    `  ${B}              ${CYAN}╚════════════════════════════════════╝${RESET}               ${B}`,
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
    `  ${B}                    ${YELLOW}🔐 DEFENSIVE SECURITY ONLY 🔐${RESET}                  ${B}`,
    `  ${B}${S67}${B}`,
    `  ${CYAN}╚${HR}╝${RESET}`,
    '',
  );

  console.log(lines.join('\n'));
}

function renderAsciiSplash(version?: string): void {
  const CYAN = '\x1b[36;1m';
  const GOLD = '\x1b[33;1m';
  const WHITE = '\x1b[1;37m';
  const GRAY = '\x1b[0;37m';
  const YELLOW = '\x1b[1;33m';
  const RESET = '\x1b[0m';

  const W = 67;
  const HR = '-'.repeat(W);
  const PAD = ' '.repeat(W);

  const center = (text: string): string => {
    const padLeft = Math.floor((W - text.length) / 2);
    const padRight = W - text.length - padLeft;
    return `${' '.repeat(padLeft)}${text}${' '.repeat(padRight)}`;
  };

  const lines = [
    '',
    `  ${CYAN}+${HR}+${RESET}`,
    `  ${CYAN}|${RESET}${PAD}${CYAN}|${RESET}`,
    `  ${CYAN}|${RESET}${GOLD}${center('SHANNON')}${RESET}${CYAN}|${RESET}`,
    `  ${CYAN}|${RESET}${WHITE}${center('AI Penetration Testing Framework')}${RESET}${CYAN}|${RESET}`,
    `  ${CYAN}|${RESET}${PAD}${CYAN}|${RESET}`,
  ];

  if (version) {
    lines.push(`  ${CYAN}|${RESET}${GRAY}${center(`v${version}`)}${RESET}${CYAN}|${RESET}`);
    lines.push(`  ${CYAN}|${RESET}${PAD}${CYAN}|${RESET}`);
  }

  lines.push(
    `  ${CYAN}|${RESET}${YELLOW}${center('[ DEFENSIVE SECURITY ONLY ]')}${RESET}${CYAN}|${RESET}`,
    `  ${CYAN}|${RESET}${PAD}${CYAN}|${RESET}`,
    `  ${CYAN}+${HR}+${RESET}`,
    '',
  );

  console.log(lines.join('\n'));
}
