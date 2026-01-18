"use client";

import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";

interface FindingsBreakdownProps {
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** Display style: "grid" for cards, "inline" for compact badges */
  variant?: "grid" | "inline";
  /** Show zero counts */
  showZeroCounts?: boolean;
}

interface SeverityConfig {
  label: string;
  icon: React.ElementType;
  bgColor: string;
  textColor: string;
  borderColor: string;
}

const SEVERITY_CONFIG: Record<string, SeverityConfig> = {
  critical: {
    label: "Critical",
    icon: AlertTriangle,
    bgColor: "bg-red-50",
    textColor: "text-red-600",
    borderColor: "border-red-200",
  },
  high: {
    label: "High",
    icon: AlertCircle,
    bgColor: "bg-orange-50",
    textColor: "text-orange-600",
    borderColor: "border-orange-200",
  },
  medium: {
    label: "Medium",
    icon: AlertCircle,
    bgColor: "bg-yellow-50",
    textColor: "text-yellow-600",
    borderColor: "border-yellow-200",
  },
  low: {
    label: "Low",
    icon: Info,
    bgColor: "bg-blue-50",
    textColor: "text-blue-600",
    borderColor: "border-blue-200",
  },
};

export function FindingsBreakdown({
  criticalCount,
  highCount,
  mediumCount,
  lowCount,
  variant = "grid",
  showZeroCounts = true,
}: FindingsBreakdownProps) {
  const findings = [
    { key: "critical", count: criticalCount },
    { key: "high", count: highCount },
    { key: "medium", count: mediumCount },
    { key: "low", count: lowCount },
  ];

  const totalFindings = criticalCount + highCount + mediumCount + lowCount;
  const hasNoFindings = totalFindings === 0;

  // Filter out zero counts if not showing them
  const displayFindings = showZeroCounts
    ? findings
    : findings.filter((f) => f.count > 0);

  if (variant === "inline") {
    if (hasNoFindings) {
      return (
        <div className="inline-flex items-center gap-1 text-sm text-green-600">
          <CheckCircle className="h-4 w-4" />
          <span>No findings</span>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap items-center gap-2">
        {displayFindings.map(({ key, count }) => {
          const config = SEVERITY_CONFIG[key];
          if (count === 0 && !showZeroCounts) return null;

          return (
            <span
              key={key}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor}`}
            >
              {count} {config.label.toLowerCase()}
            </span>
          );
        })}
      </div>
    );
  }

  // Grid variant
  if (hasNoFindings && !showZeroCounts) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4">
        <CheckCircle className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium text-green-700">No security findings detected</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {findings.map(({ key, count }) => {
        const config = SEVERITY_CONFIG[key];
        const Icon = config.icon;

        return (
          <div
            key={key}
            className={`rounded-lg border p-3 text-center ${config.bgColor} ${config.borderColor}`}
          >
            <Icon className={`mx-auto h-5 w-5 ${config.textColor}`} />
            <p className={`mt-1 text-2xl font-bold ${config.textColor}`}>
              {count}
            </p>
            <p className={`text-xs font-medium ${config.textColor}`}>
              {config.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}
