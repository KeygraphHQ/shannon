// Copyright (C) 2025 Keygraph, Inc.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License version 3
// as published by the Free Software Foundation.

/**
 * TypeScript types for the structured report the Typst template consumes, in two
 * shapes keyed by a `mode` discriminator: `exploits` (exploit=true) and `findings`
 * (exploit=false, analysis-only). Types only — the object is built programmatically
 * in report-json-adapter.ts, so these exist to keep the adapter and report.typ in sync.
 */

// === Shared primitives ===

export type TypstSeverity = 'Critical' | 'High' | 'Medium' | 'Low';
// `Unstated` is the verdict of a record that carries no status of its own. It is a distinct value
// rather than a default onto another, so the document never presents an unrecorded verdict as one
// the run reached.
export type TypstStatus = 'Exploited' | 'OutOfScope' | 'BlockedByConstraints' | 'FalsePositive' | 'Unstated';
export type TypstConfidence = 'High' | 'Medium' | 'Low';
export type TypstCategory = 'Authentication' | 'Authorization' | 'XSS' | 'Injection' | 'SSRF' | 'Other';

export interface CodeBlock {
  readonly language: string;
  readonly content: string;
}

export type StepItem =
  | { readonly kind: 'prose'; readonly text: string }
  | { readonly kind: 'code'; readonly block: CodeBlock };

export interface Step {
  readonly number: number;
  readonly title?: string;
  readonly items: readonly StepItem[];
}

export interface AdditionalSection {
  readonly heading: string;
  readonly items: readonly StepItem[];
}

export interface FindingSummary {
  readonly vulnerableLocation: string;
  readonly overview: string;
  readonly impact: string;
}

/**
 * A queue entry the exploitation phase never returned a verdict for. Carried into the document so
 * a vulnerability that was never examined is never absent from the customer's copy.
 */
export interface UnassessedEntry {
  readonly id: string;
  readonly vulnerabilityType?: string;
}

export interface Meta {
  readonly target: string;
  readonly assessmentDate: string;
  readonly tester?: string;
  readonly application?: string;
  readonly classification: string;
}

export interface CategoryCount {
  readonly category: TypstCategory;
  readonly count: number;
  readonly note?: string;
}

export type SeverityCounts = Record<TypstSeverity, number>;
export type StatusCounts = Record<TypstStatus, number>;
export type ConfidenceCounts = Record<TypstConfidence, number>;

export interface TypeEntryBullet {
  readonly id: string;
  readonly description: string;
}

// === Exploits-mode schema ===

export interface ExploitFinding {
  readonly id: string;
  readonly title: string;
  readonly category: TypstCategory;
  readonly owaspCategory: string;
  readonly severity: TypstSeverity;
  readonly status: TypstStatus;
  // Present only for a finding no exploit confirmed, where it is the only rating the deliverable
  // carried. A confirmed exploit is settled by its evidence and needs none.
  readonly confidence?: TypstConfidence;
  readonly summary: FindingSummary;
  readonly prerequisites: string;
  readonly exploitationSteps: readonly Step[];
  readonly proofOfImpact: readonly StepItem[];
  readonly remediation: string;
  readonly notes?: readonly StepItem[];
  readonly additionalSections?: readonly AdditionalSection[];
}

export interface ExploitedByTypeEntry {
  readonly category: TypstCategory;
  readonly bullets?: readonly TypeEntryBullet[];
  readonly narrative?: string;
}

export interface ExploitsReportData {
  readonly mode: 'exploits';
  readonly meta: Meta;
  readonly scope: string;
  readonly executiveSummary: string;
  readonly notAssessed: readonly string[];
  readonly unassessedQueueEntries: readonly UnassessedEntry[];
  readonly exploitedByType: readonly ExploitedByTypeEntry[];
  readonly summary: {
    readonly totalIdentified: number;
    readonly successfullyExploited: number;
    readonly exploitedBreakdown: readonly CategoryCount[];
    readonly outOfScope?: {
      readonly total: number;
      readonly breakdown?: readonly CategoryCount[];
      readonly note?: string;
    };
    readonly blockedByConstraints?: {
      readonly total: number;
      readonly note?: string;
    };
    readonly criticalFindings: readonly string[];
  };
  readonly findings: readonly ExploitFinding[];
  readonly derivedCounts: {
    readonly bySeverity: SeverityCounts;
    readonly byStatus: StatusCounts;
  };
}

// === Findings-mode schema (analysis-only, exploit=false runs) ===

export interface AnalysisFinding {
  readonly id: string;
  readonly title: string;
  readonly category: TypstCategory;
  readonly owaspCategory: string;
  readonly severity: TypstSeverity;
  readonly confidence: TypstConfidence;
  readonly summary: FindingSummary;
  readonly remediation: string;
  readonly notes?: readonly StepItem[];
  readonly additionalSections?: readonly AdditionalSection[];
}

export interface IdentifiedByTypeEntry {
  readonly category: TypstCategory;
  readonly bullets?: readonly TypeEntryBullet[];
  readonly narrative?: string;
}

export interface FindingsReportData {
  readonly mode: 'findings';
  readonly meta: Meta;
  readonly scope: string;
  readonly executiveSummary: string;
  readonly notAssessed: readonly string[];
  readonly unassessedQueueEntries: readonly UnassessedEntry[];
  readonly identifiedByType: readonly IdentifiedByTypeEntry[];
  readonly summary: {
    readonly totalIdentified: number;
    readonly identifiedBreakdown: readonly CategoryCount[];
    readonly criticalFindings: readonly string[];
  };
  readonly findings: readonly AnalysisFinding[];
  readonly derivedCounts: {
    readonly bySeverity: SeverityCounts;
    readonly byConfidence: ConfidenceCounts;
  };
}

// === Discriminated union for downstream consumers that handle both ===

export type ReportData = ExploitsReportData | FindingsReportData;
