"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ScanHistoryTable } from "./scan-history-table";
import { ScanFilters, type ScanStatusFilter } from "./scan-filters";
import { PaginationControls } from "@/components/ui/pagination-controls";

interface Scan {
  id: string;
  projectId: string;
  projectName: string;
  status: string;
  source: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  createdAt: string;
}

interface ScansPageClientProps {
  initialScans: Scan[];
  initialNextCursor: string | null;
  initialTotal: number;
}

export function ScansPageClient({
  initialScans,
  initialNextCursor,
  initialTotal,
}: ScansPageClientProps) {
  const [scans, setScans] = useState<Scan[]>(initialScans);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [total, setTotal] = useState(initialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<{
    status: ScanStatusFilter[];
    dateFrom?: string;
    dateTo?: string;
  }>({ status: [] });

  const fetchScans = useCallback(async (
    cursor?: string,
    newFilters?: typeof filters
  ) => {
    setIsLoading(true);
    try {
      const currentFilters = newFilters || filters;
      const params = new URLSearchParams();

      if (currentFilters.status.length > 0) {
        params.set("status", currentFilters.status.join(","));
      }
      if (currentFilters.dateFrom) {
        params.set("startDate", currentFilters.dateFrom);
      }
      if (currentFilters.dateTo) {
        params.set("endDate", currentFilters.dateTo);
      }
      if (cursor) {
        params.set("cursor", cursor);
      }
      params.set("limit", "50");

      const response = await fetch(`/api/scans?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch scans");
      }

      const data = await response.json();

      if (cursor) {
        // Append to existing scans
        setScans((prev) => [...prev, ...data.scans]);
      } else {
        // Replace scans
        setScans(data.scans);
      }
      setNextCursor(data.nextCursor);
      setTotal(data.total);
    } catch (error) {
      console.error("Error fetching scans:", error);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  const handleFilterChange = useCallback((newFilters: typeof filters) => {
    setFilters(newFilters);
    // Fetch with new filters, reset pagination
    fetchScans(undefined, newFilters);
  }, [fetchScans]);

  const handleLoadMore = useCallback(async () => {
    if (!nextCursor) return;
    await fetchScans(nextCursor);
  }, [nextCursor, fetchScans]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security Scans</h1>
          <p className="mt-1 text-sm text-gray-500">
            View and manage security scans across your projects
          </p>
        </div>
        <Link
          href="/dashboard/scans/new"
          className="inline-flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
        >
          <Plus className="h-4 w-4" />
          New Scan
        </Link>
      </div>

      {/* Filters */}
      <ScanFilters
        onFilterChange={handleFilterChange}
        initialStatus={filters.status}
        initialDateFrom={filters.dateFrom}
        initialDateTo={filters.dateTo}
      />

      {/* Scans table */}
      <ScanHistoryTable
        scans={scans}
        nextCursor={nextCursor}
        total={total}
      />

      {/* Pagination */}
      <PaginationControls
        hasMore={!!nextCursor}
        total={total}
        currentCount={scans.length}
        onLoadMore={handleLoadMore}
        isLoading={isLoading}
      />
    </div>
  );
}
