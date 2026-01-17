"use client";

import Link from "next/link";
import { ExternalLink, Eye } from "lucide-react";
import { SeverityBadge } from "@/components/severity-badge";
import type { FindingListItem } from "@/lib/types/findings";

interface FindingsListItemProps {
  finding: FindingListItem;
  isSelected?: boolean;
  onSelect?: (id: string, selected: boolean) => void;
  showCheckbox?: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  open: { label: "Open", className: "bg-yellow-100 text-yellow-800" },
  fixed: { label: "Fixed", className: "bg-green-100 text-green-800" },
  accepted_risk: { label: "Accepted", className: "bg-blue-100 text-blue-800" },
  false_positive: { label: "False Positive", className: "bg-gray-100 text-gray-800" },
};

export function FindingsListItem({
  finding,
  isSelected = false,
  onSelect,
  showCheckbox = false,
}: FindingsListItemProps) {
  const statusConfig = STATUS_CONFIG[finding.status] || STATUS_CONFIG.open;

  return (
    <div className="flex items-start gap-4 p-4 hover:bg-gray-50 transition-colors">
      {/* Checkbox for bulk selection */}
      {showCheckbox && (
        <div className="flex-shrink-0 pt-1">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => onSelect?.(finding.id, e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
      )}

      {/* Severity */}
      <div className="flex-shrink-0 pt-0.5">
        <SeverityBadge severity={finding.severity} size="sm" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={`/dashboard/findings/${finding.id}`}
              className="font-medium text-gray-900 hover:text-indigo-600 transition-colors"
            >
              {finding.title}
            </Link>
            <p className="mt-1 text-sm text-gray-500 line-clamp-2">
              {finding.description}
            </p>
          </div>

          {/* Status Badge */}
          <span
            className={`flex-shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
          >
            {statusConfig.label}
          </span>
        </div>

        {/* Metadata */}
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <span className="inline-flex items-center gap-1">
            <ExternalLink className="h-3 w-3" />
            {finding.scan.targetUrl}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 capitalize">
            {finding.category}
          </span>
          {finding.cwe && (
            <span>{finding.cwe}</span>
          )}
          {finding.cvss !== null && (
            <span>CVSS: {finding.cvss.toFixed(1)}</span>
          )}
          <span>
            {formatDate(finding.createdAt)}
          </span>
        </div>
      </div>

      {/* View Button */}
      <Link
        href={`/dashboard/findings/${finding.id}`}
        className="flex-shrink-0 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        <Eye className="h-3.5 w-3.5" />
        View
      </Link>
    </div>
  );
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}
