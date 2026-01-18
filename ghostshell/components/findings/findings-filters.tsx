"use client";

import { ChevronDown } from "lucide-react";
import type { FindingSeverity, FindingStatus } from "@/lib/types/findings";

interface FindingsFiltersProps {
  severity: FindingSeverity[];
  status: FindingStatus[];
  onSeverityChange: (severity: FindingSeverity[]) => void;
  onStatusChange: (status: FindingStatus[]) => void;
}

const SEVERITY_OPTIONS: { value: FindingSeverity; label: string; color: string }[] = [
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-800" },
  { value: "high", label: "High", color: "bg-orange-100 text-orange-800" },
  { value: "medium", label: "Medium", color: "bg-yellow-100 text-yellow-800" },
  { value: "low", label: "Low", color: "bg-blue-100 text-blue-800" },
  { value: "info", label: "Info", color: "bg-gray-100 text-gray-800" },
];

const STATUS_OPTIONS: { value: FindingStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "fixed", label: "Fixed" },
  { value: "accepted_risk", label: "Accepted Risk" },
  { value: "false_positive", label: "False Positive" },
];

export function FindingsFilters({
  severity,
  status,
  onSeverityChange,
  onStatusChange,
}: FindingsFiltersProps) {
  const toggleSeverity = (value: FindingSeverity) => {
    if (severity.includes(value)) {
      onSeverityChange(severity.filter((s) => s !== value));
    } else {
      onSeverityChange([...severity, value]);
    }
  };

  const toggleStatus = (value: FindingStatus) => {
    if (status.includes(value)) {
      onStatusChange(status.filter((s) => s !== value));
    } else {
      onStatusChange([...status, value]);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Severity Filter */}
      <FilterDropdown
        label="Severity"
        selectedCount={severity.length}
      >
        <div className="p-2 space-y-1">
          {SEVERITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={severity.includes(option.value)}
                onChange={() => toggleSeverity(option.value)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${option.color}`}
              >
                {option.label}
              </span>
            </label>
          ))}
        </div>
      </FilterDropdown>

      {/* Status Filter */}
      <FilterDropdown
        label="Status"
        selectedCount={status.length}
      >
        <div className="p-2 space-y-1">
          {STATUS_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={status.includes(option.value)}
                onChange={() => toggleStatus(option.value)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-sm text-gray-700">{option.label}</span>
            </label>
          ))}
        </div>
      </FilterDropdown>
    </div>
  );
}

interface FilterDropdownProps {
  label: string;
  selectedCount: number;
  children: React.ReactNode;
}

function FilterDropdown({ label, selectedCount, children }: FilterDropdownProps) {
  return (
    <div className="relative group">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        {label}
        {selectedCount > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-indigo-100 text-xs font-medium text-indigo-700">
            {selectedCount}
          </span>
        )}
        <ChevronDown className="h-4 w-4 text-gray-400" />
      </button>

      {/* Dropdown Menu */}
      <div className="absolute left-0 z-10 mt-1 w-48 origin-top-left rounded-lg border border-gray-200 bg-white shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
        {children}
      </div>
    </div>
  );
}
