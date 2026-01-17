"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Download,
  FileText,
  Code,
  FileJson,
  ExternalLink,
  Clock,
  User,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { FindingsBreakdown } from "@/components/scans/findings-breakdown";
import { SeverityBadge } from "@/components/severity-badge";

interface Finding {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  status: string;
  cvss?: number | null;
  cwe?: string | null;
  remediation?: string | null;
}

interface ReportViewerProps {
  report: {
    id: string;
    scanId: string;
    type: string;
    status: string;
    title: string;
    generatedAt?: Date | string | null;
    generatedById?: string | null;
    findingsCount: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    riskScore?: number | null;
    frameworkIds?: string[];
    createdAt: Date | string;
    scan?: {
      id: string;
      status: string;
      project?: {
        id: string;
        name: string;
        targetUrl?: string;
      };
    };
    organization?: {
      id: string;
      name: string;
    };
    generatedBy?: {
      id: string;
      firstName?: string | null;
      lastName?: string | null;
      email: string;
    } | null;
  };
  findings?: Finding[];
  executiveSummary?: string | null;
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

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getRiskLabel(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Critical Risk", color: "text-red-600" };
  if (score >= 60) return { label: "High Risk", color: "text-orange-600" };
  if (score >= 40) return { label: "Medium Risk", color: "text-yellow-600" };
  if (score >= 20) return { label: "Low Risk", color: "text-blue-600" };
  return { label: "Minimal Risk", color: "text-green-600" };
}

export function ReportViewer({ report, findings = [], executiveSummary }: ReportViewerProps) {
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.GENERATING;
  const StatusIcon = statusConfig.icon;
  const isGenerating = report.status === "GENERATING";
  const isComplete = report.status === "COMPLETED";
  const isFailed = report.status === "FAILED";

  const toggleFinding = (id: string) => {
    setExpandedFindings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const riskInfo = report.riskScore !== null && report.riskScore !== undefined
    ? getRiskLabel(report.riskScore)
    : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="px-6 py-5">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{report.title}</h1>
              {report.scan?.project && (
                <p className="mt-1 text-sm text-gray-500">
                  <Link
                    href={`/dashboard/projects/${report.scan.project.id}`}
                    className="text-indigo-600 hover:text-indigo-500"
                  >
                    {report.scan.project.name}
                  </Link>
                  {report.scan.project.targetUrl && (
                    <>
                      {" "}&middot;{" "}
                      <span className="inline-flex items-center gap-1">
                        <ExternalLink className="h-3 w-3" />
                        {report.scan.project.targetUrl}
                      </span>
                    </>
                  )}
                </p>
              )}
            </div>
            <div
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${statusConfig.bgColor} ${statusConfig.color}`}
            >
              <StatusIcon className={`h-4 w-4 ${isGenerating ? "animate-spin" : ""}`} />
              {statusConfig.label}
            </div>
          </div>

          {/* Metadata */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              {report.generatedAt ? formatDate(report.generatedAt) : "Generating..."}
            </div>
            {report.generatedBy && (
              <div className="flex items-center gap-1.5">
                <User className="h-4 w-4" />
                {report.generatedBy.firstName || report.generatedBy.email}
              </div>
            )}
            {report.organization && (
              <div className="flex items-center gap-1.5">
                <Shield className="h-4 w-4" />
                {report.organization.name}
              </div>
            )}
          </div>

          {/* Export buttons */}
          {isComplete && (
            <div className="mt-4 flex items-center gap-3">
              <a
                href={`/api/reports/${report.id}/export/pdf`}
                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                download
              >
                <Download className="h-4 w-4" />
                Download PDF
              </a>
              <a
                href={`/api/reports/${report.id}/export/html`}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                target="_blank"
              >
                <FileText className="h-4 w-4" />
                View HTML
              </a>
              <a
                href={`/api/reports/${report.id}/export/json`}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                download
              >
                <FileJson className="h-4 w-4" />
                Export JSON
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Risk Score */}
      {riskInfo && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Risk Assessment</h2>
          <div className="flex items-center gap-6">
            <div
              className={`flex h-24 w-24 flex-col items-center justify-center rounded-xl ${
                report.riskScore! >= 80
                  ? "bg-red-100"
                  : report.riskScore! >= 60
                    ? "bg-orange-100"
                    : report.riskScore! >= 40
                      ? "bg-yellow-100"
                      : report.riskScore! >= 20
                        ? "bg-blue-100"
                        : "bg-green-100"
              }`}
            >
              <span className={`text-3xl font-bold ${riskInfo.color}`}>
                {report.riskScore}
              </span>
              <span className="text-xs text-gray-600">/ 100</span>
            </div>
            <div>
              <p className={`text-lg font-semibold ${riskInfo.color}`}>{riskInfo.label}</p>
              <p className="text-sm text-gray-500 mt-1">
                Based on {report.findingsCount} findings identified during the security assessment.
              </p>
              {report.criticalCount > 0 && (
                <p className="flex items-center gap-1.5 text-sm text-red-600 mt-2">
                  <AlertTriangle className="h-4 w-4" />
                  {report.criticalCount} critical vulnerabilities require immediate attention
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Findings Summary */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Findings Summary</h2>
        <FindingsBreakdown
          criticalCount={report.criticalCount}
          highCount={report.highCount}
          mediumCount={report.mediumCount}
          lowCount={report.lowCount}
          variant="grid"
        />
      </div>

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Executive Summary</h2>
          <p className="text-gray-600 whitespace-pre-line">{executiveSummary}</p>
        </div>
      )}

      {/* Findings Detail */}
      {findings.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Findings Detail</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {findings.map((finding) => {
              const isExpanded = expandedFindings.has(finding.id);

              return (
                <div key={finding.id} className="px-6 py-4">
                  <button
                    type="button"
                    onClick={() => toggleFinding(finding.id)}
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        {isExpanded ? (
                          <ChevronDown className="h-5 w-5 text-gray-400 mt-0.5" />
                        ) : (
                          <ChevronRight className="h-5 w-5 text-gray-400 mt-0.5" />
                        )}
                        <div>
                          <div className="flex items-center gap-2">
                            <SeverityBadge severity={finding.severity} size="sm" />
                            <span className="font-medium text-gray-900">{finding.title}</span>
                          </div>
                          <p className="mt-1 text-sm text-gray-500 line-clamp-1">
                            {finding.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">
                          {finding.category}
                        </span>
                        {finding.cvss && <span>CVSS: {finding.cvss.toFixed(1)}</span>}
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="mt-4 ml-8 space-y-4 pl-3 border-l-2 border-gray-200">
                      <div>
                        <h4 className="text-sm font-medium text-gray-700">Description</h4>
                        <p className="mt-1 text-sm text-gray-600">{finding.description}</p>
                      </div>
                      {finding.cwe && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700">CWE</h4>
                          <p className="mt-1 text-sm text-gray-600">{finding.cwe}</p>
                        </div>
                      )}
                      {finding.remediation && (
                        <div>
                          <h4 className="text-sm font-medium text-gray-700">Remediation</h4>
                          <p className="mt-1 text-sm text-gray-600">{finding.remediation}</p>
                        </div>
                      )}
                      <div className="pt-2">
                        <Link
                          href={`/dashboard/findings/${finding.id}`}
                          className="text-sm text-indigo-600 hover:text-indigo-500"
                        >
                          View full finding details →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Generating state */}
      {isGenerating && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-8 text-center">
          <Loader2 className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">
            Generating report... This may take a few moments.
          </p>
        </div>
      )}

      {/* Failed state */}
      {isFailed && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-start gap-3">
            <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
            <div>
              <h3 className="font-medium text-red-800">Report Generation Failed</h3>
              <p className="mt-1 text-sm text-red-700">
                An error occurred while generating this report. Please try generating a new report.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
