/**
 * Renders a scan's Temporal state into the terminal progress tree.
 *
 * The same PipelineState drives both the live view (from the getProgress query) and
 * the final view (from the workflow result); the running-agents overlay (from
 * pendingActivities) supplies the in-flight set and retry counts the state lacks.
 * Colors and Unicode glyphs are gated by the caller so the frame degrades off a TTY.
 */

import { BOLD, DIM, GOLD, paint, RED, YELLOW } from '../colors.js';
import { isLocal } from '../mode.js';
import type { RunningAgent } from '../temporal-client.js';
import { agentClass, PIPELINE, type PipelineState } from './pipeline.js';

export interface RenderInput {
  readonly workspace: string;
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

type RunState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

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

function formatCost(usd: number): string {
  return `$${usd.toFixed(2)}`;
}

function truncate(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`;
}

function commandPrefix(): string {
  return isLocal() ? './shannon' : 'npx @keygraph/shannon';
}

// === Derivation ===

function isTerminal(status: string): boolean {
  return status !== 'RUNNING' && status !== 'UNSPECIFIED';
}

function isFailedAgent(name: string, state: PipelineState | null): boolean {
  return !!state && (state.failedAgent === name || state.failedPipelines.some((f) => f.vulnType === agentClass(name)));
}

/** An agent has entered play once it is running, has metrics, or has failed. */
function isAgentActive(name: string, state: PipelineState | null, running: Set<string>): boolean {
  return running.has(name) || !!state?.agentMetrics[name] || isFailedAgent(name, state);
}

/**
 * Resolve one agent's state. "Ran" is signalled by a metrics entry, not by
 * completedAgents — the workflow lists conditionally-skipped agents (e.g. exploit
 * agents when there is nothing to exploit) as completed but records no metrics for
 * them. `resolved` is true once we've moved past this agent's phase (the scan is
 * terminal, or a later phase is already active), at which point a metric-less,
 * non-running agent is skipped rather than still pending.
 */
function agentState(name: string, state: PipelineState | null, running: Set<string>, resolved: boolean): RunState {
  if (running.has(name)) return 'running';
  if (isFailedAgent(name, state)) return 'failed';
  if (state?.agentMetrics[name]) return 'completed';
  return resolved ? 'skipped' : 'pending';
}

function agentError(name: string, state: PipelineState | null, byAgent: Map<string, RunningAgent>): string | undefined {
  const failed = state?.failedPipelines.find((f) => f.vulnType === agentClass(name));
  return (
    failed?.error ??
    byAgent.get(name)?.lastFailure ??
    (state?.failedAgent === name ? (state.error ?? undefined) : undefined)
  );
}

function scanElapsedMs(input: RenderInput, now: number): number | undefined {
  if (isTerminal(input.temporalStatus)) {
    if (input.state?.summary) return input.state.summary.totalDurationMs;
    if (input.endedAt !== undefined && input.startedAt !== undefined) return input.endedAt - input.startedAt;
    return undefined;
  }
  return input.startedAt !== undefined ? now - input.startedAt : undefined;
}

function totalCostUsd(state: PipelineState | null): number | undefined {
  if (state?.summary) return state.summary.totalCostUsd;
  if (!state) return undefined;
  const values = Object.values(state.agentMetrics).map((m) => m.costUsd ?? 0);
  return values.length > 0 ? values.reduce((a, b) => a + b, 0) : undefined;
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
  if (input.temporalStatus === 'COMPLETED') return paint('completed', COLORS.gold, opts.color);
  if (input.temporalStatus === 'TERMINATED') return paint('stopped', COLORS.yellow, opts.color);
  if (input.temporalStatus === 'CANCELLED' || input.temporalStatus === 'CANCELED') {
    return paint('cancelled', COLORS.yellow, opts.color);
  }
  if (input.temporalStatus === 'TIMED_OUT') return paint('timed out', COLORS.red, opts.color);
  return paint('FAILED', COLORS.red, opts.color);
}

// === Line builders ===

function agentMeta(
  state: RunState,
  metrics: { durationMs: number; costUsd: number | null } | undefined,
  runner: RunningAgent | undefined,
  error: string | undefined,
  opts: RenderOptions,
): string {
  if (state === 'completed') {
    const cost = metrics?.costUsd != null ? ` · ${formatCost(metrics.costUsd)}` : '';
    const duration = metrics?.durationMs != null ? formatDuration(metrics.durationMs) : 'done';
    return paint(`${duration}${cost}`, COLORS.dim, opts.color);
  }
  if (state === 'running') {
    const parts = ['running'];
    if (runner?.startedAt !== undefined) parts.push(formatDuration(opts.now - runner.startedAt));
    if (runner && runner.attempt > 1) parts.push(`retry ${runner.attempt}`);
    return paint(parts.join(' · '), COLORS.gold, opts.color);
  }
  if (state === 'failed') {
    const detail = error ? ` · ${truncate(error, 46)}` : '';
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
  const runningSet = new Set(input.running.map((r) => r.agent));
  const lines: string[] = ['', ...headerLines(input, opts), ''];

  const terminal = isTerminal(input.temporalStatus);
  const metaFor = (name: string, state: RunState): string =>
    agentMeta(state, input.state?.agentMetrics[name], byAgent.get(name), agentError(name, input.state, byAgent), opts);
  // Only agents that have actually entered play are shown; pending/skipped ones stay hidden.
  const inPlay = (s: RunState): boolean => s === 'running' || s === 'completed' || s === 'failed';

  // The pipeline is sequential across phases: the last phase with any active agent is
  // the frontier. Earlier phases with nothing active were skipped (e.g. exploitation
  // when no class had anything to exploit), not still pending.
  let frontier = -1;
  PIPELINE.forEach((phase, idx) => {
    if (phase.agents.some((a) => isAgentActive(a.name, input.state, runningSet))) frontier = idx;
  });

  for (const [phaseIdx, phase] of PIPELINE.entries()) {
    const resolved = terminal || phaseIdx < frontier;
    const states = phase.agents.map((a) => agentState(a.name, input.state, runningSet, resolved));
    const playing = states.filter(inPlay).length;
    const phaseRunState: RunState = phaseGlyphState(states);

    // A single-agent phase carries that agent's own duration/cost on the phase line once it
    // starts; a parallel phase gets a "k/N done" summary over the agents in play.
    const first = phase.agents[0];
    const firstState = states[0];
    const phaseMetaStr =
      !phase.parallel && first && firstState && inPlay(firstState)
        ? metaFor(first.name, firstState)
        : phaseMeta(states, playing, phase.parallel, opts);
    lines.push(`  ${glyph(phaseRunState, opts)}  ${phase.label.padEnd(26)}${phaseMetaStr}`);

    if (!phase.parallel) continue;
    for (let i = 0; i < phase.agents.length; i++) {
      const agent = phase.agents[i];
      const state = states[i];
      if (!agent || !state || !inPlay(state)) continue;
      lines.push(`       ${glyph(state, opts)} ${agent.label.padEnd(18)}${metaFor(agent.name, state)}`);
    }
  }

  lines.push('', ...footerLines(input, opts));
  return lines.join('\n');
}

/** Collapse a phase's agent states into a single glyph state for the phase line. */
function phaseGlyphState(states: readonly RunState[]): RunState {
  if (states.some((s) => s === 'running')) return 'running';
  if (states.some((s) => s === 'failed')) return 'failed';
  if (states.every((s) => s === 'skipped')) return 'skipped';
  if (states.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  if (states.some((s) => s === 'completed')) return 'running';
  return 'pending';
}

function headerLines(input: RenderInput, opts: RenderOptions): string[] {
  const elapsedMs = scanElapsedMs(input, opts.now);
  const cost = totalCostUsd(input.state);
  const meta = [
    statusBadge(input, opts),
    elapsedMs !== undefined ? formatDuration(elapsedMs) : '—',
    cost !== undefined ? formatCost(cost) : '$0.00',
  ].join(' · ');
  return [`  ${paint('Scan:', COLORS.bold, opts.color)} ${input.workspace.padEnd(22)} ${meta}`];
}

function footerLines(input: RenderInput, opts: RenderOptions): string[] {
  const prefix = commandPrefix();

  if (isTerminal(input.temporalStatus) && input.state?.summary) {
    const wall = formatDuration(input.state.summary.totalDurationMs);
    return [`  Total cost   ${formatCost(input.state.summary.totalCostUsd)}`, `  Time Taken   ${wall}`];
  }

  if (isTerminal(input.temporalStatus)) {
    const reason = input.failureMessage ?? input.state?.error ?? 'no result recorded';
    return [
      paint(
        `  ${input.temporalStatus === 'TERMINATED' ? 'Stopped' : 'Ended'} — ${truncate(reason, 70)}`,
        COLORS.dim,
        opts.color,
      ),
      `  Logs:  ${prefix} logs ${input.workspace}`,
    ];
  }

  const lines = [paint(`  Live from Temporal. Full logs: ${prefix} logs ${input.workspace}`, COLORS.dim, opts.color)];
  if (opts.live) lines.push(paint('  Ctrl-C to stop watching — the scan keeps running.', COLORS.dim, opts.color));
  return lines;
}
