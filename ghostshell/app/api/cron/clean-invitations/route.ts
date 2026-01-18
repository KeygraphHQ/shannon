import { NextResponse } from "next/server";
import { cleanExpiredInvitations } from "@/lib/jobs/clean-expired-invitations";

/**
 * API endpoint for cleaning expired invitations.
 * This should be called by a cron job on a regular schedule.
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
    const result = await cleanExpiredInvitations();

    return NextResponse.json({
      success: true,
      expiredCount: result.expiredCount,
      deletedCount: result.deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[cron/clean-invitations] Error:", error);
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
