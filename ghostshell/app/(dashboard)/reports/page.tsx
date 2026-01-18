import Link from "next/link";
import { Plus, FileText } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { listReportsAction } from "@/lib/actions/reports";
import { ReportCard } from "@/components/reports/ReportCard";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user || user.memberships.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please join an organization to view reports.</p>
      </div>
    );
  }

  const orgId = user.memberships[0].organizationId;
  const { reports, total } = await listReportsAction(orgId, undefined, { limit: 20 });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Reports</h1>
          <p className="mt-1 text-sm text-gray-500">
            Generate and manage security assessment reports
          </p>
        </div>
        <Link
          href="/dashboard/reports/generate"
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Generate Report
        </Link>
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
                scan: report.scan
                  ? {
                      id: report.scan.id,
                      project: report.scan.project
                        ? {
                            id: report.scan.project.id,
                            name: report.scan.project.name,
                            targetUrl: report.scan.project.targetUrl ?? undefined,
                          }
                        : undefined,
                    }
                  : undefined,
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
            Generate your first security report from a completed scan.
          </p>
          <Link
            href="/dashboard/reports/generate"
            className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Generate Report
          </Link>
        </div>
      )}

      {/* Pagination info */}
      {total > 20 && (
        <p className="text-sm text-gray-500 text-center">
          Showing {reports.length} of {total} reports
        </p>
      )}
    </div>
  );
}
