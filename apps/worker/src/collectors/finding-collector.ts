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
 */

import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { type Static, Type } from 'typebox';
import { cleanInput, stringEnum } from './schema.js';

// ============================================================================
// SCHEMA
// ============================================================================

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

export const AddFindingInputSchema = Type.Object({
  // === Identity ===
  finding_id: Type.String({
    minLength: 1,
    description: 'Finding identifier (e.g., "AUTH-VULN-07", "INJ-VULN-03"). Must be unique per report.',
  }),
  title: Type.String({
    minLength: 1,
    description: 'Descriptive name (e.g., "SQL Injection — User Search", "IDOR — Unauthorized Access to User Orders").',
  }),
  category: Type.String({
    minLength: 1,
    description: 'Vulnerability category (e.g., "Authentication", "Injection", "XSS", "Authorization", "SSRF").',
  }),
  severity: stringEnum(SEVERITY_VALUES, { description: 'Finding severity.' }),
  owasp_category: Type.String({
    minLength: 1,
    description: 'OWASP Top 10 (2025) label (e.g., "A05:2025 — Injection").',
  }),

  // === Location & Context ===
  vulnerable_location: Type.String({
    minLength: 1,
    description: 'Endpoint or code location where the vulnerability exists.',
  }),
  overview: Type.String({
    minLength: 1,
    description: 'What the vulnerability is and why it matters. 2-3 sentences of professional prose.',
  }),
  impact: Type.String({
    minLength: 1,
    description: 'Demonstrated or assessed impact of the vulnerability.',
  }),
  auth_state: Type.String({
    minLength: 1,
    description: 'Authentication state during testing (e.g., "Unauthenticated", "Any authenticated user").',
  }),
  prerequisites: Type.String({
    minLength: 1,
    description: 'What is needed to exploit the vulnerability (or "None").',
  }),
  remediation: Type.String({
    minLength: 1,
    description: 'Specific, actionable fix guidance. Code-level or configuration-level.',
  }),

  // === Structured Content ===
  exploitation_steps: Type.Array(StructuredStepSchema, {
    minItems: 1,
    description: 'Ordered exploitation or analysis steps. Each step has an optional title and prose/code items.',
  }),
  proof_of_impact: Type.Array(StepItemSchema, {
    minItems: 1,
    description: 'Evidence of what the exploit achieved — prose and code items.',
  }),

  // === Optional ===
  status: Type.Optional(
    Type.Union([stringEnum(STATUS_VALUES), Type.Null()], {
      description: 'Finding status. Set when exploitation phase ran; omit for analysis-only runs.',
    }),
  ),
  confidence: Type.Optional(
    Type.Union([stringEnum(CONFIDENCE_VALUES), Type.Null()], {
      description: 'Confidence level for analysis-only findings. Set when exploitation phase did not run.',
    }),
  ),
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
});

export type AddFindingInput = Static<typeof AddFindingInputSchema>;

// Re-export schema types for downstream consumers
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

export function createFindingCollector(): FindingCollector {
  const findings: AddFindingInput[] = [];

  const addFindingTool = defineTool({
    name: 'add_finding',
    label: 'Add Finding',
    description:
      'Record a single finding as structured data for report rendering and DB persistence. Call once per finding after grouping/dedup. Duplicate finding_ids are rejected.',
    parameters: AddFindingInputSchema,
    async execute(_toolCallId, input) {
      const existing = findings.find((f) => f.finding_id === input.finding_id);
      if (existing) {
        return errorResult(
          `Finding ${input.finding_id} has already been recorded. Each finding may only be added once.`,
          'DuplicateError',
          false,
        );
      }
      const typed = cleanInput(AddFindingInputSchema, input);
      findings.push(typed);
      return successResult({ added: [typed.finding_id] });
    },
  });

  return {
    tools: [addFindingTool],
    getAll: (): AddFindingInput[] => [...findings],
  };
}
