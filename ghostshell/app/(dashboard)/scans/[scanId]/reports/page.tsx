import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, FileText } from "lucide-react";
import { getCurrentUser, hasOrgAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { ReportCard } from "@/components/reports/ReportCard";

export default async function ScanReportsPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;

  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    notFound();
  }

  const orgId = user.memberships[0].organizationId;

  // Verify scan exists and belongs to org
  const scan = await db.scan.findFirst({
    where: {
      id: scanId,
      organizationId: orgId,
    },
    include: {
      project: {
        select: { id: true, name: true, targetUrl: true },
      },
    },
  });

  if (!scan) {
    notFound();
  }

  // Get reports for this scan
  const reports = await db.report.findMany({
    where: {
      scanId,
      deletedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href={`/dashboard/scans/${scanId}`}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Scan
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            {scan.project.name} • {scan.project.targetUrl}
          </p>
        </div>
        {scan.status === "COMPLETED" && (
          <Link
            href={`/dashboard/reports/generate?scanId=${scanId}`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Generate Report
          </Link>
        )}
      </div>

      {/* Reports List */}
      {reports.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {reports.map((report) => (
            <ReportCard
              key={report.id}
              report={{
                id: report.id,
                scanId: report.scanId,
                type: report.type,
                status: report.status,
                title: report.title,
                generatedAt: report.generatedAt,
                findingsCount: report.findingsCount,
                criticalCount: report.criticalCount,
                highCount: report.highCount,
                mediumCount: report.mediumCount,
                lowCount: report.lowCount,
                riskScore: report.riskScore,
                createdAt: report.createdAt,
                scan: {
                  id: scan.id,
                  project: {
                    id: scan.project.id,
                    name: scan.project.name,
                    targetUrl: scan.project.targetUrl ?? undefined,
                  },
                },
              }}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
            <FileText className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No reports yet</h3>
          <p className="mt-2 text-sm text-gray-500">
            {scan.status === "COMPLETED"
              ? "Generate a security report from this scan."
              : "Reports can be generated after the scan is completed."}
          </p>
          {scan.status === "COMPLETED" && (
            <Link
              href={`/dashboard/reports/generate?scanId=${scanId}`}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Generate Report
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
