import { AlertTriangle, AlertCircle, Info, ShieldAlert } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low" | "info";

interface SeverityBadgeProps {
  severity: Severity;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

export function SeverityBadge({
  severity,
  size = "md",
  showIcon = true,
}: SeverityBadgeProps) {
  const config = {
    critical: {
      label: "Critical",
      icon: ShieldAlert,
      className:
        "bg-red-100 text-red-800 border-red-200 dark:bg-red-900 dark:text-red-200",
    },
    high: {
      label: "High",
      icon: AlertTriangle,
      className:
        "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900 dark:text-orange-200",
    },
    medium: {
      label: "Medium",
      icon: AlertCircle,
      className:
        "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900 dark:text-yellow-200",
    },
    low: {
      label: "Low",
      icon: Info,
      className:
        "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900 dark:text-blue-200",
    },
    info: {
      label: "Info",
      icon: Info,
      className:
        "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900 dark:text-gray-200",
    },
  };

  const sizeClasses = {
    sm: "px-2 py-0.5 text-xs",
    md: "px-2.5 py-1 text-sm",
    lg: "px-3 py-1.5 text-base",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-4 w-4",
    lg: "h-5 w-5",
  };

  const { label, icon: Icon, className } = config[severity];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${className} ${sizeClasses[size]}`}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {label}
    </span>
  );
}

interface SeverityCountProps {
  severity: Severity;
  count: number;
}

export function SeverityCount({ severity, count }: SeverityCountProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3">
      <SeverityBadge severity={severity} size="sm" />
      <span className="text-lg font-semibold text-gray-900">{count}</span>
    </div>
  );
}
