"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import type {
  FindingStatus,
  FindingFilters,
  PaginationOptions,
  FindingDetail,
  FindingListItem,
  FindingsSummary,
  UpdateStatusResponse,
  JUSTIFICATION_REQUIRED_STATUSES,
} from "@/lib/types/findings";

/**
 * Statuses that require justification text when transitioning to them.
 */
const JUSTIFICATION_REQUIRED: FindingStatus[] = [
  "accepted_risk",
  "false_positive",
];

/**
 * Get a single finding with full details.
 * Validates org access through the parent scan.
 */
export async function getFinding(
  findingId: string
): Promise<FindingDetail | null> {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  // Get finding with scan to verify org access
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      scan: {
        select: {
          id: true,
          organizationId: true,
          project: {
            select: {
              name: true,
              targetUrl: true,
            },
          },
        },
      },
    },
  });

  if (!finding) {
    return null;
  }

  // Verify org access
  const hasAccess = await hasOrgAccess(finding.scan.organizationId);
  if (!hasAccess) {
    return null;
  }

  return {
    id: finding.id,
    scanId: finding.scanId,
    title: finding.title,
    description: finding.description,
    severity: finding.severity as FindingDetail["severity"],
    category: finding.category,
    status: finding.status as FindingDetail["status"],
    cvss: finding.cvss,
    cwe: finding.cwe,
    remediation: finding.remediation,
    evidence: finding.evidence as FindingDetail["evidence"],
    createdAt: finding.createdAt,
    updatedAt: finding.updatedAt,
    scan: {
      id: finding.scan.id,
      targetUrl: finding.scan.project.targetUrl,
      projectName: finding.scan.project.name,
    },
  };
}

/**
 * Update a finding's status with optional justification.
 * Creates an audit log entry for the status change.
 *
 * @param findingId - The finding to update
 * @param status - New status value
 * @param justification - Required for accepted_risk and false_positive statuses
 */
export async function updateFindingStatus(
  findingId: string,
  status: FindingStatus,
  justification?: string
): Promise<UpdateStatusResponse> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  // Get finding with scan to verify org access
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      scan: {
        select: {
          id: true,
          organizationId: true,
        },
      },
    },
  });

  if (!finding) {
    throw new Error("Finding not found");
  }

  // Verify org access
  const hasAccess = await hasOrgAccess(finding.scan.organizationId);
  if (!hasAccess) {
    throw new Error("Unauthorized");
  }

  // Validate justification requirement
  if (JUSTIFICATION_REQUIRED.includes(status) && !justification?.trim()) {
    throw new Error("Justification required for this status");
  }

  const previousStatus = finding.status as FindingStatus;

  // Transaction: update finding + create audit log
  const result = await db.$transaction(async (tx) => {
    const updated = await tx.finding.update({
      where: { id: findingId },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: finding.scan.organizationId,
        userId: user.id,
        action: "finding.status_changed",
        resourceType: "finding",
        resourceId: findingId,
        metadata: {
          previousStatus,
          newStatus: status,
          justification: justification?.trim() || null,
        },
      },
    });

    return updated;
  });

  // Revalidate relevant paths
  revalidatePath(`/dashboard/findings/${findingId}`);
  revalidatePath("/dashboard/findings");
  revalidatePath(`/dashboard/scans/${finding.scanId}`);

  return {
    id: result.id,
    status: result.status as FindingStatus,
    updatedAt: result.updatedAt,
  };
}
