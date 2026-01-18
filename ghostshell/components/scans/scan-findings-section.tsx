"use client";

import { FileText, FileJson, Download, ExternalLink, AlertTriangle } from "lucide-react";

interface ScanFindingsSectionProps {
  scanId: string;
  isCompleted: boolean;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  executiveSummary?: string | null;
  reportHtmlUrl?: string | null;
}

export function ScanFindingsSection({
  scanId,
  isCompleted,
  findingsCount,
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  executiveSummary,
  reportHtmlUrl,
}: ScanFindingsSectionProps) {
  if (!isCompleted) {
    return null;
  }

  const hasFindings = findingsCount > 0;
  const hasCriticalOrHigh = criticalCount > 0 || highCount > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900">Detailed Findings</h2>
        <p className="mt-1 text-sm text-gray-500">
          {hasFindings
            ? `${findingsCount} security ${findingsCount === 1 ? "finding" : "findings"} discovered`
            : "No security findings discovered"}
        </p>
      </div>

      <div className="px-6 py-4 space-y-4">
        {/* Alert for critical/high findings */}
        {hasCriticalOrHigh && (
          <div className="flex items-start gap-3 rounded-md bg-red-50 p-4">
            <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">
                {criticalCount > 0 && `${criticalCount} Critical`}
                {criticalCount > 0 && highCount > 0 && " and "}
                {highCount > 0 && `${highCount} High`}
                {" severity "}
                {(criticalCount + highCount) === 1 ? "finding requires" : "findings require"}
                {" immediate attention"}
              </p>
              <p className="mt-1 text-sm text-red-700">
                Review the detailed report for remediation guidance.
              </p>
            </div>
          </div>
        )}

        {/* Findings summary by severity */}
        {hasFindings && (
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center p-3 rounded-md bg-red-50">
              <p className="text-2xl font-bold text-red-700">{criticalCount}</p>
              <p className="text-xs text-red-600 uppercase tracking-wide">Critical</p>
            </div>
            <div className="text-center p-3 rounded-md bg-orange-50">
              <p className="text-2xl font-bold text-orange-700">{highCount}</p>
              <p className="text-xs text-orange-600 uppercase tracking-wide">High</p>
            </div>
            <div className="text-center p-3 rounded-md bg-yellow-50">
              <p className="text-2xl font-bold text-yellow-700">{mediumCount}</p>
              <p className="text-xs text-yellow-600 uppercase tracking-wide">Medium</p>
            </div>
            <div className="text-center p-3 rounded-md bg-blue-50">
              <p className="text-2xl font-bold text-blue-700">{lowCount}</p>
              <p className="text-xs text-blue-600 uppercase tracking-wide">Low</p>
            </div>
          </div>
        )}

        {/* Executive summary excerpt */}
        {executiveSummary && (
          <div className="bg-gray-50 rounded-md p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Executive Summary</p>
            <p className="text-sm text-gray-600 line-clamp-3">
              {executiveSummary}
            </p>
          </div>
        )}

        {/* Export options */}
        <div className="pt-2">
          <p className="text-sm font-medium text-gray-700 mb-3">Download Report</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={`/api/scans/${scanId}/export?format=pdf`}
              download
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileText className="h-4 w-4" />
              PDF Report
            </a>
            <a
              href={`/api/scans/${scanId}/export?format=json`}
              download
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <FileJson className="h-4 w-4" />
              SARIF JSON
            </a>
            <a
              href={`/api/scans/${scanId}/export?format=html`}
              download
              className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              HTML Report
            </a>
            {reportHtmlUrl && (
              <a
                href={reportHtmlUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-500"
              >
                <ExternalLink className="h-4 w-4" />
                View Full Report
              </a>
            )}
          </div>
        </div>

        {/* No findings message */}
        {!hasFindings && (
          <div className="text-center py-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm font-medium text-gray-900">No vulnerabilities found</p>
            <p className="text-sm text-gray-500 mt-1">
              The security scan completed without finding any issues.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
