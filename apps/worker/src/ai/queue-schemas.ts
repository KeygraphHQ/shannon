// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * TypeBox schemas + submit-tool factory for vulnerability exploitation queues.
 *
 * pi captures each vuln agent's structured queue via a `submit_exploitation_queue`
 * custom tool whose parameters mirror the per-class schema below. Entry types are
 * derived from the same schemas and consumed by the findings renderer.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { type Static, type TObject, Type } from 'typebox';
import type { AgentName } from '../types/agents.js';
import type { CapturedSubmitTool } from './submit-tool.js';

const ANALYSIS_NOTES_DESCRIPTION = 'Plain context for defenders (caveats, scope, what is at risk). Not attack steps.';

function optStr(description?: string) {
  return Type.Optional(Type.String(description === undefined ? {} : { description }));
}

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

// === Per-entry schemas (single vulnerability). Entry types derive from these. ===

const injectionEntry = () => Type.Object({ ...baseFields(true), ...injectionFields });
const xssEntry = () => Type.Object({ ...baseFields(true), ...xssFields });
const authEntry = () => Type.Object({ ...baseFields(true), ...authFields });
const ssrfEntry = () => Type.Object({ ...baseFields(true), ...ssrfFields });
const authzEntry = () => Type.Object({ ...baseFields(true), ...authzFields });

export type InjectionFinding = Static<ReturnType<typeof injectionEntry>>;
export type XssFinding = Static<ReturnType<typeof xssEntry>>;
export type AuthFinding = Static<ReturnType<typeof authEntry>>;
export type SsrfFinding = Static<ReturnType<typeof ssrfEntry>>;
export type AuthzFinding = Static<ReturnType<typeof authzEntry>>;

const PER_TYPE_FIELDS: Partial<Record<AgentName, Record<string, ReturnType<typeof optStr>>>> = {
  'injection-vuln': injectionFields,
  'xss-vuln': xssFields,
  'auth-vuln': authFields,
  'ssrf-vuln': ssrfFields,
  'authz-vuln': authzFields,
};

const VULN_AGENT_QUEUE_FILENAMES: Partial<Record<AgentName, string>> = {
  'injection-vuln': 'injection_exploitation_queue.json',
  'xss-vuln': 'xss_exploitation_queue.json',
  'auth-vuln': 'auth_exploitation_queue.json',
  'ssrf-vuln': 'ssrf_exploitation_queue.json',
  'authz-vuln': 'authz_exploitation_queue.json',
};

/** Build the TypeBox submit-tool parameters for a vuln agent, or undefined for non-vuln agents. */
function queueSchema(agentName: AgentName, exploit: boolean): TObject | undefined {
  const extra = PER_TYPE_FIELDS[agentName];
  if (!extra) return undefined;
  return Type.Object({
    vulnerabilities: Type.Array(Type.Object({ ...baseFields(exploit), ...extra })),
  });
}

/** Returns the queue filename for a vuln agent, or undefined for non-vuln agents. */
export function getQueueFilename(agentName: AgentName): string | undefined {
  return VULN_AGENT_QUEUE_FILENAMES[agentName];
}

/** Build the pi submit tool that captures the exploitation queue for vuln agents. */
export function createQueueSubmitTool(agentName: AgentName, exploit = true): CapturedSubmitTool | undefined {
  const schema = queueSchema(agentName, exploit);
  if (!schema) return undefined;

  let captured: unknown | undefined;
  return {
    tool: defineTool({
      name: 'submit_exploitation_queue',
      label: 'Submit Exploitation Queue',
      description:
        'Submit the final structured list of analyzed vulnerabilities for this class. Call exactly once when analysis is complete.',
      promptSnippet: 'submit_exploitation_queue: record the final structured findings list (call once)',
      promptGuidelines: [
        'You MUST call submit_exploitation_queue exactly once as your final action.',
        'Include every analyzed finding in the vulnerabilities array.',
      ],
      parameters: schema,
      async execute(_toolCallId, params) {
        captured = params;
        const count = Array.isArray((params as { vulnerabilities?: unknown }).vulnerabilities)
          ? (params as { vulnerabilities: unknown[] }).vulnerabilities.length
          : 0;
        return {
          content: [{ type: 'text' as const, text: `Recorded ${count} findings.` }],
          details: params,
          terminate: true,
        };
      },
    }),
    getCaptured: () => captured,
    directive:
      '\n\nYou MUST call the submit_exploitation_queue tool exactly once as your final action ' +
      'to deliver your structured exploitation queue. Do not output JSON as text. Fill every required parameter.',
  };
}
