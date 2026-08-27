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
import { stringEnum } from '../collectors/schema.js';
import type { AgentName } from '../types/agents.js';
import type { VulnClass } from '../types/config.js';
import type { ReconciliationClass } from '../types/reconciliation.js';
import { isProducerId, REF_PREFIX } from './reconciliation/refs.js';
import type { CapturedSubmitTool } from './submit-tool.js';

const ANALYSIS_NOTES_DESCRIPTION = 'Plain context for defenders (caveats, scope, what is at risk). Not attack steps.';

function optStr(description?: string) {
  return Type.Optional(Type.String(description === undefined ? {} : { description }));
}

const analysisCodeLocationSchema = Type.Object({
  file: Type.String({ description: 'Repository-relative path, no leading slash.' }),
  start_line: Type.Optional(Type.Integer({ minimum: 1 })),
  end_line: Type.Optional(Type.Integer({ minimum: 1, description: 'Set when the flaw spans a range.' })),
  role: stringEnum(['sink', 'source', 'guard'], {
    description:
      'sink where the flaw manifests, source where untrusted input enters, guard for a check ' +
      'that is missing or misplaced.',
  }),
  symbol: Type.Optional(Type.String({ description: 'Enclosing function or method, named as written in the code.' })),
});

/**
 * Base fields shared by every queue entry. `notes` gains guidance in analysis mode.
 *
 * `confidence` is enumerated so it reaches the report agent in the same casing the report
 * schema accepts — an analysis-only run carries it through verbatim as its only rating.
 */
function baseFields(exploit: boolean) {
  return {
    ID: Type.String(),
    vulnerability_type: Type.String(),
    externally_exploitable: Type.Boolean(),
    confidence: stringEnum(['high', 'medium', 'low'], {
      description: 'Confidence that this is a real, reachable vulnerability.',
    }),
    code_locations: Type.Optional(
      Type.Array(analysisCodeLocationSchema, {
        description: 'Every code site this finding touches, sink first.',
      }),
    ),
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

const miscellaneousFields = {
  cwe: optStr(),
  source_endpoint: optStr(),
  vulnerable_code_location: optStr(),
  missing_defense: optStr(),
  observable_signal: optStr(),
  exploitation_hypothesis: optStr(),
  suggested_exploit_technique: optStr(),
  proof_criterion: optStr(),
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
const miscellaneousEntry = () => Type.Object({ ...baseFields(true), ...miscellaneousFields });

export type AnalysisCodeLocation = Static<typeof analysisCodeLocationSchema>;

/** Queue-specific name retained for the existing analysis-location report join. */
export type QueueCodeLocation = AnalysisCodeLocation;

export type InjectionFinding = Static<ReturnType<typeof injectionEntry>>;
export type XssFinding = Static<ReturnType<typeof xssEntry>>;
export type AuthFinding = Static<ReturnType<typeof authEntry>>;
export type SsrfFinding = Static<ReturnType<typeof ssrfEntry>>;
export type AuthzFinding = Static<ReturnType<typeof authzEntry>>;
export type MiscellaneousFinding = Static<ReturnType<typeof miscellaneousEntry>>;

// The exact field names each class's queue entry carries. Reconciliation reads this to know which
// keys a class produces, so it must list the same base and per-class fields the schemas above build.
export const QUEUE_ENTRY_FIELD_NAMES: Readonly<Record<ReconciliationClass, readonly string[]>> = Object.freeze({
  injection: [...Object.keys(baseFields(true)), ...Object.keys(injectionFields)],
  xss: [...Object.keys(baseFields(true)), ...Object.keys(xssFields)],
  auth: [...Object.keys(baseFields(true)), ...Object.keys(authFields)],
  authz: [...Object.keys(baseFields(true)), ...Object.keys(authzFields)],
  ssrf: [...Object.keys(baseFields(true)), ...Object.keys(ssrfFields)],
  miscellaneous: [...Object.keys(baseFields(true)), ...Object.keys(miscellaneousFields)],
});

const ENTRY_SCHEMAS: Readonly<Record<ReconciliationClass, TObject>> = Object.freeze({
  injection: injectionEntry(),
  xss: xssEntry(),
  auth: authEntry(),
  authz: authzEntry(),
  ssrf: ssrfEntry(),
  miscellaneous: miscellaneousEntry(),
});

/** The complete queue-entry schema for one internal class. */
export function classEntrySchema(vulnClass: ReconciliationClass): TObject {
  return ENTRY_SCHEMAS[vulnClass];
}

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

const VULN_AGENT_CLASSES: Partial<Record<AgentName, VulnClass>> = {
  'injection-vuln': 'injection',
  'xss-vuln': 'xss',
  'auth-vuln': 'auth',
  'authz-vuln': 'authz',
  'ssrf-vuln': 'ssrf',
};

function producerIdFormat(vulnClass: VulnClass): string {
  return `${REF_PREFIX[vulnClass]}-VULN-NN`;
}

function outOfNamespaceIds(vulnerabilities: readonly unknown[], vulnClass: VulnClass): string[] {
  const rejected: string[] = [];
  for (const entry of vulnerabilities) {
    if (entry === null || typeof entry !== 'object') continue;
    const id = (entry as { ID?: unknown }).ID;
    if (typeof id !== 'string' || !isProducerId(id, vulnClass, 'VULN')) {
      rejected.push(typeof id === 'string' ? id : String(id));
    }
  }
  return rejected;
}

const ID_PREVIEW_LIMIT = 6;

function previewIds(ids: readonly string[]): string {
  const shown = ids.slice(0, ID_PREVIEW_LIMIT).join(', ');
  const remainder = ids.length - ID_PREVIEW_LIMIT;
  return remainder > 0 ? `${shown} (+${remainder} more)` : shown;
}

// A rejected submission is returned as a retryable tool error rather than thrown: that hands the
// message back to the model to correct within the same session instead of failing the whole agent.
// `terminate` is deliberately left unset so the session survives to receive the corrected call.
function retryableRejection(message: string) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify({ status: 'error', errorType: 'ValidationError', retryable: true, message }, null, 2),
      },
    ],
    details: undefined,
  };
}

function idNamespaceRejection(vulnClass: VulnClass, rejected: readonly string[]) {
  const message =
    `Every entry ID must be ${producerIdFormat(vulnClass)} ` +
    `(for example ${REF_PREFIX[vulnClass]}-VULN-01). Outside that namespace: ${previewIds(rejected)}.`;
  return retryableRejection(message);
}

// Exact-string repeats, the same comparison reconciliation makes when it re-reads the committed
// queue. Each offending ID is named once, in the order it first repeats.
function repeatedProducerIds(vulnerabilities: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const repeated: string[] = [];
  for (const entry of vulnerabilities) {
    if (entry === null || typeof entry !== 'object') continue;
    const id = (entry as { ID?: unknown }).ID;
    if (typeof id !== 'string') continue;
    if (seen.has(id) && !repeated.includes(id)) repeated.push(id);
    seen.add(id);
  }
  return repeated;
}

function duplicateIdRejection(vulnClass: VulnClass, repeated: readonly string[]) {
  const message =
    `Each entry needs its own ${producerIdFormat(vulnClass)} ID; these appear more than once: ` +
    `${previewIds(repeated)}. Renumber the repeated entries — or drop the ones that describe the same ` +
    'vulnerability — and call submit_exploitation_queue again.';
  return retryableRejection(message);
}

/**
 * Build the TypeBox submit-tool parameters for a vuln agent, or undefined for non-vuln agents.
 *
 * The `ID` this schema requires (`INJ-VULN-01` and so on) is an internal producer token, meant
 * only to let reconciliation join a finding back to the agent and class that raised it. It is not
 * the identifier a downstream exploit agent should ever see; reconciliation is responsible for
 * translating it into the exploitation-task identity the published queue carries instead.
 */
function queueSchema(agentName: AgentName, exploit: boolean): TObject | undefined {
  const extra = PER_TYPE_FIELDS[agentName];
  const vulnClass = VULN_AGENT_CLASSES[agentName];
  if (!extra || !vulnClass) return undefined;
  const idField = Type.String({
    description:
      `Producer identifier formatted ${producerIdFormat(vulnClass)} ` +
      `(for example ${REF_PREFIX[vulnClass]}-VULN-01).`,
  });
  return Type.Object({
    vulnerabilities: Type.Array(Type.Object({ ...baseFields(exploit), ID: idField, ...extra })),
  });
}

/** Returns the queue filename for a vuln agent, or undefined for non-vuln agents. */
export function getQueueFilename(agentName: AgentName): string | undefined {
  return VULN_AGENT_QUEUE_FILENAMES[agentName];
}

/** Build the pi submit tool that captures the exploitation queue for vuln agents. */
export function createQueueSubmitTool(agentName: AgentName, exploit = true): CapturedSubmitTool | undefined {
  const schema = queueSchema(agentName, exploit);
  const vulnClass = VULN_AGENT_CLASSES[agentName];
  if (!schema || !vulnClass) return undefined;

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
        `Give every entry an ID in the ${producerIdFormat(vulnClass)} namespace.`,
      ],
      parameters: schema,
      async execute(_toolCallId, params) {
        const vulnerabilities = Array.isArray((params as { vulnerabilities?: unknown }).vulnerabilities)
          ? (params as { vulnerabilities: unknown[] }).vulnerabilities
          : [];
        // Every entry ID must sit in this class's producer namespace, and no two entries may share
        // one, so reconciliation refs stay unique both across classes and within this queue. Both
        // rules are the ones reconciliation applies to the committed queue; enforcing them here
        // turns a permanent post-commit failure into an in-session correction. Nothing is captured,
        // written, or committed until every ID passes.
        const rejected = outOfNamespaceIds(vulnerabilities, vulnClass);
        if (rejected.length > 0) {
          return idNamespaceRejection(vulnClass, rejected);
        }
        const repeated = repeatedProducerIds(vulnerabilities);
        if (repeated.length > 0) {
          return duplicateIdRejection(vulnClass, repeated);
        }
        captured = params;
        return {
          content: [{ type: 'text' as const, text: `Recorded ${vulnerabilities.length} findings.` }],
          details: params,
          terminate: true,
        };
      },
    }),
    getCaptured: () => captured,
    safeCount: () => {
      const vulnerabilities = (captured as { vulnerabilities?: unknown } | undefined)?.vulnerabilities;
      return Array.isArray(vulnerabilities) ? vulnerabilities.length : undefined;
    },
    directive:
      '\n\nYou MUST call the submit_exploitation_queue tool exactly once as your final action ' +
      'to deliver your structured exploitation queue. Do not output JSON as text. Fill every required parameter.',
  };
}
