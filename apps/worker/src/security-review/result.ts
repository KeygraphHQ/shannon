// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import { type ReviewFormat, type ReviewLimits, type ReviewResult, RULES, type RuleAnalysis } from './types.js';

const ERRORS: Record<string, string> = {
  invalid_format: 'Select a supported review format.',
  invalid_limits: 'Limit overrides must be positive integers no greater than the published ceilings.',
  unsafe_file: 'The input must be a regular local file without symbolic links, hard links, or alternate streams.',
  unsafe_directory: 'Input ancestors must be real local directories without links or aliases.',
  source_changed: 'The input identity or content metadata changed during the read.',
  read_failed: 'The input could not be read as a supported local file.',
  input_too_large: 'The input exceeds the byte limit.',
  invalid_encoding: 'The input is not valid UTF-8.',
  invalid_document: 'The input is not an unambiguous single JSON or supported YAML document.',
  unsupported_yaml_merge: 'YAML merge keys are unsupported; provide a single explicit configuration.',
  cyclic_alias: 'Cyclic YAML aliases are unsupported.',
  depth_limit: 'The input exceeds the nesting limit.',
  node_limit: 'The input exceeds the parsed-node limit.',
  reference_limit: 'The input exceeds the alias/reference expansion limit.',
  processing_timeout: 'The isolated review exceeded its processing deadline.',
  processing_failed: 'The isolated review could not complete.',
  result_limit: 'The review result exceeds the bounded output capacity.',
};

export function failedResult(format: ReviewFormat, file: string, limits: ReviewLimits, code: string): ReviewResult {
  const rules = RULES[format] ?? [];
  return {
    schemaVersion: 1,
    kind: 'offline-security-review',
    format,
    status: 'failed',
    source: { file },
    limits,
    scope: {
      basis: 'local-declarations',
      deployedState: 'not-assessed',
      rules: rules.map((ruleId) => ({ ruleId, state: 'unknown' })),
    },
    issues: [],
    diagnostics: [
      { code, pointer: '', ruleIds: rules, message: ERRORS[code] ?? 'The isolated review could not complete.' },
    ],
  };
}

export function analysisResult(
  format: ReviewFormat,
  file: string,
  limits: ReviewLimits,
  analysis: RuleAnalysis,
): ReviewResult {
  const diagnostics = [...analysis.diagnostics].sort((a, b) =>
    compare(`${a.code}\0${a.pointer}`, `${b.code}\0${b.pointer}`),
  );
  const result: ReviewResult = {
    schemaVersion: 1,
    kind: 'offline-security-review',
    format,
    status: diagnostics.length ? 'partial' : 'completed',
    source: { file },
    limits,
    scope: {
      basis: 'local-declarations',
      deployedState: 'not-assessed',
      rules: RULES[format].map((ruleId) => ({
        ruleId,
        state: diagnostics.some((d) => d.ruleIds.includes(ruleId)) ? 'partial' : 'assessed',
      })),
    },
    issues: [...analysis.issues]
      .sort((a, b) => compare(`${a.ruleId}\0${a.pointer}`, `${b.ruleId}\0${b.pointer}`))
      .map(({ pointer, ...issue }) => ({ ...issue, evidence: { file, pointer } })),
    diagnostics,
  };
  if (result.issues.length + diagnostics.length > 1_000 || Buffer.byteLength(JSON.stringify(result)) > 1_048_576)
    return failedResult(format, file, limits, 'result_limit');
  return result;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
