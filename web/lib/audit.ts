import { headers } from "next/headers";
import { db } from "./db";
import { Prisma } from "@prisma/client";

export type AuditAction =
  | "user.created"
  | "user.updated"
  | "user.deleted"
  | "organization.created"
  | "organization.updated"
  | "organization.deleted"
  | "member.invited"
  | "member.joined"
  | "member.role_changed"
  | "member.removed"
  | "scan.started"
  | "scan.completed"
  | "scan.failed"
  | "finding.created"
  | "finding.status_changed";

interface AuditLogParams {
  organizationId: string;
  userId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Create an audit log entry.
 * This function captures the IP address from the request headers.
 */
export async function createAuditLog({
  organizationId,
  userId,
  action,
  resourceType,
  resourceId,
  metadata,
}: AuditLogParams) {
  // Get IP address from headers
  const headersList = await headers();
  const forwardedFor = headersList.get("x-forwarded-for");
  const realIp = headersList.get("x-real-ip");
  const ipAddress = forwardedFor?.split(",")[0] || realIp || null;

  return db.auditLog.create({
    data: {
      organizationId,
      userId,
      action,
      resourceType,
      resourceId,
      metadata: (metadata || {}) as Prisma.InputJsonValue,
      ipAddress,
    },
  });
}

/**
 * Get audit logs for an organization.
 */
export async function getAuditLogs(
  organizationId: string,
  options?: {
    limit?: number;
    offset?: number;
    action?: AuditAction;
    userId?: string;
    startDate?: Date;
    endDate?: Date;
  }
) {
  const { limit = 50, offset = 0, action, userId, startDate, endDate } = options || {};

  return db.auditLog.findMany({
    where: {
      organizationId,
      ...(action && { action }),
      ...(userId && { userId }),
      ...(startDate || endDate
        ? {
            createdAt: {
              ...(startDate && { gte: startDate }),
              ...(endDate && { lte: endDate }),
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          avatarUrl: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
    skip: offset,
  });
}
