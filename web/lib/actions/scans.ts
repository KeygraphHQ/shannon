"use server";

import { db } from "@/lib/db";
import { hasOrgAccess } from "@/lib/auth";
import type { ScanStatus } from "@prisma/client";

// Placeholder types for filter options
export interface ScanFilters {
  status?: ScanStatus;
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
 * (Implementation in US1 Phase)
 */
export async function listScans(
  orgId: string,
  filters?: ScanFilters,
  pagination?: PaginationOptions
) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return { scans: [], nextCursor: null };
  }

  // TODO: Implement in US1 (T025)
  // - Filter by status, projectId, date range
  // - Cursor-based pagination
  // - Sort by createdAt desc

  const limit = pagination?.limit ?? 20;

  const scans = await db.scan.findMany({
    where: {
      organizationId: orgId,
      ...(filters?.status && { status: filters.status }),
      ...(filters?.projectId && { projectId: filters.projectId }),
      ...(filters?.dateFrom && { createdAt: { gte: filters.dateFrom } }),
      ...(filters?.dateTo && { createdAt: { lte: filters.dateTo } }),
      ...(pagination?.cursor && { id: { lt: pagination.cursor } }),
    },
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

  return { scans: results, nextCursor };
}

/**
 * Get a single scan with details.
 * (Implementation in US1 Phase)
 */
export async function getScan(orgId: string, scanId: string) {
  const hasAccess = await hasOrgAccess(orgId);
  if (!hasAccess) {
    return null;
  }

  // TODO: Implement in US1 (T026)
  // - Include project and result relations

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
 * Start a new scan.
 * (Implementation in US1 Phase)
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

  // TODO: Implement in US1 (T027)
  // - Check concurrent scan limit
  // - Create Scan record with PENDING status
  // - Start Temporal workflow
  // - Return scan object

  throw new Error("Not implemented - pending US1 implementation");
}

/**
 * Cancel a running scan.
 * (Implementation in US1 Phase)
 */
export async function cancelScan(orgId: string, scanId: string) {
  const hasAccess = await hasOrgAccess(orgId, ["owner", "admin", "member"]);
  if (!hasAccess) {
    throw new Error("Not authorized");
  }

  // TODO: Implement in US1 (T028)
  // - Validate ownership
  // - Cancel Temporal workflow
  // - Update status to CANCELLED

  throw new Error("Not implemented - pending US1 implementation");
}
