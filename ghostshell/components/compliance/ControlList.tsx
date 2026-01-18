"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  HelpCircle,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import type { CategoryMapping, ControlMapping, ControlStatus } from "@/lib/compliance/types";

interface ControlListProps {
  categories: CategoryMapping[];
  /** Framework name for display */
  frameworkName?: string;
  /** Collapse all categories initially */
  collapsedByDefault?: boolean;
  /** Show finding counts */
  showFindingCounts?: boolean;
  /** Callback when a finding is clicked */
  onFindingClick?: (findingId: string) => void;
}

function getStatusIcon(status: ControlStatus) {
  switch (status) {
    case "compliant":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "non_compliant":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "not_tested":
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
  }
}

function getStatusLabel(status: ControlStatus): string {
  switch (status) {
    case "compliant":
      return "Compliant";
    case "non_compliant":
      return "Non-Compliant";
    case "not_tested":
      return "Not Tested";
  }
}

function getStatusBadgeStyles(status: ControlStatus): string {
  switch (status) {
    case "compliant":
      return "bg-green-100 text-green-700";
    case "non_compliant":
      return "bg-red-100 text-red-700";
    case "not_tested":
      return "bg-gray-100 text-gray-600";
  }
}

function getSeverityStyles(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "bg-red-100 text-red-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-yellow-100 text-yellow-700";
    case "low":
      return "bg-blue-100 text-blue-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

interface ControlItemProps {
  control: ControlMapping;
  onFindingClick?: (findingId: string) => void;
}

function ControlItem({ control, onFindingClick }: ControlItemProps) {
  const [expanded, setExpanded] = useState(false);
  const hasFindings = control.findings.length > 0;

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => hasFindings && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-left ${
          hasFindings ? "hover:bg-gray-50 cursor-pointer" : ""
        }`}
        disabled={!hasFindings}
      >
        <span className="w-5">
          {hasFindings &&
            (expanded ? (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-gray-400" />
            ))}
        </span>
        {getStatusIcon(control.status)}
        <span className="flex-1 min-w-0">
          <span className="text-xs font-medium text-indigo-600">
            {control.controlId}
          </span>
          <span className="mx-2 text-gray-300">|</span>
          <span className="text-sm text-gray-700">{control.controlName}</span>
        </span>
        {hasFindings && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {control.findings.length} finding{control.findings.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {expanded && hasFindings && (
        <div className="ml-8 border-l-2 border-gray-200 pl-4 pb-3">
          {control.findings.map((finding) => (
            <div
              key={finding.id}
              className="flex items-center gap-2 py-2 text-sm"
            >
              <span
                className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getSeverityStyles(finding.severity)}`}
              >
                {finding.severity}
              </span>
              <span className="flex-1 text-gray-700 truncate">
                {finding.title}
              </span>
              {onFindingClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onFindingClick(finding.id);
                  }}
                  className="text-indigo-600 hover:text-indigo-800"
                  title="View finding details"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface CategorySectionProps {
  category: CategoryMapping;
  defaultExpanded?: boolean;
  showFindingCounts?: boolean;
  onFindingClick?: (findingId: string) => void;
}

function CategorySection({
  category,
  defaultExpanded = false,
  showFindingCounts = true,
  onFindingClick,
}: CategorySectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const compliantCount = category.controls.filter(
    (c) => c.status === "compliant"
  ).length;
  const nonCompliantCount = category.controls.filter(
    (c) => c.status === "non_compliant"
  ).length;
  const notTestedCount = category.controls.filter(
    (c) => c.status === "not_tested"
  ).length;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Category Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 bg-gray-50 px-4 py-3 text-left hover:bg-gray-100"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-gray-500" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-500" />
        )}
        {getStatusIcon(category.status)}
        <div className="flex-1 min-w-0">
          <span className="font-medium text-gray-900">
            {category.categoryId}: {category.categoryName}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {showFindingCounts && category.findingsCount > 0 && (
            <span className="text-xs text-gray-500">
              {category.findingsCount} finding{category.findingsCount !== 1 ? "s" : ""}
            </span>
          )}
          <div className="flex items-center gap-1 text-xs">
            {compliantCount > 0 && (
              <span className="inline-flex items-center rounded bg-green-100 px-1.5 py-0.5 text-green-700">
                {compliantCount}
              </span>
            )}
            {nonCompliantCount > 0 && (
              <span className="inline-flex items-center rounded bg-red-100 px-1.5 py-0.5 text-red-700">
                {nonCompliantCount}
              </span>
            )}
            {notTestedCount > 0 && (
              <span className="inline-flex items-center rounded bg-gray-100 px-1.5 py-0.5 text-gray-600">
                {notTestedCount}
              </span>
            )}
          </div>
        </div>
      </button>

      {/* Controls List */}
      {expanded && (
        <div className="divide-y divide-gray-100">
          {category.controls.map((control) => (
            <ControlItem
              key={control.controlId}
              control={control}
              onFindingClick={onFindingClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ControlList({
  categories,
  frameworkName,
  collapsedByDefault = true,
  showFindingCounts = true,
  onFindingClick,
}: ControlListProps) {
  // Summary stats
  const totalControls = categories.reduce(
    (sum, cat) => sum + cat.controls.length,
    0
  );
  const compliantControls = categories.reduce(
    (sum, cat) =>
      sum + cat.controls.filter((c) => c.status === "compliant").length,
    0
  );
  const nonCompliantControls = categories.reduce(
    (sum, cat) =>
      sum + cat.controls.filter((c) => c.status === "non_compliant").length,
    0
  );
  const notTestedControls = totalControls - compliantControls - nonCompliantControls;

  return (
    <div className="space-y-4">
      {/* Header */}
      {frameworkName && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">
            {frameworkName} Controls
          </h3>
          <div className="flex items-center gap-4 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-4 w-4 text-green-500" />
              {compliantControls} compliant
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-4 w-4 text-red-500" />
              {nonCompliantControls} non-compliant
            </span>
            <span className="flex items-center gap-1">
              <HelpCircle className="h-4 w-4 text-gray-400" />
              {notTestedControls} not tested
            </span>
          </div>
        </div>
      )}

      {/* Categories */}
      <div className="space-y-3">
        {categories.map((category) => (
          <CategorySection
            key={category.categoryId}
            category={category}
            defaultExpanded={!collapsedByDefault}
            showFindingCounts={showFindingCounts}
            onFindingClick={onFindingClick}
          />
        ))}
      </div>

      {categories.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">
            No compliance data available
          </p>
        </div>
      )}
    </div>
  );
}
