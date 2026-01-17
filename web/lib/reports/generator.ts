/**
 * Report generator service.
 * Orchestrates report generation from scan data.
 */

import { db } from '../db';
import { ReportStatus, ReportType } from '@prisma/client';
import { calculateRiskScore, calculateFindingsSummary } from './risk-score';
import { getReportFilePaths } from './storage';
import { checkConcurrentGenerationLimit } from './access-control';
import type { ReportData } from './templates/types';

export interface GenerateReportInput {
  scanId: string;
  organizationId: string;
  type: ReportType;
  title?: string;
  templateId?: string;
  frameworkIds?: string[];
  generatedById: string;
}

export interface GenerateReportResult {
  success: boolean;
  reportId?: string;
  error?: string;
}

/**
 * Start report generation for a scan.
 * Creates the report record and prepares data for PDF rendering.
 */
export async function generateReport(
  input: GenerateReportInput
): Promise<GenerateReportResult> {
  // Check concurrent generation limit
  const limitCheck = await checkConcurrentGenerationLimit(input.organizationId);
  if (!limitCheck.allowed) {
    return {
      success: false,
      error: `Concurrent generation limit reached (${limitCheck.currentCount}/${limitCheck.maxCount}). Please wait for existing reports to complete.`,
    };
  }

  // Fetch scan with related data
  const scan = await db.scan.findUnique({
    where: { id: input.scanId },
    include: {
      project: true,
      organization: true,
      result: true,
      findings: {
        where: {
          // Exclude false positives from report
          status: { not: 'false_positive' },
        },
        orderBy: [
          { severity: 'asc' }, // Critical first (alphabetically critical < high < low < medium)
          { createdAt: 'desc' },
        ],
      },
    },
  });

  if (!scan) {
    return { success: false, error: 'Scan not found' };
  }

  if (scan.organizationId !== input.organizationId) {
    return { success: false, error: 'Scan does not belong to organization' };
  }

  if (scan.status !== 'COMPLETED') {
    return { success: false, error: 'Can only generate reports for completed scans' };
  }

  // Calculate findings summary and risk score
  const summary = calculateFindingsSummary(scan.findings);
  const riskResult = calculateRiskScore(scan.findings);

  // Generate report title if not provided
  const title =
    input.title ||
    `${getReportTypeLabel(input.type)} Report - ${scan.project.name} - ${new Date().toLocaleDateString()}`;

  // Get storage paths
  const storagePaths = getReportFilePaths(input.organizationId, 'pending'); // Will be updated after creation

  // Fetch template if custom
  let templateSnapshot = null;
  if (input.type === 'CUSTOM' && input.templateId) {
    const template = await db.reportTemplate.findUnique({
      where: { id: input.templateId },
    });
    if (template) {
      templateSnapshot = {
        name: template.name,
        logoUrl: template.logoUrl,
        primaryColor: template.primaryColor,
        secondaryColor: template.secondaryColor,
        sections: template.sections,
        customContent: template.customContent,
      };
    }
  }

  // Create report record
  const report = await db.report.create({
    data: {
      organizationId: input.organizationId,
      scanId: input.scanId,
      templateId: input.templateId,
      type: input.type,
      status: ReportStatus.GENERATING,
      title,
      generatedById: input.generatedById,
      findingsCount: summary.total,
      criticalCount: summary.critical,
      highCount: summary.high,
      mediumCount: summary.medium,
      lowCount: summary.low,
      riskScore: riskResult.score,
      frameworkIds: input.frameworkIds || [],
      templateSnapshot,
    },
  });

  // Update storage paths with actual report ID
  const actualPaths = getReportFilePaths(input.organizationId, report.id);

  await db.report.update({
    where: { id: report.id },
    data: {
      storagePath: actualPaths.storagePath,
      pdfPath: actualPaths.pdfPath,
      htmlPath: actualPaths.htmlPath,
      jsonPath: actualPaths.jsonPath,
    },
  });

  return {
    success: true,
    reportId: report.id,
  };
}

/**
 * Build report data for template rendering.
 */
export async function buildReportData(reportId: string): Promise<ReportData | null> {
  const report = await db.report.findUnique({
    where: { id: reportId },
    include: {
      organization: true,
      scan: {
        include: {
          project: true,
          result: true,
          findings: {
            where: { status: { not: 'false_positive' } },
            orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
          },
        },
      },
      template: true,
    },
  });

  if (!report || !report.scan) {
    return null;
  }

  // Sort findings by severity order (critical, high, medium, low, info)
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sortedFindings = [...report.scan.findings].sort((a, b) => {
    const aOrder = severityOrder[a.severity as keyof typeof severityOrder] ?? 5;
    const bOrder = severityOrder[b.severity as keyof typeof severityOrder] ?? 5;
    return aOrder - bOrder;
  });

  const summary = calculateFindingsSummary(sortedFindings);

  const reportData: ReportData = {
    organization: {
      id: report.organization.id,
      name: report.organization.name,
      logoUrl: report.organization.logoUrl,
    },
    project: {
      id: report.scan.project.id,
      name: report.scan.project.name,
      targetUrl: report.scan.project.targetUrl,
      description: report.scan.project.description,
    },
    scan: {
      id: report.scan.id,
      status: report.scan.status,
      startedAt: report.scan.startedAt,
      completedAt: report.scan.completedAt,
      durationMs: report.scan.durationMs,
      result: report.scan.result
        ? {
            executiveSummary: report.scan.result.executiveSummary,
            riskScore: report.scan.result.riskScore,
          }
        : null,
    },
    findings: sortedFindings.map((f) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      severity: f.severity,
      category: f.category,
      status: f.status,
      cvss: f.cvss,
      cwe: f.cwe,
      remediation: f.remediation,
      evidence: f.evidence,
    })),
    summary: {
      ...summary,
      riskScore: report.riskScore || 0,
    },
    metadata: {
      reportId: report.id,
      title: report.title,
      type: report.type as ReportData['metadata']['type'],
      generatedAt: report.createdAt,
      generatedBy: report.generatedById,
      frameworkIds: report.frameworkIds,
    },
    branding: report.template
      ? {
          logoUrl: report.template.logoUrl || undefined,
          primaryColor: report.template.primaryColor || undefined,
          secondaryColor: report.template.secondaryColor || undefined,
          headerText: (report.template.customContent as Record<string, string>)?.header_text,
          footerText: (report.template.customContent as Record<string, string>)?.footer_text,
          disclaimer: (report.template.customContent as Record<string, string>)?.disclaimer,
        }
      : undefined,
  };

  return reportData;
}

/**
 * Mark report as completed.
 */
export async function completeReport(reportId: string): Promise<void> {
  await db.report.update({
    where: { id: reportId },
    data: {
      status: ReportStatus.COMPLETED,
      generatedAt: new Date(),
    },
  });
}

/**
 * Mark report as failed.
 */
export async function failReport(reportId: string, errorMessage: string): Promise<void> {
  await db.report.update({
    where: { id: reportId },
    data: {
      status: ReportStatus.FAILED,
      errorMessage,
    },
  });
}

/**
 * Get human-readable label for report type.
 */
export function getReportTypeLabel(type: ReportType): string {
  const labels: Record<ReportType, string> = {
    EXECUTIVE: 'Executive Summary',
    TECHNICAL: 'Technical Detail',
    COMPLIANCE: 'Compliance',
    CUSTOM: 'Custom',
  };
  return labels[type] || type;
}

/**
 * Get report with basic info for list views.
 */
export async function getReportSummary(reportId: string) {
  return db.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      scanId: true,
      type: true,
      status: true,
      title: true,
      findingsCount: true,
      riskScore: true,
      createdAt: true,
      generatedAt: true,
    },
  });
}

/**
 * List reports for an organization.
 */
export async function listReports(
  organizationId: string,
  options: {
    scanId?: string;
    status?: ReportStatus;
    type?: ReportType;
    page?: number;
    limit?: number;
  } = {}
) {
  const { scanId, status, type, page = 1, limit = 20 } = options;

  const where = {
    organizationId,
    deletedAt: null,
    ...(scanId && { scanId }),
    ...(status && { status }),
    ...(type && { type }),
  };

  const [reports, total] = await Promise.all([
    db.report.findMany({
      where,
      select: {
        id: true,
        scanId: true,
        type: true,
        status: true,
        title: true,
        findingsCount: true,
        criticalCount: true,
        highCount: true,
        mediumCount: true,
        lowCount: true,
        riskScore: true,
        createdAt: true,
        generatedAt: true,
        scan: {
          select: {
            project: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.report.count({ where }),
  ]);

  return {
    reports,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
