/**
 * Scan queue management utilities.
 *
 * Handles concurrent scan limits and queue position tracking.
 */

import { db } from "@/lib/db";

// Default concurrent scan limit per organization
const DEFAULT_CONCURRENT_LIMIT = 3;

/**
 * Check if an organization can start a new scan.
 *
 * @param orgId - Organization ID
 * @returns Whether a new scan can start, current count, and limit
 */
export async function checkConcurrentLimit(orgId: string): Promise<{
  canStart: boolean;
  currentCount: number;
  limit: number;
}> {
  // Count currently active scans (PENDING or RUNNING)
  const currentCount = await db.scan.count({
    where: {
      organizationId: orgId,
      status: {
        in: ["PENDING", "RUNNING"],
      },
    },
  });

  // TODO: Make limit configurable per organization (from org settings)
  const limit = DEFAULT_CONCURRENT_LIMIT;

  return {
    canStart: currentCount < limit,
    currentCount,
    limit,
  };
}

/**
 * Get the queue position for a specific scan.
 *
 * @param orgId - Organization ID
 * @param scanId - Scan ID to check
 * @returns Queue position (1-based) or null if scan is not queued
 */
export async function getQueuePosition(
  orgId: string,
  scanId: string
): Promise<number | null> {
  // Get the scan to check its status
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
  });

  if (!scan || scan.status !== "PENDING") {
    return null;
  }

  // Count how many PENDING scans were created before this one
  const position = await db.scan.count({
    where: {
      organizationId: orgId,
      status: "PENDING",
      createdAt: {
        lt: scan.createdAt,
      },
    },
  });

  // Position is 1-based
  return position + 1;
}

/**
 * Get queue statistics for an organization.
 *
 * @param orgId - Organization ID
 * @returns Queue statistics
 */
export async function getQueueStats(orgId: string): Promise<{
  running: number;
  pending: number;
  limit: number;
  available: number;
}> {
  const [running, pending] = await Promise.all([
    db.scan.count({
      where: {
        organizationId: orgId,
        status: "RUNNING",
      },
    }),
    db.scan.count({
      where: {
        organizationId: orgId,
        status: "PENDING",
      },
    }),
  ]);

  const limit = DEFAULT_CONCURRENT_LIMIT;
  const available = Math.max(0, limit - running);

  return {
    running,
    pending,
    limit,
    available,
  };
}
