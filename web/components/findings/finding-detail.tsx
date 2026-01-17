"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ExternalLink,
  Calendar,
  Tag,
  Shield,
  FileText,
  Clock,
} from "lucide-react";
import { SeverityBadge } from "@/components/severity-badge";
import { FindingStatusSelect } from "./finding-status-select";
import { EvidenceDisplay } from "./evidence-display";
import { FindingActivity } from "./finding-activity";
import type { FindingDetail as FindingDetailType } from "@/lib/types/findings";

interface FindingDetailProps {
  finding: FindingDetailType;
}

export function FindingDetail({ finding }: FindingDetailProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href={`/dashboard/scans/${finding.scanId}`}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Scan
        </Link>

        <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <SeverityBadge severity={finding.severity} size="lg" />
              <h1 className="text-2xl font-bold text-gray-900">
                {finding.title}
              </h1>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-gray-500">
              <span className="inline-flex items-center gap-1">
                <ExternalLink className="h-4 w-4" />
                {finding.scan.targetUrl}
              </span>
              {finding.scan.projectName && (
                <span className="inline-flex items-center gap-1">
                  <Tag className="h-4 w-4" />
                  {finding.scan.projectName}
                </span>
              )}
            </div>
          </div>

          <FindingStatusSelect
            findingId={finding.id}
            currentStatus={finding.status}
          />
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Description & Evidence */}
        <div className="space-y-6 lg:col-span-2">
          {/* Description */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Description
              </h2>
            </div>
            <div className="px-6 py-4">
              <p className="whitespace-pre-wrap text-gray-700">
                {finding.description}
              </p>
            </div>
          </section>

          {/* Evidence */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Evidence</h2>
              <p className="mt-1 text-sm text-gray-500">
                Technical details and proof of vulnerability
              </p>
            </div>
            <div className="px-6 py-4">
              <EvidenceDisplay evidence={finding.evidence} />
            </div>
          </section>

          {/* Remediation */}
          {finding.remediation && (
            <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Remediation Guidance
                </h2>
              </div>
              <div className="px-6 py-4">
                <div className="rounded-lg bg-green-50 border border-green-100 p-4">
                  <div className="flex gap-3">
                    <Shield className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                    <p className="whitespace-pre-wrap text-sm text-green-800">
                      {finding.remediation}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Column - Metadata */}
        <div className="space-y-6">
          {/* Technical Details */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Technical Details
              </h2>
            </div>
            <div className="px-6 py-4">
              <dl className="space-y-4">
                {/* Category */}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Category</dt>
                  <dd className="mt-1">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-sm font-medium text-gray-800 capitalize">
                      {finding.category}
                    </span>
                  </dd>
                </div>

                {/* CWE */}
                {finding.cwe && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      CWE Reference
                    </dt>
                    <dd className="mt-1">
                      <a
                        href={`https://cwe.mitre.org/data/definitions/${finding.cwe.replace("CWE-", "")}.html`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                      >
                        <FileText className="h-4 w-4" />
                        {finding.cwe}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </dd>
                  </div>
                )}

                {/* CVSS */}
                {finding.cvss !== null && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">
                      CVSS Score
                    </dt>
                    <dd className="mt-1">
                      <CvssScore score={finding.cvss} />
                    </dd>
                  </div>
                )}

                {/* Severity */}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Severity</dt>
                  <dd className="mt-1">
                    <SeverityBadge severity={finding.severity} />
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Timeline */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Timeline</h2>
            </div>
            <div className="px-6 py-4">
              <dl className="space-y-4">
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      Discovered
                    </span>
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(finding.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      Last Updated
                    </span>
                  </dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(finding.updatedAt)}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          {/* Scan Info */}
          <section className="rounded-lg border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-200 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Source Scan
              </h2>
            </div>
            <div className="px-6 py-4">
              <Link
                href={`/dashboard/scans/${finding.scanId}`}
                className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-800"
              >
                View Scan Details
                <ExternalLink className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* Activity Section - Full Width */}
      <FindingActivity findingId={finding.id} />
    </div>
  );
}

function CvssScore({ score }: { score: number }) {
  const getSeverityFromCvss = (cvss: number): string => {
    if (cvss >= 9.0) return "Critical";
    if (cvss >= 7.0) return "High";
    if (cvss >= 4.0) return "Medium";
    if (cvss >= 0.1) return "Low";
    return "None";
  };

  const getColorClass = (cvss: number): string => {
    if (cvss >= 9.0) return "bg-red-100 text-red-800";
    if (cvss >= 7.0) return "bg-orange-100 text-orange-800";
    if (cvss >= 4.0) return "bg-yellow-100 text-yellow-800";
    if (cvss >= 0.1) return "bg-blue-100 text-blue-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-bold ${getColorClass(score)}`}
      >
        {score.toFixed(1)}
      </span>
      <span className="text-sm text-gray-500">({getSeverityFromCvss(score)})</span>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}
