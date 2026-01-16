import { notFound } from "next/navigation";
import Link from "next/link";
import { getScan } from "@/lib/actions/scans";
import {
  ArrowLeft,
  ExternalLink,
  Clock,
  AlertTriangle,
  FileText,
  Download,
} from "lucide-react";
import { SeverityBadge, SeverityCount } from "@/components/severity-badge";

export default async function ScanPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;

  let scan;
  try {
    scan = await getScan(scanId);
  } catch (error) {
    notFound();
  }

  const severityCounts = {
    critical: scan.findings.filter((f) => f.severity === "critical").length,
    high: scan.findings.filter((f) => f.severity === "high").length,
    medium: scan.findings.filter((f) => f.severity === "medium").length,
    low: scan.findings.filter((f) => f.severity === "low").length,
    info: scan.findings.filter((f) => f.severity === "info").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>

        <div className="mt-4 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Security Scan</h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-1">
                <ExternalLink className="h-4 w-4" />
                <a
                  href={scan.targetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-gray-900"
                >
                  {scan.targetUrl}
                </a>
              </div>
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Started {new Date(scan.startedAt).toLocaleString()}
              </div>
            </div>
          </div>

          {scan.status === "completed" && (
            <Link
              href={`/api/scans/${scan.id}/report`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <Download className="h-4 w-4" />
              Download Report
            </Link>
          )}
        </div>
      </div>

      {/* Status Card */}
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Status</p>
            <ScanStatusBadge status={scan.status} />
          </div>

          <div>
            <p className="text-sm text-gray-500">Progress</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">
              {scan.progress}%
            </p>
          </div>

          {scan.currentPhase && (
            <div>
              <p className="text-sm text-gray-500">Current Phase</p>
              <p className="mt-1 text-sm font-medium text-gray-900 capitalize">
                {scan.currentPhase.replace(/-/g, " ")}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm text-gray-500">Findings</p>
            <div className="mt-1 flex items-center gap-1 text-2xl font-bold text-gray-900">
              <AlertTriangle className="h-6 w-6 text-amber-600" />
              {scan.findings.length}
            </div>
          </div>
        </div>

        {scan.status === "running" && (
          <div className="mt-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full bg-indigo-600 transition-all duration-500"
                style={{ width: `${scan.progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Severity Breakdown */}
      {scan.findings.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6">
          <h2 className="text-lg font-semibold text-gray-900">
            Severity Breakdown
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <SeverityCount severity="critical" count={severityCounts.critical} />
            <SeverityCount severity="high" count={severityCounts.high} />
            <SeverityCount severity="medium" count={severityCounts.medium} />
            <SeverityCount severity="low" count={severityCounts.low} />
            <SeverityCount severity="info" count={severityCounts.info} />
          </div>
        </div>
      )}

      {/* Findings List */}
      {scan.status === "completed" && scan.findings.length > 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Vulnerability Findings
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Security issues discovered during the scan
            </p>
          </div>

          <div className="divide-y divide-gray-200">
            {scan.findings.map((finding) => (
              <div key={finding.id} className="p-6">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold text-gray-900">
                        {finding.title}
                      </h3>
                      <SeverityBadge
                        severity={
                          finding.severity as
                            | "critical"
                            | "high"
                            | "medium"
                            | "low"
                            | "info"
                        }
                        size="sm"
                      />
                    </div>

                    <p className="mt-2 text-sm text-gray-600">
                      {finding.description}
                    </p>

                    <div className="mt-3 flex items-center gap-4 text-sm text-gray-500">
                      <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-medium capitalize">
                        {finding.category}
                      </span>
                      {finding.cwe && (
                        <span className="text-xs">{finding.cwe}</span>
                      )}
                      {finding.cvss && (
                        <span className="text-xs">CVSS: {finding.cvss}</span>
                      )}
                    </div>
                  </div>
                </div>

                {finding.remediation && (
                  <div className="mt-4 rounded-lg bg-blue-50 border border-blue-200 p-4">
                    <p className="text-sm font-medium text-blue-900">
                      Remediation
                    </p>
                    <p className="mt-1 text-sm text-blue-800">
                      {finding.remediation}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : scan.status === "completed" ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100">
            <FileText className="h-8 w-8 text-emerald-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            No Vulnerabilities Found
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            This scan did not identify any security issues. Your application
            appears to be secure based on our tests.
          </p>
        </div>
      ) : scan.status === "failed" ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-red-900">
            Scan Failed
          </h3>
          <p className="mt-2 text-sm text-red-700">
            The scan encountered an error and could not complete. Please try
            again or contact support if the issue persists.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto h-16 w-16 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
          <h3 className="mt-4 text-lg font-semibold text-gray-900">
            Scan in Progress
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            Shannon is analyzing your application for security vulnerabilities.
            This typically takes 10-30 minutes.
          </p>
        </div>
      )}
    </div>
  );
}

function ScanStatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { label: string; className: string }
  > = {
    pending: {
      label: "Pending",
      className: "bg-gray-100 text-gray-800 border-gray-200",
    },
    running: {
      label: "Running",
      className: "bg-blue-100 text-blue-800 border-blue-200",
    },
    completed: {
      label: "Completed",
      className: "bg-emerald-100 text-emerald-800 border-emerald-200",
    },
    failed: {
      label: "Failed",
      className: "bg-red-100 text-red-800 border-red-200",
    },
  };

  const { label, className } = config[status] || config.pending;

  return (
    <span
      className={`mt-1 inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${className}`}
    >
      {label}
    </span>
  );
}
