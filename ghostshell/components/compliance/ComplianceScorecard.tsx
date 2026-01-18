"use client";

import { useMemo } from "react";
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  HelpCircle,
} from "lucide-react";
import type { ComplianceScorecard as ScorecardType } from "@/lib/compliance/types";

interface ComplianceScorecardProps {
  scorecard: ScorecardType;
  /** Show detailed category breakdown */
  showCategories?: boolean;
  /** Compact mode for embedding in other views */
  variant?: "default" | "compact";
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-yellow-600";
  if (score >= 40) return "text-orange-600";
  return "text-red-600";
}

function getScoreBgColor(score: number): string {
  if (score >= 80) return "bg-green-50";
  if (score >= 60) return "bg-yellow-50";
  if (score >= 40) return "bg-orange-50";
  return "bg-red-50";
}

function getStatusIcon(status: "pass" | "fail" | "partial" | "not_tested") {
  switch (status) {
    case "pass":
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case "fail":
      return <XCircle className="h-4 w-4 text-red-600" />;
    case "partial":
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case "not_tested":
      return <HelpCircle className="h-4 w-4 text-gray-400" />;
  }
}

function getStatusBadge(status: "pass" | "fail" | "partial" | "not_tested") {
  const styles = {
    pass: "bg-green-100 text-green-700",
    fail: "bg-red-100 text-red-700",
    partial: "bg-yellow-100 text-yellow-700",
    not_tested: "bg-gray-100 text-gray-600",
  };

  const labels = {
    pass: "Passed",
    fail: "Failed",
    partial: "Partial",
    not_tested: "Not Tested",
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {getStatusIcon(status)}
      {labels[status]}
    </span>
  );
}

export function ComplianceScorecard({
  scorecard,
  showCategories = true,
  variant = "default",
}: ComplianceScorecardProps) {
  const scoreColorClass = getScoreColor(scorecard.overallScore);
  const scoreBgClass = getScoreBgColor(scorecard.overallScore);

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full ${scoreBgClass}`}
        >
          <Shield className={`h-6 w-6 ${scoreColorClass}`} />
        </div>
        <div className="flex-1">
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold ${scoreColorClass}`}>
              {scorecard.overallScore}%
            </span>
            <span className="text-sm text-gray-500">
              {scorecard.frameworkName}
            </span>
          </div>
          <div className="mt-1 flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {scorecard.passedControls} passed
            </span>
            <span className="flex items-center gap-1">
              <XCircle className="h-3 w-3 text-red-500" />
              {scorecard.failedControls} failed
            </span>
            <span className="flex items-center gap-1">
              <HelpCircle className="h-3 w-3 text-gray-400" />
              {scorecard.notTestedControls} not tested
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header with Score */}
      <div className="border-b border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Compliance Scorecard
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              {scorecard.frameworkName}
            </p>
          </div>
          <div
            className={`flex flex-col items-center rounded-lg p-4 ${scoreBgClass}`}
          >
            <Shield className={`h-8 w-8 ${scoreColorClass}`} />
            <span className={`mt-2 text-3xl font-bold ${scoreColorClass}`}>
              {scorecard.overallScore}%
            </span>
            <span className="text-xs text-gray-500">Overall Score</span>
          </div>
        </div>

        {/* Control Summary */}
        <div className="mt-6 grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {scorecard.testedControls}
            </p>
            <p className="text-xs text-gray-500">Tested</p>
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-center">
            <p className="text-2xl font-bold text-green-600">
              {scorecard.passedControls}
            </p>
            <p className="text-xs text-gray-500">Passed</p>
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-center">
            <p className="text-2xl font-bold text-red-600">
              {scorecard.failedControls}
            </p>
            <p className="text-xs text-gray-500">Failed</p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3 text-center">
            <p className="text-2xl font-bold text-gray-400">
              {scorecard.notTestedControls}
            </p>
            <p className="text-xs text-gray-500">Not Tested</p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      {showCategories && scorecard.categories.length > 0 && (
        <div className="p-6">
          <h4 className="mb-4 text-sm font-medium text-gray-900">
            Category Breakdown
          </h4>
          <div className="space-y-3">
            {scorecard.categories.map((category) => (
              <div
                key={category.categoryId}
                className="flex items-center gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700 truncate">
                      {category.categoryId}: {category.categoryName}
                    </span>
                    {getStatusBadge(category.status)}
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        category.status === "pass"
                          ? "bg-green-500"
                          : category.status === "fail"
                            ? "bg-red-500"
                            : category.status === "partial"
                              ? "bg-yellow-500"
                              : "bg-gray-300"
                      }`}
                      style={{ width: `${category.score}%` }}
                    />
                  </div>
                </div>
                <span
                  className={`w-12 text-right text-sm font-semibold ${getScoreColor(category.score)}`}
                >
                  {category.score}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
