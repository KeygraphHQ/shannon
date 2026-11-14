/**
 * Reader and formatter for the workspace's persisted agent-failure record, `deliverables/error.log`.
 *
 * `writeErrorLog` in the worker (apps/worker/src/ai/pi/pi-executor.ts) appends one JSON
 * object per terminal agent failure to the deliverables overlay mounted from the
 * workspace. Nothing in the CLI read it: a workspace whose last run ended in a
 * non-retryable failure was still classified as resumable, and when that resume failed
 * without a classified Temporal error type, the CLI printed the generic "Pipeline
 * failed" wrapper while the real reason sat unread here. The resume path now uses this
 * record to refuse a dead workspace up front and to surface the recorded reason.
 */

import fs from 'node:fs';
import { parseFailureSegments } from './failure.js';

/** One parsed error.log record, reduced to the fields the CLI surfaces. */
export interface PersistedAgentFailure {
  /** Stable worker error code (e.g. AGENT_EXECUTION_FAILED). */
  readonly code?: string;
  /** Sanitized one-line failure sentence. */
  readonly message?: string;
  /** False when the worker recorded the failure as non-retryable — a resume cannot get past it. */
  readonly retryable?: boolean;
  /** Provider turn stop reason (e.g. error), when the failure carried one. */
  readonly providerStopReason?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

function shapeEntry(record: Record<string, unknown>): PersistedAgentFailure {
  const error = isRecord(record.error) ? record.error : {};
  const provider = isRecord(record.provider) ? record.provider : {};
  const code = optionalString(error.code);
  const message = optionalString(error.message);
  const providerStopReason = optionalString(provider.stopReason);
  return {
    ...(code !== undefined && { code }),
    ...(message !== undefined && { message }),
    ...(typeof record.retryable === 'boolean' && { retryable: record.retryable }),
    ...(providerStopReason !== undefined && { providerStopReason }),
  };
}

/**
 * Read the most recent usable record from an error.log, walking backwards line by line.
 * A truncated final line (crash between append and flush) is skipped so the prior entry
 * stands; an absent, empty, or wholly unparseable file means no failure was recorded.
 */
export function readLastPersistedAgentFailure(logPath: string): PersistedAgentFailure | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(logPath, 'utf8');
  } catch {
    return undefined;
  }
  const lines = raw.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index]?.trim();
    if (line === undefined || line === '') continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    const failure = shapeEntry(parsed);
    if (failure.message !== undefined || failure.code !== undefined) return failure;
  }
  return undefined;
}

/** Render a record in the worker's '|'-delimited failure format, for the same printers as formatWorkflowError output. */
export function persistedFailureMessage(failure: PersistedAgentFailure): string {
  const segments = [
    'The previous run of this workspace recorded this failure',
    ...(failure.message !== undefined ? [failure.message] : []),
    ...(failure.providerStopReason !== undefined ? [`Provider stop reason: ${failure.providerStopReason}`] : []),
  ];
  return failure.code !== undefined ? [...segments, `Reference code: ${failure.code}`].join('|') : segments.join('|');
}

/**
 * Pick the failure text for the could-not-start branch of a launch: the Temporal outcome
 * message when it names a classified error type (it carries a "Reference code:" segment),
 * otherwise — on a resume — the reason the workspace's error.log recorded, falling back to
 * the outcome message when no record exists. A fresh launch keeps its outcome message as-is.
 */
export function resumeFailureMessage(outcomeMessage: string, logPath: string, isResume: boolean): string {
  if (!isResume) return outcomeMessage;
  if (parseFailureSegments(outcomeMessage).some((segment) => segment.startsWith('Reference code:'))) {
    return outcomeMessage;
  }
  const failure = readLastPersistedAgentFailure(logPath);
  return failure !== undefined ? persistedFailureMessage(failure) : outcomeMessage;
}
