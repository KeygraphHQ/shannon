import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { ScansPageClient } from "@/components/scans/scans-page-client";

export const dynamic = "force-dynamic";

export default async function ScansPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (user.memberships.length === 0) {
    redirect("/dashboard");
  }

  const orgId = user.memberships[0].organizationId;

  // Fetch scans directly from the database for server component
  const { db } = await import("@/lib/db");

  const scans = await db.scan.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      project: {
        select: { id: true, name: true, targetUrl: true },
      },
    },
  });

  const total = await db.scan.count({
    where: { organizationId: orgId },
  });

  const formattedScans = scans.map((scan) => ({
    id: scan.id,
    projectId: scan.projectId,
    projectName: scan.project.name,
    status: scan.status,
    source: scan.source,
    startedAt: scan.startedAt?.toISOString() || null,
    completedAt: scan.completedAt?.toISOString() || null,
    durationMs: scan.durationMs,
    findingsCount: scan.findingsCount,
    criticalCount: scan.criticalCount,
    highCount: scan.highCount,
    mediumCount: scan.mediumCount,
    lowCount: scan.lowCount,
    createdAt: scan.createdAt.toISOString(),
  }));

  const hasMore = scans.length === 50;
  const nextCursor = hasMore ? scans[scans.length - 1]?.id : null;

  return (
    <ScansPageClient
      initialScans={formattedScans}
      initialNextCursor={nextCursor}
      initialTotal={total}
    />
  );
}
