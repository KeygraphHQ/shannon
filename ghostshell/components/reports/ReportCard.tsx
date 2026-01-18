"use client";

import Link from "next/link";
import {
  FileText,
  Download,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  BarChart3,
  Shield,
  FileCode,
} from "lucide-react";
import { FindingsBreakdown } from "@/components/scans/findings-breakdown";

interface ReportCardProps {
  report: {
    id: string;
    scanId: string;
    type: string;
    status: string;
    title: string;
    generatedAt?: Date | string | null;
    findingsCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    riskScore?: number | null;
    createdAt: Date | string;
    scan?: {
      id: string;
      project?: {
        id: string;
        name: string;
        targetUrl?: string;
      };
    };
  };
  compact?: boolean;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; color: string; bgColor: string }
> = {
  GENERATING: {
    label: "Generating",
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
};

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ElementType; description: string }
> = {
  EXECUTIVE: {
    label: "Executive",
    icon: BarChart3,
    description: "High-level summary for stakeholders",
  },
  TECHNICAL: {
    label: "Technical",
    icon: FileCode,
    description: "Detailed findings with evidence",
  },
  COMPLIANCE: {
    label: "Compliance",
    icon: Shield,
    description: "Framework-aligned assessment",
  },
  CUSTOM: {
    label: "Custom",
    icon: FileText,
    description: "Custom template report",
  },
};

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReportCard({ report, compact = false }: ReportCardProps) {
  const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.GENERATING;
  const typeConfig = TYPE_CONFIG[report.type] || TYPE_CONFIG.CUSTOM;
  const StatusIcon = statusConfig.icon;
  const TypeIcon = typeConfig.icon;
  const isGenerating = report.status === "GENERATING";
  const isComplete = report.status === "COMPLETED";

  if (compact) {
    return (
      <Link
        href={`/dashboard/reports/${report.id}`}
        className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <TypeIcon className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 line-clamp-1">{report.title}</h3>
              <p className="text-xs text-gray-500">{typeConfig.label} Report</p>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
          >
            <StatusIcon className={`h-3 w-3 ${isGenerating ? "animate-spin" : ""}`} />
            {statusConfig.label}
          </div>
        </div>
      </Link>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-50">
              <TypeIcon className="h-5 w-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">{report.title}</h3>
              <p className="text-sm text-gray-500">{typeConfig.description}</p>
            </div>
          </div>
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
          >
            <StatusIcon className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
            {statusConfig.label}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4 space-y-4">
        {/* Project info */}
        {report.scan?.project && (
          <div className="text-sm">
            <span className="text-gray-500">Project:</span>{" "}
            <Link
              href={`/dashboard/projects/${report.scan.project.id}`}
              className="font-medium text-indigo-600 hover:text-indigo-500"
            >
              {report.scan.project.name}
            </Link>
          </div>
        )}

        {/* Timing */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-gray-500">
            <Clock className="h-4 w-4" />
            Created: {formatDate(report.createdAt)}
          </div>
          {report.generatedAt && (
            <div className="text-gray-500">
              Generated: {formatDate(report.generatedAt)}
            </div>
          )}
        </div>

        {/* Risk score */}
        {report.riskScore !== null && report.riskScore !== undefined && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Risk Score</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    report.riskScore >= 80
                      ? "bg-red-500"
                      : report.riskScore >= 60
                        ? "bg-orange-500"
                        : report.riskScore >= 40
                          ? "bg-yellow-500"
                          : "bg-green-500"
                  }`}
                  style={{ width: `${report.riskScore}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-900">
                {report.riskScore}/100
              </span>
            </div>
          </div>
        )}

        {/* Findings summary */}
        {(isComplete || report.findingsCount > 0) && (
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Findings Summary</p>
            <FindingsBreakdown
              criticalCount={report.criticalCount}
              highCount={report.highCount}
              mediumCount={report.mediumCount}
              lowCount={report.lowCount}
              variant="inline"
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-6 py-3 bg-gray-50 flex items-center justify-between">
        <Link
          href={`/dashboard/reports/${report.id}`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-500"
        >
          View Report
        </Link>
        {isComplete && (
          <div className="flex items-center gap-2">
            <Link
              href={`/api/reports/${report.id}/export/pdf`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              target="_blank"
            >
              <Download className="h-4 w-4" />
              PDF
            </Link>
            <Link
              href={`/api/reports/${report.id}/export/html`}
              className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
              target="_blank"
            >
              <Download className="h-4 w-4" />
              HTML
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
