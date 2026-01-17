"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { startScanWorkflow, cancelScanWorkflow } from "@/lib/temporal/client";
import { checkConcurrentLimit } from "@/lib/scan-queue";
import { decryptCredentials } from "@/lib/encryption";
import type { ScanStatus } from "@prisma/client";
import type { AuthConfig } from "@/lib/temporal/types";

export interface ScanFilters {
  status?: ScanStatus | ScanStatus[];
  projectId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginationOptions {
  cursor?: string;
  limit?: number;
}

/**
 * List scans for an organization with optional filtering.
 * Implements cursor-based pagination, status/date filtering, sorted by createdAt desc.
 */
export async function listScans(
  orgId: string,
  filters?: ScanFilters,
  pagination?: PaginationOptions
) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return { scans: [], nextCursor: null, total: 0 };
  }

  const limit = pagination?.limit ?? 20;

  // Build where clause
  const where: Record<string, unknown> = {
    organizationId: orgId,
  };

  if (filters?.status) {
    if (Array.isArray(filters.status)) {
      where.status = { in: filters.status };
    } else {
      where.status = filters.status;
    }
  }

  if (filters?.projectId) {
    where.projectId = filters.projectId;
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
  const total = await db.scan.count({ where });

  // Apply cursor if provided
  if (pagination?.cursor) {
    where.id = { lt: pagination.cursor };
  }

  const scans = await db.scan.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    include: {
      project: {
        select: { id: true, name: true, targetUrl: true },
      },
    },
  });

  const hasMore = scans.length > limit;
  const results = hasMore ? scans.slice(0, -1) : scans;
  const nextCursor = hasMore ? results[results.length - 1]?.id : null;

  return { scans: results, nextCursor, total };
}

/**
 * Get a single scan with details including project and result relations.
 */
export async function getScan(orgId: string, scanId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  return db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
    include: {
      project: true,
      result: true,
    },
  });
}

/**
 * Start a new scan for a project.
 * Checks concurrent limit, creates Scan record, starts Temporal workflow.
 */
export async function startScan(
  orgId: string,
  projectId: string,
  targetUrlOverride?: string
) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  // Verify project exists and belongs to org, include auth config
  const project = await db.project.findFirst({
    where: { id: projectId, organizationId: orgId },
    include: {
      authenticationConfig: true,
    },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  // Check concurrent scan limit
  const { canStart, currentCount, limit } = await checkConcurrentLimit(orgId);
  if (!canStart) {
    throw new Error(`Concurrent scan limit reached (${currentCount}/${limit})`);
  }

  const targetUrl = targetUrlOverride || project.targetUrl;

  // Build auth config for workflow (if configured)
  let authConfig: AuthConfig | undefined;
  if (project.authenticationConfig && project.authenticationConfig.method !== "NONE") {
    const config = project.authenticationConfig;

    // Decrypt credentials
    let credentials: Record<string, string> = {};
    if (config.encryptedCredentials) {
      try {
        credentials = decryptCredentials(config.encryptedCredentials, orgId);
      } catch (err) {
        console.error("Failed to decrypt auth credentials:", err);
        // Continue without auth config - scan will run unauthenticated
      }
    }

    authConfig = {
      method: config.method,
      credentials: {
        username: credentials.username,
        password: credentials.password,
        apiToken: credentials.apiToken,
        totpSecret: credentials.totpSecret,
      },
      loginUrl: config.loginUrl || undefined,
      usernameSelector: config.usernameSelector || undefined,
      passwordSelector: config.passwordSelector || undefined,
      submitSelector: config.submitSelector || undefined,
      successIndicator: config.successIndicator || undefined,
      totpEnabled: config.totpEnabled,
      totpSelector: config.totpSelector || undefined,
    };
  }

  // Create scan record
  const scan = await db.$transaction(async (tx) => {
    const newScan = await tx.scan.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        status: "PENDING",
        source: "MANUAL",
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "scan.started",
        resourceType: "scan",
        resourceId: newScan.id,
        metadata: {
          projectId: project.id,
          projectName: project.name,
          targetUrl,
          hasAuthConfig: !!authConfig,
          authMethod: authConfig?.method || null,
        },
      },
    });

    return newScan;
  });

  // Start Temporal workflow
  try {
    const { workflowId } = await startScanWorkflow({
      projectId: project.id,
      organizationId: orgId,
      targetUrl,
      repositoryUrl: project.repositoryUrl || undefined,
      scanId: scan.id,
      authConfig,
    });

    // Update scan with workflow ID and set to RUNNING
    const updatedScan = await db.scan.update({
      where: { id: scan.id },
      data: {
        temporalWorkflowId: workflowId,
        status: "RUNNING",
        startedAt: new Date(),
      },
      include: {
        project: true,
      },
    });

    revalidatePath("/scans");
    return updatedScan;
  } catch (workflowError) {
    // If workflow fails to start, mark scan as failed
    console.error("Failed to start workflow:", workflowError);
    await db.scan.update({
      where: { id: scan.id },
      data: {
        status: "FAILED",
        errorMessage: "Failed to start scan workflow",
        errorCode: "WORKFLOW_START_FAILED",
      },
    });

    throw new Error("Failed to start scan workflow");
  }
}

/**
 * Cancel a running scan.
 * Validates ownership, cancels Temporal workflow, updates status.
 */
export async function cancelScan(orgId: string, scanId: string) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("User not found");
  }

  // Find scan
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
    include: {
      project: true,
    },
  });

  if (!scan) {
    throw new Error("Scan not found");
  }

  // Can only cancel PENDING or RUNNING scans
  if (!["PENDING", "RUNNING"].includes(scan.status)) {
    throw new Error("Scan cannot be cancelled (not running)");
  }

  // Cancel Temporal workflow if running
  if (scan.temporalWorkflowId && scan.status === "RUNNING") {
    try {
      await cancelScanWorkflow(scan.temporalWorkflowId);
    } catch (workflowError) {
      console.error("Failed to cancel workflow:", workflowError);
      // Continue anyway - workflow may have already completed
    }
  }

  // Update scan status
  const updatedScan = await db.$transaction(async (tx) => {
    const updated = await tx.scan.update({
      where: { id: scanId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
        durationMs: scan.startedAt
          ? Date.now() - scan.startedAt.getTime()
          : null,
      },
      include: {
        project: true,
        result: true,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: orgId,
        userId: user.id,
        action: "scan.cancelled",
        resourceType: "scan",
        resourceId: scanId,
        metadata: {
          projectId: scan.projectId,
          projectName: scan.project.name,
          previousStatus: scan.status,
        },
      },
    });

    return updated;
  });

  revalidatePath("/scans");
  revalidatePath(`/scans/${scanId}`);

  return updatedScan;
}

/**
 * Get a scan with full findings breakdown.
 * Returns scan details with result data.
 */
export async function getScanWithFindings(orgId: string, scanId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
    include: {
      project: {
        select: {
          id: true,
          name: true,
          targetUrl: true,
          repositoryUrl: true,
        },
      },
      result: true,
    },
  });

  if (!scan) {
    return null;
  }

  return {
    ...scan,
    findingsBreakdown: {
      critical: scan.criticalCount,
      high: scan.highCount,
      medium: scan.mediumCount,
      low: scan.lowCount,
      total: scan.findingsCount,
    },
    timing: {
      startedAt: scan.startedAt,
      completedAt: scan.completedAt,
      durationMs: scan.durationMs,
    },
  };
}

export type ExportFormat = "pdf" | "json" | "html";

/**
 * Get export URL for a scan.
 * Returns the URL to download the scan report in the specified format.
 */
export async function getExportUrl(
  orgId: string,
  scanId: string,
  format: ExportFormat = "json"
): Promise<string | null> {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  // Verify scan exists and is completed
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
      status: "COMPLETED",
    },
  });

  if (!scan) {
    return null;
  }

  // Return the export URL
  return `/api/scans/${scanId}/export?format=${format}`;
}
