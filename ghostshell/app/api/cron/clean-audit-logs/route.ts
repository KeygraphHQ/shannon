import { NextResponse } from "next/server";
import { cleanOldAuditLogs, getAuditLogStats } from "@/lib/jobs/clean-old-audit-logs";

/**
 * API endpoint for cleaning old audit log entries.
 * This should be called by a cron job on a regular schedule (weekly recommended).
 *
 * Per FR-017 (Data Retention), audit logs older than 2 years are purged.
 *
 * Security: In production, this endpoint should be protected with
 * a secret token (e.g., CRON_SECRET in the Authorization header).
 */
export async function POST(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    // Get stats before cleanup for reporting
    const statsBefore = await getAuditLogStats();

    // Perform cleanup
    const result = await cleanOldAuditLogs();

    // Get stats after cleanup
    const statsAfter = await getAuditLogStats();

    return NextResponse.json({
      success: true,
      deletedCount: result.deletedCount,
      cutoffDate: result.cutoffDate.toISOString(),
      statsBefore: {
        total: statsBefore.total,
        olderThan2Years: statsBefore.olderThan2Years,
      },
      statsAfter: {
        total: statsAfter.total,
        olderThan2Years: statsAfter.olderThan2Years,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/clean-audit-logs] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Also support GET for easier testing
export async function GET(request: Request) {
  return POST(request);
}
