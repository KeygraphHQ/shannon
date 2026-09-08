// Copyright (C) 2025 Keygraph, Inc.
// SPDX-License-Identifier: AGPL-3.0-only

import type { BundleCheck } from './bundle-types.js';

export interface CatalogSummary {
  readonly outcome: 'running' | 'complete' | 'incomplete' | 'failed';
  readonly findings: number;
  readonly trafficRecords: number;
  readonly unresolvedHypotheses: number;
  readonly pendingTasks: number;
  readonly blockedVerifications: number;
  readonly provenance: 'available' | 'unavailable';
  readonly historyComplete: boolean | null;
  readonly resultRecorded: boolean;
  readonly attempts: number;
}

export interface CatalogInspection {
  readonly check: BundleCheck;
  /** Exact artifact-content grouping only; excludes the manifest and never establishes authenticity. */
  readonly contentId: string | null;
  readonly summary: CatalogSummary | null;
}

export interface CatalogEntry extends CatalogInspection {
  readonly id: string;
  /** Relative source folder. This is intentionally private local metadata. */
  readonly folder: string;
  readonly duplicateGroup: string | null;
}

export interface ReportCatalog {
  readonly schemaVersion: 1;
  readonly kind: 'private-report-catalog';
  readonly root: string;
  readonly generatedAt: string;
  /** Completeness refers only to the bounded directory inventory, never assessment coverage. */
  readonly complete: boolean;
  readonly limits: {
    readonly maxDepth: number;
    readonly maxDirectories: number;
    readonly maxBundles: number;
    readonly maxEntries: number;
  };
  readonly directoriesVisited: number;
  readonly entries: readonly CatalogEntry[];
  readonly traversalIssues: readonly { readonly code: string; readonly folder: string }[];
  readonly totals: {
    readonly bundles: number;
    readonly valid: number;
    readonly invalid: number;
    readonly integrityMatched: number;
    readonly integrityUnavailable: number;
    readonly integrityFailed: number;
    readonly duplicateGroups: number;
    readonly duplicateCopies: number;
    readonly provenanceAvailable: number;
    readonly provenanceUnavailable: number;
    readonly provenanceUnknown: number;
  };
}
