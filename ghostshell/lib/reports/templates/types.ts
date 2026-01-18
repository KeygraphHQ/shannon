/**
 * Types for report templates.
 */

import type { Scan, Finding, Project, Organization, ScanResult } from '@prisma/client';

/**
 * Data passed to report templates for rendering.
 */
export interface ReportData {
  // Organization context
  organization: Pick<Organization, 'id' | 'name' | 'logoUrl'>;

  // Project info
  project: Pick<Project, 'id' | 'name' | 'targetUrl' | 'description'>;

  // Scan details
  scan: Pick<Scan, 'id' | 'status' | 'startedAt' | 'completedAt' | 'durationMs'> & {
    result?: Pick<ScanResult, 'executiveSummary' | 'riskScore'> | null;
  };

  // Findings
  findings: Array<
    Pick<
      Finding,
      'id' | 'title' | 'description' | 'severity' | 'category' | 'status' | 'cvss' | 'cwe' | 'remediation' | 'evidence'
    >
  >;

  // Summary counts
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    riskScore: number;
  };

  // Report metadata
  metadata: {
    reportId: string;
    title: string;
    type: 'EXECUTIVE' | 'TECHNICAL' | 'COMPLIANCE' | 'CUSTOM';
    generatedAt: Date;
    generatedBy: string;
    frameworkIds?: string[];
  };

  // Optional branding from custom template
  branding?: {
    logoUrl?: string;
    primaryColor?: string;
    secondaryColor?: string;
    headerText?: string;
    footerText?: string;
    disclaimer?: string;
  };
}

/**
 * Severity colors for consistent styling.
 */
export const SEVERITY_COLORS = {
  critical: '#DC2626', // red-600
  high: '#EA580C', // orange-600
  medium: '#CA8A04', // yellow-600
  low: '#2563EB', // blue-600
  info: '#6B7280', // gray-500
} as const;

/**
 * Report section IDs for customization.
 */
export const REPORT_SECTIONS = {
  EXECUTIVE_SUMMARY: 'executive_summary',
  RISK_SCORE: 'risk_score',
  FINDINGS_OVERVIEW: 'findings_overview',
  FINDINGS_DETAIL: 'findings_detail',
  COMPLIANCE_MAPPING: 'compliance_mapping',
  REMEDIATION_PLAN: 'remediation_plan',
  METHODOLOGY: 'methodology',
  APPENDIX: 'appendix',
} as const;

export type ReportSection = (typeof REPORT_SECTIONS)[keyof typeof REPORT_SECTIONS];
