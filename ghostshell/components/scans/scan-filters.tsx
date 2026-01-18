"use client";

import { useState, useCallback } from "react";
import { Filter, Calendar, X } from "lucide-react";

export type ScanStatusFilter = "all" | "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMEOUT";

interface ScanFiltersProps {
  onFilterChange: (filters: {
    status: ScanStatusFilter[];
    dateFrom?: string;
    dateTo?: string;
  }) => void;
  initialStatus?: ScanStatusFilter[];
  initialDateFrom?: string;
  initialDateTo?: string;
}

const STATUS_OPTIONS: { value: ScanStatusFilter; label: string }[] = [
  { value: "COMPLETED", label: "Completed" },
  { value: "RUNNING", label: "Running" },
  { value: "FAILED", label: "Failed" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "PENDING", label: "Pending" },
  { value: "TIMEOUT", label: "Timed Out" },
];

export function ScanFilters({
  onFilterChange,
  initialStatus = [],
  initialDateFrom,
  initialDateTo,
}: ScanFiltersProps) {
  const [selectedStatuses, setSelectedStatuses] = useState<ScanStatusFilter[]>(initialStatus);
  const [dateFrom, setDateFrom] = useState(initialDateFrom || "");
  const [dateTo, setDateTo] = useState(initialDateTo || "");
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);

  const handleStatusToggle = useCallback((status: ScanStatusFilter) => {
    setSelectedStatuses((prev) => {
      const newStatuses = prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status];

      // Notify parent of change
      onFilterChange({
        status: newStatuses,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });

      return newStatuses;
    });
  }, [dateFrom, dateTo, onFilterChange]);

  const handleDateChange = useCallback((type: "from" | "to", value: string) => {
    if (type === "from") {
      setDateFrom(value);
      onFilterChange({
        status: selectedStatuses,
        dateFrom: value || undefined,
        dateTo: dateTo || undefined,
      });
    } else {
      setDateTo(value);
      onFilterChange({
        status: selectedStatuses,
        dateFrom: dateFrom || undefined,
        dateTo: value || undefined,
      });
    }
  }, [selectedStatuses, dateFrom, dateTo, onFilterChange]);

  const clearFilters = useCallback(() => {
    setSelectedStatuses([]);
    setDateFrom("");
    setDateTo("");
    onFilterChange({ status: [] });
  }, [onFilterChange]);

  const hasActiveFilters = selectedStatuses.length > 0 || dateFrom || dateTo;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* Status filter */}
      <div className="relative">
        <button
          onClick={() => setShowStatusDropdown(!showStatusDropdown)}
          className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Filter className="h-4 w-4 text-gray-400" />
          Status
          {selectedStatuses.length > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-600">
              {selectedStatuses.length}
            </span>
          )}
        </button>

        {showStatusDropdown && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowStatusDropdown(false)}
            />
            <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {STATUS_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedStatuses.includes(option.value)}
                    onChange={() => handleStatusToggle(option.value)}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">{option.label}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Date range filter */}
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 text-gray-400" />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleDateChange("from", e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="From"
        />
        <span className="text-gray-400">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleDateChange("to", e.target.value)}
          className="rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          placeholder="To"
        />
      </div>

      {/* Clear filters */}
      {hasActiveFilters && (
        <button
          onClick={clearFilters}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
          Clear
        </button>
      )}
    </div>
  );
}
