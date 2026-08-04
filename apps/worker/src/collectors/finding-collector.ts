// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Finding Collector tools
 *
 * Collects structured findings from the report agent via a pi tool. The agent
 * calls `add_finding` once per finding with TypeBox-validated parameters. After
 * the agent finishes, the caller retrieves collected findings via `getAll()`
 * for downstream rendering (markdown, PDF, DB).
 *
 * The tool schema is mode-dependent: fields describing a demonstrated attack have no source in
 * an analysis-only run, and offering them would only make the agent invent them.
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { cleanInput, stringEnum } from './schema.js';

// ============================================================================
// SCHEMA
// ============================================================================

const OWASP_CATEGORY_VALUES = [
  'A01:2025 — Broken Access Control',
  'A02:2025 — Security Misconfiguration',
  'A03:2025 — Software Supply Chain Failures',
  'A04:2025 — Cryptographic Failures',
  'A05:2025 — Injection',
  'A06:2025 — Insecure Design',
  'A07:2025 — Authentication Failures',
  'A08:2025 — Software or Data Integrity Failures',
  'A09:2025 — Security Logging and Alerting Failures',
  'A10:2025 — Mishandling of Exceptional Conditions',
] as const;

const SEVERITY_VALUES = ['critical', 'high', 'medium', 'low', 'informational'] as const;
const STATUS_VALUES = ['exploited', 'out_of_scope', 'blocked_by_constraints', 'false_positive'] as const;
const CONFIDENCE_VALUES = ['high', 'medium', 'low'] as const;

const StepItemSchema = Type.Union([
  Type.Object({
    kind: Type.Literal('prose'),
    text: Type.String({ minLength: 1, description: 'Narrative prose for this item.' }),
  }),
  Type.Object({
    kind: Type.Literal('code'),
    block: Type.Object({
      language: Type.String({
        description: 'Language identifier for syntax highlighting (e.g., "bash", "http", "json").',
      }),
      content: Type.String({ minLength: 1, description: 'The code content.' }),
    }),
  }),
]);

const StructuredStepSchema = Type.Object({
  title: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'Optional title for this step (e.g., "Send malicious payload").',
    }),
  ),
  items: Type.Array(StepItemSchema, {
    minItems: 1,
    description: 'Ordered list of prose and code items that make up this step.',
  }),
});

const CodeLocationSchema = Type.Object({
  file: Type.String({
    minLength: 1,
    description: 'Repository-relative path, no leading slash (e.g., "routes/search.ts").',
  }),
  start_line: Type.Optional(
    Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], {
      description: '1-indexed line number. Omit when the deliverable gives only a file.',
    }),
  ),
  end_line: Type.Optional(
    Type.Union([Type.Integer({ minimum: 1 }), Type.Null()], {
      description: 'End of the range, when the finding spans multiple lines.',
    }),
  ),
  role: stringEnum(['sink', 'source', 'guard'], {
    description:
      'What this location is in the data flow. `sink` is where the vulnerability manifests, `source` ' +
      'where untrusted input enters, `guard` a check that is missing or misplaced.',
  }),
  symbol: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'Enclosing function or method name, when known.',
    }),
  ),
});

const HttpLocationSchema = Type.Object({
  method: Type.String({ minLength: 1, description: 'HTTP method (e.g., "GET", "POST").' }),
  url: Type.String({ minLength: 1, description: 'Full URL of the affected endpoint.' }),
  parameter: Type.Optional(
    Type.Union([Type.String(), Type.Null()], {
      description: 'The specific parameter carrying the payload, when the finding names one.',
    }),
  ),
});

const AdditionalSectionSchema = Type.Object({
  heading: Type.String({
    minLength: 1,
    description: 'Section heading (e.g., "Real-World Attack Scenario").',
  }),
  items: Type.Array(StepItemSchema, {
    minItems: 1,
    description: 'Ordered prose and code items for this section.',
  }),
});

/**
 * `severity` is recorded in both modes, but it does not mean the same thing in each: an exploit
 * run measures it from what the exploit demonstrated, an analysis run assesses it from the class
 * of flaw. The description says which, so the agent never presents an assessment as a measurement.
 */
function identityFields(exploit: boolean) {
  const severityDescription = exploit
    ? 'Severity of the finding, based on the impact the exploit demonstrated.'
    : 'Severity of the finding, assessed from the vulnerability class and the impact it would have.';

  return {
    severity: stringEnum(SEVERITY_VALUES, { description: severityDescription }),
    finding_id: Type.String({
      minLength: 1,
      description: 'Finding identifier (e.g., "AUTH-VULN-07", "INJ-VULN-03"). Must be unique per report.',
    }),
    title: Type.String({
      minLength: 1,
      description:
        'Descriptive name (e.g., "SQL Injection — User Search", "IDOR — Unauthorized Access to User Orders").',
    }),
    category: stringEnum(['Injection', 'XSS', 'Authentication', 'Authorization', 'SSRF'], {
      description:
        'From the finding_id prefix: INJ-VULN-xxx Injection, ' +
        'XSS-VULN-xxx XSS, AUTH-VULN-xxx Authentication, AUTHZ-VULN-xxx Authorization, ' +
        'SSRF-VULN-xxx SSRF.',
    }),
    owasp_category: stringEnum(OWASP_CATEGORY_VALUES, {
      description: 'OWASP Top Ten 2025 category.',
    }),
  };
}

function locationFields() {
  return {
    vulnerable_location: Type.String({
      minLength: 1,
      description: 'Endpoint or code location where the vulnerability exists.',
    }),
    http_location: Type.Optional(
      Type.Union([HttpLocationSchema, Type.Null()], {
        description:
          'The HTTP request the finding is reached through, when the deliverable names one. Omit for ' +
          'findings with no network entry point.',
      }),
    ),
  };
}

/** `impact` is described per mode: an analysis run demonstrated nothing, and implying otherwise invites fabrication. */
function narrativeFields(exploit: boolean) {
  const impactDescription = exploit
    ? 'What the exploit demonstrably achieved.'
    : 'What an attacker could achieve if this were exploited. State it as assessed, not demonstrated.';

  return {
    overview: Type.String({
      minLength: 1,
      description: 'What the vulnerability is and why it matters. 2-3 sentences of professional prose.',
    }),
    impact: Type.String({ minLength: 1, description: impactDescription }),
    remediation: Type.String({
      minLength: 1,
      description: 'Specific, actionable fix guidance. Code-level or configuration-level.',
    }),
  };
}

/** Fields that only mean something once an exploit has run. Absent from the analysis schema. */
function exploitOnlyFields() {
  return {
    auth_state: Type.String({
      minLength: 1,
      description: 'Authentication state during testing (e.g., "Unauthenticated", "Any authenticated user").',
    }),
    prerequisites: Type.String({
      minLength: 1,
      description: 'What is needed to exploit the vulnerability (or "None").',
    }),
    exploitation_steps: Type.Array(StructuredStepSchema, {
      minItems: 1,
      description: 'Ordered exploitation steps. Each step has an optional title and prose/code items.',
    }),
    proof_of_impact: Type.Array(StepItemSchema, {
      minItems: 1,
      description: 'Evidence of what the exploit achieved — prose and code items.',
    }),
    status: Type.Optional(
      Type.Union([stringEnum(STATUS_VALUES), Type.Null()], {
        description: 'Finding status. Use "exploited" for confirmed exploits.',
      }),
    ),
  };
}

/** Accompanies `severity` when nothing was exploited — the rating the analysis deliverable itself carries. */
function analysisOnlyFields() {
  return {
    confidence: stringEnum(CONFIDENCE_VALUES, {
      description:
        'Confidence that this is a real, reachable vulnerability. Carry it over from the analysis ' +
        'deliverable rather than reassessing.',
    }),
  };
}

function sharedOptionalFields() {
  return {
    notes: Type.Optional(
      Type.Union([Type.Array(StepItemSchema), Type.Null()], {
        description: 'Additional context as prose/code items.',
      }),
    ),
    additional_sections: Type.Optional(
      Type.Union([Type.Array(AdditionalSectionSchema), Type.Null()], {
        description: 'Extra report sections that do not fit into other fields (e.g., "Real-World Attack Scenario").',
      }),
    ),
  };
}

export function buildAddFindingSchema(exploit: boolean) {
  return Type.Object({
    ...identityFields(exploit),
    ...(exploit ? exploitOnlyFields() : analysisOnlyFields()),
    ...locationFields(),
    ...narrativeFields(exploit),
    ...sharedOptionalFields(),
  });
}

/**
 * Superset of both modes, for typing only. Consumers must check presence rather than assume:
 * `report.json` from an analysis run has no `exploitation_steps` key at all. `severity` is the
 * exception — both modes record it, so it is required here too.
 */
const AddFindingSupersetSchema = Type.Object({
  ...identityFields(true),
  code_locations: Type.Optional(Type.Array(CodeLocationSchema)),
  auth_state: Type.Optional(Type.String()),
  prerequisites: Type.Optional(Type.String()),
  exploitation_steps: Type.Optional(Type.Array(StructuredStepSchema)),
  proof_of_impact: Type.Optional(Type.Array(StepItemSchema)),
  status: Type.Optional(Type.Union([stringEnum(STATUS_VALUES), Type.Null()])),
  confidence: Type.Optional(Type.Union([stringEnum(CONFIDENCE_VALUES), Type.Null()])),
  ...locationFields(),
  ...narrativeFields(true),
  ...sharedOptionalFields(),
});

export type AddFindingInput = Static<typeof AddFindingSupersetSchema>;

// Re-export schema types for downstream consumers
export type CodeLocation = Static<typeof CodeLocationSchema>;
export type HttpLocation = Static<typeof HttpLocationSchema>;
export type StepItem = Static<typeof StepItemSchema>;
export type StructuredStep = Static<typeof StructuredStepSchema>;
export type AdditionalSection = Static<typeof AdditionalSectionSchema>;

// ============================================================================
// RESPONSE HELPERS
// ============================================================================

function toolResult(payload: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }],
    details: undefined,
  };
}

function successResult(data: Record<string, unknown>) {
  return toolResult({ status: 'success', ...data });
}

function errorResult(message: string, errorType = 'ValidationError', retryable = true) {
  return toolResult({ status: 'error', message, errorType, retryable });
}

// ============================================================================
// COLLECTOR FACTORY
// ============================================================================

export interface FindingCollector {
  tools: ToolDefinition[];
  getAll(): AddFindingInput[];
}

export function createFindingCollector(exploit: boolean): FindingCollector {
  const findings: AddFindingInput[] = [];
  const schema = buildAddFindingSchema(exploit);

  const addFindingTool = defineTool({
    name: 'add_finding',
    label: 'Add Finding',
    description:
      'Record a single finding as structured data for report rendering and DB persistence. Call once per finding after grouping/dedup. Duplicate finding_ids are rejected.',
    parameters: schema,
    async execute(_toolCallId, input) {
      const existing = findings.find((f) => f.finding_id === input.finding_id);
      if (existing) {
        return errorResult(
          `Finding ${input.finding_id} has already been recorded. Each finding may only be added once.`,
          'DuplicateError',
          false,
        );
      }
      const typed = cleanInput(schema, input) as AddFindingInput;
      findings.push(typed);
      return successResult({ added: [typed.finding_id] });
    },
  });

  return {
    tools: [addFindingTool],
    getAll: (): AddFindingInput[] => [...findings],
  };
}
