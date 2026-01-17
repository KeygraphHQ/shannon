"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { canAccessReport, canDeleteReport, hasReportPermission } from "@/lib/reports/access-control";
import { generateReport, buildReportData, completeReport, failReport } from "@/lib/reports/generator";
import { renderToPdf } from "@/lib/reports/exporters/pdf";
import { renderToHtml } from "@/lib/reports/exporters/html";
import { renderToJsonString } from "@/lib/reports/exporters/json";
import type { ReportStatus, ReportType } from "@prisma/client";

export interface ReportFilters {
  status?: ReportStatus | ReportStatus[];
  type?: ReportType | ReportType[];
  scanId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * List reports for an organization with optional filtering.
 */
export async function listReportsAction(
  orgId: string,
  filters?: ReportFilters,
  pagination?: PaginationOptions
) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return { reports: [], nextCursor: null, total: 0 };
  }

  const canView = await hasReportPermission(orgId, "VIEW_REPORT");
  if (!canView) {
    return { reports: [], nextCursor: null, total: 0 };
  }

  const limit = pagination?.limit ?? 20;

  // Build where clause
  const where: Record<string, unknown> = {
    organizationId: orgId,
    deletedAt: null,
  };

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      where.status = { in: filters.status };
    } else {
      where.status = filters.status;
    }
  }

  if (filters?.type) {
    if (Array.isArray(filters.type)) {
      where.type = { in: filters.type };
    } else {
      where.type = filters.type;
    }
  }

  if (filters?.scanId) {
    where.scanId = filters.scanId;
  }

  if (filters?.dateFrom || filters?.dateTo) {
    where.createdAt = {};
    if (filters?.dateFrom) {
      (where.createdAt as Record<string, Date>).gte = filters.dateFrom;
    }
    if (filters?.dateTo) {
      (where.createdAt as Record<string, Date>).lte = filters.dateTo;
    }
  }

  // Get total count
  const total = await db.report.count({ where });

  // Apply cursor if provided
  if (pagination?.cursor) {
    where.id = { lt: pagination.cursor };
  }

  const reports = await db.report.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      scan: {
        select: {
          id: true,
          status: true,
          project: {
            select: { id: true, name: true, targetUrl: true },
          },
        },
      },
    },
  });

  const hasMore = reports.length > limit;
  const results = hasMore ? reports.slice(0, -1) : reports;
  const nextCursor = hasMore ? results[results.length - 1]?.id : null;

  return { reports: results, nextCursor, total };
}

/**
 * Get a single report with full details.
 */
export async function getReportAction(reportId: string) {
  const access = await canAccessReport(reportId, "VIEW_REPORT");
  if (!access.allowed || !access.report) {
    return null;
  }

  // Log access
  const user = await getCurrentUser();
  if (user) {
    await db.reportAccessLog.create({
      data: {
        reportId,
        accessedById: user.id,
        accessType: "view",
      },
    });
  }

  return access.report;
}

/**
 * Get report with findings for viewer component.
 */
export async function getReportWithFindingsAction(reportId: string) {
  const access = await canAccessReport(reportId, "VIEW_REPORT");
  if (!access.allowed || !access.report) {
    return null;
  }

  const report = access.report;

  // Get findings from scan
  const findings = await db.finding.findMany({
    where: { scanId: report.scanId },
    orderBy: [{ severity: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      description: true,
      severity: true,
      category: true,
      status: true,
      cvss: true,
      cwe: true,
      remediation: true,
    },
  });

  // Get executive summary from scan result
  const scanResult = await db.scanResult.findUnique({
    where: { scanId: report.scanId },
    select: { executiveSummary: true },
  });

  // Log access
  const user = await getCurrentUser();
  if (user) {
    await db.reportAccessLog.create({
      data: {
        reportId,
        accessedById: user.id,
        accessType: "view_detail",
      },
    });
  }

  return {
    report,
    findings,
    executiveSummary: scanResult?.executiveSummary || null,
  };
}

/**
 * Create a new report for a scan.
 */
export async function createReportAction(params: {
  scanId: string;
  type: ReportType;
  title?: string;
  templateId?: string;
  frameworkIds?: string[];
}): Promise<{ success?: boolean; reportId?: string; error?: string }> {
  const { scanId, type, title, templateId, frameworkIds } = params;

  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    return { error: "Not authenticated" };
  }

  const orgId = user.memberships[0].organizationId;

  // Check permission
  const canGenerate = await hasReportPermission(orgId, "GENERATE_REPORT");
  if (!canGenerate) {
    return { error: "Permission denied" };
  }

  // Validate scan exists and belongs to org
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
      status: "COMPLETED",
    },
    select: {
      id: true,
      project: {
        select: { name: true },
      },
    },
  });

  if (!scan) {
    return { error: "Scan not found or not completed" };
  }

  // Validate type
  if (!["EXECUTIVE", "TECHNICAL", "COMPLIANCE", "CUSTOM"].includes(type)) {
    return { error: "Invalid report type" };
  }

  if (type === "CUSTOM" && !templateId) {
    return { error: "Template ID is required for custom reports" };
  }

  try {
    // Generate report
    const result = await generateReport({
      scanId,
      organizationId: orgId,
      type,
      title,
      templateId,
      frameworkIds,
      generatedById: user.id,
    });

    if (!result.success) {
      if (result.error?.includes("Concurrent generation limit")) {
        return { error: "Too many reports generating. Please wait and try again." };
      }
      return { error: result.error || "Failed to generate report" };
    }

    // Build report data and render
    const reportData = await buildReportData(result.reportId!);
    if (!reportData) {
      await failReport(result.reportId!, "Failed to build report data");
      return { error: "Failed to build report data" };
    }

    try {
      // Generate exports
      await renderToPdf(reportData, type);
      renderToHtml(reportData);
      renderToJsonString(reportData);

      // Mark as completed
      await completeReport(result.reportId!);
    } catch (renderError) {
      console.error("Error rendering report:", renderError);
      await failReport(result.reportId!, "Failed to render report files");
      return { error: "Failed to render report" };
    }

    // Create audit log
    await db.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "report.generated",
        resourceType: "report",
        resourceId: result.reportId!,
        metadata: {
          type,
          scanId,
          projectName: scan.project.name,
        },
      },
    });

    revalidatePath("/dashboard/reports");
    revalidatePath(`/dashboard/scans/${scanId}/reports`);

    return { success: true, reportId: result.reportId! };
  } catch (err) {
    console.error("Failed to create report:", err);
    return { error: err instanceof Error ? err.message : "Failed to create report" };
  }
}

/**
 * Delete a report (soft delete, admin only).
 */
export async function deleteReportAction(reportId: string): Promise<{ success?: boolean; error?: string }> {
  const deleteCheck = await canDeleteReport(reportId);
  if (!deleteCheck.allowed) {
    return { error: deleteCheck.reason || "Permission denied" };
  }

  const user = await getCurrentUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  try {
    // Get report for audit log
    const report = await db.report.findUnique({
      where: { id: reportId },
      select: { title: true, organizationId: true, scanId: true },
    });

    if (!report) {
      return { error: "Report not found" };
    }

    // Soft delete
    await db.report.update({
      where: { id: reportId },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    });

    // Create audit log
    await db.auditLog.create({
      data: {
        organizationId: report.organizationId,
        userId: user.id,
        action: "report.deleted",
        resourceType: "report",
        resourceId: reportId,
        metadata: {
          title: report.title,
          scanId: report.scanId,
        },
      },
    });

    revalidatePath("/dashboard/reports");

    return { success: true };
  } catch (err) {
    console.error("Failed to delete report:", err);
    return { error: err instanceof Error ? err.message : "Failed to delete report" };
  }
}

/**
 * Get reports for a specific scan.
 */
export async function getReportsForScanAction(scanId: string) {
  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    return [];
  }

  const orgId = user.memberships[0].organizationId;

  // Verify scan belongs to org
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
  });

  if (!scan) {
    return [];
  }

  const reports = await db.report.findMany({
    where: {
      scanId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return reports;
}

/**
 * Get available scans for report generation (completed scans).
 */
export async function getAvailableScansAction() {
  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    return [];
  }

  const orgId = user.memberships[0].organizationId;

  const scans = await db.scan.findMany({
    where: {
      organizationId: orgId,
      status: "COMPLETED",
    },
    orderBy: { completedAt: "desc" },
    take: 50,
    select: {
      id: true,
      status: true,
      completedAt: true,
      findingsCount: true,
      criticalCount: true,
      highCount: true,
      project: {
        select: { id: true, name: true, targetUrl: true },
      },
    },
  });

  return scans;
}
