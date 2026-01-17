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

/**
 * Add a note to a finding.
 * Creates audit log entry and returns the created note.
 */
export async function addFindingNote(
  findingId: string,
  content: string
): Promise<{ id: string; content: string; createdAt: Date }> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  const trimmedContent = content.trim();
  if (!trimmedContent) {
    throw new Error("Note content cannot be empty");
  }

  if (trimmedContent.length > 10000) {
    throw new Error("Note content exceeds maximum length of 10,000 characters");
  }

  // Get finding with scan to verify org access
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      scan: {
        select: {
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

  // Transaction: create note + audit log
  const note = await db.$transaction(async (tx) => {
    const created = await tx.findingNote.create({
      data: {
        findingId,
        userId: user.id,
        content: trimmedContent,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: finding.scan.organizationId,
        userId: user.id,
        action: "finding.note_added",
        resourceType: "finding",
        resourceId: findingId,
        metadata: {
          noteId: created.id,
          contentLength: trimmedContent.length,
        },
      },
    });

    return created;
  });

  // Revalidate finding detail page
  revalidatePath(`/dashboard/findings/${findingId}`);

  return {
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
  };
}

/**
 * Get activity history for a finding.
 * Merges notes and status changes into a unified timeline.
 */
export async function getFindingActivity(
  findingId: string
): Promise<import("@/lib/types/findings").ActivityEntry[]> {
  const user = await getCurrentUser();
  if (!user) {
    return [];
  }

  // Get finding with scan to verify org access
  const finding = await db.finding.findUnique({
    where: { id: findingId },
    include: {
      scan: {
        select: {
          organizationId: true,
        },
      },
    },
  });

  if (!finding) {
    return [];
  }

  // Verify org access
  const hasAccess = await hasOrgAccess(finding.scan.organizationId);
  if (!hasAccess) {
    return [];
  }

  // Fetch notes and status changes in parallel
  const [notes, auditLogs] = await Promise.all([
    db.findingNote.findMany({
      where: { findingId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({
      where: {
        resourceType: "finding",
        resourceId: findingId,
        action: "finding.status_changed",
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatarUrl: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Transform notes to activity entries
  const noteActivities: import("@/lib/types/findings").NoteActivity[] = notes.map((note) => ({
    type: "note" as const,
    id: note.id,
    content: note.content,
    createdAt: note.createdAt,
    user: note.user,
  }));

  // Transform status changes to activity entries
  const statusActivities: import("@/lib/types/findings").StatusChangeActivity[] = auditLogs.map((log) => {
    const metadata = log.metadata as {
      previousStatus: FindingStatus;
      newStatus: FindingStatus;
      justification?: string | null;
    };
    return {
      type: "status_change" as const,
      id: log.id,
      previousStatus: metadata.previousStatus,
      newStatus: metadata.newStatus,
      justification: metadata.justification ?? null,
      createdAt: log.createdAt,
      user: log.user,
    };
  });

  // Merge and sort by date (newest first)
  const allActivities = [...noteActivities, ...statusActivities];
  allActivities.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return allActivities;
}

/**
 * List findings with filters and cursor pagination.
 * Returns findings across all scans in the user's organization.
 */
export async function listFindings(
  filters: FindingFilters = {},
  pagination: PaginationOptions = {}
): Promise<import("@/lib/types/findings").ListFindingsResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return { findings: [], nextCursor: null, total: 0 };
  }

  // Get user's organization
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  if (!membership) {
    return { findings: [], nextCursor: null, total: 0 };
  }

  const limit = Math.min(pagination.limit || 20, 100);

  // Build where clause
  const where: Parameters<typeof db.finding.findMany>[0]["where"] = {
    scan: {
      organizationId: membership.organizationId,
    },
  };

  // Apply filters
  if (filters.severity) {
    where.severity = Array.isArray(filters.severity)
      ? { in: filters.severity }
      : filters.severity;
  }

  if (filters.status) {
    where.status = Array.isArray(filters.status)
      ? { in: filters.status }
      : filters.status;
  }

  if (filters.category) {
    where.category = Array.isArray(filters.category)
      ? { in: filters.category }
      : filters.category;
  }

  if (filters.scanId) {
    where.scanId = filters.scanId;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  // Get total count
  const total = await db.finding.count({ where });

  // Get findings with cursor pagination
  const findings = await db.finding.findMany({
    where,
    include: {
      scan: {
        select: {
          id: true,
          project: {
            select: {
              targetUrl: true,
            },
          },
        },
      },
    },
    orderBy: [
      { severity: "asc" }, // Critical first (alphabetically: critical < high < info < low < medium)
      { createdAt: "desc" },
    ],
    take: limit + 1, // Take one extra to determine if there's more
    ...(pagination.cursor && {
      cursor: { id: pagination.cursor },
      skip: 1, // Skip the cursor itself
    }),
  });

  // Determine if there's a next page
  const hasMore = findings.length > limit;
  const resultFindings = hasMore ? findings.slice(0, limit) : findings;
  const nextCursor = hasMore ? resultFindings[resultFindings.length - 1]?.id ?? null : null;

  // Transform to FindingListItem
  const findingItems: FindingListItem[] = resultFindings.map((f) => ({
    id: f.id,
    scanId: f.scanId,
    title: f.title,
    description: f.description,
    severity: f.severity as FindingListItem["severity"],
    category: f.category,
    status: f.status as FindingListItem["status"],
    cvss: f.cvss,
    cwe: f.cwe,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    scan: {
      id: f.scan.id,
      targetUrl: f.scan.project.targetUrl,
    },
  }));

  return {
    findings: findingItems,
    nextCursor,
    total,
  };
}

/**
 * Get findings summary for dashboard widget.
 * Returns counts by severity and status.
 */
export async function getFindingsSummary(): Promise<import("@/lib/types/findings").FindingsSummary> {
  const user = await getCurrentUser();
  if (!user) {
    return {
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byStatus: { open: 0, fixed: 0, accepted_risk: 0, false_positive: 0 },
      total: 0,
      openCount: 0,
    };
  }

  // Get user's organization
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  if (!membership) {
    return {
      bySeverity: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      byStatus: { open: 0, fixed: 0, accepted_risk: 0, false_positive: 0 },
      total: 0,
      openCount: 0,
    };
  }

  // Get all findings for the organization
  const findings = await db.finding.findMany({
    where: {
      scan: {
        organizationId: membership.organizationId,
      },
    },
    select: {
      severity: true,
      status: true,
    },
  });

  // Calculate summary
  const bySeverity = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };

  const byStatus = {
    open: 0,
    fixed: 0,
    accepted_risk: 0,
    false_positive: 0,
  };

  for (const finding of findings) {
    // Count by severity
    const severity = finding.severity as keyof typeof bySeverity;
    if (severity in bySeverity) {
      bySeverity[severity]++;
    }

    // Count by status
    const status = finding.status as keyof typeof byStatus;
    if (status in byStatus) {
      byStatus[status]++;
    }
  }

  return {
    bySeverity,
    byStatus,
    total: findings.length,
    openCount: byStatus.open,
  };
}

/**
 * Bulk update status for multiple findings.
 * Creates individual audit log entries for each finding.
 * Returns the count of successfully updated findings.
 */
export async function bulkUpdateFindingStatus(
  findingIds: string[],
  status: FindingStatus,
  justification?: string
): Promise<import("@/lib/types/findings").BulkUpdateStatusResponse> {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }

  if (findingIds.length === 0) {
    throw new Error("No findings selected");
  }

  if (findingIds.length > 50) {
    throw new Error("Cannot update more than 50 findings at once");
  }

  // Validate justification requirement
  if (JUSTIFICATION_REQUIRED.includes(status) && !justification?.trim()) {
    throw new Error("Justification required for this status");
  }

  // Get user's organization
  const membership = await db.membership.findFirst({
    where: { userId: user.id },
    select: { organizationId: true },
  });

  if (!membership) {
    throw new Error("Unauthorized");
  }

  // Verify all findings belong to user's org and get their current status
  const findings = await db.finding.findMany({
    where: {
      id: { in: findingIds },
      scan: {
        organizationId: membership.organizationId,
      },
    },
    select: {
      id: true,
      status: true,
      scanId: true,
    },
  });

  if (findings.length !== findingIds.length) {
    throw new Error("Some findings not found or access denied");
  }

  // Perform bulk update in transaction
  const result = await db.$transaction(async (tx) => {
    // Update all findings
    await tx.finding.updateMany({
      where: {
        id: { in: findingIds },
      },
      data: {
        status,
        updatedAt: new Date(),
      },
    });

    // Create individual audit log entries for each finding
    const auditLogEntries = findings.map((finding) => ({
      organizationId: membership.organizationId,
      userId: user.id,
      action: "finding.status_changed",
      resourceType: "finding",
      resourceId: finding.id,
      metadata: {
        previousStatus: finding.status as FindingStatus,
        newStatus: status,
        justification: justification?.trim() || null,
        bulkOperation: true,
        bulkSize: findingIds.length,
      },
    }));

    await tx.auditLog.createMany({
      data: auditLogEntries,
    });

    return findingIds;
  });

  // Revalidate paths
  revalidatePath("/dashboard/findings");
  // Revalidate individual finding pages and their scan pages
  const uniqueScanIds = [...new Set(findings.map((f) => f.scanId))];
  for (const scanId of uniqueScanIds) {
    revalidatePath(`/dashboard/scans/${scanId}`);
  }
  for (const findingId of findingIds) {
    revalidatePath(`/dashboard/findings/${findingId}`);
  }

  return {
    updated: result.length,
    findingIds: result,
  };
}
