// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * Structured-output schemas for the Capella stages that return a document rather
 * than mutate a finding through a collector tool.
 *
 * Architecture, threat-model, plan and the triage wave each produce one document
 * describing their whole phase, so a schema is the right shape; the harness
 * writes the file from the returned object. Everything a *finding* passes through
 * goes via a collector tool instead (validation there happens while the agent can
 * still fix it, which a schema violation at the end of a run cannot).
 */

// === Architecture (Knowledge Base) ===

export interface KbEntity {
  /** Filename stem under `kb/entities/` or `kb/vulnerabilities/`, e.g. `auth_module` or `CWE-89`. */
  name: string;
  content: string;
}

export interface KbResult {
  architecture: string;
  entities: KbEntity[];
  vulnerabilities: KbEntity[];
  index: string;
  dependencies: Record<string, string[]>;
}

const KB_ENTITY = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Filename stem, e.g. "auth_module" or "CWE-89" (no extension, no path)' },
    content: { type: 'string', description: 'The Markdown body of the file' },
  },
  required: ['name', 'content'],
  additionalProperties: false,
} as const;

export const ARCHITECTURE_SCHEMA = {
  type: 'object',
  properties: {
    architecture: {
      type: 'string',
      description: 'The architecture.md body: data flows, zones, availability requirements',
    },
    entities: { type: 'array', items: KB_ENTITY, description: 'One entry per component (kb/entities/<name>.md)' },
    vulnerabilities: {
      type: 'array',
      items: KB_ENTITY,
      description: 'One entry per bug class (kb/vulnerabilities/<name>.md)',
    },
    index: { type: 'string', description: 'The index.md body: a catalog linking every entity and vulnerability file' },
    dependencies: {
      type: 'object',
      description: 'Import/dependency edges: keys are source files, values are the files that import them. {} if none.',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
  },
  required: ['architecture', 'entities', 'vulnerabilities', 'index', 'dependencies'],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;

// === Threat Model ===

export interface ThreatModelResult {
  threatModel: string;
  intent: 'PRODUCTION' | 'SAMPLE_OR_TEST_ONLY';
}

export const THREAT_MODEL_SCHEMA = {
  type: 'object',
  properties: {
    threatModel: { type: 'string', description: 'The full THREAT_MODEL.md body, including the Deployment Intent line' },
    intent: {
      type: 'string',
      enum: ['PRODUCTION', 'SAMPLE_OR_TEST_ONLY'],
      description: 'The deployment-intent verdict — exactly one of these two values',
    },
  },
  required: ['threatModel', 'intent'],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;

// === Plan ===

export interface Investigation {
  title: string;
  target_files: string[];
  kb_references: string[];
  question: string;
}

export interface PlanResult {
  investigations: Investigation[];
}

export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    investigations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          target_files: { type: 'array', items: { type: 'string' }, description: 'Repository-relative files to audit' },
          kb_references: {
            type: 'array',
            items: { type: 'string' },
            description: 'KB files providing context, e.g. entities/auth.md',
          },
          question: { type: 'string', description: 'The reviewing prompt for the researcher' },
        },
        required: ['title', 'target_files', 'kb_references', 'question'],
        additionalProperties: false,
      },
    },
  },
  required: ['investigations'],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;

// === Triage (research wave 1) ===

export interface TriageClassification {
  file: string;
  potentially_flawed: boolean;
  reason: string;
}

export interface TriageResult {
  classifications: TriageClassification[];
}

export const TRIAGE_SCHEMA = {
  type: 'object',
  properties: {
    classifications: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          potentially_flawed: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['file', 'potentially_flawed', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['classifications'],
  additionalProperties: false,
} as const satisfies Record<string, unknown>;
