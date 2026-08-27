/**
 * Renders a scan's Temporal state into the terminal progress tree.
 *
 * The same PipelineState drives both the live view (from the getProgress query) and
 * the final view (from the workflow result); the running-agents overlay (from
 * pendingActivities) supplies the in-flight set and retry counts the state lacks.
 * Colors and Unicode glyphs are gated by the caller so the frame degrades off a TTY.
 */

import { BOLD, DIM, GOLD, paint, RED, YELLOW } from '../colors.js';
import { commandPrefix } from '../mode.js';
import type { RunningAgent } from '../temporal-client.js';
import { derivePipeline, isTerminal, type RunState, scanElapsedMs } from './derive.js';
import type { PipelineState } from './pipeline.js';

export interface RenderInput {
  readonly workspace: string;
  /** Temporal workflow id backing this scan (differs from workspace on a resume); used for the dashboard link. */
  readonly workflowId?: string;
  /** Temporal WorkflowExecutionStatusName: RUNNING | COMPLETED | FAILED | CANCELLED | TERMINATED | … */
  readonly temporalStatus: string;
  /** Progress (live) or result (terminal). Null when unavailable, e.g. a hard failure with no result. */
  readonly state: PipelineState | null;
  readonly running: readonly RunningAgent[];
  readonly startedAt?: number;
  readonly endedAt?: number;
  /** Failure text when a failed scan has no readable state. */
  readonly failureMessage?: string;
}

export interface RenderOptions {
  readonly now: number;
  readonly color: boolean;
  readonly unicode: boolean;
  /** True for the live view (adds a watch footer); false for the final/one-shot frame. */
  readonly live: boolean;
  /** Animation tick — advances the running-agent spinner. Ignored for static frames. */
  readonly frame: number;
}

const COLORS = {
  red: RED,
  gold: GOLD,
  yellow: YELLOW,
  dim: DIM,
  bold: BOLD,
} as const;

// === Formatting ===

function formatDuration(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

/** Temporal Web UI, published by compose on 8233; deep-links to the workflow when its id is known. */
function temporalDashboardUrl(workflowId: string | undefined): string {
  const base = 'http://localhost:8233';
  return workflowId ? `${base}/namespaces/default/workflows/${workflowId}` : base;
}

// === Glyphs & status ===

const GLYPH_UNICODE: Record<RunState, string> = {
  pending: '○',
  running: '⟳',
  completed: '●',
  failed: '✗',
  skipped: '·',
};
const GLYPH_ASCII: Record<RunState, string> = {
  pending: '.',
  running: '>',
  completed: '+',
  failed: 'x',
  skipped: '-',
};
const STATE_COLOR: Record<RunState, string> = {
  pending: COLORS.dim,
  running: COLORS.gold,
  completed: COLORS.gold,
  failed: COLORS.red,
  skipped: COLORS.dim,
};

/** Column width for an agent or background-work label inside a phase. */
const AGENT_LABEL_WIDTH = 18;

/** Inline budget for a failure sentence, wide enough to carry a whole first sentence. */
const FAILURE_DETAIL_WIDTH = 120;

/** Braille spinner frames for running agents — the clack loader style. */
const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

function glyph(state: RunState, opts: RenderOptions): string {
  if (state === 'running' && opts.unicode) {
    const spin = SPINNER_FRAMES[opts.frame % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0];
    return paint(spin, STATE_COLOR.running, opts.color);
  }
  const symbol = opts.unicode ? GLYPH_UNICODE[state] : GLYPH_ASCII[state];
  return paint(symbol, STATE_COLOR[state], opts.color);
}

/** Badge text + color for the scan as a whole, preferring the workflow's own status when known. */
function statusBadge(input: RenderInput, opts: RenderOptions): string {
  const workflowStatus = input.state?.status;
  if (!isTerminal(input.temporalStatus)) return paint('running', COLORS.gold, opts.color);
  if (workflowStatus === 'partial') return paint('partial', COLORS.yellow, opts.color);
  if (workflowStatus === 'cancelled') return paint('cancelled', COLORS.yellow, opts.color);
  if (input.temporalStatus === 'COMPLETED') return paint('completed', COLORS.gold, opts.color);
  if (input.temporalStatus === 'TERMINATED') return paint('stopped', COLORS.yellow, opts.color);
  if (input.temporalStatus === 'CANCELLED' || input.temporalStatus === 'CANCELED') {
    return paint('cancelled', COLORS.yellow, opts.color);
  }
  if (input.temporalStatus === 'TIMED_OUT') return paint('timed out', COLORS.red, opts.color);
  return paint('failed', COLORS.red, opts.color);
}

// === Line builders ===

function agentMeta(
  state: RunState,
  metrics: { durationMs: number } | undefined,
  runner: RunningAgent | undefined,
  error: string | undefined,
  opts: RenderOptions,
  step?: string,
): string {
  if (state === 'completed') {
    const duration = metrics?.durationMs != null ? formatDuration(metrics.durationMs) : 'done';
    return paint(duration, COLORS.dim, opts.color);
  }
  if (state === 'running') {
    const parts = ['running'];
    if (step !== undefined) parts.push(step);
    if (runner?.startedAt !== undefined) parts.push(formatDuration(opts.now - runner.startedAt));
    if (runner && runner.attempt > 1) parts.push(`retry ${runner.attempt}`);
    return paint(parts.join(' · '), COLORS.gold, opts.color);
  }
  if (state === 'failed') {
    const detail = error ? ` · ${truncate(error, FAILURE_DETAIL_WIDTH)}` : '';
    return paint(`failed${detail}`, COLORS.red, opts.color);
  }
  if (state === 'skipped') return paint('skipped', COLORS.dim, opts.color);
  return paint('queued', COLORS.dim, opts.color);
}

function phaseMeta(states: readonly RunState[], inPlay: number, parallel: boolean, opts: RenderOptions): string {
  if (states.every((s) => s === 'pending')) return paint('pending', COLORS.dim, opts.color);
  if (states.every((s) => s === 'skipped')) return paint('skipped', COLORS.dim, opts.color);
  if (states.some((s) => s === 'failed') && !states.some((s) => s === 'running')) {
    return paint('failed', COLORS.red, opts.color);
  }
  if (!parallel) return '';
  const done = states.filter((s) => s === 'completed').length;
  const allDone = states.every((s) => s === 'completed' || s === 'skipped');
  return paint(`${done}/${inPlay} done`, allDone ? COLORS.gold : COLORS.dim, opts.color);
}

/** Render the full progress frame as one string (no trailing newline). */
export function renderScan(input: RenderInput, opts: RenderOptions): string {
  const byAgent = new Map(input.running.map((r) => [r.agent, r]));
  const phases = derivePipeline(input, opts.now);
  const lines: string[] = ['', ...headerLines(input, opts), ''];

  // Only agents that have actually entered play are shown; pending/skipped ones stay hidden.
  const inPlay = (s: RunState): boolean => s === 'running' || s === 'completed' || s === 'failed';

  for (const phase of phases) {
    const states = phase.agents.map((agent) => agent.state);
    const playing = states.filter(inPlay).length;
    const phaseRunState = phase.state;
    const metaFor = (agent: (typeof phase.agents)[number]): string => {
      const metrics = agent.durationMs === null ? undefined : { durationMs: agent.durationMs };
      return agentMeta(agent.state, metrics, byAgent.get(agent.name), agent.error, opts, agent.detail);
    };

    // A single-agent phase carries that agent's own duration/cost on the phase line once it
    // starts; a parallel phase gets a "k/N done" summary over the agents in play.
    const first = phase.agents[0];
    const firstState = states[0];
    const phaseMetaStr =
      !phase.parallel && first && firstState && inPlay(firstState)
        ? metaFor(first)
        : phaseMeta(states, playing, phase.parallel, opts);
    lines.push(`  ${glyph(phaseRunState, opts)}  ${phase.label.padEnd(26)}${phaseMetaStr}`);

    if (!phase.parallel) continue;
    for (let i = 0; i < phase.agents.length; i++) {
      const agent = phase.agents[i];
      const state = states[i];
      if (!agent || !state || !inPlay(state)) continue;
      // Two trailing spaces before padding, so a label wider than the column still separates
      // from its meta text; a label inside the column pads to the same width as before.
      lines.push(`       ${glyph(state, opts)} ${`${agent.label}  `.padEnd(AGENT_LABEL_WIDTH)}${metaFor(agent)}`);
    }
  }

  lines.push(...footerLines(input, opts));
  return lines.join('\n');
}

function headerLines(input: RenderInput, opts: RenderOptions): string[] {
  const elapsedMs = scanElapsedMs(input, opts.now);
  const meta = [statusBadge(input, opts), elapsedMs !== undefined ? formatDuration(elapsedMs) : '—'].join(' · ');
  return [`  ${paint('Scan:', COLORS.bold, opts.color)} ${input.workspace.padEnd(22)} ${meta}`];
}

/** Aligned label column for the footer's Logs / Temporal rows. */
const FOOTER_LABEL_WIDTH = 12;

/** A thin rule that sets the footer apart from the phase list above it. */
function footerDivider(opts: RenderOptions): string {
  return paint(`  ${(opts.unicode ? '─' : '-').repeat(60)}`, COLORS.dim, opts.color);
}

/** One footer row: an accent-colored label in a fixed column, then its value in the default color. */
function footerRow(label: string, value: string, opts: RenderOptions): string {
  return `  ${paint(label.padEnd(FOOTER_LABEL_WIDTH), COLORS.gold, opts.color)}${value}`;
}

function footerLines(input: RenderInput, opts: RenderOptions): string[] {
  const prefix = commandPrefix();

  if (isTerminal(input.temporalStatus) && input.state?.summary) {
    const wall = formatDuration(input.state.summary.totalDurationMs);
    const lines = ['', `  Time Taken   ${wall}`];

    // A partial scan names each durable degradation reason through its safe message,
    // so the operator never has to guess why the badge is not "completed".
    const reasons = input.state.partialReasons ?? [];
    if (reasons.length > 0) {
      lines.push('', `  ${paint('Why this scan is partial:', COLORS.yellow, opts.color)}`);
      for (const reason of reasons) {
        lines.push(paint(`    - ${reason.message}`, COLORS.dim, opts.color));
      }
      // The safe message names what degraded; these three name the agentic-SAST failure
      // behind it, under the same labels the scan log and worker output use.
      const agenticSast = input.state.agenticSast;
      if (agenticSast?.status === 'failed') {
        if (agenticSast.failedStageLabel !== undefined) {
          lines.push(paint(`    Agentic SAST stopped at: ${agenticSast.failedStageLabel}`, COLORS.dim, opts.color));
        }
        if (agenticSast.error !== undefined) {
          lines.push(paint(`    What happened: ${agenticSast.error}`, COLORS.dim, opts.color));
        }
        if (agenticSast.errorCode !== undefined) {
          lines.push(paint(`    Reference code (for a bug report): ${agenticSast.errorCode}`, COLORS.dim, opts.color));
        }
      }
    }
    if (input.state.summary.usageAccountingComplete === false) {
      lines.push(
        paint('  Cost is incomplete — some background work is not included in this total.', COLORS.dim, opts.color),
      );
    }
    return lines;
  }

  const logsValue = `${prefix} logs ${input.workspace}`;
  const temporalValue = temporalDashboardUrl(input.workflowId);

  if (isTerminal(input.temporalStatus)) {
    const reason = input.failureMessage ?? input.state?.error ?? 'no result recorded';
    return [
      footerDivider(opts),
      paint(
        `  ${input.temporalStatus === 'TERMINATED' ? 'Stopped' : 'Ended'} — ${truncate(reason, 240)}`,
        COLORS.dim,
        opts.color,
      ),
      footerRow('Logs', logsValue, opts),
      footerRow('Temporal', temporalValue, opts),
    ];
  }

  const lines = [footerDivider(opts), footerRow('Logs', logsValue, opts), footerRow('Temporal', temporalValue, opts)];
  if (opts.live) lines.push('', paint('  Ctrl-C stops watching — the scan keeps running.', COLORS.dim, opts.color));
  return lines;
}
