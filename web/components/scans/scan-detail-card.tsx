"use client";

import Link from "next/link";
import {
  Clock,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckCircle,
  XCircle,
  Loader2,
  Timer,
} from "lucide-react";

interface ScanDetailCardProps {
  scan: {
    id: string;
    projectId: string;
    projectName: string;
    status: string;
    source: string;
    targetUrl: string;
    currentPhase?: string | null;
    currentAgent?: string | null;
    progressPercent?: number;
    startedAt?: string | null;
    completedAt?: string | null;
    durationMs?: number | null;
    findingsCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    errorMessage?: string | null;
    result?: {
      reportHtmlUrl?: string | null;
      reportPdfUrl?: string | null;
      executiveSummary?: string | null;
      riskScore?: number | null;
    } | null;
  };
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  PENDING: {
    label: "Pending",
    icon: Clock,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  RUNNING: {
    label: "Running",
    icon: Loader2,
    color: "text-blue-600",
    bgColor: "bg-blue-100",
  },
  COMPLETED: {
    label: "Completed",
    icon: CheckCircle,
    color: "text-green-600",
    bgColor: "bg-green-100",
  },
  FAILED: {
    label: "Failed",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-100",
  },
  CANCELLED: {
    label: "Cancelled",
    icon: XCircle,
    color: "text-gray-600",
    bgColor: "bg-gray-100",
  },
  TIMEOUT: {
    label: "Timed Out",
    icon: Timer,
    color: "text-orange-600",
    bgColor: "bg-orange-100",
  },
};

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleString();
}

export function ScanDetailCard({ scan }: ScanDetailCardProps) {
  const statusConfig = STATUS_CONFIG[scan.status] || STATUS_CONFIG.PENDING;
  const StatusIcon = statusConfig.icon;
  const isRunning = scan.status === "RUNNING";
  const isComplete = scan.status === "COMPLETED";

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {scan.projectName}
            </h2>
            <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
              <ExternalLink className="h-3 w-3" />
              {scan.targetUrl}
            </p>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
          >
            <StatusIcon
              className={`h-4 w-4 ${isRunning ? "animate-spin" : ""}`}
            />
            {statusConfig.label}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-4">
        {/* Timing info */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Started</p>
            <p className="font-medium text-gray-900">
              {scan.startedAt ? formatDate(scan.startedAt) : "Not started"}
            </p>
          </div>
          <div>
            <p className="text-gray-500">Duration</p>
            <p className="font-medium text-gray-900">
              {scan.durationMs ? formatDuration(scan.durationMs) : isRunning ? "In progress..." : "-"}
            </p>
          </div>
        </div>

        {/* Error message */}
        {scan.errorMessage && (
          <div className="rounded-md bg-red-50 p-3">
            <p className="text-sm text-red-700">{scan.errorMessage}</p>
          </div>
        )}

        {/* Findings summary */}
        {(isComplete || scan.findingsCount > 0) && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Findings Summary</p>
            <div className="grid grid-cols-4 gap-2">
              <div className="rounded-md bg-red-50 p-3 text-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-red-600">{scan.criticalCount}</p>
                <p className="text-xs text-red-600">Critical</p>
              </div>
              <div className="rounded-md bg-orange-50 p-3 text-center">
                <AlertCircle className="h-5 w-5 text-orange-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-orange-600">{scan.highCount}</p>
                <p className="text-xs text-orange-600">High</p>
              </div>
              <div className="rounded-md bg-yellow-50 p-3 text-center">
                <AlertCircle className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-yellow-600">{scan.mediumCount}</p>
                <p className="text-xs text-yellow-600">Medium</p>
              </div>
              <div className="rounded-md bg-blue-50 p-3 text-center">
                <Info className="h-5 w-5 text-blue-600 mx-auto mb-1" />
                <p className="text-2xl font-bold text-blue-600">{scan.lowCount}</p>
                <p className="text-xs text-blue-600">Low</p>
              </div>
            </div>
          </div>
        )}

        {/* Risk score */}
        {scan.result?.riskScore !== null && scan.result?.riskScore !== undefined && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Risk Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    scan.result.riskScore >= 80
                      ? "bg-red-500"
                      : scan.result.riskScore >= 60
                        ? "bg-orange-500"
                        : scan.result.riskScore >= 40
                          ? "bg-yellow-500"
                          : "bg-green-500"
                  }`}
                  style={{ width: `${scan.result.riskScore}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {scan.result.riskScore}/100
              </span>
            </div>
          </div>
        )}

        {/* Executive summary */}
        {scan.result?.executiveSummary && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Executive Summary</p>
            <p className="text-sm text-gray-600 whitespace-pre-line">
              {scan.result.executiveSummary}
            </p>
          </div>
        )}

        {/* Report links */}
        {isComplete && scan.result && (
          <div className="flex gap-2 pt-2">
            {scan.result.reportHtmlUrl && (
              <Link
                href={scan.result.reportHtmlUrl}
                target="_blank"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
              >
                <ExternalLink className="h-4 w-4" />
                View HTML Report
              </Link>
            )}
            {scan.result.reportPdfUrl && (
              <Link
                href={scan.result.reportPdfUrl}
                target="_blank"
                className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-500"
              >
                <ExternalLink className="h-4 w-4" />
                Download PDF
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
