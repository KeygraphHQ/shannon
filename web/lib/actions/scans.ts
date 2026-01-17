"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { createAuditLog } from "@/lib/audit";

interface CreateScanInput {
  targetUrl: string;
  projectId?: string;
  organizationId: string;
}

/**
 * Create a new security scan.
 */
export async function createScan(input: CreateScanInput) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return { error: "Unauthorized" };
    }

    // Verify user has access to the organization
    const membership = user.memberships.find(
      (m) => m.organizationId === input.organizationId
    );

    if (!membership) {
      return { error: "You don't have access to this organization" };
    }

    // Validate URL format
    try {
      const url = new URL(input.targetUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        return { error: "URL must use HTTP or HTTPS protocol" };
      }
    } catch {
      return { error: "Invalid URL format" };
    }

    // Create the scan
    const scan = await db.scan.create({
      data: {
        organizationId: input.organizationId,
        projectId: input.projectId,
        targetUrl: input.targetUrl,
        status: "pending",
        progress: 0,
      },
    });

    // Create audit log entry
    await createAuditLog({
      organizationId: input.organizationId,
      userId: user.id,
      action: "scan.started",
      resourceType: "scan",
      resourceId: scan.id,
      metadata: {
        targetUrl: input.targetUrl,
        scanId: scan.id,
      },
    });

    // TODO: Start Temporal workflow for the scan
    // This will be implemented in T019
    // await startScanWorkflow(scan.id, input.targetUrl);

    revalidatePath("/dashboard");
    revalidatePath(`/dashboard/scans/${scan.id}`);

    return { success: true, scanId: scan.id };
  } catch (error) {
    console.error("Error creating scan:", error);
    return { error: "Failed to create scan" };
  }
}

/**
 * Get scans for an organization.
 */
export async function getScans(organizationId: string) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    // Verify user has access to the organization
    const membership = user.memberships.find(
      (m) => m.organizationId === organizationId
    );

    if (!membership) {
      throw new Error("You don't have access to this organization");
    }

    const scans = await db.scan.findMany({
      where: {
        organizationId,
      },
      include: {
        project: true,
        _count: {
          select: {
            findings: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 50,
    });

    return scans;
  } catch (error) {
    console.error("Error fetching scans:", error);
    throw error;
  }
}

/**
 * Get a single scan by ID.
 */
export async function getScan(scanId: string) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    const scan = await db.scan.findUnique({
      where: {
        id: scanId,
      },
      include: {
        organization: true,
        project: true,
        findings: {
          orderBy: {
            severity: "desc",
          },
        },
      },
    });

    if (!scan) {
      throw new Error("Scan not found");
    }

    // Verify user has access to the organization
    const membership = user.memberships.find(
      (m) => m.organizationId === scan.organizationId
    );

    if (!membership) {
      throw new Error("You don't have access to this scan");
    }

    return scan;
  } catch (error) {
    console.error("Error fetching scan:", error);
    throw error;
  }
}

/**
 * Get scan statistics for an organization.
 */
export async function getScanStats(organizationId: string) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Unauthorized");
    }

    // Verify user has access to the organization
    const membership = user.memberships.find(
      (m) => m.organizationId === organizationId
    );

    if (!membership) {
      throw new Error("You don't have access to this organization");
    }

    const [totalScans, openFindings, fixedFindings, completedScans] =
      await Promise.all([
        db.scan.count({
          where: { organizationId },
        }),
        db.finding.count({
          where: {
            scan: { organizationId },
            status: "open",
          },
        }),
        db.finding.count({
          where: {
            scan: { organizationId },
            status: "fixed",
          },
        }),
        db.scan.count({
          where: {
            organizationId,
            status: "completed",
          },
        }),
      ]);

    return {
      totalScans,
      openFindings,
      fixedFindings,
      completedScans,
    };
  } catch (error) {
    console.error("Error fetching scan stats:", error);
    throw error;
  }
}

/**
 * Update scan progress (called by Temporal workflow).
 */
export async function updateScanProgress(
  scanId: string,
  data: {
    status?: string;
    progress?: number;
    currentPhase?: string;
    completedAt?: Date;
  }
) {
  try {
    const scan = await db.scan.update({
      where: { id: scanId },
      data,
    });

    // If scan completed, create audit log
    if (data.status === "completed" || data.status === "failed") {
      await createAuditLog({
        organizationId: scan.organizationId,
        action:
          data.status === "completed" ? "scan.completed" : "scan.failed",
        resourceType: "scan",
        resourceId: scanId,
        metadata: {
          targetUrl: scan.targetUrl,
          progress: data.progress,
        },
      });
    }

    revalidatePath(`/dashboard/scans/${scanId}`);
    revalidatePath("/dashboard");

    return scan;
  } catch (error) {
    console.error("Error updating scan progress:", error);
    throw error;
  }
}
