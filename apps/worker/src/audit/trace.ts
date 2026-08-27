// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/** Lossless tool-invocation capture shared by every workflow.log producer. */

import { warnLoggingFailure } from './log-stream.js';

/** One immutable tool invocation, serialized synchronously from the PI event. */
export interface ToolInvocation {
  readonly tool: string;
  readonly argumentsJson: string;
}

/** The optional second line a tool call earns on completion. */
/** The one conditional second line a tool call may earn, chosen by {@link decideToolOutcome}. */
export type ToolOutcome =
  | { readonly kind: 'failed'; readonly tool: string; readonly durationMs: number }
  | { readonly kind: 'slow'; readonly tool: string; readonly durationMs: number }
  | { readonly kind: 'count'; readonly tool: string; readonly count: number };

const COLLECTOR_PREFIXES = ['submit_', 'set_', 'add_', 'record_', 'report_'] as const;

/** A successful bash call is worth a slow line past 5s; any other tool past 10s. */
const SLOW_BASH_MS = 5_000;
const SLOW_OTHER_MS = 10_000;

/**
 * Walk a value and throw on the first thing that cannot round-trip through `JSON.stringify`
 * unchanged: a cycle, a sparse or extended array, a non-plain object, or an accessor or symbol
 * property. `JSON.stringify` would otherwise silently drop or reshape these rather than fail, and
 * a silently-altered tool-call argument would break the log's claim to being a lossless capture.
 */
function assertJsonValue(value: unknown, activeObjects: WeakSet<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('tool arguments contain a non-finite number');
    return;
  }
  if (typeof value !== 'object') throw new TypeError('tool arguments contain a non-JSON value');
  if (activeObjects.has(value)) throw new TypeError('tool arguments contain a cycle');

  activeObjects.add(value);
  try {
    if (Array.isArray(value)) {
      const enumerableKeys = Object.keys(value);
      if (enumerableKeys.length !== value.length) throw new TypeError('tool arguments contain a sparse array');
      for (let index = 0; index < value.length; index += 1) {
        if (enumerableKeys[index] !== String(index)) throw new TypeError('tool arguments contain an extended array');
        assertJsonValue(value[index], activeObjects);
      }
      return;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('tool arguments contain a non-plain object');
    }
    const enumerableKeys = Object.keys(value);
    if (Reflect.ownKeys(value).length !== enumerableKeys.length) {
      throw new TypeError('tool arguments contain a non-enumerable or symbol field');
    }
    for (const key of enumerableKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) {
        throw new TypeError('tool arguments contain an accessor field');
      }
      assertJsonValue(descriptor.value, activeObjects);
    }
  } finally {
    activeObjects.delete(value);
  }
}

/**
 * Snapshot a PI argument payload as compact JSON. PI arguments are parsed JSON; the
 * validation prevents future in-process callers from silently losing non-JSON values.
 */
export function serializeToolArguments(args: unknown): string | undefined {
  if (args === undefined) return '{}';
  try {
    assertJsonValue(args, new WeakSet<object>());
    const serialized = JSON.stringify(args);
    if (serialized === undefined) throw new TypeError('tool arguments could not be serialized');
    return serialized;
  } catch {
    warnLoggingFailure();
    return undefined;
  }
}

/** Capture the literal tool name and complete serialized arguments in the event callback. */
export function captureToolInvocation(tool: string, args: unknown): ToolInvocation | undefined {
  const argumentsJson = serializeToolArguments(args);
  return argumentsJson === undefined ? undefined : { tool, argumentsJson };
}

function isCollectorName(tool: string): boolean {
  return COLLECTOR_PREFIXES.some((prefix) => tool.startsWith(prefix));
}

/**
 * Decide whether a completed tool call earns a second line. Task calls use their
 * delegated-session lifecycle instead of duplicate generic failure or slow records.
 */
export function decideToolOutcome(
  tool: string,
  isError: boolean,
  durationMs: number,
  collectorCount: number | undefined,
): ToolOutcome | undefined {
  if (tool === 'task') return undefined;
  if (isError) return { kind: 'failed', tool, durationMs };
  if (isCollectorName(tool)) {
    if (typeof collectorCount === 'number' && Number.isSafeInteger(collectorCount) && collectorCount >= 0) {
      return { kind: 'count', tool, count: collectorCount };
    }
    return undefined;
  }
  const threshold = tool === 'bash' ? SLOW_BASH_MS : SLOW_OTHER_MS;
  return durationMs > threshold ? { kind: 'slow', tool, durationMs } : undefined;
}
