/**
 * Splash screen display — pure terminal output, no npm dependencies.
 * Color escapes are gated on terminal support; the Unicode art is always kept.
 */

import { palette } from './chrome.js';

/** SHANNON wordmark. Block glyphs take the row fill; box-drawing strokes take the deeper edge shade. */
const SHANNON = [
  '███████╗██╗  ██╗ █████╗ ███╗   ██╗███╗   ██╗ ██████╗ ███╗   ██╗',
  '██╔════╝██║  ██║██╔══██╗████╗  ██║████╗  ██║██╔═══██╗████╗  ██║',
  '███████╗███████║███████║██╔██╗ ██║██╔██╗ ██║██║   ██║██╔██╗ ██║',
  '╚════██║██╔══██║██╔══██║██║╚██╗██║██║╚██╗██║██║   ██║██║╚██╗██║',
  '███████║██║  ██║██║  ██║██║ ╚████║██║ ╚████║╚██████╔╝██║ ╚████║',
  '╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝',
];

export function displaySplash(version?: string): void {
  const { color, RESET, WHITE, GRAY, DIM, ramp } = palette();

  /** Color one wordmark row, emitting an escape only where the run changes. Spaces stay unpainted. */
  const paint = (row: string, fill: string, edge: string): string => {
    if (!color) return row;
    let out = '';
    let open = '';
    for (const ch of row) {
      const want = ch === ' ' ? '' : ch === '█' ? fill : edge;
      if (want !== open) {
        if (open) out += RESET;
        out += want;
        open = want;
      }
      out += ch;
    }
    return open ? out + RESET : out;
  };

  const lines = [
    '',
    `  ${WHITE}Keygraph${RESET}${version ? `  ${DIM}v${version}${RESET}` : ''}`,
    '',
    ...SHANNON.map((row, i) => `  ${paint(row, ramp[i] ?? '', ramp[i + 1] ?? '')}`),
    '',
    `  ${WHITE}AI Pentester for Web Apps and APIs${RESET}`,
    '',
    `  ${GRAY}-Authorized Security Testing Only-${RESET}`,
    '',
  ];

  console.log(lines.join('\n'));
}

/** Matches the divider width the CI wrappers and the scan renderer already use. */
const RULE_WIDTH = 60;

/**
 * Plain-text banner for non-terminal output (CI logs, pipes, redirects).
 * Drops the wordmark but keeps the authorized-use notice, which a reader of
 * someone else's pipeline log still needs to see.
 */
export function displayPlainBanner(version?: string): void {
  const rule = '─'.repeat(RULE_WIDTH);
  console.log(rule);
  console.log(version ? ` Shannon v${version}` : ' Shannon');
  console.log(' AI Pentester for Web Apps and APIs, by Keygraph');
  console.log(' Authorized security testing only.');
  console.log(rule);
}
