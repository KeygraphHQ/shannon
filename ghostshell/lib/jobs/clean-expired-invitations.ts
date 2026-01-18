import { db } from "@/lib/db";

/**
 * Clean up expired invitations.
 *
 * This job marks all pending invitations that have passed their expiration
 * date as "expired". This should be run on a regular schedule (e.g., daily)
 * using a cron job, Vercel cron, or similar scheduler.
 *
 * Example cron configuration (run daily at midnight):
 * 0 0 * * * curl -X POST https://your-app.com/api/cron/clean-invitations
 *
 * Or with Vercel cron in vercel.json:
 * {
 *   "crons": [{
 *     "path": "/api/cron/clean-invitations",
 *     "schedule": "0 0 * * *"
 *   }]
 * }
 */
export async function cleanExpiredInvitations(): Promise<{
  expiredCount: number;
  deletedCount: number;
}> {
  const now = new Date();

  // Mark expired pending invitations as "expired"
  const expiredResult = await db.invitation.updateMany({
    where: {
      status: "pending",
      expiresAt: {
        lt: now,
      },
    },
    data: {
      status: "expired",
    },
  });

  // Delete old expired/revoked invitations (older than 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const deletedResult = await db.invitation.deleteMany({
    where: {
      status: {
        in: ["expired", "revoked"],
      },
      createdAt: {
        lt: thirtyDaysAgo,
      },
    },
  });

  console.log(
    `[clean-expired-invitations] Marked ${expiredResult.count} invitations as expired, deleted ${deletedResult.count} old invitations`
  );

  return {
    expiredCount: expiredResult.count,
    deletedCount: deletedResult.count,
  };
}

/**
 * Get statistics about pending invitations.
 */
export async function getInvitationStats(): Promise<{
  pending: number;
  expiringSoon: number;
  expired: number;
  accepted: number;
  revoked: number;
}> {
  const now = new Date();
  const oneDayFromNow = new Date();
  oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);

  const [pending, expiringSoon, expired, accepted, revoked] = await Promise.all([
    db.invitation.count({
      where: {
        status: "pending",
        expiresAt: { gt: now },
      },
    }),
    db.invitation.count({
      where: {
        status: "pending",
        expiresAt: {
          gt: now,
          lt: oneDayFromNow,
        },
      },
    }),
    db.invitation.count({
      where: { status: "expired" },
    }),
    db.invitation.count({
      where: { status: "accepted" },
    }),
    db.invitation.count({
      where: { status: "revoked" },
    }),
  ]);

  return {
    pending,
    expiringSoon,
    expired,
    accepted,
    revoked,
  };
}
