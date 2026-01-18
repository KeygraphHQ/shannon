/**
 * JSON exporter for reports.
 * Exports structured JSON for programmatic consumption.
 */

import type { ReportData } from '../templates/types';

/**
 * JSON export format for reports.
 */
export interface ReportJsonExport {
  version: string;
  exportedAt: string;
  report: {
    id: string;
    title: string;
    type: string;
    generatedAt: string;
    generatedBy: string;
  };
  organization: {
    id: string;
    name: string;
  };
  project: {
    id: string;
    name: string;
    targetUrl: string;
    description: string | null;
  };
  scan: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
    executiveSummary: string | null;
  };
  summary: {
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    mediumFindings: number;
    lowFindings: number;
    infoFindings: number;
    riskScore: number;
  };
  findings: Array<{
    id: string;
    title: string;
    description: string;
    severity: string;
    category: string;
    status: string;
    cvss: number | null;
    cwe: string | null;
    remediation: string | null;
    evidence: unknown;
  }>;
  complianceFrameworks?: string[];
}

/**
 * Render report data to JSON format.
 */
export function renderToJson(data: ReportData): ReportJsonExport {
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    report: {
      id: data.metadata.reportId,
      title: data.metadata.title,
      type: data.metadata.type,
      generatedAt: data.metadata.generatedAt.toISOString(),
      generatedBy: data.metadata.generatedBy,
    },
    organization: {
      id: data.organization.id,
      name: data.organization.name,
    },
    project: {
      id: data.project.id,
      name: data.project.name,
      targetUrl: data.project.targetUrl,
      description: data.project.description || null,
    },
    scan: {
      id: data.scan.id,
      status: data.scan.status,
      startedAt: data.scan.startedAt?.toISOString() || null,
      completedAt: data.scan.completedAt?.toISOString() || null,
      durationMs: data.scan.durationMs || null,
      executiveSummary: data.scan.result?.executiveSummary || null,
    },
    summary: {
      totalFindings: data.summary.total,
      criticalFindings: data.summary.critical,
      highFindings: data.summary.high,
      mediumFindings: data.summary.medium,
      lowFindings: data.summary.low,
      infoFindings: data.summary.info,
      riskScore: data.summary.riskScore,
    },
    findings: data.findings.map((finding) => ({
      id: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      category: finding.category,
      status: finding.status,
      cvss: finding.cvss || null,
      cwe: finding.cwe || null,
      remediation: finding.remediation || null,
      evidence: finding.evidence,
    })),
    complianceFrameworks: data.metadata.frameworkIds,
  };
}

/**
 * Render to JSON string with pretty formatting.
 */
export function renderToJsonString(data: ReportData): string {
  return JSON.stringify(renderToJson(data), null, 2);
}

/**
 * Get content type for JSON export.
 */
export function getJsonContentType(): string {
  return 'application/json; charset=utf-8';
}

/**
 * Get file extension for JSON export.
 */
export function getJsonExtension(): string {
  return 'json';
}
