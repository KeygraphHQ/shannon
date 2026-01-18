import Link from "next/link";
import { AlertTriangle, ArrowRight, Shield, CheckCircle } from "lucide-react";
import type { FindingsSummary } from "@/lib/types/findings";

interface FindingsWidgetProps {
  summary: FindingsSummary;
}

export function FindingsWidget({ summary }: FindingsWidgetProps) {
  const hasFindings = summary.total > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <h2 className="text-lg font-semibold text-gray-900">Security Findings</h2>
        </div>
        <Link
          href="/dashboard/findings"
          className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Content */}
      <div className="p-6">
        {hasFindings ? (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">Open Issues</p>
                <p className="mt-1 text-3xl font-bold text-amber-900">
                  {summary.openCount}
                </p>
              </div>
              <div className="rounded-lg bg-gray-50 p-4">
                <p className="text-sm font-medium text-gray-600">Total Findings</p>
                <p className="mt-1 text-3xl font-bold text-gray-900">
                  {summary.total}
                </p>
              </div>
            </div>

            {/* Severity Breakdown */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">By Severity</h3>
              <div className="space-y-2">
                <SeverityBar
                  label="Critical"
                  count={summary.bySeverity.critical}
                  total={summary.total}
                  color="bg-red-500"
                />
                <SeverityBar
                  label="High"
                  count={summary.bySeverity.high}
                  total={summary.total}
                  color="bg-orange-500"
                />
                <SeverityBar
                  label="Medium"
                  count={summary.bySeverity.medium}
                  total={summary.total}
                  color="bg-yellow-500"
                />
                <SeverityBar
                  label="Low"
                  count={summary.bySeverity.low}
                  total={summary.total}
                  color="bg-blue-500"
                />
                <SeverityBar
                  label="Info"
                  count={summary.bySeverity.info}
                  total={summary.total}
                  color="bg-gray-400"
                />
              </div>
            </div>

            {/* Status Breakdown */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-3">By Status</h3>
              <div className="grid grid-cols-2 gap-2">
                <StatusBadge
                  label="Open"
                  count={summary.byStatus.open}
                  className="bg-yellow-100 text-yellow-800"
                />
                <StatusBadge
                  label="Fixed"
                  count={summary.byStatus.fixed}
                  className="bg-green-100 text-green-800"
                />
                <StatusBadge
                  label="Accepted"
                  count={summary.byStatus.accepted_risk}
                  className="bg-blue-100 text-blue-800"
                />
                <StatusBadge
                  label="False Positive"
                  count={summary.byStatus.false_positive}
                  className="bg-gray-100 text-gray-800"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-gray-900">No findings yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Security findings will appear here after running scans.
            </p>
            <Link
              href="/dashboard/scans/new"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              <Shield className="h-4 w-4" />
              Start a Scan
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

interface SeverityBarProps {
  label: string;
  count: number;
  total: number;
  color: string;
}

function SeverityBar({ label, count, total, color }: SeverityBarProps) {
  const percentage = total > 0 ? (count / total) * 100 : 0;

  return (
    <div className="flex items-center gap-3">
      <span className="w-16 text-xs text-gray-600">{label}</span>
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="w-8 text-xs font-medium text-gray-900 text-right">
        {count}
      </span>
    </div>
  );
}

interface StatusBadgeProps {
  label: string;
  count: number;
  className: string;
}

function StatusBadge({ label, count, className }: StatusBadgeProps) {
  return (
    <div className={`rounded-lg px-3 py-2 ${className}`}>
      <p className="text-xs font-medium">{label}</p>
      <p className="text-lg font-bold">{count}</p>
    </div>
  );
}
