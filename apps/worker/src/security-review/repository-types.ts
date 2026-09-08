// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { ReviewFormat, ReviewResult } from './types.js';

export interface RepositoryLimits {
  readonly maxEntries: number;
  readonly maxFiles: number;
  readonly maxDepth: number;
  readonly maxBytes: number;
  readonly timeoutMs: number;
  readonly concurrency: number;
  readonly maxSnapshotBytes: number;
}
export const REPOSITORY_LIMITS: RepositoryLimits = Object.freeze({
  maxEntries: 10_000,
  maxFiles: 128,
  maxDepth: 24,
  maxBytes: 32 * 1024 * 1024,
  timeoutMs: 120_000,
  concurrency: 2,
  maxSnapshotBytes: 16 * 1024 * 1024,
});
export const CONVENTIONAL_NAMES = Object.freeze([
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
  'openapi.json',
  'openapi.yaml',
  'openapi.yml',
]);
export const EXCLUDED_DIRECTORIES = Object.freeze([
  '.agents',
  '.codex',
  '.git',
  '.pnpm-store',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'output',
  'workspaces',
]);
export interface FileSelector {
  readonly format: ReviewFormat;
  readonly path: string;
}
export interface RepositoryPolicy {
  readonly conventionalNames: readonly string[];
  readonly excludedDirectories: readonly string[];
  readonly includes: readonly FileSelector[];
  readonly excludes: readonly string[];
}
export interface RepositoryOptions {
  readonly include?: readonly FileSelector[];
  readonly exclude?: readonly string[];
  readonly limits?: Partial<RepositoryLimits>;
}
export interface RepositoryDiagnostic {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}
export interface SnapshotObservation {
  /** Opaque declaration identity, independent of list ordering and checkout root; null means ambiguous. */
  readonly identity: string | null;
  readonly issue: ReviewResult['issues'][number];
}
export interface RepositoryFileAnalysis {
  readonly result: ReviewResult;
  readonly sha256: string | null;
  readonly bytes: number | null;
  readonly observations: readonly SnapshotObservation[];
}
export interface SnapshotFile extends RepositoryFileAnalysis {
  readonly path: string;
  readonly format: ReviewFormat;
}
export interface RepositorySnapshot {
  readonly schemaVersion: 1;
  readonly kind: 'offline-repository-review';
  readonly id: string;
  readonly status: 'completed' | 'partial' | 'failed';
  readonly reviewer: { readonly name: 'local-openapi-compose'; readonly semanticsVersion: 1; readonly digest: string };
  readonly policy: RepositoryPolicy;
  readonly limits: RepositoryLimits;
  readonly discovery: {
    readonly state: 'complete' | 'incomplete';
    readonly entriesVisited: number;
    readonly selectedBytes: number;
    readonly ignoredFiles: number;
    readonly skipped: readonly { readonly path: string; readonly reason: string }[];
  };
  readonly files: readonly SnapshotFile[];
  readonly diagnostics: readonly RepositoryDiagnostic[];
}
export type ChangeState = 'new' | 'unchanged' | 'removed' | 'unknown';
export interface RepositoryChange {
  readonly state: ChangeState;
  readonly reason: string;
  readonly before: SnapshotObservation | null;
  readonly after: SnapshotObservation | null;
}
export interface RepositoryComparison {
  readonly schemaVersion: 1;
  readonly kind: 'offline-repository-comparison';
  readonly status: 'completed' | 'partial' | 'failed';
  readonly baselineId: string | null;
  readonly candidateId: string | null;
  readonly compatible: boolean;
  readonly counts: Readonly<Record<ChangeState, number>>;
  readonly changes: readonly RepositoryChange[];
  readonly diagnostics: readonly RepositoryDiagnostic[];
}
