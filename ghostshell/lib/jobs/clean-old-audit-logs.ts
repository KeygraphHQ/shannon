import { db } from "@/lib/db";

/**
 * Clean up old audit log entries.
 *
 * Per FR-017 (Data Retention), audit log entries older than 2 years
 * should be purged. This job should be run on a regular schedule
 * (e.g., weekly) using a cron job, Vercel cron, or similar scheduler.
 *
 * Example cron configuration (run weekly on Sunday at 2 AM):
 * 0 2 * * 0 curl -X POST https://your-app.com/api/cron/clean-audit-logs
 *
 * Or with Vercel cron in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/clean-audit-logs",
 *     "schedule": "0 2 * * 0"
 *   }]
 * }
 */
export async function cleanOldAuditLogs(): Promise<{
  deletedCount: number;
  cutoffDate: Date;
}> {
  // Calculate cutoff date (2 years ago)
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 2);

  // Delete audit logs older than 2 years
  const result = await db.auditLog.deleteMany({
    where: {
      createdAt: {
        lt: cutoffDate,
      },
    },
  });

  console.log(
    `[clean-old-audit-logs] Deleted ${result.count} audit log entries older than ${cutoffDate.toISOString()}`
  );

  return {
    deletedCount: result.count,
    cutoffDate,
  };
}

/**
 * Get statistics about audit log entries.
 */
export async function getAuditLogStats(): Promise<{
  total: number;
  olderThan1Year: number;
  olderThan2Years: number;
  byAction: Record<string, number>;
}> {
  const now = new Date();
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const twoYearsAgo = new Date();
  twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

  const [total, olderThan1Year, olderThan2Years, actionCounts] = await Promise.all([
    db.auditLog.count(),
    db.auditLog.count({
      where: {
        createdAt: { lt: oneYearAgo },
      },
    }),
    db.auditLog.count({
      where: {
        createdAt: { lt: twoYearsAgo },
      },
    }),
    db.auditLog.groupBy({
      by: ["action"],
      _count: {
        action: true,
      },
    }),
  ]);

  const byAction: Record<string, number> = {};
  for (const item of actionCounts) {
    byAction[item.action] = item._count.action;
  }

  return {
    total,
    olderThan1Year,
    olderThan2Years,
    byAction,
  };
}
