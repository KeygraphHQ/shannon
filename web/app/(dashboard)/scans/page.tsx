import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { ScanHistoryTable } from "@/components/scans/scan-history-table";

export const dynamic = "force-dynamic";

async function getScans(orgId: string) {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/scans`,
    {
      headers: {
        Cookie: "", // Will be populated by Next.js
      },
      cache: "no-store",
    }
  );

  if (!response.ok) {
    return { scans: [], nextCursor: null, total: 0 };
  }

  return response.json();
}

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Scans</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage security scans across your projects
          </p>
        </div>
        <Link
          href="/dashboard/scans/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Scan
        </Link>
      </div>

      {/* Scans table */}
      <ScanHistoryTable
        scans={formattedScans}
        nextCursor={nextCursor}
        total={total}
      />
    </div>
  );
}
