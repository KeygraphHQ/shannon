// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

export type ReviewFormat = 'openapi' | 'compose';
export const RULES = {
  openapi: ['openapi/undeclared-security-scheme', 'openapi/undeclared-oauth-scope'],
  compose: [
    'compose/privileged',
    'compose/host-namespace',
    'compose/unconfined-profile',
    'compose/expanded-capabilities',
  ],
} as const;
export type RuleId = (typeof RULES)[ReviewFormat][number];

export interface ReviewLimits {
  readonly maxBytes: number;
  readonly maxDepth: number;
  readonly maxNodes: number;
  readonly maxReferences: number;
  readonly timeoutMs: number;
}
export const DEFAULT_LIMITS: ReviewLimits = Object.freeze({
  maxBytes: 4 * 1024 * 1024,
  maxDepth: 64,
  maxNodes: 100_000,
  maxReferences: 1_000,
  timeoutMs: 30_000,
});

/** No source values in prose. Pointers are private metadata, escaped using RFC 6901. */
export interface StaticIssue {
  readonly ruleId: RuleId;
  readonly classification: 'contract-consistency' | 'configuration-risk';
  readonly applicability: 'declared';
  readonly pointer: string;
  readonly message: string;
  readonly remediation: string;
}
export interface ReviewDiagnostic {
  readonly code: string;
  readonly pointer: string;
  readonly ruleIds: readonly RuleId[];
  readonly message: string;
}
export interface RuleAnalysis {
  readonly issues: readonly StaticIssue[];
  readonly diagnostics: readonly ReviewDiagnostic[];
}
export interface ReviewResult {
  readonly schemaVersion: 1;
  readonly kind: 'offline-security-review';
  readonly format: ReviewFormat;
  readonly status: 'completed' | 'partial' | 'failed';
  readonly source: { readonly file: string };
  readonly limits: ReviewLimits;
  readonly scope: {
    readonly basis: 'local-declarations';
    readonly deployedState: 'not-assessed';
    readonly rules: readonly { readonly ruleId: RuleId; readonly state: 'assessed' | 'partial' | 'unknown' }[];
  };
  readonly issues: readonly (Omit<StaticIssue, 'pointer'> & {
    readonly evidence: { readonly file: string; readonly pointer: string };
  })[];
  readonly diagnostics: readonly ReviewDiagnostic[];
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function at(pointer: string, token: string | number): string {
  return `${pointer}/${String(token).replace(/~/g, '~0').replace(/\//g, '~1')}`;
}
