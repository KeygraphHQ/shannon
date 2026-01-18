import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getReportWithFindingsAction } from "@/lib/actions/reports";
import { ReportViewer } from "@/components/reports/ReportViewer";

export default async function ReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;

  const result = await getReportWithFindingsAction(reportId);

  if (!result) {
    notFound();
  }

  const { report, findings, executiveSummary } = result;

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dashboard/reports"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Reports
      </Link>

      {/* Report viewer */}
      <ReportViewer
        report={{
          id: report.id,
          scanId: report.scanId,
          type: report.type,
          status: report.status,
          title: report.title,
          generatedAt: report.generatedAt,
          generatedById: report.generatedById,
          findingsCount: report.findingsCount,
          criticalCount: report.criticalCount,
          highCount: report.highCount,
          mediumCount: report.mediumCount,
          lowCount: report.lowCount,
          riskScore: report.riskScore,
          frameworkIds: report.frameworkIds,
          createdAt: report.createdAt,
          scan: report.scan
            ? {
                id: report.scan.id,
                status: report.scan.status,
                project: report.scan.project
                  ? {
                      id: report.scan.project.id,
                      name: report.scan.project.name,
                      targetUrl: report.scan.project.targetUrl ?? undefined,
                    }
                  : undefined,
              }
            : undefined,
          organization: report.organization
            ? {
                id: report.organization.id,
                name: report.organization.name,
              }
            : undefined,
          generatedBy: null, // User relation not available, only generatedById
        }}
        findings={findings.map((f) => ({
          id: f.id,
          title: f.title,
          description: f.description || "",
          severity: f.severity as "critical" | "high" | "medium" | "low" | "info",
          category: f.category,
          status: f.status,
          cvss: f.cvss,
          cwe: f.cwe,
          remediation: f.remediation,
        }))}
        executiveSummary={executiveSummary}
      />
    </div>
  );
}
