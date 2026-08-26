/**
 * Section chrome — the sunset-ramp hierarchy beneath the splash wordmark.
 * (Distinct from ui.ts, which holds the spinner/step helpers.)
 *
 * Three treatments, one job each:
 *   rule()    static blocks that print once — `start`, `status`, a log's header
 *   gutter()  streaming output, where a section scrolls off the top of the screen
 *   panel()   the single summary block at the end of a run
 *
 * Presentation only. None of this is ever written to workflow.log — the file on disk
 * stays plain text so `tail`, `grep`, and the completion regex in commands/logs.ts keep
 * working against it.
 */

import { supportsColor } from './tty.js';

/**
 * Sunset ramp, yellow at the top row down to burnt orange at the base.
 * The wordmark paints row i with stop i and edges it with stop i + 1; section chrome
 * draws from the same seven stops so the hierarchy reads as one family.
 * `xterm` is the 256-color approximation for terminals without 24-bit color.
 */
export const SUNSET: ReadonlyArray<{ rgb: readonly [number, number, number]; xterm: number }> = [
  { rgb: [247, 203, 45], xterm: 220 },
  { rgb: [246, 182, 38], xterm: 220 },
  { rgb: [245, 160, 32], xterm: 214 },
  { rgb: [242, 141, 28], xterm: 214 },
  { rgb: [238, 121, 24], xterm: 208 },
  { rgb: [231, 100, 21], xterm: 208 },
  { rgb: [222, 82, 19], xterm: 202 },
];

/** Half-block bar for streaming sections — the wordmark's █ at one eighth the weight. */
const BAR = '▌';

/** Columns reserved to the left of every section, matching the existing output grid. */
const INDENT = 2;

/** Rules stop here even in a wide terminal; a rule spanning 200 columns reads as a divider, not a header. */
const MAX_RULE = 64;

export interface Palette {
  color: boolean;
  RESET: string;
  WHITE: string;
  GRAY: string;
  DIM: string;
  RED: string;
  /** The seven sunset stops, ready to emit. Empty strings when color is off. */
  ramp: string[];
  /** Ramp stop 0 — the solid yellow used for every static rule. */
  YELLOW: string;
}

/**
 * Build the escape set for the current terminal, degrading 24-bit → 256-color → bare text.
 * Resolved per call rather than at import so NO_COLOR/FORCE_COLOR are honored whenever they land.
 */
export function palette(): Palette {
  const color = supportsColor();
  const truecolor = color && /truecolor|24bit/i.test(process.env.COLORTERM ?? '');

  const ramp = SUNSET.map(({ rgb: [r, g, b], xterm }) => {
    if (!color) return '';
    return truecolor ? `\x1b[38;2;${r};${g};${b}m` : `\x1b[38;5;${xterm}m`;
  });

  return {
    color,
    RESET: color ? '\x1b[0m' : '',
    WHITE: color ? '\x1b[1;97m' : '',
    GRAY: color ? '\x1b[0;37m' : '',
    DIM: color ? '\x1b[90m' : '',
    RED: color ? '\x1b[0;31m' : '',
    ramp,
    YELLOW: ramp[0] ?? '',
  };
}

/** Usable width, leaving the indent and a column of breathing room at the right edge. */
function columns(): number {
  return process.stdout.columns && process.stdout.columns > 0 ? process.stdout.columns : 80;
}

/** Printed width of a string, ignoring any escapes already embedded in it. */
export function visibleWidth(text: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching SGR escapes is the point
  return text.replace(/\x1b\[[0-9;]*m/g, '').length;
}

/**
 * Option A — a static section header: the existing label, then a solid yellow rule.
 * The label keeps whatever case and punctuation it already had; only the rule is added.
 * Degrades to an undecorated label when the terminal is too narrow to carry one.
 */
export function rule(label: string, indent = INDENT): string {
  const { WHITE, YELLOW, RESET } = palette();
  const pad = ' '.repeat(indent);
  const width = Math.min(MAX_RULE, columns() - indent - 1);
  const dashes = width - visibleWidth(label) - 1;

  if (dashes < 2) return `${pad}${WHITE}${label}${RESET}`;
  return `${pad}${WHITE}${label}${RESET} ${YELLOW}${'─'.repeat(dashes)}${RESET}`;
}

/**
 * Grey the label half of an aligned `Label:   value` line, leaving the value at default
 * weight. Purely additive: the string's own characters are never rewritten, so alignment
 * that was already correct stays correct.
 */
export function field(line: string): string {
  const { GRAY, RESET } = palette();
  const match = /^(\s*)([A-Za-z][A-Za-z ]*:)(\s*)(.*)$/.exec(line);
  if (!match) return line;
  return `${match[1]}${GRAY}${match[2]}${RESET}${match[3]}${match[4]}`;
}

/**
 * Option C — one line of a streaming section, carrying the section's bar in the gutter.
 * `stop` indexes the sunset ramp and wraps, so consecutive sections stay distinguishable
 * however many a run produces.
 */
export function gutter(text: string, stop: number, indent = INDENT): string {
  const { ramp, RESET } = palette();
  const color = ramp[((stop % ramp.length) + ramp.length) % ramp.length] ?? '';
  const pad = ' '.repeat(indent);
  // Trailing space is dropped on empty lines so sections don't emit trailing whitespace.
  return text ? `${pad}${color}${BAR}${RESET} ${text}` : `${pad}${color}${BAR}${RESET}`;
}

/**
 * Option E — the framed summary block, used once at the end of a run.
 * Falls back to a rule plus indented lines when the terminal is too narrow to hold the
 * frame, since a box that wraps is worse than no box at all.
 */
export function panel(title: string, body: string[], indent = INDENT): string[] {
  const { WHITE, YELLOW, RESET } = palette();
  const pad = ' '.repeat(indent);
  const titleWidth = visibleWidth(title);
  const widest = body.reduce((max, line) => Math.max(max, visibleWidth(line)), 0);

  const available = columns() - indent - 6;
  const inner = Math.max(titleWidth + 1, widest);

  if (available < inner || available < titleWidth + 3) {
    return [rule(title, indent), '', ...body.map((line) => `${pad}  ${line}`)];
  }

  const frame = (s: string): string => `${YELLOW}${s}${RESET}`;
  const top = `${pad}${frame('╭─')} ${WHITE}${title}${RESET} ${frame(`${'─'.repeat(inner + 1 - titleWidth)}╮`)}`;
  const bottom = `${pad}${frame(`╰${'─'.repeat(inner + 4)}╯`)}`;

  const rows = body.map((line) => {
    const fill = ' '.repeat(inner - visibleWidth(line));
    return `${pad}${frame('│')}  ${line}${fill}  ${frame('│')}`;
  });

  return [top, ...rows, bottom];
}
