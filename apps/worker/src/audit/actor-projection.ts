// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * The single projection boundary from a trace actor to its rendered forms: the combined-log
 * prefix, and the per-agent file it also fans out to. All actor validation and filename mapping
 * lives here, so no caller ever parses identity back out of a formatted line, and a slug can only
 * be built from closed actor fields.
 */

import path from 'node:path';
import { isCapellaStage } from '../ai/sast/types.js';
import { containsControlCharacter, isLoggableAgentName, type LoggableAgentName } from './safe-fields.js';

/**
 * The actor a trace line is attributed to, rendered as its `[...]` prefix: a top-level agent, a
 * delegated subagent under its parent, or an Agentic SAST stage that may name one of its concurrent
 * sessions.
 */
export type TraceActor =
  | { readonly kind: 'agent'; readonly agent: LoggableAgentName }
  | { readonly kind: 'child'; readonly parent: LoggableAgentName; readonly child: string }
  | { readonly kind: 'sast'; readonly stage: string; readonly session?: string };

/**
 * The rendered forms of one actor. `combinedPrefix` is absent only when the actor itself is
 * unsafe, which drops the whole line (the pre-existing fail-closed behavior). `agentFileSlug` is
 * absent when no safe owning file can be named; that skips the per-agent fan-out only and never
 * affects the combined line.
 */
export interface ActorProjection {
  readonly combinedPrefix?: string;
  readonly agentFileSlug?: string;
}

/** A subagent or Capella session identity: normalized words plus an optional `#N` ordinal. */
export function safeIdentityLabel(value: string): string | undefined {
  if (containsControlCharacter(value)) return undefined;
  return /^[a-z0-9][a-z0-9 '#-]{0,47}$/u.test(value) ? value : undefined;
}

/** A per-agent log filename stem, drawn only from closed actor fields, safe as a path basename. */
export function safeAgentFileSlug(value: string): string | undefined {
  return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value) ? value : undefined;
}

/** Render an actor's `[...]` prefix content, or `undefined` when any structural part is unsafe. */
export function formatActor(actor: TraceActor): string | undefined {
  if (actor.kind === 'agent') {
    return isLoggableAgentName(actor.agent) ? actor.agent : undefined;
  }
  if (actor.kind === 'child') {
    if (!isLoggableAgentName(actor.parent)) return undefined;
    const child = safeIdentityLabel(actor.child);
    return child !== undefined ? `${actor.parent} > ${child}` : undefined;
  }
  if (!isCapellaStage(actor.stage)) return undefined;
  const base = `agentic-sast > ${actor.stage}`;
  // A missing or unsafe session label degrades to the stage-only prefix; it never drops the line.
  if (actor.session === undefined) return base;
  const session = safeIdentityLabel(actor.session);
  return session !== undefined ? `${base} > ${session}` : base;
}

/**
 * The stem of the per-agent file this actor's lines belong to, or `undefined` when none is safe.
 * The stem is gated on the actor's closed field first (a known agent name or Capella stage), then
 * re-checked for path safety, so an unknown name never spawns a stray file.
 */
export function agentFileSlug(actor: TraceActor): string | undefined {
  if (actor.kind === 'agent') return isLoggableAgentName(actor.agent) ? safeAgentFileSlug(actor.agent) : undefined;
  // A delegated subagent folds into its parent's file to keep the delegation narrative intact.
  if (actor.kind === 'child') return isLoggableAgentName(actor.parent) ? safeAgentFileSlug(actor.parent) : undefined;
  return isCapellaStage(actor.stage) ? safeAgentFileSlug(`agentic-sast-${actor.stage}`) : undefined;
}

/** Project an actor into its combined-log prefix and its owning per-agent file stem. */
export function projectActor(actor: TraceActor): ActorProjection {
  const combinedPrefix = formatActor(actor);
  const slug = agentFileSlug(actor);
  return {
    ...(combinedPrefix !== undefined && { combinedPrefix }),
    ...(slug !== undefined && { agentFileSlug: slug }),
  };
}

/** The `agents/` directory that holds a scan's per-agent logs, a sibling of the combined log. */
export function agentsDir(workflowLogPath: string): string {
  return path.join(path.dirname(workflowLogPath), 'agents');
}

/** The absolute path of a per-agent log, a sibling `agents/<slug>.log` of the combined log. */
export function agentLogPath(workflowLogPath: string, slug: string): string {
  return path.join(agentsDir(workflowLogPath), `${slug}.log`);
}
