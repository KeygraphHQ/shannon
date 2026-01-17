"use client";

import { useState, useCallback, useTransition } from "react";
import { Loader2, AlertTriangle, X, Filter } from "lucide-react";
import { listFindings } from "@/lib/actions/findings";
import { FindingsFilters } from "./findings-filters";
import { FindingsSearch } from "./findings-search";
import { FindingsListItem } from "./findings-list-item";
import { FindingsBulkActions } from "./findings-bulk-actions";
import type {
  FindingListItem,
  FindingSeverity,
  FindingStatus,
  FindingFilters,
} from "@/lib/types/findings";

interface FindingsListProps {
  initialFindings: FindingListItem[];
  initialTotal: number;
  initialNextCursor: string | null;
}

export function FindingsList({
  initialFindings,
  initialTotal,
  initialNextCursor,
}: FindingsListProps) {
  const [findings, setFindings] = useState<FindingListItem[]>(initialFindings);
  const [total, setTotal] = useState(initialTotal);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Filter state
  const [severity, setSeverity] = useState<FindingSeverity[]>([]);
  const [status, setStatus] = useState<FindingStatus[]>([]);
  const [search, setSearch] = useState("");

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const loadFindings = useCallback(
    async (filters: FindingFilters, cursor?: string) => {
      const result = await listFindings(filters, {
        cursor,
        limit: 20,
      });
      return result;
    },
    []
  );

  const applyFilters = useCallback(() => {
    const filters: FindingFilters = {};
    if (severity.length > 0) filters.severity = severity;
    if (status.length > 0) filters.status = status;
    if (search) filters.search = search;

    startTransition(async () => {
      const result = await loadFindings(filters);
      setFindings(result.findings);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    });
  }, [severity, status, search, loadFindings]);

  // Apply filters when they change
  const handleSeverityChange = useCallback(
    (newSeverity: FindingSeverity[]) => {
      setSeverity(newSeverity);
      const filters: FindingFilters = {
        severity: newSeverity.length > 0 ? newSeverity : undefined,
        status: status.length > 0 ? status : undefined,
        search: search || undefined,
      };
      startTransition(async () => {
        const result = await loadFindings(filters);
        setFindings(result.findings);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
      });
    },
    [status, search, loadFindings]
  );

  const handleStatusChange = useCallback(
    (newStatus: FindingStatus[]) => {
      setStatus(newStatus);
      const filters: FindingFilters = {
        severity: severity.length > 0 ? severity : undefined,
        status: newStatus.length > 0 ? newStatus : undefined,
        search: search || undefined,
      };
      startTransition(async () => {
        const result = await loadFindings(filters);
        setFindings(result.findings);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
      });
    },
    [severity, search, loadFindings]
  );

  const handleSearchChange = useCallback(
    (newSearch: string) => {
      setSearch(newSearch);
      const filters: FindingFilters = {
        severity: severity.length > 0 ? severity : undefined,
        status: status.length > 0 ? status : undefined,
        search: newSearch || undefined,
      };
      startTransition(async () => {
        const result = await loadFindings(filters);
        setFindings(result.findings);
        setTotal(result.total);
        setNextCursor(result.nextCursor);
      });
    },
    [severity, status, loadFindings]
  );

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const filters: FindingFilters = {
        severity: severity.length > 0 ? severity : undefined,
        status: status.length > 0 ? status : undefined,
        search: search || undefined,
      };
      const result = await loadFindings(filters, nextCursor);
      setFindings((prev) => [...prev, ...result.findings]);
      setNextCursor(result.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [nextCursor, isLoadingMore, severity, status, search, loadFindings]);

  const clearAllFilters = useCallback(() => {
    setSeverity([]);
    setStatus([]);
    setSearch("");
    startTransition(async () => {
      const result = await loadFindings({});
      setFindings(result.findings);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    });
  }, [loadFindings]);

  const hasActiveFilters = severity.length > 0 || status.length > 0 || search !== "";

  // Selection handlers
  const handleSelect = useCallback((id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(findings.map((f) => f.id)));
  }, [findings]);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkSuccess = useCallback(() => {
    // Refresh the findings list after bulk update
    const filters: FindingFilters = {
      severity: severity.length > 0 ? severity : undefined,
      status: status.length > 0 ? status : undefined,
      search: search || undefined,
    };
    startTransition(async () => {
      const result = await loadFindings(filters);
      setFindings(result.findings);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    });
  }, [severity, status, search, loadFindings]);

  const allSelected = findings.length > 0 && selectedIds.size === findings.length;

  return (
    <div className="space-y-4">
      {/* Filters Row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <FindingsFilters
            severity={severity}
            status={status}
            onSeverityChange={handleSeverityChange}
            onStatusChange={handleStatusChange}
          />
        </div>
        <div className="w-full sm:w-64">
          <FindingsSearch value={search} onChange={handleSearchChange} />
        </div>
      </div>

      {/* Active Filters Chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          {severity.map((s) => (
            <FilterChip
              key={s}
              label={s}
              onRemove={() => handleSeverityChange(severity.filter((x) => x !== s))}
            />
          ))}
          {status.map((s) => (
            <FilterChip
              key={s}
              label={s.replace("_", " ")}
              onRemove={() => handleStatusChange(status.filter((x) => x !== s))}
            />
          ))}
          {search && (
            <FilterChip
              label={`"${search}"`}
              onRemove={() => handleSearchChange("")}
            />
          )}
          <button
            onClick={clearAllFilters}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Bulk Actions Toolbar */}
      <FindingsBulkActions
        selectedCount={selectedIds.size}
        selectedIds={Array.from(selectedIds)}
        totalCount={total}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        onSuccess={handleBulkSuccess}
        allSelected={allSelected}
      />

      {/* Results Count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          {isPending ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading...
            </span>
          ) : (
            `${total.toLocaleString()} finding${total !== 1 ? "s" : ""}`
          )}
        </span>
      </div>

      {/* Findings List */}
      <div className="rounded-lg border border-gray-200 bg-white">
        {isPending && findings.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            <span className="ml-2 text-sm text-gray-500">Loading findings...</span>
          </div>
        ) : findings.length === 0 ? (
          <EmptyState hasFilters={hasActiveFilters} onClearFilters={clearAllFilters} />
        ) : (
          <>
            <div className="divide-y divide-gray-200">
              {findings.map((finding) => (
                <FindingsListItem
                  key={finding.id}
                  finding={finding}
                  showCheckbox={true}
                  isSelected={selectedIds.has(finding.id)}
                  onSelect={handleSelect}
                />
              ))}
            </div>

            {/* Load More */}
            {nextCursor && (
              <div className="border-t border-gray-200 p-4 text-center">
                <button
                  onClick={handleLoadMore}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load More"
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 capitalize">
      {label}
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100 transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

interface EmptyStateProps {
  hasFilters: boolean;
  onClearFilters: () => void;
}

function EmptyState({ hasFilters, onClearFilters }: EmptyStateProps) {
  if (hasFilters) {
    return (
      <div className="py-12 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-gray-300" />
        <h3 className="mt-4 text-lg font-semibold text-gray-900">
          No findings match your filters
        </h3>
        <p className="mt-2 text-sm text-gray-500">
          Try adjusting your filters or search terms to find what you're looking for.
        </p>
        <button
          onClick={onClearFilters}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <div className="py-12 text-center">
      <AlertTriangle className="mx-auto h-12 w-12 text-gray-300" />
      <h3 className="mt-4 text-lg font-semibold text-gray-900">No findings yet</h3>
      <p className="mt-2 text-sm text-gray-500">
        Security findings will appear here once scans have been completed.
      </p>
    </div>
  );
}
