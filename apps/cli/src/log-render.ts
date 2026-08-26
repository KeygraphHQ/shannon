/**
 * Decorates a tailed workflow.log for the terminal.
 *
 * The worker writes workflow.log as plain text and the CLI reads it back, so all of the
 * chrome lives here on the read side. Nothing in this file changes what the log *says* —
 * it adds the section treatments the plain file has no way to carry:
 *
 *   the log header and RESUMED banner  ->  rule()    (their ==== bars become the rule)
 *   everything between phases          ->  gutter()  (one bar per phase, walking the ramp)
 *   the closing Scan COMPLETED block   ->  panel()   (its ==== bars become the frame)
 *
 * When stdout is not a terminal the renderer is a pass-through and emits the file's bytes
 * unchanged, so redirected logs, pipes, and CI keep grepping the same text they always did.
 */

import { field, gutter, palette, panel, rule } from './chrome.js';

/** The ==== bars that open and close a block; replaced by our own chrome. */
const BLOCK_BAR = /^={10,}\s*$/;

/** The ──── bar dividing a block's title from its body; replaced by the panel frame. */
const INNER_BAR = /^─{10,}\s*$/;

/** `[2026-08-26 17:04:11] ` — every streamed event line carries one. */
const TIMESTAMP = /^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])( .*)$/;

/** A phase transition opens a new gutter section. */
const PHASE_START = /^\[[^\]]*\] \[PHASE\] Starting: /;

/** Titles of the two banner blocks, which take the static rule treatment. */
const BANNER_TITLE = /^(Shannon Pentest - Scan Log|RESUMED)$/;

/** Title of the final block, which takes the panel treatment. Mirrors logs.ts's completion regex. */
const COMPLETION_TITLE = /^Scan (COMPLETED|FAILED)$/;

/** Dim the timestamp so the message reads first; errors take the semantic red, not a ramp colour. */
function colorizeEvent(line: string): string {
  const { DIM, RED, RESET } = palette();
  const match = TIMESTAMP.exec(line);
  if (!match) return line;
  const rest = match[2] ?? '';
  const body = rest.includes('[ERROR]') ? `${RED}${rest}${RESET}` : rest;
  return `${DIM}${match[1]}${RESET}${body}`;
}

type Mode = 'stream' | 'banner' | 'summary';

export class LogRenderer {
  /** Bytes past the last newline, held until the rest of the line arrives. */
  private carry = '';
  private mode: Mode = 'stream';
  /** Suppresses a second consecutive blank line; starts true so the stream can't open on one. */
  private lastBlank = true;
  /** Current sunset stop for the gutter bar; advanced by each phase transition. */
  private stop = 0;
  private summaryTitle = '';
  private summaryBody: string[] = [];
  private readonly passthrough: boolean;

  constructor() {
    this.passthrough = !palette().color;
  }

  /** Decorate a chunk of newly appended log text. Incomplete trailing lines are held back. */
  write(chunk: string): string {
    if (this.passthrough) return chunk;

    const text = this.carry + chunk;
    const lines = text.split('\n');
    // The final element is whatever followed the last newline — possibly a partial line.
    this.carry = lines.pop() ?? '';

    const out: string[] = [];
    for (const line of lines) {
      out.push(...this.renderLine(line));
    }
    return this.emit(out);
  }

  /** Join rendered lines, dropping blank runs left behind by the bars we removed. */
  private emit(lines: string[]): string {
    const kept: string[] = [];
    for (const line of lines) {
      const blank = line === '';
      if (blank && this.lastBlank) continue;
      this.lastBlank = blank;
      kept.push(line);
    }
    return kept.length ? `${kept.join('\n')}\n` : '';
  }

  /** Flush a held partial line and close an unterminated summary block. */
  end(): string {
    if (this.passthrough) return '';

    const out: string[] = [];
    if (this.carry) {
      out.push(...this.renderLine(this.carry));
      this.carry = '';
    }
    if (this.mode === 'summary') {
      out.push(...this.closeSummary());
    }
    return this.emit(out);
  }

  private renderLine(raw: string): string[] {
    // Strip the \r from CRLF logs so it never lands in the middle of a decorated line.
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;

    // Only a ==== bar closes the summary; its ──── divider is chrome we replace, not a terminator.
    if (BLOCK_BAR.test(line)) {
      return this.mode === 'summary' ? this.closeSummary() : [];
    }
    if (INNER_BAR.test(line)) return [];

    if (COMPLETION_TITLE.test(line)) {
      this.mode = 'summary';
      this.summaryTitle = line;
      this.summaryBody = [];
      return [''];
    }

    if (BANNER_TITLE.test(line)) {
      this.mode = 'banner';
      return ['', rule(line)];
    }

    if (this.mode === 'summary') {
      this.summaryBody.push(line);
      return [];
    }

    if (this.mode === 'banner') {
      // The banner runs until the first streamed event.
      if (!TIMESTAMP.test(line)) {
        return [line.trim() ? `    ${field(line)}` : ''];
      }
      this.mode = 'stream';
    }

    // A blank line separates sections; the bar resumes on the next line of content.
    if (!line.trim()) return [''];

    if (PHASE_START.test(line)) {
      // Two stops per phase, not one: the 256-colour tier collapses the seven stops into
      // four xterm colours, and a single step would give consecutive phases the same bar.
      // Seven is odd, so a stride of two still visits every stop before repeating.
      this.stop += 2;
    }
    return [gutter(colorizeEvent(line), this.stop)];
  }

  private closeSummary(): string[] {
    const title = this.summaryTitle;
    const body = [...this.summaryBody];
    while (body.length && !body[body.length - 1]?.trim()) body.pop();
    while (body.length && !body[0]?.trim()) body.shift();

    this.mode = 'stream';
    this.summaryTitle = '';
    this.summaryBody = [];

    const rows = body.map((line) => (line.trim() ? field(line) : ''));
    return [...panel(title, rows), ''];
  }
}
