// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * TypeBox schemas + submit-tool factory for vulnerability exploitation queues.
 *
 * pi has no JSON-schema output format, so each vuln agent's structured queue is
 * captured via a `submit_exploitation_queue` custom tool whose parameters mirror
 * the per-class schema below. The captured payload is written to
 * `<class>_exploitation_queue.json` by the caller (agent-execution).
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, type TObject, Type } from 'typebox';
import type { AgentName } from '../types/agents.js';

const ANALYSIS_NOTES_DESCRIPTION = 'Plain context for defenders (caveats, scope, what is at risk). Not attack steps.';

const optStr = (description?: string) => Type.Optional(Type.String(description ? { description } : {}));

/** Base fields shared by every queue entry. `notes` gains guidance in analysis mode. */
function baseFields(exploit: boolean) {
  return {
    ID: Type.String(),
    vulnerability_type: Type.String(),
    externally_exploitable: Type.Boolean(),
    confidence: Type.String(),
    notes: exploit ? optStr() : optStr(ANALYSIS_NOTES_DESCRIPTION),
  };
}

const injectionFields = {
  source: optStr(),
  combined_sources: optStr(),
  path: optStr(),
  sink_call: optStr(),
  slot_type: optStr(),
  sanitization_observed: optStr(),
  concat_occurrences: optStr(),
  verdict: optStr(),
  mismatch_reason: optStr(),
  witness_payload: optStr(),
};

const xssFields = {
  source: optStr(),
  source_detail: optStr(),
  path: optStr(),
  sink_function: optStr(),
  render_context: optStr(),
  encoding_observed: optStr(),
  verdict: optStr(),
  mismatch_reason: optStr(),
  witness_payload: optStr(),
};

const authFields = {
  source_endpoint: optStr(),
  vulnerable_code_location: optStr(),
  missing_defense: optStr(),
  exploitation_hypothesis: optStr(),
  suggested_exploit_technique: optStr(),
};

const ssrfFields = {
  source_endpoint: optStr(),
  vulnerable_parameter: optStr(),
  vulnerable_code_location: optStr(),
  missing_defense: optStr(),
  exploitation_hypothesis: optStr(),
  suggested_exploit_technique: optStr(),
};

const authzFields = {
  endpoint: optStr(),
  vulnerable_code_location: optStr(),
  role_context: optStr(),
  guard_evidence: optStr(),
  side_effect: optStr(),
  reason: optStr(),
  minimal_witness: optStr(),
};

const PER_TYPE_FIELDS: Partial<Record<AgentName, Record<string, ReturnType<typeof optStr>>>> = {
  'injection-vuln': injectionFields,
  'xss-vuln': xssFields,
  'auth-vuln': authFields,
  'ssrf-vuln': ssrfFields,
  'authz-vuln': authzFields,
};

/** Build the `{ vulnerabilities: [...] }` queue schema for an agent + mode. */
function queueSchema(agentName: AgentName, exploit: boolean): TObject | null {
  const extra = PER_TYPE_FIELDS[agentName];
  if (!extra) return null;
  return Type.Object({
    vulnerabilities: Type.Array(Type.Object({ ...baseFields(exploit), ...extra })),
  });
}

// === Inferred entry types (consumed by renderers) ===
export type InjectionFinding = Static<ReturnType<typeof injectionEntry>>;
export type XssFinding = Static<ReturnType<typeof xssEntry>>;
export type AuthFinding = Static<ReturnType<typeof authEntry>>;
export type SsrfFinding = Static<ReturnType<typeof ssrfEntry>>;
export type AuthzFinding = Static<ReturnType<typeof authzEntry>>;

const injectionEntry = () => Type.Object({ ...baseFields(true), ...injectionFields });
const xssEntry = () => Type.Object({ ...baseFields(true), ...xssFields });
const authEntry = () => Type.Object({ ...baseFields(true), ...authFields });
const ssrfEntry = () => Type.Object({ ...baseFields(true), ...ssrfFields });
const authzEntry = () => Type.Object({ ...baseFields(true), ...authzFields });

const VULN_AGENT_QUEUE_FILENAMES: Partial<Record<AgentName, string>> = {
  'injection-vuln': 'injection_exploitation_queue.json',
  'xss-vuln': 'xss_exploitation_queue.json',
  'auth-vuln': 'auth_exploitation_queue.json',
  'ssrf-vuln': 'ssrf_exploitation_queue.json',
  'authz-vuln': 'authz_exploitation_queue.json',
};

/** Returns the queue filename for a vuln agent, or undefined for non-vuln agents. */
export function getQueueFilename(agentName: AgentName): string | undefined {
  return VULN_AGENT_QUEUE_FILENAMES[agentName];
}

export interface QueueSubmitTool {
  tool: ToolDefinition;
  getCaptured: () => unknown;
}

/**
 * Build the `submit_exploitation_queue` tool for a vuln agent, or null for
 * non-vuln agents. The agent calls it once with the full findings list; the
 * captured payload is the structured queue.
 */
export function createQueueSubmitTool(agentName: AgentName, exploit: boolean): QueueSubmitTool | null {
  const schema = queueSchema(agentName, exploit);
  if (!schema) return null;
  let captured: unknown;
  const tool = defineTool({
    name: 'submit_exploitation_queue',
    label: 'Submit Exploitation Queue',
    description:
      'Submit the final structured list of analyzed vulnerabilities for this class. Call exactly once when ' +
      'analysis is complete, with every finding included.',
    promptSnippet: 'submit_exploitation_queue: record the final structured findings list (call once)',
    parameters: schema,
    execute: async (_toolCallId, params) => {
      captured = params;
      const count = (params as { vulnerabilities?: unknown[] }).vulnerabilities?.length ?? 0;
      return { content: [{ type: 'text' as const, text: `Recorded ${count} findings.` }], details: {} };
    },
  });
  return { tool, getCaptured: () => captured };
}
