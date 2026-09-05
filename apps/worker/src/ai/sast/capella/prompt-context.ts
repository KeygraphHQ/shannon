// Copyright (C) 2026 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

import { stableJson } from './artifacts.js';
import type { CapellaFinding } from './finding-types.js';
import type { Investigation, KbResult } from './schemas.js';

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export interface CapellaToolContext {
  readonly [key: string]: string;
  readonly CAPELLA_EXTRA_TOOLS: string;
  readonly CAPELLA_RECORDING_ROUTE: string;
}

const STRUCTURED_OUTPUT: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: '',
  CAPELLA_RECORDING_ROUTE: 'by returning it as your structured output',
};

export const ARCHITECTURE_TOOLS = STRUCTURED_OUTPUT;
export const THREAT_MODEL_TOOLS = STRUCTURED_OUTPUT;
export const PLAN_TOOLS = STRUCTURED_OUTPUT;
export const TRIAGE_TOOLS = STRUCTURED_OUTPUT;
export const RESEARCH_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `report_finding`',
  CAPELLA_RECORDING_ROUTE: 'by calling `report_finding`',
};
export const DEDUPE_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `record_duplicates`',
  CAPELLA_RECORDING_ROUTE: 'by calling `record_duplicates`',
};
export const REVIEW_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `record_review_verdict`',
  CAPELLA_RECORDING_ROUTE: 'by calling `record_review_verdict`',
};
export const CRITIC_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `record_viability`',
  CAPELLA_RECORDING_ROUTE: 'by calling `record_viability`',
};
export const CONFIRM_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `record_static_confirmation`',
  CAPELLA_RECORDING_ROUTE: 'by calling `record_static_confirmation`',
};
export const CALIBRATE_TOOLS: CapellaToolContext = {
  CAPELLA_EXTRA_TOOLS: ', plus `record_calibration`',
  CAPELLA_RECORDING_ROUTE: 'by calling `record_calibration`',
};

/**
 * The context keys each prompt template requires. The loader refuses to render
 * a prompt whose caller omitted one, so a template edit that adds a placeholder
 * must extend this table or every render of that stage fails fast.
 */
export const CAPELLA_PROMPT_CONTEXT_KEYS = {
  'sast.capella.architecture': [
    'CAPELLA_EXTRA_TOOLS',
    'CAPELLA_RECORDING_ROUTE',
    'LANGUAGE_CONTEXT',
    'BOUNDARY_CONTEXT',
  ],
  'sast.capella.threat_model': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE', 'KB_DIR'],
  'sast.capella.plan': [
    'CAPELLA_EXTRA_TOOLS',
    'CAPELLA_RECORDING_ROUTE',
    'KB_DIR',
    'LANGUAGE_CONTEXT',
    'BOUNDARY_CONTEXT',
  ],
  'sast.capella.triage': [
    'CAPELLA_EXTRA_TOOLS',
    'CAPELLA_RECORDING_ROUTE',
    'LANGUAGE_CONTEXT',
    'BOUNDARY_CONTEXT',
    'TARGET_FILES',
  ],
  'sast.capella.research': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE', 'LANGUAGE_CONTEXT', 'BOUNDARY_CONTEXT'],
  'sast.capella.dedupe': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE'],
  'sast.capella.review': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE'],
  'sast.capella.critic': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE', 'KB_DIR'],
  'sast.capella.confirm': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE'],
  'sast.capella.calibrate': ['CAPELLA_EXTRA_TOOLS', 'CAPELLA_RECORDING_ROUTE', 'KB_DIR'],
} as const;

function sortedUnique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

/** Prompt-only steering. Tool enforcement remains authoritative for denied paths. */
export function buildCodePathScopeSnippet(focus: readonly string[], avoids: readonly string[]): string {
  const normalizedFocus = sortedUnique(focus);
  const normalizedAvoids = sortedUnique(avoids);
  if (normalizedFocus.length === 0 && normalizedAvoids.length === 0) return '';

  const lines = ['### Repository code-path scope'];
  if (normalizedFocus.length > 0) {
    lines.push(
      '',
      'Prioritize these configured paths while preserving end-to-end traces:',
      ...normalizedFocus.map((path) => `- ${path}`),
    );
  }
  if (normalizedAvoids.length > 0) {
    lines.push(
      '',
      'Do not inspect or report findings whose sink is under these excluded paths:',
      ...normalizedAvoids.map((path) => `- ${path}`),
    );
  }
  return lines.join('\n');
}

/** Embed the KB because repository-confined tools cannot read the sibling artifact root. */
export function buildKnowledgeBaseContext(knowledgeBase: KbResult): string {
  return [
    '## Shannon host-provided knowledge base',
    '',
    'The knowledge base is supplied as structured data below. Do not look for it in the repository.',
    '',
    '<capella_knowledge_base_json>',
    stableJson(knowledgeBase).trimEnd(),
    '</capella_knowledge_base_json>',
  ].join('\n');
}

/** Embed the immutable current finding set for verdict stages. */
export function buildFindingsContext(findings: readonly CapellaFinding[]): string {
  const ordered = [...findings].sort((left, right) => compareText(left.id, right.id));
  return [
    '## Shannon host-provided findings',
    '',
    'The complete current finding set is supplied below. Do not look for a `findings/` directory.',
    'Use repository tools only for the source paths cited by these records.',
    '',
    '<capella_findings_json>',
    stableJson(ordered).trimEnd(),
    '</capella_findings_json>',
  ].join('\n');
}

export function buildResearchAssignment(
  investigation: Investigation,
  flaggedFiles: readonly string[],
  knowledgeBase: KbResult,
): string {
  const referenced = new Set(investigation.kb_references ?? []);
  const kbEntries = [...knowledgeBase.entities, ...knowledgeBase.vulnerabilities]
    .filter((entry) => referenced.size === 0 || [...referenced].some((ref) => ref.includes(entry.name)))
    .sort((left, right) => compareText(left.name, right.name));
  return [
    '## Your assignment',
    '',
    `Question: ${investigation.question}`,
    '',
    'Flagged target files:',
    ...[...flaggedFiles].sort().map((file) => `- ${file}`),
    '',
    'The referenced KB entries are embedded below. Use this content directly; do not look for KB Markdown files in the repository.',
    '',
    '<capella_referenced_kb_json>',
    stableJson(kbEntries).trimEnd(),
    '</capella_referenced_kb_json>',
  ].join('\n');
}
